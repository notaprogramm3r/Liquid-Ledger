/*
 * Local-folder auto-save, using the browser's File System Access API.
 *
 * This lets the person point the app at a folder on their own computer —
 * typically the folder their Dropbox, Google Drive, OneDrive, or iCloud
 * Drive desktop app already syncs — and have Liquid Assets write the
 * backup file straight into it. No OAuth app, no API key: the cloud sync
 * client handles getting the file to the cloud exactly like it would for
 * any other file dropped in that folder.
 *
 * Only Chromium-based desktop browsers (Chrome, Edge) support this API
 * today. `supported()` reports that so the UI can fall back gracefully.
 *
 * The folder handle itself is stored in IndexedDB (it isn't JSON
 * serializable, so it can't live in localStorage with the rest of
 * settings). The browser may require a fresh user gesture to re-confirm
 * write permission after a restart — callers should handle a denied
 * silent check by showing a one-click "Reconnect" affordance.
 */

const LOCALFOLDER = (() => {
  const DB_NAME = 'liquid-assets-fs';
  const STORE_NAME = 'handles';
  const KEY = 'backup-folder';

  function supported() {
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window) || !('indexedDB' in window)) return false;
    // Some mobile browsers (notably recent versions of Chrome for Android)
    // report showDirectoryPicker as present but don't actually implement a
    // working folder-grant flow — tapping "Choose folder" just silently
    // does nothing, no dialog, no error. Folder access only really works on
    // a desktop browser, so treat any primarily-touchscreen device as
    // unsupported regardless of what feature detection alone says.
    const isTouchPrimary = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (isTouchPrimary) return false;
    return true;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveHandle(handle) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadHandle() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearHandle() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Ask the person to pick a folder. Must be called from a click handler
  // (the browser requires a user gesture for this prompt).
  async function pickFolder() {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveHandle(handle);
    return handle;
  }

  // Checks current permission without prompting. Returns true/false.
  async function hasPermission(handle) {
    if (!handle) return false;
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
  }

  // Re-requests permission — needs a user gesture (call from a click handler).
  async function requestPermission(handle) {
    if (!handle) return false;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  async function writeFile(handle, filename, contents) {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
  }

  async function readFile(handle, filename) {
    const fileHandle = await handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return file.text();
  }

  return {
    supported, pickFolder, loadHandle, clearHandle,
    hasPermission, requestPermission, writeFile, readFile
  };
})();
