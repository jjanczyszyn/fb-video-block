// Service worker: full friend-list re-scans. Once a month (triggered by any
// visible Facebook tab) it opens facebook.com/friends/list in a background
// tab; content.js scrolls it to the end and sends the list back here. New
// friends in between are picked up by content.js from notifications and
// Confirm clicks.
importScripts("lib.js");

const SESSION_DEFAULTS = { syncTabId: null };

const getSyncTab = async () =>
  (await chrome.storage.session.get(SESSION_DEFAULTS)).syncTabId;

let opening = null; // guards against two tabs asking at the same moment

const startSync = ({ active }) => {
  if (opening) return opening;
  opening = (async () => {
    const existing = await getSyncTab();
    if (existing !== null) {
      try {
        await chrome.tabs.get(existing);
        return; // already syncing
      } catch {
        // stale id: tab is gone
      }
    }
    await chrome.storage.local.set({ lastFriendSyncAttempt: Date.now() });
    const tab = await chrome.tabs.create({ url: FVB.FRIENDS_LIST_URL, active });
    await chrome.storage.session.set({ syncTabId: tab.id });
  })().finally(() => {
    opening = null;
  });
  return opening;
};

const maybeSync = async () => {
  const settings = await chrome.storage.sync.get(FVB.DEFAULT_SETTINGS);
  const state = await chrome.storage.local.get({
    lastFriendSync: 0,
    lastFriendSyncAttempt: 0,
  });
  if (FVB.shouldAutoSync(settings, state, Date.now()))
    await startSync({ active: false });
};

const finishSync = async (tabId, harvested) => {
  if ((await getSyncTab()) !== tabId) return;
  await chrome.storage.session.set({ syncTabId: null });
  if (harvested.length) {
    const { friends } = await chrome.storage.local.get({ friends: [] });
    await chrome.storage.local.set({
      friends: FVB.resolveSyncedFriends(friends, harvested),
      lastFriendSync: Date.now(),
    });
  }
  chrome.tabs.remove(tabId).catch(() => {});
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  switch (msg?.type) {
    case "fvb-maybe-sync":
      maybeSync().finally(() => sendResponse(true));
      return true;
    case "fvb-sync-now": // popup button: visible tab, ignores the daily timer
      startSync({ active: true }).finally(() => sendResponse(true));
      return true;
    case "fvb-is-sync-tab":
      getSyncTab().then((id) => sendResponse(id !== null && id === tabId));
      return true;
    case "fvb-sync-done":
      finishSync(tabId, Array.isArray(msg.friends) ? msg.friends : []).finally(
        () => sendResponse(true)
      );
      return true;
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if ((await getSyncTab()) === tabId)
    await chrome.storage.session.set({ syncTabId: null });
});
