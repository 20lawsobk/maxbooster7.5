/**
 * PDIM Circuit Breaker
 *
 * Shared state module — imported by both pdimClient.ts and luaExecutor.ts
 * to avoid a circular dependency (pdimClient → luaExecutor → pdimClient).
 *
 * States:
 *   CLOSED    — normal operation
 *   OPEN      — PDIM is down; reject requests immediately without HTTP calls
 *   HALF_OPEN — cooldown expired; allow exactly one probe request through
 *
 * Thresholds:
 *   5 consecutive 5xx/network failures → OPEN for 5 s
 *   Backoff doubles on each successive open: 5 s → 10 s → 20 s → 40 s → 120 s (cap)
 *   One successful response in HALF_OPEN → CLOSED, resets counter and backoff
 *
 * Force-close (called by PlatformAutoFixer after an external bypass probe):
 *   Resets state + failure counter BUT preserves (halves) accumulated backoff
 *   so that if PDIM fails again immediately after a restart-window probe, the
 *   next open cycle does NOT restart from the 5 s floor.  This prevents the
 *   tight 5→10→20s cycling when PDIM is unstable.
 */

import { logger } from '../logger.js';

type CbState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// Rate-limit repetitive probe/open logs during extended outages.
// Each probe log is suppressed if one was emitted within the last 60 s.
let _lastProbeLogAt = 0;

// VM-reserved deployment: PDIM normally restarts in 30–90 s.
// Initial backoff starts at 5 s — short enough to catch a quick restart,
// long enough not to spam the circuit with probe requests.
// The ceiling is 120 s so a sustained outage only probes every 2 minutes,
// reducing log noise 24× vs the previous 5 s initial backoff.
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS     = 120_000;

// Minimum backoff after a force-close — prevents reset to INITIAL_BACKOFF_MS
// when PlatformAutoFixer catches a brief restart window and then PDIM goes
// down again immediately.  Set to 4× INITIAL so the next cycle opens with a
// meaningful delay even if the backoff was small when force-close fired.
const MIN_FORCE_CLOSE_BACKOFF_MS = INITIAL_BACKOFF_MS * 4; // 20 s

let _state: CbState   = 'CLOSED';
let _failures         = 0;
let _openUntil        = 0;
let _backoffMs        = INITIAL_BACKOFF_MS;
let _halfOpenFlight   = false;

export function cbRecordFailure(): void {
  _failures++;
  const shouldOpen =
    (_state === 'CLOSED'    && _failures >= 5) ||
    (_state === 'HALF_OPEN');                    // failed probe → go back to OPEN

  if (shouldOpen) {
    _state          = 'OPEN';
    _halfOpenFlight = false;
    _openUntil      = Date.now() + _backoffMs;
    // Only log the first few trips and then every 10th to avoid flooding
    // the console during a sustained multi-minute PDIM outage.
    if (_failures <= 10 || _failures % 10 === 0) {
      logger.warn(`[PDIM] Circuit OPEN — backing off ${_backoffMs / 1000}s after ${_failures} failure(s)`);
    }
    _backoffMs      = Math.min(_backoffMs * 2, MAX_BACKOFF_MS);
  }
}

export function cbRecordSuccess(): void {
  const wasOpen = _state !== 'CLOSED';
  _failures       = 0;
  _backoffMs      = INITIAL_BACKOFF_MS;
  _state          = 'CLOSED';
  _halfOpenFlight = false;
  if (wasOpen) {
    logger.info('[PDIM] Circuit CLOSED — connection restored');
  }
}

/**
 * Returns true and updates state if a request should be allowed through.
 * Returns false if the circuit is OPEN and the cooldown has not expired.
 */
export function cbAllowRequest(): boolean {
  if (_state === 'CLOSED') return true;

  if (_state === 'OPEN') {
    if (Date.now() >= _openUntil) {
      _state = 'HALF_OPEN';
      // Only log the probe if we haven't logged one in the past 60 s.
      const now = Date.now();
      if (now - _lastProbeLogAt >= 60_000) {
        _lastProbeLogAt = now;
        logger.info('[PDIM] Circuit HALF-OPEN — sending probe request');
      }
    } else {
      return false;
    }
  }

  if (_state === 'HALF_OPEN') {
    if (_halfOpenFlight) return false;
    _halfOpenFlight = true;
    return true;
  }

  return false;
}

/** Non-mutating read — safe to call without side effects. */
export function cbIsOpen(): boolean {
  if (_state === 'OPEN')      return Date.now() < _openUntil;
  if (_state === 'HALF_OPEN') return _halfOpenFlight; // one probe in flight
  return false;
}

/** Return the current state string for diagnostics and dashboards. */
export function cbGetState(): CbState { return _state; }

/** Return remaining backoff ms if OPEN, 0 otherwise. */
export function cbGetOpenUntilMs(): number { return _state === 'OPEN' ? Math.max(0, _openUntil - Date.now()) : 0; }

/**
 * Force-close the circuit — called by PlatformAutoFixer when an external bypass
 * probe (≥2 consecutive successes) confirms PDIM is reachable again.
 *
 * Unlike cbRecordSuccess() (which fires on real traffic and fully resets
 * everything), force-close PRESERVES the accumulated backoff — halved, but
 * floored at MIN_FORCE_CLOSE_BACKOFF_MS.  This prevents the tight cycling
 * that occurs when PDIM is unstable: a single bypass probe catching a brief
 * restart window must not erase the accumulated backoff so that a subsequent
 * failure cycle restarts from the floor (5 s).
 *
 * If PDIM genuinely stabilises after a force-close, cbRecordSuccess() on the
 * first real successful traffic request will fully reset _backoffMs to
 * INITIAL_BACKOFF_MS, so the protection has zero cost on genuine recovery.
 */
export function cbForceClose(): void {
  const wasOpen = _state !== 'CLOSED';
  _state        = 'CLOSED';
  _failures     = 0;
  // Halve accumulated backoff but never go below MIN_FORCE_CLOSE_BACKOFF_MS.
  // If _backoffMs was already at or below the floor (e.g. initial state),
  // clamp to the floor so a subsequent failure still starts at a meaningful delay.
  _backoffMs      = Math.max(MIN_FORCE_CLOSE_BACKOFF_MS, Math.floor(_backoffMs / 2));
  _openUntil      = 0;
  _halfOpenFlight = false;
  if (wasOpen) {
    logger.info(
      `[PDIM] Circuit force-CLOSED — external recovery signal received; ` +
      `next failure cycle backoff starts at ${_backoffMs / 1000}s`,
    );
  }
}

export function cbHalfOpenFailed(): void {
  _halfOpenFlight = false; // release the probe slot so next interval can retry
}
