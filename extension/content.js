// Isolated-world content script: syncs settings to the page, hides video
// players, and manages the Reels/Watch interstitial. The MAIN-world script
// (injected.js) does the actual play() blocking.
(() => {
  let settings = { ...FVB.DEFAULT_SETTINGS };
  let friendIndex = FVB.buildFriendIndex([]);
  let allowedVideos = new Set();

  const onMarketplace = () => FVB.isMarketplacePath(location.pathname);

  const applySettingsToPage = () => {
    document.documentElement.dataset.fvbBlockAutoplay = String(
      settings.blockAutoplay && !onMarketplace()
    );
  };

  // Friend filtering stays dormant until a friend list exists, so the
  // on-by-default "friends-only" never empties the feed of someone who
  // hasn't synced yet.
  const haveFriends = () =>
    friendIndex.names.size + friendIndex.ids.size + friendIndex.usernames.size >
    0;
  const friendsOnlyActive = () =>
    settings.friendsOnly && haveFriends() && onHomeFeed();
  const friendsEnabled = () =>
    (settings.allowFriends || settings.friendsOnly) && haveFriends();
  const isFriend = (author) =>
    FVB.isFriend(friendIndex, author, location.href);

  // "Friends-only" applies to the News Feed, not to groups or pages the user
  // opens on purpose.
  const onHomeFeed = () => /^\/(home\.php)?$/.test(location.pathname);

  // A friend's reel / video / story page the user clicked through to.
  const pageAllowed = () =>
    settings.allowFriends &&
    allowedVideos.has(FVB.videoKey(location.href, location.href));

  // ---- Hiding (runs in every frame) ----

  // root element -> {placeholder, prevDisplay, reason}. reason "video" leaves
  // a small note behind; "silent" (friends-only, story/reel cards) leaves
  // nothing.
  const hiddenRoots = new Map();

  const revealRoot = (root) => {
    const entry = hiddenRoots.get(root);
    if (!entry) return;
    entry.placeholder?.remove();
    root.style.removeProperty("display");
    if (entry.prevDisplay) root.style.display = entry.prevDisplay;
    hiddenRoots.delete(root);
  };

  const setHidden = (root, reason) => {
    if (!root) return;
    const entry = hiddenRoots.get(root);
    if (!reason) return revealRoot(root);
    if (entry?.reason === reason) return;
    if (entry) revealRoot(root);
    const placeholder =
      reason === "video" ? FVB.buildHiddenPlaceholder(document) : null;
    hiddenRoots.set(root, { placeholder, prevDisplay: root.style.display, reason });
    root.style.setProperty("display", "none", "important");
    if (placeholder)
      (root.parentElement || document.body)?.insertBefore(placeholder, root);
  };

  // Player-level hiding outside any feed post (stories viewer, embeds). An
  // already-hidden ancestor makes it a no-op.
  const hidePlayer = (root) => {
    if (!root || hiddenRoots.has(root)) return;
    for (const existing of hiddenRoots.keys())
      if (existing.contains(root)) return;
    setHidden(root, "video");
  };

  // Facebook marks player containers with aria-label="Video player" even
  // before the <video> element exists.
  const PLAYER_MARKER = '[aria-label="Video player" i]';

  // Does a post contain a video, a player, or a link to video content (a
  // /videos/ or /watch permalink, a reel)? Posts are hidden before Facebook
  // even attaches a player — it shows a clickable thumbnail first.
  const unitHasVideo = (unit) =>
    Boolean(unit.querySelector("video, " + PLAYER_MARKER)) ||
    [...unit.querySelectorAll("a[href]")].some((a) =>
      FVB.isVideoLink(a.getAttribute("href"), location.href)
    );

  // Marketplace suggestions in the feed are never removed by friends-only.
  const isMarketplaceUnit = (unit) =>
    [...unit.querySelectorAll("a[href]")].some((a) =>
      FVB.isMarketplaceLink(a.getAttribute("href"), location.href)
    );

  // The Stories tray and Reels shelf: judged card by card, so friends' cards
  // can stay while everyone else's go.
  const evaluateCardUnit = (unit, cards) => {
    const strict = friendsOnlyActive();
    let anyVisible = false;
    for (const card of cards) {
      const friend = isFriend({ name: FVB.cardAuthorName(card) });
      const hide =
        (strict && !friend) ||
        (settings.hideVideos && !(settings.allowFriends && friend));
      setHidden(FVB.findCardRoot(card), hide ? "silent" : null);
      if (!hide) anyVisible = true;
    }
    if (anyVisible) setHidden(unit, null);
    else setHidden(unit, strict ? "silent" : "video");
  };

  // Decides whether one feed post (or tray/shelf) is shown.
  const evaluateUnit = (unit) => {
    // Empty virtualization spacers / loading skeletons: wait for content.
    if (!unit.firstElementChild || !unit.textContent.trim()) return;
    if (unit.classList.contains("fvb-hidden-video")) return;
    if (pageAllowed()) return setHidden(unit, null);
    const author = FVB.findUnitAuthor(unit);
    const cards = unit.querySelectorAll(FVB.CARD_SELECTOR);
    if (!author && cards.length && friendsEnabled())
      return evaluateCardUnit(unit, cards);

    const friend = friendsEnabled() && isFriend(author);
    if (friendsOnlyActive() && !friend && !isMarketplaceUnit(unit))
      return setHidden(unit, "silent");
    if (
      settings.hideVideos &&
      !(settings.allowFriends && friend) &&
      unitHasVideo(unit)
    )
      return setHidden(unit, "video");
    setHidden(unit, null);
  };

  // A <video> outside any feed post: hide its player-sized wrapper.
  const considerLooseVideo = (video) => {
    if (!settings.hideVideos || pageAllowed()) return;
    const rect = video.getBoundingClientRect();
    if (rect.width && rect.height) {
      hidePlayer(FVB.findHideRoot(video));
    } else {
      // Player not laid out yet — hide as soon as it gets a size.
      const ro = new ResizeObserver(() => {
        const r = video.getBoundingClientRect();
        if (!r.width || !r.height) return;
        ro.disconnect();
        if (settings.hideVideos && !pageAllowed())
          hidePlayer(FVB.findHideRoot(video));
      });
      ro.observe(video);
    }
  };

  const considerLooseMarker = (el) => {
    if (!settings.hideVideos || pageAllowed()) return;
    hidePlayer(FVB.findHideRoot(el));
  };

  const UNIT_SELECTOR = '[data-virtualized], [role="feed"] > *';

  // Collects the feed posts touched by an added node, and handles players
  // that live outside the feed.
  const scanNode = (node, units) => {
    if (!(node instanceof Element)) return;
    const enclosing = FVB.findFeedUnit(node);
    if (enclosing) units.add(enclosing);
    for (const u of node.querySelectorAll(UNIT_SELECTOR)) {
      const unit = FVB.findFeedUnit(u);
      if (unit) units.add(unit);
    }
    if (enclosing) return;
    const videos = node.tagName === "VIDEO" ? [node] : [];
    for (const v of [...videos, ...node.querySelectorAll("video")])
      if (!FVB.findFeedUnit(v)) considerLooseVideo(v);
    const markers = node.matches(PLAYER_MARKER) ? [node] : [];
    for (const el of [...markers, ...node.querySelectorAll(PLAYER_MARKER)])
      if (!FVB.findFeedUnit(el)) considerLooseMarker(el);
  };

  const active = () =>
    (settings.hideVideos || settings.friendsOnly) && !onMarketplace();

  new MutationObserver((mutations) => {
    if (!active()) return;
    const units = new Set();
    for (const m of mutations) {
      // Content filling in inside an existing post (author name, player)
      // re-evaluates that post.
      if (m.target instanceof Element) {
        const unit = FVB.findFeedUnit(m.target);
        if (unit) units.add(unit);
      }
      for (const n of m.addedNodes) scanNode(n, units);
    }
    for (const unit of units) evaluateUnit(unit);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Full re-evaluation after a settings / friend-list / URL change.
  const applyHideSetting = () => {
    for (const root of [...hiddenRoots.keys()]) revealRoot(root);
    if (!active()) return;
    const units = new Set();
    scanNode(document.documentElement, units);
    for (const unit of units) evaluateUnit(unit);
  };

  // ---- Remember friends' videos the user clicks through to ----

  const PENDING_MS = 15000;

  const allowVideo = (key) => {
    if (!key || allowedVideos.has(key)) return;
    allowedVideos.add(key);
    chrome.storage.local.set({ allowedVideos: [...allowedVideos].slice(-300) });
  };

  // A click on (or into) a friend's post or story/reel card lets the page it
  // opens through. Share links and theater views change URL on the way, so
  // the next video page within a few seconds is allowed too.
  const onFriendClick = (e) => {
    if (!settings.allowFriends || !e.isTrusted) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const card = target.closest(FVB.CARD_SELECTOR);
    let friend;
    if (card) {
      friend = isFriend({ name: FVB.cardAuthorName(card) });
    } else {
      const unit = FVB.findFeedUnit(target);
      friend = Boolean(unit) && isFriend(FVB.findUnitAuthor(unit));
    }
    if (!friend) return;
    const link = card || target.closest("a[href]");
    const key = link && FVB.videoKey(link.getAttribute("href"), location.href);
    if (key) allowVideo(key);
    // Only needed when the destination URL isn't known up front.
    if (!key || key.startsWith("share:"))
      chrome.storage.local.set({ friendClickAt: Date.now() });
  };
  document.addEventListener("click", onFriendClick, true);
  document.addEventListener("auxclick", onFriendClick, true);

  // Called on load and on each soft navigation.
  const consumePendingFriendClick = (then) => {
    const key = FVB.videoKey(location.href, location.href);
    if (!settings.allowFriends || !key) return then();
    chrome.storage.local.get({ friendClickAt: 0 }, ({ friendClickAt }) => {
      // Any video page consumes a pending click, so it can't leak onto the
      // next (stranger's) video.
      if (friendClickAt) chrome.storage.local.set({ friendClickAt: 0 });
      if (Date.now() - friendClickAt < PENDING_MS) allowVideo(key);
      then();
    });
  };

  // ---- Reels / Watch page interstitial (top frame only) ----

  let updateOverlay = () => {};

  if (window === window.top) {
    let overlay = null;

    const removeOverlay = () => {
      overlay?.remove();
      overlay = null;
    };

    const showOverlay = () => {
      if (overlay) return;
      overlay = FVB.buildOverlay(document, {
        onBack: () => {
          if (history.length > 1) history.back();
          else location.href = "https://www.facebook.com/";
        },
      });
      (document.body || document.documentElement).appendChild(overlay);
    };

    updateOverlay = () => {
      const shouldBlock =
        settings.blockPages &&
        FVB.isBlockedPath(location.pathname) &&
        !pageAllowed();
      if (shouldBlock) showOverlay();
      else removeOverlay();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", updateOverlay);
    } else {
      updateOverlay();
    }
  }

  // Facebook is a SPA; watch for soft navigations.
  const onNavigate = () =>
    consumePendingFriendClick(() => {
      refreshAll();
      updateHarvester();
    });
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      onNavigate();
    }
  }, 400);
  window.addEventListener("popstate", onNavigate);

  // ---- Friend list sync (facebook.com/friends/list, top frame) ----

  let friends = [];
  let harvestObserver = null;
  let harvestBanner = null;

  const showHarvestBanner = (text) => {
    if (!harvestBanner) {
      harvestBanner = document.createElement("div");
      harvestBanner.id = "fvb-friends-banner";
      harvestBanner.style.cssText =
        "position:fixed;left:16px;bottom:16px;z-index:2147483647;" +
        "max-width:320px;padding:12px 14px;border-radius:10px;" +
        "background:#101418;color:#e7edf3;box-shadow:0 4px 16px rgba(0,0,0,.3);" +
        "font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
      (document.body || document.documentElement).appendChild(harvestBanner);
    }
    harvestBanner.textContent = text;
  };

  // The friend list lives in the side navigation (not the top banner).
  const friendListNavs = () =>
    [...document.querySelectorAll('[role="navigation"]')].filter(
      (nav) => !nav.closest('[role="banner"]')
    );

  const harvestVisible = () =>
    FVB.mergeFriends(
      [],
      friendListNavs().flatMap((nav) =>
        FVB.harvestFriendLinks(nav, location.href)
      )
    );

  // Manual visit: merge whatever is on screen as the user scrolls.
  const harvest = () => {
    const merged = FVB.mergeFriends(friends, harvestVisible());
    if (merged.length !== friends.length) {
      friends = merged;
      chrome.storage.local.set({ friends });
    }
    showHarvestBanner(
      `FB Video Block: ${friends.length} friends saved. ` +
        "Scroll your friend list to the end to capture everyone."
    );
  };

  // Sync tab (opened by background.js, daily or from the popup): scroll the
  // list to the end by itself, then hand the full list back and let the
  // background close the tab.
  const SYNC_TICK_MS = 1000;
  const SYNC_STABLE_TICKS = 6; // no new friends for this long = end of list
  const SYNC_MAX_MS = 3 * 60 * 1000;

  const scrollFriendListOnce = () => {
    // Facebook lazy-loads more friends as the list's scroll container nears
    // its end. Which element scrolls isn't stable, so scroll every
    // scrollable element in (or around) the friend list pane.
    const isScrollable = (el) => el.scrollHeight > el.clientHeight + 10;
    for (const nav of friendListNavs()) {
      const targets = [...nav.querySelectorAll("*")].filter(isScrollable);
      for (let el = nav; el; el = el.parentElement)
        if (isScrollable(el)) targets.push(el);
      for (const el of targets) {
        el.scrollTop = el.scrollHeight;
        el.dispatchEvent(new Event("scroll"));
      }
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  };

  const runSyncTab = () => {
    const started = Date.now();
    let found = [];
    let stable = 0;
    const tick = () => {
      const now = harvestVisible();
      const all = FVB.mergeFriends(found, now);
      stable = all.length > found.length ? 0 : stable + 1;
      found = all;
      showHarvestBanner(
        `FB Video Block: syncing your friends list… ${found.length} found. ` +
          "This tab closes by itself."
      );
      const done =
        (found.length && stable >= SYNC_STABLE_TICKS) ||
        Date.now() - started > SYNC_MAX_MS ||
        (!found.length && Date.now() - started > 20000); // logged out?
      if (done) {
        chrome.runtime.sendMessage({ type: "fvb-sync-done", friends: found });
        return;
      }
      scrollFriendListOnce();
      setTimeout(tick, SYNC_TICK_MS);
    };
    tick();
  };

  let harvestTimer = null;
  let harvesting = false;
  const updateHarvester = () => {
    const onList =
      window === window.top && FVB.isFriendsListPage(location.href);
    if (onList && !harvesting) {
      harvesting = true;
      chrome.runtime.sendMessage({ type: "fvb-is-sync-tab" }, (isSyncTab) => {
        void chrome.runtime.lastError;
        if (isSyncTab) return runSyncTab();
        harvestObserver = new MutationObserver(() => {
          clearTimeout(harvestTimer);
          harvestTimer = setTimeout(harvest, 500);
        });
        harvestObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
        harvest();
      });
    } else if (!onList && harvesting) {
      harvesting = false;
      harvestObserver?.disconnect();
      harvestObserver = null;
      harvestBanner?.remove();
      harvestBanner = null;
    }
  };

  // ---- New friends, picked up as they happen (top frame) ----

  const addFriends = (entries) => {
    if (!entries.length) return;
    chrome.storage.local.get({ friends: [] }, (local) => {
      const merged = FVB.mergeFriends(local.friends, entries);
      if (merged.length !== local.friends.length)
        chrome.storage.local.set({ friends: merged });
    });
  };

  // "<Name> accepted your friend request." in the notification data that
  // Facebook embeds in the page.
  const scannedScripts = new WeakSet();
  const scanNotificationData = () => {
    if (!settings.autoSyncFriends || window !== window.top) return;
    const found = [];
    for (const script of document.querySelectorAll(
      'script[type="application/json"]'
    )) {
      if (scannedScripts.has(script)) continue;
      scannedScripts.add(script);
      const text = script.textContent;
      if (!text.includes("accepted your friend request")) continue;
      try {
        found.push(...FVB.extractAcceptedFriends(JSON.parse(text)));
      } catch {
        // not JSON we understand
      }
    }
    addFriends(found);
  };

  // Accepting a request yourself sends you no notification, so catch the
  // Confirm click.
  document.addEventListener(
    "click",
    (e) => {
      if (!settings.autoSyncFriends || !e.isTrusted) return;
      const button =
        e.target instanceof Element &&
        e.target.closest('[aria-label="Confirm"], [aria-label="Confirm request"]');
      if (!button) return;
      const requester = FVB.findRequester(button, location.href);
      if (requester) addFriends([requester]);
    },
    true
  );

  // Monthly full re-scan: any visible Facebook tab asks the background to
  // re-scan the whole friend list when the last full scan is a month old (it only runs while you're
  // logged in and using Facebook).
  const maybeAutoSync = () => {
    if (window !== window.top || FVB.isFriendsListPage(location.href)) return;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", ask);
      chrome.runtime.sendMessage({ type: "fvb-maybe-sync" }, () => {
        void chrome.runtime.lastError;
      });
    };
    if (document.visibilityState === "visible") ask();
    else document.addEventListener("visibilitychange", ask);
  };

  // ---- Settings ----

  const LOCAL_DEFAULTS = { friends: [], extraFriends: "", allowedVideos: [] };

  const applyLocal = (local) => {
    friends = local.friends || [];
    allowedVideos = new Set(local.allowedVideos || []);
    friendIndex = FVB.buildFriendIndex([
      ...friends,
      ...FVB.parseFriendsText(local.extraFriends),
    ]);
  };

  const refreshAll = () => {
    applySettingsToPage();
    applyHideSetting();
    updateOverlay();
  };

  chrome.storage.sync.get(FVB.DEFAULT_SETTINGS, (stored) => {
    settings = { ...FVB.DEFAULT_SETTINGS, ...stored };
    chrome.storage.local.get(LOCAL_DEFAULTS, (local) => {
      applyLocal(local);
      consumePendingFriendClick(refreshAll);
      maybeAutoSync();
      scanNotificationData();
      window.addEventListener("load", scanNotificationData);
      setTimeout(scanNotificationData, 5000);
      if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", updateHarvester);
      else updateHarvester();
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      for (const [key, { newValue }] of Object.entries(changes)) {
        settings[key] = newValue;
      }
      refreshAll();
    } else if (
      area === "local" &&
      (changes.friends || changes.extraFriends)
    ) {
      // allowedVideos / friendClickAt churn doesn't need a re-scan.
      chrome.storage.local.get(LOCAL_DEFAULTS, (local) => {
        applyLocal(local);
        refreshAll();
      });
    } else if (area === "local" && changes.allowedVideos) {
      allowedVideos = new Set(changes.allowedVideos.newValue || []);
    }
  });
})();
