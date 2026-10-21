let _routesReady = false;
const criticalRoutes = new Set([
  "auth", "billing", "stripeWebhook", "admin", "security", "storage",
]);
const failedCriticalRoutes = new Set<string>();
// Set when the real GET /api/auth/me handler (and the session/user populators
// mounted ahead of it) are registered. Registration, login and logout routes
// become live in the same registration pass, so the early-boot /api/auth/me
// stub must hand off at this point rather than when ALL routes finish — or a
// user who signs in during the boot window is told they are signed out.
let _authRoutesReady = false;

/** Record registration failures without retaining exception text or secrets. */
export function recordRouteRegistrationFailure(name: string): void {
  if (criticalRoutes.has(name)) failedCriticalRoutes.add(name);
}

/** Boot completion is separate from whether every critical route mounted. */
export function setRoutesReady(): void {
  _routesReady = true;
}

export function isRoutesReady(): boolean {
  return _routesReady;
}

export function routeRegistrationReadiness(): {
  status: "ok" | "degraded";
  detail: string;
} {
  if (failedCriticalRoutes.size > 0) {
    return {
      status: "degraded",
      detail: `critical route registration failed: ${[...failedCriticalRoutes].sort().join(", ")}`,
    };
  }
  return _routesReady
    ? { status: "ok", detail: "critical routes registered; route loading complete" }
    : { status: "degraded", detail: "boot in progress — route registration incomplete" };
}

export function setAuthRoutesReady(): void {
  _authRoutesReady = true;
}

export function isAuthRoutesReady(): boolean {
  return _authRoutesReady;
}
