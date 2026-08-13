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
  // The real manifest only matches facebook.com. For tests, copy the
  // extension and widen the matches to localhost so the fixture pages get it.
  extensionDir = fs.mkdtempSync(path.join(os.tmpdir(), "fvb-ext-"));
  fs.cpSync(EXTENSION_SRC, extensionDir, { recursive: true });
  const manifestPath = path.join(extensionDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const cs of manifest.content_scripts) cs.matches.push("http://localhost/*");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

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

  // Tiny static server: /reel/* and /watch* serve the reel fixture,
  // everything else serves the feed fixture.
  server = http.createServer((req, res) => {
    const file = /^\/(reel|reels|watch)(\/|$)/.test(req.url)
      ? "reel.html"
      : "feed.html";
    res.setHeader("content-type", "text/html");
    res.end(fs.readFileSync(path.join(FIXTURES, file)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://localhost:${server.address().port}`;

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fvb-profile-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
});

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

  await expect(page.locator(".fvb-hidden-video")).toBeVisible();
  await expect(page.locator("#vid")).toBeHidden();
  await expect(page.locator(".fvb-hidden-video")).toContainText(
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
  await expect(page.locator(".fvb-hidden-video")).toBeVisible();
  await page.close();
});

test("non-video pages are untouched", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/feed.html`);
  await expect(page.locator("#fvb-overlay")).toHaveCount(0);
  await page.close();
});
