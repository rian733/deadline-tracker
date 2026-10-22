// Run: node tests/timefield.test.mjs
import { maskTypedTime, typedTimeText } from "../lib.js";

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) fail++; };
// [what's in the box, deleting?, text, ghost, value]
const cases = [
  ["", false, "", "--:-- AM/PM", ""],
  ["0", false, "0", "-:-- AM/PM", ""],
  ["05", false, "05", ":-- AM/PM", ""],
  ["053", false, "05:3", "- AM/PM", ""],
  ["05:30", false, "05:30", " AM/PM", ""],
  ["05:30p", false, "05:30 PM", "", "17:30"],
  ["05:30a", false, "05:30 AM", "", "05:30"],
  ["12:00a", false, "12:00 AM", "", "00:00"],
  ["12:15p", false, "12:15 PM", "", "12:15"],
  ["5", false, "05", ":-- AM/PM", ""],
  ["1:", false, "01", ":-- AM/PM", ""],
  ["057", false, "05:07", " AM/PM", ""],
  ["29", false, "2", "-:-- AM/PM", ""],
  ["13", false, "13", ":--", ""],
  ["1345", false, "13:45", "", "13:45"],
  ["1345p", false, "13:45", "", "13:45"],
  ["00:05", false, "00:05", "", "00:05"],
  ["05p", false, "05", ":-- AM/PM", ""],
  ["05:30 P", true, "05:30", " AM/PM", ""],
  ["05:30 PM", true, "05:30 PM", "", "17:30"],
  ["3:45 pm", false, "03:45 PM", "", "15:45"],
  ["05:301", false, "05:30", " AM/PM", ""],
];
for (const [raw, del, text, ghost, value] of cases) {
  const r = maskTypedTime(raw, del);
  check(`"${raw}"${del ? " (backspace)" : ""} -> "${text}" + "${ghost}" = ${value || "none"}`,
    r.text === text && r.ghost === ghost && r.value === value);
}
check("show 17:30", typedTimeText("17:30") === "05:30 PM");
check("show 00:00", typedTimeText("00:00") === "12:00 AM");
check("show 12:05", typedTimeText("12:05") === "12:05 PM");
check("show none", typedTimeText("") === "");
for (const v of ["00:00", "07:05", "12:30", "23:59"]) {
  check(`round trip ${v}`, maskTypedTime(typedTimeText(v)).value === v);
}

if (fail) { console.log(`${fail} failed`); process.exit(1); }
