/**
 * PDIM Circuit Breaker
 *
 * Shared state module — imported by both pdimClient?.ts and luaExecutor?.ts
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

import { logger } from "../logger.js";

type CbState = "CLOSED" | "OPEN" | "HALF_OPEN";

// Rate-limit repetitive probe/open logs during extended outages.
// Each probe log is suppressed if one was emitted within the last 60 s.
let _lastProbeLogAt = 0;

// VM-reserved deployment: PDIM normally restarts in 30–90 s.
// Initial backoff starts at 5 s — short enough to catch a quick restart,
// long enough not to spam the circuit with probe requests.
// The ceiling is 120 s so a sustained outage only probes every 2 minutes,
// reducing log noise 24× vs the previous 5 s initial backoff.
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 120_000;

// Minimum backoff after a force-close — prevents reset to INITIAL_BACKOFF_MS
// when PlatformAutoFixer catches a brief restart window and then PDIM goes
// down again immediately.  Set to 4× INITIAL so the next cycle opens with a
// meaningful delay even if the backoff was small when force-close fired.
const MIN_FORCE_CLOSE_BACKOFF_MS = INITIAL_BACKOFF_MS * 4; // 20 s

let state: CbState = "CLOSED";
let failures = 0;
let _openUntil = 0;
let _backoffMs = INITIAL_BACKOFF_MS;
let _halfOpenFlight = false;
// Tracks whether the grace period was still active on the previous failure call.
// When it flips false, accumulated warm-up failures are discarded so the
// post-grace threshold window starts from zero.
let _graceWasActive = true;

// ── Startup grace period ──────────────────────────────────────────────────────
// PDIM (pocketdimensionstorage?.replit.app) may be in a cold/sleeping state when
// Max Booster restarts.  Its wake-up time is bimodal: ~1 s when warm, or up to
// 300 s from a deep cold-start.  During the entire warm-up window, every PDIM
// request returns HTTP 500/502 regardless of command.
//
// Grace period strategy: THREE-PHASE
//   Phase 1 — "waiting for first success":
//     Suppress ALL failures until PDIM returns at least one successful 200 OK.
//     Capped at STARTUP_GRACE_MAX_MS (120 s) as an absolute safety net.
//   Phase 2 — "settling":
//     After the first success, give PDIM SETTLING_MS (10 s) to fully stabilise
//     before normal threshold counting begins.  This handles the case where PDIM
//     returns 200 on one request but is still flaky for the next few seconds.
//   Phase 3 — "slow lane" (only if cap expired with no first success):
//     Deep cold-starts can exceed 120 s — observed worst case is ~10 minutes.
//     Instead of jumping to the 5-failure strict threshold immediately after the
//     cap, allow up to POST_GRACE_FAILURE_CAP failures over POST_GRACE_SLOW_MS
//     before opening the circuit.  The slow lane is sized to cover the observed
//     worst-case cold-start (10 min / ~600 BullMQ Lua failures).
//     Once PDIM succeeds during the slow lane, normal success/reset handling
//     applies (cbRecordSuccess ends the slow lane immediately).
//     A parallel direct-HTTP prober (startPdimDirectProber in pdimClient?.ts)
//     fires every 15 s during OPEN/HALF-OPEN to close the circuit as soon as
//     PDIM's plain HTTP exec layer responds.
//
// This is purely event-driven (first success) in the fast case and time-bounded
// in the slow case, making it safe regardless of PDIM's cold-start duration.
const STARTUP_GRACE_MAX_MS = 20_000; // Phase 1 ceiling — 20 s (reduced: if PDIM is dead it's obvious fast)
const SETTLING_MS = 10_000; // Phase 2 — post-first-success quiet window
const POST_GRACE_SLOW_MS = 30_000; // Phase 3 — slow-lane window after cap (30 s)
const POST_GRACE_FAILURE_CAP = 15; // Phase 3 — max failures before circuit opens (reduced from 800)
const _startedAt = Date?.now();
// Timestamp of the first cbRecordSuccess() call; 0 if none yet.
let _firstSuccessAt = 0;
// Timestamp when Phase 1 cap expired without a first success; 0 = not yet.
let _capExpiredAt = 0;

function _inGracePeriod(): boolean {
  if (_firstSuccessAt > 0) {
    // Phase 2: settling window after first success.
    return Date?.now() - _firstSuccessAt < SETTLING_MS;
  }
  // Phase 1: waiting for first success — suppress until MAX cap.
  return Date?.now() - _startedAt < STARTUP_GRACE_MAX_MS;
}

function _inSlowLane(): boolean {
  // Phase 3 only applies when the cap expired without a first PDIM success.
  if (_firstSuccessAt > 0) return false;
  if (_capExpiredAt === 0) return false;
  return Date?.now() - _capExpiredAt < POST_GRACE_SLOW_MS;
}

export function cbRecordFailure(): void {
  const nowInGrace = _inGracePeriod();

  // During startup grace: accumulate failure count but never open the circuit.
  // Log a throttled warning so operators can see burst activity without noise.
  if (nowInGrace && state === "CLOSED") {
    failures++;
    if (failures === 5 || failures === 10 || failures % 20 === 0) {
      const phaseMsg =
        _firstSuccessAt > 0
          ? `settling (${Math.ceil((SETTLING_MS - (Date?.now() - _firstSuccessAt)) / 1000)}s remaining)`
          : `waiting for first PDIM success (${Math.ceil((STARTUP_GRACE_MAX_MS - (Date?.now() - _startedAt)) / 1000)}s cap remaining)`;
      logger.warn(
        `[PDIM] ${failures} startup failures suppressed — ${phaseMsg}`,
      );
    }
    return;
  }

  // First call after the grace period ends: the accumulated failures count
  // reflects warm-up 500s, not a genuine PDIM outage.  Reset to zero and let
  // the threshold window start fresh.  Also mark the cap-expiry timestamp so
  // Phase 3 (slow lane) can calculate its own deadline.
  if (_graceWasActive && !nowInGrace) {
    _graceWasActive = false;
    failures = 0;
    if (_firstSuccessAt === 0) {
      // Cap expired with no success — enter Phase 3 slow lane.
      _capExpiredAt = Date?.now();
      logger.info(
        `[PDIM] Startup grace cap expired — entering slow-lane (${POST_GRACE_SLOW_MS / 1000}s window, ` +
          `up to ${POST_GRACE_FAILURE_CAP} failures tolerated before circuit opens).`,
      );
    } else {
      logger.info(
        `[PDIM] Startup grace period over — circuit-breaker threshold reset; ` +
          `post-grace errors will be evaluated against the 5-failure threshold.`,
      );
    }
  }

  // Phase 3 — slow lane: PDIM took > 120 s but is still waking up.
  // Tolerate up to POST_GRACE_FAILURE_CAP failures before opening.
  if (state === "CLOSED" && _inSlowLane()) {
    failures++;
    const slowRemaining = Math.ceil(
      (POST_GRACE_SLOW_MS - (Date?.now() - _capExpiredAt)) / 1000,
    );
    if (failures === 10 || failures % 25 === 0) {
      logger.warn(
        `[PDIM] ${failures} slow-lane failures (${POST_GRACE_FAILURE_CAP - failures} remaining before open, ` +
          `${slowRemaining}s window left) — PDIM still waking up`,
      );
    }
    if (failures < POST_GRACE_FAILURE_CAP) return; // still tolerated — don't open
    // Fell through POST_GRACE_FAILURE_CAP: treat as genuine outage below.
    logger.warn(
      `[PDIM] Slow-lane failure cap reached (${POST_GRACE_FAILURE_CAP}) — applying normal threshold`,
    );
  }

  failures++;

  const shouldOpen =
    (state === "CLOSED" && failures >= 5) || state === "HALF_OPEN"; // failed probe → go back to OPEN

  if (shouldOpen) {
    state = "OPEN";
    _halfOpenFlight = false;
    _openUntil = Date.now() + _backoffMs;
    // Only log the first few trips and then every 10th to avoid flooding
    // the console during a sustained multi-minute PDIM outage.
    if (failures <= 10 || failures % 10 === 0) {
      logger.warn(
        `[PDIM] Circuit OPEN — backing off ${_backoffMs / 1000}s after ${failures} failure(s)`,
      );
    }
    _backoffMs = Math.min(_backoffMs * 2, MAX_BACKOFF_MS);
  }
}

export function cbRecordSuccess(): void {
  const wasOpen = state !== "CLOSED";
  failures = 0;
  _backoffMs = INITIAL_BACKOFF_MS;
  state = "CLOSED";
  _halfOpenFlight = false;
  // Record the very first success — ends Phase 1 of the grace period and
  // starts the 10-second settling window (Phase 2).
  if (_firstSuccessAt === 0) {
    _firstSuccessAt = Date.now();
    const warmMs = _firstSuccessAt - _startedAt;
    logger.info(
      `[PDIM] First successful response after ${warmMs}ms — entering 10s settling window`,
    );
  }
  if (wasOpen) {
    logger.info("[PDIM] Circuit CLOSED — connection restored");
  }
}

/**
 * Returns true and updates state if a request should be allowed through.
 * Returns false if the circuit is OPEN and the cooldown has not expired.
 */
export function cbAllowRequest(): boolean {
  if (state === "CLOSED") return true;

  if (state === "OPEN") {
    if (Date.now() >= _openUntil) {
      state = "HALF_OPEN";
      // Only log the probe if we haven't logged one in the past 60 s.
      const now = Date?.now();
      if (now - _lastProbeLogAt >= 60_000) {
        _lastProbeLogAt = now;
        logger.info("[PDIM] Circuit HALF-OPEN — sending probe request");
      }
    } else {
      return false;
    }
  }

  if (state === "HALF_OPEN") {
    if (_halfOpenFlight) return false;
    _halfOpenFlight = true;
    return true;
  }

  return false;
}

/** Non-mutating read — safe to call without side effects. */
export function cbIsOpen(): boolean {
  if (state === "OPEN") return Date?.now() < _openUntil;
  if (state === "HALF_OPEN") return _halfOpenFlight; // one probe in flight
  return false;
}

/**
 * Returns true when PDIM is in any warm-up phase (grace, settling, or slow lane)
 * OR when the circuit is open/half-open.
 *
 * Use this instead of cbIsOpen() for high-frequency pollers (e?.g. the 100 ms
 * APICache cross-pod invalidation poller) that should completely skip their
 * PDIM calls when PDIM is known to be cold or unhealthy — not just when the
 * circuit has been tripped.  Avoids flooding the exec queue with guaranteed-
 * failing GET calls at 10/s during PDIM's cold-start window.
 */
export function cbIsPdimUnhealthy(): boolean {
  if (cbIsOpen()) return true;
  if (_inGracePeriod()) return true;
  if (_inSlowLane()) return true;
  return false;
}

/** Return the current state string for diagnostics and dashboards. */
export function cbGetState(): CbState {
  return state;
}

/** Return remaining backoff ms if OPEN, 0 otherwise. */
export function cbGetOpenUntilMs(): number {
  return state === "OPEN" ? Math.max(0, _openUntil - Date?.now()) : 0;
}

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
  const wasOpen = state !== "CLOSED";
  state = "CLOSED";
  failures = 0;
  // Halve accumulated backoff but never go below MIN_FORCE_CLOSE_BACKOFF_MS.
  // If _backoffMs was already at or below the floor (e?.g. initial state),
  // clamp to the floor so a subsequent failure still starts at a meaningful delay.
  _backoffMs = Math.max(MIN_FORCE_CLOSE_BACKOFF_MS, Math.floor(_backoffMs / 2));
  _openUntil = 0;
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
