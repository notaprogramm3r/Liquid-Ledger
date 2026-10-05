/*
 * App wiring: tabs, forms, calculator results, history table/charts,
 * settings, and backup buttons. Everything reads/writes through STORE.
 */

// Last-resort diagnostic net: if ANYTHING throws an uncaught exception or
// rejects a promise without being caught anywhere, show it instead of
// letting it fail completely silently. This has been a real problem
// diagnosing phone-only bugs: a script error partway through setup can
// quietly break everything *after* it (e.g. some buttons stop responding)
// with zero visible sign anything went wrong — the person just sees
// "nothing happens" and there's no way to know why without a desktop
// browser's console. Surfacing it as an alert() means even someone with no
// technical background can read the exact error back to us.
window.addEventListener('error', (e) => {
  alert('Liquid Ledger hit an unexpected error and some things may not work right now. Please report this message:\n\n' + (e.error && e.error.message ? e.error.message : e.message));
});
window.addEventListener('unhandledrejection', (e) => {
  alert('Liquid Ledger hit an unexpected error and some things may not work right now. Please report this message:\n\n' + (e.reason && e.reason.message ? e.reason.message : e.reason));
});

(() => {
  let settings = STORE.getSettings();
  let logs = STORE.getLogs();

  const $ = (sel) => document.querySelector(sel);
  const $all = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------------- Tabs ----------------
  function initTabs() {
    $all('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $all('.tab-btn').forEach(b => b.classList.remove('active'));
        $all('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $('#tab-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'history') renderHistory();
        $('#btn-header-save').style.display = btn.dataset.tab === 'settings' ? '' : 'none';
      });
    });
  }

  // ---------------- Calculator ----------------
  // Order follows the recommended sequence for adjusting pool chemistry:
  // balance TA first, then CH, then CYA/stabilizer, then fine-tune pH, then
  // salt (feeds the chlorine generator), with chlorine/sanitizer added last.
  // This order drives the Calculator table, results list, History table/
  // CSV columns, and the Settings target-ranges table.
  const CHEM_KEYS = ['ta', 'ch', 'cya', 'ph', 'salt', 'fc'];
  // Tracked, toggleable fields that are log-only — not dosed by the
  // Calculator (combined chlorine is a diagnostic value, derived from
  // Total − Free, not something you add directly; temperature isn't
  // chemically dosed either).
  const EXTRA_LOG_FIELDS = ['tc', 'cc', 'temp', 'br', 'orp'];
  const CHEM_LABELS = {
    fc: 'Free Chlorine', ph: 'pH', ta: 'Total Alkalinity', cya: 'Cyanuric Acid',
    ch: 'Calcium Hardness', salt: 'Salt', temp: 'Water Temperature',
    tc: 'Total Chlorine', cc: 'Combined Chlorine',
    br: 'Bromine', orp: 'ORP'
  };
  const CHEM_ORDER_NUM = { ta: 1, ch: 2, cya: 3, ph: 4, salt: 5, fc: 6 };

  // Whether a given field is currently shown across Log/Calculator/History/
  // PDF. Salt follows the saltwater-generator toggle; everything else
  // (including the opt-in Water Temperature, Total/Combined Chlorine)
  // follows the Settings "which tests to track" checkboxes.
  function isFieldEnabled(key) {
    if (key === 'salt') return settings.hasSWG;
    // Indoor pools have no sunlight/UV to protect, so stabilizer (CYA)
    // isn't used — force it off regardless of the checkbox state.
    if (key === 'cya' && settings.environment === 'indoor') return false;
    return settings.enabledChems[key] !== false;
  }

  // Which family of sanitizer a settings.sanitizerType value belongs to —
  // drives which test fields (Chlorine vs. Bromine) get switched on by
  // default when the person picks a sanitizer in Settings.
  function sanitizerFamily(type) {
    if (CHEM.FC_RAISERS[type]) return 'chlorine';
    if (CHEM.BR_PRODUCTS[type]) return 'bromine';
    return 'other';
  }

  // Applies sensible "which tests to track" defaults for a newly chosen
  // sanitizer type. Doesn't touch fields the sanitizer type has no opinion
  // about (Total/Combined Chlorine stay off for bromine, but ORP and Water
  // Temperature are left alone either way) — and the checkboxes in
  // Settings stay fully editable afterward, this just sets a starting point.
  function applySanitizerDefaults(type) {
    const family = sanitizerFamily(type);
    if (family === 'chlorine') {
      settings.fcProduct = type;
      settings.enabledChems.fc = true;
      settings.enabledChems.br = false;
    } else if (family === 'bromine') {
      settings.enabledChems.br = true;
      settings.enabledChems.fc = false;
      settings.enabledChems.tc = false;
      settings.enabledChems.cc = false;
    } else {
      // Unknown/custom sanitizer — show both Chlorine and Bromine testing
      // rather than guess which one applies.
      settings.enabledChems.fc = true;
      settings.enabledChems.br = true;
    }
  }

  function sanitizerHintText(type) {
    const family = sanitizerFamily(type);
    if (family === 'chlorine') return 'Chlorine testing (Free/Total/Combined) is available below. Bromine is hidden.';
    if (family === 'bromine') return 'Bromine testing is available below. Chlorine is hidden.';
    return "Since we don't know this sanitizer, both Chlorine and Bromine testing are available below — turn off whichever you don't need.";
  }

  // Display label for any field key, including the two nameable custom
  // fields (which aren't in CHEM_LABELS since their name is user-chosen).
  function fieldLabel(key) {
    if (key === 'custom1') return settings.customFields[0] || 'Custom 1';
    if (key === 'custom2') return settings.customFields[1] || 'Custom 2';
    return CHEM_LABELS[key] || key;
  }

  // Every field that can appear on the Log form, in a user-chosen order
  // (Settings → "Order of tests"). Defaults to FC/pH first, then the rest
  // of the chlorine family, then everything else — see storage.js.
  const CUSTOM_KEYS = ['custom1', 'custom2'];
  const ALL_ORDERABLE_KEYS = ['fc', 'ph', 'tc', 'cc', 'br', 'orp', 'ta', 'ch', 'cya', 'salt', 'temp', 'custom1', 'custom2'];

  // Whether a key counts as "currently tracked" — enabled chemicals/extras
  // via the usual rules, custom fields via having a name set.
  function isKeyTracked(key) {
    if (key === 'custom1') return !!settings.customFields[0];
    if (key === 'custom2') return !!settings.customFields[1];
    return isFieldEnabled(key);
  }

  // settings.testOrder as saved, repaired against ALL_ORDERABLE_KEYS: drops
  // anything unrecognized and appends anything missing (e.g. a field added
  // in a later version that an existing settings blob predates).
  function effectiveTestOrder() {
    const stored = Array.isArray(settings.testOrder) ? settings.testOrder.filter(k => ALL_ORDERABLE_KEYS.includes(k)) : [];
    const missing = ALL_ORDERABLE_KEYS.filter(k => !stored.includes(k));
    // The two user-named custom fields always sit after every built-in test,
    // even in an order saved before this rule existed.
    const all = stored.concat(missing);
    return all.filter(k => !CUSTOM_KEYS.includes(k)).concat(all.filter(k => CUSTOM_KEYS.includes(k)));
  }

  // Every field currently tracked and given a target range, in the
  // person's chosen order — the single source of truth for the Settings
  // target-ranges table, the History charts, and (via historyColumnDefs)
  // the History table/CSV/PDF columns.
  function trackedTargetKeys() {
    return effectiveTestOrder().filter(isKeyTracked);
  }

  // Shows/hides the Log form rows and Calculator table rows for each
  // chemical based on isFieldEnabled(). The EXTRA_LOG_FIELDS (temperature,
  // total/combined chlorine) only apply to the Log form, not the Calculator.
  function applyFieldVisibility() {
    CHEM_KEYS.forEach(k => {
      const show = isFieldEnabled(k);
      const logRow = document.querySelector(`#log-form .field-row[data-key="${k}"]`);
      if (logRow) logRow.style.display = show ? '' : 'none';
      const calcRow = document.querySelector(`#calc-table tr[data-key="${k}"]`);
      if (calcRow) calcRow.style.display = show ? '' : 'none';
    });
    EXTRA_LOG_FIELDS.forEach(k => {
      const row = document.querySelector(`#log-form .field-row[data-key="${k}"]`);
      if (row) row.style.display = isFieldEnabled(k) ? '' : 'none';
    });
  }

  // Physically reorders the Log form's field rows to match
  // effectiveTestOrder(). The Corrective Action row (and Notes/Initials
  // after it) stay fixed as the anchor everything else gets inserted
  // before, in order, so they're always last.
  function applyFieldOrder() {
    const anchor = $('#log-corrective').closest('.field-row');
    effectiveTestOrder().forEach(k => {
      const row = document.querySelector(`#log-form .field-row[data-key="${k}"]`);
      if (row) anchor.before(row);
    });
  }

  // Custom fields are shown whenever they've been given a name in Settings;
  // blanking the name is how you hide one.
  function updateLogCustomLabels() {
    const label1 = settings.customFields[0] || '';
    const label2 = settings.customFields[1] || '';
    $('#log-custom1-label').textContent = label1 || 'Custom 1';
    $('#log-custom2-label').textContent = label2 || 'Custom 2';
    $('#log-custom1').closest('.field-row').style.display = label1 ? '' : 'none';
    $('#log-custom2').closest('.field-row').style.display = label2 ? '' : 'none';
  }

  // Reads the Calculator tab's own fields (independent of the Log tab).
  // Returns { fc, ph, ta, cya, ch, salt } (current readings) and a parallel
  // `target` object holding the desired reading for each, which the user
  // can override per-calculation (defaults to the Settings target/ideal).
  function readCalcInputs() {
    const vals = {};
    vals.fc = parseFloat($('#in-fc').value);
    vals.ph = parseFloat($('#in-ph').value);
    vals.ta = parseFloat($('#in-ta').value);
    vals.cya = parseFloat($('#in-cya').value);
    vals.ch = parseFloat($('#in-ch').value);
    vals.salt = settings.hasSWG ? parseFloat($('#in-salt').value) : NaN;

    vals.target = {};
    CHEM_KEYS.forEach(k => {
      const raw = parseFloat($('#target-' + k).value);
      vals.target[k] = isNaN(raw) ? settings.targets[k].ideal : raw;
    });

    return vals;
  }

  // Fills the "Desired" column from the Settings target/ideal values.
  function populateDesiredDefaults() {
    CHEM_KEYS.forEach(k => {
      $('#target-' + k).value = settings.targets[k].ideal;
    });
  }

  // Reads the Log tab's own fields.
  function readLogInputs() {
    const vals = {};
    vals.fc = parseFloat($('#log-fc').value);
    vals.ph = parseFloat($('#log-ph').value);
    vals.ta = parseFloat($('#log-ta').value);
    vals.cya = parseFloat($('#log-cya').value);
    vals.ch = parseFloat($('#log-ch').value);
    vals.salt = settings.hasSWG ? parseFloat($('#log-salt').value) : NaN;
    vals.temp = parseFloat($('#log-temp').value);
    vals.tc = parseFloat($('#log-tc').value);
    vals.cc = parseFloat($('#log-cc').value);
    vals.br = parseFloat($('#log-br').value);
    vals.orp = parseFloat($('#log-orp').value);
    vals.notes = $('#log-notes').value.trim();
    vals.initials = $('#log-initials').value.trim();
    vals.custom1 = parseFloat($('#log-custom1').value);
    vals.custom2 = parseFloat($('#log-custom2').value);
    vals.corrective = $('#log-corrective').value.trim();
    return vals;
  }

  function loadLatestIntoCalculator() {
    const latest = logs[logs.length - 1];
    if (!latest) { alert('No logged tests yet — log one first, or just type readings in here.'); return; }
    $('#in-fc').value = latest.fc ?? '';
    $('#in-ph').value = latest.ph ?? '';
    $('#in-ta').value = latest.ta ?? '';
    $('#in-cya').value = latest.cya ?? '';
    $('#in-ch').value = latest.ch ?? '';
    if (settings.hasSWG) $('#in-salt').value = latest.salt ?? '';
    handleCalculate();
  }

  // `vals.target` holds the desired reading to dose toward (per-calculation
  // override, defaulting to the Settings ideal). The Settings min/max range
  // is still used for the ok/low/high status badge, since that's about
  // where the current reading sits relative to the normal range, not the
  // one-off target the user is dosing toward this time.
  function computeDoses(vals) {
    const t = settings.targets;
    const g = settings.gallons;
    const target = vals.target || {};
    const out = {};

    if (isFieldEnabled('ta') && !isNaN(vals.ta)) out.ta = { ...CHEM.doseTA(g, vals.ta, target.ta), status: CHEM.statusFor(vals.ta, t.ta) };
    if (isFieldEnabled('ch') && !isNaN(vals.ch)) out.ch = { ...CHEM.doseCH(g, vals.ch, target.ch), status: CHEM.statusFor(vals.ch, t.ch) };
    if (isFieldEnabled('cya') && !isNaN(vals.cya)) out.cya = { ...CHEM.doseCYA(g, vals.cya, target.cya), status: CHEM.statusFor(vals.cya, t.cya) };
    if (isFieldEnabled('ph') && !isNaN(vals.ph)) out.ph = { ...CHEM.dosePH(g, vals.ph, target.ph, vals.ta), status: CHEM.statusFor(vals.ph, t.ph) };
    if (isFieldEnabled('salt') && !isNaN(vals.salt)) out.salt = { ...CHEM.doseSalt(g, vals.salt, target.salt), status: CHEM.statusFor(vals.salt, t.salt) };
    if (isFieldEnabled('fc') && !isNaN(vals.fc)) out.fc = { ...CHEM.doseFC(g, vals.fc, target.fc, settings.fcProduct), status: CHEM.statusFor(vals.fc, t.fc) };

    return out;
  }

  function renderResults(doses) {
    const box = $('#results');
    const keys = Object.keys(doses);
    if (!keys.length) {
      box.innerHTML = '<p class="muted">Enter at least one reading and click Calculate dosing.</p>';
      return;
    }
    box.innerHTML = keys.map(k => {
      const d = doses[k];
      const statusClass = d.status || 'unknown';
      const badge = d.status ? `<span class="badge ${d.status}">${d.status}</span>` : '';
      return `
        <div class="dose-item state-${statusClass}">
          <h3>${CHEM_ORDER_NUM[k]}. ${CHEM_LABELS[k]} ${badge}</h3>
          <p>${d.message}</p>
        </div>`;
    }).join('');
  }

  function handleCalculate() {
    const vals = readCalcInputs();
    const hasAny = CHEM_KEYS.some(k => !isNaN(vals[k]));
    if (!hasAny) {
      $('#results').innerHTML = '<p class="muted">Enter at least one reading and click Calculate dosing.</p>';
      return;
    }
    const doses = computeDoses(vals);
    renderResults(doses);
    return { vals, doses };
  }

  function handleLog() {
    const vals = readLogInputs();

    // Combined chlorine is usually derived (Total − Free), not measured
    // directly. If both are tracked and entered, and combined was left
    // blank, fill it in automatically — still editable/overridable above.
    if (isFieldEnabled('cc') && isNaN(vals.cc) && !isNaN(vals.tc) && !isNaN(vals.fc)) {
      vals.cc = Math.max(0, CHEM.round(vals.tc - vals.fc, 2));
    }

    const hasAny = CHEM_KEYS.some(k => !isNaN(vals[k])) || !isNaN(vals.temp) ||
      !isNaN(vals.tc) || !isNaN(vals.cc) || !isNaN(vals.br) || !isNaN(vals.orp) ||
      !isNaN(vals.custom1) || !isNaN(vals.custom2);
    if (!hasAny) {
      alert('Enter at least one reading before logging.');
      return;
    }
    // Always the real time of saving — not editable, not backdatable.
    const entry = {
      date: new Date().toISOString(),
      fc: numOrNull(vals.fc), ph: numOrNull(vals.ph), ta: numOrNull(vals.ta),
      cya: numOrNull(vals.cya), ch: numOrNull(vals.ch), salt: numOrNull(vals.salt),
      temp: numOrNull(vals.temp),
      tc: numOrNull(vals.tc), cc: numOrNull(vals.cc),
      br: numOrNull(vals.br), orp: numOrNull(vals.orp),
      notes: vals.notes || '',
      initials: vals.initials || '',
      custom1: numOrNull(vals.custom1),
      custom2: numOrNull(vals.custom2),
      corrective: vals.corrective || ''
    };
    STORE.addLog(entry);
    logs = STORE.getLogs();
    flashSaved('#btn-log');
    updateCorrectiveHint(entry);
    clearLogForm();
    renderHistory();

    // Best-effort: if a local folder is connected and auto-save is on,
    // write the backup right away. Never blocks or alerts on failure —
    // the log entry is already safely saved locally either way.
    if (settings.localFolder.connected && settings.localFolder.autoSave && LOCALFOLDER.supported()) {
      localFolderBackup({ silent: true });
    }

    // Same idea for Dropbox: if connected and auto-sync is on, push this
    // entry (and pull in anything another device already added) right
    // away instead of waiting for a manual "Back up now" tap. dbxBackup()
    // already does a full pull-merge-then-push cycle, so this is enough
    // to keep two devices in sync without the user doing anything extra.
    if (settings.dropbox.refreshToken && settings.dropbox.autoSave) {
      dbxBackup({ silent: true });
    }
  }

  // Non-blocking reminder, matching the "document corrective action when a
  // reading is out of range" expectation common to public-pool codes (see
  // the Rules tab). Never stops the log from saving — just nudges.
  function updateCorrectiveHint(entry) {
    const hintEl = $('#log-corrective-hint');
    const outOfRange = trackedTargetKeys().filter(k => {
      const v = entry[k];
      const t = settings.targets[k];
      return v !== null && v !== undefined && t && (v < t.min || v > t.max);
    });
    if (outOfRange.length && !entry.corrective) {
      hintEl.textContent = '⚠ ' + outOfRange.map(fieldLabel).join(', ') +
        ' saved outside target range — consider recording a corrective action next time.';
      hintEl.classList.add('warn');
    } else {
      hintEl.textContent = '';
      hintEl.classList.remove('warn');
    }
  }

  function clearLogForm() {
    ['#log-fc', '#log-ph', '#log-ta', '#log-cya', '#log-ch', '#log-salt', '#log-temp', '#log-tc', '#log-cc', '#log-br', '#log-orp', '#log-notes', '#log-custom1', '#log-custom2', '#log-corrective'].forEach(sel => $(sel).value = '');
    // Initials tend to stay the same across a session — refill with the
    // Settings default rather than blanking, so logging several entries
    // in a row doesn't require retyping them each time.
    $('#log-initials').value = settings.defaultInitials || '';
  }

  // Read-only live clock shown on the Log tab — the actual timestamp used
  // on save is always computed fresh in handleLog(), never read from here.
  function startLogClock() {
    const el = $('#log-date-display');
    const tick = () => {
      el.textContent = new Date().toLocaleString([], {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    };
    tick();
    setInterval(tick, 1000);
  }

  function numOrNull(v) { return isNaN(v) ? null : v; }

  function flashSaved(selector) {
    const btn = $(selector);
    const original = btn.textContent;
    btn.textContent = 'Saved ✓';
    setTimeout(() => btn.textContent = original, 1400);
  }

  // ---------------- History ----------------
  // Single source of truth for which columns History/CSV/PDF show, in
  // order: Date, then enabled chemicals (dosing order), then temperature,
  // then any named custom fields, then Notes and who logged it.
  function historyColumnDefs() {
    const defs = [{ key: 'date', label: 'Date' }];
    const UNIT_LABELS = { temp: 'Temp (°F)', br: 'Bromine (ppm)', orp: 'ORP (mV)' };
    trackedTargetKeys().forEach(k => {
      defs.push({ key: k, label: UNIT_LABELS[k] || fieldLabel(k) });
    });
    defs.push({ key: 'corrective', label: 'Corrective Action' });
    defs.push({ key: 'notes', label: 'Notes' });
    defs.push({ key: 'initials', label: 'By' });
    return defs;
  }

  function renderHistory() {
    logs = STORE.getLogs();
    const defs = historyColumnDefs();

    // Log entries are permanent once saved — no delete control. This keeps
    // the Liquid Ledger a trustworthy record (e.g. for shared/multi-person
    // logs) rather than something any one person can quietly edit away.
    $('#history-table thead').innerHTML = `<tr>${defs.map(d => `<th>${d.label}</th>`).join('')}</tr>`;

    const tbody = $('#history-table tbody');
    tbody.innerHTML = logs.slice().reverse().map(l => {
      const cells = defs.map(d => {
        if (d.key === 'date') return `<td>${formatDate(l.date)}</td>`;
        if (d.key === 'notes' || d.key === 'initials' || d.key === 'corrective') {
          return `<td>${escapeHtml(l[d.key] || '')}</td>`;
        }
        return `<td>${fmt(l[d.key])}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('') || `<tr><td colspan="${defs.length}" class="muted">No entries yet — log a test from the Liquid Ledger tab.</td></tr>`;

    renderCharts();
  }

  function fmt(v) { return (v === null || v === undefined || isNaN(v)) ? '—' : v; }
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Buckets points into weekly/monthly averages for a smoother long-term
  // trend view. 'daily' (the default) plots every entry exactly as logged.
  function aggregatePoints(points, granularity) {
    if (granularity === 'daily' || points.length < 2) return points;
    const buckets = new Map();
    points.forEach(p => {
      const d = new Date(p.x);
      let key;
      if (granularity === 'weekly') {
        const day = new Date(d);
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - day.getDay()); // back to Sunday
        key = day.getTime();
      } else { // monthly
        key = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      }
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p.y);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([x, ys]) => ({ x, y: ys.reduce((a, b) => a + b, 0) / ys.length }));
  }

  function renderCharts() {
    const box = $('#history-charts');
    box.innerHTML = '';
    const granularity = $('#history-range') ? $('#history-range').value : 'daily';
    const series = trackedTargetKeys();

    series.forEach(key => {
      const raw = logs.filter(l => l[key] !== null && l[key] !== undefined).map(l => ({ x: new Date(l.date).getTime(), y: l[key] }));
      const points = aggregatePoints(raw, granularity);
      if (points.length < 2) return;
      const wrap = document.createElement('div');
      wrap.className = 'chart-box';
      const canvas = document.createElement('canvas');
      canvas.width = 180; canvas.height = 70;
      wrap.appendChild(canvas);
      const label = document.createElement('div');
      label.className = 'chart-label';
      label.textContent = fieldLabel(key);
      wrap.appendChild(label);
      box.appendChild(wrap);
      drawSparkline(canvas, points, settings.targets[key]);
    });
  }

  // Minimal dependency-free sparkline with a shaded target band — green
  // behind the in-range zone, red behind the out-of-range zones above and
  // below it, so a reading drifting out of range is obvious at a glance.
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawSparkline(canvas, points, target) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, pad = 6;
    const lineColor = cssVar('--teal', '#00a7cf');
    const okFill = cssVar('--seafoam', '#0fb88a');
    const outFill = cssVar('--coral', '#ff6b4a');
    ctx.clearRect(0, 0, w, h);
    const ys = points.map(p => p.y);
    let min = Math.min(...ys, target ? target.min : Infinity);
    let max = Math.max(...ys, target ? target.max : -Infinity);
    // Leave a little headroom above/below so an out-of-range point isn't
    // drawn flush against the canvas edge, and so the red zone is visible
    // even when every point so far happens to be in range.
    const padRange = (max - min) * 0.15 || 1;
    min -= padRange; max += padRange;
    if (min === max) { min -= 1; max += 1; }
    const xMin = points[0].x, xMax = points[points.length - 1].x;
    const xSpan = (xMax - xMin) || 1;

    const toX = (x) => pad + ((x - xMin) / xSpan) * (w - 2 * pad);
    const toY = (y) => h - pad - ((y - min) / (max - min)) * (h - 2 * pad);

    if (target) {
      const yTop = toY(target.max), yBot = toY(target.min);
      // Out-of-range bands first (so the in-range band paints over any
      // overlap at the seam), covering the full plot above/below target.
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = outFill;
      if (yTop > pad) ctx.fillRect(pad, pad, w - 2 * pad, yTop - pad);
      if (yBot < h - pad) ctx.fillRect(pad, yBot, w - 2 * pad, (h - pad) - yBot);
      // In-range band.
      ctx.fillStyle = okFill;
      ctx.fillRect(pad, yTop, w - 2 * pad, yBot - yTop);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = toX(p.x), y = toY(p.y);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Out-of-range readings stand out so a problem test jumps out of the
    // trend line at a glance.
    points.forEach(p => {
      const outOfRange = target && (p.y < target.min || p.y > target.max);
      ctx.fillStyle = outOfRange ? outFill : lineColor;
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.y), outOfRange ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function exportCsv() {
    const defs = historyColumnDefs();
    const rows = [defs.map(d => d.key)];
    logs.forEach(l => {
      rows.push(defs.map(d => {
        const v = d.key === 'date' ? l.date : l[d.key];
        if (typeof v === 'string') return v.replace(/,/g, ';');
        return v === null || v === undefined ? '' : v;
      }));
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    downloadFile(backupCsvFilename(), csv, 'text/csv');
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------------- PDF export ----------------
  const PDF_COLUMN_DEFS = () => historyColumnDefs().filter(d => d.key !== 'date');

  function renderPdfColumnCheckboxes() {
    const box = $('#pdf-columns');
    box.innerHTML = PDF_COLUMN_DEFS().map(c => `
      <label><input type="checkbox" class="pdf-col" value="${c.key}" checked> ${c.label}</label>
    `).join('');
  }

  function generatePdf() {
    const startVal = $('#pdf-start').value;
    const endVal = $('#pdf-end').value;
    const startMs = startVal ? new Date(startVal + 'T00:00:00').getTime() : -Infinity;
    const endMs = endVal ? new Date(endVal + 'T23:59:59').getTime() : Infinity;

    const selectedCols = $all('.pdf-col').filter(cb => cb.checked).map(cb => cb.value);
    if (!selectedCols.length) { alert('Pick at least one column to include.'); return; }

    const filtered = logs.filter(l => {
      const t = new Date(l.date).getTime();
      return t >= startMs && t <= endMs;
    });
    if (!filtered.length) { alert('No log entries fall in that date range.'); return; }

    const colDefs = PDF_COLUMN_DEFS().filter(c => selectedCols.includes(c.key));
    const rangeLabel = (startVal || endVal)
      ? `${startVal || 'earliest'} to ${endVal || 'latest'}`
      : 'all entries';

    const headerRow = '<th>Date</th>' + colDefs.map(c => `<th>${c.label}</th>`).join('');
    const bodyRows = filtered.map(l => {
      const cells = colDefs.map(c => {
        const v = l[c.key];
        return `<td>${v === null || v === undefined || v === '' ? '—' : escapeHtml(String(v))}</td>`;
      }).join('');
      return `<tr><td>${formatDate(l.date)}</td>${cells}</tr>`;
    }).join('');

    const kindLabel = settings.poolType === 'spa' ? 'Spa' : 'Pool';
    const titleText = settings.poolName
      ? `${escapeHtml(settings.poolName)} — ${kindLabel} Test Report`
      : `Liquid Ledger — ${kindLabel} Test Report`;

    // The pool's photo, if it has one, leads the first page. Only accept an
    // actual image data URL (a backup file from elsewhere could hold anything).
    const photoHtml = settings.photo && /^data:image\//.test(settings.photo)
      ? `<img class="print-photo" src="${escapeHtml(settings.photo)}" alt="">`
      : '';

    const report = $('#print-report');
    report.innerHTML = `
      ${photoHtml}
      <h1>${titleText}</h1>
      <div class="print-meta">
        Date range: ${rangeLabel} &nbsp;•&nbsp; ${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}
        &nbsp;•&nbsp; ${kindLabel} volume: ${settings.gallons} gal
        &nbsp;•&nbsp; Generated ${new Date().toLocaleString()}
      </div>
      <table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
    `;

    const prevTitle = document.title;
    document.title = settings.poolName ? `${settings.poolName} — Pool Report` : 'Liquid Ledger Report';
    const restoreTitle = () => { document.title = prevTitle; window.removeEventListener('afterprint', restoreTitle); };
    window.addEventListener('afterprint', restoreTitle);
    // Make sure the photo has finished decoding before the print dialog
    // snapshots the page, or it can come out blank.
    const photoEl = report.querySelector('.print-photo');
    const ready = photoEl && photoEl.decode ? photoEl.decode().catch(() => {}) : Promise.resolve();
    ready.then(() => window.print());
  }

  // ---------------- Settings ----------------
  // Chemicals the person can individually show/hide. Salt is excluded —
  // it's controlled by the saltwater-generator checkbox instead.
  const TOGGLEABLE_CHEMS = ['ta', 'ch', 'cya', 'ph', 'fc'].concat(EXTRA_LOG_FIELDS);

  function renderEnabledChemsCheckboxes() {
    // Alphabetical by the label the person actually sees (case-insensitive).
    const alphabetical = TOGGLEABLE_CHEMS.slice().sort((a, b) =>
      CHEM_LABELS[a].localeCompare(CHEM_LABELS[b], undefined, { sensitivity: 'base' }));
    $('#enabled-chems').innerHTML = alphabetical.map(k => {
      const indoorLockedCya = k === 'cya' && settings.environment === 'indoor';
      const note = indoorLockedCya ? ' <span class="muted">(off — indoor pool)</span>' : '';
      return `<label><input type="checkbox" class="enabled-chem" value="${k}" ${isFieldEnabled(k) ? 'checked' : ''} ${indoorLockedCya ? 'disabled' : ''}> ${CHEM_LABELS[k]}${note}</label>`;
    }).join('');
  }

  function populateSettingsForm() {
    $('#set-pool-name').value = settings.poolName || '';
    $('#set-gallons').value = settings.gallons;
    $('#set-swg').checked = settings.hasSWG;
    $('#set-pool-type').value = settings.poolType || 'pool';
    $('#set-environment').value = settings.environment || 'outdoor';
    $('#set-gallons-label').textContent = settings.poolType === 'spa' ? 'Spa volume (gallons)' : 'Pool volume (gallons)';
    applyFieldVisibility();
    applyFieldOrder();

    const sel = $('#set-sanitizer-type');
    const chlorineOpts = Object.entries(CHEM.FC_RAISERS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    const bromineOpts = Object.entries(CHEM.BR_PRODUCTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    sel.innerHTML = `<optgroup label="Chlorine">${chlorineOpts}</optgroup><optgroup label="Bromine">${bromineOpts}</optgroup><option value="other">Other (specify)…</option>`;
    sel.value = settings.sanitizerType || 'liquid125';
    const isOther = sel.value === 'other';
    $('#set-sanitizer-other-row').style.display = isOther ? '' : 'none';
    $('#set-sanitizer-other').value = settings.sanitizerOther || '';
    $('#sanitizer-hint').textContent = sanitizerHintText(sel.value);

    $('#set-default-initials').value = settings.defaultInitials || '';
    $('#set-custom1-label').value = settings.customFields[0] || '';
    $('#set-custom2-label').value = settings.customFields[1] || '';
    updateLogCustomLabels();

    renderEnabledChemsCheckboxes();

    // Every trackable field gets a target-range row, including the two
    // custom fields once they've been named — "all fields, including
    // custom ones if selected" per the Settings target-range requirement.
    const targetKeys = trackedTargetKeys();

    const tbody = $('#targets-table tbody');
    tbody.innerHTML = targetKeys.map(k => {
      const t = settings.targets[k];
      return `<tr data-key="${k}">
        <td>${fieldLabel(k)}</td>
        <td><input type="number" step="0.1" class="t-min" value="${t.min}"></td>
        <td><input type="number" step="0.1" class="t-ideal" value="${t.ideal}"></td>
        <td><input type="number" step="0.1" class="t-max" value="${t.max}"></td>
      </tr>`;
    }).join('');

    $('#dbx-app-key').value = settings.dropbox.appKey || '';
    $('#dbx-autosave').checked = !!settings.dropbox.autoSave;
    $('#gdrive-client-id').value = settings.google.clientId || '';
    $('#ms-client-id').value = settings.microsoft.clientId || '';
    $('#dbx-redirect-uri-hint').textContent = DROPBOX.redirectUri();
    $('#ms-redirect-uri-hint').textContent = ONEDRIVE.redirectUri();
    updateBackupStatus();

    renderPhotoPreview();
    renderPoolList();
    renderPoolSwitcher();
    renderTestOrderList();
  }

  function saveSettingsFromForm() {
    settings.poolName = $('#set-pool-name').value.trim();
    settings.gallons = parseFloat($('#set-gallons').value) || settings.gallons;
    settings.hasSWG = $('#set-swg').checked;
    settings.poolType = $('#set-pool-type').value;
    settings.environment = $('#set-environment').value;
    settings.sanitizerType = $('#set-sanitizer-type').value;
    settings.sanitizerOther = $('#set-sanitizer-other').value.trim();
    if (sanitizerFamily(settings.sanitizerType) === 'chlorine') settings.fcProduct = settings.sanitizerType;
    settings.defaultInitials = $('#set-default-initials').value.trim();
    settings.customFields = [$('#set-custom1-label').value.trim(), $('#set-custom2-label').value.trim()];

    $all('.enabled-chem').forEach(cb => { settings.enabledChems[cb.value] = cb.checked; });
    // Indoor pools never use CYA, regardless of what the (disabled) checkbox shows.
    if (settings.environment === 'indoor') settings.enabledChems.cya = false;

    $all('#targets-table tbody tr').forEach(row => {
      const k = row.dataset.key;
      settings.targets[k] = {
        min: parseFloat(row.querySelector('.t-min').value),
        ideal: parseFloat(row.querySelector('.t-ideal').value),
        max: parseFloat(row.querySelector('.t-max').value)
      };
    });

    settings.dropbox.appKey = $('#dbx-app-key').value.trim();
    settings.google.clientId = $('#gdrive-client-id').value.trim();
    settings.microsoft.clientId = $('#ms-client-id').value.trim();

    STORE.saveSettings(settings);
    const msg = $('#settings-saved');
    msg.textContent = 'Saved ✓';
    msg.classList.add('ok');
    setTimeout(() => { msg.textContent = ''; msg.classList.remove('ok'); }, 1800);
    const headerBtn = $('#btn-header-save');
    const headerLabel = headerBtn.textContent;
    headerBtn.textContent = 'Saved ✓';
    setTimeout(() => { headerBtn.textContent = headerLabel; }, 1800);
    populateSettingsForm();
    populateDesiredDefaults();
    renderPdfColumnCheckboxes();
    renderHistory();
  }

  // ---------------- Pools ----------------
  // The header dropdown that switches between pools. Also shows a small
  // thumbnail of the active pool's photo, if it has one.
  function renderPoolSwitcher() {
    const activeId = STORE.getActivePoolId();
    const pools = STORE.listPools();
    const sel = $('#pool-switcher');
    sel.innerHTML = pools.map(p => `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    const active = pools.find(p => p.id === activeId);
    const photoImg = $('#pool-switcher-photo');
    if (active && active.photo) {
      photoImg.src = active.photo;
      photoImg.style.display = '';
    } else {
      photoImg.style.display = 'none';
    }

    // A bigger, more prominent version of the same photo at the top of the
    // New Entry card — the screen people see most often.
    const banner = $('#log-pool-banner');
    if (active && active.photo) {
      $('#log-pool-photo').src = active.photo;
      $('#log-pool-name').textContent = active.name;
      banner.style.display = '';
    } else {
      banner.style.display = 'none';
    }
  }

  // The "Your pools" management list on the Settings tab: switch, or delete.
  function renderPoolList() {
    const activeId = STORE.getActivePoolId();
    const pools = STORE.listPools();
    $('#pool-list').innerHTML = pools.map((p, i) => `
      <div class="pool-list-item ${p.id === activeId ? 'active' : ''}">
        ${p.photo ? `<img class="pool-thumb-lg" src="${p.photo}" alt="">` : `<div class="pool-thumb-placeholder">💧</div>`}
        <div>
          <div class="pool-list-name">${escapeHtml(p.name)}${p.id === activeId ? ' <span class="muted">(active)</span>' : ''}</div>
          <div class="pool-list-meta">${p.poolType === 'spa' ? 'Spa' : 'Pool'} · ${p.environment === 'indoor' ? 'Indoor' : 'Outdoor'}</div>
        </div>
        <div class="actions">
          <button type="button" class="btn-pool-up" data-id="${p.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move pool up">↑</button>
          <button type="button" class="btn-pool-down" data-id="${p.id}" ${i === pools.length - 1 ? 'disabled' : ''} aria-label="Move pool down">↓</button>
          ${p.id !== activeId ? `<button type="button" class="btn-pool-switch" data-id="${p.id}">Switch to</button>` : ''}
          <button type="button" class="btn-pool-delete" data-id="${p.id}" ${pools.length <= 1 ? 'disabled title="At least one pool is required"' : ''}>Delete</button>
        </div>
      </div>
    `).join('');

    const movePool = (id, dir) => {
      STORE.movePool(id, dir);
      renderPoolList();
      renderPoolSwitcher();
    };
    $all('.btn-pool-up').forEach(b => b.addEventListener('click', () => movePool(b.dataset.id, -1)));
    $all('.btn-pool-down').forEach(b => b.addEventListener('click', () => movePool(b.dataset.id, 1)));
    $all('.btn-pool-switch').forEach(b => b.addEventListener('click', () => {
      STORE.setActivePool(b.dataset.id);
      loadActivePool();
    }));
    $all('.btn-pool-delete').forEach(b => b.addEventListener('click', async () => {
      const pool = pools.find(p => p.id === b.dataset.id);
      const logCount = STORE.getLogs(pool.id).length;
      const entryPhrase = logCount === 1 ? '1 logged entry' : `${logCount} logged entries`;
      const confirmed = await showConfirm(
        'Delete this pool?',
        `This permanently deletes "${pool.name}" and ${entryPhrase} of its history. This can't be undone — make sure you have a backup first if you might want this later.`
      );
      if (!confirmed) return;
      STORE.deletePool(b.dataset.id);
      loadActivePool();
    }));
  }

  // Styled Yes/Cancel modal used in place of the browser's plain confirm()
  // for anything destructive — resolves true/false.
  function showConfirm(title, body, confirmLabel) {
    return new Promise(resolve => {
      const overlay = $('#confirm-overlay');
      $('#confirm-title').textContent = title;
      $('#confirm-body').textContent = body;
      $('#confirm-ok').textContent = confirmLabel || 'Delete';
      overlay.style.display = 'flex';

      function cleanup(result) {
        overlay.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlay);
        resolve(result);
      }
      const okBtn = $('#confirm-ok');
      const cancelBtn = $('#confirm-cancel');
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onOverlay(e) { if (e.target === overlay) cleanup(false); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlay);
    });
  }

  // Re-reads the now-active pool's settings/logs and refreshes everything
  // that depends on them. Called on pool switch, pool delete, and after a
  // restore/merge that may have changed what the active pool looks like.
  function loadActivePool() {
    settings = STORE.getSettings();
    logs = STORE.getLogs();
    populateSettingsForm();
    populateDesiredDefaults();
    renderPdfColumnCheckboxes();
    renderHistory();
    $('#log-initials').value = settings.defaultInitials || '';
    $('#log-corrective-hint').textContent = '';
    $('#log-corrective-hint').classList.remove('warn');
  }

  function promptAddPool() {
    const name = prompt('Name this new pool (e.g. "Backyard Pool", "Hot Tub"):', '');
    if (name === null) return; // cancelled
    const id = STORE.addPool(name);
    STORE.setActivePool(id);
    loadActivePool();
  }

  // ---------------- Pool photo ----------------
  function renderPhotoPreview() {
    const wrap = $('#set-photo-preview-wrap');
    wrap.innerHTML = settings.photo
      ? `<img class="photo-preview" src="${settings.photo}" alt="Pool photo">`
      : `<div class="photo-preview-placeholder">💧</div>`;
  }

  // Resizes/compresses the chosen image client-side (max 720px on the long
  // edge, JPEG ~75% quality; the original shape is kept — it's shown as a
  // landscape crop on the New Entry screen and the PDF) before storing it as a data URL in settings —
  // keeps localStorage usage reasonable even with several photographed pools.
  function handlePhotoFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 720;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        settings.photo = canvas.toDataURL('image/jpeg', 0.75);
        STORE.saveSettings(settings);
        renderPhotoPreview();
        renderPoolList();
        renderPoolSwitcher();
      };
      img.onerror = () => alert('Could not read that image file.');
      img.src = reader.result;
    };
    reader.onerror = () => alert('Could not read that image file.');
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    settings.photo = null;
    STORE.saveSettings(settings);
    renderPhotoPreview();
    renderPoolList();
    renderPoolSwitcher();
  }

  // ---------------- Test order ----------------
  // Lists every orderable field (even ones currently hidden, annotated as
  // such) with Up/Down buttons to reorder them. Applies immediately to the
  // Log form; persisted to storage when "Save settings" is clicked, same
  // as the rest of this tab.
  function renderTestOrderList() {
    const order = effectiveTestOrder();
    $('#test-order-list').innerHTML = order.map((k, i) => `
      <div class="order-list-item">
        <span class="order-list-name">${fieldLabel(k)}${isKeyTracked(k) ? '' : ' <span class="muted">(not tracked)</span>'}</span>
        <div class="actions">
          <button type="button" class="btn-order-up" data-key="${k}" ${canMoveTest(order, k, -1) ? '' : 'disabled'} aria-label="Move up">↑</button>
          <button type="button" class="btn-order-down" data-key="${k}" ${canMoveTest(order, k, 1) ? '' : 'disabled'} aria-label="Move down">↓</button>
        </div>
      </div>
    `).join('');

    $all('.btn-order-up').forEach(b => b.addEventListener('click', () => moveTestOrder(b.dataset.key, -1)));
    $all('.btn-order-down').forEach(b => b.addEventListener('click', () => moveTestOrder(b.dataset.key, 1)));
  }

  // Custom fields stay in their own group at the bottom: a test can only
  // swap places with a neighbor of the same kind (built-in vs. custom).
  function canMoveTest(order, key, dir) {
    const neighbor = order[order.indexOf(key) + dir];
    return neighbor !== undefined && CUSTOM_KEYS.includes(neighbor) === CUSTOM_KEYS.includes(key);
  }

  function moveTestOrder(key, dir) {
    const order = effectiveTestOrder();
    if (!canMoveTest(order, key, dir)) return;
    const idx = order.indexOf(key);
    const newIdx = idx + dir;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    settings.testOrder = order;
    applyFieldOrder();
    renderTestOrderList();
  }

  // ---------------- Backup: Dropbox ----------------
  function updateBackupStatus() {
    const dbx = $('#dbx-status');
    if (settings.dropbox.refreshToken) {
      dbx.textContent = 'Connected to Dropbox.' + (settings.lastBackup.dropbox ? ' Last backup: ' + formatDate(settings.lastBackup.dropbox) : '');
      dbx.classList.add('ok');
    } else {
      dbx.textContent = 'Not connected.';
      dbx.classList.remove('ok');
    }
    const gd = $('#gdrive-status');
    if (settings.google.accessToken) {
      gd.textContent = 'Connected to Google Drive.' + (settings.lastBackup.google ? ' Last backup: ' + formatDate(settings.lastBackup.google) : '');
      gd.classList.add('ok');
    } else {
      gd.textContent = 'Not connected.';
      gd.classList.remove('ok');
    }
    const ms = $('#ms-status');
    if (settings.microsoft.refreshToken) {
      ms.textContent = 'Connected to OneDrive.' + (settings.lastBackup.microsoft ? ' Last backup: ' + formatDate(settings.lastBackup.microsoft) : '');
      ms.classList.add('ok');
    } else {
      ms.textContent = 'Not connected.';
      ms.classList.remove('ok');
    }
  }

  // Whichever Dropbox app key actually gets used: the person's own
  // (pasted into the "Advanced" field), or Liquid Ledger's built-in one —
  // so "Connect Dropbox" works immediately with zero setup by default.
  function dbxAppKey() {
    return (settings.dropbox.appKey || '').trim() || DROPBOX.getDefaultAppKey();
  }

  async function dbxConnect() {
    settings.dropbox.appKey = $('#dbx-app-key').value.trim(); // '' = use the built-in app
    STORE.saveSettings(settings);
    await DROPBOX.beginAuth(dbxAppKey()); // navigates away
  }

  async function dbxHandleRedirectIfAny() {
    try {
      const tokens = await DROPBOX.handleRedirect(dbxAppKey());
      if (tokens) {
        settings.dropbox.accessToken = tokens.accessToken;
        settings.dropbox.refreshToken = tokens.refreshToken;
        settings.dropbox.expiresAt = tokens.expiresAt;
        STORE.saveSettings(settings);
        updateBackupStatus();
      }
    } catch (e) {
      showBackupError('dbx-status', e);
    }
  }

  // opts.silent: used by auto-sync (after logging, and on app load) so it
  // doesn't interrupt with a popup on every single entry. A manual tap on
  // "Back up now" always gets a visible, impossible-to-miss alert() with
  // the real outcome — success or the exact error — because the status
  // line text alone has proven too easy to miss/scroll past to debug
  // real-world failures on a phone.
  async function dbxBackup(opts = {}) {
    try {
      const token = await DROPBOX.ensureValidToken(settings.dropbox, dbxAppKey());
      await mergeRemoteLogsBeforeBackup(() => DROPBOX.download(token), e => NOT_FOUND_RE.test(e.message));
      await DROPBOX.upload(token, STORE.exportAll());
      settings.lastBackup.dropbox = new Date().toISOString();
      STORE.saveSettings(settings);
      updateBackupStatus();
      renderHistory();
      if (!opts.silent) alert('Backed up to Dropbox successfully at ' + formatDate(settings.lastBackup.dropbox) + '.');
    } catch (e) {
      showBackupError('dbx-status', e);
      if (!opts.silent) alert('Dropbox backup failed: ' + e.message);
    }
  }

  async function dbxRestore() {
    if (!confirm('This will merge the Dropbox backup into your local log (existing entries are kept). Continue?')) return;
    try {
      const token = await DROPBOX.ensureValidToken(settings.dropbox, dbxAppKey());
      const json = await DROPBOX.download(token);
      STORE.importAll(json, 'merge');
      settings = STORE.getSettings();
      logs = STORE.getLogs();
      renderPoolSwitcher();
      renderPoolList();
      renderHistory();
      updateBackupStatus();
      alert('Restore complete.');
    } catch (e) {
      showBackupError('dbx-status', e);
      alert('Dropbox restore failed: ' + e.message);
    }
  }

  function dbxDisconnect() {
    DROPBOX.disconnect(settings);
    STORE.saveSettings(settings);
    updateBackupStatus();
  }

  // ---------------- Backup: Google Drive ----------------
  async function gdriveConnect() {
    const clientId = $('#gdrive-client-id').value.trim();
    if (!clientId) return alert('Enter your Google OAuth Client ID first.');
    settings.google.clientId = clientId;
    try {
      const tok = await GDRIVE.connect(clientId);
      settings.google.accessToken = tok.accessToken;
      settings.google.expiresAt = tok.expiresAt;
      STORE.saveSettings(settings);
      updateBackupStatus();
    } catch (e) { showBackupError('gdrive-status', e); }
  }

  async function gdriveBackup() {
    try {
      const token = await GDRIVE.ensureValidToken(settings.google, settings.google.clientId);
      await mergeRemoteLogsBeforeBackup(() => GDRIVE.download(token), e => NOT_FOUND_RE.test(e.message));
      await GDRIVE.upload(token, STORE.exportAll());
      settings.lastBackup.google = new Date().toISOString();
      STORE.saveSettings(settings);
      updateBackupStatus();
      renderHistory();
    } catch (e) { showBackupError('gdrive-status', e); }
  }

  async function gdriveRestore() {
    if (!confirm('This will merge the Google Drive backup into your local log (existing entries are kept). Continue?')) return;
    try {
      const token = await GDRIVE.ensureValidToken(settings.google, settings.google.clientId);
      const json = await GDRIVE.download(token);
      STORE.importAll(json, 'merge');
      settings = STORE.getSettings();
      logs = STORE.getLogs();
      renderPoolSwitcher();
      renderPoolList();
      renderHistory();
      updateBackupStatus();
      alert('Restore complete.');
    } catch (e) { showBackupError('gdrive-status', e); }
  }

  function gdriveDisconnect() {
    GDRIVE.disconnect(settings);
    STORE.saveSettings(settings);
    updateBackupStatus();
  }

  // ---------------- Backup: Microsoft OneDrive ----------------
  async function msConnect() {
    const clientId = $('#ms-client-id').value.trim();
    if (!clientId) return alert('Enter your Microsoft Application (client) ID first.');
    settings.microsoft.clientId = clientId;
    STORE.saveSettings(settings);
    await ONEDRIVE.beginAuth(clientId); // navigates away
  }

  async function msHandleRedirectIfAny() {
    if (!settings.microsoft.clientId) return;
    try {
      const tokens = await ONEDRIVE.handleRedirect(settings.microsoft.clientId);
      if (tokens) {
        settings.microsoft.accessToken = tokens.accessToken;
        settings.microsoft.refreshToken = tokens.refreshToken;
        settings.microsoft.expiresAt = tokens.expiresAt;
        STORE.saveSettings(settings);
        updateBackupStatus();
      }
    } catch (e) {
      showBackupError('ms-status', e);
    }
  }

  async function msBackup() {
    try {
      const token = await ONEDRIVE.ensureValidToken(settings.microsoft, settings.microsoft.clientId);
      await mergeRemoteLogsBeforeBackup(() => ONEDRIVE.download(token), e => NOT_FOUND_RE.test(e.message));
      await ONEDRIVE.upload(token, STORE.exportAll());
      settings.lastBackup.microsoft = new Date().toISOString();
      STORE.saveSettings(settings);
      updateBackupStatus();
      renderHistory();
    } catch (e) { showBackupError('ms-status', e); }
  }

  async function msRestore() {
    if (!confirm('This will merge the OneDrive backup into your local log (existing entries are kept). Continue?')) return;
    try {
      const token = await ONEDRIVE.ensureValidToken(settings.microsoft, settings.microsoft.clientId);
      const json = await ONEDRIVE.download(token);
      STORE.importAll(json, 'merge');
      settings = STORE.getSettings();
      logs = STORE.getLogs();
      renderPoolSwitcher();
      renderPoolList();
      renderHistory();
      updateBackupStatus();
      alert('Restore complete.');
    } catch (e) { showBackupError('ms-status', e); }
  }

  function msDisconnect() {
    ONEDRIVE.disconnect(settings);
    STORE.saveSettings(settings);
    updateBackupStatus();
  }

  // ---------------- Backup: Local folder (File System Access API) ----------------
  // Holds the live FileSystemDirectoryHandle for this page session — the
  // handle itself isn't JSON-serializable, so only its name/connected flag
  // live in settings; the handle is persisted separately via IndexedDB
  // (see localfolder.js) so it survives a reload.
  let localFolderHandle = null;

  async function localFolderInit() {
    const note = $('#localfolder-support-note');
    if (!LOCALFOLDER.supported()) {
      note.textContent = "Not available on this device. Phones and tablets (iOS and Android alike) don't support folder access from a browser — use Dropbox, Google Drive, or OneDrive below instead, or Manual backup/transfer further down.";
      note.style.display = '';
      ['#btn-localfolder-pick', '#btn-localfolder-backup', '#btn-localfolder-restore', '#localfolder-autosave']
        .forEach(sel => $(sel).disabled = true);
      updateLocalFolderStatus(false);
      return;
    }
    note.textContent = '';
    note.style.display = 'none';
    $('#localfolder-autosave').checked = settings.localFolder.autoSave;
    try {
      const handle = await LOCALFOLDER.loadHandle();
      if (handle) {
        localFolderHandle = handle;
        const granted = await LOCALFOLDER.hasPermission(handle);
        updateLocalFolderStatus(granted);
      } else {
        updateLocalFolderStatus(false);
      }
    } catch (e) {
      console.error('Local folder init failed', e);
      updateLocalFolderStatus(false);
    }
  }

  function updateLocalFolderStatus(granted) {
    const el = $('#localfolder-status');
    const reconnectBtn = $('#btn-localfolder-reconnect');
    if (!settings.localFolder.connected || !localFolderHandle) {
      el.textContent = 'No folder chosen.';
      el.classList.remove('ok');
      reconnectBtn.style.display = 'none';
      return;
    }
    if (granted) {
      el.textContent = `Connected: "${settings.localFolder.folderName}".` +
        (settings.lastBackup.localFolder ? ' Last saved: ' + formatDate(settings.lastBackup.localFolder) : '');
      el.classList.add('ok');
      reconnectBtn.style.display = 'none';
    } else {
      el.textContent = `Folder "${settings.localFolder.folderName}" is chosen, but the browser needs you to reconfirm permission (this can happen after a restart).`;
      el.classList.remove('ok');
      reconnectBtn.style.display = '';
    }
  }

  async function localFolderPick() {
    try {
      const handle = await LOCALFOLDER.pickFolder();
      localFolderHandle = handle;
      settings.localFolder.connected = true;
      settings.localFolder.folderName = handle.name;
      STORE.saveSettings(settings);
      updateLocalFolderStatus(true);
    } catch (e) {
      if (e.name !== 'AbortError') showBackupError('localfolder-status', e);
    }
  }

  async function localFolderReconnect() {
    if (!localFolderHandle) return;
    const granted = await LOCALFOLDER.requestPermission(localFolderHandle);
    updateLocalFolderStatus(granted);
  }

  async function localFolderForget() {
    try { await LOCALFOLDER.clearHandle(); } catch (e) { /* ignore */ }
    localFolderHandle = null;
    settings.localFolder = { connected: false, folderName: '', autoSave: settings.localFolder.autoSave };
    STORE.saveSettings(settings);
    updateLocalFolderStatus(false);
  }

  // `opts.silent` is used by the auto-save-after-logging hook: don't pop
  // alerts or permission prompts, just skip quietly if it can't write.
  async function localFolderBackup(opts = {}) {
    if (!localFolderHandle) {
      if (!opts.silent) alert('Choose a folder first.');
      return false;
    }
    let granted = await LOCALFOLDER.hasPermission(localFolderHandle);
    if (!granted) {
      if (opts.silent) { updateLocalFolderStatus(false); return false; }
      granted = await LOCALFOLDER.requestPermission(localFolderHandle);
      if (!granted) {
        showBackupError('localfolder-status', new Error('Permission to write to that folder was denied.'));
        return false;
      }
    }
    try {
      const filename = backupJsonFilename();
      await mergeRemoteLogsBeforeBackup(
        () => LOCALFOLDER.readFile(localFolderHandle, filename),
        e => e.name === 'NotFoundError'
      );
      await LOCALFOLDER.writeFile(localFolderHandle, filename, STORE.exportAll());
      settings.lastBackup.localFolder = new Date().toISOString();
      STORE.saveSettings(settings);
      updateLocalFolderStatus(true);
      renderHistory();
      return true;
    } catch (e) {
      if (!opts.silent) showBackupError('localfolder-status', e);
      return false;
    }
  }

  async function localFolderRestore() {
    if (!localFolderHandle) return alert('Choose a folder first.');
    if (!confirm('This will merge the file in that folder into your local Liquid Ledger (existing entries are kept). Continue?')) return;
    try {
      let granted = await LOCALFOLDER.hasPermission(localFolderHandle);
      if (!granted) granted = await LOCALFOLDER.requestPermission(localFolderHandle);
      if (!granted) throw new Error('Permission to read that folder was denied.');
      const filename = backupJsonFilename();
      const json = await LOCALFOLDER.readFile(localFolderHandle, filename);
      STORE.importAll(json, 'merge');
      settings = STORE.getSettings();
      logs = STORE.getLogs();
      renderPoolSwitcher();
      renderPoolList();
      renderHistory();
      updateLocalFolderStatus(true);
      alert('Restore complete.');
    } catch (e) {
      showBackupError('localfolder-status', e);
    }
  }

  // Pulls the remote backup's log entries (if any) and folds them into the
  // local log BEFORE every upload, so backing up from one device never
  // wipes out entries another device already pushed to the same shared
  // file — each backup becomes "merge, then push the combined result"
  // instead of a blind overwrite. Only log entries are merged this way
  // (not settings), so per-device settings aren't silently overwritten by
  // another device's values on every backup.
  //
  // `downloadFn` is called with no args and should return the remote JSON
  // text (or throw). `isNotFound(e)` identifies the "nothing uploaded yet"
  // case, which is fine to proceed past. Any other error aborts the
  // backup entirely — we'd rather fail loudly than overwrite a remote file
  // we couldn't actually read.
  async function mergeRemoteLogsBeforeBackup(downloadFn, isNotFound) {
    let remoteJson;
    try {
      remoteJson = await downloadFn();
    } catch (e) {
      if (isNotFound(e)) return; // nothing uploaded yet — fine, proceed with local data
      throw e;
    }
    try {
      // Merges log entries for every pool in the remote file (adopting any
      // pool this device doesn't know about yet) into local storage.
      STORE.mergeRemoteBackup(remoteJson);
      settings = STORE.getSettings();
      logs = STORE.getLogs();
      renderPoolSwitcher();
      renderPoolList();
    } catch (e) {
      throw new Error('Could not read the existing backup file to merge it — aborted to avoid overwriting it. (' + e.message + ')');
    }
  }

  const NOT_FOUND_RE = /No backup file found/;

  function showBackupError(elId, e) {
    console.error(e);
    const el = $('#' + elId);
    el.textContent = 'Error: ' + e.message;
    el.classList.add('error');
    setTimeout(() => el.classList.remove('error'), 6000);
  }

  // ---------------- Manual export/import ----------------
  function manualExport() {
    downloadFile(backupJsonFilename(), STORE.exportAll(), 'application/json');
  }
  async function manualImport(file) {
    const confirmed = await showConfirm(
      'Replace local data with this backup?',
      "This loads “" + file.name + "” and makes it the only data on this device: any pool or log entry here that ISN'T in that file gets deleted, and pools that ARE in both get fully replaced by the file's copy. Make sure you have a backup of anything you'd want to keep first.",
      'Import & replace'
    );
    if (!confirmed) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        STORE.importAll(reader.result, 'overwrite');
        settings = STORE.getSettings();
        logs = STORE.getLogs();
        renderHistory();
        populateSettingsForm();
        renderPdfColumnCheckboxes();
        renderPoolSwitcher();
        alert('Import complete — local data now matches the backup file.');
      } catch (e) {
        alert('Could not import that file: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  // ---------------- Backup/export file name (app-wide, like the theme) ----------------
  const FILENAME_KEY = 'pooltest.filenamebase.v1';
  const DEFAULT_FILENAME_BASE = 'liquid-ledger';

  function getFileBase() {
    let saved = '';
    try { saved = (localStorage.getItem(FILENAME_KEY) || '').trim(); } catch (e) {}
    // Strip characters that don't belong in a filename, just in case.
    return (saved || DEFAULT_FILENAME_BASE).replace(/[\\/:*?"<>|]/g, '').trim() || DEFAULT_FILENAME_BASE;
  }
  function backupJsonFilename() { return getFileBase() + '.json'; }
  function backupCsvFilename() { return getFileBase() + '.csv'; }

  function applyFilenamePref() {
    const base = getFileBase();
    DROPBOX.setBackupFilename(base);
    GDRIVE.setBackupFilename(base);
    ONEDRIVE.setBackupFilename(base);
    $('#filename-example-json').textContent = base + '.json';
    $('#filename-example-csv').textContent = base + '.csv';
    $('#dbx-filename-example').textContent = base + '.json';
    $('#gdrive-filename-example').textContent = base + '.json';
    $('#ms-filename-example').textContent = base + '.json';
  }

  function initFilenamePref() {
    let saved = '';
    try { saved = localStorage.getItem(FILENAME_KEY) || ''; } catch (e) {}
    $('#set-filename-base').value = saved;
    applyFilenamePref();
    $('#set-filename-base').addEventListener('change', () => {
      const value = $('#set-filename-base').value.trim();
      try {
        if (value) localStorage.setItem(FILENAME_KEY, value);
        else localStorage.removeItem(FILENAME_KEY);
      } catch (e) {}
      $('#set-filename-base').value = value;
      applyFilenamePref();
    });
  }

  // ---------------- Wire up ----------------
  const THEME_KEY = 'pooltest.theme.v1';

  function applyTheme(value) {
    if (value === 'light' || value === 'dark') {
      document.documentElement.setAttribute('data-theme', value);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function initTheme() {
    let saved = 'system';
    try { saved = localStorage.getItem(THEME_KEY) || 'system'; } catch (e) {}
    $('#set-theme').value = saved;
    applyTheme(saved);
    $('#set-theme').addEventListener('change', () => {
      const value = $('#set-theme').value;
      try { localStorage.setItem(THEME_KEY, value); } catch (e) {}
      applyTheme(value);
    });
  }

  function init() {
    initTheme();
    initFilenamePref();
    initTabs();
    populateSettingsForm();
    populateDesiredDefaults();
    renderHistory();
    startLogClock();
    $('#log-initials').value = settings.defaultInitials || '';
    renderPdfColumnCheckboxes();
    renderPoolSwitcher();
    $('#version-tag').textContent = APP_VERSION;

    $('#btn-calc').addEventListener('click', handleCalculate);
    $('#btn-log').addEventListener('click', handleLog);
    $('#btn-load-latest').addEventListener('click', loadLatestIntoCalculator);
    $('#btn-reset-desired').addEventListener('click', populateDesiredDefaults);
    $('#btn-export-json').addEventListener('click', () => downloadFile(backupJsonFilename(), STORE.exportAll(), 'application/json'));
    $('#btn-export-csv').addEventListener('click', exportCsv);
    $('#btn-pdf-generate').addEventListener('click', generatePdf);
    $('#set-swg').addEventListener('change', () => {
      settings.hasSWG = $('#set-swg').checked;
      populateSettingsForm();
      renderPdfColumnCheckboxes();
    });
    $('#set-environment').addEventListener('change', () => {
      settings.environment = $('#set-environment').value;
      if (settings.environment === 'indoor') settings.enabledChems.cya = false;
      populateSettingsForm();
      renderPdfColumnCheckboxes();
    });
    $('#set-pool-type').addEventListener('change', () => {
      settings.poolType = $('#set-pool-type').value;
      $('#set-gallons-label').textContent = settings.poolType === 'spa' ? 'Spa volume (gallons)' : 'Pool volume (gallons)';
    });
    $('#set-sanitizer-type').addEventListener('change', () => {
      const type = $('#set-sanitizer-type').value;
      settings.sanitizerType = type;
      if (type !== 'other') settings.sanitizerOther = '';
      applySanitizerDefaults(type);
      populateSettingsForm();
      renderPdfColumnCheckboxes();
    });

    $('#btn-save-settings').addEventListener('click', saveSettingsFromForm);
    $('#btn-header-save').addEventListener('click', saveSettingsFromForm);

    $('#pool-switcher').addEventListener('change', (e) => {
      STORE.setActivePool(e.target.value);
      loadActivePool();
    });
    $('#btn-add-pool').addEventListener('click', promptAddPool);
    $('#btn-add-pool-quick').addEventListener('click', promptAddPool);
    $('#set-photo-file').addEventListener('change', (e) => {
      if (e.target.files[0]) handlePhotoFile(e.target.files[0]);
    });
    $('#btn-photo-remove').addEventListener('click', removePhoto);

    $('#btn-dbx-connect').addEventListener('click', dbxConnect);
    $('#btn-dbx-disconnect').addEventListener('click', dbxDisconnect);
    $('#btn-dbx-backup').addEventListener('click', () => dbxBackup());
    $('#btn-dbx-restore').addEventListener('click', dbxRestore);
    $('#dbx-autosave').addEventListener('change', () => {
      settings.dropbox.autoSave = $('#dbx-autosave').checked;
      STORE.saveSettings(settings);
    });

    $('#btn-gdrive-connect').addEventListener('click', gdriveConnect);
    $('#btn-gdrive-disconnect').addEventListener('click', gdriveDisconnect);
    $('#btn-gdrive-backup').addEventListener('click', gdriveBackup);
    $('#btn-gdrive-restore').addEventListener('click', gdriveRestore);

    $('#btn-ms-connect').addEventListener('click', msConnect);
    $('#btn-ms-disconnect').addEventListener('click', msDisconnect);
    $('#btn-ms-backup').addEventListener('click', msBackup);
    $('#btn-ms-restore').addEventListener('click', msRestore);

    $('#history-range').addEventListener('change', renderCharts);

    $('#btn-manual-export').addEventListener('click', manualExport);
    $('#manual-import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = ''; // allow re-picking the same file later (e.g. after Cancel)
      if (file) manualImport(file);
    });

    $('#btn-localfolder-pick').addEventListener('click', localFolderPick);
    $('#btn-localfolder-reconnect').addEventListener('click', localFolderReconnect);
    $('#btn-localfolder-forget').addEventListener('click', localFolderForget);
    $('#btn-localfolder-backup').addEventListener('click', () => localFolderBackup());
    $('#btn-localfolder-restore').addEventListener('click', localFolderRestore);
    $('#localfolder-autosave').addEventListener('change', () => {
      settings.localFolder.autoSave = $('#localfolder-autosave').checked;
      STORE.saveSettings(settings);
    });
    localFolderInit();

    dbxHandleRedirectIfAny().then(() => {
      // If Dropbox auto-sync is on, pull in anything another device added
      // since last time, right when the app opens — not just after typing
      // a new log entry here. Best-effort: dbxBackup() already shows any
      // error in the Backup tab's status line, so there's nothing more to
      // do here on failure.
      if (settings.dropbox.refreshToken && settings.dropbox.autoSave) {
        dbxBackup({ silent: true });
      }
    });
    msHandleRedirectIfAny();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
