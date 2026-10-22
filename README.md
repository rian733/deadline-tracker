# Deadline Tracker

Collects your Google Classroom due dates into one color-coded list, and sends a summary
reminder each morning and night. Your list is stored on your computer; with Chrome sync on,
your settings and your own changes also follow your Chrome account. Nothing goes to anyone else.

## Load it in Chrome
1. Keep this folder somewhere permanent (Chrome reads it from there every time).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `deadline-tracker` folder.
4. Pin the extension, then click its icon to open the list.
5. Be signed in to Google Classroom in the same Chrome profile.

## What it does
- **List:** green (3+ days left), yellow (0–2 days), red (missing), gray (turned in, removed
  after 24 hours). Every color has a text label.
- **Add and edit:** + adds a task by hand. Click a task to edit it, check it off, or delete it.
  Your edits always win over what Classroom says.
- **Classroom reader:** reads the Assigned, Missing, and Done lists on Classroom's To-do page,
  then opens each new assignment's page for its exact due time. It runs:
  - right after you install the extension,
  - before each reminder,
  - when you open Classroom yourself (at most every 15 minutes),
  - when you press ↻ in the list header.

  Each read opens Classroom in a background tab for a few seconds, then closes it.
  If you aren't signed in, the list asks you to sign in.
- **Reminders:** one notification at 7 AM and 7 PM (Central) by default, such as
  "2 missing, 3 due soon". Nothing is sent when nothing is yellow or red. A reminder missed
  while Chrome was closed pops up once when Chrome opens again. Clicking it opens the list.
- On a Mac, Chrome needs permission to show notifications: System Settings > Notifications > Google Chrome.

## Settings
Click ⚙ in the list header (or right-click the icon and choose **Options**):
- **Display:** side panel (default), full page in its own tab, or popup.
- **Theme:** light or dark. It starts as Chrome's own appearance.
- **Scale:** 50% to 200%.
- **Reminder times:** a morning and a night time.
- **Sync:** shows when your changes last synced with your other computers.

## Sync across computers
When Chrome sync is on, these follow your Chrome account: settings, tasks you added, your
edits and check-offs, and deleted tasks. Assignments read from Classroom don't sync; each
computer reads Classroom itself. Chrome sync holds about 100 KB, plenty for this. If
sync is off (for example, turned off by a school), everything still works on one computer.

## Developer tools
At the bottom of the settings page, open **Developer tools**. They only appear when the
extension is loaded from this folder, never in a copy installed from the Web Store.
- Pretend date and time (the clock keeps ticking forward from the time you set).
  Jumping it past a reminder time counts as a missed reminder, so one pops up right away.
- Fill with test tasks (every state)
- Send test reminder (sends it right now)
- Reader log: what the last Classroom read found, and anything it couldn't read
- Run reader on saved pages: reads the copies in `test-pages/` (not in git, since they hold personal data)
- Reset everything (here and in sync)

## Files
- `manifest.json`: names the extension and its permissions (storage, side panel, alarms,
  notifications, scripting, and access to classroom.google.com only)
- `background.js`: opens the list, sends the reminders, and starts Classroom reads
- `refresh.js`: one Classroom read: opens the tab, runs the reader, merges, closes the tab
- `reader.js`: runs inside Classroom's pages and collects the text of each assignment
- `lib.js`: shared logic: Central-time dates, status colors, Classroom date parsing, merging, storage
- `look.js`: applies the theme and scale
- `sync.js`: syncs settings and your changes through Chrome sync
- `timefield.js`: the typed time box used for every time field
- `panel.html / panel.css / panel.js`: the list, add page, and task page
- `options.html / options.js`: the settings page and developer tools
- `tests/`: Node tests for the logic in `lib.js` (run `for t in tests/*.mjs; do node "$t"; done`)

## Classroom logo
The official Google Classroom logo isn't included. To show it on the task page, add Google's
logo image to the folder and set `CLASSROOM_LOGO_FILE` at the top of `panel.js`.

## Publishing to the Chrome Web Store
1. Raise `"version"` in `manifest.json` for every new upload.
2. Run `./build-store.sh`. It makes `dist/deadline-tracker-<version>.zip` with only the
   files the extension runs on (never `test-pages/`, `tests/`, or notes).
3. Upload the zip in the Chrome Web Store Developer Dashboard and fill in the listing from
   `store-listing.md`. The privacy policy is `docs/privacy.html`, served by GitHub Pages.

## Reloading after changes
On `chrome://extensions`, click the circular arrow on the Deadline Tracker card.
