// Minimal settings page: only the developer testing tools for now.
// Step 4 builds the real settings (display, theme, scale, reminder times) around it.

import { loadState, saveTasks, nowCentral, buildTestTasks, formatDate, formatTime } from "./lib.js";

const message = document.getElementById("message");
const pretendDate = document.getElementById("pretend-date");
const pretendTime = document.getElementById("pretend-time");
const pretendStatus = document.getElementById("pretend-status");

function say(text) {
  message.textContent = text;
}

async function showPretendStatus() {
  const { devPretend } = await loadState();
  const now = nowCentral(devPretend);
  pretendStatus.textContent = devPretend
    ? `Pretending. The extension thinks it is ${formatDate(now)}, ${formatTime(now)} (Central).`
    : `Using real time: ${formatDate(now)}, ${formatTime(now)} (Central).`;
}

document.getElementById("pretend-set").addEventListener("click", async () => {
  if (!pretendDate.value || !pretendTime.value) {
    say("Pick both a date and a time first.");
    return;
  }
  await chrome.storage.local.set({
    devPretend: { central: `${pretendDate.value}T${pretendTime.value}`, setAtMs: Date.now() },
  });
  say("Pretend time set.");
  showPretendStatus();
});

document.getElementById("pretend-clear").addEventListener("click", async () => {
  await chrome.storage.local.remove("devPretend");
  say("Back to real time.");
  showPretendStatus();
});

document.getElementById("test-fill").addEventListener("click", async () => {
  const { tasks, devPretend } = await loadState();
  const kept = tasks.filter((t) => !t.id.startsWith("test-"));
  const fresh = buildTestTasks(nowCentral(devPretend));
  await saveTasks([...kept, ...fresh]);
  say(`Added ${fresh.length} test tasks.`);
});

document.getElementById("reset").addEventListener("click", async () => {
  if (!confirm("Clear all tasks and settings? This can't be undone.")) return;
  await chrome.storage.local.clear();
  say("Everything was cleared.");
  showPretendStatus();
});

showPretendStatus();
