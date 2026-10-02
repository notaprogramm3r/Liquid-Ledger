/*
 * Google Drive backup — client-side only, using Google Identity Services
 * (GIS) token client.
 *
 * The user registers their OWN Google Cloud OAuth Client ID (free, at
 * https://console.cloud.google.com/apis/credentials) and pastes it into
 * Settings. We request only the `drive.file` scope, which means the app
 * can only see/edit files IT created — not the user's whole Drive — and
 * the backup file is a normal visible file in their Drive that they can
 * find, open, or delete themselves at any time.
 */

const GDRIVE = (() => {
  let BACKUP_FILENAME = 'liquid-ledger.json';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';

  function setBackupFilename(base) { BACKUP_FILENAME = base + '.json'; }
  function getBackupFilename() { return BACKUP_FILENAME; }
  let tokenClient = null;
  let gisLoaded = false;

  function loadGis() {
    return new Promise((resolve, reject) => {
      if (gisLoaded && window.google && window.google.accounts) return resolve();
      const existing = document.getElementById('gis-script');
      if (existing) {
        existing.addEventListener('load', () => { gisLoaded = true; resolve(); });
        return;
      }
      const script = document.createElement('script');
      script.id = 'gis-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => { gisLoaded = true; resolve(); };
      script.onerror = () => reject(new Error('Could not load Google Identity Services (are you online?)'));
      document.head.appendChild(script);
    });
  }

  // Opens Google's consent popup. Resolves with { accessToken, expiresAt }.
  async function connect(clientId) {
    await loadGis();
    return new Promise((resolve, reject) => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error) return reject(new Error('Google sign-in failed: ' + resp.error));
            resolve({
              accessToken: resp.access_token,
              expiresAt: Date.now() + (Number(resp.expires_in || 3600) * 1000)
            });
          }
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function ensureValidToken(googleSettings, clientId) {
    if (googleSettings.accessToken && googleSettings.expiresAt > Date.now() + 60000) {
      return googleSettings.accessToken;
    }
    // GIS token clients don't give refresh tokens for pure client-side apps;
    // silently re-request (may or may not need a popup depending on browser state).
    await loadGis();
    return new Promise((resolve, reject) => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error) return reject(new Error('Google session expired — please reconnect in Settings.'));
            googleSettings.accessToken = resp.access_token;
            googleSettings.expiresAt = Date.now() + (Number(resp.expires_in || 3600) * 1000);
            resolve(googleSettings.accessToken);
          }
        });
        tokenClient.requestAccessToken({ prompt: '' });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function findBackupFileId(accessToken) {
    const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resp.ok) throw new Error('Google Drive search failed: ' + await resp.text());
    const json = await resp.json();
    return json.files && json.files.length ? json.files[0].id : null;
  }

  async function upload(accessToken, jsonString) {
    const existingId = await findBackupFileId(accessToken);
    const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json' };
    const boundary = 'poolAppBoundary';
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonString}\r\n` +
      `--${boundary}--`;

    const url = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const resp = await fetch(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });
    if (!resp.ok) throw new Error('Google Drive upload failed: ' + await resp.text());
    return resp.json();
  }

  async function download(accessToken) {
    const id = await findBackupFileId(accessToken);
    if (!id) throw new Error('No backup file found in Google Drive yet.');
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resp.ok) throw new Error('Google Drive download failed: ' + await resp.text());
    return resp.text();
  }

  function disconnect(settings) {
    settings.google = { clientId: settings.google.clientId, accessToken: '', expiresAt: 0 };
  }

  return { connect, ensureValidToken, upload, download, disconnect, setBackupFilename, getBackupFilename };
})();
