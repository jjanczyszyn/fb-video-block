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
  it("blocks and hides everything out of the box, friend options on", () => {
    expect(FVB.DEFAULT_SETTINGS).toEqual({
      blockAutoplay: true,
      blockPages: true,
      hideVideos: true,
      allowFriends: true,
      friendsOnly: true,
      autoSyncFriends: true,
    });
  });
});

describe("marketplace", () => {
  const BASE = "https://www.facebook.com/";
  it.each(["/marketplace", "/marketplace/", "/marketplace/item/123/"])(
    "recognises %s",
    (p) => {
      expect(FVB.isMarketplacePath(p)).toBe(true);
      expect(FVB.isMarketplaceLink(p, BASE)).toBe(true);
    }
  );
  it.each(["/", "/marketplacefan", "/groups/marketplace"])("ignores %s", (p) => {
    expect(FVB.isMarketplacePath(p)).toBe(false);
  });
  it("is never a blocked Reels/Watch path", () => {
    expect(FVB.isBlockedPath("/marketplace/item/1")).toBe(false);
  });
});

describe("profileRef", () => {
  const BASE = "https://www.facebook.com/";

  it.each([
    ["https://www.facebook.com/jane.doe?__cft__[0]=AZ&__tn__=-R", { username: "jane.doe" }],
    ["/Jane.Doe/", { username: "jane.doe" }],
    ["/profile.php?id=100012345", { id: "100012345" }],
    ["/friends/list/?profile_id=4242", { id: "4242" }],
    ["/people/Jane-Doe/100099/", { id: "100099" }],
  ])("reads %s", (href, ref) => {
    expect(FVB.profileRef(href, BASE)).toEqual(ref);
  });

  it.each([
    "/friends/requests",
    "/groups/hiking",
    "/watch",
    "/marketplace/",
    "/reel/123",
    "/jane.doe/videos/1/",
    "https://example.com/jane.doe",
    "",
  ])("ignores %s", (href) => {
    expect(FVB.profileRef(href, BASE)).toBeNull();
  });
});

describe("isFriend", () => {
  const index = FVB.buildFriendIndex([
    { name: "Jane Doe", username: "jane.doe" },
    { name: "Zoë Ångström", id: "777" },
    { name: "Only A Name" },
  ]);
  const BASE = "https://www.facebook.com/";

  it("matches by username, id, or display name", () => {
    expect(FVB.isFriend(index, { name: "X", href: "/jane.doe?__cft__=1" }, BASE)).toBe(true);
    expect(FVB.isFriend(index, { name: "X", href: "/profile.php?id=777" }, BASE)).toBe(true);
    expect(FVB.isFriend(index, { name: "  only  a NAME " }, BASE)).toBe(true);
    expect(FVB.isFriend(index, { name: "Zoë Ångström" }, BASE)).toBe(true);
  });

  it("rejects strangers, pages, and missing authors", () => {
    expect(FVB.isFriend(index, { name: "ZenDate", href: "/zendatecom" }, BASE)).toBe(false);
    expect(FVB.isFriend(index, { name: "" }, BASE)).toBe(false);
    expect(FVB.isFriend(index, null, BASE)).toBe(false);
  });
});

describe("findUnitAuthor", () => {
  it("reads the profile_name header (2026 feed markup)", () => {
    document.body.innerHTML = `<div id="u"><a href="/someone-else">avatar</a>
      <div data-ad-rendering-role="profile_name"><h4><span><a href="https://www.facebook.com/zendatecom?__cft__[0]=x"><b><span>ZenDate</span></b></a></span></h4>
      <span>Verified account</span></div></div>`;
    expect(FVB.findUnitAuthor(document.getElementById("u"))).toEqual({
      name: "ZenDate",
      href: "https://www.facebook.com/zendatecom?__cft__[0]=x",
    });
  });

  it("falls back to a heading link, and null when there is none", () => {
    document.body.innerHTML = '<div id="a"><h3><a href="/jane.doe">Jane Doe</a></h3></div><div id="b"><p>x</p></div>';
    expect(FVB.findUnitAuthor(document.getElementById("a")).name).toBe("Jane Doe");
    expect(FVB.findUnitAuthor(document.getElementById("b"))).toBeNull();
  });
});

describe("story / reel cards", () => {
  it.each([
    ["Aster Peng's story", "Aster Peng"],
    ["Aster Peng’s story", "Aster Peng"],
    ["BBC Science Focus Magazine, view story", "BBC Science Focus Magazine"],
    ["Reel by Sty Kdrama", "Sty Kdrama"],
    ["Create story", null],
  ])("reads the author of %s", (label, name) => {
    const a = document.createElement("a");
    a.setAttribute("aria-label", label);
    expect(FVB.cardAuthorName(a)).toBe(name);
  });

  it("matches author cards but not the Create story card", () => {
    document.body.innerHTML = `
      <div role="gridcell" id="c1"><a aria-label="Aster Peng's story" href="/stories/1/x/">a</a></div>
      <div data-type="hscroll-child" id="c2"><a aria-label="Reel by Sty Kdrama" href="/reel/5/">b</a></div>
      <a aria-label="Create story" href="/stories/create/">c</a>`;
    const cards = [...document.querySelectorAll(FVB.CARD_SELECTOR)];
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => FVB.findCardRoot(c).id)).toEqual(["c1", "c2"]);
  });
});

describe("videoKey", () => {
  const BASE = "https://www.facebook.com/";
  it.each([
    ["/reel/1612645523793948/?s=ifu&__cft__[0]=x", "video:1612645523793948"],
    ["/watch/?v=456", "video:456"],
    ["/jane.doe/videos/98765/", "video:98765"],
    ["/jane.doe/videos/some-title/98765/", "video:98765"],
    ["/stories/3600198340021638/UzpfSVNDOjI4/?bucket_count=9", "story:3600198340021638"],
    ["/share/v/abc123/", "share:abc123"],
    ["/groups/hiking", null],
    ["/reels", null],
  ])("keys %s", (href, key) => {
    expect(FVB.videoKey(href, BASE)).toBe(key);
  });

  it("gives a reel link and the reel page the same key", () => {
    expect(FVB.videoKey("https://www.facebook.com/reel/42", BASE)).toBe(
      FVB.videoKey("/reel/42/?s=ifu", BASE)
    );
  });
});

describe("parseFriendsText", () => {
  it("reads names and profile links, one per line", () => {
    expect(
      FVB.parseFriendsText(
        "Jane Doe\n\n  facebook.com/john.smith \nhttps://www.facebook.com/profile.php?id=123\nhttps://www.facebook.com/groups/x"
      )
    ).toEqual([{ name: "Jane Doe" }, { username: "john.smith" }, { id: "123" }]);
  });
});

describe("friend list sync", () => {
  it("only runs on /friends/list", () => {
    expect(FVB.isFriendsListPage("https://www.facebook.com/friends/list")).toBe(true);
    expect(FVB.isFriendsListPage("https://www.facebook.com/friends/list/?profile_id=1")).toBe(true);
    expect(FVB.isFriendsListPage("https://www.facebook.com/friends/requests")).toBe(false);
    expect(FVB.isFriendsListPage("https://www.facebook.com/")).toBe(false);
  });

  it("harvests names and profile refs, skipping nav links", () => {
    document.body.innerHTML = `<div role="navigation">
      <a href="/friends/requests">Friend requests</a>
      <a href="/friends/list/?profile_id=111"><span>Jane Doe</span><span>12 mutual friends</span></a>
      <a href="https://www.facebook.com/john.smith"><span>John Smith</span></a>
      <a href="/profile.php?id=222"></a>
    </div>`;
    expect(FVB.harvestFriendLinks(document.body, "https://www.facebook.com/friends/list")).toEqual([
      { name: "Jane Doe", id: "111" },
      { name: "John Smith", username: "john.smith" },
    ]);
  });

  it("merges without duplicates", () => {
    const merged = FVB.mergeFriends(
      [{ name: "Jane Doe", id: "111" }, { name: "Bob" }],
      [{ name: "Jane D.", id: "111" }, { name: "bob" }, { name: "New", username: "new.one" }]
    );
    expect(merged).toEqual([
      { name: "Jane D.", id: "111" },
      { name: "bob" },
      { name: "New", username: "new.one" },
    ]);
  });
});

describe("monthly full friend re-scan", () => {
  const DAY = FVB.SYNC_INTERVAL_MS; // one re-scan interval (30 days)
  const on = { autoSyncFriends: true, allowFriends: true, friendsOnly: true };
  const now = 10 * DAY;

  it("runs every 30 days", () => {
    expect(FVB.SYNC_INTERVAL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("is due when never synced or more than an interval ago", () => {
    expect(FVB.shouldAutoSync(on, {}, now)).toBe(true);
    expect(FVB.shouldAutoSync(on, { lastFriendSync: now - DAY - 1 }, now)).toBe(true);
  });

  it("waits an interval after a sync and an hour after an attempt", () => {
    expect(FVB.shouldAutoSync(on, { lastFriendSync: now - DAY + 60000 }, now)).toBe(false);
    expect(FVB.shouldAutoSync(on, { lastFriendSyncAttempt: now - 60000 }, now)).toBe(false);
    expect(FVB.shouldAutoSync(on, { lastFriendSyncAttempt: now - 2 * 3600000 }, now)).toBe(true);
  });

  it("is off when disabled or when no friend option is on", () => {
    expect(FVB.shouldAutoSync({ ...on, autoSyncFriends: false }, {}, now)).toBe(false);
    expect(FVB.shouldAutoSync({ ...on, allowFriends: false, friendsOnly: false }, {}, now)).toBe(false);
  });

  it("replaces the list after a complete run, so unfriended people drop off", () => {
    const prev = [{ name: "A", id: "1" }, { name: "Gone", id: "2" }];
    const got = [{ name: "A", id: "1" }, { name: "New", id: "3" }];
    expect(FVB.resolveSyncedFriends(prev, got)).toEqual(got);
  });

  it("only adds when a run came back much smaller (partial load)", () => {
    const prev = Array.from({ length: 10 }, (_, i) => ({ name: `F${i}`, id: String(i) }));
    const got = [{ name: "New", id: "99" }];
    const out = FVB.resolveSyncedFriends(prev, got);
    expect(out).toHaveLength(11);
  });

  it("keeps the old list when nothing came back (logged out)", () => {
    const prev = [{ name: "A", id: "1" }];
    expect(FVB.resolveSyncedFriends(prev, [])).toBe(prev);
  });
});

describe("new friends from notifications", () => {
  // Shape of Facebook's embedded notification data (2026), trimmed.
  const notif = (text, entity) => ({
    node: {
      notif: {
        body: {
          ranges: entity
            ? [{ entity: { __typename: "User", ...entity }, offset: 0, length: entity.len }]
            : [],
          text,
        },
      },
    },
  });
  const data = {
    require: [["ScheduledServerJS", "handle", null, [{ __bbox: { result: { data: { viewer: {
      notifications_page: {
        edges: [
          notif("Sam Lee sent you a friend request.", { id: "1", url: "https://www.facebook.com/sam.lee", len: 7 }),
          notif("An admin changed the name of the group.", null),
          notif("Valerie Joyce Bentson accepted your friend request.", { id: "500520866", url: "https://www.facebook.com/valerie.bentson", len: 21 }),
          notif("Daniel Moreh accepted your friend request.", { id: "1045734557", url: "https://www.facebook.com/dmoreh", len: 12 }),
        ],
      },
    } } } } }]]],
  };

  it("extracts people who accepted your request, with id and username", () => {
    expect(FVB.extractAcceptedFriends(data)).toEqual([
      { name: "Valerie Joyce Bentson", id: "500520866", username: "valerie.bentson" },
      { name: "Daniel Moreh", id: "1045734557", username: "dmoreh" },
    ]);
  });

  it("falls back to the name in the text when there is no entity", () => {
    expect(
      FVB.extractAcceptedFriends({ text: "Jo Park accepted your friend request.", ranges: [] })
    ).toEqual([{ name: "Jo Park" }]);
  });

  it("ignores requests that were only sent, and survives cycles", () => {
    const loop = { text: "Sam Lee sent you a friend request.", ranges: [] };
    loop.self = loop;
    expect(FVB.extractAcceptedFriends(loop)).toEqual([]);
  });
});

describe("findRequester (Confirm clicks)", () => {
  const BASE = "https://www.facebook.com/";

  it("finds the requester in the right-rail friend request box", () => {
    // Trimmed from the real 2026 right rail.
    document.body.innerHTML = `<div><div>
      <a href="https://www.facebook.com/friends/requests/?profile_id=1009768031" aria-label="James Gunther LAc"><svg></svg></a>
      <div><a href="https://www.facebook.com/friends/requests/?profile_id=1009768031"><span>James Gunther LAc</span></a><span>6d</span></div>
      <div><a aria-label="Profile picture of Emily Switzer, who is a mutual friend" href="https://www.facebook.com/emily.switzer1"></a>
        <a aria-label="Profile picture of Mark Tanaka, who is a mutual friend" href="https://www.facebook.com/mark.tanaka.9"></a>
        <span>25 mutual friends</span></div>
      <div><div aria-label="Confirm" role="button" id="confirm">Confirm</div><div aria-label="Delete" role="button">Delete</div></div>
    </div></div>`;
    expect(FVB.findRequester(document.getElementById("confirm"), BASE)).toEqual({
      name: "James Gunther LAc",
      id: "1009768031",
    });
  });

  it("finds the requester in a notification", () => {
    document.body.innerHTML = `<div><a href="/sam.lee"><span>Sam Lee</span></a>
      <span>sent you a friend request.</span>
      <div aria-label="Confirm" role="button" id="confirm">Confirm</div></div>`;
    expect(FVB.findRequester(document.getElementById("confirm"), BASE)).toEqual({
      name: "Sam Lee",
      username: "sam.lee",
    });
  });

  it("ignores Unfriend confirmations and unrelated Confirm dialogs", () => {
    document.body.innerHTML = `<div><a href="/sam.lee">Sam Lee</a>
      <p>Are you sure you want to unfriend Sam Lee?</p>
      <div aria-label="Confirm" role="button" id="c1">Confirm</div></div>
      <div><a href="/some.page">Some Page</a><p>Leave group?</p>
      <div aria-label="Confirm" role="button" id="c2">Confirm</div></div>`;
    expect(FVB.findRequester(document.getElementById("c1"), BASE)).toBeNull();
    expect(FVB.findRequester(document.getElementById("c2"), BASE)).toBeNull();
  });
});
