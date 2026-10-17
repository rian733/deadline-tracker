// Classroom refresh (step 3), run by the background script.
// Opens Classroom in a background tab, reads the Assigned, Missing, and Done tabs
// with reader.js, opens each new assignment's page for its due time, merges what it
// found into the task list, and closes the tab.
//
// Progress is saved in storage as `refreshState` (the panel shows it), and what the
// reader found is saved as `readerLog` (shown in the developer tools).

import {
  loadState,
  nowCentral,
  centralString,
  mergeClassroom,
  parseDueLine,
  CLASSROOM_TABS,
  collectRows,
  needsDetails,
  resolveDue,
  isFullRead,
} from "./lib.js";

const PAGE_TIMEOUT_MS = 30000;
const CLASSROOM_ORIGIN = "https://classroom.google.com/";

let running = null; // the refresh in progress, so two can't run at once
let refreshTabId = null;

// True for the tab a refresh opened, so it doesn't count as "you opened Classroom".
export function isRefreshTab(tabId) {
  return tabId === refreshTabId;
}

export function isRefreshing() {
  return running !== null;
}

// Starts a refresh, or returns the one already running.
export function refreshClassroom(reason) {
  if (!running) running = runRefresh(reason).finally(() => (running = null));
  return running;
}

// A refresh can't survive the background script restarting, so a saved
// "running" flag left over from before a restart is cleared.
export async function clearStaleRefresh() {
  if (running) return;
  const { refreshState } = await chrome.storage.local.get("refreshState");
  if (refreshState?.running) {
    await chrome.storage.local.set({
      refreshState: { ...refreshState, running: false, ok: false, error: "The refresh was interrupted." },
    });
  }
}

async function setState(patch) {
  const { refreshState = {} } = await chrome.storage.local.get("refreshState");
  await chrome.storage.local.set({ refreshState: { ...refreshState, ...patch } });
}

// ---------- Tabs ----------

// Opens a blank tab without switching to it. With no Chrome window open, it opens
// a minimized window instead.
async function openWorkTab() {
  try {
    const tab = await chrome.tabs.create({ url: "about:blank", active: false });
    return tab.id;
  } catch {
    const win = await chrome.windows.create({ url: "about:blank", focused: false, state: "minimized" });
    return win.tabs[0].id;
  }
}

// Loads `url` in the tab and waits until it finishes. Resolves with the tab.
// `tab.url` is only visible for Classroom pages, so a sign-in redirect shows up
// as a missing or different url.
function navigate(tabId, url) {
  return new Promise((resolve, reject) => {
    let sawLoading = false;
    const timer = setTimeout(() => {
      stop();
      reject(new Error("Classroom took too long to load."));
    }, PAGE_TIMEOUT_MS);
    function listener(id, info, tab) {
      if (id !== tabId) return;
      if (info.status === "loading") sawLoading = true;
      if (info.status === "complete" && sawLoading) {
        stop();
        resolve(tab);
      }
    }
    function stop() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url }).catch((err) => {
      stop();
      reject(err);
    });
  });
}

async function onClassroom(tabId, tab) {
  const current = tab || (await chrome.tabs.get(tabId).catch(() => null));
  return Boolean(current?.url?.startsWith(CLASSROOM_ORIGIN));
}

// Runs one of reader.js's functions in the tab and returns its result.
async function runReader(tabId, fnName) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["reader.js"] });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (name) => globalThis.deadlineReader[name](),
    args: [fnName],
  });
  return result?.result;
}

class SignedOut extends Error {}

// ---------- The refresh ----------

async function runRefresh(reason) {
  const startedAt = centralString(Date.now());
  await setState({ running: true, reason, startedAt });
  let tabId = null;
  const log = { at: startedAt, reason, tabs: [], items: [], problems: [], fullRead: false };
  try {
    tabId = await openWorkTab();
    refreshTabId = tabId;
    const realNow = centralString(Date.now());

    // 1. Read the three To-do tabs.
    const reads = [];
    for (const page of CLASSROOM_TABS) {
      const tab = await navigate(tabId, page.url);
      if (!(await onClassroom(tabId, tab))) throw new SignedOut();
      const read = (await runReader(tabId, "readList")) || { groups: [], complete: false, error: "no-result" };
      if (read.error && !(await onClassroom(tabId))) throw new SignedOut();
      reads.push({ ...read, kind: page.kind });
      log.tabs.push({
        name: page.name,
        error: read.error || null,
        complete: read.complete,
        groups: read.groups.map((g) => ({ id: g.id, count: g.count, read: g.rows.length })),
      });
    }
    const { entries, problems } = collectRows(reads, realNow);
    log.problems.push(...problems);

    // 2. Open new assignments' pages for their due times.
    const before = await loadState();
    const nowStr = nowCentral(before.devPretend);
    const byId = new Map(before.tasks.map((t) => [t.id, t]));
    const detailsDue = new Map();
    const dueText = new Map();
    for (const entry of entries) {
      const task = byId.get(`classroom-${entry.classroomId}`);
      if (!needsDetails(entry, task, nowStr, before.deletedIds)) continue;
      try {
        await navigate(tabId, entry.url);
        const details = await runReader(tabId, "readDetails");
        if (details?.id && details.id !== entry.classroomId) {
          log.problems.push(`"${entry.title}": its page showed a different assignment.`);
          continue;
        }
        dueText.set(entry.classroomId, details?.dueText || null);
        const due = details?.dueText ? parseDueLine(details.dueText, realNow) : null;
        if (due) detailsDue.set(entry.classroomId, due);
        else log.problems.push(`"${entry.title}": couldn't read a due time on its page; using 11:59 PM.`);
      } catch (err) {
        log.problems.push(`"${entry.title}": its page didn't load (${err.message}); using 11:59 PM.`);
      }
    }

    // 3. Merge into the newest task list (it may have changed while reading).
    const fullRead = isFullRead(reads, log.problems);
    const latest = await loadState();
    const latestById = new Map(latest.tasks.map((t) => [t.id, t]));
    const found = entries.map((e) => ({
      classroomId: e.classroomId,
      title: e.title,
      className: e.className,
      url: e.url,
      turnedIn: e.turnedIn,
      due: resolveDue(e, latestById.get(`classroom-${e.classroomId}`), detailsDue.get(e.classroomId)),
    }));
    const merged = mergeClassroom(latest.tasks, found, nowCentral(latest.devPretend), {
      deletedIds: latest.deletedIds,
      fullRead,
    });
    await chrome.storage.local.set({ tasks: merged });

    const added = merged.filter((t) => !latestById.has(t.id)).length;
    log.fullRead = fullRead;
    log.added = added;
    log.items = entries.map((e, i) => ({
      title: e.title,
      className: e.className,
      tab: e.kind,
      group: e.group,
      due: found[i].due,
      dueText: dueText.get(e.classroomId) ?? null,
      url: e.url,
    }));
    await setState({
      running: false,
      ok: true,
      signedOut: false,
      fullRead,
      added,
      error: null,
      finishedAt: centralString(Date.now()),
      finishedAtMs: Date.now(),
    });
  } catch (err) {
    const signedOut = err instanceof SignedOut;
    const message = signedOut ? "Not signed in to Google Classroom." : String(err?.message || err);
    log.problems.push(message);
    if (signedOut) console.warn("Classroom refresh: not signed in.");
    else console.error("Classroom refresh failed:", err);
    await setState({
      running: false,
      ok: false,
      signedOut,
      error: message,
      finishedAt: centralString(Date.now()),
      finishedAtMs: Date.now(),
    });
  } finally {
    refreshTabId = null;
    if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});
    await chrome.storage.local.set({ readerLog: log });
  }
}
