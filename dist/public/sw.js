/**
 * Max Booster Service Worker v12
 *
 * v12: public-only asset caching, owner-bound receipt-backed handoffs,
 * account Web Lock coordination and acknowledged waiting-worker activation.
 *
 * Key improvements (v9):
 *  • pushsubscriptionchange handler — automatically re-subscribes when the
 *    browser invalidates a push subscription (e.g. after browser updates or
 *    VAPID key rotation) by fetching a fresh VAPID key and re-registering
 *    the new subscription with the server.
 *
 * Key improvements (v8):
 *  • Silent push handler — processes background sync events from the server
 *    without showing a visible notification (feed refresh, message sync, etc.)
 *  • Category-specific notification actions — Security, Royalties, Collab, etc.
 *    each get contextual action buttons matched to the notification type
 *  • Rich notification display — image, badge, vibrate patterns, renotify
 *  • notificationclose tracking — tells the client when a notification is closed
 *
 * Pre-v8 features:
 *  • DEV MODE bypass — on localhost (Vite dev server), the SW is a transparent
 *    pass-through: no caching of the app shell, no stale HTML, no hashed-asset
 *    mismatches. Caching is only active on production domains.
 *  • PRECACHE_APP_CHUNKS handler — after first load in production, the app sends
 *    the hashed JS/CSS chunk URLs for near-instant repeat visits.
 *  • Network-first for app shell — always fetches fresh HTML from server.
 *  • Previous releases used immediate takeover; v12 requires explicit approval.
 */

const IS_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname.endsWith(".replit.dev") ||
  self.location.hostname.endsWith(".picard.replit.dev");

const CACHE_VER = "v12";
const STATIC_CACHE = "max-booster-static-" + CACHE_VER;
const DYNAMIC_CACHE = "max-booster-dynamic-" + CACHE_VER;
const API_CACHE = "max-booster-api-" + CACHE_VER;
const SHELL_CACHE = "max-booster-shell-" + CACHE_VER;

const STATIC_ASSETS = [
  "/manifest.json",
  "/offline.html",
  "/favicon.png",
  "/favicon.svg",
  "/favicon-32.png",
  "/logo.png",
];

const API_CACHE_ENDPOINTS = [
  "/api/analytics",
  "/api/dashboard",
  "/api/user/preferences",
  "/api/projects",
  "/api/studio",
  "/api/settings",
  "/api/posts",
  "/api/releases",
  "/api/distribution",
];

const CACHE_TTL = {
  api: 5 * 60 * 1000,
  analytics: 15 * 60 * 1000,
  dashboard: 5 * 60 * 1000,
  static: 7 * 24 * 60 * 60 * 1000,
  studio: 30 * 60 * 1000,
  settings: 60 * 60 * 1000,
  posts: 10 * 60 * 1000,
  projects: 20 * 60 * 1000,
};

const OFFLINE_DRAFT_CACHE = "max-booster-drafts-v1";
const OFFLINE_MEDIA_CACHE = "max-booster-media-v1";
const UPDATE_CONTROL_CACHE = "max-booster-update-control-v1";
const HANDOFF_CACHE = "max-booster-sync-handoffs-v1";
const ACCOUNT_STATE_CACHE = "max-booster-account-state-v1";
let updateRequest = null;

// ── Install ──────────────────────────────────────────────────────────────────
// Verify required public assets before install succeeds; remain waiting.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
// Purge legacy private response caches; retain static generations and drafts.
self.addEventListener("activate", (event) => {
  const currentCaches = new Set([
    STATIC_CACHE,
    DYNAMIC_CACHE,
    API_CACHE,
    SHELL_CACHE,
  ]);
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(
              (name) =>
                /^(max-booster-(api|dynamic|shell)-)/.test(name) && !currentCaches.has(name),
            )
            .map((name) => {
              console.log("[SW] Evicting old cache:", name);
              return caches.delete(name);
            }),
        );
      })
      .then(async () => {
        const cache = await caches.open(UPDATE_CONTROL_CACHE);
        const approval = await cache.match("/approved-app-update");
        if (approval && (await approval.json()).expiresAt > Date.now()) {
          await cache.delete("/approved-app-update");
          await self.clients.claim();
        }
      }),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && request.method === "POST" && url.pathname === "/api/sync/batch") {
    event.respondWith(handleVersionedSync(request));
    return;
  }
  // Private responses and writes belong to the account-scoped page repository.
  const publicAsset = url.origin === self.location.origin &&
    (STATIC_ASSETS.includes(url.pathname) ||
      /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(url.pathname));
  if (!publicAsset) {
    if (request.mode === "navigate") {
      event.respondWith(fetch(request).catch(async () =>
        (await caches.match("/offline.html")) ||
        new Response("You are offline. Reconnect to open this page.", { status: 503, headers: { "Content-Type": "text/plain" } })));
    }
    return;
  }

  // DEV MODE: transparent pass-through — no caching whatsoever.
  // Prevents stale production-hashed HTML from being served by Vite dev server.
  if (IS_DEV) {
    if (request.method === "POST" && url.pathname === "/api/sync/batch") {
      event.respondWith(handleSyncRequest(request));
    }
    return; // let browser handle everything else natively
  }

  if (request.method !== "GET") {
    if (request.method === "POST" && url.pathname === "/api/sync/batch") {
      event.respondWith(handleSyncRequest(request));
    }
    return;
  }

  // Hashed static assets (immutable): cache-first, no expiry.
  // Pattern matches Vite's content-hash filenames: /assets/name-[hash].js|css
  if (url.pathname.match(/assets\/.*-[a-f0-9]{8,}\.(js|css)$/)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // App shell (index.html / navigation requests): network-first.
  // Always fetch a fresh copy from the server; fall back to cache if offline.
  if (
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(shellNetworkFirst(request));
    return;
  }

  // API endpoints with caching
  if (url.pathname.startsWith("/api/")) {
    const shouldCache = API_CACHE_ENDPOINTS.some((ep) =>
      url.pathname.startsWith(ep),
    );
    event.respondWith(
      shouldCache ? networkFirstWithApiCache(request) : networkFirst(request),
    );
    return;
  }

  // Other static files (images, fonts, icons, etc.)
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|woff|woff2|ico)$/)) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// ── App shell — network-first ─────────────────────────────────────────────────
// Always fetch a fresh copy from the server; fall back to cache when offline.
async function shellNetworkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || caches.match("/offline.html");
  }
}

// ── Cache-first ───────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && !/no-store|private/i.test(response.headers.get("cache-control") || "")) {
      const cache = await caches.open(cacheName || STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 503 });
  }
}

// ── Network-first ─────────────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return (
      cached ||
      new Response(JSON.stringify({ error: "Offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

// ── Network-first with TTL-aware API cache ────────────────────────────────────
async function networkFirstWithApiCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      const headers = new Headers(response.headers);
      headers.set("sw-cached-at", Date.now().toString());
      const body = await response.clone().blob();
      cache.put(
        request.url,
        new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        }),
      );
    }
    return response;
  } catch {
    const cached = await caches.match(request.url);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get("sw-cached-at") || "0");
      const ttl = getCacheTTL(request.url);
      if (Date.now() - cachedAt < ttl) return cached;
    }
    return new Response(JSON.stringify({ error: "Offline", cached: false }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ── Stale-while-revalidate ───────────────────────────────────────────────────
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        caches
          .open(DYNAMIC_CACHE)
          .then((c) => c.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => null);
  return cached || fetchPromise || caches.match("/offline.html");
}

// ── Background sync ───────────────────────────────────────────────────────────
async function handleSyncRequest(request) {
  try {
    return await fetch(request);
  } catch {
    if ("sync" in self.registration) {
      const data = await request
        .clone()
        .json()
        .catch(() => ({}));
      await storeForBackgroundSync(data);
      await self.registration.sync.register("offline-sync");
      return new Response(JSON.stringify({ queued: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function storeForBackgroundSync(data) {
  const cache = await caches.open("background-sync-queue");
  const timestamp = Date.now();
  await cache.put(
    new Request("sync-" + timestamp),
    new Response(JSON.stringify({ data, timestamp })),
  );
}

async function getBackgroundSyncQueue() {
  const cache = await caches.open("background-sync-queue");
  const keys = await cache.keys();
  const items = [];
  for (const key of keys) {
    const res = await cache.match(key);
    if (res) items.push({ key: key.url, ...(await res.json()) });
  }
  return items.sort((a, b) => a.timestamp - b.timestamp);
}

async function clearBackgroundSyncItem(key) {
  const cache = await caches.open("background-sync-queue");
  await cache.delete(new Request(key));
}

self.addEventListener("sync", (event) => {
  // Legacy ownerless entries are quarantined, never replayed with current cookies.
  if (event.tag === "account-sync-v1") event.waitUntil(replayVersionedHandoffs());
});

async function handleVersionedSync(request) {
  if (!self.navigator.locks) return fetch(request);
  return self.navigator.locks.request("max-booster-account-session-v1", { mode: "shared" },
    () => handleVersionedSyncWithLease(request));
}

async function handleVersionedSyncWithLease(request) {
  const body = await request.clone().json();
  try {
    return await fetch(request);
  } catch (error) {
    if (!self.navigator.locks || !("sync" in self.registration) ||
        body.protocolVersion !== 1 || typeof body.ownerId !== "string" ||
        !Array.isArray(body.actions) || !body.actions.length ||
        body.actions.some(action => typeof action.id !== "string")) throw error;
    const active = await (await caches.open(ACCOUNT_STATE_CACHE)).match("/active");
    if (!active || (await active.json()).ownerId !== body.ownerId) throw error;
    {
      const handoffId = crypto.randomUUID();
      const key = new Request(self.location.origin + "/__sync_handoff/" +
        encodeURIComponent(body.ownerId) + "/" + handoffId);
      await (await caches.open(HANDOFF_CACHE)).put(key, new Response(JSON.stringify({
        protocolVersion: 1, ownerId: body.ownerId, handoffId, actions: body.actions, createdAt: Date.now(),
      })));
      await self.registration.sync.register("account-sync-v1");
      return new Response(JSON.stringify({
        protocolVersion: 1, state: "handed-off", ownerId: body.ownerId, handoffId,
        actionIds: body.actions.map(action => action.id),
      }), { status: 202, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
  }
}

async function replayVersionedHandoffs() {
  if (!self.navigator.locks) throw new Error("Account-safe background replay requires Web Locks");
  await self.navigator.locks.request("max-booster-sync-replay-v1", async () => {
    const cache = await caches.open(HANDOFF_CACHE);
    for (const key of await cache.keys()) {
      const stored = await cache.match(key);
      if (!stored) continue;
      const item = await stored.json();
      await self.navigator.locks.request("max-booster-account-session-v1", { mode: "shared" }, async () => {
        const csrfResponse = await fetch("/api/csrf-token", { credentials: "include", cache: "no-store" });
        if (!csrfResponse.ok) throw new Error("Background sync CSRF token unavailable");
        const csrf = await csrfResponse.json();
        if (!csrf.csrfToken) throw new Error("Background sync CSRF token missing");
        const response = await fetch("/api/sync/batch", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf.csrfToken },
          body: JSON.stringify({ protocolVersion: 1, ownerId: item.ownerId, actions: item.actions }),
        });
        if (!response.ok || response.status === 202) throw new Error("Background sync awaits authoritative receipts");
        const data = await response.json();
        if (data.protocolVersion !== 1 || data.ownerId !== item.ownerId ||
            !Array.isArray(data.results) || data.results.length !== item.actions.length ||
            item.actions.some(action => data.results.filter(result =>
              result.actionId === action.id && result.ownerId === item.ownerId &&
              result.protocolVersion === 1 && result.receipt === true &&
              ["applied", "rejected", "conflict"].includes(result.outcome) &&
              typeof result.success === "boolean" && (result.outcome === "applied") === result.success).length !== 1)) {
          throw new Error("Invalid background sync receipts");
        }
        // Rejected/conflicted receipts remain durably queryable on the server;
        // deleting transport data is not an assertion that mutations applied.
        await cache.delete(key);
        const windows = await self.clients.matchAll({ type: "window" });
        windows.forEach(client => client.postMessage({
          type: "SYNC_RECEIPTS_AVAILABLE", ownerId: item.ownerId, handoffId: item.handoffId,
        }));
      });
    }
  });
}

async function processBackgroundSync() {
  const queue = await getBackgroundSyncQueue();
  for (const item of queue) {
    try {
      const response = await fetch("/api/sync/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.data),
        credentials: "include",
      });
      if (response.ok) await clearBackgroundSyncItem(item.key);
    } catch {}
  }
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({
      type: "BACKGROUND_SYNC_COMPLETE",
      timestamp: Date.now(),
    });
  }
}

// ── Push notifications ────────────────────────────────────────────────────────

// Resolve a push-supplied URL against our origin and reject anything that
// lands cross-origin (absolute external URLs, protocol-relative, javascript:).
function sanitizeNotificationUrl(url) {
  if (typeof url !== "string" || !url) return "/";
  try {
    const resolved = new URL(url, self.location.origin);
    if (resolved.origin !== self.location.origin) return "/";
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return "/";
  }
}

function getCategoryActions(category, actions) {
  if (actions && actions.length) return actions;
  switch (category) {
    case "account_security":
      return [
        { action: "open", title: "Review Now" },
        { action: "dismiss", title: "Dismiss" },
      ];
    case "direct_interaction":
      return [
        { action: "open", title: "View" },
        { action: "reply", title: "Reply" },
      ];
    case "royalties":
      return [
        { action: "open", title: "View Earnings" },
        { action: "dismiss", title: "Later" },
      ];
    case "distribution":
      return [
        { action: "open", title: "View Release" },
        { action: "dismiss", title: "Got It" },
      ];
    case "collaboration":
      return [
        { action: "open", title: "Open Project" },
        { action: "dismiss", title: "Later" },
      ];
    case "marketplace":
      return [
        { action: "open", title: "View Sale" },
        { action: "dismiss", title: "Got It" },
      ];
    case "engagement_summary":
      return [
        { action: "open", title: "See Stats" },
        { action: "dismiss", title: "Got It" },
      ];
    case "platform_generated":
      return [
        { action: "open", title: "Explore" },
        { action: "dismiss", title: "Not Now" },
      ];
    case "content_based":
      return [
        { action: "open", title: "View Content" },
        { action: "dismiss", title: "Later" },
      ];
    case "achievements":
      return [
        { action: "open", title: "View Badge" },
        { action: "dismiss", title: "Got It" },
      ];
    default:
      return [
        { action: "open", title: "Open Max Booster" },
        { action: "dismiss", title: "Dismiss" },
      ];
  }
}

function getVibrate(category, requireInteraction) {
  if (category === "account_security") return [200, 100, 200, 100, 200];
  if (requireInteraction) return [100, 50, 100, 50, 100];
  return [100, 50, 100];
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  // Silent push — background sync, no notification shown
  if (data.silent === true || data.silent === "true") {
    const reason = data.reason || "feed_refresh";
    event.waitUntil(
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((windowClients) => {
          windowClients.forEach((client) => {
            client.postMessage({
              type: "SILENT_PUSH",
              reason,
              timestamp: Date.now(),
            });
          });
        }),
    );
    return;
  }

  // Payload validation — only same-origin URLs may be opened from a
  // notification click; a compromised push channel must not become an
  // open-redirect into an attacker-controlled site.
  const safeUrl = sanitizeNotificationUrl(
    data.url || (data.data && data.data.url),
  );

  const category = typeof data.category === "string" ? data.category : "system";
  const actions = getCategoryActions(category, data.actions);
  const vibrate = data.vibrate || getVibrate(category, data.requireInteraction);

  const notifOptions = {
    body: data.body || "New notification from Max Booster",
    icon: data.icon || "/icons/icon-192x192.png",
    badge: data.badge || "/icons/icon-72x72.png",
    vibrate,
    tag: data.tag || `maxbooster-${category}`,
    renotify: data.renotify ?? false,
    requireInteraction:
      data.requireInteraction ?? category === "account_security",
    silent: false,
    timestamp: data.timestamp || Date.now(),
    actions,
    data: {
      url: safeUrl,
      category,
      tag: data.tag,
      dateOfArrival: Date.now(),
      ...(data.data || {}),
    },
  };

  // image only supported in Chromium
  if (data.image) notifOptions.image = data.image;

  event.waitUntil(
    self.registration.showNotification(
      data.title || "Max Booster",
      notifOptions,
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const action = event.action;

  if (action === "dismiss") return;

  const url = sanitizeNotificationUrl(notifData.url);

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(url, self.location.origin);
          if (clientUrl.origin === targetUrl.origin && "focus" in client) {
            client.postMessage({
              type: "NOTIFICATION_CLICKED",
              action,
              url,
              data: notifData,
            });
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});

self.addEventListener("notificationclose", (event) => {
  const notifData = event.notification.data || {};
  clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clientList) => {
      clientList.forEach((client) => {
        client.postMessage({
          type: "NOTIFICATION_CLOSED",
          tag: event.notification.tag,
          data: notifData,
        });
      });
    });
});

// ── Push subscription auto-renewal ────────────────────────────────────────────
// Fired by the browser when an existing push subscription expires or is
// invalidated (e.g. after a browser update or VAPID key rotation).
// We fetch a fresh VAPID public key from the server and re-subscribe, then
// save the new subscription endpoint so push delivery continues uninterrupted.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // 1. Fetch the current VAPID public key from the server
        const keyRes = await fetch("/api/notifications/push-key", {
          credentials: "include",
        });
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json();
        if (!publicKey) return;

        // 2. Convert URL-safe base64 VAPID key to Uint8Array
        const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding)
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        const applicationServerKey = Uint8Array.from(atob(base64), (c) =>
          c.charCodeAt(0),
        );

        // 3. Re-subscribe using the new key
        const registration = await self.registration;
        const newSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        // 4. Send the new subscription to the server
        const subJson = newSubscription.toJSON();
        await fetch("/api/notifications/push-subscriptions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: {
              p256dh: subJson.keys?.p256dh,
              auth: subJson.keys?.auth,
            },
          }),
        });

        // 5. Notify open windows so they can update UI state
        const windowClients = await clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        windowClients.forEach((client) =>
          client.postMessage({
            type: "PUSH_SUBSCRIPTION_RENEWED",
            endpoint: subJson.endpoint,
          }),
        );
      } catch (err) {
        console.warn("[SW] pushsubscriptionchange re-subscribe failed:", err);
      }
    })(),
  );
});

// ── Message handlers ──────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "VERIFY_ACTIVE_ACCOUNT" && self.navigator.locks) {
    event.waitUntil(self.navigator.locks.request("max-booster-account-session-v1", { mode: "shared" }, async () => {
      const response = await fetch("/api/auth/me?account-check=" + crypto.randomUUID(), { credentials: "include", cache: "no-store" });
      if (!response.ok) return;
      const user = await response.json();
      if (String(user.id) !== event.data.ownerId) return;
      await (await caches.open(ACCOUNT_STATE_CACHE)).put("/active", new Response(JSON.stringify({ ownerId: String(user.id) })));
    }));
    return;
  }
  if (event.data.type === "APP_UPDATE_ACK") {
    if (updateRequest?.token === event.data.token && updateRequest.clients.has(event.source?.id)) {
      updateRequest.acks.set(event.source.id, { ready: event.data.ready === true, build: event.data.build });
    }
    return;
  }
  if (event.data.type === "REQUEST_APP_UPDATE") {
    event.waitUntil(coordinateAppUpdate(event));
    return;
  }

  switch (event.data.type) {
    // Sent by the app after first hydration (see index.html startup script).
    // Caches the hashed vendor/index JS + CSS chunks so the next visit is
    // served entirely from disk — near-instant on mobile.
    case "PRECACHE_APP_CHUNKS": {
      const chunks = (event.data.chunks || []).filter(value => {
        const url = new URL(value, self.location.origin);
        return url.origin === self.location.origin && /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(url.pathname);
      });
      if (chunks.length === 0) break;
      caches
        .open(STATIC_CACHE)
        .then((cache) => {
          return Promise.all(
            chunks.map((url) =>
              caches.match(url).then((hit) => {
                if (!hit) {
                  return fetch(url, { cache: "force-cache" })
                    .then((res) => {
                      if (res.ok) cache.put(url, res);
                    })
                    .catch(() => {});
                }
              }),
            ),
          );
        })
        .then(() => {
          console.log(
            "[SW] Precached " + chunks.length + " critical app chunks",
          );
          event.source?.postMessage({
            type: "CHUNKS_PRECACHED",
            count: chunks.length,
          });
        });
      break;
    }

    case "SKIP_WAITING":
      // Natural activation waits until the old controlled tabs close.
      break;

    case "CLEAR_API_CACHE":
      caches.delete(API_CACHE).then(() => {
        event.source?.postMessage({ type: "API_CACHE_CLEARED" });
      });
      break;

    case "GET_CACHE_STATS":
      getCacheStats().then((stats) => {
        event.source?.postMessage({ type: "CACHE_STATS", stats });
      });
      break;

    case "PREFETCH_CRITICAL":
      event.source?.postMessage({ type: "CACHE_ERROR", error: "Private caching requires an authenticated account repository" });
      break;

    case "CACHE_ENDPOINTS":
      event.source?.postMessage({ type: "CACHE_ERROR", error: "Private caching requires an authenticated account repository" });
      break;

    case "CLEANUP_CACHE":
      cleanupExpiredCache().then(() => {
        event.source?.postMessage({ type: "CACHE_CLEANED" });
      });
      break;

    case "GET_OFFLINE_STATUS":
      Promise.all([getCacheStats(), getBackgroundSyncQueue()]).then(
        ([stats, queue]) => {
          event.source?.postMessage({
            type: "OFFLINE_STATUS",
            stats,
            pendingSync: queue.length,
            cacheReady: stats.api > 0 || stats.static > 0,
          });
        },
      );
      break;
  }
});

async function coordinateAppUpdate(event) {
  const reply = value => event.ports?.[0]?.postMessage(value);
  if (updateRequest) return reply({ accepted: false, error: "Another tab is already reviewing this update." });
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const token = crypto.randomUUID();
  updateRequest = { token, clients: new Set(windows.map(client => client.id)), acks: new Map() };
  let activating = false;
  try {
    windows.forEach(client => client.postMessage({ type: "PREPARE_APP_UPDATE", token, generation: CACHE_VER }));
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && updateRequest.acks.size < windows.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const current = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (current.some(client => !updateRequest.clients.has(client.id)) ||
        current.some(client => !updateRequest.acks.get(client.id)?.ready)) {
      return reply({ accepted: false, error: "Every open tab must save its work and approve. Close hidden tabs after saving, then retry." });
    }
    await (await caches.open(UPDATE_CONTROL_CACHE)).put("/approved-app-update",
      new Response(JSON.stringify({ token, expiresAt: Date.now() + 30000 })));
    reply({ accepted: true });
    await self.skipWaiting();
    activating = true;
  } catch (error) {
    reply({ accepted: false, error: "Update could not be prepared. Keep this version open and retry." });
  } finally {
    if (!activating) windows.forEach(client => client.postMessage({ type: "APP_UPDATE_CANCELLED", token }));
    updateRequest = null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCacheTTL(url) {
  const p = new URL(url).pathname;
  if (p.includes("/analytics")) return CACHE_TTL.analytics;
  if (p.includes("/dashboard")) return CACHE_TTL.dashboard;
  if (p.includes("/studio")) return CACHE_TTL.studio;
  if (p.includes("/settings")) return CACHE_TTL.settings;
  if (p.includes("/posts")) return CACHE_TTL.posts;
  if (p.includes("/projects")) return CACHE_TTL.projects;
  return CACHE_TTL.api;
}

async function getCacheStats() {
  const stats = {
    static: 0,
    dynamic: 0,
    api: 0,
    shell: 0,
    syncQueue: 0,
    drafts: 0,
    media: 0,
  };
  try {
    stats.static = (await (await caches.open(STATIC_CACHE)).keys()).length;
    stats.dynamic = (await (await caches.open(DYNAMIC_CACHE)).keys()).length;
    stats.api = (await (await caches.open(API_CACHE)).keys()).length;
    stats.shell = (await (await caches.open(SHELL_CACHE)).keys()).length;
    stats.syncQueue = (await getBackgroundSyncQueue()).length;
    try {
      stats.drafts = (
        await (await caches.open(OFFLINE_DRAFT_CACHE)).keys()
      ).length;
    } catch {}
    try {
      stats.media = (
        await (await caches.open(OFFLINE_MEDIA_CACHE)).keys()
      ).length;
    } catch {}
  } catch {}
  return stats;
}

async function cacheEndpoints(endpoints) {
  const cache = await caches.open(API_CACHE);
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { credentials: "include" });
      if (response.ok) {
        const headers = new Headers(response.headers);
        headers.set("sw-cached-at", Date.now().toString());
        const body = await response.blob();
        cache.put(
          endpoint,
          new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          }),
        );
      }
    } catch {}
  }
}

async function prefetchCriticalData() {
  const criticalEndpoints = [
    "/api/user/preferences",
    "/api/settings",
    "/api/dashboard/summary",
  ];
  for (const endpoint of criticalEndpoints) {
    try {
      const response = await fetch(endpoint, { credentials: "include" });
      if (response.ok) {
        const cache = await caches.open(API_CACHE);
        const headers = new Headers(response.headers);
        headers.set("sw-cached-at", Date.now().toString());
        const body = await response.blob();
        cache.put(
          endpoint,
          new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          }),
        );
      }
    } catch {}
  }
}

async function cleanupExpiredCache() {
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  const now = Date.now();
  let cleaned = 0;
  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const cachedAt = parseInt(response.headers.get("sw-cached-at") || "0");
      if (now - cachedAt > getCacheTTL(request.url)) {
        await cache.delete(request);
        cleaned++;
      }
    }
  }
  if (cleaned > 0) console.log("[SW] Cleaned", cleaned, "expired entries");
}

// Periodic cache cleanup — every 5 minutes
setInterval(cleanupExpiredCache, 5 * 60 * 1000);
