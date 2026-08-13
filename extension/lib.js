// Pure, testable helpers shared by the content script and the unit tests.
const FVB = {
  DEFAULT_SETTINGS: {
    blockAutoplay: true,
    blockPages: true,
    hideVideos: true,
  },

  // Paths that are pure video rabbit holes on facebook.com.
  isBlockedPath(pathname) {
    return /^\/(reel|reels|watch)(\/|$)/.test(pathname);
  },

  // Does this link point at video content (a reel, a watch page, or a
  // /videos/ permalink)? Used to hide whole feed posts before their player —
  // or even a poster thumbnail — renders. Only same-site/facebook links count.
  isVideoLink(href, base) {
    if (!href) return false;
    let url;
    try {
      url = new URL(href, base);
    } catch {
      return false;
    }
    const sameSite =
      url.origin === new URL(base).origin ||
      /(^|\.)facebook\.com$/.test(url.hostname);
    if (!sameSite) return false;
    return (
      /^\/(reel|reels|watch)(\/|$)/.test(url.pathname) ||
      /^\/share\/[vr]\//.test(url.pathname) ||
      /\/videos?\//.test(url.pathname)
    );
  },

  // Finds the whole feed post (or shelf) an element belongs to. Facebook's
  // 2026 feed wraps each unit in [data-virtualized]; older/simpler layouts
  // use children of [role="feed"]. Returns null outside a feed (e.g. nav
  // links), so callers can fall back to player-level hiding.
  findFeedUnit(el) {
    const virtualized = el.closest("[data-virtualized]");
    if (virtualized) return virtualized;
    let node = el;
    while (node && node.parentElement) {
      if (node.parentElement.getAttribute?.("role") === "feed") return node;
      node = node.parentElement;
    }
    return null;
  },

  // Walks up from a <video> to the outermost ancestor that is still roughly
  // player-sized (Facebook wraps the video in overlay/control layers of the
  // same footprint), so hiding it removes the whole player but not the post.
  findHideRoot(video) {
    const vr = video.getBoundingClientRect();
    if (!vr.width || !vr.height) return video;
    let root = video;
    let node = video.parentElement;
    const body = video.ownerDocument.body;
    while (node && node !== body) {
      const r = node.getBoundingClientRect();
      if (r.width - vr.width > 60 || r.height - vr.height > 120) break;
      root = node;
      node = node.parentElement;
    }
    return root;
  },

  // Small inline note that replaces a hidden video player. Deliberately has
  // no "show" button — hiding is all-or-nothing via the popup toggle.
  buildHiddenPlaceholder(doc) {
    const wrap = doc.createElement("div");
    wrap.className = "fvb-hidden-video";
    wrap.style.cssText =
      "display:flex;align-items:center;gap:10px;" +
      "padding:10px 14px;margin:4px 0;border:1px dashed #3a4552;border-radius:8px;" +
      "background:rgba(24,119,242,.06);color:#65676b;" +
      "font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
    wrap.textContent = "🎬 Video hidden by FB Video Block";
    return wrap;
  },

  // Builds the full-page interstitial shown on Reels/Watch pages.
  // Deliberately no per-video escape hatch — the popup toggles are the only
  // way through.
  buildOverlay(doc, { onBack }) {
    const overlay = doc.createElement("div");
    overlay.id = "fvb-overlay";
    overlay.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "background:#101418",
        "color:#e7edf3",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        "gap:16px",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
        "text-align:center",
        "padding:24px",
      ].join(";")
    );

    const emoji = doc.createElement("div");
    emoji.textContent = "⏸️";
    emoji.style.fontSize = "56px";

    const title = doc.createElement("div");
    title.textContent = "Videos are blocked here";
    title.style.cssText = "font-size:26px;font-weight:700";

    const subtitle = doc.createElement("div");
    subtitle.id = "fvb-overlay-subtitle";
    subtitle.textContent =
      "You asked FB Video Block to keep you out of Reels and Watch.";
    subtitle.style.cssText = "font-size:15px;opacity:.75;max-width:420px";

    const buttonRow = doc.createElement("div");
    buttonRow.style.cssText = "display:flex;gap:12px;margin-top:8px";

    const back = doc.createElement("button");
    back.id = "fvb-back";
    back.textContent = "Take me back";
    back.style.cssText =
      "padding:10px 20px;border-radius:8px;border:0;background:#1877f2;color:#fff;font-size:15px;font-weight:600;cursor:pointer";
    back.addEventListener("click", onBack);

    buttonRow.append(back);

    const settingsNote = doc.createElement("div");
    settingsNote.id = "fvb-settings-note";
    settingsNote.textContent =
      "To change this, use the FB Video Block icon in your toolbar.";
    settingsNote.style.cssText = "font-size:12px;opacity:.5;margin-top:4px";

    overlay.append(emoji, title, subtitle, buttonRow, settingsNote);
    return overlay;
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = FVB;
} else {
  self.FVB = FVB;
}
