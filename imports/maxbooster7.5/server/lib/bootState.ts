let _routesReady = false;
const criticalRoutes = new Set([
  "auth", "billing", "stripeWebhook", "admin", "security", "storage",
]);
const failedCriticalRoutes = new Set<string>();

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
