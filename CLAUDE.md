# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
A Manifest V3 Chrome extension that collects assignment due dates (Google Classroom first) into one color-coded list and sends a summary notification each morning and night. All data stays in `chrome.storage.local`; nothing is sent anywhere.

- **Plan doc = source of truth:** [Deadline tracker extension plan](https://claude.ai/artifact/KMMCoTjHZGSLbPMsZNYyWJ), a Claude Doc. Read it with the docs tools (`read` with `payload: {"kind":"view"}`), never a web fetch. Follow its build order (1 skeleton/manual add · 2 reminders · 3 Classroom reader · 4 settings and displays · 5 later). When the doc doesn't settle something, ask Rian instead of guessing, and record new decisions in the doc after asking.
- `HANDOFF.md` (untracked) holds the current state and next steps between sessions.
- Rian knows Java (AP CS A) but little JavaScript. Claude writes most of the code, so explain changes in plain terms. Rian runs the Chrome tests.

## Commands
There is no build step, bundler, linter, or package.json. Files load directly as ES modules.

- Node lives at `~/.local/node` (no Homebrew). If `node` isn't found: `export PATH="$HOME/.local/node/bin:$PATH"`.
- Syntax check: `for f in *.js; do node --check "$f"; done`
- Tests are plain Node scripts that exit non-zero on failure. Run them all with `for t in tests/*.mjs; do node "$t"; done`. Only pure functions in `lib.js` can be tested this way. Code that calls `chrome.*` needs a fake `chrome` global, or a manual test in Chrome.
- Run in Chrome: on `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick this folder, then click reload after every change. Reopen the Options page after a reload, because an Options page opened before it can't message the background script.

## Architecture
Every input writes to one shared task list in storage, and every display only reads from it. Adding a site means adding a reader and nothing else.

- `lib.js`: all shared logic. Pure functions come first (Node-testable), and the `chrome.storage` helpers (`loadState`, `saveTasks`, `deleteTask`, `loadVisible`) come last. Every other file imports from it.
- `background.js`: the service worker (`"type": "module"`). It applies the Display setting (side panel, popup, or tab), runs the reminder checks, handles notification clicks, answers messages (`refresh`, `send-test-reminder`), and starts Classroom refreshes: on install, before each reminder (in `checkReminders`), when a Classroom tab loads (15-minute cooldown after a successful read), and from the panel's ↻ button.
- `refresh.js`: one Classroom refresh. Opens a background tab, reads the Assigned, Missing, and Done lists (`CLASSROOM_TABS`), opens new assignments' pages for due times, merges with `mergeClassroom`, closes the tab. Saves `refreshState` (shown in the panel) and `readerLog` (shown in the developer tools). Only one runs at a time.
- `reader.js`: a classic script (no imports) injected with `chrome.scripting`, and also loaded by `options.html` to read the saved pages. It only collects raw text (`readList`, `readDetails`, plus `...Now` versions that take a document). All parsing happens in `lib.js` (`collectRows`, `needsDetails`, `resolveDue`, `isFullRead`) so it can be tested.
- `look.js`: applies theme and scale to the panel and settings pages.
- `panel.js`: the list, add, and task views in one page, used as the side panel, the popup (`?view=popup`), and the full page (`?view=page`). A small `h()` helper builds the DOM, and `go()` switches views and re-renders from storage.
- `options.js`: the settings page (display, theme, scale, reminder times) with the developer tools in a collapsed section: pretend clock, test tasks, send test reminder, reader log, run the reader on saved pages, and reset.

### Time model (important)
- All times are **Central wall-clock strings** `"YYYY-MM-DDTHH:mm"` with no zone suffix. They sort correctly as plain strings, and comparisons use `<` and `>=` directly. `strToMs` and `msToStr` treat them as UTC only for date arithmetic.
- Always get "now" from `nowCentral(devPretend)`, never `new Date()` directly, so the pretend clock works everywhere. The pretend clock is `{ central, setAtMs }` and keeps ticking forward from the moment it was set.

### Task model and rules
- Task fields: `{ id, title, className, due, url, source: "manual"|"classroom"|"test", done, turnedInSeenAt, notOnClassroom, edited: [] }`. Classroom ids are `classroom-<id>` and test task ids start with `test-`.
- `edited` lists the fields the user changed, and `"done"` there means a manual check-off. A Classroom refresh (`mergeClassroom`) must never overwrite them.
- Deleting goes through `deleteTask()`, which records Classroom ids in the `deletedIds` storage key so a refresh never adds them back. `loadVisible` does the same for a Classroom task you checked off yourself when it expires, since it may still be on Classroom's To-do list.
- `notOnClassroom` marks a Classroom task missing from a *full* read (`fullRead: true`). The task is kept and labeled "Not on Classroom", never removed automatically. A partial read never sets it.
- Status comes from `taskStatus()`: green means 3 or more calendar days left, yellow 0–2 days, red once the due *time* passes, and gray when done. Done tasks are removed 24 hours after `turnedInSeenAt` (`isExpiredDone`, cleaned up in `loadVisible`). Every color has a text label next to it.

### Reminders
- A 1-minute `chrome.alarms` check compares `latestReminderSlot(now, reminderTimes)` with the stored `lastReminderSlot`. Several missed slots give one catch-up reminder. No stored slot, or a pretend clock moved backward, resets the baseline without sending. Checks run one at a time through a promise queue.
- The notification shows counts only ("2 missing, 3 due soon"), and nothing is sent when both counts are 0.
- A notification click opens the side panel. `chrome.sidePanel.open()` only works while the click still counts as a user action, so it is called synchronously with a window id tracked ahead of time (`lastWindowId`). If that fails, the list opens in a tab.

## Conventions
- Classroom shows dates as text with no year ("Monday, Oct 19", "Due Yesterday, 2:55 AM"). Parse them only with `parseListDate` / `parseDueLine` in `lib.js`, which pick the year closest to today.
- Classroom's own words ("Today") follow the real clock, so reader text is parsed with the real time, never the pretend clock. The merge and the 14-day rule use the pretend clock.
- The reader must only read elements that aren't inside `[aria-hidden="true"]`, because Classroom keeps earlier-viewed pages in the DOM, hidden.
- To check the reader without Chrome, load the saved pages in jsdom from a scratch directory (not added to this repo, which has no package.json).
- `test-pages/` holds saved copies of Rian's Classroom pages for testing the reader. It is gitignored because it contains personal data. Never commit it.
