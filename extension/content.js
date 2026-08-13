// Isolated-world content script: syncs settings to the page, hides video
// players, and manages the Reels/Watch interstitial. The MAIN-world script
// (injected.js) does the actual play() blocking.
(() => {
  let settings = { ...FVB.DEFAULT_SETTINGS };

  const applySettingsToPage = () => {
    document.documentElement.dataset.fvbBlockAutoplay = String(
      settings.blockAutoplay
    );
  };

  // ---- Hide video players entirely (runs in every frame) ----

  const hiddenVideos = new Map(); // video -> {root, placeholder, prevDisplay}

  // Only used when the popup toggle is switched off on an open page.
  const revealVideo = (video) => {
    const entry = hiddenVideos.get(video);
    if (!entry) return;
    entry.placeholder.remove();
    entry.root.style.removeProperty("display");
    if (entry.prevDisplay) entry.root.style.display = entry.prevDisplay;
    hiddenVideos.delete(video);
  };

  const hideVideo = (video) => {
    if (hiddenVideos.has(video)) return;
    const root = FVB.findHideRoot(video);
    const placeholder = FVB.buildHiddenPlaceholder(document);
    hiddenVideos.set(video, {
      root,
      placeholder,
      prevDisplay: root.style.display,
    });
    root.style.setProperty("display", "none", "important");
    (root.parentElement || document.body)?.insertBefore(placeholder, root);
  };

  const considerVideo = (video) => {
    if (!settings.hideVideos || hiddenVideos.has(video)) return;
    const rect = video.getBoundingClientRect();
    if (rect.width && rect.height) {
      hideVideo(video);
    } else {
      // Player not laid out yet — hide as soon as it gets a size.
      const ro = new ResizeObserver(() => {
        const r = video.getBoundingClientRect();
        if (!r.width || !r.height) return;
        ro.disconnect();
        if (settings.hideVideos) hideVideo(video);
      });
      ro.observe(video);
    }
  };

  const scanForVideos = (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName === "VIDEO") considerVideo(node);
    for (const v of node.querySelectorAll("video")) considerVideo(v);
  };

  new MutationObserver((mutations) => {
    if (!settings.hideVideos) return;
    for (const m of mutations)
      for (const n of m.addedNodes) scanForVideos(n);
  }).observe(document.documentElement, { childList: true, subtree: true });

  const applyHideSetting = () => {
    if (settings.hideVideos) {
      scanForVideos(document.documentElement);
    } else {
      for (const video of [...hiddenVideos.keys()]) revealVideo(video);
    }
  };

  // ---- Reels / Watch page interstitial (top frame only) ----

  let updateOverlay = () => {};

  if (window === window.top) {
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
      });
      (document.body || document.documentElement).appendChild(overlay);
    };

    updateOverlay = () => {
      const shouldBlock =
        settings.blockPages && FVB.isBlockedPath(location.pathname);
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
  }

  // ---- Settings ----

  chrome.storage.sync.get(FVB.DEFAULT_SETTINGS, (stored) => {
    settings = { ...FVB.DEFAULT_SETTINGS, ...stored };
    applySettingsToPage();
    applyHideSetting();
    updateOverlay();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue;
    }
    applySettingsToPage();
    applyHideSetting();
    updateOverlay();
  });
})();
