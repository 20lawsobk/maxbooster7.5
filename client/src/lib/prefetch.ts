const prefetchedRoutes = new Set<string>();
const prefetchedData = new Set<string>();

function shouldPrefetch(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection;
  if (conn) {
    if (conn.saveData) return false;
    if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return false;
  }
  return true;
}

// Route import map for hover-based prefetching
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

// API endpoints to prefetch per route
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
  
  // Prefetch the route code
  const importFn = routeImportMap[normalizedPath];
  if (importFn) {
    prefetchRoute(importFn);
  }

  // Prefetch the route data
  const endpoints = routeDataMap[normalizedPath];
  if (endpoints) {
    for (const endpoint of endpoints) {
      if (prefetchedData.has(endpoint)) continue;
      prefetchedData.add(endpoint);
      fetch(endpoint, { credentials: 'include' }).catch(() => {});
    }
  }
}

// Prefetch on link hover - attach to any anchor or navigation element
export function setupLinkPrefetching() {
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  
  const handlePointerOver = (e: Event) => {
    const target = (e.target as HTMLElement)?.closest('a[href], [data-href]');
    if (!target) return;
    
    const href = target.getAttribute('href') || target.getAttribute('data-href');
    if (!href || href.startsWith('http') || href.startsWith('#')) return;
    
    // Small delay to avoid prefetching on quick mouse passes
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

// Prefetch likely next routes based on current location
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
  
  // Use requestIdleCallback so this never blocks the main thread
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
