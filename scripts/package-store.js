// Builds dist/fb-video-block-store.zip for Chrome Web Store upload.
// Identical to the normal package except the manifest "key" is stripped —
// the Web Store rejects manifests that contain one (it assigns its own ID).
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const build = fs.mkdtempSync(path.join(os.tmpdir(), "fvb-store-"));
fs.cpSync(path.join(root, "extension"), build, { recursive: true });

const manifestPath = path.join(build, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
delete manifest.key;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });
const zipPath = path.join(dist, "fb-video-block-store.zip");
fs.rmSync(zipPath, { force: true });
execFileSync("zip", ["-qr", zipPath, "."], { cwd: build });
fs.rmSync(build, { recursive: true, force: true });
console.log("dist/fb-video-block-store.zip ready (manifest key stripped)");
