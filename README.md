# Deadline Tracker (step 1: skeleton and manual add)

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

## Testing tools
Right-click the extension icon, choose **Options**, then open **Developer tools**:
- Pretend date and time (the clock keeps ticking forward from the time you set)
- Fill with test tasks (every state)
- Reset everything

## Files
- `manifest.json`: names the extension and its permissions (storage, side panel)
- `background.js`: makes the toolbar icon open the side panel
- `lib.js`: shared logic: Central-time dates, status colors, sorting, storage
- `panel.html / panel.css / panel.js`: the list, add page, and task page
- `options.html / options.js`: the settings page (only developer tools for now)

## Classroom logo
The official Google Classroom logo isn't included. To show it on the task page, add Google's
logo image to the folder and set `CLASSROOM_LOGO_FILE` at the top of `panel.js`.

## Reloading after changes
On `chrome://extensions`, click the circular arrow on the Deadline Tracker card.
