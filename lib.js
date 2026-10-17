// Shared logic used by every page of the extension.
// Pure functions (no chrome.* calls) come first so they can be tested in Node.

export const TZ = "America/Chicago";
export const DAY_MS = 24 * 60 * 60 * 1000;
export const TURNED_IN_VISIBLE_MS = 24 * 60 * 60 * 1000;

// ---------- Time helpers ----------
// Times are "Central wall-clock strings": "YYYY-MM-DDTHH:mm" (no zone suffix).
// Strings in this format sort correctly as plain text.

export function centralString(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(ms)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Treat a wall-clock string as if it were UTC, for simple date math.
export function strToMs(s) {
  return Date.parse(s.length === 16 ? s + ":00Z" : s + "Z");
}

export function msToStr(ms) {
  return new Date(ms).toISOString().slice(0, 16);
}

// "Now" in Central time. `pretend` is { central, setAtMs } from the testing tools,
// or null. A pretend time keeps ticking forward from the moment it was set.
export function nowCentral(pretend, realMs = Date.now()) {
  if (pretend && pretend.central) {
    return msToStr(strToMs(pretend.central) + (realMs - pretend.setAtMs));
  }
  return centralString(realMs);
}

export function datePart(s) {
  return s.slice(0, 10);
}

export function timePart(s) {
  return s.slice(11, 16);
}

export function addDays(dateStr, n) {
  return msToStr(strToMs(dateStr + "T00:00") + n * DAY_MS).slice(0, 10);
}

// Whole calendar days from `fromStr` to `toStr` (dates or date-times).
export function calendarDaysBetween(fromStr, toStr) {
  const a = strToMs(datePart(fromStr) + "T00:00");
  const b = strToMs(datePart(toStr) + "T00:00");
  return Math.round((b - a) / DAY_MS);
}

// "Monday, October 12"
export function formatDate(dueStr) {
  return new Date(strToMs(datePart(dueStr) + "T00:00")).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "11:59 PM"
export function formatTime(dueStr) {
  const [h, m] = timePart(dueStr).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// When Classroom was last read: "at 7:02 AM" today, else "on Monday, October 12 at 7:02 AM".
// Refresh times are real times, so this compares with the real clock, not the pretend one.
export function formatRefreshTime(atStr, realNowStr = centralString(Date.now())) {
  if (!atStr) return "";
  const time = formatTime(atStr);
  return datePart(atStr) === datePart(realNowStr) ? `at ${time}` : `on ${formatDate(atStr)} at ${time}`;
}

// ---------- Task status ----------
// Returns { state, label, daysLeft }.
// state: "green" | "yellow" | "red" | "gray"
export function taskStatus(task, nowStr) {
  if (task.done) {
    return {
      state: "gray",
      label: task.source === "classroom" ? "Turned in" : "Done",
      daysLeft: null,
    };
  }
  if (nowStr >= task.due) {
    return { state: "red", label: "Missing", daysLeft: null };
  }
  const daysLeft = calendarDaysBetween(nowStr, task.due);
  if (daysLeft >= 3) {
    return { state: "green", label: `${daysLeft} days`, daysLeft };
  }
  if (daysLeft === 0) return { state: "yellow", label: "Due today", daysLeft };
  if (daysLeft === 1) return { state: "yellow", label: "1 day", daysLeft };
  return { state: "yellow", label: "2 days", daysLeft };
}

// Gray tasks disappear 24 hours after they were marked done / turned in.
export function isExpiredDone(task, nowStr) {
  if (!task.done || !task.turnedInSeenAt) return false;
  return strToMs(nowStr) - strToMs(task.turnedInSeenAt) >= TURNED_IN_VISIBLE_MS;
}

// Tasks without a due date are left out. Expired done tasks are left out.
export function visibleTasks(tasks, nowStr) {
  return tasks.filter((t) => t.due && !isExpiredDone(t, nowStr));
}

const STATE_ORDER = { red: 0, green: 1, yellow: 1, gray: 2 };

// Missing at the top, turned-in at the bottom, everything else by due date.
export function sortTasks(tasks, nowStr) {
  return [...tasks].sort((a, b) => {
    const sa = STATE_ORDER[taskStatus(a, nowStr).state];
    const sb = STATE_ORDER[taskStatus(b, nowStr).state];
    if (sa !== sb) return sa - sb;
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Fake tasks in every state, relative to `nowStr`. Ids start with "test-".
export function buildTestTasks(nowStr) {
  const today = datePart(nowStr);
  const t = (id, title, className, dayOffset, time, extra = {}) => ({
    id: `test-${id}`,
    title,
    className,
    due: `${addDays(today, dayOffset)}T${time}`,
    url: "",
    source: "test",
    done: false,
    turnedInSeenAt: null,
    edited: [],
    ...extra,
  });
  return [
    t("green", "Read chapters 4 and 5", "US History", 6, "23:59"),
    t("yellow2", "Lab report draft", "Chemistry", 2, "23:59"),
    t("yellow1", "Vocabulary quiz", "Spanish III", 1, "08:00"),
    t("today", "Problem set 7", "AP Calculus", 0, "23:59"),
    t("red", "Essay outline", "English 11", -1, "23:59"),
    t("turnedin", "Map worksheet", "World Geography", -2, "23:59", {
      source: "classroom",
      url: "https://classroom.google.com/",
      done: true,
      turnedInSeenAt: nowStr,
    }),
  ];
}

// ---------- Reminders ----------
// Reminder times are Central wall-clock "HH:mm": one morning and one night time,
// changeable in settings.
export const DEFAULT_REMINDER_TIMES = ["07:00", "19:00"];

// The most recent reminder time at or before `nowStr`, as "YYYY-MM-DDTHH:mm".
export function latestReminderSlot(nowStr, times) {
  const today = datePart(nowStr);
  let latest = null;
  for (const day of [addDays(today, -1), today]) {
    for (const time of times) {
      const slot = `${day}T${time}`;
      if (slot <= nowStr && (!latest || slot > latest)) latest = slot;
    }
  }
  return latest;
}

// "2 missing, 3 due soon", or null when nothing is yellow or red.
export function reminderMessage(tasks, nowStr) {
  let missing = 0;
  let soon = 0;
  for (const task of visibleTasks(tasks, nowStr)) {
    const { state } = taskStatus(task, nowStr);
    if (state === "red") missing++;
    else if (state === "yellow") soon++;
  }
  const parts = [];
  if (missing) parts.push(`${missing} missing`);
  if (soon) parts.push(`${soon} due soon`);
  return parts.length ? parts.join(", ") : null;
}

// ---------- Classroom date text (step 3) ----------
// Classroom writes dates for people, not computers:
//   To-do list rows:   "Today, 11:59 PM", "Monday, Oct 19", "Friday, Oct 2"
//   Assignment pages:  "Due 11:59 PM" (today), "Due Yesterday, 2:55 AM", "Due Oct 13, 9:10 AM"
// There's no year, so we pick the year that puts the date closest to today.
// AM/PM may follow a narrow no-break space (U+202F), which is treated as a plain space.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function clean(text) {
  return text.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// "2:55 PM" -> "14:55", or null if it isn't a time.
function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2}) ?([AP]M)$/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return `${pad(h)}:${m[2]}`;
}

// A date word or "Oct 19" / "Oct 19, 2027" -> "YYYY-MM-DD", or null.
function parseDay(text, nowStr) {
  const today = datePart(nowStr);
  const word = text.toLowerCase();
  if (word === "today") return today;
  if (word === "tomorrow") return addDays(today, 1);
  if (word === "yesterday") return addDays(today, -1);
  const m = /^([A-Za-z]{3})[a-z]* (\d{1,2})(?:, (\d{4}))?$/.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  const md = `${pad(month + 1)}-${pad(Number(m[2]))}`;
  if (m[3]) return `${m[3]}-${md}`;
  const year = Number(today.slice(0, 4));
  const options = [year - 1, year, year + 1].map((y) => `${y}-${md}`);
  return options.reduce((best, d) =>
    Math.abs(calendarDaysBetween(today, d)) < Math.abs(calendarDaysBetween(today, best)) ? d : best
  );
}

// A To-do list row's date -> { date: "YYYY-MM-DD", time: "HH:mm" or null }, or null.
export function parseListDate(text, nowStr) {
  const parts = clean(text).split(", ");
  // Drop a leading weekday ("Monday, Oct 19"); keep "Today", "Tomorrow", "Yesterday".
  if (parts.length > 1 && /^(mon|tues|wednes|thurs|fri|satur|sun)day$/i.test(parts[0])) parts.shift();
  const time = parts.length > 1 ? parseClock(parts[parts.length - 1]) : null;
  if (time) parts.pop();
  const date = parseDay(parts.join(", "), nowStr);
  return date ? { date, time } : null;
}

// An assignment page's "Due ..." line -> "YYYY-MM-DDTHH:mm", or null.
// A due date with no time shown means the end of that day.
export function parseDueLine(text, nowStr) {
  const t = clean(text).replace(/^Due /i, "");
  const onlyTime = parseClock(t);
  if (onlyTime) return `${datePart(nowStr)}T${onlyTime}`;
  const parts = t.split(", ");
  const time = parts.length > 1 ? parseClock(parts[parts.length - 1]) : null;
  if (time) parts.pop();
  const date = parseDay(parts.join(", "), nowStr);
  return date ? `${date}T${time || "23:59"}` : null;
}

// ---------- Classroom merge (step 3) ----------
// The reader returns one entry per assignment it found:
//   { classroomId, title, className, due ("YYYY-MM-DDTHH:mm" Central, or null), url, turnedIn }
// mergeClassroom folds those into the task list and returns the new list.
// - New assignments are added, unless already turned in (so a turn-in removed after
//   24 hours isn't added back by the next read of Classroom's "Done" list).
// - Fields you edited (listed in `edited`) are never overwritten.
// - A turn-in checks the task off and starts the 24-hour clock; an unsubmit undoes it.
//   A check-off you made yourself ("done" in `edited`) is left as you set it.
// - Tasks you deleted (their ids are in `deletedIds`) are never added back.
// - Missing work due more than MISSING_LOOKBACK_DAYS ago isn't added (old backlog).
//   A task already in the list stays until turned in, however old it gets.
// - After a full read (`fullRead`), Classroom tasks the reader didn't see are marked
//   `notOnClassroom` so you can decide what to do; seeing them again clears the mark.
//   After a partial read, unseen tasks are left alone.
export const CLASSROOM_FIELDS = ["title", "className", "due", "url"];
export const MISSING_LOOKBACK_DAYS = 14;

export function mergeClassroom(tasks, found, nowStr, { deletedIds = [], fullRead = false } = {}) {
  const out = tasks.map((t) => ({ ...t, edited: [...(t.edited || [])] }));
  const byId = new Map(out.map((t) => [t.id, t]));
  const deleted = new Set(deletedIds);
  const seen = new Set();
  const oldest = msToStr(strToMs(nowStr) - MISSING_LOOKBACK_DAYS * DAY_MS);
  for (const a of found) {
    const id = `classroom-${a.classroomId}`;
    seen.add(id);
    const task = byId.get(id);
    if (!task) {
      if (deleted.has(id) || a.turnedIn || !a.due || a.due < oldest) continue;
      const fresh = {
        id,
        title: a.title,
        className: a.className,
        due: a.due,
        url: a.url || "",
        source: "classroom",
        done: false,
        turnedInSeenAt: null,
        notOnClassroom: false,
        edited: [],
      };
      out.push(fresh);
      byId.set(id, fresh);
      continue;
    }
    for (const field of CLASSROOM_FIELDS) {
      if (task.edited.includes(field)) continue;
      if (a[field] != null && a[field] !== "") task[field] = a[field];
    }
    task.notOnClassroom = false;
    if (task.edited.includes("done")) continue;
    if (a.turnedIn && !task.done) {
      task.done = true;
      task.turnedInSeenAt = nowStr;
    } else if (!a.turnedIn && task.done) {
      task.done = false;
      task.turnedInSeenAt = null;
    }
  }
  if (fullRead) {
    for (const t of out) {
      if (t.source === "classroom" && !t.id.startsWith("test-") && !seen.has(t.id)) {
        t.notOnClassroom = true;
      }
    }
  }
  return out;
}

// ---------- Classroom reader results (step 3) ----------
// The reader (reader.js) returns raw text. These functions turn it into entries for
// mergeClassroom. Classroom's words like "Today" follow the real clock, so text is
// parsed with the real time (`realNowStr`), even while the pretend clock is on.

// The three To-do tabs, read in this order. Done is last, so a turn-in wins.
export const CLASSROOM_TABS = [
  { kind: "assigned", name: "Assigned", url: "https://classroom.google.com/a/not-turned-in/all" },
  { kind: "missing", name: "Missing", url: "https://classroom.google.com/a/missing/all" },
  { kind: "done", name: "Done", url: "https://classroom.google.com/a/turned-in/all" },
];

// A row's due date from its extra lines, skipping "Posted ..." lines. Or null.
export function rowListDate(row, realNowStr) {
  for (const line of row.other || []) {
    if (/^posted\b/i.test(line)) continue;
    const parsed = parseListDate(line, realNowStr);
    if (parsed) return parsed;
  }
  return null;
}

// reads: [{ kind, groups: [{ id, count, rows }] }] from reader.readList(), one per tab.
// Returns { entries, problems }. Each entry is
//   { classroomId, title, className, url, turnedIn, listDate, kind, group }
// where listDate is { date, time } (time may be null) or null.
export function collectRows(reads, realNowStr) {
  const byId = new Map();
  const problems = [];
  for (const read of reads) {
    for (const group of read.groups || []) {
      for (const row of group.rows) {
        if (!row.id) {
          problems.push(`${read.kind}: couldn't find the id of "${row.title}"`);
          continue;
        }
        const turnedIn = read.kind === "done";
        const listDate = turnedIn ? null : rowListDate(row, realNowStr);
        if (!turnedIn && !listDate && group.id !== "NO_DUE_DATE") {
          problems.push(`${read.kind}: couldn't read the date of "${row.title}" (${row.other.join(" | ")})`);
        }
        byId.set(row.id, {
          classroomId: row.id,
          title: row.title,
          className: row.className,
          url: row.url,
          turnedIn,
          listDate,
          kind: read.kind,
          group: group.id,
        });
      }
    }
  }
  return { entries: [...byId.values()], problems };
}

// True when the list shows no time for this entry and the reader should open its
// assignment page: it's new (and would be added), or its due date moved.
export function needsDetails(entry, task, nowStr, deletedIds = []) {
  if (entry.turnedIn || !entry.listDate || entry.listDate.time) return false;
  if (!task) {
    if (deletedIds.includes(`classroom-${entry.classroomId}`)) return false;
    const oldest = datePart(msToStr(strToMs(nowStr) - MISSING_LOOKBACK_DAYS * DAY_MS));
    return entry.listDate.date >= oldest;
  }
  if (task.edited?.includes("due")) return false;
  return datePart(task.due) !== entry.listDate.date;
}

// The due date and time to give mergeClassroom, best source first: the time on the
// list, the assignment page, the time already saved for that date, else 11:59 PM.
export function resolveDue(entry, task, detailsDue) {
  if (entry.turnedIn || !entry.listDate) return null;
  const { date, time } = entry.listDate;
  if (time) return `${date}T${time}`;
  if (detailsDue) return detailsDue;
  if (task && datePart(task.due) === date) return task.due;
  return `${date}T23:59`;
}

// A read counts as full only when every tab loaded and every group showed all its rows.
export function isFullRead(reads, problems) {
  return (
    reads.length === CLASSROOM_TABS.length &&
    reads.every((r) => !r.error && r.complete) &&
    problems.length === 0
  );
}

// ---------- Storage (chrome.storage.local) ----------
// Keys: tasks (array), devPretend ({ central, setAtMs } or null),
// reminderTimes (array of "HH:mm"), lastReminderSlot (last reminder time handled),
// deletedIds (ids of Classroom tasks you deleted, so a refresh doesn't add them back),
// display ("sidepanel" | "tab" | "popup"), theme ("light" | "dark", or null until the
// first page opens), scale (50 to 200, in percent),
// refreshState (the last Classroom refresh, see refresh.js), readerLog (what it read).

export const DISPLAYS = ["sidepanel", "tab", "popup"];
export const SCALES = [50, 75, 100, 125, 150, 175, 200];

export async function loadState() {
  const {
    tasks = [],
    devPretend = null,
    reminderTimes = DEFAULT_REMINDER_TIMES,
    lastReminderSlot = null,
    deletedIds = [],
    display = "sidepanel",
    theme = null,
    scale = 100,
  } = await chrome.storage.local.get([
    "tasks",
    "devPretend",
    "reminderTimes",
    "lastReminderSlot",
    "deletedIds",
    "display",
    "theme",
    "scale",
  ]);
  return { tasks, devPretend, reminderTimes, lastReminderSlot, deletedIds, display, theme, scale };
}

// Deletes a task. A Classroom task's id is remembered so a refresh doesn't add it back.
export async function deleteTask(id) {
  const { tasks, deletedIds } = await loadState();
  const removed = tasks.find((t) => t.id === id);
  const update = { tasks: tasks.filter((t) => t.id !== id) };
  if (removed?.source === "classroom" && !deletedIds.includes(id)) {
    update.deletedIds = [...deletedIds, id];
  }
  await chrome.storage.local.set(update);
}

export async function saveTasks(tasks) {
  await chrome.storage.local.set({ tasks });
}

// Loads tasks, drops expired done tasks (saving the cleanup), and returns what to show.
// A Classroom task you checked off yourself may still be on Classroom's To-do list, so its
// id goes in `deletedIds`; otherwise the next refresh would add it back unchecked.
export async function loadVisible() {
  const { tasks, devPretend, deletedIds } = await loadState();
  const nowStr = nowCentral(devPretend);
  const kept = tasks.filter((t) => !isExpiredDone(t, nowStr));
  if (kept.length !== tasks.length) {
    const update = { tasks: kept };
    const remember = tasks
      .filter((t) => isExpiredDone(t, nowStr) && t.source === "classroom" && t.edited?.includes("done"))
      .map((t) => t.id)
      .filter((id) => !deletedIds.includes(id));
    if (remember.length) update.deletedIds = [...deletedIds, ...remember];
    await chrome.storage.local.set(update);
  }
  return { tasks: kept, nowStr };
}
