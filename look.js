// Theme and scale for every page of the extension (step 4).
// The theme starts as Chrome's own light or dark appearance the first time a page
// opens, then stays whatever you pick in settings. It doesn't follow later changes.

import { loadState } from "./lib.js";

function apply({ theme, scale }) {
  const root = document.documentElement;
  root.dataset.theme = theme === "dark" ? "dark" : "light";
  root.style.zoom = String((scale || 100) / 100);
}

export async function applyLook() {
  let { theme, scale } = await loadState();
  if (theme !== "light" && theme !== "dark") {
    theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    await chrome.storage.local.set({ theme });
  }
  apply({ theme, scale });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(changes.theme || changes.scale)) return;
    loadState().then(apply);
  });
}
