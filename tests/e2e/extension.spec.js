const { test, expect, chromium } = require("@playwright/test");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXTENSION_SRC = path.join(__dirname, "..", "..", "extension");
const FIXTURES = path.join(__dirname, "fixtures");

let server;
let baseURL;
let context;
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

test("autoplay is blocked despite aggressive play() retries", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/feed.html`);

  // Let the fixture hammer play() for a while.
  await page.waitForFunction(() => window.__playAttempts > 5);
  const state = await page.evaluate(() => ({
    paused: document.getElementById("vid").paused,
    attempts: window.__playAttempts,
    rejections: window.__playRejections,
  }));
  expect(state.paused).toBe(true);
  expect(state.rejections).toBeGreaterThan(0);
  await page.close();
});

test("clicking the video allows it to play", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/feed.html`);
  await page.waitForFunction(() => window.__playAttempts > 2);

  await page.click("#vid");
  await page.waitForFunction(
    () => document.getElementById("vid").paused === false,
    null,
    { timeout: 5000 }
  );
  await page.close();
});

test("reel pages get the interstitial overlay", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/reel/12345`);
  await expect(page.locator("#fvb-overlay")).toBeVisible();
  await expect(page.locator("#fvb-overlay")).toContainText(
    "Videos are blocked here"
  );
});

test("'Let me watch this one' dismisses the overlay for that page", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/reel/67890`);
  await page.click("#fvb-bypass");
  await expect(page.locator("#fvb-overlay")).toHaveCount(0);

  // Reloading the same URL keeps the bypass for the session.
  await page.reload();
  await expect(page.locator("#fvb-overlay")).toHaveCount(0);

  // A different reel is blocked again.
  await page.goto(`${baseURL}/reel/other`);
  await expect(page.locator("#fvb-overlay")).toBeVisible();
  await page.close();
});

test("non-video pages are untouched", async () => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/feed.html`);
  await expect(page.locator("#fvb-overlay")).toHaveCount(0);
  await page.close();
});
