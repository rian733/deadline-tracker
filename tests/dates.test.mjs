// Run: node tests/dates.test.mjs
// Examples are copied from Rian's saved Classroom pages (test-pages/).
import { parseListDate, parseDueLine } from "../lib.js";

let fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const now = "2026-10-16T19:55";
const nnbsp = " ";

check("list: today with time", parseListDate(`Today, 11:59${nnbsp}PM`, now), { date: "2026-10-16", time: "23:59" });
check("list: weekday and date", parseListDate("Monday, Oct 19", now), { date: "2026-10-19", time: null });
check("list: earlier this fall", parseListDate("Wednesday, Sep 30", now), { date: "2026-09-30", time: null });
check("list: tomorrow", parseListDate("Tomorrow", now), { date: "2026-10-17", time: null });
check("list: not a date", parseListDate("Turned in", now), null);
check("list: posted line isn't a due date", parseListDate("Posted Monday, Oct 1, 2018", now), null);

check("page: today, time only", parseDueLine(`Due 11:59${nnbsp}PM`, now), "2026-10-16T23:59");
check("page: yesterday", parseDueLine(`Due Yesterday, 2:55${nnbsp}AM`, now), "2026-10-15T02:55");
check("page: month and day", parseDueLine(`Due Oct 13, 9:10${nnbsp}AM`, now), "2026-10-13T09:10");
check("page: noon is 12 PM", parseDueLine("Due Oct 20, 12:00 PM", now), "2026-10-20T12:00");
check("page: midnight is 12 AM", parseDueLine("Due Oct 20, 12:05 AM", now), "2026-10-20T00:05");
check("page: date with no time", parseDueLine("Due Oct 20", now), "2026-10-20T23:59");
check("page: explicit year", parseDueLine("Due Jan 5, 2027, 8:00 AM", now), "2027-01-05T08:00");

// Year closest to today, across New Year.
check("year: January seen in December", parseListDate("Tuesday, Jan 5", "2026-12-20T12:00"), { date: "2027-01-05", time: null });
check("year: December seen in January", parseDueLine("Due Dec 18, 9:00 AM", "2027-01-04T12:00"), "2026-12-18T09:00");

process.exit(fail ? 1 : 0);
