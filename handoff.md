# Handoff — 2026-08-13 ~19:45

**What this is:** FB Video Block — a Chrome (MV3) extension that hides all facebook.com videos (small "Video hidden" note, no reveal button), blocks autoplay for any visible video (click-to-play), and covers Reels/Watch pages with a no-exceptions "Take me back" screen. See `README.md`; all logic in `extension/`.

**State:** v1.1.0 shipped (PR #2 merged, CI green, release with zip attached). v1.1.0 removed the "Let me watch this one" bypass at the user's request — a 3/day-limited version of it was built mid-session and then deliberately deleted; don't resurrect it unless asked. Popup toggles (all default on) are the only escape. No backend, no Convex, $0 cost.

**Ops essentials:** `npm test` (19 unit + 5 e2e); `npm run package` → `dist/fb-video-block.zip`. The manifest `key` pins the extension ID (`knhdeghllhieckbhkogfcbkhdgnjpmgm`); e2e derives it from the key and drives the popup page. Private key in session scratchpad only — not needed unless publishing to the Web Store.

**Time-sensitive:** user reported an ad video still playing under v1.0.0 — likely an un-reloaded tab and/or the sub-frame gap fixed in v1.1.0 (`match_origin_as_fallback`). Awaiting confirmation that v1.1.0 fully fixes it on real facebook.com; if not, debug `injected.js`/hide heuristics with the user's specific example.

**Open threads / ideas:** hide the Reels shelf/links in the feed entirely; Chrome Web Store publishing if zip-sharing gets tedious ($5 one-time).
