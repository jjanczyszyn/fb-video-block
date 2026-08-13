const DEFAULTS = { blockAutoplay: true, blockPages: true };

const checkboxes = ["blockAutoplay", "blockPages"].map((id) =>
  document.getElementById(id)
);

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const box of checkboxes) box.checked = Boolean(settings[box.id]);
});

for (const box of checkboxes) {
  box.addEventListener("change", () => {
    chrome.storage.sync.set({ [box.id]: box.checked });
  });
}
