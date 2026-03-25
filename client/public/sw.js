/**
 * Max Booster Service Worker v5
 *
 * Key improvements over v4:
 *  • PRECACHE_APP_CHUNKS handler — after first load, the app sends the hashed
 *    JS/CSS chunk URLs; we store them in STATIC_CACHE so the next visit is
 *    served entirely from disk (near-instant on mobile).
 *  • App-shell stale-while-revalidate — index.html is served from cache
 *    immediately; a background fetch keeps it fresh.
 *  • Faster install — skipWaiting() fires unconditionally (no addAll bottleneck).
 *  • Bumped cache version → old v4 caches are evicted on first activate.
 */

const CACHE_VER    = 'v6';
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
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Max Booster', {
      body: data.body || 'New notification from Max Booster',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || '/', dateOfArrival: Date.now() },
      actions: data.actions || [{ action: 'open', title: 'Open' }, { action: 'dismiss', title: 'Dismiss' }]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
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
