// Background script (service worker).
// Makes the toolbar icon open the side panel, and sends the reminders (step 2).
// Classroom refresh (step 3) will be added here.

import { loadState, nowCentral, latestReminderSlot, reminderMessage } from "./lib.js";

const CHECK_ALARM = "reminder-check";
const NOTIFICATION_ID = "reminder";

function enableSidePanelOnIconClick() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("setPanelBehavior failed:", err));
}

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
  const { tasks, devPretend, reminderTimes, lastReminderSlot } = await loadState();
  const nowStr = nowCentral(devPretend);
  const slot = latestReminderSlot(nowStr, reminderTimes);

  // First run, or the pretend clock moved backward: start counting from now.
  if (!lastReminderSlot || lastReminderSlot > nowStr) {
    await chrome.storage.local.set({ lastReminderSlot: slot });
    return;
  }
  if (!slot || slot <= lastReminderSlot) return;

  await chrome.storage.local.set({ lastReminderSlot: slot });
  // Step 3: run a Classroom refresh here, right before the reminder.
  await sendReminder(tasks, nowStr);
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

// Changing the pretend clock or reminder times is noticed right away.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.devPretend || changes.reminderTimes)) queueCheck();
});

// The window the side panel opens in. Kept up to date so a notification click can
// open the panel right away: sidePanel.open() only works while the click still counts
// as a user action, so it can't wait on an async lookup first.
let lastWindowId = null;
chrome.windows.getLastFocused().then((w) => { if (lastWindowId === null) lastWindowId = w?.id ?? null; }).catch(() => {});
chrome.windows.onFocusChanged.addListener((id) => {
  if (id !== chrome.windows.WINDOW_ID_NONE) lastWindowId = id;
});

function openListInTab() {
  chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
}

// Clicking the reminder opens the side panel. If Chrome refuses, the list opens in a tab.
chrome.notifications.onClicked.addListener((id) => {
  if (id !== NOTIFICATION_ID) return;
  chrome.notifications.clear(id);
  if (lastWindowId === null) {
    openListInTab();
    return;
  }
  const windowId = lastWindowId;
  chrome.sidePanel
    .open({ windowId })
    .then(() => chrome.windows.update(windowId, { focused: true }))
    .catch((err) => {
      console.warn("Side panel didn't open from the notification:", err);
      openListInTab();
    });
});

// "Send test reminder" in the developer tools.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
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

chrome.runtime.onInstalled.addListener(() => {
  enableSidePanelOnIconClick();
  startReminderChecks();
});
chrome.runtime.onStartup.addListener(() => {
  enableSidePanelOnIconClick();
  startReminderChecks();
});
