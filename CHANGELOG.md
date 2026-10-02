# Changelog

All notable changes to **Liquid Assets — Pool Edition** are listed here.

**Versioning scheme change (this release):** starting now, versions are
"Alpha X.YY" and go up by 0.01 each release (Alpha 1.2 → Alpha 1.21 →
Alpha 1.22 → ... → Alpha 1.30 → Alpha 1.31, etc.), replacing the earlier
`MAJOR.MINOR.PATCH` scheme used through v1.8.0 below.

## Alpha 1.28 — 2026-10-02

- **Header now stays pinned to the top** of the screen as you scroll, on
  every tab — handy on the longer pages (History, Settings, Rules).
- **"Save changes" button added to the header**, shown only while you're
  on the Settings tab, so you don't have to scroll to the bottom to save.
  It's seafoam green — a different color from the yellow primary buttons
  used elsewhere — so it reads as its own "save my settings" action rather
  than blending in.
- **Deleting a pool now shows a clear, styled warning** (replacing the
  plain browser pop-up) naming the pool and exactly how many logged
  entries will be permanently lost, with Cancel and Delete buttons.

## Alpha 1.27 — 2026-10-02

- **Renamed the app to Liquid Ledger** (was "Liquid Assets — Pool Edition").
  Updated everywhere a user sees it: the header, browser tab title, the
  installed app's name (so the home-screen icon label matches), the
  footer, and the Rules tab disclaimer.
- Removed the "Pool Edition" subtitle under the header logo (it used to
  show the active pool's name there too — that's already shown in the
  pool switcher next to it, so it was redundant).
- The "Save to Liquid Ledger" button on the New Entry tab now just says
  **"Save to Log"**.

## Alpha 1.26 — 2026-10-02

- **New app icon** matching the tropical blue/yellow redesign — the droplet
  mark on a bright ocean-blue gradient, replacing the old plain-blue circle
  icon. Used for the home-screen icon, the browser tab, and (new) the
  Android app icon.
- **Android-app groundwork.** Added a manifest `id` and `categories` so the
  app packages cleanly as an installable/Play-Store Android app via a
  Trusted Web Activity (e.g. with PWABuilder) — no code changes needed
  beyond the manifest, since this was already a installable PWA.
- **New "Sharing a pool with other people" note on the Backup tab**,
  documenting the existing merge-on-backup behavior as the supported way
  for multiple people to log the same pool: connect everyone to the same
  backup destination (Dropbox/Drive/OneDrive/local folder) and entries
  merge automatically instead of overwriting.

## Alpha 1.25 — 2026-10-02

- **Brighter, tropical blue-and-yellow palette.** Replaced the 1.24 teal
  theme with a more vivid, sunnier one — bright ocean blue as the primary
  color, a warm sunshine yellow as the accent (primary buttons, the active
  tab's underline, the droplet mark's highlight), and brighter coral/amber/
  seafoam status colors. History trend charts now pick up these colors live
  from the current theme instead of fixed hex values, so they match in both
  light and dark mode.
- **Dark theme setting.** New "Appearance" card at the top of Settings with
  a Theme choice — Match device (default), Light, or Dark — that overrides
  the OS-level preference and applies instantly, with no flash on reload.
  This is a single app-wide preference, not per-pool.

## Alpha 1.24 — 2026-10-02

- **Visual redesign.** New look across the whole app: a teal/coral/amber/
  seafoam color system (replacing the old plain blue), a custom droplet
  mark in the header in place of the 💧 emoji, a refined segmented-control
  tab bar, softer tinted shadows on cards, teal focus rings on inputs and
  buttons, tabular numerals on readouts and tables, and hover/pressed
  states throughout. Out-of-range badges, dose results, and the Rules-tab
  disclaimer now use the new coral/amber/seafoam status colors instead of
  generic red/orange/green. Respects reduced-motion preferences and adds
  visible keyboard-focus outlines. No functional changes — same features,
  same data, same screens, just sharper.

## Alpha 1.23 — 2026-10-02

- Renamed top-nav tabs: "Pool Logs" (the log-entry form) → **New Entry**;
  "History" → **Pool Logs**. Menu order unchanged: New Entry, Pool Logs,
  Backup, Settings, Rules, Calculator (beta).

## Alpha 1.22 — 2026-10-02

- **Reorganized the top navigation menu.** "Liquid Ledger" renamed to
  **Pool Logs**. New order: Pool Logs, History, Backup, Settings, Rules,
  **Calculator (beta)** — Calculator moved to the last position and marked
  beta.

## Alpha 1.21 — 2026-10-02

- **Order of tests is now user-configurable.** New "Order of tests" section
  in Settings — reorder with Up/Down buttons, applies live to the Log form
  and carries through to the History table, CSV/PDF columns, and charts.
  Includes every test (even hidden ones, marked "not tracked") so the
  order is preserved if you turn one back on later. The default order is
  now Free Chlorine, then pH, then the rest of the chlorine family (Total
  Chlorine, Combined Chlorine), then everything else. The Calculator keeps
  its own separate, fixed order (Total Alkalinity → Calcium Hardness →
  Cyanuric Acid → pH → Salt → Chlorine last) since that reflects the
  recommended chemical-*adjustment* sequence, not the order you *test* in
  — reordering your tests doesn't change dosing order.
- **Nebraska added to the Rules tab**, alongside California, Texas, Rhode
  Island, and New York.
- Changed the pool-name field's example placeholder from "The Meyers Pool"
  to "Main Pool".

## Alpha 1.2 — 2026-10-02

- **Total Chlorine and Combined Chlorine tracking.** Two new opt-in tests
  (Settings → "Which tests to track"), each with their own target range.
  If you track both and log a Total Chlorine reading without typing in
  Combined Chlorine, it's auto-filled as Total − Free (the standard way
  combined chlorine/chloramines is derived) — still editable if you
  measured it directly.
- **Corrective action field.** A new "Corrective action taken" field on
  the Log tab (always visible, included in History/CSV/PDF). If a saved
  reading is outside its target range and this was left blank, a
  non-blocking reminder appears under the field — it never stops the log
  from saving, it just nudges. This mirrors what most public-pool codes
  expect to see documented (see the new Rules tab below).
- **Rules tab.** A new reference tab summarizing state/county public-pool
  testing requirements researched for this app — what's commonly tested,
  typical acceptable ranges, testing frequency and record-retention
  examples from California, Texas, Rhode Island, and New York, plus
  sources. Clearly marked as general information, not legal advice, and
  only relevant to regulated public/commercial pools, not private
  residential ones.
- **Pool photos.** Each pool can have a photo (Settings → Pool), resized
  and compressed client-side before it's stored, shown as a thumbnail in
  the header's pool switcher and in the pool-management list.
- **Multiple pools.** Liquid Assets now supports tracking more than one
  pool/spa from the same browser — each with its own settings, target
  ranges, and Liquid Ledger history. A new pool switcher in the header
  lets you jump between them, and a "Your pools" section in Settings lets
  you add, switch, or delete one (at least one pool always remains).
  Backups now carry every pool in one file, and the merge-on-backup
  behavior from the previous release extends to this: a device that
  doesn't recognize a pool from a shared backup adopts it automatically
  instead of ignoring or overwriting it. **Existing installs are migrated
  automatically** — your current pool's settings and history become your
  first pool the first time you open this version; nothing is lost, and
  the original data is left in place under the old storage key as a
  safety net.

## v1.8.0 — 2026-10-02

- **Backups now merge instead of overwrite.** Every backup (Dropbox, Google
  Drive, OneDrive, and Local folder — including auto-save) now reads
  whatever's already in the shared file first, folds any log entries it
  doesn't already have into the local log, and only then uploads the
  combined result. Previously a backup pushed your local data as-is,
  which meant two people (or two devices) sharing the same backup file
  could silently erase each other's entries if one backed up without
  restoring first. If the existing remote file can't be read for some
  other reason (network/auth problem), the backup now aborts with an
  error instead of risking an overwrite. Settings aren't merged this way
  (each device/person keeps its own Settings) — just log entries.
- **Log entries can no longer be deleted.** Removed the "✕" delete button
  from the History table. The Liquid Ledger is now an append-only record,
  which matters more now that it's safe to share one backup file across
  multiple people — no one can quietly remove another person's entry.

## v1.7.0 — 2026-10-01

- **Indoor/outdoor pools.** New "Environment" setting. Indoor pools get no
  sunlight/UV, so stabilizer isn't needed — setting Environment to Indoor
  forces Cyanuric Acid off everywhere (Log, Calculator, History, PDF, and
  its Settings checkbox is disabled with a note) regardless of the CYA
  checkbox's saved state.
- **Pool vs Spa.** New "Type" setting (Pool/Spa). Only changes wording — the
  gallons field relabels to "Spa volume," and the PDF report title/meta say
  "Spa Test Report"/"Spa volume" instead of "Pool."
- **Target ranges for every field, including custom ones.** The Settings
  "Target ranges" table now includes a row for each named custom field
  (previously only the built-in chemicals/temperature had one), so
  out-of-range coloring and red chart bands work for custom fields too.
  Custom fields are now numeric inputs instead of free text, to support
  this.
- **Microsoft OneDrive backup.** New card on the Backup tab, mirroring the
  Dropbox/Google Drive ones: paste your own free Azure app registration's
  Client ID, connect, and back up/restore a `liquid-ledger-backup.json`
  file in an app-only OneDrive folder. Same client-side PKCE OAuth
  approach — no server, your own credentials.
- **Apple iCloud Drive.** Investigated — Apple has no public web API
  comparable to Dropbox/Google/Microsoft's (it requires a native app with
  special entitlements). Added an explanatory card on the Backup tab
  instead: iCloud Drive already works through the existing **Local
  folder** option, since that's just picking a synced folder on disk.
- **Red out-of-range chart backgrounds.** History trend charts now shade
  the zones above and below the target range in red (not just the dots),
  so an out-of-range stretch is obvious at a glance, not just individual
  points.
- **History chart range selector.** New "Chart view" dropdown above the
  History charts: Daily (every entry, the default), Weekly, or Monthly —
  the latter two average readings into calendar-week/month buckets for a
  smoother long-term trend.

## v1.6.0 — 2026-10-01

- **Settings: choose which tests to track.** New checkboxes for Total
  Alkalinity, Calcium Hardness, Cyanuric Acid, pH, Free Chlorine, and Water
  Temperature — unchecking one hides it from the Log, Calculator, History,
  and PDF export. Salt stays controlled by the saltwater-generator toggle.
- **Water temperature.** New optional tracked field (°F) with its own
  target range for charting/red-flagging. Not part of the dosing
  Calculator, since temperature isn't chemically dosed.
- **Two custom fields.** Name them in Settings (e.g. "Borates",
  "Phosphates") and they appear on the Log form, History table, CSV, and
  PDF export. Leave a name blank to hide that field.
- **Red out-of-range chart points.** Any reading outside its Settings
  min/max target now shows as a larger red dot on the History trend
  charts instead of blue, so a problem test is visible at a glance.
- **PDF: landscape + pool name.** The PDF export now prints in landscape.
  Added a "Pool name" field in Settings — it's used as the app's subtitle
  in the header and as the title of the PDF report (falls back to "Liquid
  Ledger — Pool Test Report" when not set).

## v1.5.0 — 2026-10-01

- **Auto-timestamped log entries.** The Liquid Ledger date/time field is no
  longer editable — every entry is stamped with the actual time it was
  saved. A live clock on the Log tab shows what will be recorded, purely
  for confirmation.
- **Recommended adjustment order everywhere.** Chemicals are now ordered
  Total Alkalinity → Calcium Hardness → Cyanuric Acid → pH → Salt →
  Chlorine (last) throughout the Calculator table, the dosing results
  list, the History table/CSV columns, and the Settings target-ranges
  table. The Calculator table and results are numbered 1–6 to make the
  sequence explicit.
- **PDF export.** New "Export to PDF" panel on the History tab: pick a
  date range and which columns to include, then generate a printable
  report and use the browser's "Save as PDF" option. No library, no
  internet needed.
- **Initials field.** Log entries can now be signed with initials (e.g.
  for households where more than one person tests the pool). A Settings
  field sets the default so it's prefilled on every new entry; shown as
  the "By" column in History and included in CSV/PDF export.

## v1.4.0 — 2026-10-01

- Added **local folder auto-save** on the Backup tab: point the app at a
  folder your computer already syncs (your Dropbox folder, Google Drive
  folder, OneDrive, iCloud Drive, etc.) and it writes the Liquid Ledger
  backup file directly into it — no Dropbox/Google app to register, no API
  key, no OAuth. Uses the browser's File System Access API, so it's
  Chrome/Edge desktop only for now; other browsers fall back to the
  existing API-key backups or manual export/import. Includes an
  "Auto-save after every log entry" toggle and a one-click "Reconnect" if
  the browser needs permission re-confirmed after a restart.

## v1.3.0 — 2026-10-01

- Renamed the app to **Liquid Assets — Pool Edition**, with the log/history
  feature now branded as the **Liquid Ledger** (was "Log Test"/"PoolTest").
- Renamed the cloud/manual backup file from `pool-log-backup.json` to
  `liquid-ledger-backup.json`, and the CSV export to `liquid-ledger.csv`.
  **Breaking for existing backups:** if you already have a
  `pool-log-backup.json` in Dropbox or Google Drive from an earlier
  version, this version won't find it under the new name — rename that
  file yourself in Dropbox/Drive, or do one fresh "Back up now" to create
  the new one.

## v1.2.0 — 2026-09-18

- Calculator now has a **Desired** column next to **Current** for every
  chemical, so you can calculate dosing toward any target reading, not
  just the fixed ideal from Settings. Desired starts pre-filled from your
  Settings target, is editable per calculation, and a "Reset desired to
  targets" button puts it back.

## v1.1.0 — 2026-09-17

- Split logging and dosing calculation into two separate tabs. **Log Test**
  now only records readings (form clears after saving); **Calculator** only
  computes dosing and never writes to your history. Added a "Load latest
  log entry" button on the Calculator tab to pull your most recent test in
  without re-typing it.
- Added version number to the app footer and this changelog.

## v1.0.0 — 2026-09-17

- Initial version: chemical balance calculator (FC, pH, TA, CYA, CH, Salt),
  combined test-logging + dosing-calculation form, history table with
  trend sparklines and CSV/JSON export, Dropbox and Google Drive backup
  (each user's own account, client-side OAuth, no server), manual JSON
  export/import, PWA manifest + service worker for offline/installable use.
