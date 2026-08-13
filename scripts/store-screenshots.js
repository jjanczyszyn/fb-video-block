// Generates the Chrome Web Store screenshots (1280x800 PNGs) in
// store/screenshots/ by running the real extension against demo pages.
const { chromium } = require("@playwright/test");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "store", "screenshots");

const prepareExtension = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fvb-shot-ext-"));
  fs.cpSync(path.join(root, "extension"), dir, { recursive: true });
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const cs of manifest.content_scripts) cs.matches.push("http://localhost/*");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const keyDer = Buffer.from(manifest.key, "base64");
  const hash = crypto.createHash("sha256").update(keyDer).digest();
  const id = [...hash.subarray(0, 16)]
    .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15)))
    .join("");
  return { dir, id };
};

const launch = (extDir, options = {}) =>
  chromium.launchPersistentContext(
    fs.mkdtempSync(path.join(os.tmpdir(), "fvb-shot-prof-")),
    {
      channel: "chromium",
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${extDir}`,
        `--load-extension=${extDir}`,
      ],
      ...options,
    }
  );

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const { dir: extDir, id } = prepareExtension();

  const server = http.createServer((req, res) => {
    const file = /^\/(reel|reels|watch)(\/|$)/.test(req.url)
      ? path.join(root, "tests", "e2e", "fixtures", "reel.html")
      : path.join(root, "store", "demo", "feed.html");
    res.setHeader("content-type", "text/html");
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://localhost:${server.address().port}`;

  const context = await launch(extDir);
  const page = await context.newPage();

  // 1. The quiet feed: video posts replaced by "Video hidden" notes.
  await page.goto(`${base}/feed`);
  await page.waitForFunction(
    () => document.querySelectorAll(".fvb-hidden-video").length >= 2
  );
  await page.screenshot({ path: path.join(outDir, "1-hidden-feed.png") });

  // 2. The Reels/Watch interstitial.
  await page.goto(`${base}/reel/demo`);
  await page.waitForSelector("#fvb-overlay");
  await page.screenshot({ path: path.join(outDir, "2-interstitial.png") });
  await context.close();

  // 3. The popup, rendered crisp at 2x and composed on a title card.
  const context2 = await launch(extDir, { deviceScaleFactor: 2 });
  const popupPage = await context2.newPage();
  await popupPage.goto(`chrome-extension://${id}/popup.html`);
  const popupShot = await popupPage.locator("body").screenshot();
  const dataUri = `data:image/png;base64,${popupShot.toString("base64")}`;

  const composePage = await context2.newPage();
  await composePage.setViewportSize({ width: 640, height: 400 });
  await composePage.setContent(`
    <body style="margin:0;width:640px;height:400px;background:#eef0f3;
        display:flex;align-items:center;justify-content:center;gap:44px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="max-width:240px">
        <div style="font-size:26px;font-weight:800;color:#1c1e21;line-height:1.2">
          Three toggles.<br/>All on by default.</div>
        <div style="font-size:14px;color:#65676b;margin-top:10px;line-height:1.45">
          The popup is the only way to see videos again — no
          &ldquo;just this one&rdquo; escape hatches.</div>
      </div>
      <img src="${dataUri}" style="width:280px;border-radius:12px;
        box-shadow:0 8px 30px rgba(0,0,0,.25)"/>
    </body>`);
  await composePage.screenshot({ path: path.join(outDir, "3-popup.png") });
  await context2.close();

  server.close();
  fs.rmSync(extDir, { recursive: true, force: true });
  console.log("Wrote 3 screenshots to store/screenshots/ (1280x800)");
})();
