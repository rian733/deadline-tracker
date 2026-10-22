// Run: node tests/sync.test.mjs
import { syncRecord, stampChanges, mergeRecords, applyRecords, chunkList, SYNC_GONE_KEEP_MS } from "../lib.js";

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) fail++; };
const manual = (id, extra = {}) => ({ id, title: "Lab", className: "Bio", due: "2026-10-20T08:00", url: "",
  source: "manual", done: false, turnedInSeenAt: null, edited: [], ...extra });
const room = (id, extra = {}) => ({ ...manual(id), source: "classroom", url: "https://classroom.google.com/x", ...extra });

// ---------- syncRecord ----------
check("record: manual tasks sync", syncRecord(manual("manual-1"))?.id === "manual-1");
check("record: unedited Classroom tasks don't", syncRecord(room("classroom-1")) === null);
check("record: edited Classroom tasks do", syncRecord(room("classroom-1", { edited: ["done"] }))?.edited[0] === "done");
check("record: test tasks don't", syncRecord(manual("test-1")) === null);

// ---------- stampChanges ----------
const t1 = [manual("manual-1")];
const m1 = stampChanges(t1, {}, 100);
check("stamp: new task stamped", m1["manual-1"].updatedAt === 100 && m1["manual-1"].hash);
check("stamp: unchanged keeps its time", stampChanges(t1, m1, 200)["manual-1"].updatedAt === 100);
check("stamp: changed gets a new time", stampChanges([manual("manual-1", { title: "X" })], m1, 200)["manual-1"].updatedAt === 200);
const m2 = stampChanges([], m1, 300);
check("stamp: removed task is gone", m2["manual-1"].hash === null && m2["manual-1"].updatedAt === 300);
check("stamp: gone stays put", stampChanges([], m2, 400)["manual-1"].updatedAt === 300);

// ---------- mergeRecords ----------
const rec = (id, updatedAt, rec = { id }) => ({ id, rec, updatedAt });
const merged = mergeRecords([rec("a", 1), rec("b", 5)], [rec("a", 2, null), rec("b", 3)], 10);
check("merge: newer wins", merged.find((r) => r.id === "a").rec === null && merged.find((r) => r.id === "b").updatedAt === 5);
check("merge: old gone records drop", mergeRecords([rec("a", 0, null)], [], SYNC_GONE_KEEP_MS + 1).length === 0);
check("merge: old live records stay", mergeRecords([rec("a", 0)], [], SYNC_GONE_KEEP_MS + 1).length === 1);

// ---------- applyRecords ----------
const fromOther = syncRecord(manual("manual-2", { title: "Essay" }));
let r = applyRecords([], [{ id: "manual-2", rec: fromOther, updatedAt: 50 }], {}, []);
check("apply: task added elsewhere appears", r.tasks.length === 1 && r.tasks[0].title === "Essay");
check("apply: meta matches so it isn't sent back", stampChanges(r.tasks, r.meta, 60)["manual-2"].updatedAt === 50);
r = applyRecords(r.tasks, [{ id: "manual-2", rec: null, updatedAt: 70 }], r.meta, []);
check("apply: gone removes a manual task", r.tasks.length === 0);
const here = room("classroom-9", { title: "Classroom title", due: "2026-10-22T23:59" });
const edit = syncRecord(room("classroom-9", { title: "My title", due: "2026-10-01T00:00", done: true,
  turnedInSeenAt: "2026-10-20T09:00", edited: ["title", "done"] }));
r = applyRecords([here], [{ id: "classroom-9", rec: edit, updatedAt: 80 }], {}, []);
const t = r.tasks[0];
check("apply: Classroom edits copy only edited fields", t.title === "My title" && t.done && t.due === "2026-10-22T23:59"
  && t.edited.includes("title") && t.edited.includes("done"));
r = applyRecords([here], [{ id: "classroom-9", rec: null, updatedAt: 90 }], {}, []);
check("apply: gone leaves a Classroom task alone", r.tasks.length === 1);
r = applyRecords([here], [], {}, ["classroom-9"]);
check("apply: deleted ids are removed", r.tasks.length === 0);
r = applyRecords([manual("manual-3", { title: "Mine" })], [{ id: "manual-3", rec: syncRecord(manual("manual-3", { title: "Old" })), updatedAt: 5 }],
  { "manual-3": { hash: "x", updatedAt: 10 } }, []);
check("apply: older records don't overwrite", r.tasks[0].title === "Mine");

// ---------- chunkList ----------
const many = Array.from({ length: 300 }, (_, i) => `classroom-${"x".repeat(20)}${i}`);
const chunks = chunkList(many);
check("chunks: nothing lost", chunks.flat().length === 300);
check("chunks: each under 6000 characters", chunks.every((c) => JSON.stringify(c).length <= 6000));
check("chunks: empty list is one empty piece", chunkList([]).length === 1);

if (fail) { console.log(`${fail} failed`); process.exit(1); }
