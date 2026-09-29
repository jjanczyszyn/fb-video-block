# Handoff — 2026-09-29 ~14:30

**What this is:** FB Video Block, a Chrome (MV3) extension: hides facebook.com videos, click-to-play autoplay block, "Take me back" screen on Reels/Watch. See `README.md`; all logic in `extension/`.

**State:** v1.3.0 shipped (PR #6 merged, CI green, GitHub release with zip). New: **Show videos from friends** + **Friends-only feed** toggles (both default ON, dormant until a friends list exists). Friends synced by opening facebook.com/friends/list (popup "Sync from Facebook"; harvests profile links inside non-banner `[role="navigation"]`) or typed in the popup textarea; stored in `chrome.storage.local`. Post author = `[data-ad-rendering-role="profile_name"] a`; Stories/Reels cards matched by aria-label ("X's story", "X, view story", "Reel by X"), all verified against `~/Downloads/Facebook.html`. Friend reel click-through remembered as `allowedVideos` keys. Friends-only applies to the home feed only. **Marketplace fully exempt** (pages and in-feed boxes).

**Ops essentials:** `npm test` (81 unit + 13 e2e); `npm run package` → `dist/fb-video-block.zip`; `npm run package:store` for the Web Store zip. Manifest `key` pins the ID.

**Unverified on the live site:** the /friends/list harvest selector (no real snapshot of that page). If the sync banner stays at 0, get a "save page as" snapshot of facebook.com/friends/list and adjust `harvest()` in `content.js`. Manual names in the popup are the fallback.

**Open threads:** user needs to reinstall v1.3.0 + reload tabs, then sync friends. Chrome Web Store submission still blocked on the $5 dev registration (kit in `store/`; listing text updated for 1.3.0, screenshots are still from 1.2).
