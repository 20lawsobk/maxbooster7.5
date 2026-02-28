/**
 * Client-side Route & Data Prefetcher
 *
 * Proactively loads JS chunks and API data for routes the user is likely to
 * navigate to next, improving perceived navigation speed.
 *
 * Strategies:
 *   prefetchRoute(importFn)      — Lazy-load a page JS chunk on idle
 *   prefetchRouteByPath(path)    — Load chunk + key API data for a path
 *   setupLinkPrefetching()       — Register pointer-over listener on links;
 *                                  prefetches after 65ms hover (cancels on out)
 *   prefetchAdjacentRoutes(path) — Background-prefetch likely next routes
 *                                  (called on route change, idle-queued)
 *
 * All prefetching is suppressed on 2G/slow-2g connections and when
 * navigator.connection.saveData is true.
 *
 * Authentication-gated API endpoints are skipped when the user is logged out
 * (call setAuthState(true) after successful login to enable them).
 */

const prefetchedRoutes = new Set<string>();
const prefetchedData = new Set<string>();

let _isAuthenticated = false;

export function setAuthState(isAuthenticated: boolean): void {
  _isAuthenticated = isAuthenticated;
}

function shouldPrefetch(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection;
  if (conn) {
    if (conn.saveData) return false;
    if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return false;
  }
  return true;
}

const routeImportMap: Record<string, () => Promise<any>> = {
  '/dashboard': () => import('@/pages/Dashboard'),
  '/projects': () => import('@/pages/Projects'),
  '/studio': () => import('@/pages/Studio'),
  '/marketplace': () => import('@/pages/Marketplace'),
  '/analytics': () => import('@/pages/Analytics'),
  '/social-media': () => import('@/pages/SocialMedia'),
  '/distribution': () => import('@/pages/Distribution'),
  '/royalties': () => import('@/pages/Royalties'),
  '/settings': () => import('@/pages/Settings'),
  '/pricing': () => import('@/pages/Pricing'),
  '/help': () => import('@/pages/Help'),
  '/contracts': () => import('@/pages/Contracts'),
  '/workspaces': () => import('@/pages/Workspaces'),
  '/collaborations': () => import('@/pages/Collaborations'),
  '/career-coach': () => import('@/pages/CareerCoach'),
  '/invoices': () => import('@/pages/Invoices'),
};

const publicEndpoints = new Set(['/api/auth/me']);

const routeDataMap: Record<string, string[]> = {
  '/dashboard': ['/api/auth/me', '/api/projects?limit=5'],
  '/projects': ['/api/projects'],
  '/studio': ['/api/studio/projects'],
  '/marketplace': ['/api/marketplace/beats?limit=12'],
  '/analytics': ['/api/analytics/dashboard'],
  '/settings': ['/api/auth/me'],
  '/royalties': ['/api/royalties/summary'],
};

export function prefetchRoute(importFn: () => Promise<any>) {
  const key = importFn.toString();
  if (prefetchedRoutes.has(key)) return;
  prefetchedRoutes.add(key);

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => importFn().catch(() => {}));
  } else {
    setTimeout(() => importFn().catch(() => {}), 200);
  }
}

export function prefetchRouteByPath(path: string) {
  if (!shouldPrefetch()) return;
  const normalizedPath = '/' + path.split('/').filter(Boolean)[0];

  const importFn = routeImportMap[normalizedPath];
  if (importFn) {
    prefetchRoute(importFn);
  }

  const endpoints = routeDataMap[normalizedPath];
  if (endpoints) {
    for (const endpoint of endpoints) {
      const requiresAuth = !publicEndpoints.has(endpoint.split('?')[0]);
      if (requiresAuth && !_isAuthenticated) continue;
      if (prefetchedData.has(endpoint)) continue;
      prefetchedData.add(endpoint);
      fetch(endpoint, { credentials: 'include' })
        .then(r => { if (r.status === 401) prefetchedData.delete(endpoint); })
        .catch(() => { prefetchedData.delete(endpoint); });
    }
  }
}

export function setupLinkPrefetching() {
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  const handlePointerOver = (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('a[href], [data-href]');
    if (!target) return;

    const href = target.getAttribute('href') || target.getAttribute('data-href');
    if (!href || href.startsWith('http') || href.startsWith('#')) return;

    hoverTimeout = setTimeout(() => {
      if (!shouldPrefetch()) return;
      prefetchRouteByPath(href);
    }, 65);
  };

  const handlePointerOut = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
  };

  document.addEventListener('pointerover', handlePointerOver, { passive: true });
  document.addEventListener('pointerout', handlePointerOut, { passive: true });

  return () => {
    document.removeEventListener('pointerover', handlePointerOver);
    document.removeEventListener('pointerout', handlePointerOut);
  };
}

export function prefetchAdjacentRoutes(currentPath: string) {
  const adjacencyMap: Record<string, string[]> = {
    '/': ['/dashboard', '/login', '/register', '/pricing'],
    '/login': ['/dashboard', '/register'],
    '/register': ['/login', '/dashboard'],
    '/dashboard': ['/projects', '/studio', '/analytics', '/social-media'],
    '/projects': ['/studio', '/dashboard'],
    '/studio': ['/projects', '/dashboard'],
    '/analytics': ['/dashboard', '/social-media'],
    '/social-media': ['/analytics', '/dashboard'],
    '/marketplace': ['/dashboard', '/studio'],
    '/settings': ['/dashboard'],
  };

  const normalizedPath = '/' + (currentPath.split('/').filter(Boolean)[0] || '');
  const adjacentRoutes = adjacencyMap[normalizedPath] || [];

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      if (!shouldPrefetch()) return;
      for (const route of adjacentRoutes) {
        prefetchRouteByPath(route);
      }
    }, { timeout: 3000 });
  } else {
    setTimeout(() => {
      if (!shouldPrefetch()) return;
      for (const route of adjacentRoutes) {
        prefetchRouteByPath(route);
      }
    }, 1500);
  }
}
