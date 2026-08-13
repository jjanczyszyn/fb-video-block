# Changelog

## 1.0.0 — 2026-08-13

- Initial release of the FB Video Block Chrome extension (Manifest V3).
- Block autoplay on facebook.com: videos stay paused until deliberately clicked (page-world `play()` interception + native-autoplay pause).
- Block Reels & Watch pages with a full-screen interstitial, including a per-page, per-session "Let me watch this one" bypass.
- Toolbar popup with two synced toggles (`chrome.storage.sync`), both on by default.
- Unit tests (Vitest/jsdom) and end-to-end tests (Playwright loading the real extension into Chromium), wired into GitHub Actions CI.
- `npm run package` builds a shareable `dist/fb-video-block.zip`.
