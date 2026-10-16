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
// Reminder times are Central wall-clock "HH:mm". Step 4 makes them changeable.
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

// ---------- Storage (chrome.storage.local) ----------
// Keys: tasks (array), devPretend ({ central, setAtMs } or null),
// reminderTimes (array of "HH:mm"), lastReminderSlot (last reminder time handled).

export async function loadState() {
  const {
    tasks = [],
    devPretend = null,
    reminderTimes = DEFAULT_REMINDER_TIMES,
    lastReminderSlot = null,
  } = await chrome.storage.local.get(["tasks", "devPretend", "reminderTimes", "lastReminderSlot"]);
  return { tasks, devPretend, reminderTimes, lastReminderSlot };
}

export async function saveTasks(tasks) {
  await chrome.storage.local.set({ tasks });
}

// Loads tasks, drops expired done tasks (saving the cleanup), and returns what to show.
export async function loadVisible() {
  const { tasks, devPretend } = await loadState();
  const nowStr = nowCentral(devPretend);
  const kept = tasks.filter((t) => !isExpiredDone(t, nowStr));
  if (kept.length !== tasks.length) await saveTasks(kept);
  return { tasks: kept, nowStr };
}
