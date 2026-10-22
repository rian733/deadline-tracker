// Background script (service worker).
// Opens the list the way the Display setting says, sends the reminders (step 2),
// and runs the Classroom refresh (step 3): before each reminder, when you open
// Classroom, and when you press the refresh button. It also syncs your changes
// with your other computers (step 5, sync.js).

import { loadState, nowCentral, latestReminderSlot, reminderMessage } from "./lib.js";
import { refreshClassroom, isRefreshTab, isRefreshing, clearStaleRefresh } from "./refresh.js";
import { startSync } from "./sync.js";

const CHECK_ALARM = "reminder-check";
const NOTIFICATION_ID = "reminder";
// Opening Classroom yourself refreshes at most this often (Rian's choice, Oct 16).
const OPEN_CLASSROOM_COOLDOWN_MS = 15 * 60 * 1000;

// ---------- Display ----------
// "sidepanel": the icon opens the side panel. "popup": the icon opens a popup.
// "tab": the icon opens the list in its own tab (handled in action.onClicked).

async function applyDisplay() {
  const { display } = await loadState();
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: display === "sidepanel" });
    await chrome.action.setPopup({ popup: display === "popup" ? "panel.html?view=popup" : "" });
  } catch (err) {
    console.error("Couldn't apply the display setting:", err);
  }
}

// Switches to the list's tab if one is open, or opens a new one.
async function openListInTab() {
  const pageUrl = chrome.runtime.getURL("panel.html");
  const contexts = await chrome.runtime
    .getContexts({ contextTypes: ["TAB"] })
    .catch(() => []);
  const open = contexts.find((c) => c.documentUrl?.startsWith(pageUrl) && c.tabId >= 0);
  if (open) {
    await chrome.tabs.update(open.tabId, { active: true });
    if (open.windowId >= 0) await chrome.windows.update(open.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: "panel.html?view=page" });
}

chrome.action.onClicked.addListener(() => {
  // Only fires when there's no popup and the side panel isn't set to open.
  openListInTab().catch((err) => console.error("Couldn't open the list:", err));
});

// ---------- Reminders ----------
// A check runs once a minute. It sends a reminder when a reminder time has passed
// since the last one handled. A time missed while Chrome was closed (or skipped
// by jumping the pretend clock forward) gives one catch-up reminder, not one each.

// Shows the summary. Returns the message, or null when nothing is yellow or red.
async function sendReminder(tasks, nowStr) {
  const message = reminderMessage(tasks, nowStr);
  if (!message) return null;
  // Clear the old one first: updating an existing notification doesn't pop up again.
  await chrome.notifications.clear(NOTIFICATION_ID);
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Deadline Tracker",
    message,
  });
  return message;
}

async function checkReminders() {
  const { devPretend, reminderTimes, lastReminderSlot } = await loadState();
  const nowStr = nowCentral(devPretend);
  const slot = latestReminderSlot(nowStr, reminderTimes);

  // First run, or the pretend clock moved backward: start counting from now.
  if (!lastReminderSlot || lastReminderSlot > nowStr) {
    await chrome.storage.local.set({ lastReminderSlot: slot });
    return;
  }
  if (!slot || slot <= lastReminderSlot) return;

  await chrome.storage.local.set({ lastReminderSlot: slot });
  // Read Classroom first so the counts are current. If it fails, remind anyway.
  await refreshClassroom("reminder").catch((err) => console.error("Refresh before reminder failed:", err));
  const fresh = await loadState();
  await sendReminder(fresh.tasks, nowCentral(fresh.devPretend));
}

// Checks run one at a time, so two triggers close together can't both send.
let queue = Promise.resolve();
function queueCheck() {
  queue = queue.then(checkReminders).catch((err) => console.error("Reminder check failed:", err));
  return queue;
}

function startReminderChecks() {
  chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 1 });
  queueCheck();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM) queueCheck();
});

// Changing the pretend clock or reminder times is noticed right away,
// and changing the Display setting applies right away.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.devPretend || changes.reminderTimes) queueCheck();
  if (changes.display) applyDisplay();
});

// ---------- Refresh when you open Classroom ----------

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || isRefreshTab(tabId) || isRefreshing()) return;
  if (!tab.url?.startsWith("https://classroom.google.com/")) return;
  const { refreshState } = await chrome.storage.local.get("refreshState");
  // After a failed read (say, you weren't signed in), opening Classroom retries right away.
  const recent = refreshState?.ok && Date.now() - refreshState.finishedAtMs < OPEN_CLASSROOM_COOLDOWN_MS;
  if (recent) return;
  refreshClassroom("opened Classroom").catch((err) => console.error("Refresh failed:", err));
});

// ---------- Notification click ----------

// The window the side panel opens in. Kept up to date so a notification click can
// open the panel right away: sidePanel.open() only works while the click still counts
// as a user action, so it can't wait on an async lookup first.
let lastWindowId = null;
let display = "sidepanel"; // kept in step with storage for the same reason
chrome.windows.getLastFocused().then((w) => { if (lastWindowId === null) lastWindowId = w?.id ?? null; }).catch(() => {});
chrome.windows.onFocusChanged.addListener((id) => {
  if (id !== chrome.windows.WINDOW_ID_NONE) lastWindowId = id;
});
loadState().then((s) => (display = s.display)).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.display) display = changes.display.newValue || "sidepanel";
});

function openListFallback() {
  openListInTab().catch((err) => console.error("Couldn't open the list:", err));
}

// Clicking the reminder opens the list the way the Display setting says.
// If Chrome refuses, the list opens in a tab.
chrome.notifications.onClicked.addListener((id) => {
  if (id !== NOTIFICATION_ID) return;
  chrome.notifications.clear(id);
  if (display === "tab" || lastWindowId === null) {
    openListFallback();
    return;
  }
  const windowId = lastWindowId;
  const opening =
    display === "popup"
      ? chrome.windows.update(windowId, { focused: true }).then(() => chrome.action.openPopup({ windowId }))
      : chrome.sidePanel.open({ windowId }).then(() => chrome.windows.update(windowId, { focused: true }));
  opening.catch((err) => {
    console.warn("The list didn't open from the notification:", err);
    openListFallback();
  });
});

// ---------- Messages from the panel and settings page ----------
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "refresh") {
    refreshClassroom("refresh button").catch((err) => console.error("Refresh failed:", err));
    reply({ started: true });
    return;
  }
  if (msg?.type !== "send-test-reminder") return;
  (async () => {
    try {
      const { tasks, devPretend } = await loadState();
      reply({ message: await sendReminder(tasks, nowCentral(devPretend)) });
    } catch (err) {
      console.error("Test reminder failed:", err);
      reply({ error: String(err?.message || err) });
    }
  })();
  return true; // reply comes later
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  applyDisplay();
  startReminderChecks();
  // Fill the list right away instead of waiting for the next reminder.
  if (reason === "install") refreshClassroom("installed").catch((err) => console.error("Refresh failed:", err));
});
chrome.runtime.onStartup.addListener(() => {
  applyDisplay();
  startReminderChecks();
});

clearStaleRefresh();
startSync();
