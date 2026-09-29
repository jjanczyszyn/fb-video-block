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
    if (document.activeElement !== extraFriends)
      extraFriends.value = local.extraFriends;
  });
}

document.getElementById("syncFriends").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.facebook.com/friends/list" });
});

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
  if (area === "local" && changes.friends) renderFriends();
});
