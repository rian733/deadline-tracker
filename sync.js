// Sync across computers (step 5), run by the background script.
// Copies your own changes to chrome.storage.sync, which follows your Chrome account
// to your other computers, and copies theirs back here. Every page keeps using
// chrome.storage.local; only this file touches sync. The rules are in lib.js.
//
// What syncs:
//   settings (display, theme, scale, reminder times): each one, newest wins
//   tasks you added, and Classroom tasks you edited or checked off: "tasks.0", "tasks.1", ...
//   deleted task ids: "deleted.0", "deleted.1", ...
// Each list is split into pieces because Chrome sync stores at most 8 KB per item.
// If Chrome sync is off (or your school turns it off), this does nothing harmful:
// the data just stays on this computer.

import {
  loadState,
  nowCentral,
  latestReminderSlot,
  SYNC_SETTINGS,
  stampChanges,
  mergeRecords,
  applyRecords,
  chunkList,
} from "./lib.js";

const DEBOUNCE_MS = 2000;

// ---------- Lists split into pieces ----------

async function readList(name) {
  const { [`${name}.count`]: count = 0 } = await chrome.storage.sync.get(`${name}.count`);
  if (!count) return [];
  const keys = Array.from({ length: count }, (_, i) => `${name}.${i}`);
  const got = await chrome.storage.sync.get(keys);
  return keys.flatMap((k) => got[k] || []);
}

async function writeList(name, list) {
  const { [`${name}.count`]: oldCount = 0 } = await chrome.storage.sync.get(`${name}.count`);
  const chunks = list.length ? chunkList(list) : [];
  const items = { [`${name}.count`]: chunks.length };
  chunks.forEach((c, i) => (items[`${name}.${i}`] = c));
  await chrome.storage.sync.set(items);
  const stale = [];
  for (let i = chunks.length; i < oldCount; i++) stale.push(`${name}.${i}`);
  if (stale.length) await chrome.storage.sync.remove(stale);
}

// ---------- Settings ----------

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Copies settings changed here up to sync.
async function pushSettings(changes) {
  const up = {};
  for (const key of SYNC_SETTINGS) {
    if (changes[key] && changes[key].newValue !== undefined) up[key] = changes[key].newValue;
  }
  if (!Object.keys(up).length) return;
  const remote = await chrome.storage.sync.get(Object.keys(up));
  for (const key of Object.keys(up)) if (same(remote[key], up[key])) delete up[key];
  if (Object.keys(up).length) await chrome.storage.sync.set(up);
}

// Copies settings from sync down to this computer. New reminder times start counting
// from now, so a time changed on another computer doesn't count as a missed reminder.
async function pullSettings() {
  const remote = await chrome.storage.sync.get(SYNC_SETTINGS);
  const local = await chrome.storage.local.get(SYNC_SETTINGS);
  const down = {};
  for (const key of SYNC_SETTINGS) {
    if (remote[key] !== undefined && remote[key] !== null && !same(remote[key], local[key])) down[key] = remote[key];
  }
  if (down.reminderTimes) {
    const { devPretend } = await loadState();
    down.lastReminderSlot = latestReminderSlot(nowCentral(devPretend), down.reminderTimes);
  }
  if (Object.keys(down).length) await chrome.storage.local.set(down);
}

// On first run, this computer's settings go up only if sync has none yet.
async function seedSettings() {
  const remote = await chrome.storage.sync.get(SYNC_SETTINGS);
  const local = await chrome.storage.local.get(SYNC_SETTINGS);
  const up = {};
  for (const key of SYNC_SETTINGS) {
    if (remote[key] === undefined && local[key] !== undefined && local[key] !== null) up[key] = local[key];
  }
  if (Object.keys(up).length) await chrome.storage.sync.set(up);
}

// ---------- Tasks ----------

async function syncTasks() {
  const nowMs = Date.now();
  const { tasks, deletedIds } = await loadState();
  const { syncMeta = {} } = await chrome.storage.local.get("syncMeta");

  // 1. Stamp what changed here since the last sync.
  const meta = stampChanges(tasks, syncMeta, nowMs);
  const recById = new Map();
  for (const t of tasks) {
    const hash = meta[t.id]?.hash;
    if (hash) recById.set(t.id, JSON.parse(hash));
  }
  const mine = Object.entries(meta).map(([id, m]) => ({ id, rec: recById.get(id) || null, updatedAt: m.updatedAt }));

  // 2. Merge with what other computers synced.
  const theirs = await readList("tasks");
  const merged = mergeRecords(theirs, mine, nowMs);
  const remoteDeleted = await readList("deleted");
  const allDeleted = [...new Set([...remoteDeleted, ...deletedIds])];

  // 3. Apply their newer changes here. Tasks are re-read right before saving,
  // so a Classroom refresh that finished meanwhile isn't undone.
  const latest = await loadState();
  const applied = applyRecords(latest.tasks, merged, meta, allDeleted);
  const kept = new Set(merged.map((r) => r.id));
  for (const id of Object.keys(applied.meta)) if (!kept.has(id) && !applied.meta[id].hash) delete applied.meta[id];
  const local = { syncMeta: applied.meta };
  if (!same(applied.tasks, latest.tasks)) local.tasks = applied.tasks;
  if (allDeleted.length !== latest.deletedIds.length) local.deletedIds = allDeleted;
  await chrome.storage.local.set(local);

  // 4. Send the merged result up if it changed.
  if (!same(merged, theirs)) await writeList("tasks", merged);
  if (allDeleted.length !== remoteDeleted.length) await writeList("deleted", allDeleted);
}

// ---------- Running it ----------

let queue = Promise.resolve();
let timer = null;

async function setSyncState(state) {
  await chrome.storage.local.set({ syncState: { ...state, at: Date.now() } });
}

// Runs one sync now, after any already running.
export function syncNow() {
  queue = queue
    .then(async () => {
      await pullSettings();
      await syncTasks();
      await setSyncState({ ok: true, error: null });
    })
    .catch(async (err) => {
      // Usually the 100 KB limit, or too many writes in a short time.
      console.error("Sync failed:", err);
      await setSyncState({ ok: false, error: String(err?.message || err) }).catch(() => {});
    });
  return queue;
}

function syncSoon() {
  clearTimeout(timer);
  timer = setTimeout(syncNow, DEBOUNCE_MS);
}

export function startSync() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      pushSettings(changes).catch((err) => console.error("Sync failed:", err));
      if (changes.tasks || changes.deletedIds) syncSoon();
    } else if (area === "sync") {
      syncSoon();
    }
  });
  seedSettings()
    .catch((err) => console.error("Sync failed:", err))
    .then(syncNow);
}

// Clears the synced copy too (used by Reset everything in the developer tools).
export async function clearSynced() {
  await chrome.storage.sync.clear();
}
