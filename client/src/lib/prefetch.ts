const prefetchedRoutes = new Set<string>();

export function prefetchRoute(importFn: () => Promise<any>) {
  const key = importFn.toString();
  if (prefetchedRoutes.has(key)) return;
  prefetchedRoutes.add(key);
  
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => importFn().catch(() => {}));
  } else {
    setTimeout(() => importFn().catch(() => {}), 200);
  }
}
