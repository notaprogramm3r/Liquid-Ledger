/*
 * Dropbox backup — client-side only, PKCE OAuth flow.
 *
 * Liquid Ledger ships with its own built-in Dropbox app (DEFAULT_APP_KEY
 * below) so "Connect Dropbox" works for anyone with zero setup — they just
 * log into their OWN Dropbox account, same as any app that offers "Sign in
 * with Dropbox." The App Key below is a public client identifier, not a
 * secret (there is no secret in this flow at all — see the PKCE note
 * below) — it's fine for it to live in this public source file. Each
 * person's actual data goes into a private "app folder" inside THEIR OWN
 * Dropbox, isolated from every other person's — this key never grants
 * access to anyone else's account or files.
 *
 * Advanced users can still register their OWN Dropbox app instead (free,
 * at https://www.dropbox.com/developers/apps) and paste its App Key into
 * the "Advanced" section in Settings — that overrides the built-in one.
 * Tokens are stored only in this browser's localStorage and used to talk
 * directly to Dropbox's API — this project never sees or relays the data.
 *
 * Uses the "Scoped App, PKCE, no secret" flow, which is safe for a pure
 * static/client-side app (no server needed to keep a secret).
 */

const DROPBOX = (() => {
  // Liquid Ledger's own shared Dropbox app key — see the file comment above.
  const DEFAULT_APP_KEY = '7obpxr3in0s23qw';
  let BACKUP_FILENAME = '/liquid-ledger.json';
  const VERIFIER_KEY = 'pooltest.dropbox.verifier';

  function setBackupFilename(base) { BACKUP_FILENAME = '/' + base + '.json'; }
  function getBackupFilename() { return BACKUP_FILENAME; }
  function getDefaultAppKey() { return DEFAULT_APP_KEY; }

  function redirectUri() {
    // Must exactly match a "Redirect URI" registered in the Dropbox app
    // console, character for character. Normalized so the SAME value
    // results no matter how this page was reached — as the bare folder
    // URL with or without a trailing slash (e.g. typed in a browser), or
    // as "...index.html" (e.g. an installed home-screen app's start_url)
    // — otherwise connecting works from one and silently fails from
    // another with a redirect_uri mismatch. Always ends in "/".
    let path = window.location.pathname;
    if (path.endsWith('/index.html')) path = path.slice(0, -'index.html'.length);
    if (!path.endsWith('/')) path += '/';
    return window.location.origin + path;
  }

  function randomString(len = 64) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => ('0' + b.toString(16)).slice(-2)).join('').slice(0, len);
  }

  async function sha256Base64Url(str) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    let bin = '';
    new Uint8Array(hash).forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function beginAuth(appKey) {
    const verifier = randomString(64);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    const challenge = await sha256Base64Url(verifier);
    const params = new URLSearchParams({
      client_id: appKey,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri(),
      token_access_type: 'offline'
    });
    window.location.href = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  // Call on page load. Returns tokens if the URL contains an OAuth ?code=
  // AND it's this service's own pending verifier (another connected
  // service, e.g. OneDrive, may have left its own ?code= instead) — in
  // that case returns null without touching the URL, so the right
  // handler can still consume it. Cleans the URL afterward on success.
  async function handleRedirect(appKey) {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDesc = url.searchParams.get('error_description');
    if (!code && !error) return null;
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!verifier) return null; // not our redirect
    sessionStorage.removeItem(VERIFIER_KEY);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, document.title, url.pathname + url.search);

    // Dropbox sends ?error=... instead of ?code=... when something went
    // wrong (most often a redirect_uri that doesn't exactly match what's
    // registered in the app console) — surface it instead of silently
    // staying "Not connected" with no explanation.
    if (error) throw new Error("Dropbox sign-in didn't complete: " + (errorDesc || error));

    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: appKey,
      redirect_uri: redirectUri(),
      code_verifier: verifier
    });
    const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!resp.ok) throw new Error('Dropbox token exchange failed: ' + await resp.text());
    const json = await resp.json();
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + (json.expires_in * 1000)
    };
  }

  async function refreshAccessToken(appKey, refreshToken) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey
    });
    const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!resp.ok) throw new Error('Dropbox token refresh failed: ' + await resp.text());
    const json = await resp.json();
    return {
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in * 1000)
    };
  }

  async function ensureValidToken(dropboxSettings, appKey) {
    if (dropboxSettings.accessToken && dropboxSettings.expiresAt > Date.now() + 60000) {
      return dropboxSettings.accessToken;
    }
    if (!dropboxSettings.refreshToken) throw new Error('Not connected to Dropbox yet.');
    const { accessToken, expiresAt } = await refreshAccessToken(appKey, dropboxSettings.refreshToken);
    dropboxSettings.accessToken = accessToken;
    dropboxSettings.expiresAt = expiresAt;
    return accessToken;
  }

  async function upload(accessToken, jsonString) {
    const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: BACKUP_FILENAME,
          mode: 'overwrite',
          mute: true
        }),
        'Content-Type': 'application/octet-stream'
      },
      body: jsonString
    });
    if (!resp.ok) throw new Error('Dropbox upload failed: ' + await resp.text());
    return resp.json();
  }

  async function download(accessToken) {
    const resp = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: BACKUP_FILENAME })
      }
    });
    if (resp.status === 409) throw new Error('No backup file found in Dropbox yet.');
    if (!resp.ok) throw new Error('Dropbox download failed: ' + await resp.text());
    return resp.text();
  }

  function disconnect(settings) {
    settings.dropbox = { appKey: settings.dropbox.appKey, accessToken: '', refreshToken: '', expiresAt: 0 };
  }

  return { beginAuth, handleRedirect, ensureValidToken, upload, download, disconnect, setBackupFilename, getBackupFilename, redirectUri, getDefaultAppKey };
})();
