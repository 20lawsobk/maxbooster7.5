const CACHE_NAME = 'max-booster-v2';
const STATIC_CACHE = 'max-booster-static-v2';
const DYNAMIC_CACHE = 'max-booster-dynamic-v2';
const API_CACHE = 'max-booster-api-v2';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/favicon.png'
];

const API_CACHE_ENDPOINTS = [
  '/api/analytics',
  '/api/dashboard',
  '/api/user/preferences',
  '/api/projects'
];

const CACHE_TTL = {
  api: 5 * 60 * 1000,
  analytics: 15 * 60 * 1000,
  dashboard: 5 * 60 * 1000,
  static: 7 * 24 * 60 * 60 * 1000
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('max-booster-') && 
                     name !== STATIC_CACHE && 
                     name !== DYNAMIC_CACHE &&
                     name !== API_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    if (request.method === 'POST' && url.pathname === '/api/sync/batch') {
      event.respondWith(handleSyncRequest(request));
      return;
    }
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const shouldCache = API_CACHE_ENDPOINTS.some(endpoint => 
      url.pathname.startsWith(endpoint)
    );
    
    if (shouldCache) {
      event.respondWith(networkFirstWithApiCache(request));
    } else {
      event.respondWith(networkFirst(request));
    }
    return;
  }

  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff|woff2)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function networkFirstWithApiCache(request) {
  const cacheKey = request.url;
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      const responseToCache = networkResponse.clone();
      
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-at', Date.now().toString());
      
      const body = await responseToCache.blob();
      const cachedResponse = new Response(body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      
      cache.put(cacheKey, cachedResponse);
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(cacheKey);
    if (cachedResponse) {
      const cachedAt = parseInt(cachedResponse.headers.get('sw-cached-at') || '0');
      const url = new URL(request.url);
      
      let ttl = CACHE_TTL.api;
      if (url.pathname.includes('/analytics')) {
        ttl = CACHE_TTL.analytics;
      } else if (url.pathname.includes('/dashboard')) {
        ttl = CACHE_TTL.dashboard;
      }
      
      if (Date.now() - cachedAt < ttl) {
        console.log('[SW] Serving cached API response:', request.url);
        return cachedResponse;
      }
    }
    
    return new Response(JSON.stringify({ 
      error: 'Offline',
      cached: false,
      message: 'This data is not available offline'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        const cache = caches.open(DYNAMIC_CACHE);
        cache.then((c) => c.put(request, networkResponse.clone()));
      }
      return networkResponse;
    })
    .catch(() => null);

  return cachedResponse || fetchPromise || caches.match('/offline.html');
}

async function handleSyncRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    if ('sync' in self.registration) {
      const data = await request.clone().json();
      await storeForBackgroundSync(data);
      
      await self.registration.sync.register('offline-sync');
      
      return new Response(JSON.stringify({
        queued: true,
        message: 'Request queued for background sync'
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      error: 'Offline',
      message: 'Cannot sync while offline'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function storeForBackgroundSync(data) {
  const cache = await caches.open('background-sync-queue');
  const timestamp = Date.now();
  const key = `sync-${timestamp}`;
  
  await cache.put(
    new Request(key),
    new Response(JSON.stringify({ data, timestamp }))
  );
}

async function getBackgroundSyncQueue() {
  const cache = await caches.open('background-sync-queue');
  const keys = await cache.keys();
  const items = [];
  
  for (const key of keys) {
    const response = await cache.match(key);
    if (response) {
      const item = await response.json();
      items.push({ key: key.url, ...item });
    }
  }
  
  return items.sort((a, b) => a.timestamp - b.timestamp);
}

async function clearBackgroundSyncItem(key) {
  const cache = await caches.open('background-sync-queue');
  await cache.delete(new Request(key));
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-sync') {
    event.waitUntil(processBackgroundSync());
  }
});

async function processBackgroundSync() {
  console.log('[SW] Processing background sync');
  
  const queue = await getBackgroundSyncQueue();
  
  for (const item of queue) {
    try {
      const response = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.data),
        credentials: 'include'
      });
      
      if (response.ok) {
        await clearBackgroundSyncItem(item.key);
        console.log('[SW] Background sync item completed:', item.key);
      }
    } catch (error) {
      console.error('[SW] Background sync failed for item:', item.key, error);
    }
  }
  
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({
      type: 'BACKGROUND_SYNC_COMPLETE',
      timestamp: Date.now()
    });
  }
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'New notification from Max Booster',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now()
    },
    actions: data.actions || [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Max Booster', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE).then(() => {
      console.log('[SW] API cache cleared');
      event.source?.postMessage({ type: 'API_CACHE_CLEARED' });
    });
  }
  
  if (event.data && event.data.type === 'GET_CACHE_STATS') {
    getCacheStats().then(stats => {
      event.source?.postMessage({ type: 'CACHE_STATS', stats });
    });
  }
});

async function getCacheStats() {
  const stats = {
    static: 0,
    dynamic: 0,
    api: 0,
    syncQueue: 0
  };
  
  try {
    const staticCache = await caches.open(STATIC_CACHE);
    stats.static = (await staticCache.keys()).length;
    
    const dynamicCache = await caches.open(DYNAMIC_CACHE);
    stats.dynamic = (await dynamicCache.keys()).length;
    
    const apiCache = await caches.open(API_CACHE);
    stats.api = (await apiCache.keys()).length;
    
    const syncQueue = await getBackgroundSyncQueue();
    stats.syncQueue = syncQueue.length;
  } catch (error) {
    console.error('[SW] Error getting cache stats:', error);
  }
  
  return stats;
}
