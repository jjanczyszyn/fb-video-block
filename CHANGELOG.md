# Changelog

## 1.2.1 — 2026-08-13

- Repository made public: added MIT license, public-facing README (install from the latest release, issue-reporting guidance). No extension code changes.

## 1.2.0 — 2026-08-13

- Hiding now removes **whole feed posts**, not just players — validated against a saved copy of the real 2026 Facebook feed:
  - Posts are located via Facebook's `[data-virtualized]` unit wrappers (with a `role="feed"` fallback for older layouts).
  - Posts linking to Reels/Watch/`/videos/`/`/share/v/` are hidden **before any player or thumbnail renders** — this catches the Reels shelf (which contains no `<video>` at all) and video posts that only show a play-button thumbnail.
  - `aria-label="Video player"` containers are hidden even before their `<video>` attaches.
  - The Stories tray is hidden too (it contains autoplaying video previews).
- Navigation links (e.g. the sidebar "Reels" entry) are ignored — only feed content is hidden.

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
