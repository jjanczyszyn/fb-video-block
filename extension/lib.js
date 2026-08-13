// Pure, testable helpers shared by the content script and the unit tests.
const FVB = {
  DEFAULT_SETTINGS: {
    blockAutoplay: true,
    blockPages: true,
  },

  // Paths that are pure video rabbit holes on facebook.com.
  isBlockedPath(pathname) {
    return /^\/(reel|reels|watch)(\/|$)/.test(pathname);
  },

  // Builds the full-page interstitial shown on Reels/Watch pages.
  buildOverlay(doc, { onBack, onBypass }) {
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

    const bypass = doc.createElement("button");
    bypass.id = "fvb-bypass";
    bypass.textContent = "Let me watch this one";
    bypass.style.cssText =
      "padding:10px 20px;border-radius:8px;border:1px solid #3a4552;background:transparent;color:#aeb8c2;font-size:15px;cursor:pointer";
    bypass.addEventListener("click", onBypass);

    buttonRow.append(back, bypass);
    overlay.append(emoji, title, subtitle, buttonRow);
    return overlay;
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = FVB;
} else {
  self.FVB = FVB;
}
