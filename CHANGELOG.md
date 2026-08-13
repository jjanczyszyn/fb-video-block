# Changelog

## 1.1.0 — 2026-08-13

- **Hide videos completely** (new, on by default): every video player on facebook.com is collapsed into a small "🎬 Video hidden by FB Video Block" note before it renders — no reveal button.
- **Removed the "Let me watch this one" escape hatch** from the Reels/Watch interstitial. The popup toggles are now the only way to see videos.
- Content scripts now also reach players inside `blob:`/`about:blank` sub-frames (`match_origin_as_fallback`), fixing some ads that could still autoplay.
- Popup: third toggle for hiding videos; updated copy.

## 1.0.0 — 2026-08-13

- Initial release of the FB Video Block Chrome extension (Manifest V3).
- Block autoplay on facebook.com: videos stay paused until deliberately clicked (page-world `play()` interception + native-autoplay pause).
- Block Reels & Watch pages with a full-screen interstitial, including a per-page, per-session "Let me watch this one" bypass.
- Toolbar popup with two synced toggles (`chrome.storage.sync`), both on by default.
- Unit tests (Vitest/jsdom) and end-to-end tests (Playwright loading the real extension into Chromium), wired into GitHub Actions CI.
- `npm run package` builds a shareable `dist/fb-video-block.zip`.
