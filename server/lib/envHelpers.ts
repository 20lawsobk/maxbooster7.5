/**
 * Centralized production environment detection.
 *
 * CRITICAL: On Replit Autoscale, NODE_ENV is NOT automatically set to
 * 'production'. The only reliable signal that we are in a deployed/production
 * environment is REPLIT_DEPLOYMENT=1 (set by Replit's infrastructure).
 *
 * Using `process.env.NODE_ENV === 'production'` alone will FAIL on Autoscale,
 * causing security-critical behaviour (secure cookies, CSRF, CSP, rate limiting,
 * error suppression, stack-trace hiding) to be silently disabled.
 *
 * Always import from this module instead of checking NODE_ENV directly.
 */

export const isProductionEnv = (): boolean =>
  process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;

export const isDevEnv = (): boolean => !isProductionEnv();
