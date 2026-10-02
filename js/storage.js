/*
 * Local persistence layer. Everything lives in localStorage on this
 * device by default. Backup modules (dropbox.js / gdrive.js / onedrive.js /
 * localfolder.js) push/pull the same JSON shape to the user's own cloud
 * storage — nothing ever touches a server we run.
 *
 * Multiple pools: each pool has its own settings + log history, stored
 * under its own namespaced keys (pooltest.settings.<id> / pooltest.logs.<id>).
 * A small index (pooltest.pools.v1) lists which pool ids exist, and
 * pooltest.activepool.v1 points at the one currently shown in the UI.
 * Everything in this file defaults to operating on the ACTIVE pool when no
 * poolId is passed, so app.js mostly doesn't need to think about pool ids
 * at all except in the pool-switcher/management UI.
 */

const STORE = (() => {
  // Pre-multi-pool versions stored one flat settings/log pair under these
  // keys. ensureMigrated() moves that data into a real pool the first time
  // this runs on an upgraded install, rather than starting the person over.
  const LEGACY_SETTINGS_KEY = 'pooltest.settings.v1';
  const LEGACY_LOGS_KEY = 'pooltest.logs.v1';
  const POOLS_KEY = 'pooltest.pools.v1';
  const ACTIVE_POOL_KEY = 'pooltest.activepool.v1';

  const settingsKey = (id) => 'pooltest.settings.' + id;
  const logsKey = (id) => 'pooltest.logs.' + id;

  const DEFAULT_SETTINGS = {
    gallons: 15000,
    hasSWG: false,
    fcProduct: 'liquid125',
    defaultInitials: '',
    poolName: '',
    environment: 'outdoor', // 'outdoor' | 'indoor' — indoor forces CYA off
    poolType: 'pool',       // 'pool' | 'spa' — affects labels/PDF wording only
    photo: null,            // data URL (resized/compressed client-side), or null
    // Which tests show up in the Log/Calculator/History/PDF. Salt's
    // visibility is controlled by hasSWG instead, not listed here.
    enabledChems: { ta: true, ch: true, cya: true, ph: true, fc: true, temp: false, tc: false, cc: false },
    // Two optional numeric fields the person can name themselves (e.g.
    // "Borates", "Phosphates"). Shown whenever a label is set, and get
    // their own target range in settings.targets.custom1 / .custom2.
    customFields: ['', ''],
    // Display order for the Log form / History table / CSV / PDF / charts.
    // Default: Free Chlorine and pH first (the two quickest test-strip
    // reads), then the rest of the chlorine family, then everything else.
    // User-editable in Settings; the Calculator keeps its own separate,
    // fixed recommended adjustment order regardless of this list.
    testOrder: ['fc', 'ph', 'tc', 'cc', 'ta', 'ch', 'cya', 'salt', 'temp', 'custom1', 'custom2'],
    targets: Object.assign(
      JSON.parse(JSON.stringify(CHEM.DEFAULT_TARGETS)),
      { custom1: { min: 0, ideal: 50, max: 100 }, custom2: { min: 0, ideal: 50, max: 100 } }
    ),
    dropbox: { appKey: '', accessToken: '', refreshToken: '', expiresAt: 0 },
    google: { clientId: '', accessToken: '', expiresAt: 0 },
    microsoft: { clientId: '', accessToken: '', refreshToken: '', expiresAt: 0 },
    // The actual folder handle lives in IndexedDB (see localfolder.js) —
    // this is just the display name + whether auto-save is on. Shared
    // across all pools (it's one folder on this device), not per-pool.
    localFolder: { connected: false, folderName: '', autoSave: true },
    lastBackup: { dropbox: null, google: null, microsoft: null, localFolder: null }
  };

  // ---------------- Pool bookkeeping ----------------
  function newPoolId() {
    return 'pool-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function readPoolIds() {
    try { return JSON.parse(localStorage.getItem(POOLS_KEY)) || []; }
    catch (e) { return []; }
  }
  function writePoolIds(ids) { localStorage.setItem(POOLS_KEY, JSON.stringify(ids)); }

  // One-time migration for anyone upgrading from a pre-multi-pool version:
  // their single pool's data is sitting under the old flat keys. Move it
  // into a proper pool instead of starting them over. The old keys are
  // left in place afterward (harmless, but cheap insurance in case this
  // ever needs to be re-run or debugged).
  function ensureMigrated() {
    if (localStorage.getItem(POOLS_KEY)) return;
    const id = newPoolId();
    const legacySettings = localStorage.getItem(LEGACY_SETTINGS_KEY);
    const legacyLogs = localStorage.getItem(LEGACY_LOGS_KEY);
    if (legacySettings) localStorage.setItem(settingsKey(id), legacySettings);
    if (legacyLogs) localStorage.setItem(logsKey(id), legacyLogs);
    writePoolIds([id]);
    localStorage.setItem(ACTIVE_POOL_KEY, id);
  }

  function listPoolIds() {
    ensureMigrated();
    return readPoolIds();
  }

  function getActivePoolId() {
    ensureMigrated();
    const ids = readPoolIds();
    let id = localStorage.getItem(ACTIVE_POOL_KEY);
    if (!id || !ids.includes(id)) {
      id = ids[0];
      localStorage.setItem(ACTIVE_POOL_KEY, id);
    }
    return id;
  }

  function setActivePool(id) {
    if (!readPoolIds().includes(id)) throw new Error('Unknown pool.');
    localStorage.setItem(ACTIVE_POOL_KEY, id);
  }

  // Lightweight summary of every pool, for the pool switcher / manage-pools UI.
  function listPools() {
    return listPoolIds().map(id => {
      const s = getSettings(id);
      return { id, name: s.poolName || 'Unnamed pool', poolType: s.poolType, environment: s.environment, photo: s.photo || null };
    });
  }

  // Creates a new, empty pool and returns its id. Does not switch to it.
  function addPool(name) {
    ensureMigrated();
    const id = newPoolId();
    const ids = readPoolIds();
    ids.push(id);
    writePoolIds(ids);
    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    settings.poolName = (name || '').trim();
    saveSettings(settings, id);
    saveLogs([], id);
    return id;
  }

  // Registers a pool id that arrived from a merged backup (another device
  // already created it) with no local record of it yet.
  function adoptPool(id, incomingSettings) {
    const ids = readPoolIds();
    if (ids.includes(id)) return;
    ids.push(id);
    writePoolIds(ids);
    const settings = deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), incomingSettings || {});
    saveSettings(settings, id);
    saveLogs([], id);
  }

  // Removes a pool's settings + logs entirely. Always leaves at least one
  // pool behind, and moves the active pointer off a deleted pool.
  function deletePool(id) {
    ensureMigrated();
    const ids = readPoolIds().filter(x => x !== id);
    writePoolIds(ids);
    localStorage.removeItem(settingsKey(id));
    localStorage.removeItem(logsKey(id));
    let remaining = ids;
    if (!remaining.length) remaining = [addPool('')];
    if (!remaining.includes(localStorage.getItem(ACTIVE_POOL_KEY))) {
      setActivePool(remaining[0]);
    }
  }

  // ---------------- Per-pool settings/logs ----------------
  function getSettings(poolId) {
    const id = poolId || getActivePoolId();
    const raw = localStorage.getItem(settingsKey(id));
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    try {
      const parsed = JSON.parse(raw);
      // merge with defaults so new fields appear after an app update
      return deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), parsed);
    } catch (e) {
      console.error('Failed to parse settings, resetting', e);
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  }

  function saveSettings(settings, poolId) {
    const id = poolId || getActivePoolId();
    localStorage.setItem(settingsKey(id), JSON.stringify(settings));
  }

  function getLogs(poolId) {
    const id = poolId || getActivePoolId();
    const raw = localStorage.getItem(logsKey(id));
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse logs', e);
      return [];
    }
  }

  function saveLogs(logs, poolId) {
    const id = poolId || getActivePoolId();
    localStorage.setItem(logsKey(id), JSON.stringify(logs));
  }

  function addLog(entry, poolId) {
    const logs = getLogs(poolId);
    entry.id = entry.id || (Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    logs.push(entry);
    logs.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveLogs(logs, poolId);
    return entry;
  }

  // Folds a remote backup's log entries into the local log by id (adds
  // anything local doesn't already have; never drops a local entry). Used
  // before every cloud/local-folder upload so two people/devices sharing
  // the same backup file never silently overwrite each other's readings —
  // see mergeRemoteLogsBeforeBackup() in app.js.
  function mergeLogs(remoteLogs, poolId) {
    if (!Array.isArray(remoteLogs) || !remoteLogs.length) return getLogs(poolId);
    const existingIds = new Set(getLogs(poolId).map(l => l.id));
    const merged = getLogs(poolId).concat(remoteLogs.filter(l => !existingIds.has(l.id)));
    merged.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveLogs(merged, poolId);
    return merged;
  }

  // Never include OAuth tokens or device-local folder handles in a backup
  // payload — those are device/session specific, not pool data, and
  // wouldn't mean anything on a different computer anyway.
  function sanitizeSettingsForExport(settings) {
    const copy = JSON.parse(JSON.stringify(settings));
    delete copy.dropbox;
    delete copy.google;
    delete copy.microsoft;
    delete copy.localFolder;
    return copy;
  }

  // ---------------- Export / import (every pool) ----------------
  // A backup file carries ALL pools, not just the active one, so switching
  // devices (or just reconnecting a backup) brings every pool along in one
  // file, and two devices stay in sync on pools they both know about.
  function exportAll() {
    const ids = listPoolIds();
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      pools: ids.map(id => ({
        id,
        settings: sanitizeSettingsForExport(getSettings(id)),
        logs: getLogs(id)
      }))
    }, null, 2);
  }

  // Accepts both the current multi-pool backup shape ({pools:[...]}) and
  // the older pre-multi-pool shape ({settings, logs}), so old backup files
  // (or a shared folder an older app version last wrote to) still import
  // cleanly — treated as a single pool, the current active one.
  function normalizeBackupShape(data) {
    if (Array.isArray(data.pools)) return data.pools;
    if (data.settings || data.logs) return [{ id: getActivePoolId(), settings: data.settings, logs: data.logs }];
    return [];
  }

  // Full import (manual "Import backup file" / the Restore buttons): merges
  // settings AND logs for every pool in the file, adopting any pool this
  // device doesn't already have.
  function importAll(json, mode = 'merge') {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const poolsData = normalizeBackupShape(data);
    const existingIds = new Set(listPoolIds());
    poolsData.forEach(p => {
      if (!p || !p.id) return;
      if (!existingIds.has(p.id)) {
        adoptPool(p.id, p.settings);
        existingIds.add(p.id);
      } else if (p.settings) {
        saveSettings(deepMerge(getSettings(p.id), p.settings), p.id);
      }
      if (Array.isArray(p.logs)) {
        if (mode === 'replace') saveLogs(p.logs, p.id);
        else mergeLogs(p.logs, p.id);
      }
    });
  }

  // Backup-only merge: folds in log entries (and adopts any pool this
  // device doesn't know about yet) from a remote backup WITHOUT touching
  // any existing pool's settings. Called before every upload so a backup
  // becomes "merge, then push the combined result" instead of a blind
  // overwrite — see mergeRemoteLogsBeforeBackup() in app.js.
  function mergeRemoteBackup(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const poolsData = normalizeBackupShape(data);
    const existingIds = new Set(listPoolIds());
    poolsData.forEach(p => {
      if (!p || !p.id) return;
      if (!existingIds.has(p.id)) {
        adoptPool(p.id, p.settings);
        existingIds.add(p.id);
      }
      if (Array.isArray(p.logs) && p.logs.length) mergeLogs(p.logs, p.id);
    });
  }

  function deepMerge(base, override) {
    if (Array.isArray(base) || Array.isArray(override)) return override != null ? override : base;
    if (typeof base === 'object' && base && typeof override === 'object' && override) {
      const out = { ...base };
      for (const k of Object.keys(override)) {
        out[k] = deepMerge(base[k], override[k]);
      }
      return out;
    }
    return override !== undefined ? override : base;
  }

  return {
    getSettings, saveSettings,
    getLogs, saveLogs, addLog, mergeLogs,
    exportAll, importAll, mergeRemoteBackup,
    listPools, addPool, deletePool, setActivePool, getActivePoolId
  };
})();
