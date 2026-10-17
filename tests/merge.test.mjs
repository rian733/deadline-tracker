// Run: node tests/merge.test.mjs
import { mergeClassroom } from "../lib.js";

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) fail++; };
const now = "2026-10-16T12:00";
const a = (id, extra = {}) => ({ classroomId: id, title: `Task ${id}`, className: "Chemistry",
  due: "2026-10-20T23:59", url: `https://classroom.google.com/${id}`, turnedIn: false, ...extra });

let t = mergeClassroom([], [a("1"), a("2", { turnedIn: true }), a("3", { due: null })], now);
check("adds new assignment", t.length === 1 && t[0].id === "classroom-1" && t[0].source === "classroom");
check("skips already turned-in and no-due-date assignments", t.length === 1);

t = mergeClassroom(t, [a("1", { title: "Renamed", due: "2026-10-21T08:00" })], now);
check("updates unedited fields", t[0].title === "Renamed" && t[0].due === "2026-10-21T08:00");

t[0].title = "My title"; t[0].edited.push("title");
t = mergeClassroom(t, [a("1", { title: "Teacher title" })], now);
check("keeps edited fields", t[0].title === "My title");

t = mergeClassroom(t, [a("1", { turnedIn: true })], now);
check("turn-in checks off and stamps time", t[0].done && t[0].turnedInSeenAt === now);
const later = mergeClassroom(t, [a("1", { turnedIn: true })], "2026-10-16T18:00");
check("24-hour clock not restarted on later reads", later[0].turnedInSeenAt === now);

t = mergeClassroom(t, [a("1")], now);
check("unsubmit un-checks", !t[0].done && t[0].turnedInSeenAt === null);

const manual = [{ id: "manual-x", title: "Mine", className: "X", due: now, source: "manual", done: false, edited: [] }];
t = mergeClassroom([...t, ...manual], [], now);
check("leaves manual tasks and unseen assignments alone", t.length === 2);

const before = JSON.stringify(t);
mergeClassroom(t, [a("1", { title: "Changed" })], now);
check("doesn't modify its input", JSON.stringify(t) === before);

t = mergeClassroom([], [a("5")], now, { deletedIds: ["classroom-5"] });
check("deleted task isn't added back", t.length === 0);

t = mergeClassroom([], [a("6", { turnedIn: false })], now);
t[0].done = true; t[0].turnedInSeenAt = now; t[0].edited.push("done");
t = mergeClassroom(t, [a("6", { turnedIn: false })], "2026-10-16T18:00");
check("manual check-off survives refresh", t[0].done && t[0].turnedInSeenAt === now);

t = mergeClassroom([...mergeClassroom([], [a("7"), a("8")], now), ...manual], [a("7")], now);
check("partial read marks nothing", t.every((x) => !x.notOnClassroom));
t = mergeClassroom(t, [a("7")], now, { fullRead: true });
const byId = (id) => t.find((x) => x.id === id);
check("full read marks unseen Classroom task", byId("classroom-8").notOnClassroom === true);
check("full read leaves seen and manual tasks unmarked",
  !byId("classroom-7").notOnClassroom && !byId("manual-x").notOnClassroom);
t = mergeClassroom(t, [a("8")], now);
check("seeing it again clears the mark", byId("classroom-8").notOnClassroom === false);

t = mergeClassroom([], [a("9", { due: "2026-10-01T23:59" }), a("10", { due: "2026-10-03T08:00" })], now);
check("skips missing work older than 14 days", t.length === 1 && t[0].id === "classroom-10");
t = mergeClassroom(t, [a("10", { due: "2026-10-03T08:00" })], "2026-11-01T12:00");
check("keeps a task already in the list after it passes 14 days", t.length === 1);

process.exit(fail ? 1 : 0);
