# Changelog

## 1.5.0 — 2026-09-29

- **New friends are picked up as they happen**, instead of by re-scanning the whole list daily:
  - "*Name* accepted your friend request." entries are read from the notification data Facebook already embeds in every page (name, profile id, username).
  - Clicking **Confirm** on a friend request (right-rail box, requests page, notifications) adds the requester; Unfriend and other confirm dialogs are ignored.
  - Both validated against a saved copy of the real page.
- The full friend-list re-scan (drops unfriended people, catches friends added on other devices) now runs **monthly** instead of daily.
- Popup toggle renamed "Keep it up to date".

## 1.4.0 — 2026-09-29

- **Friends list refreshes itself daily** (popup toggle "Refresh daily", on by default): when you use Facebook more than 24 hours after the last sync, a background service worker opens facebook.com/friends/list in a background tab, the extension scrolls the whole list, saves it and closes the tab. Retries at most hourly (e.g. when logged out).
- "Sync from Facebook" now does the same in a visible tab: auto-scrolls to the end and closes itself.
- A complete sync replaces the stored list, so unfriended people drop off; a much shorter result (partial load) only adds.
- Popup shows when the list was last synced. No new permissions.

## 1.3.0 — 2026-09-29

- **Show videos from friends** (new toggle, on by default): friends' video posts, Stories cards and Reels cards stay visible; a friend's reel/video/story opens past the Reels/Watch screen when you click through to it. Strangers' videos are still hidden.
- **Friends-only feed** (new toggle, on by default): News Feed posts not written by a friend are removed completely, with no placeholder. Stories/Reels are filtered card by card.
- **Friends list:** "Sync from Facebook" in the popup opens facebook.com/friends/list and saves friends as you scroll; names or profile links can also be added by hand. Stored locally only. Friend options stay dormant until a list exists, so new installs see no change.
- **Marketplace is never affected:** no hiding, autoplay blocking or friend filtering on `/marketplace`, and Marketplace boxes in the feed are kept.

## 1.2.2 — 2026-08-13

- Chrome Web Store submission kit (no extension behavior changes): `npm run package:store` builds a store-compliant zip (manifest `key` stripped), `npm run screenshots` generates the 1280×800 listing screenshots, `store/listing.md` holds the full copy-paste listing text and permission justifications, and `PRIVACY.md` is the linkable privacy policy.

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
