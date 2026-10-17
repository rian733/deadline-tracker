// Settings page (step 4): display, theme, scale, and reminder times,
// plus the developer tools in a collapsed section at the bottom.

import {
  loadState,
  saveTasks,
  nowCentral,
  centralString,
  buildTestTasks,
  formatDate,
  formatTime,
  formatRefreshTime,
  latestReminderSlot,
  collectRows,
  parseDueLine,
  CLASSROOM_TABS,
  SCALES,
} from "./lib.js";
import { applyLook } from "./look.js";

applyLook();

const message = document.getElementById("message");
const pretendDate = document.getElementById("pretend-date");
const pretendTime = document.getElementById("pretend-time");
const pretendStatus = document.getElementById("pretend-status");

function say(text) {
  message.textContent = text;
}

// ---------- Settings ----------

const scaleSelect = document.getElementById("scale");
for (const s of SCALES) {
  const option = document.createElement("option");
  option.value = String(s);
  option.textContent = `${s}%`;
  scaleSelect.append(option);
}
const morning = document.getElementById("morning");
const night = document.getElementById("night");
const timesError = document.getElementById("times-error");

async function showSettings() {
  const { display, theme, scale, reminderTimes } = await loadState();
  for (const input of document.querySelectorAll('input[name="display"]')) input.checked = input.value === display;
  // The theme may still be unset for a moment while look.js picks Chrome's appearance.
  const { theme: savedTheme } = await chrome.storage.local.get("theme");
  for (const input of document.querySelectorAll('input[name="theme"]')) {
    input.checked = input.value === (savedTheme || theme || "light");
  }
  scaleSelect.value = String(scale);
  [morning.value, night.value] = reminderTimes;
}

document.getElementById("display").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ display: e.target.value });
  say("Display saved. Click the extension icon to see it.");
});

document.getElementById("theme").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ theme: e.target.value });
  say("Theme saved.");
});

scaleSelect.addEventListener("change", async () => {
  await chrome.storage.local.set({ scale: Number(scaleSelect.value) });
  say("Scale saved.");
});

async function saveTimes() {
  if (!morning.value || !night.value) {
    timesError.textContent = "Pick both a morning and a night time.";
    return;
  }
  if (morning.value === night.value) {
    timesError.textContent = "The two times must be different.";
    return;
  }
  timesError.textContent = "";
  const reminderTimes = [morning.value, night.value];
  // Start counting from now, so changing a time doesn't count as a missed reminder.
  const { devPretend } = await loadState();
  const lastReminderSlot = latestReminderSlot(nowCentral(devPretend), reminderTimes);
  await chrome.storage.local.set({ reminderTimes, lastReminderSlot });
  say(`Reminders at ${formatTime(`2000-01-01T${morning.value}`)} and ${formatTime(`2000-01-01T${night.value}`)}.`);
}
morning.addEventListener("change", saveTimes);
night.addEventListener("change", saveTimes);

// ---------- Developer tools ----------

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

document.getElementById("test-reminder").addEventListener("click", async () => {
  let result;
  try {
    result = await chrome.runtime.sendMessage({ type: "send-test-reminder" });
  } catch (err) {
    say(`Couldn't reach the background script: ${err.message}. Close this page and reopen Options.`);
    return;
  }
  if (result?.error) say(`Reminder failed: ${result.error}`);
  else if (result?.message) say(`Reminder sent: "${result.message}".`);
  else say("Nothing is yellow or red, so no reminder was sent.");
});

document.getElementById("reset").addEventListener("click", async () => {
  if (!confirm("Clear all tasks and settings? This can't be undone.")) return;
  await chrome.storage.local.clear();
  say("Everything was cleared.");
  showPretendStatus();
  showSettings();
});

// ---------- Reader log ----------

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

function table(headers, rows) {
  const t = el("table");
  const head = el("tr");
  headers.forEach((h) => head.append(el("th", h)));
  t.append(head);
  for (const row of rows) {
    const tr = el("tr");
    row.forEach((cell) => tr.append(el("td", cell)));
    t.append(tr);
  }
  return t;
}

function dueLabel(due) {
  return due ? `${formatDate(due)}, ${formatTime(due)}` : "none";
}

// log: { at, reason, fullRead, added, tabs: [{ name, error, groups }], items, problems }
function renderLog(target, log) {
  target.replaceChildren();
  if (!log) {
    target.append(el("div", "No refresh has run yet.", "hint"));
    return;
  }
  const summary = [
    log.at ? `Read ${formatRefreshTime(log.at)}` : "Read",
    log.reason ? `(${log.reason})` : "",
    log.fullRead ? "· complete read" : "· partial read (nothing marked Not on Classroom)",
    log.added != null ? `· ${log.added} added` : "",
  ].join(" ");
  target.append(el("div", summary));
  if (log.tabs.length) {
    target.append(
      table(
        ["Tab", "Groups (rows read / total)"],
        log.tabs.map((t) => [
          t.name,
          t.error
            ? `Error: ${t.error}`
            : t.groups.map((g) => `${g.id} ${g.read}/${g.count ?? "?"}`).join(", ") || "no groups found",
        ])
      )
    );
  }
  for (const n of log.notes || []) target.append(el("div", n));
  for (const p of log.problems) target.append(el("div", p, "problem"));
  if (log.items.length) {
    target.append(
      table(
        ["Title", "Class", "Tab", "Due"],
        log.items.map((i) => [
          i.title,
          i.className,
          `${i.tab} / ${i.group}`,
          i.tab === "done" ? "turned in" : `${dueLabel(i.due)}${i.dueText ? ` ("${i.dueText}")` : ""}`,
        ])
      )
    );
  }
}

const readerLogBox = document.getElementById("reader-log");
async function showReaderLog() {
  const { readerLog = null } = await chrome.storage.local.get("readerLog");
  renderLog(readerLogBox, readerLog);
}

// ---------- Run the reader on saved pages ----------
// reader.js is loaded by options.html, so globalThis.deadlineReader is ready here.

async function loadSaved(name) {
  const res = await fetch(`test-pages/${name}`).catch(() => null);
  if (!res || !res.ok) return null;
  return new DOMParser().parseFromString(await res.text(), "text/html");
}

document.getElementById("saved-run").addEventListener("click", async () => {
  const box = document.getElementById("saved-log");
  box.replaceChildren(el("div", "Reading...", "hint"));
  const realNow = centralString(Date.now());
  const files = { assigned: "assigned.html", missing: "missing.html", done: "done.html" };
  const log = { at: realNow, reason: "saved pages", tabs: [], items: [], problems: [], fullRead: false };
  const reads = [];
  for (const page of CLASSROOM_TABS) {
    const doc = await loadSaved(files[page.kind]);
    if (!doc) {
      log.problems.push(`test-pages/${files[page.kind]} wasn't found.`);
      continue;
    }
    const read = globalThis.deadlineReader.readListNow(doc);
    reads.push({ ...read, kind: page.kind });
    log.tabs.push({
      name: page.name,
      error: null,
      groups: read.groups.map((g) => ({ id: g.id, count: g.count, read: g.rows.length })),
    });
  }
  const { entries, problems } = collectRows(reads, realNow);
  log.problems.push(...problems);
  const details = await loadSaved("assignment.html");
  if (details) {
    const d = globalThis.deadlineReader.readDetailsNow(details);
    const due = d?.dueText ? parseDueLine(d.dueText, realNow) : null;
    if (d?.dueText) {
      log.notes = [`assignment.html: "${d.title}", "${d.dueText}" reads as ${dueLabel(due)}. ("Today" means today.)`];
    } else {
      log.problems.push("assignment.html: couldn't find a due line.");
    }
  }
  log.items = entries.map((e) => ({
    title: e.title,
    className: e.className,
    tab: e.kind,
    group: e.group,
    due: e.listDate ? `${e.listDate.date}T${e.listDate.time || "23:59"}` : null,
    dueText: e.listDate && !e.listDate.time ? "time from its page" : null,
  }));
  renderLog(box, log);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.readerLog) showReaderLog();
});

showSettings();
showPretendStatus();
showReaderLog();
