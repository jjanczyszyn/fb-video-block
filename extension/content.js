// Isolated-world content script: syncs settings to the page and manages the
// Reels/Watch interstitial. The MAIN-world script (injected.js) does the
// actual play() blocking.
(() => {
  let settings = { ...FVB.DEFAULT_SETTINGS };

  const applySettingsToPage = () => {
    document.documentElement.dataset.fvbBlockAutoplay = String(
      settings.blockAutoplay
    );
  };

  chrome.storage.sync.get(FVB.DEFAULT_SETTINGS, (stored) => {
    settings = { ...FVB.DEFAULT_SETTINGS, ...stored };
    applySettingsToPage();
    updateOverlay();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue;
    }
    applySettingsToPage();
    updateOverlay();
  });

  // ---- Reels / Watch page interstitial (top frame only) ----
  if (window !== window.top) return;

  const BYPASS_KEY = "fvb-bypass";
  const bypassed = () => sessionStorage.getItem(BYPASS_KEY) === location.href;

  let overlay = null;

  const removeOverlay = () => {
    overlay?.remove();
    overlay = null;
  };

  const showOverlay = () => {
    if (overlay) return;
    overlay = FVB.buildOverlay(document, {
      onBack: () => {
        if (history.length > 1) history.back();
        else location.href = "https://www.facebook.com/";
      },
      onBypass: () => {
        sessionStorage.setItem(BYPASS_KEY, location.href);
        removeOverlay();
      },
    });
    (document.body || document.documentElement).appendChild(overlay);
  };

  const updateOverlay = () => {
    const shouldBlock =
      settings.blockPages && FVB.isBlockedPath(location.pathname) && !bypassed();
    if (shouldBlock) showOverlay();
    else removeOverlay();
  };

  // Facebook is a SPA; watch for soft navigations.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      updateOverlay();
    }
  }, 400);
  window.addEventListener("popstate", updateOverlay);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateOverlay);
  } else {
    updateOverlay();
  }
})();
