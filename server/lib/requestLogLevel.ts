export type RequestLogLevel = "info" | "warn" | "error";

const READINESS_PATHS = new Set([
  "/ready",
  "/api/ready",
  "/api/health/ready",
]);

export function classifyRequestLogLevel(input: {
  statusCode: number;
  path: string;
  isAuthStatus: boolean;
  isAsset404: boolean;
  isBootWindow404: boolean;
}): RequestLogLevel {
  const {
    statusCode,
    path,
    isAuthStatus,
    isAsset404,
    isBootWindow404,
  } = input;

  // These endpoints deliberately return 503 while dependencies are warming or
  // degraded. Keep the response and monitoring signal intact, but do not log
  // expected readiness polling as an application exception.
  if (statusCode === 503 && READINESS_PATHS.has(path)) return "warn";
  if (statusCode >= 500) return "error";
  if (
    statusCode >= 400 &&
    !isAuthStatus &&
    !isAsset404 &&
    !isBootWindow404
  ) {
    return "warn";
  }
  return "info";
}
