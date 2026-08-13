# Handoff — 2026-08-13 ~19:20

**What this is:** FB Video Block — a Chrome (MV3) extension that blocks Facebook video autoplay (click-to-play) and puts an interstitial over Reels/Watch pages. See `README.md` for architecture; all logic is in `extension/`.

**State:** v1.0.0 shipped. PR #1 merged to main with CI green (unit + Playwright e2e). Release `v1.0.0` on GitHub has the shareable `fb-video-block.zip` attached. No backend, no Convex, no cost-generating resources.

**Ops essentials:** `npm test` runs everything; `npm run package` rebuilds the zip; e2e loads the real extension into Chromium against localhost fixtures (real facebook.com is never hit in tests).

**Open threads / ideas (not started):**
- User hasn't confirmed real-world behavior on facebook.com yet — if FB's player fights the blocker (stutter loops), tune `injected.js`.
- Possible v1.1: hide the Reels shelf in the feed; option to also cover feed videos with a click-to-play overlay.
- Chrome Web Store publishing if sharing by zip gets tedious ($5 one-time dev fee).
