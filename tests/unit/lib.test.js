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

describe("buildOverlay", () => {
  it("renders both buttons and wires the callbacks", () => {
    const onBack = vi.fn();
    const onBypass = vi.fn();
    const overlay = FVB.buildOverlay(document, { onBack, onBypass });
    document.body.appendChild(overlay);

    overlay.querySelector("#fvb-back").click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onBypass).not.toHaveBeenCalled();

    overlay.querySelector("#fvb-bypass").click();
    expect(onBypass).toHaveBeenCalledOnce();
  });

  it("sits above everything with a maximum z-index", () => {
    const overlay = FVB.buildOverlay(document, {
      onBack: () => {},
      onBypass: () => {},
    });
    expect(overlay.getAttribute("style")).toContain("z-index:2147483647");
    expect(overlay.getAttribute("style")).toContain("position:fixed");
  });
});

describe("defaults", () => {
  it("blocks everything out of the box", () => {
    expect(FVB.DEFAULT_SETTINGS).toEqual({
      blockAutoplay: true,
      blockPages: true,
    });
  });
});
