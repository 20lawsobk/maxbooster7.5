// Client navigation policy only. API handlers remain responsible for authorization.
const marketingAndAuthRoutes = new Set([
  "/", "/about", "/blog", "/features", "/pricing", "/security", "/dmca",
  "/terms", "/privacy", "/api-docs", "/documentation", "/solo-founder-story",
  "/desktop-app", "/help", "/login", "/register", "/forgot-password", "/reset-password",
]);

function pathname(location: string): string {
  return location.split(/[?#]/, 1)[0];
}

export function isMarketingOrAuthPage(location: string): boolean {
  const path = pathname(location);
  return marketingAndAuthRoutes.has(path) || /^\/(?:blog|register)\/[^/]+(?:\/[^/]+)*$/.test(path);
}

export function isPublicPageRoute(location: string): boolean {
  const path = pathname(location);
  return isMarketingOrAuthPage(path) || path === "/verification" || path === "/handle-link" ||
    /^\/(?:storefront|store|s|epk)\/[^/]+$/.test(path) ||
    /^\/marketplace\/(?:beat|producer)\/[^/]+$/.test(path);
}

export function shouldRedirectNativeLanding(location: string, authenticated: boolean, loading: boolean): boolean {
  // Signed-out native users must retain access to login and registration;
  // redirecting those pages to dashboard creates an auth redirect loop.
  return !loading && authenticated && isMarketingOrAuthPage(location);
}
