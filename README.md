# Deadline Tracker (steps 1–4)

Collects your Google Classroom due dates into one color-coded list, and sends a summary
reminder each morning and night. All data stays on your computer.

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

## Developer tools
At the bottom of the settings page, open **Developer tools**:
- Pretend date and time (the clock keeps ticking forward from the time you set).
  Jumping it past a reminder time counts as a missed reminder, so one pops up right away.
- Fill with test tasks (every state)
- Send test reminder (sends it right now)
- Reader log: what the last Classroom read found, and anything it couldn't read
- Run reader on saved pages: reads the copies in `test-pages/` (not in git, since they hold personal data)
- Reset everything

## Files
- `manifest.json`: names the extension and its permissions (storage, side panel, alarms,
  notifications, scripting, and access to classroom.google.com only)
- `background.js`: opens the list, sends the reminders, and starts Classroom reads
- `refresh.js`: one Classroom read: opens the tab, runs the reader, merges, closes the tab
- `reader.js`: runs inside Classroom's pages and collects the text of each assignment
- `lib.js`: shared logic: Central-time dates, status colors, Classroom date parsing, merging, storage
- `look.js`: applies the theme and scale
- `panel.html / panel.css / panel.js`: the list, add page, and task page
- `options.html / options.js`: the settings page and developer tools
- `tests/`: Node tests for the logic in `lib.js` (run `for t in tests/*.mjs; do node "$t"; done`)

## Classroom logo
The official Google Classroom logo isn't included. To show it on the task page, add Google's
logo image to the folder and set `CLASSROOM_LOGO_FILE` at the top of `panel.js`.

## Reloading after changes
On `chrome://extensions`, click the circular arrow on the Deadline Tracker card.
