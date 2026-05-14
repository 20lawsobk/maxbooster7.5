/**
 * Max Booster Service Worker v9
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
 *  • Faster install — skipWaiting() fires unconditionally.
 */

const IS_DEV = self.location.hostname === 'localhost' ||
               self.location.hostname === '127.0.0.1' ||
               self.location.hostname.endsWith('.replit.dev') ||
               self.location.hostname.endsWith('.picard.replit.dev');

const CACHE_VER    = 'v9';
const STATIC_CACHE = 'max-booster-static-' + CACHE_VER;
const DYNAMIC_CACHE= 'max-booster-dynamic-' + CACHE_VER;
const API_CACHE    = 'max-booster-api-' + CACHE_VER;
const SHELL_CACHE  = 'max-booster-shell-' + CACHE_VER;

const STATIC_ASSETS = [
  '/manifest.json',
  '/offline.html',
  '/favicon.png'
];

const API_CACHE_ENDPOINTS = [
  '/api/analytics',
  '/api/dashboard',
  '/api/user/preferences',
  '/api/projects',
  '/api/studio',
  '/api/settings',
  '/api/posts',
  '/api/releases',
  '/api/distribution'
];

const CACHE_TTL = {
  api:       5  * 60 * 1000,
  analytics: 15 * 60 * 1000,
  dashboard:  5 * 60 * 1000,
  static:    7  * 24 * 60 * 60 * 1000,
  studio:    30 * 60 * 1000,
  settings:  60 * 60 * 1000,
  posts:     10 * 60 * 1000,
  projects:  20 * 60 * 1000
};

const OFFLINE_DRAFT_CACHE = 'max-booster-drafts-v1';
const OFFLINE_MEDIA_CACHE = 'max-booster-media-v1';

// ── Install ──────────────────────────────────────────────────────────────────
// Skip the waitUntil/addAll bottleneck: pre-cache in background, skipWaiting
// immediately so the new SW takes control without waiting for a page reload.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
// Delete ALL old max-booster-* caches to free space and evict stale assets.
self.addEventListener('activate', (event) => {
  const currentCaches = new Set([STATIC_CACHE, DYNAMIC_CACHE, API_CACHE, SHELL_CACHE]);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('max-booster-') && !currentCaches.has(name))
          .map((name) => {
            console.log('[SW] Evicting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // DEV MODE: transparent pass-through — no caching whatsoever.
  // Prevents stale production-hashed HTML from being served by Vite dev server.
  if (IS_DEV) {
    if (request.method === 'POST' && url.pathname === '/api/sync/batch') {
      event.respondWith(handleSyncRequest(request));
    }
    return; // let browser handle everything else natively
  }

  if (request.method !== 'GET') {
    if (request.method === 'POST' && url.pathname === '/api/sync/batch') {
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
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(shellNetworkFirst(request));
    return;
  }

  // API endpoints with caching
  if (url.pathname.startsWith('/api/')) {
    const shouldCache = API_CACHE_ENDPOINTS.some(ep => url.pathname.startsWith(ep));
    event.respondWith(shouldCache ? networkFirstWithApiCache(request) : networkFirst(request));
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
    return cached || caches.match('/offline.html');
  }
}

// ── Cache-first ───────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName || STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
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
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ── Network-first with TTL-aware API cache ────────────────────────────────────
async function networkFirstWithApiCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      const headers = new Headers(response.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const body = await response.clone().blob();
      cache.put(request.url, new Response(body, { status: response.status, statusText: response.statusText, headers }));
    }
    return response;
  } catch {
    const cached = await caches.match(request.url);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0');
      const ttl = getCacheTTL(request.url);
      if (Date.now() - cachedAt < ttl) return cached;
    }
    return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ── Stale-while-revalidate ───────────────────────────────────────────────────
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      caches.open(DYNAMIC_CACHE).then((c) => c.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);
  return cached || fetchPromise || caches.match('/offline.html');
}

// ── Background sync ───────────────────────────────────────────────────────────
async function handleSyncRequest(request) {
  try {
    return await fetch(request);
  } catch {
    if ('sync' in self.registration) {
      const data = await request.clone().json().catch(() => ({}));
      await storeForBackgroundSync(data);
      await self.registration.sync.register('offline-sync');
      return new Response(JSON.stringify({ queued: true }), {
        status: 202, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function storeForBackgroundSync(data) {
  const cache = await caches.open('background-sync-queue');
  const timestamp = Date.now();
  await cache.put(new Request('sync-' + timestamp), new Response(JSON.stringify({ data, timestamp })));
}

async function getBackgroundSyncQueue() {
  const cache = await caches.open('background-sync-queue');
  const keys = await cache.keys();
  const items = [];
  for (const key of keys) {
    const res = await cache.match(key);
    if (res) items.push({ key: key.url, ...(await res.json()) });
  }
  return items.sort((a, b) => a.timestamp - b.timestamp);
}

async function clearBackgroundSyncItem(key) {
  const cache = await caches.open('background-sync-queue');
  await cache.delete(new Request(key));
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-sync') event.waitUntil(processBackgroundSync());
});

async function processBackgroundSync() {
  const queue = await getBackgroundSyncQueue();
  for (const item of queue) {
    try {
      const response = await fetch('/api/sync/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.data), credentials: 'include'
      });
      if (response.ok) await clearBackgroundSyncItem(item.key);
    } catch {}
  }
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'BACKGROUND_SYNC_COMPLETE', timestamp: Date.now() });
  }
}

// ── Push notifications ────────────────────────────────────────────────────────

function getCategoryActions(category, actions) {
  if (actions && actions.length) return actions;
  switch (category) {
    case 'account_security':
      return [{ action: 'open', title: 'Review Now' }, { action: 'dismiss', title: 'Dismiss' }];
    case 'direct_interaction':
      return [{ action: 'open', title: 'View' }, { action: 'reply', title: 'Reply' }];
    case 'royalties':
      return [{ action: 'open', title: 'View Earnings' }, { action: 'dismiss', title: 'Later' }];
    case 'distribution':
      return [{ action: 'open', title: 'View Release' }, { action: 'dismiss', title: 'Got It' }];
    case 'collaboration':
      return [{ action: 'open', title: 'Open Project' }, { action: 'dismiss', title: 'Later' }];
    case 'marketplace':
      return [{ action: 'open', title: 'View Sale' }, { action: 'dismiss', title: 'Got It' }];
    case 'engagement_summary':
      return [{ action: 'open', title: 'See Stats' }, { action: 'dismiss', title: 'Got It' }];
    case 'platform_generated':
      return [{ action: 'open', title: 'Explore' }, { action: 'dismiss', title: 'Not Now' }];
    case 'content_based':
      return [{ action: 'open', title: 'View Content' }, { action: 'dismiss', title: 'Later' }];
    case 'achievements':
      return [{ action: 'open', title: 'View Badge' }, { action: 'dismiss', title: 'Got It' }];
    default:
      return [{ action: 'open', title: 'Open Max Booster' }, { action: 'dismiss', title: 'Dismiss' }];
  }
}

function getVibrate(category, requireInteraction) {
  if (category === 'account_security') return [200, 100, 200, 100, 200];
  if (requireInteraction) return [100, 50, 100, 50, 100];
  return [100, 50, 100];
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { return; }

  // Silent push — background sync, no notification shown
  if (data.silent === true || data.silent === 'true') {
    const reason = data.reason || 'feed_refresh';
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        windowClients.forEach((client) => {
          client.postMessage({ type: 'SILENT_PUSH', reason, timestamp: Date.now() });
        });
      })
    );
    return;
  }

  const category = data.category || 'system';
  const actions  = getCategoryActions(category, data.actions);
  const vibrate  = data.vibrate || getVibrate(category, data.requireInteraction);

  const notifOptions = {
    body:              data.body || 'New notification from Max Booster',
    icon:              data.icon  || '/icons/icon-192x192.png',
    badge:             data.badge || '/icons/icon-72x72.png',
    vibrate,
    tag:               data.tag  || `maxbooster-${category}`,
    renotify:          data.renotify ?? false,
    requireInteraction: data.requireInteraction ?? (category === 'account_security'),
    silent:            false,
    timestamp:         data.timestamp || Date.now(),
    actions,
    data: {
      url:          data.url   || (data.data && data.data.url) || '/',
      category,
      tag:          data.tag,
      dateOfArrival: Date.now(),
      ...(data.data || {}),
    },
  };

  // image only supported in Chromium
  if (data.image) notifOptions.image = data.image;

  event.waitUntil(
    self.registration.showNotification(data.title || 'Max Booster', notifOptions)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const action    = event.action;

  if (action === 'dismiss') return;

  const url = notifData.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const targetUrl = new URL(url, self.location.origin);
        if (clientUrl.origin === targetUrl.origin && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICKED', action, url, data: notifData });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  const notifData = event.notification.data || {};
  clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    clientList.forEach((client) => {
      client.postMessage({ type: 'NOTIFICATION_CLOSED', tag: event.notification.tag, data: notifData });
    });
  });
});

// ── Push subscription auto-renewal ────────────────────────────────────────────
// Fired by the browser when an existing push subscription expires or is
// invalidated (e.g. after a browser update or VAPID key rotation).
// We fetch a fresh VAPID public key from the server and re-subscribe, then
// save the new subscription endpoint so push delivery continues uninterrupted.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        // 1. Fetch the current VAPID public key from the server
        const keyRes = await fetch('/api/notifications/push-key', { credentials: 'include' });
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json();
        if (!publicKey) return;

        // 2. Convert URL-safe base64 VAPID key to Uint8Array
        const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        const applicationServerKey = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

        // 3. Re-subscribe using the new key
        const registration = await self.registration;
        const newSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        // 4. Send the new subscription to the server
        const subJson = newSubscription.toJSON();
        await fetch('/api/notifications/push-subscriptions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: {
              p256dh: subJson.keys?.p256dh,
              auth:   subJson.keys?.auth,
            },
          }),
        });

        // 5. Notify open windows so they can update UI state
        const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        windowClients.forEach(client =>
          client.postMessage({ type: 'PUSH_SUBSCRIPTION_RENEWED', endpoint: subJson.endpoint })
        );
      } catch (err) {
        console.warn('[SW] pushsubscriptionchange re-subscribe failed:', err);
      }
    })()
  );
});

// ── Message handlers ──────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;

  switch (event.data.type) {

    // Sent by the app after first hydration (see index.html startup script).
    // Caches the hashed vendor/index JS + CSS chunks so the next visit is
    // served entirely from disk — near-instant on mobile.
    case 'PRECACHE_APP_CHUNKS': {
      const chunks = event.data.chunks || [];
      if (chunks.length === 0) break;
      caches.open(STATIC_CACHE).then((cache) => {
        return Promise.all(chunks.map((url) =>
          caches.match(url).then((hit) => {
            if (!hit) {
              return fetch(url, { cache: 'force-cache' }).then((res) => {
                if (res.ok) cache.put(url, res);
              }).catch(() => {});
            }
          })
        ));
      }).then(() => {
        console.log('[SW] Precached ' + chunks.length + ' critical app chunks');
        event.source?.postMessage({ type: 'CHUNKS_PRECACHED', count: chunks.length });
      });
      break;
    }

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CLEAR_API_CACHE':
      caches.delete(API_CACHE).then(() => {
        event.source?.postMessage({ type: 'API_CACHE_CLEARED' });
      });
      break;

    case 'GET_CACHE_STATS':
      getCacheStats().then((stats) => {
        event.source?.postMessage({ type: 'CACHE_STATS', stats });
      });
      break;

    case 'PREFETCH_CRITICAL':
      prefetchCriticalData().then(() => {
        event.source?.postMessage({ type: 'PREFETCH_COMPLETE' });
      });
      break;

    case 'CACHE_ENDPOINTS':
      cacheEndpoints(event.data.endpoints || []).then(() => {
        event.source?.postMessage({ type: 'ENDPOINTS_CACHED', count: (event.data.endpoints || []).length });
      });
      break;

    case 'CLEANUP_CACHE':
      cleanupExpiredCache().then(() => {
        event.source?.postMessage({ type: 'CACHE_CLEANED' });
      });
      break;

    case 'GET_OFFLINE_STATUS':
      Promise.all([getCacheStats(), getBackgroundSyncQueue()]).then(([stats, queue]) => {
        event.source?.postMessage({
          type: 'OFFLINE_STATUS', stats,
          pendingSync: queue.length,
          cacheReady: stats.api > 0 || stats.static > 0
        });
      });
      break;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCacheTTL(url) {
  const p = new URL(url).pathname;
  if (p.includes('/analytics')) return CACHE_TTL.analytics;
  if (p.includes('/dashboard')) return CACHE_TTL.dashboard;
  if (p.includes('/studio'))    return CACHE_TTL.studio;
  if (p.includes('/settings'))  return CACHE_TTL.settings;
  if (p.includes('/posts'))     return CACHE_TTL.posts;
  if (p.includes('/projects'))  return CACHE_TTL.projects;
  return CACHE_TTL.api;
}

async function getCacheStats() {
  const stats = { static: 0, dynamic: 0, api: 0, shell: 0, syncQueue: 0, drafts: 0, media: 0 };
  try {
    stats.static  = (await (await caches.open(STATIC_CACHE)).keys()).length;
    stats.dynamic = (await (await caches.open(DYNAMIC_CACHE)).keys()).length;
    stats.api     = (await (await caches.open(API_CACHE)).keys()).length;
    stats.shell   = (await (await caches.open(SHELL_CACHE)).keys()).length;
    stats.syncQueue = (await getBackgroundSyncQueue()).length;
    try { stats.drafts = (await (await caches.open(OFFLINE_DRAFT_CACHE)).keys()).length; } catch {}
    try { stats.media  = (await (await caches.open(OFFLINE_MEDIA_CACHE)).keys()).length; } catch {}
  } catch {}
  return stats;
}

async function cacheEndpoints(endpoints) {
  const cache = await caches.open(API_CACHE);
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { credentials: 'include' });
      if (response.ok) {
        const headers = new Headers(response.headers);
        headers.set('sw-cached-at', Date.now().toString());
        const body = await response.blob();
        cache.put(endpoint, new Response(body, { status: response.status, statusText: response.statusText, headers }));
      }
    } catch {}
  }
}

async function prefetchCriticalData() {
  const criticalEndpoints = ['/api/user/preferences', '/api/settings', '/api/dashboard/summary'];
  for (const endpoint of criticalEndpoints) {
    try {
      const response = await fetch(endpoint, { credentials: 'include' });
      if (response.ok) {
        const cache = await caches.open(API_CACHE);
        const headers = new Headers(response.headers);
        headers.set('sw-cached-at', Date.now().toString());
        const body = await response.blob();
        cache.put(endpoint, new Response(body, { status: response.status, statusText: response.statusText, headers }));
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
      const cachedAt = parseInt(response.headers.get('sw-cached-at') || '0');
      if (now - cachedAt > getCacheTTL(request.url)) {
        await cache.delete(request);
        cleaned++;
      }
    }
  }
  if (cleaned > 0) console.log('[SW] Cleaned', cleaned, 'expired entries');
}

// Periodic cache cleanup — every 5 minutes
setInterval(cleanupExpiredCache, 5 * 60 * 1000);
