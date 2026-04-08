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
 *   5 consecutive 5xx/network failures → OPEN for 15 s
 *   Backoff doubles on each successive open: 15 s → 30 s → 60 s → 120 s (cap)
 *   One successful response in HALF_OPEN → CLOSED, resets counter and backoff
 */

import { logger } from '../logger.js';

type CbState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// Rate-limit repetitive probe/open logs during extended outages.
// Each probe log is suppressed if one was emitted within the last 60 s.
let _lastProbeLogAt = 0;

// VM-reserved deployment: PDIM is always-on and normally restarts in seconds.
// Initial backoff is kept short (1 s) so a brief hiccup recovers quickly.
// The ceiling is raised to 120 s so a sustained outage (PDIM down for minutes)
// only probes once every 2 minutes instead of every 10 s — this reduces log
// noise by 12× during extended outages without slowing normal recovery.
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS     = 120_000;

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
 * Force-close the circuit — called by ChainFixer when an external signal
 * (e.g. PDIM health-check success after the circuit tripped) confirms PDIM
 * is healthy.  Resets all failure counters and backoff state.
 */
export function cbForceClose(): void {
  const wasOpen = _state !== 'CLOSED';
  _state          = 'CLOSED';
  _failures       = 0;
  _backoffMs      = INITIAL_BACKOFF_MS;
  _openUntil      = 0;
  _halfOpenFlight = false;
  if (wasOpen) {
    logger.info('[PDIM] Circuit force-CLOSED — external recovery signal received; resuming normal operation');
  }
}

export function cbHalfOpenFailed(): void {
  _halfOpenFlight = false; // release the probe slot so next interval can retry
}
