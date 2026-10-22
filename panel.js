// The list: three views in one page (list, add, task).
// Every view reads from chrome.storage.local and writes back to it.
// The same page is the side panel, the popup (?view=popup), and the full page (?view=page).

import {
  loadVisible,
  loadState,
  saveTasks,
  deleteTask,
  nowCentral,
  taskStatus,
  sortTasks,
  visibleTasks,
  formatDate,
  formatTime,
  datePart,
  timePart,
  makeId,
  formatRefreshTime,
} from "./lib.js";
import { applyLook } from "./look.js";
import { timeField } from "./timefield.js";

const app = document.getElementById("app");

const mode = new URLSearchParams(location.search).get("view");
if (mode === "popup" || mode === "page") document.documentElement.classList.add(`view-${mode}`);
applyLook();

// To show the Google Classroom logo on the task page, put Google's official logo
// image in this folder (for example assets/classroom-logo.png) and set this to
// that path. Left as null, the task page shows a plain text link instead.
const CLASSROOM_LOGO_FILE = null;

// Current view: { name: "list" } | { name: "add" } | { name: "task", id }
let view = { name: "list" };

// ---------- Tiny DOM helper ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(child));
  }
  return el;
}

function go(next) {
  view = next;
  render();
}

// ---------- Rendering ----------
async function render() {
  const { tasks, nowStr } = await loadVisible();
  const { refreshState = null } = await chrome.storage.local.get("refreshState");
  app.replaceChildren();
  if (view.name === "add") return renderAdd(tasks);
  if (view.name === "task") {
    const task = tasks.find((t) => t.id === view.id);
    if (task) return renderTask(task, tasks, nowStr);
    view = { name: "list" }; // task was deleted or expired
  }
  renderList(tasks, nowStr, refreshState);
}

function renderList(tasks, nowStr, refreshState) {
  const refreshing = Boolean(refreshState?.running);
  app.append(
    h(
      "div",
      { class: "header" },
      h("h1", {}, "Deadlines"),
      h(
        "button",
        {
          class: `icon-btn${refreshing ? " spinning" : ""}`,
          title: refreshing ? "Reading Classroom..." : "Re-read Classroom now",
          "aria-label": refreshing ? "Reading Classroom" : "Re-read Classroom now",
          disabled: refreshing,
          onclick: () => {
            chrome.runtime.sendMessage({ type: "refresh" }).catch((err) => {
              console.error("Couldn't start a refresh:", err);
            });
          },
        },
        h("span", {}, "↻")
      ),
      h(
        "button",
        {
          class: "icon-btn",
          title: "Settings",
          "aria-label": "Settings",
          onclick: () => chrome.runtime.openOptionsPage(),
        },
        "⚙"
      ),
      h(
        "button",
        {
          class: "icon-btn primary",
          title: "Add a task",
          "aria-label": "Add a task",
          onclick: () => go({ name: "add" }),
        },
        "+"
      )
    )
  );

  app.append(refreshStatus(refreshState));
  if (refreshState?.signedOut && !refreshing) app.append(signInBanner());

  const shown = sortTasks(visibleTasks(tasks, nowStr), nowStr);
  if (shown.length === 0) {
    app.append(h("div", { class: "empty" }, "No tasks yet. Press + to add one."));
    return;
  }

  app.append(
    h(
      "div",
      { class: "list" },
      shown.map((task) => {
        const status = taskStatus(task, nowStr);
        return h(
          "button",
          {
            class: `task state-${status.state}`,
            onclick: () => go({ name: "task", id: task.id }),
          },
          h(
            "div",
            { class: "task-top" },
            h("div", { class: "task-title" }, task.title),
            h("span", { class: "badge" }, status.label)
          ),
          h("div", { class: "task-meta" }, `${task.className} · ${formatDate(task.due)}`),
          task.notOnClassroom ? h("div", { class: "task-note" }, "Not on Classroom") : null
        );
      })
    )
  );
}

// One line under the header saying when Classroom was last read.
function refreshStatus(state) {
  let text;
  if (!state) text = "Not read from Classroom yet. Press ↻ to read it now.";
  else if (state.running) text = "Reading Classroom...";
  else if (state.ok) text = `Updated from Classroom ${formatRefreshTime(state.finishedAt)}.`;
  else if (state.signedOut) text = "Couldn't read Classroom.";
  else text = `Couldn't read Classroom ${formatRefreshTime(state.finishedAt)}: ${state.error} Press ↻ to try again.`;
  return h("div", { class: "refresh-status", role: "status" }, text);
}

function signInBanner() {
  return h(
    "div",
    { class: "banner" },
    h("div", {}, "Sign in to Google Classroom in this Chrome profile so your assignments can update."),
    h(
      "button",
      {
        class: "btn primary",
        onclick: () => chrome.tabs.create({ url: "https://classroom.google.com/" }),
      },
      "Sign in to Classroom"
    )
  );
}

function backHeader(title, right) {
  return h(
    "div",
    { class: "header" },
    h(
      "button",
      {
        class: "icon-btn",
        title: "Back",
        "aria-label": "Back to the list",
        onclick: () => go({ name: "list" }),
      },
      "←"
    ),
    h("h1", {}, title),
    right
  );
}

function field(id, label, input, listId) {
  return h("div", { class: "field" }, h("label", { for: id }, label), input);
}

function classOptions(tasks) {
  const names = [...new Set(tasks.map((t) => t.className).filter(Boolean))].sort();
  return h(
    "datalist",
    { id: "class-options" },
    names.map((n) => h("option", { value: n }))
  );
}

// ---------- Add page ----------
function renderAdd(tasks) {
  const title = h("input", { id: "f-title", type: "text", required: true, maxlength: "200" });
  const cls = h("input", {
    id: "f-class",
    type: "text",
    required: true,
    maxlength: "100",
    list: "class-options",
  });
  const date = h("input", { id: "f-date", type: "date", required: true });
  const time = timeField("f-time");
  const error = h("div", { class: "error", role: "alert" });

  const form = h(
    "form",
    {
      class: "page",
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const t = title.value.trim();
        const c = cls.value.trim();
        if (!t || !c || !date.value || !time.value) {
          error.textContent = "Fill in the title, class, due date, and due time.";
          return;
        }
        const { tasks: current } = await loadState();
        current.push({
          id: makeId("manual"),
          title: t,
          className: c,
          due: `${date.value}T${time.value}`,
          url: "",
          source: "manual",
          done: false,
          turnedInSeenAt: null,
          edited: [],
        });
        await saveTasks(current);
        go({ name: "list" });
      },
    },
    field("f-title", "Title", title),
    field("f-class", "Class", cls),
    h(
      "div",
      { class: "field-row" },
      field("f-date", "Due date", date),
      field("f-time", "Due time", time)
    ),
    error,
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn primary", type: "submit" }, "Add task"),
      h("button", { class: "btn", type: "button", onclick: () => go({ name: "list" }) }, "Cancel")
    ),
    classOptions(tasks)
  );

  app.append(backHeader("Add a task"), form);
  title.focus();
}

// ---------- Task page ----------
function renderTask(task, tasks, nowStr) {
  const status = taskStatus(task, nowStr);

  const trash = h(
    "button",
    {
      class: "icon-btn danger",
      title: "Delete this task",
      "aria-label": "Delete this task",
      onclick: async () => {
        if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
        await deleteTask(task.id);
        go({ name: "list" });
      },
    },
    "🗑"
  );

  const error = h("div", { class: "error", role: "alert" });

  const statusText = h("span", {}, `${formatDate(task.due)}, ${formatTime(task.due)}`);
  const statusBadge = h("span", { class: "badge" }, status.label);
  const statusLine = h("div", { class: `status-line state-${status.state}` }, statusText, statusBadge);

  // Saves one edited field. Edits are remembered in `edited` so a later
  // Classroom refresh never overwrites them.
  async function update(mutator, editedField) {
    const { tasks: current, devPretend } = await loadState();
    const target = current.find((t) => t.id === task.id);
    if (!target) return;
    mutator(target, nowCentral(devPretend));
    if (editedField && !target.edited.includes(editedField)) target.edited.push(editedField);
    await saveTasks(current);
    // Keep this page's status line in step with what was just saved.
    const fresh = taskStatus(target, nowCentral(devPretend));
    statusLine.className = `status-line state-${fresh.state}`;
    statusText.textContent = `${formatDate(target.due)}, ${formatTime(target.due)}`;
    statusBadge.textContent = fresh.label;
  }

  const title = h("input", { id: "t-title", type: "text", value: task.title, maxlength: "200" });
  const cls = h("input", {
    id: "t-class",
    type: "text",
    value: task.className,
    maxlength: "100",
    list: "class-options",
  });
  const date = h("input", { id: "t-date", type: "date", value: datePart(task.due) });
  const time = timeField("t-time");
  time.value = timePart(task.due);

  title.addEventListener("change", () => {
    const v = title.value.trim();
    if (!v) {
      error.textContent = "The title can't be empty.";
      title.value = task.title;
      return;
    }
    error.textContent = "";
    update((t) => (t.title = v), "title");
  });
  cls.addEventListener("change", () => {
    const v = cls.value.trim();
    if (!v) {
      error.textContent = "The class can't be empty.";
      cls.value = task.className;
      return;
    }
    error.textContent = "";
    update((t) => (t.className = v), "className");
  });
  function dueChanged() {
    if (!date.value || !time.value) {
      error.textContent = "The due date and due time can't be empty.";
      date.value = datePart(task.due);
      time.value = timePart(task.due);
      return;
    }
    error.textContent = "";
    update((t) => (t.due = `${date.value}T${time.value}`), "due");
  }
  date.addEventListener("change", dueChanged);
  time.addEventListener("change", dueChanged);

  const check = h("input", {
    id: "t-done",
    type: "checkbox",
    checked: task.done,
    onchange: (e) => {
      const done = e.target.checked;
      update((t, now) => {
        t.done = done;
        t.turnedInSeenAt = done ? now : null;
      }, "done");
    },
  });

  // The official Classroom logo isn't bundled. Until you add the file and set
  // CLASSROOM_LOGO_FILE (top of this file), the link shows as text only.
  let classroomLink = null;
  if (task.source === "classroom" && task.url) {
    classroomLink = h(
      "a",
      { class: "classroom-link", href: task.url, target: "_blank", rel: "noopener" },
      CLASSROOM_LOGO_FILE ? h("img", { src: CLASSROOM_LOGO_FILE, alt: "" }) : null,
      h("span", {}, "Open in Google Classroom")
    );
  }

  app.append(
    backHeader("Task", trash),
    h(
      "div",
      { class: "page" },
      statusLine,
      task.notOnClassroom
        ? h(
            "div",
            { class: "task-note" },
            "This assignment is no longer on Classroom. Delete it if it's gone for good."
          )
        : null,
      field("t-title", "Title", title),
      field("t-class", "Class", cls),
      h(
        "div",
        { class: "field-row" },
        field("t-date", "Due date", date),
        field("t-time", "Due time", time)
      ),
      error,
      h("label", { class: "check-row", for: "t-done" }, check, "Mark as done"),
      classroomLink,
      h("div", { class: "hint" }, "Changes save automatically."),
      classOptions(tasks)
    )
  );
}

// ---------- Keep the view fresh ----------
// Redraw when storage changes (but not while typing in a form field),
// and once a minute so colors change at the due time.
function safeRender() {
  // On the add and task pages, never redraw over a form the user is filling in.
  if (view.name === "list") render();
  else if (!document.activeElement || document.activeElement.tagName !== "INPUT") render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") safeRender();
});
setInterval(safeRender, 60 * 1000);

render();
