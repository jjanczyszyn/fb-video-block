# Handoff — 2026-08-13 ~23:45

**What this is:** FB Video Block — a Chrome (MV3) extension that hides all facebook.com videos (small "Video hidden" note, no reveal button), blocks autoplay for any visible video (click-to-play), and covers Reels/Watch pages with a no-exceptions "Take me back" screen. See `README.md`; all logic in `extension/`.

**State:** v1.2.0 shipped (PR #3 merged, CI green, release with zip). Hiding now removes whole feed units found via `[data-virtualized]` wrappers (`role="feed"` fallback), triggered by `<video>`, video links (reel/watch/videos/share/v|r), or `aria-label="Video player"` — validated against the user's saved real-feed snapshot at `~/Downloads/Facebook.html` (Reels shelf + Stories tray hidden, 0/4 videos visible, other posts untouched; validation script in session scratchpad). The "Let me watch this one" bypass was deliberately removed at the user's request (a 3/day version was built then deleted — don't resurrect unless asked). Popup toggles (all default on) are the only escape. No backend, no Convex, $0 cost.

**Ops essentials:** `npm test` (19 unit + 5 e2e); `npm run package` → `dist/fb-video-block.zip`. The manifest `key` pins the extension ID (`knhdeghllhieckbhkogfcbkhdgnjpmgm`); e2e derives it from the key and drives the popup page. Private key in session scratchpad only — not needed unless publishing to the Web Store.

**Public since 2026-08-13:** repo visibility flipped to public after PR #4 (MIT license, README polish, history scanned clean for secrets). A Substack post draft announcing the extension lives as a private artifact ("the-video-sinkhole"), revised per the user to avoid em dashes and contrast-y AI-sounding phrasing; the owner publishes it themself.

**Chrome Web Store (PR #5, v1.2.2):** full submission kit ready — `npm run package:store` (store zip, manifest key stripped), `store/listing.md` (all dashboard fields incl. permission justifications), `store/screenshots/` (three generated 1280×800 PNGs), `PRIVACY.md`. Blocked on the user: one-time $5 developer registration at chrome.google.com/webstore/devconsole (never expires), then upload + paste listing. Offer to automate future uploads via the CWS API once they have an account.

**Time-sensitive:** awaiting user confirmation that v1.2.0 hides everything on the live site (they must reinstall + reload tabs). Known deliberate side effect: the Stories tray is hidden too (contains video previews) — offer a "keep Stories" toggle if they object. `aria-label="Video player"` matching is English-UI-only.

**Open threads / ideas:** Chrome Web Store publishing if zip-sharing gets tedious ($5 one-time); optional Stories exemption toggle; public issues may start arriving now.
