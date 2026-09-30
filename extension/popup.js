const DEFAULTS = FVB.DEFAULT_SETTINGS;

const checkboxes = Object.keys(DEFAULTS).map((id) =>
  document.getElementById(id)
);

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const box of checkboxes) box.checked = Boolean(settings[box.id]);
  renderFriends();
});

for (const box of checkboxes) {
  box.addEventListener("change", () => {
    chrome.storage.sync.set({ [box.id]: box.checked });
    renderFriends();
  });
}

// ---- Friend list ----

const friendCount = document.getElementById("friendCount");
const friendWarn = document.getElementById("friendWarn");
const extraFriends = document.getElementById("extraFriends");

function renderFriends() {
  chrome.storage.local.get({ friends: [], extraFriends: "" }, (local) => {
    const synced = local.friends.length;
    const manual = FVB.parseFriendsText(local.extraFriends).length;
    friendCount.textContent = synced
      ? `${synced} friends synced from Facebook` +
        (manual ? `, plus ${manual} added by hand.` : ".")
      : manual
        ? `${manual} friends added by hand.`
        : "No friends synced yet. Sync opens your Facebook friend list; scroll it to the end.";
    const friendOptionOn =
      document.getElementById("allowFriends").checked ||
      document.getElementById("friendsOnly").checked;
    friendWarn.hidden = !(friendOptionOn && synced + manual === 0);
    chrome.storage.local.get({ lastFriendSync: 0 }, ({ lastFriendSync }) => {
      if (lastFriendSync)
        lastSync.textContent = `New friends are added from your notifications and the requests you confirm. Full re-scan monthly; last one ${ago(Date.now() - lastFriendSync)}.`;
    });
    if (document.activeElement !== extraFriends)
      extraFriends.value = local.extraFriends;
  });
}

document.getElementById("syncFriends").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "fvb-sync-now" });
});

const lastSync = document.getElementById("lastSync");
const ago = (ms) => {
  const h = Math.round(ms / 3600000);
  if (h < 1) return "less than an hour ago";
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
};

document.getElementById("clearFriends").addEventListener("click", () => {
  chrome.storage.local.set({ friends: [], allowedVideos: [] }, renderFriends);
});

let saveTimer;
extraFriends.addEventListener("input", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ extraFriends: extraFriends.value }, renderFriends);
  }, 300);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.friends || changes.lastFriendSync))
    renderFriends();
});
