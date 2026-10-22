# Chrome Web Store listing

Text to paste into the Chrome Web Store Developer Dashboard. The upload itself is made
with `./build-store.sh` (see the README).

## Store listing tab
- **Name:** Deadline Tracker (from the manifest)
- **Summary** (from the manifest, 132 characters max): Collects your Google Classroom due dates into one color-coded list, with a reminder each morning and night.
- **Category:** Education
- **Language:** English
- **Icon:** `icons/icon128.png`
- **Screenshots:** at least one, 1280×800. Take them yourself with test tasks
  (Settings > Developer tools > Fill with test tasks), so no real assignments show.
  Suggested: the side panel list, a task page, the settings page.

**Description:**

> Deadline Tracker puts every Google Classroom assignment in one list, sorted by due date and color-coded:
>
> • Green: due in 3 or more days
> • Yellow: due in 0 to 2 days
> • Red: missing
> • Gray: turned in (cleared after 24 hours)
>
> It reads Classroom by itself, using the Classroom sign-in you already have in Chrome. No separate login, and no school approval needed. It refreshes before each reminder, when you open Classroom, and when you press the refresh button.
>
> Each morning and night you get one summary notification, such as "2 missing, 3 due soon". You can also add your own tasks, edit any task, check tasks off, and delete them; your changes always win over what Classroom says.
>
> Show the list in the side panel, its own tab, or a popup, in light or dark, at any size from 50% to 200%.
>
> Private: your list is stored on your computer. If Chrome sync is on, your settings and your own changes follow your Chrome account to your other computers. Nothing is ever sent to the developer.

## Privacy tab
- **Single purpose:** Shows the user's Google Classroom assignments and due dates in one list and reminds them of upcoming and missing work.
- **Permission justifications:**
  - **storage:** Saves the user's task list and settings on their computer, and syncs their settings and edits through Chrome sync.
  - **sidePanel:** Shows the task list in Chrome's side panel (the default display).
  - **alarms:** Checks once a minute whether the morning or night reminder time has come.
  - **notifications:** Shows the morning and night reminder with counts of missing and due-soon work.
  - **scripting:** Runs the reader in a Classroom tab to collect assignment titles, classes, and due dates from the To-do page.
  - **Host permission (https://classroom.google.com/\*):** The extension reads the user's own Classroom To-do list and assignment pages. It has no access to any other site.
- **Remote code:** No, I am not using remote code.
- **Data usage:** Rian checks what fits. Suggested: "Website content" (assignment titles, classes, and due dates read from Classroom). Then check all three statements: not sold, not used for unrelated purposes, not used for credit decisions.
- **Privacy policy URL:** https://rian733.github.io/deadline-tracker/privacy.html (works once the repo is public and GitHub Pages is on, serving the `docs` folder of `main`)

## Distribution tab
- **Visibility:** Unlisted (Rian's choice, October 21). It can be switched to public later without a new upload.
- **Regions:** all
