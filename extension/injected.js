// Runs in the page's MAIN world at document_start.
// Blocks programmatic video.play() calls and native autoplay unless the user
// has deliberately clicked the video (or its player) first.
(() => {
  if (window.__fvbInjected) return;
  window.__fvbInjected = true;

  const allowed = new WeakSet();

  // The isolated-world content script mirrors the user's settings onto the
  // <html> dataset. Until it does, fail closed (blocking on).
  const blockingEnabled = () =>
    document.documentElement.dataset.fvbBlockAutoplay !== "false";

  const allowVideoFromEvent = (e) => {
    if (!e.isTrusted) return;
    const path = e.composedPath();
    let video = path.find((n) => n instanceof HTMLVideoElement);
    if (!video && typeof e.clientX === "number") {
      video = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((n) => n instanceof HTMLVideoElement);
    }
    if (!video) {
      // Clicks on player chrome (play button overlays etc.) land on siblings
      // of the <video>. Allow the nearest ancestor that wraps exactly one.
      const container = path.find(
        (n) =>
          n instanceof Element && n.querySelectorAll("video").length === 1
      );
      if (container) video = container.querySelector("video");
    }
    if (video) allowed.add(video);
  };
  window.addEventListener("pointerdown", allowVideoFromEvent, true);

  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (
      blockingEnabled() &&
      this instanceof HTMLVideoElement &&
      !allowed.has(this)
    ) {
      // Mimic the browser's own autoplay policy so Facebook's player degrades
      // gracefully (shows its play button instead of erroring).
      return Promise.reject(
        new DOMException(
          "Autoplay blocked by FB Video Block",
          "NotAllowedError"
        )
      );
    }
    return origPlay.apply(this, args);
  };

  // Native autoplay (the `autoplay` attribute) doesn't go through play(),
  // so also pause anything that starts playing without permission.
  window.addEventListener(
    "play",
    (e) => {
      const v = e.target;
      if (blockingEnabled() && v instanceof HTMLVideoElement && !allowed.has(v)) {
        try {
          v.pause();
        } catch {
          /* detached element etc. — nothing to do */
        }
      }
    },
    true
  );
})();
