// Background script (service worker).
// Step 1: it only makes the toolbar icon open the side panel.
// Reminders (step 2) and Classroom refresh (step 3) will be added here.

function enableSidePanelOnIconClick() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("setPanelBehavior failed:", err));
}

chrome.runtime.onInstalled.addListener(enableSidePanelOnIconClick);
chrome.runtime.onStartup.addListener(enableSidePanelOnIconClick);
