// Classroom reader (step 3).
// The background script injects this into a Classroom tab, then calls
// deadlineReader.readList() or deadlineReader.readDetails(). The developer tools
// also load it to run on the saved pages in test-pages/.
//
// It only collects text from the page. Turning that text into dates and tasks
// happens in lib.js (parseReaderRows), where it can be tested in Node.
//
// What Classroom's To-do pages look like (checked against saved pages, Oct 16):
// - Each group (This week, Next week, Earlier, ...) is a div with `jsshadow` and
//   `data-id`. Its heading's button has an aria-label like "Next week 8" (the real total).
// - Each group shows 5 rows, then a "View all" button for the rest.
// - Each row is li[data-role="task-row"]: a link to the assignment, then <p> lines:
//   title, class, and a date ("Monday, Oct 19") or "Posted ..." or a grade.
// - Pages viewed earlier in the same tab stay in the page, hidden with aria-hidden.
//   Only visible ones are read.

(() => {
  const WAIT_FOR_PAGE_MS = 20000;
  const VIEW_ALL_ROUNDS = 40;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function clean(text) {
    return (text || "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
  }

  function isShown(el) {
    return !el.closest('[aria-hidden="true"]');
  }

  // ---------- To-do list pages ----------

  function groupsIn(doc) {
    return [...doc.querySelectorAll("div[jsshadow][data-id]")].filter(isShown);
  }

  // The group's real total, from the heading ("Next week 8"), or null.
  function groupCount(group) {
    const label = group.querySelector("button[aria-label]")?.getAttribute("aria-label") || "";
    const m = /(\d+)$/.exec(label.trim());
    if (m) return Number(m[1]);
    const badge = group.querySelector(".I2pI");
    return badge && /^\d+$/.test(clean(badge.textContent)) ? Number(clean(badge.textContent)) : null;
  }

  // The numeric id Classroom uses for an assignment. Rows carry it as
  // data-stream-item-id; the link carries the same number in base64.
  function itemId(row, url) {
    const el = row.querySelector("[data-stream-item-id]");
    if (el) return el.getAttribute("data-stream-item-id");
    const m = /\/c\/[^/]+\/[a-z]+\/([^/]+)\/details/.exec(url || "");
    if (!m) return null;
    try {
      const decoded = atob(m[1]);
      return /^\d+$/.test(decoded) ? decoded : m[1];
    } catch {
      return m[1];
    }
  }

  function readRow(row) {
    const link = row.querySelector('a[href*="/details"]') || row.querySelector("a[href]");
    const url = link ? link.href : "";
    const lines = [...row.querySelectorAll("p")].map((p) => clean(p.textContent)).filter(Boolean);
    return {
      id: itemId(row, url),
      url,
      title: lines[0] || "",
      className: lines[1] || "",
      // Everything after the title and class: the date line, "Posted ...", or a grade.
      // A date line also repeats as two smaller lines ("Today", "11:59 PM").
      other: lines.slice(2),
    };
  }

  // Reads the page as it is right now, without clicking anything.
  function readListNow(doc = document) {
    const groups = groupsIn(doc).map((group) => {
      const rows = [...group.querySelectorAll('li[data-role="task-row"]')].map(readRow);
      return { id: group.getAttribute("data-id"), count: groupCount(group), rows };
    });
    const complete = groups.length > 0 && groups.every((g) => g.count !== null && g.rows.length >= g.count);
    return { url: doc.location ? doc.location.href : "", groups, complete };
  }

  function viewAllButtons(doc) {
    return [...doc.querySelectorAll("button")].filter(
      (b) => isShown(b) && clean(b.textContent) === "View all"
    );
  }

  function rowTotal(doc) {
    return groupsIn(doc).reduce((n, g) => n + g.querySelectorAll('li[data-role="task-row"]').length, 0);
  }

  // Waits for the list to appear, clicks every "View all" until every group shows
  // all its rows (or nothing more loads), then reads it.
  async function readList() {
    const start = Date.now();
    while (groupsIn(document).length === 0) {
      if (Date.now() - start > WAIT_FOR_PAGE_MS) return { ...readListNow(), error: "no-list" };
      await sleep(250);
    }
    await sleep(500); // let the counts settle

    let stuck = 0;
    for (let round = 0; round < VIEW_ALL_ROUNDS && stuck < 3; round++) {
      if (readListNow().complete) break;
      const before = rowTotal(document);
      const buttons = viewAllButtons(document);
      buttons.forEach((b) => b.click());
      // Some lists load more as you scroll, so scroll the last row into view too.
      const rows = document.querySelectorAll('li[data-role="task-row"]');
      rows[rows.length - 1]?.scrollIntoView({ block: "end" });
      const waitStart = Date.now();
      while (rowTotal(document) === before && Date.now() - waitStart < 3000) await sleep(250);
      stuck = rowTotal(document) === before ? stuck + 1 : 0;
    }
    return readListNow();
  }

  // ---------- Assignment pages ----------
  // The due line is plain text like "Due 11:59 PM", "Due Yesterday, 2:55 AM" or
  // "Due Oct 13, 9:10 AM", next to the points. The title is the page's <h1>.

  function readDetailsNow(doc = document) {
    const main = [...doc.querySelectorAll('[role="main"]')].find(isShown);
    if (!main) return null;
    const heading = [...main.querySelectorAll("h1")].find((h) => isShown(h) && clean(h.textContent));
    const idEl = main.querySelector("[data-stream-item-id]");
    let dueText = null;
    const walker = doc.createTreeWalker(main, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = clean(node.textContent);
      if (/^Due\b/i.test(text) && text.length < 40 && isShown(node.parentElement)) {
        dueText = text;
        break;
      }
    }
    return {
      id: idEl ? idEl.getAttribute("data-stream-item-id") : null,
      title: heading ? clean(heading.textContent) : "",
      dueText,
    };
  }

  async function readDetails() {
    const start = Date.now();
    let found = readDetailsNow();
    while (!found?.title && Date.now() - start < WAIT_FOR_PAGE_MS) {
      await sleep(250);
      found = readDetailsNow();
    }
    // The due line can draw a moment after the title.
    const dueStart = Date.now();
    while (found && !found.dueText && Date.now() - dueStart < 1500) {
      await sleep(250);
      found = readDetailsNow();
    }
    return found || { id: null, title: "", dueText: null, error: "no-page" };
  }

  globalThis.deadlineReader = { readList, readListNow, readDetails, readDetailsNow };
})();
