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

let _state: CbState   = 'CLOSED';
let _failures         = 0;
let _openUntil        = 0;
let _backoffMs        = 15_000;
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
    logger.warn(`[PDIM] Circuit OPEN — backing off ${_backoffMs / 1000}s after ${_failures} failure(s)`);
    _backoffMs      = Math.min(_backoffMs * 2, 120_000);
  }
}

export function cbRecordSuccess(): void {
  const wasOpen = _state !== 'CLOSED';
  _failures       = 0;
  _backoffMs      = 15_000;
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
      logger.info('[PDIM] Circuit HALF-OPEN — sending probe request');
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

export function cbHalfOpenFailed(): void {
  _halfOpenFlight = false; // release the probe slot so next interval can retry
}
