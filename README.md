# Deadline Tracker (steps 1–2: skeleton, manual add, reminders)

## Load it in Chrome
1. Unzip this folder somewhere permanent (Chrome reads it from there every time).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `deadline-tracker` folder.
4. Pin the extension, then click its icon to open the side panel.

## What works in step 1
- Side panel list with the color system (green, yellow, red, gray) and text labels.
- + button: add page (title, class, due date, due time, all required).
- Click a task: task page where every field is editable, with a done checkbox and a trash icon.
- Tasks are saved in Chrome's extension storage and survive restarts.
- Done tasks go gray and are removed 24 hours later.

## What works in step 2
- A summary notification at 7 AM and 7 PM (Central), such as "2 missing, 3 due soon".
- No notification when nothing is yellow or red.
- A reminder missed while Chrome was closed pops up once when Chrome opens again.
- Clicking the notification opens the full list in its own tab.
- On a Mac, Chrome needs permission to show notifications: System Settings > Notifications > Google Chrome.

## Testing tools
Right-click the extension icon, choose **Options**, then open **Developer tools**:
- Pretend date and time (the clock keeps ticking forward from the time you set).
  Jumping it past 7 AM or 7 PM counts as a missed reminder, so one pops up right away.
- Fill with test tasks (every state)
- Send test reminder (sends it right now)
- Reset everything

## Files
- `manifest.json`: names the extension and its permissions (storage, side panel, alarms, notifications)
- `background.js`: makes the toolbar icon open the side panel, and sends the reminders
- `lib.js`: shared logic: Central-time dates, status colors, sorting, storage
- `panel.html / panel.css / panel.js`: the list, add page, and task page
- `options.html / options.js`: the settings page (only developer tools for now)

## Classroom logo
The official Google Classroom logo isn't included. To show it on the task page, add Google's
logo image to the folder and set `CLASSROOM_LOGO_FILE` at the top of `panel.js`.

## Reloading after changes
On `chrome://extensions`, click the circular arrow on the Deadline Tracker card.
