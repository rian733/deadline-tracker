// A typed time box with only hours and minutes (Chrome's own time box can show a
// seconds part that can't be filled in, which blocks saving).
// The faint "--:-- AM/PM" stays in the box while you type: each character you type
// replaces the faint one under it, so "05" shows as "05" + faint ":-- AM/PM".
// It acts like a time input: `.value` reads and sets "HH:mm" (24-hour, "" while
// incomplete), and it sends a "change" event when you leave the box.
// The tidying rules are in maskTypedTime (lib.js).

import { maskTypedTime, typedTimeText } from "./lib.js";

// `id` goes on the text box, so a <label for=id> points at it.
export function timeField(id) {
  const typed = document.createElement("input");
  typed.type = "text";
  typed.className = "time-typed";
  typed.autocomplete = "off";
  typed.spellcheck = false;
  typed.inputMode = "text";
  typed.maxLength = 8;
  typed.setAttribute("aria-label", "Time, like 05:30 PM");
  if (id) typed.id = id;

  // The faint template sits behind the box. Its first part is the typed text,
  // hidden, so the faint rest lines up right after what you typed.
  const typedCopy = document.createElement("span");
  typedCopy.className = "time-ghost-typed";
  const rest = document.createElement("span");
  const ghost = document.createElement("span");
  ghost.className = "time-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.append(typedCopy, rest);

  const wrap = document.createElement("span");
  wrap.className = "time-field";
  wrap.append(ghost, typed);

  let current = maskTypedTime("");
  function show(result) {
    current = result;
    typed.value = result.text;
    typedCopy.textContent = result.text;
    rest.textContent = result.ghost;
  }
  show(current);

  typed.addEventListener("input", (e) => {
    show(maskTypedTime(typed.value, e.inputType?.startsWith("delete")));
    typed.removeAttribute("aria-invalid");
  });

  // Leaving the box with a half-typed time marks it red.
  typed.addEventListener("change", () => {
    if (current.text && !current.value) typed.setAttribute("aria-invalid", "true");
  });

  Object.defineProperty(wrap, "value", {
    get() {
      return current.value;
    },
    set(v) {
      show(maskTypedTime(typedTimeText(v)));
      typed.removeAttribute("aria-invalid");
    },
  });
  return wrap;
}
