/*
 * Microsoft OneDrive backup — client-side only, PKCE OAuth flow against
 * the Microsoft identity platform, same pattern as dropbox.js.
 *
 * The user registers their OWN free Azure app registration (works for
 * personal Microsoft accounts too, not just work/school ones) and pastes
 * the Application (client) ID into Settings. We request only
 * `Files.ReadWrite.AppFolder`, which limits this app to its own special
 * "Apps/Liquid Ledger" folder inside the user's OneDrive — not their
 * whole Drive — via the Microsoft Graph API's "approot" shortcut.
 */

const ONEDRIVE = (() => {
  let BACKUP_FILENAME = 'liquid-ledger.json';
  const SCOPES = 'offline_access Files.ReadWrite.AppFolder';
  const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
  const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const VERIFIER_KEY = 'pooltest.onedrive.verifier';

  function setBackupFilename(base) { BACKUP_FILENAME = base + '.json'; }
  function getBackupFilename() { return BACKUP_FILENAME; }
  function graphFileUrl() { return `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${BACKUP_FILENAME}:/content`; }

  function redirectUri() {
    // Normalized the same way as dropbox.js — see the comment there. Keeps
    // this identical whether opened as the bare folder URL (with or
    // without a trailing slash) or "...index.html" (an installed
    // home-screen app's start_url), so connecting doesn't silently fail
    // depending on how the page was reached. Always ends in "/".
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

  async function beginAuth(clientId) {
    const verifier = randomString(64);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    const challenge = await sha256Base64Url(verifier);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      response_mode: 'query',
      redirect_uri: redirectUri(),
      scope: SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });
    window.location.href = `${AUTH_URL}?${params.toString()}`;
  }

  async function handleRedirect(clientId) {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDesc = url.searchParams.get('error_description');
    // Dropbox and OneDrive both land back with a bare ?code=, so only the
    // caller that still has a pending verifier for ITS flow should consume
    // it — handled by app.js checking which service initiated the redirect.
    if (!code && !error) return null;
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!verifier) return null; // not our redirect (e.g. Dropbox's)
    sessionStorage.removeItem(VERIFIER_KEY);
    url.searchParams.delete('code');
    url.searchParams.delete('session_state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, document.title, url.pathname + url.search);

    // Microsoft sends ?error=... instead of ?code=... when something went
    // wrong (most often a redirect URI that doesn't exactly match what's
    // registered in the Azure app) — surface it instead of silently
    // staying "Not connected" with no explanation.
    if (error) throw new Error("Microsoft sign-in didn't complete: " + (errorDesc || error));

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
      scope: SCOPES
    });
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!resp.ok) throw new Error('Microsoft token exchange failed: ' + await resp.text());
    const json = await resp.json();
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + (json.expires_in * 1000)
    };
  }

  async function refreshAccessToken(clientId, refreshToken) {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES
    });
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!resp.ok) throw new Error('Microsoft token refresh failed: ' + await resp.text());
    const json = await resp.json();
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || refreshToken,
      expiresAt: Date.now() + (json.expires_in * 1000)
    };
  }

  async function ensureValidToken(msSettings, clientId) {
    if (msSettings.accessToken && msSettings.expiresAt > Date.now() + 60000) {
      return msSettings.accessToken;
    }
    if (!msSettings.refreshToken) throw new Error('Not connected to OneDrive yet.');
    const { accessToken, refreshToken, expiresAt } = await refreshAccessToken(clientId, msSettings.refreshToken);
    msSettings.accessToken = accessToken;
    msSettings.refreshToken = refreshToken;
    msSettings.expiresAt = expiresAt;
    return accessToken;
  }

  async function upload(accessToken, jsonString) {
    const resp = await fetch(graphFileUrl(), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: jsonString
    });
    if (!resp.ok) throw new Error('OneDrive upload failed: ' + await resp.text());
    return resp.json();
  }

  async function download(accessToken) {
    const resp = await fetch(graphFileUrl(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (resp.status === 404) throw new Error('No backup file found in OneDrive yet.');
    if (!resp.ok) throw new Error('OneDrive download failed: ' + await resp.text());
    return resp.text();
  }

  function disconnect(settings) {
    settings.microsoft = { clientId: settings.microsoft.clientId, accessToken: '', refreshToken: '', expiresAt: 0 };
  }

  return { beginAuth, handleRedirect, ensureValidToken, upload, download, disconnect, setBackupFilename, getBackupFilename, redirectUri };
})();
