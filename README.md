# Liquid Assets — Pool Edition

A self-contained web app (no backend, no accounts with us) that:

1. Calculates how much chlorine/acid/soda ash/baking soda/stabilizer/calcium
   chloride/salt to add to bring your pool back into balance.
2. Logs every test result in the **Liquid Ledger**, stored locally in your
   browser — for as many pools/spas as you want to track, each with its
   own photo, settings, and history.
3. Can back up that ledger straight to **your own** Dropbox, Google Drive,
   or Microsoft OneDrive account — this app never sees or stores your data
   anywhere else.

It's plain HTML/CSS/JS, so it runs today as a website and can later be
wrapped as an installable app (it's already a PWA — "Add to Home Screen"
works) or packaged with something like Capacitor/Electron for an app-store
release, without a rewrite.

## Running it

You can't just double-click `index.html` (OAuth login for Dropbox/Google
requires a real `http://` address, not `file://`). Serve the folder with
any static file server:

```bash
cd pooltest
python3 -m http.server 8080
```

Then open **http://localhost:8080** in your browser. Everything works
offline except the two backup buttons.

When you're ready to put this online for real (for yourself or others to
use), any static host works — GitHub Pages, Netlify, Vercel, S3, your own
server. Nothing here needs a database or backend.

## Using it

- **Pool switcher (header)** — a dropdown next to the logo switches between
  pools if you've added more than one; shows a thumbnail of that pool's
  photo if it has one. Manage pools (add, switch, delete) from Settings.
- **Liquid Ledger tab** — log today's readings and (optionally) your
  initials and a corrective action taken. Timestamped automatically the
  moment you save — not editable, not backdatable. Just records what you
  measured; doesn't calculate anything. If a saved reading is outside its
  target range and you left "Corrective action taken" blank, a small
  reminder appears underneath — it never blocks saving, it just nudges.
- **Calculator tab** — enter (or load from the Ledger) a Current reading
  and a Desired reading per chemical, hit *Calculate dosing* to see what
  to add. Doesn't touch your ledger. Chemicals are listed, and results
  given, in the recommended order to adjust them: Total Alkalinity →
  Calcium Hardness → Cyanuric Acid → pH → Salt → Chlorine last. This order
  is fixed — it's a chemistry recommendation, not a display preference —
  and is independent of the Log form's test order below.
- **History tab** — table of past entries, small trend charts (with a
  **Chart view** selector: Daily shows every entry, Weekly/Monthly average
  readings into buckets for a smoother long-term trend), CSV/JSON export,
  and a PDF export panel (pick a date range and which columns to include,
  then use your browser's "Save as PDF" in the print dialog).
- **Settings tab** — "Your pools" to add/switch/delete pools; a photo for
  the active pool; pool name; **Order of tests** (reorder with Up/Down
  buttons — controls the Log form, History table/CSV/PDF columns, and
  charts; defaults to Free Chlorine, pH, then the rest of the chlorine
  family, then everything else); **Type** (Pool/Spa — just changes wording,
  e.g. "Spa volume" and "Spa Test Report"); **Environment** (Outdoor/Indoor
  — Indoor forces Cyanuric Acid off everywhere, since indoor pools have no
  sunlight/UV to protect against); gallon volume; whether you have a
  saltwater chlorinator (adds the Salt field); which chlorine product you
  prefer to dose with; which tests to track (hide ones you don't use, or
  turn on Water Temperature, Total Chlorine, Combined Chlorine); two
  nameable numeric custom fields; default initials; and the target range
  for every tracked value including named custom fields (defaults are
  commonly recommended ranges — adjust to taste; readings outside range
  show as red points *and* a red background band on the History charts).
- **Backup tab** — connect your own Dropbox, Google Drive, and/or Microsoft
  OneDrive (see below), or just download/import a JSON file by hand. There's
  also a note about Apple iCloud Drive (see below). A backup file carries
  *every* pool, not just the one you're currently viewing.
- **Rules tab** — a reference page on what state/county health departments
  commonly require for *public/commercial* pool testing and recordkeeping
  (testing frequency, ranges, retention), with sources. Informational only
  — not legal advice, and only relevant if you operate a regulated
  facility; a private residential pool isn't subject to any of it.

All the dosing math (see `js/chem.js`) uses the standard rule-of-thumb
figures used across the pool-care community (Trouble Free Pool / PoolMath
style). They're good planning estimates, not lab-exact — always add
chemicals gradually and retest.

## Do you need a Dropbox/Google "API," or can you just log in?

Depends which backup method you use — there are now three, in order of
how little setup they need:

1. **Local folder (recommended)** — point the app at a folder your
   computer already syncs (your Dropbox folder, Google Drive folder,
   OneDrive, iCloud Drive, whatever). The app writes the backup file
   straight into it using the browser's **File System Access API**, and
   your existing sync client takes it from there, exactly like it would
   for any other file you dropped in that folder. **No API key, no app to
   register, no login inside this app at all.** Click "Choose folder…" on
   the Backup tab, pick the folder, done. The only catch: this browser API
   is Chrome/Edge desktop only (not Firefox/Safari, not mobile yet) — the
   app detects this and tells you if it's unavailable.
2. **Manual export/import** — works in every browser. Download a JSON
   file, drag it into your synced folder yourself (or import one back).
   No API, no login.
3. **Dropbox/Google/Microsoft "Connect" buttons** — true direct-to-cloud
   sync without a local synced folder at all. These *do* require registering
   a free app/API client once, because Dropbox, Google, and Microsoft don't
   let a plain web page sign someone in with just a password — they require
   "OAuth," where some registered application asks for permission and gets
   handed a token. Since this project has no server of its own, *you*
   register that application, under your own account, for free. It's a
   one-time ~2–5 minute setup (steps below), not a recurring cost — closer
   to generating a password-manager entry than standing up infrastructure.

**What about Apple/iCloud Drive?** Apple doesn't offer a public web API for
iCloud Drive the way Dropbox/Google/Microsoft do — integrating with it
requires a native app with Apple Developer Program entitlements, which a
static web page can't do. The good news: option 1 above (Local folder)
already covers it — on a Mac, just pick your iCloud Drive folder there and
it works exactly the same as any other synced folder.

If you already have Dropbox or Google Drive syncing a folder on your
computer, option 1 gets you the same end result as option 3 with none of
the setup — that's why it's listed first on the Backup tab.

## Setting up local folder auto-save (easiest — ~10 seconds)

1. Open the **Backup** tab.
2. Click **Choose folder…** and pick your synced Dropbox/Google
   Drive/OneDrive/iCloud Drive folder (or any folder — it doesn't have to
   be synced, but that's the point of this option).
3. Leave **Auto-save after every log entry** checked (it's on by default).

From then on, every time you save a test to the Liquid Ledger, the app
writes `liquid-ledger-backup.json` into that folder. Your sync client
uploads it like any other file. Use **Save now** / **Load from folder**
for a manual push/pull any time.

A couple of things worth knowing:
- The browser may ask you to reconfirm permission after restarting it —
  if so, a **Reconnect** button appears; one click and you're back.
- The chosen folder is remembered per browser profile. If you clear site
  data, switch browsers, or move to a different computer, you'll need to
  choose the folder again there.

## Setting up your own Dropbox backup (one-time, ~2 minutes)

1. Go to https://www.dropbox.com/developers/apps → **Create app**.
2. Choose **Scoped access**, **App folder** or **Full Dropbox** (App folder
   is more restrictive/private — recommended), give it any name.
3. In the app's **Settings** tab, under **OAuth 2** → **Redirect URIs**,
   add the exact URL you'll run this app at, e.g.
   `http://localhost:8080/index.html` (must match exactly, including
   trailing slash or lack thereof).
4. Copy the **App key** shown at the top of the Settings tab.
5. In Liquid Assets → Backup tab, paste it into "Your Dropbox App Key,"
   click **Connect Dropbox**, and approve access.
6. Click **Back up now** any time to push your ledger to
   `/liquid-ledger-backup.json` in your Dropbox.

## Setting up your own Google Drive backup (one-time, ~5 minutes)

1. Go to https://console.cloud.google.com/ → create a project (or use an
   existing one).
2. **APIs & Services → Library** → enable the **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → set it up as **External**
   (you can leave it in "Testing" mode and add your own Google account as
   a test user — no Google review needed for personal use).
4. **APIs & Services → Credentials → Create Credentials → OAuth client
   ID** → Application type **Web application**.
5. Under **Authorized JavaScript origins**, add the origin you'll run this
   app at, e.g. `http://localhost:8080`.
6. Copy the **Client ID**.
7. In Liquid Assets → Backup tab, paste it into "Your Google OAuth Client
   ID," click **Connect Google Drive**, and approve access.
8. Click **Back up now** any time — it creates/updates a normal, visible
   file named `liquid-ledger-backup.json` in your Drive (the app only asks
   for the restricted "files it created" permission, not your whole
   Drive).

## Setting up your own Microsoft OneDrive backup (one-time, ~5 minutes)

1. Go to https://portal.azure.com/ → **Azure Active Directory** (or
   **Microsoft Entra ID**) → **App registrations** → **New registration**.
2. Give it any name. Under **Supported account types**, choose
   **Accounts in any organizational directory and personal Microsoft
   accounts** (so this works with a plain outlook.com/hotmail.com account,
   not just work/school).
3. Under **Redirect URI**, choose platform **Single-page application
   (SPA)** and enter the exact URL you'll run this app at, e.g.
   `http://localhost:8080/index.html`.
4. After creating it, copy the **Application (client) ID** from the
   Overview page. No client secret is needed — this uses the same
   no-secret PKCE flow as Dropbox.
5. In Liquid Assets → Backup tab, paste it into "Your Microsoft Application
   (client) ID," click **Connect OneDrive**, and approve access.
6. Click **Back up now** any time to push your ledger to
   `liquid-ledger-backup.json` inside an app-only folder in your OneDrive
   (the app only asks for `Files.ReadWrite.AppFolder` — it can't see the
   rest of your Drive).

If you move the app to a different URL later (e.g. once it's hosted
somewhere permanent), add that URL as an additional redirect URI /
JavaScript origin in the Dropbox, Google, and Microsoft settings above.

## Versioning

The version shown in the app's footer comes from `js/version.js`. As of
this release, versions are **"Alpha X.YY"** and go up by **0.01** each
release — e.g. Alpha 1.2 → Alpha 1.21 → Alpha 1.22 → … → Alpha 1.30 →
Alpha 1.31. (Earlier releases used `MAJOR.MINOR.PATCH`, up through v1.8.0.)
Every release bumps `APP_VERSION` in `js/version.js`, bumps `CACHE_NAME` in
`sw.js` (so installed/offline copies pick up the update instead of serving
a stale cache), and gets an entry in `CHANGELOG.md`. Delivered zip files
are named `pooltest-alpha-X.YY.zip` so you can tell which copy is which.

## Multiple pools & migration

Liquid Assets stores each pool's settings and log history under its own
key in `localStorage`, with a small index of pool ids and a pointer to
whichever one is "active" (shown in the UI right now). If you're upgrading
from a version before this one (anything through v1.8.0), your existing
single pool's data is migrated into a proper pool automatically, the very
first time you open the upgraded app — nothing to do, and nothing is
lost. The original flat `pooltest.settings.v1` / `pooltest.logs.v1` keys
are left in place afterward too (unused, but harmless) as an extra safety
net.

## Project structure

```
pooltest/
  index.html       Page layout (Liquid Ledger / Calculator / History / Backup / Settings tabs)
  style.css        Styling
  manifest.json    PWA manifest (installable, app icon, theme color)
  sw.js            Service worker — caches the app shell for offline use
  CHANGELOG.md     What changed in each version
  js/
    version.js     Current app version (shown in the footer)
    chem.js        Dosing calculator (pure functions, no DOM)
    storage.js     localStorage read/write for settings + the Liquid Ledger
    localfolder.js Local-folder auto-save (File System Access API)
    dropbox.js     Dropbox OAuth (PKCE) + upload/download
    gdrive.js      Google Drive OAuth (Identity Services) + upload/download
    onedrive.js    Microsoft OneDrive OAuth (PKCE) + upload/download
    app.js         UI wiring — ties everything above together
  icons/           App icons for the PWA / home-screen install
```

## Sharing it with others

Because each person connects their own Dropbox/Google/OneDrive account (you
never see their credentials or data), this app can be handed to other pool
owners as-is — host it somewhere and send the link, or give them the folder
to run locally. Each user just does their own one-time setup above under
their own account.

**Multiple people/devices logging to the same backup file:** every backup
(cloud or local-folder) reads what's already in the shared file first and
merges in any entries it doesn't already have, before uploading the
combined result — so two people pointed at the same file won't silently
erase each other's log entries. This extends across pools too: a backup
file carries every pool, and if it contains a pool your device has never
seen (someone else's pool, or one you added on another device), your
device adopts it automatically instead of ignoring it. There's still no
real-time sync or conflict resolution, though: each device's own view only
updates when you hit Backup (or Restore), so it's "merge on every backup,"
not "always instantly in sync." Log entries also can't be deleted from the
app, which keeps a shared log trustworthy.

## Ideas for later

- More chlorine sources (bleach %, pucks by brand) and a shock calculator.
- LSI (Langelier Saturation Index) scaling/corrosion indicator using CH +
  TA + pH + temperature + salt.
- Reminders/notifications for regular testing.
- A packaged mobile app (Capacitor) or desktop app (Electron/Tauri) built
  from this same code, once you're ready to distribute beyond the browser.
- More "Liquid Assets" apps sharing the same brand/backup approach.
