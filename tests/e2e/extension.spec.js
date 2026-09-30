const { test, expect, chromium } = require("@playwright/test");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXTENSION_SRC = path.join(__dirname, "..", "..", "extension");
const FIXTURES = path.join(__dirname, "fixtures");

let server;
let baseURL;
let context;
let extensionId;
let extensionDir;
let userDataDir;

test.beforeAll(async () => {
  // Tiny static server: /reel/* and /watch* serve the reel fixture, / the
  // friends home feed, /friends/list the friend list, everything else the
  // feed fixture.
  server = http.createServer((req, res) => {
    const file = /^\/(reel|reels|watch)(\/|$)/.test(req.url)
      ? "reel.html"
      : /^\/friends\/list/.test(req.url)
        ? "friends-list.html"
        : /^\/marketplace/.test(req.url)
          ? "marketplace.html"
        : req.url === "/"
          ? "home.html"
          : "feed.html";
    res.setHeader("content-type", "text/html");
    res.end(fs.readFileSync(path.join(FIXTURES, file)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://localhost:${server.address().port}`;

  // The real manifest only matches facebook.com. For tests, copy the
  // extension and widen the matches to localhost so the fixture pages get it.
  extensionDir = fs.mkdtempSync(path.join(os.tmpdir(), "fvb-ext-"));
  fs.cpSync(EXTENSION_SRC, extensionDir, { recursive: true });
  const manifestPath = path.join(extensionDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const cs of manifest.content_scripts) cs.matches.push("http://localhost/*");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  // Point the daily friend sync at the fixture server.
  const libPath = path.join(extensionDir, "lib.js");
  fs.writeFileSync(
    libPath,
    fs
      .readFileSync(libPath, "utf8")
      .replace("https://www.facebook.com/friends/list", `${baseURL}/friends/list`)
  );

  // The manifest "key" pins the extension ID; derive it the same way Chrome
  // does (first 16 bytes of SHA-256 of the public key, mapped to a-p).
  const keyDer = Buffer.from(manifest.key, "base64");
  const hash = crypto.createHash("sha256").update(keyDer).digest();
  extensionId = [...hash.subarray(0, 16)]
    .map(
      (b) =>
        String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))
    )
    .join("");

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fvb-profile-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: !process.env.FVB_HEADED, // FVB_HEADED=1 to watch it run
    channel: "chromium",
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  // The daily friend sync opens its own tab; only its own test wants that.
  await setSyncFlags({ autoSyncFriends: false });
});

const setSyncFlags = async (values) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate((v) => new Promise((r) => chrome.storage.sync.set(v, r)), values);
  await popup.close();
};

test.afterAll(async () => {
  await context?.close();
  server?.close();
  fs.rmSync(extensionDir, { recursive: true, force: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

const setHideVideos = async (enabled) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.setChecked("#hideVideos", enabled);
  await popup.close();
};

test("feed videos are hidden and can never play", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/feed.html`);

  await expect(page.locator(".fvb-hidden-video").first()).toBeVisible();
  await expect(page.locator("#vid")).toBeHidden();
  await expect(page.locator(".fvb-hidden-video").first()).toContainText(
    "Video hidden by FB Video Block"
  );
  // No reveal button exists.
  await expect(page.locator(".fvb-hidden-video button")).toHaveCount(0);

  // Facebook-style play() retries keep failing even while hidden.
  await page.waitForFunction(() => window.__playAttempts > 5);
  const state = await page.evaluate(() => ({
    paused: document.getElementById("vid").paused,
    rejections: window.__playRejections,
  }));
  expect(state.paused).toBe(true);
  expect(state.rejections).toBeGreaterThan(0);
  await page.close();
});

test("video posts and the Reels shelf are hidden before any player exists", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/feed.html`);

  // The Reels shelf (thumbnails + /reel/ links, no <video>) is gone.
  await expect(page.locator("#unit-reels")).toBeHidden();
  // A post that only shows a play-button thumbnail (video permalink) is gone.
  await expect(page.locator("#unit-video-post")).toBeHidden();
  // A post whose player container exists but has no <video> yet is gone.
  await expect(page.locator("#unit-marker-post")).toBeHidden();
  // Legacy role="feed" layouts work too.
  await expect(page.locator("#unit-legacy-video")).toBeHidden();
  // Ordinary posts survive in both layouts.
  await expect(page.locator("#unit-text")).toBeVisible();
  await expect(page.locator("#unit-legacy-text")).toBeVisible();

  const placeholders = await page.locator(".fvb-hidden-video").count();
  expect(placeholders).toBeGreaterThanOrEqual(5); // 4 units + the <video>
  await page.close();
});

test("reel pages get the interstitial with no escape hatch", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/reel/12345`);
  await expect(page.locator("#fvb-overlay")).toBeVisible();
  await expect(page.locator("#fvb-overlay")).toContainText(
    "Videos are blocked here"
  );
  await expect(page.locator("#fvb-back")).toBeVisible();
  await expect(page.locator("#fvb-bypass")).toHaveCount(0);
  await expect(page.locator("#fvb-settings-note")).toContainText("toolbar");

  // Reloading doesn't help either.
  await page.reload();
  await expect(page.locator("#fvb-overlay")).toBeVisible();
  await page.close();
});

test("with hiding toggled off, videos are visible but click-to-play", async () => {
  await setHideVideos(false);
  const page = await context.newPage();
  await page.goto(`${baseURL}/feed.html`);

  await expect(page.locator("#vid")).toBeVisible();
  await expect(page.locator(".fvb-hidden-video")).toHaveCount(0);

  // Still blocked from autoplaying...
  await page.waitForFunction(() => window.__playAttempts > 5);
  expect(await page.evaluate(() => document.getElementById("vid").paused)).toBe(
    true
  );

  // ...until the user deliberately clicks it.
  await page.click("#vid");
  await page.waitForFunction(
    () => document.getElementById("vid").paused === false,
    null,
    { timeout: 5000 }
  );

  await page.close();
  await setHideVideos(true);
});

test("toggling hiding back on applies to already-open pages", async () => {
  const page = await context.newPage();
  await setHideVideos(false);
  await page.goto(`${baseURL}/feed.html`);
  await expect(page.locator("#vid")).toBeVisible();

  await setHideVideos(true);
  await expect(page.locator("#vid")).toBeHidden();
  await expect(page.locator(".fvb-hidden-video").first()).toBeVisible();
  await page.close();
});

test("non-video pages are untouched", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/feed.html`);
  await expect(page.locator("#fvb-overlay")).toHaveCount(0);
  await page.close();
});

// ---- Friends ----

const withPopup = async (fn, arg) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const result = await popup.evaluate(fn, arg);
  await popup.close();
  return result;
};

const setSync = (values) =>
  withPopup((v) => new Promise((r) => chrome.storage.sync.set(v, r)), values);

test.describe.serial("friends", () => {
  test.afterAll(async () => {
    await withPopup(() =>
      Promise.all([
        new Promise((r) => chrome.storage.sync.clear(r)),
        new Promise((r) => chrome.storage.local.clear(r)),
      ])
    );
    await setSync({ autoSyncFriends: false });
  });

  test("friend options are on by default but dormant until friends are synced", async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator("#allowFriends")).toBeChecked();
    await expect(popup.locator("#friendsOnly")).toBeChecked();
    await expect(popup.locator("#friendWarn")).toBeVisible();
    await popup.close();

    // No friends known: the feed is unchanged (no friends-only filtering).
    const page = await context.newPage();
    await page.goto(`${baseURL}/`);
    await expect(page.locator("#unit-stranger-text")).toBeVisible();
    await expect(page.locator("#unit-stranger-video")).toBeHidden();
    await page.close();
  });

  test("visiting the friend list syncs friends, including lazy-loaded ones", async () => {
    const page = await context.newPage();
    await page.goto(`${baseURL}/friends/list`);
    await expect(page.locator("#fvb-friends-banner")).toContainText(
      "12 friends saved"
    );
    await page.close();

    const friends = await withPopup(
      () => new Promise((r) => chrome.storage.local.get({ friends: [] }, (x) => r(x.friends)))
    );
    expect(friends).toEqual(
      expect.arrayContaining([
        { name: "John Smith", id: "4242" },
        { name: "Jane Doe", username: "jane.doe" },
      ])
    );
    // Banner's own profile + nav links skipped; a manual visit only captures
    // what's been loaded (no auto-scroll).
    expect(friends).toHaveLength(12);
    expect(friends.map((f) => f.name)).not.toContain("Me Myself");

    // The popup reports the count.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator("#friendCount")).toContainText("12 friends synced");
    await popup.close();
  });

  test("with friends' videos allowed, only friends' videos and stories show", async () => {
    // John Smith is matched by the manual list (by id); Jane by the sync.
    await withPopup(
      () => new Promise((r) => chrome.storage.local.set({ friends: [{ name: "Jane Doe", username: "jane.doe" }], extraFriends: "facebook.com/profile.php?id=777" }, r))
    );
    await setSync({ allowFriends: true, friendsOnly: false });
    const page = await context.newPage();
    await page.goto(`${baseURL}/`);

    await expect(page.locator("#unit-friend-video")).toBeVisible();
    await expect(page.locator("#unit-stranger-video")).toBeHidden();
    await expect(page.locator("#unit-stories")).toBeVisible();
    await expect(page.locator("#card-friend-story")).toBeVisible();
    await expect(page.locator("#card-stranger-story")).toBeHidden();
    // Non-video posts are untouched when friends-only is off.
    await expect(page.locator("#unit-stranger-text")).toBeVisible();
    await expect(page.locator("#unit-friend-text")).toBeVisible();
    await page.close();
  });

  test("a friend's reel opens; a stranger's reel still gets the block screen", async () => {
    const page = await context.newPage();
    await page.goto(`${baseURL}/`);
    await page.click("#friend-reel-link");
    await page.waitForURL(/\/reel\/42/);
    await expect(page.locator("#fvb-overlay")).toHaveCount(0);

    await page.goto(`${baseURL}/reel/99/`);
    await expect(page.locator("#fvb-overlay")).toBeVisible();
    await page.close();
  });

  test("friends-only feed removes every non-friend post without a trace", async () => {
    await setSync({ allowFriends: true, friendsOnly: true });
    const page = await context.newPage();
    await page.goto(`${baseURL}/`);

    await expect(page.locator("#unit-friend-text")).toBeVisible();
    await expect(page.locator("#unit-friend-video")).toBeVisible();
    await expect(page.locator("#unit-stranger-text")).toBeHidden();
    await expect(page.locator("#unit-stranger-video")).toBeHidden();
    await expect(page.locator("#card-stranger-story")).toBeHidden();
    await expect(page.locator("#card-friend-story")).toBeVisible();
    // Completely hidden: no "Video hidden" notes anywhere.
    await expect(page.locator(".fvb-hidden-video")).toHaveCount(0);
    // Marketplace suggestions are kept.
    await expect(page.locator("#unit-marketplace")).toBeVisible();
    await page.close();
  });

  test("Marketplace pages are never affected", async () => {
    const page = await context.newPage();
    await page.goto(`${baseURL}/marketplace/item/1/`);
    await expect(page.locator("#listing")).toBeVisible();
    await expect(page.locator("#listing-video")).toBeVisible();
    await expect(page.locator(".fvb-hidden-video")).toHaveCount(0);
    await expect(page.locator("#fvb-overlay")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.fvbBlockAutoplay))
      .toBe("false");
    await page.close();
  });

  test("friends-only without friend videos hides friends' video posts but keeps their text posts", async () => {
    await setSync({ allowFriends: false, friendsOnly: true });
    const page = await context.newPage();
    await page.goto(`${baseURL}/`);
    await expect(page.locator("#unit-friend-text")).toBeVisible();
    await expect(page.locator("#unit-friend-video")).toBeHidden();
    await expect(page.locator("#unit-stranger-text")).toBeHidden();
    await expect(page.locator("#unit-stories")).toBeHidden();
    await page.close();
  });
});

test("the full friend list re-scan runs in a background tab when due", async () => {
  await withPopup(
    () =>
      new Promise((r) =>
        chrome.storage.local.set(
          { friends: [{ name: "Old Friend", username: "old.friend" }], lastFriendSync: 0, lastFriendSyncAttempt: 0 },
          r
        )
      )
  );
  await setSync({ autoSyncFriends: true });

  const syncTabOpened = context.waitForEvent("page", {
    predicate: (p) => p.url().includes("/friends/list"),
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  const syncTab = await syncTabOpened;
  // It scrolls the whole (lazy-loading) list, saves it, and closes itself.
  await syncTab.waitForEvent("close", { timeout: 60000 });

  const local = await withPopup(
    () => new Promise((r) => chrome.storage.local.get(null, r))
  );
  const names = local.friends.map((f) => f.name);
  expect(names).toHaveLength(32); // John, Jane + 30 lazy-loaded
  expect(names).toContain("Friend 30");
  expect(names).not.toContain("Old Friend"); // unfriended people drop off
  expect(Date.now() - local.lastFriendSync).toBeLessThan(120000);

  // Already fresh: another Facebook visit doesn't open a new sync tab.
  let reopened = false;
  const onPage = (p) => {
    if (p.url().includes("/friends/list")) reopened = true;
  };
  context.on("page", onPage);
  await page.reload();
  await page.waitForTimeout(2000);
  context.off("page", onPage);
  expect(reopened).toBe(false);

  await page.close();
  await withPopup(() =>
    Promise.all([
      new Promise((r) => chrome.storage.sync.clear(r)),
      new Promise((r) => chrome.storage.local.clear(r)),
    ])
  );
  await setSync({ autoSyncFriends: false });
});

test("new friends are picked up from notifications and Confirm clicks", async () => {
  // A recent full scan, so no re-scan tab opens.
  await withPopup(
    () =>
      new Promise((r) =>
        chrome.storage.local.set(
          { friends: [{ name: "Jane Doe", username: "jane.doe" }], lastFriendSync: Date.now() },
          r
        )
      )
  );
  await setSync({ autoSyncFriends: true });

  let rescanOpened = false;
  const onPage = (p) => {
    if (p.url().includes("/friends/list")) rescanOpened = true;
  };
  context.on("page", onPage);

  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  const getFriends = () =>
    withPopup(
      () => new Promise((r) => chrome.storage.local.get({ friends: [] }, (x) => r(x.friends)))
    );

  // "Newbie Person accepted your friend request." → added with id + username.
  await expect
    .poll(async () => (await getFriends()).map((f) => f.name))
    .toContain("Newbie Person");
  let friends = await getFriends();
  expect(friends).toContainEqual({ name: "Newbie Person", id: "424242", username: "newbie.person" });
  // A request someone only *sent* doesn't make them a friend...
  expect(friends.map((f) => f.name)).not.toContain("Req Person");

  // ...until you confirm it.
  await page.click("#confirm-request");
  await expect
    .poll(async () => (await getFriends()).map((f) => f.name))
    .toContain("Req Person");
  friends = await getFriends();
  expect(friends).toContainEqual({ name: "Req Person", id: "31337" });
  expect(friends.map((f) => f.name)).toContain("Jane Doe"); // nothing lost
  expect(rescanOpened).toBe(false);

  context.off("page", onPage);
  await page.close();
  await withPopup(() =>
    Promise.all([
      new Promise((r) => chrome.storage.sync.clear(r)),
      new Promise((r) => chrome.storage.local.clear(r)),
    ])
  );
  await setSync({ autoSyncFriends: false });
});
