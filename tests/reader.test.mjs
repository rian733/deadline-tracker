// Run: node tests/reader.test.mjs
// Rows are shaped like reader.js returns them, with text copied from the saved pages.
import {
  rowListDate,
  collectRows,
  needsDetails,
  resolveDue,
  isFullRead,
  mergeClassroom,
  formatRefreshTime,
} from "../lib.js";

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) fail++; };
const now = "2026-10-16T20:00";
const row = (id, other, extra = {}) => ({ id, url: `https://classroom.google.com/c/x/a/${id}/details`,
  title: `Task ${id}`, className: "AP Physics 1", other, ...extra });

// ---------- rowListDate ----------
check("row: today with time", JSON.stringify(rowListDate(row("1", ["Today, 11:59 PM", "Today", "11:59 PM"]), now))
  === JSON.stringify({ date: "2026-10-16", time: "23:59" }));
check("row: weekday and date, no time", JSON.stringify(rowListDate(row("1", ["Monday, Oct 19", "Monday", "Oct 19"]), now))
  === JSON.stringify({ date: "2026-10-19", time: null }));
check("row: posted line skipped", rowListDate(row("1", ["Posted Monday, Oct 1, 2018"]), now) === null);
check("row: grade isn't a date", rowListDate(row("1", ["28/30"]), now) === null);

// ---------- collectRows ----------
const reads = [
  { kind: "assigned", groups: [
    { id: "NO_DUE_DATE", count: 1, rows: [row("10", ["Posted Monday, Oct 1, 2018"])] },
    { id: "NEXT_WEEK", count: 2, rows: [row("11", ["Monday, Oct 19"]), row("12", ["Someday"])] },
  ] },
  { kind: "missing", groups: [{ id: "EARLIER", count: 1, rows: [row("13", ["Friday, Oct 2"])] }] },
  { kind: "done", groups: [{ id: "THIS_WEEK", count: 2, rows: [row("14", ["Turned in"]), row(null, [])] }] },
];
const { entries, problems } = collectRows(reads, now);
const byId = Object.fromEntries(entries.map((e) => [e.classroomId, e]));
check("collect: one entry per row with an id", entries.length === 5);
check("collect: no-due-date row has no date and no problem", byId["10"].listDate === null
  && !problems.some((p) => p.includes("Task 10")));
check("collect: unreadable date is a problem", problems.some((p) => p.includes("Task 12")));
check("collect: done rows are turned in", byId["14"].turnedIn && byId["14"].listDate === null);
check("collect: missing row keeps its date", byId["13"].listDate.date === "2026-10-02" && !byId["13"].turnedIn);
check("collect: row with no id is a problem", problems.some((p) => p.includes("couldn't find the id")));

// ---------- needsDetails ----------
const e = (date, time = null, extra = {}) => ({ classroomId: "20", turnedIn: false, listDate: { date, time }, ...extra });
const task = (due, edited = []) => ({ id: "classroom-20", due, edited });
check("details: new with no time", needsDetails(e("2026-10-19"), undefined, now) === true);
check("details: not when the list shows a time", needsDetails(e("2026-10-16", "23:59"), undefined, now) === false);
check("details: not for turned-in work", needsDetails(e("2026-10-19", null, { turnedIn: true }), undefined, now) === false);
check("details: not for deleted tasks", needsDetails(e("2026-10-19"), undefined, now, ["classroom-20"]) === false);
check("details: not for missing work older than 14 days", needsDetails(e("2026-09-30"), undefined, now) === false);
check("details: yes for missing work 14 days back", needsDetails(e("2026-10-02"), undefined, now) === true);
check("details: not when the date didn't move", needsDetails(e("2026-10-19"), task("2026-10-19T08:00"), now) === false);
check("details: yes when the date moved", needsDetails(e("2026-10-20"), task("2026-10-19T08:00"), now) === true);
check("details: not when you edited the due date", needsDetails(e("2026-10-20"), task("2026-10-19T08:00", ["due"]), now) === false);

// ---------- resolveDue ----------
check("due: time on the list wins", resolveDue(e("2026-10-16", "23:59"), undefined, "2026-10-16T08:00") === "2026-10-16T23:59");
check("due: page time next", resolveDue(e("2026-10-19"), undefined, "2026-10-19T08:30") === "2026-10-19T08:30");
check("due: saved time for the same date", resolveDue(e("2026-10-19"), task("2026-10-19T08:00"), null) === "2026-10-19T08:00");
check("due: else 11:59 PM", resolveDue(e("2026-10-19"), task("2026-10-18T08:00"), null) === "2026-10-19T23:59");
check("due: none for turned-in work", resolveDue({ turnedIn: true, listDate: null }, undefined, null) === null);

// ---------- isFullRead ----------
const ok = (kind) => ({ kind, complete: true, groups: [] });
check("full: all three complete", isFullRead([ok("assigned"), ok("missing"), ok("done")], []) === true);
check("full: not with a partial group", isFullRead([ok("assigned"), { ...ok("missing"), complete: false }, ok("done")], []) === false);
check("full: not with a tab missing", isFullRead([ok("assigned"), ok("missing")], []) === false);
check("full: not with a problem", isFullRead([ok("assigned"), ok("missing"), ok("done")], ["x"]) === false);

// ---------- mergeClassroom and test tasks ----------
const testTask = { id: "test-turnedin", source: "classroom", due: now, done: true, edited: [] };
const merged = mergeClassroom([testTask], [], now, { fullRead: true });
check("merge: test tasks never marked Not on Classroom", !merged[0].notOnClassroom);

// ---------- formatRefreshTime ----------
check("refresh time: today", formatRefreshTime("2026-10-16T07:02", now) === "at 7:02 AM");
check("refresh time: another day", formatRefreshTime("2026-10-12T19:00", now) === "on Monday, October 12 at 7:00 PM");

if (fail) { console.log(`${fail} failed`); process.exit(1); }
