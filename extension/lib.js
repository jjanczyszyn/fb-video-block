// Pure, testable helpers shared by the content script and the unit tests.
const FVB = {
  DEFAULT_SETTINGS: {
    blockAutoplay: true,
    blockPages: true,
    hideVideos: true,
    allowFriends: true,
    friendsOnly: true,
    autoSyncFriends: true,
  },

  FRIENDS_LIST_URL: "https://www.facebook.com/friends/list",
  SYNC_INTERVAL_MS: 24 * 60 * 60 * 1000,
  // After a failed/abandoned attempt (logged out, tab closed) wait this long.
  SYNC_RETRY_MS: 60 * 60 * 1000,

  // Is a daily friend-list refresh due?
  shouldAutoSync(settings, state, now) {
    if (!settings.autoSyncFriends) return false;
    if (!settings.allowFriends && !settings.friendsOnly) return false;
    return (
      now - (state.lastFriendSync || 0) >= this.SYNC_INTERVAL_MS &&
      now - (state.lastFriendSyncAttempt || 0) >= this.SYNC_RETRY_MS
    );
  },

  // Result of a full scroll through the friend list. A complete-looking run
  // replaces the stored list (so unfriended people drop off); a run that
  // came back much smaller than before (page didn't fully load) only adds.
  resolveSyncedFriends(previous, harvested) {
    const prev = previous || [];
    const fresh = this.mergeFriends([], harvested);
    if (!fresh.length) return prev;
    if (fresh.length >= prev.length * 0.9) return fresh;
    return this.mergeFriends(prev, fresh);
  },

  // Marketplace is never touched: no hiding, no autoplay blocking, no
  // friend filtering.
  isMarketplacePath(pathname) {
    return /^\/marketplace(\/|$)/.test(pathname);
  },

  isMarketplaceLink(href, base) {
    try {
      const url = new URL(href, base);
      return (
        /(^|\.)facebook\.com$/.test(url.hostname) ||
        url.origin === new URL(base).origin
      ) && this.isMarketplacePath(url.pathname);
    } catch {
      return false;
    }
  },

  // First path segments on facebook.com that are never someone's profile.
  RESERVED_PATHS: new Set([
    "", "ads", "bookmarks", "business", "checkpoint", "composer", "dialog",
    "events", "find-friends", "friends", "fundraisers", "gaming", "games",
    "groups", "hashtag", "help", "home.php", "jobs", "l.php", "latest", "live",
    "login", "logout", "marketplace", "me", "memories", "messages",
    "notifications", "pages", "permalink.php", "photo", "photo.php", "photos",
    "plugins", "policies", "privacy", "recover", "reel", "reels", "reg",
    "saved", "search", "settings", "share", "sharer", "stories", "story.php",
    "video", "video.php", "videos", "watch", "weather",
  ]),

  // Story and Reel cards in the Stories tray / Reels shelf. Facebook labels
  // each with its author: "Jane Doe's story", "BBC, view story",
  // "Reel by Jane Doe". (English UI only, like the "Video player" marker.)
  CARD_SELECTOR: [
    `a[aria-label$="'s story"]`,
    `a[aria-label$="’s story"]`,
    `a[aria-label$=", view story"]`,
    `a[aria-label^="Reel by "]`,
  ].join(","),

  normalizeName(name) {
    return String(name || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  },

  // Extracts a stable profile reference from a link: a numeric id
  // (profile.php?id=, ?profile_id=, /people/Name/<id>) or a vanity username
  // (facebook.com/jane.doe). Returns null for anything that isn't a profile.
  profileRef(href, base) {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, base);
    } catch {
      return null;
    }
    const sameSite =
      url.origin === new URL(base).origin ||
      /(^|\.)facebook\.com$/.test(url.hostname);
    if (!sameSite) return null;
    const idParam =
      url.searchParams.get("profile_id") ||
      (url.pathname === "/profile.php" && url.searchParams.get("id"));
    if (idParam && /^\d+$/.test(idParam)) return { id: idParam };
    const people = url.pathname.match(/^\/people\/[^/]+\/(\d+)/);
    if (people) return { id: people[1] };
    const single = url.pathname.match(/^\/([A-Za-z0-9.]+)\/?$/);
    if (single && !this.RESERVED_PATHS.has(single[1].toLowerCase()))
      return { username: single[1].toLowerCase() };
    return null;
  },

  // Friends are stored as {name?, id?, username?} entries.
  buildFriendIndex(friends) {
    const index = { names: new Set(), ids: new Set(), usernames: new Set() };
    for (const f of friends || []) {
      if (f.name) index.names.add(this.normalizeName(f.name));
      if (f.id) index.ids.add(String(f.id));
      if (f.username) index.usernames.add(f.username.toLowerCase());
    }
    return index;
  },

  // Is this author ({name, href}) on the friend list? Matches by profile id
  // or username when the link has one, otherwise by display name.
  isFriend(index, author, base) {
    if (!author) return false;
    const ref = author.href ? this.profileRef(author.href, base) : null;
    if (ref?.id && index.ids.has(ref.id)) return true;
    if (ref?.username && index.usernames.has(ref.username)) return true;
    const name = this.normalizeName(author.name);
    return Boolean(name) && index.names.has(name);
  },

  // The author of a feed post: Facebook tags the header name with
  // data-ad-rendering-role="profile_name"; older layouts use a heading link.
  findUnitAuthor(unit) {
    const a =
      unit.querySelector('[data-ad-rendering-role="profile_name"] a[href]') ||
      unit.querySelector("h2 a[href], h3 a[href], h4 a[href]");
    if (!a) return null;
    return { name: a.textContent.trim(), href: a.getAttribute("href") };
  },

  cardAuthorName(card) {
    const label = (card.getAttribute("aria-label") || "").trim();
    const m =
      label.match(/^(.+)['’]s story$/i) ||
      label.match(/^(.+), view story$/i) ||
      label.match(/^Reel by (.+)$/i);
    return m ? m[1].trim() : null;
  },

  // The element to hide for a single story/reel card inside a tray or shelf.
  findCardRoot(card) {
    return (
      card.closest('[data-type="hscroll-child"], [role="gridcell"]') || card
    );
  },

  // A stable key for a video destination, so a friend's reel/video/story
  // can be let through the Reels/Watch screen after clicking it.
  videoKey(href, base) {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, base);
    } catch {
      return null;
    }
    const p = url.pathname;
    let m;
    if ((m = p.match(/^\/reels?\/(\d+)/))) return `video:${m[1]}`;
    if ((m = p.match(/^\/stories\/(\d+)/))) return `story:${m[1]}`;
    if ((m = p.match(/^\/share\/[vr]\/([^/]+)/))) return `share:${m[1]}`;
    if ((m = p.match(/\/videos?\/(?:[^/]+\/)*?(\d+)/))) return `video:${m[1]}`;
    const v = url.searchParams.get("v");
    if (/^\/(watch|video\.php)/.test(p) && v && /^\d+$/.test(v))
      return `video:${v}`;
    return null;
  },

  // Manual friend list: one name or profile link per line.
  parseFriendsText(text) {
    const out = [];
    for (const raw of String(text || "").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (/facebook\.com|^\//i.test(line)) {
        const href = /^(https?:)?\/\//i.test(line) || line.startsWith("/")
          ? line
          : `https://${line}`;
        const ref = this.profileRef(href, "https://www.facebook.com/");
        if (ref) out.push(ref);
      } else {
        out.push({ name: line });
      }
    }
    return out;
  },

  isFriendsListPage(href) {
    try {
      return /^\/friends\/list\/?$/.test(new URL(href).pathname);
    } catch {
      return false;
    }
  },

  // Collects {name, id|username} from profile links under root (the friend
  // list on facebook.com/friends/list). The name is the link's first text,
  // which skips trailing "12 mutual friends" lines.
  harvestFriendLinks(root, base) {
    const out = [];
    for (const a of root.querySelectorAll("a[href]")) {
      const ref = this.profileRef(a.getAttribute("href"), base);
      if (!ref) continue;
      const walker = a.ownerDocument.createTreeWalker(a, 4 /* SHOW_TEXT */);
      let name = "";
      while (!name && walker.nextNode()) name = walker.currentNode.nodeValue.trim();
      if (!name || name.length > 80 || /mutual friend/i.test(name)) continue;
      out.push({ name, ...ref });
    }
    return out;
  },

  // Merges friend entries, deduplicating by id, username, then name.
  mergeFriends(existing, incoming) {
    const keyOf = (f) =>
      f.id ? `id:${f.id}` : f.username ? `u:${f.username}` : `n:${this.normalizeName(f.name)}`;
    const map = new Map();
    for (const f of [...(existing || []), ...(incoming || [])]) {
      const k = keyOf(f);
      map.set(k, { ...map.get(k), ...f });
    }
    return [...map.values()];
  },

  // Paths that are pure video rabbit holes on facebook.com.
  isBlockedPath(pathname) {
    return /^\/(reel|reels|watch)(\/|$)/.test(pathname);
  },

  // Does this link point at video content (a reel, a watch page, or a
  // /videos/ permalink)? Used to hide whole feed posts before their player —
  // or even a poster thumbnail — renders. Only same-site/facebook links count.
  isVideoLink(href, base) {
    if (!href) return false;
    let url;
    try {
      url = new URL(href, base);
    } catch {
      return false;
    }
    const sameSite =
      url.origin === new URL(base).origin ||
      /(^|\.)facebook\.com$/.test(url.hostname);
    if (!sameSite) return false;
    return (
      /^\/(reel|reels|watch)(\/|$)/.test(url.pathname) ||
      /^\/share\/[vr]\//.test(url.pathname) ||
      /\/videos?\//.test(url.pathname)
    );
  },

  // Finds the whole feed post (or shelf) an element belongs to. Facebook's
  // 2026 feed wraps each unit in [data-virtualized]; older/simpler layouts
  // use children of [role="feed"]. Returns null outside a feed (e.g. nav
  // links), so callers can fall back to player-level hiding.
  findFeedUnit(el) {
    const virtualized = el.closest("[data-virtualized]");
    if (virtualized) return virtualized;
    let node = el;
    while (node && node.parentElement) {
      if (node.parentElement.getAttribute?.("role") === "feed") return node;
      node = node.parentElement;
    }
    return null;
  },

  // Walks up from a <video> to the outermost ancestor that is still roughly
  // player-sized (Facebook wraps the video in overlay/control layers of the
  // same footprint), so hiding it removes the whole player but not the post.
  findHideRoot(video) {
    const vr = video.getBoundingClientRect();
    if (!vr.width || !vr.height) return video;
    let root = video;
    let node = video.parentElement;
    const body = video.ownerDocument.body;
    while (node && node !== body) {
      const r = node.getBoundingClientRect();
      if (r.width - vr.width > 60 || r.height - vr.height > 120) break;
      root = node;
      node = node.parentElement;
    }
    return root;
  },

  // Small inline note that replaces a hidden video player. Deliberately has
  // no "show" button — hiding is all-or-nothing via the popup toggle.
  buildHiddenPlaceholder(doc) {
    const wrap = doc.createElement("div");
    wrap.className = "fvb-hidden-video";
    wrap.style.cssText =
      "display:flex;align-items:center;gap:10px;" +
      "padding:10px 14px;margin:4px 0;border:1px dashed #3a4552;border-radius:8px;" +
      "background:rgba(24,119,242,.06);color:#65676b;" +
      "font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
    wrap.textContent = "🎬 Video hidden by FB Video Block";
    return wrap;
  },

  // Builds the full-page interstitial shown on Reels/Watch pages.
  // Deliberately no per-video escape hatch — the popup toggles are the only
  // way through.
  buildOverlay(doc, { onBack }) {
    const overlay = doc.createElement("div");
    overlay.id = "fvb-overlay";
    overlay.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "background:#101418",
        "color:#e7edf3",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        "gap:16px",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
        "text-align:center",
        "padding:24px",
      ].join(";")
    );

    const emoji = doc.createElement("div");
    emoji.textContent = "⏸️";
    emoji.style.fontSize = "56px";

    const title = doc.createElement("div");
    title.textContent = "Videos are blocked here";
    title.style.cssText = "font-size:26px;font-weight:700";

    const subtitle = doc.createElement("div");
    subtitle.id = "fvb-overlay-subtitle";
    subtitle.textContent =
      "You asked FB Video Block to keep you out of Reels and Watch.";
    subtitle.style.cssText = "font-size:15px;opacity:.75;max-width:420px";

    const buttonRow = doc.createElement("div");
    buttonRow.style.cssText = "display:flex;gap:12px;margin-top:8px";

    const back = doc.createElement("button");
    back.id = "fvb-back";
    back.textContent = "Take me back";
    back.style.cssText =
      "padding:10px 20px;border-radius:8px;border:0;background:#1877f2;color:#fff;font-size:15px;font-weight:600;cursor:pointer";
    back.addEventListener("click", onBack);

    buttonRow.append(back);

    const settingsNote = doc.createElement("div");
    settingsNote.id = "fvb-settings-note";
    settingsNote.textContent =
      "To change this, use the FB Video Block icon in your toolbar.";
    settingsNote.style.cssText = "font-size:12px;opacity:.5;margin-top:4px";

    overlay.append(emoji, title, subtitle, buttonRow, settingsNote);
    return overlay;
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = FVB;
} else {
  self.FVB = FVB;
}
