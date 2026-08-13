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

  const hiddenRoots = new Map(); // root element -> {placeholder, prevDisplay}

  // Only used when the popup toggle is switched off on an open page.
  const revealRoot = (root) => {
    const entry = hiddenRoots.get(root);
    if (!entry) return;
    entry.placeholder.remove();
    root.style.removeProperty("display");
    if (entry.prevDisplay) root.style.display = entry.prevDisplay;
    hiddenRoots.delete(root);
  };

  const hideRoot = (root) => {
    if (!root || hiddenRoots.has(root)) return;
    // An already-hidden ancestor makes this a no-op (its placeholder would be
    // invisible anyway).
    for (const existing of hiddenRoots.keys())
      if (existing !== root && existing.contains(root)) return;
    const placeholder = FVB.buildHiddenPlaceholder(document);
    hiddenRoots.set(root, { placeholder, prevDisplay: root.style.display });
    root.style.setProperty("display", "none", "important");
    (root.parentElement || document.body)?.insertBefore(placeholder, root);
  };

  // A video's whole feed post disappears when possible; outside a feed
  // (stories viewer, embedded players) fall back to the player-sized wrapper.
  const considerVideo = (video) => {
    if (!settings.hideVideos) return;
    const unit = FVB.findFeedUnit(video);
    if (unit) {
      hideRoot(unit);
      return;
    }
    const rect = video.getBoundingClientRect();
    if (rect.width && rect.height) {
      hideRoot(FVB.findHideRoot(video));
    } else {
      // Player not laid out yet — hide as soon as it gets a size.
      const ro = new ResizeObserver(() => {
        const r = video.getBoundingClientRect();
        if (!r.width || !r.height) return;
        ro.disconnect();
        if (settings.hideVideos) hideRoot(FVB.findHideRoot(video));
      });
      ro.observe(video);
    }
  };

  // Posts linking to video content (a Reels shelf, a /videos/ or /watch
  // permalink) are hidden before Facebook even attaches a player — it shows
  // a clickable thumbnail first. Links outside a feed unit (nav) are ignored.
  const considerLink = (a) => {
    if (!settings.hideVideos) return;
    if (!FVB.isVideoLink(a.getAttribute("href"), location.href)) return;
    hideRoot(FVB.findFeedUnit(a));
  };

  // Facebook marks player containers with aria-label="Video player" even
  // before the <video> element exists.
  const PLAYER_MARKER = '[aria-label="Video player" i]';

  const considerMarker = (el) => {
    if (!settings.hideVideos) return;
    hideRoot(FVB.findFeedUnit(el) || FVB.findHideRoot(el));
  };

  const scanNode = (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName === "VIDEO") considerVideo(node);
    for (const v of node.querySelectorAll("video")) considerVideo(v);
    if (node.tagName === "A") considerLink(node);
    for (const a of node.querySelectorAll("a[href]")) considerLink(a);
    if (node.matches(PLAYER_MARKER)) considerMarker(node);
    for (const el of node.querySelectorAll(PLAYER_MARKER)) considerMarker(el);
  };

  new MutationObserver((mutations) => {
    if (!settings.hideVideos) return;
    for (const m of mutations) for (const n of m.addedNodes) scanNode(n);
  }).observe(document.documentElement, { childList: true, subtree: true });

  const applyHideSetting = () => {
    if (settings.hideVideos) {
      scanNode(document.documentElement);
    } else {
      for (const root of [...hiddenRoots.keys()]) revealRoot(root);
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
