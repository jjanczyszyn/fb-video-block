# Chrome Web Store listing — copy-paste kit

Everything below maps 1:1 to fields in the [developer dashboard](https://chrome.google.com/webstore/devconsole).

## Store listing tab

**Name**
FB Video Block

**Summary** (max 132 chars)
Hides every video on Facebook — feed videos, Reels, Stories — before you see them, so you stop getting sucked in.

**Description**
Open Facebook for one thing, surface twenty minutes later from a video you never meant to watch? FB Video Block removes the sinkhole.

WHAT IT DOES
• Hides videos completely — every video post, the Reels shelf, the Stories tray, and video ads collapse into a small "🎬 Video hidden" note before they reach your eyes.
• Blocks autoplay — any video that is still visible stays paused until you deliberately click it.
• Blocks the Reels and Watch pages — opening them shows a friendly "Videos are blocked here" screen with a Take me back button.

Deliberately, there is no "watch just this one" button. The only way to see videos again is the extension's toolbar popup, where three toggles (all on by default) control each protection.

WHAT IT DOESN'T DO
No account, no tracking, no analytics, no network requests. The only permission is storage, used for your three toggles. Runs only on facebook.com. Free and open source: https://github.com/jjanczyszyn/fb-video-block

Note: Facebook changes its layout regularly. If a video slips through, report it on GitHub and it will be fixed.

**Category:** Productivity → Workflow & Planning (or "Tools")
**Language:** English

**Screenshots:** upload the three PNGs from `store/screenshots/` (1280×800).

## Privacy tab

**Single purpose description**
Hides video content (video posts, Reels, Stories) on facebook.com and prevents videos there from autoplaying, so users are not drawn into unwanted video watching.

**Permission justifications**
- `storage`: Stores the user's three on/off preference toggles (hide videos / block autoplay / block Reels and Watch pages). No other data is stored.
- Host permission `https://*.facebook.com/*` (content scripts): The extension's sole purpose is to hide and pause video content on Facebook pages, which requires running a content script there. It runs on no other site.

**Are you using remote code?** No.

**Data usage:** check "Does not collect or use user data" — the extension makes no network requests and collects nothing.

**Privacy policy URL**
https://github.com/jjanczyszyn/fb-video-block/blob/main/PRIVACY.md

## Build to upload

```bash
npm run package:store   # → dist/fb-video-block-store.zip (manifest "key" stripped)
```

Upload that zip on the "Package" tab. Expect an initial review of a few days (host permission on facebook.com triggers manual review; the justifications above cover it).
