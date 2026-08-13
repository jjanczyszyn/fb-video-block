// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import FVB from "../../extension/lib.js";

describe("isBlockedPath", () => {
  it.each(["/reel/123", "/reel", "/reels/456", "/reels", "/watch", "/watch/"])(
    "blocks %s",
    (p) => {
      expect(FVB.isBlockedPath(p)).toBe(true);
    }
  );

  it.each([
    "/",
    "/groups/abc",
    "/marketplace",
    "/watchparty",
    "/reelection",
    "/profile/watch",
  ])("allows %s", (p) => {
    expect(FVB.isBlockedPath(p)).toBe(false);
  });
});

describe("isVideoLink", () => {
  const BASE = "https://www.facebook.com/somewhere";

  it.each([
    "/reel/123",
    "/reels",
    "/watch/?v=456",
    "https://www.facebook.com/watch",
    "/someuser/videos/98765/",
    "/video/theater",
    "/share/v/abc123/",
    "/share/r/abc123/",
  ])("flags %s", (href) => {
    expect(FVB.isVideoLink(href, BASE)).toBe(true);
  });

  it.each([
    "/groups/hiking",
    "/marketplace",
    "/profile.php?id=1",
    "https://example.com/watch",
    "https://youtube.com/videos/x",
    "",
    null,
  ])("ignores %s", (href) => {
    expect(FVB.isVideoLink(href, BASE)).toBe(false);
  });

  it("treats same-origin links as same-site (test servers)", () => {
    expect(FVB.isVideoLink("/reel/1", "http://localhost:3000/feed")).toBe(true);
  });
});

describe("findFeedUnit", () => {
  it("returns the [data-virtualized] wrapper (2026 feed)", () => {
    document.body.innerHTML =
      '<div><div data-virtualized="false" id="unit"><div><a id="link" href="/reel/1">r</a></div></div></div>';
    expect(FVB.findFeedUnit(document.getElementById("link")).id).toBe("unit");
  });

  it("returns the direct child of role=feed (legacy layouts)", () => {
    document.body.innerHTML =
      '<div role="feed"><div id="unit"><p><a id="link" href="/watch">w</a></p></div></div>';
    expect(FVB.findFeedUnit(document.getElementById("link")).id).toBe("unit");
  });

  it("returns null outside any feed (nav links)", () => {
    document.body.innerHTML = '<nav><a id="link" href="/reel/?s=tab">Reels</a></nav>';
    expect(FVB.findFeedUnit(document.getElementById("link"))).toBeNull();
  });
});

describe("buildOverlay", () => {
  it("wires the back button and offers no bypass", () => {
    const onBack = vi.fn();
    const overlay = FVB.buildOverlay(document, { onBack });
    document.body.appendChild(overlay);

    overlay.querySelector("#fvb-back").click();
    expect(onBack).toHaveBeenCalledOnce();

    expect(overlay.querySelector("#fvb-bypass")).toBeNull();
    expect(overlay.querySelector("#fvb-settings-note").textContent).toContain(
      "FB Video Block icon in your toolbar"
    );
  });

  it("sits above everything with a maximum z-index", () => {
    const overlay = FVB.buildOverlay(document, { onBack: () => {} });
    expect(overlay.getAttribute("style")).toContain("z-index:2147483647");
    expect(overlay.getAttribute("style")).toContain("position:fixed");
  });
});

describe("buildHiddenPlaceholder", () => {
  it("is a plain note with no reveal button", () => {
    const placeholder = FVB.buildHiddenPlaceholder(document);
    expect(placeholder.textContent).toContain("Video hidden by FB Video Block");
    expect(placeholder.querySelector("button")).toBeNull();
  });
});

describe("findHideRoot", () => {
  const mockRect = (el, width, height) => {
    el.getBoundingClientRect = () => ({ width, height });
  };

  it("hides the player wrapper but not the whole post", () => {
    document.body.innerHTML =
      '<div id="post"><div id="player"><div id="inner"><video></video></div></div></div>';
    const video = document.querySelector("video");
    mockRect(video, 480, 270);
    mockRect(document.getElementById("inner"), 480, 270);
    mockRect(document.getElementById("player"), 480, 330); // + controls bar
    mockRect(document.getElementById("post"), 500, 800); // post w/ text etc.

    expect(FVB.findHideRoot(video).id).toBe("player");
  });

  it("falls back to the video itself when it has no size yet", () => {
    document.body.innerHTML = "<div><video></video></div>";
    const video = document.querySelector("video");
    mockRect(video, 0, 0);
    expect(FVB.findHideRoot(video)).toBe(video);
  });

  it("stops at body for a bare video", () => {
    document.body.innerHTML = "<video></video>";
    const video = document.querySelector("video");
    mockRect(video, 480, 270);
    expect(FVB.findHideRoot(video)).toBe(video);
  });
});

describe("defaults", () => {
  it("blocks and hides everything out of the box", () => {
    expect(FVB.DEFAULT_SETTINGS).toEqual({
      blockAutoplay: true,
      blockPages: true,
      hideVideos: true,
    });
  });
});
