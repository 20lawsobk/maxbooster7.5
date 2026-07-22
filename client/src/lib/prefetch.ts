/**
 * Client-side Route & Data Prefetcher
 *
 * Proactively loads JS chunks and API data for routes the user is likely to
 * navigate to next, improving perceived navigation speed.
 *
 * Strategies:
 *   bootstrapUserData(qc)        — Call /api/bootstrap once after auth and
 *                                  pre-populate the query cache so the Dashboard
 *                                  renders instantly without individual API calls.
 *   prefetchAllAuthChunks()      — Eagerly download JS chunks for every auth
 *                                  route on idle so navigation is instant.
 *   prefetchRoute(importFn)      — Lazy-load a page JS chunk on idle
 *   prefetchRouteByPath(path)    — Load chunk + key API data for a path
 *   setupLinkPrefetching()       — Register pointer-over listener on links;
 *                                  prefetches after 65ms hover (cancels on out)
 *   prefetchAdjacentRoutes(path) — Background-prefetch likely next routes
 *                                  (called on route change, idle-queued)
 *
 * All prefetching is suppressed on 2G/slow-2g connections and when
 * navigator?.connection.saveData is true.
 *
 * Authentication-gated API endpoints are skipped when the user is logged out
 * (call setAuthState(true) after successful login to enable them).
 */

import type { QueryClient } from "@tanstack/react-query";

const prefetchedRoutes = new Set<string>();
const prefetchedData = new Set<string>();
let _bootstrapped = false;

let isAuthenticated = false;

export function setAuthState(isAuthenticated: boolean): void {
  isAuthenticated = isAuthenticated;
}

function shouldPrefetch(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Record<string, unknown>).connection;
  if (conn) {
    if (conn?.saveData) return false;
    if (conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g")
      return false;
  }
  return true;
}

const routeImportMap: Record<string, () => Promise<unknown>> = {
  "/dashboard": () => import("@/pages/Dashboard"),
  "/projects": () => import("@/pages/Projects"),
  "/studio": () => import("@/pages/Studio"),
  "/marketplace": () => import("@/pages/Marketplace"),
  "/analytics": () => import("@/pages/Analytics"),
  "/social-media": () => import("@/pages/SocialMedia"),
  "/distribution": () => import("@/pages/Distribution"),
  "/royalties": () => import("@/pages/Royalties"),
  "/settings": () => import("@/pages/Settings"),
  "/pricing": () => import("@/pages/Pricing"),
  "/help": () => import("@/pages/Help"),
  "/contracts": () => import("@/pages/Contracts"),
  "/workspaces": () => import("@/pages/Workspaces"),
  "/collaborations": () => import("@/pages/Collaborations"),
  "/career-coach": () => import("@/pages/CareerCoach"),
  "/invoices": () => import("@/pages/Invoices"),
};

const publicEndpoints = new Set(["/api/auth/me"]);

const routeDataMap: Record<string, string[]> = {
  "/dashboard": ["/api/auth/me", "/api/projects?limit=5"],
  "/projects": ["/api/projects"],
  "/studio": ["/api/studio/projects"],
  "/marketplace": ["/api/marketplace/beats?limit=12"],
  "/analytics": ["/api/analytics/dashboard"],
  "/settings": ["/api/auth/me"],
  "/royalties": ["/api/royalties/summary"],
};

export function prefetchRoute(importFn: () => Promise<unknown>) {
  const key = importFn?.toString();
  if (prefetchedRoutes?.has(key)) return;
  prefetchedRoutes?.add(key);

  if ("requestIdleCallback" in window) {
    (window as Record<string, unknown>).requestIdleCallback(() =>
      importFn().catch(() => {}),
    );
  } else {
    setTimeout(() => importFn().catch(() => {}), 200);
  }
}

export function prefetchRouteByPath(path: string) {
  if (!shouldPrefetch()) return;
  const normalizedPath = "/" + path?.split("/").filter(Boolean)[0];

  const importFn = routeImportMap[normalizedPath];
  if (importFn) {
    prefetchRoute(importFn);
  }

  const endpoints = routeDataMap[normalizedPath];
  if (endpoints) {
    for (const endpoint of endpoints) {
      const requiresAuth = !publicEndpoints?.has(endpoint?.split("?")[0]);
      if (requiresAuth && !isAuthenticated) continue;
      if (prefetchedData?.has(endpoint)) continue;
      prefetchedData?.add(endpoint);
      fetch(endpoint, { credentials: "include" })
        .then((r) => {
          if (r?.status === 401) prefetchedData?.delete(endpoint);
        })
        .catch(() => {
          prefetchedData?.delete(endpoint);
        });
    }
  }
}

export function setupLinkPrefetching() {
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  const handlePointerOver = (e: Event) => {
    const target = (e?.target as HTMLElement)?.closest("a[href], [data-href]");
    if (!target) return;

    const href =
      target?.getAttribute("href") || target?.getAttribute("data-href");
    if (!href || href?.startsWith("http") || href?.startsWith("#")) return;

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

  document?.addEventListener("pointerover", handlePointerOver, {
    passive: true,
  });
  document?.addEventListener("pointerout", handlePointerOut, { passive: true });

  return () => {
    document?.removeEventListener("pointerover", handlePointerOver);
    document?.removeEventListener("pointerout", handlePointerOut);
  };
}

export function prefetchAdjacentRoutes(currentPath: string) {
  const adjacencyMap: Record<string, string[]> = {
    "/": ["/dashboard", "/login", "/register", "/pricing"],
    "/login": ["/dashboard", "/register"],
    "/register": ["/login", "/dashboard"],
    "/dashboard": ["/projects", "/studio", "/analytics", "/social-media"],
    "/projects": ["/studio", "/dashboard"],
    "/studio": ["/projects", "/dashboard"],
    "/analytics": ["/dashboard", "/social-media"],
    "/social-media": ["/analytics", "/dashboard"],
    "/marketplace": ["/dashboard", "/studio"],
    "/settings": ["/dashboard"],
  };

  const normalizedPath =
    "/" + (currentPath?.split("/").filter(Boolean)[0] || "");
  const adjacentRoutes = adjacencyMap[normalizedPath] || [];

  if ("requestIdleCallback" in window) {
    (window as Record<string, unknown>).requestIdleCallback(
      () => {
        if (!shouldPrefetch()) return;
        for (const route of adjacentRoutes) {
          prefetchRouteByPath(route);
        }
      },
      { timeout: 3000 },
    );
  } else {
    setTimeout(() => {
      if (!shouldPrefetch()) return;
      for (const route of adjacentRoutes) {
        prefetchRouteByPath(route);
      }
    }, 1500);
  }
}

/**
 * Call /api/bootstrap once per session after the user authenticates and
 * seed the query cache with their personal data.  Every page that calls
 * useQuery for one of these keys will find fresh data already waiting —
 * no loading state, no spinner.
 */
export async function bootstrapUserData(qc: QueryClient): Promise<void> {
  if (_bootstrapped) return;
  _bootstrapped = true;

  try {
    const res = await fetch("/api/bootstrap", { credentials: "include" });
    if (!res?.ok) return;

    const data: {
      user?: unknown;
      projects?: unknown[];
      notifications?: unknown[];
      releases?: unknown[];
      _ts?: number;
    } = await res?.json();

    const now = Date?.now();
    const fresh = { updatedAt: now };

    if (data?.user) {
      qc?.setQueryData(["/api/auth/me"], data?.user, fresh);
    }
    if (Array.isArray(data?.projects)) {
      qc?.setQueryData(["/api/projects"], data?.projects, fresh);
      qc?.setQueryData(
        ["/api/projects", { limit: "5" }],
        data?.projects.slice(0, 5),
        fresh,
      );
      qc?.setQueryData(
        ["/api/projects", { limit: "10" }],
        data?.projects.slice(0, 10),
        fresh,
      );
      qc?.setQueryData(
        ["/api/projects", { limit: "12" }],
        data?.projects.slice(0, 12),
        fresh,
      );
    }
    if (Array.isArray(data?.notifications)) {
      qc?.setQueryData(["/api/notifications"], data?.notifications, fresh);
      qc?.setQueryData(["/api/notifications/unread"], data?.notifications, fresh);
    }
    if (Array.isArray(data?.releases)) {
      qc?.setQueryData(["/api/releases"], data?.releases, fresh);
    }
  } catch {
    // Silent — bootstrap is a best-effort optimisation; individual queries
    // will still fire normally if this call fails.
  }
}

const ALL_AUTH_CHUNKS: Array<() => Promise<unknown>> = [
  () => import("@/pages/Dashboard"),
  () => import("@/pages/SocialMedia"),
  () => import("@/pages/Analytics"),
  () => import("@/pages/Projects"),
  () => import("@/pages/Distribution"),
  () => import("@/pages/Settings"),
  () => import("@/pages/Royalties"),
  () => import("@/pages/Marketplace"),
];

/**
 * Eagerly download JS for every high-traffic auth route during idle time.
 * After this finishes, navigating between pages feels instant — no download
 * delay, no Suspense skeleton, just an immediate render.
 */
export function prefetchAllAuthChunks(): void {
  if (!shouldPrefetch()) return;

  const load = () => {
    for (const fn of ALL_AUTH_CHUNKS) {
      const key = fn?.toString();
      if (!prefetchedRoutes?.has(key)) {
        prefetchedRoutes?.add(key);
        fn().catch(() => {});
      }
    }
  };

  if ("requestIdleCallback" in window) {
    (window as Record<string, unknown>).requestIdleCallback(load, {
      timeout: 5000,
    });
  } else {
    setTimeout(load, 2000);
  }
}
