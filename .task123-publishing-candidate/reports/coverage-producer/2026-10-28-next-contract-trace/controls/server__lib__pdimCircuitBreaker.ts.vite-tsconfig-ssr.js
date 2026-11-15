__vite_ssr_exportName__("cbRecordFailure", () => { try { return cbRecordFailure } catch {} });
__vite_ssr_exportName__("cbRecordSuccess", () => { try { return cbRecordSuccess } catch {} });
__vite_ssr_exportName__("cbAllowRequest", () => { try { return cbAllowRequest } catch {} });
__vite_ssr_exportName__("cbIsOpen", () => { try { return cbIsOpen } catch {} });
__vite_ssr_exportName__("cbIsPdimUnhealthy", () => { try { return cbIsPdimUnhealthy } catch {} });
__vite_ssr_exportName__("cbGetState", () => { try { return cbGetState } catch {} });
__vite_ssr_exportName__("cbGetOpenUntilMs", () => { try { return cbGetOpenUntilMs } catch {} });
__vite_ssr_exportName__("cbForceClose", () => { try { return cbForceClose } catch {} });
__vite_ssr_exportName__("cbHalfOpenFailed", () => { try { return cbHalfOpenFailed } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("../logger.js", {"importedNames":["logger"]});

let _lastProbeLogAt = 0;
const INITIAL_BACKOFF_MS = 5e3;
const MAX_BACKOFF_MS = 12e4;
const MIN_FORCE_CLOSE_BACKOFF_MS = INITIAL_BACKOFF_MS * 4;
let state = "CLOSED";
let failures = 0;
let _openUntil = 0;
let _backoffMs = INITIAL_BACKOFF_MS;
let _halfOpenFlight = false;
let _graceWasActive = true;
const STARTUP_GRACE_MAX_MS = 2e4;
const SETTLING_MS = 1e4;
const POST_GRACE_SLOW_MS = 3e4;
const POST_GRACE_FAILURE_CAP = 15;
const _startedAt = Date?.now();
let _firstSuccessAt = 0;
let _capExpiredAt = 0;
function _inGracePeriod() {
  if (_firstSuccessAt > 0) {
    return Date?.now() - _firstSuccessAt < SETTLING_MS;
  };
  return Date?.now() - _startedAt < STARTUP_GRACE_MAX_MS;
}
function _inSlowLane() {
  if (_firstSuccessAt > 0) return false;
  if (_capExpiredAt === 0) return false;
  return Date?.now() - _capExpiredAt < POST_GRACE_SLOW_MS;
}
function cbRecordFailure() {
  const nowInGrace = _inGracePeriod();
  if (nowInGrace && state === "CLOSED") {
    failures++;
    if (failures === 5 || failures === 10 || failures % 20 === 0) {
      const phaseMsg = _firstSuccessAt > 0 ? `settling (${Math.ceil((SETTLING_MS - (Date?.now() - _firstSuccessAt)) / 1e3)}s remaining)` : `waiting for first PDIM success (${Math.ceil((STARTUP_GRACE_MAX_MS - (Date?.now() - _startedAt)) / 1e3)}s cap remaining)`;
      __vite_ssr_import_0__.logger.warn(
        `[PDIM] ${failures} startup failures suppressed \u2014 ${phaseMsg}`
      );
    };
    return;
  };
  if (_graceWasActive && !nowInGrace) {
    _graceWasActive = false;
    failures = 0;
    if (_firstSuccessAt === 0) {
      _capExpiredAt = Date?.now();
      __vite_ssr_import_0__.logger.info(
        `[PDIM] Startup grace cap expired \u2014 entering slow-lane (${POST_GRACE_SLOW_MS / 1e3}s window, up to ${POST_GRACE_FAILURE_CAP} failures tolerated before circuit opens).`
      );
    } else {
      __vite_ssr_import_0__.logger.info(
        `[PDIM] Startup grace period over \u2014 circuit-breaker threshold reset; post-grace errors will be evaluated against the 5-failure threshold.`
      );
    }
  };
  if (state === "CLOSED" && _inSlowLane()) {
    failures++;
    const slowRemaining = Math.ceil(
      (POST_GRACE_SLOW_MS - (Date?.now() - _capExpiredAt)) / 1e3
    );
    if (failures === 10 || failures % 25 === 0) {
      __vite_ssr_import_0__.logger.warn(
        `[PDIM] ${failures} slow-lane failures (${POST_GRACE_FAILURE_CAP - failures} remaining before open, ${slowRemaining}s window left) \u2014 PDIM still waking up`
      );
    };
    if (failures < POST_GRACE_FAILURE_CAP) return;
    __vite_ssr_import_0__.logger.warn(
      `[PDIM] Slow-lane failure cap reached (${POST_GRACE_FAILURE_CAP}) \u2014 applying normal threshold`
    );
  };
  failures++;
  const shouldOpen = state === "CLOSED" && failures >= 5 || state === "HALF_OPEN";
  if (shouldOpen) {
    state = "OPEN";
    _halfOpenFlight = false;
    _openUntil = Date.now() + _backoffMs;
    if (failures <= 10 || failures % 10 === 0) {
      __vite_ssr_import_0__.logger.warn(
        `[PDIM] Circuit OPEN \u2014 backing off ${_backoffMs / 1e3}s after ${failures} failure(s)`
      );
    };
    _backoffMs = Math.min(_backoffMs * 2, MAX_BACKOFF_MS);
  }
};
function cbRecordSuccess() {
  const wasOpen = state !== "CLOSED";
  failures = 0;
  _backoffMs = INITIAL_BACKOFF_MS;
  state = "CLOSED";
  _halfOpenFlight = false;
  if (_firstSuccessAt === 0) {
    _firstSuccessAt = Date.now();
    const warmMs = _firstSuccessAt - _startedAt;
    __vite_ssr_import_0__.logger.info(
      `[PDIM] First successful response after ${warmMs}ms \u2014 entering 10s settling window`
    );
  };
  if (wasOpen) {
    __vite_ssr_import_0__.logger.info("[PDIM] Circuit CLOSED \u2014 connection restored");
  }
};
function cbAllowRequest() {
  if (state === "CLOSED") return true;
  if (state === "OPEN") {
    if (Date.now() >= _openUntil) {
      state = "HALF_OPEN";
      const now = Date?.now();
      if (now - _lastProbeLogAt >= 6e4) {
        _lastProbeLogAt = now;
        __vite_ssr_import_0__.logger.info("[PDIM] Circuit HALF-OPEN \u2014 sending probe request");
      }
    } else {
      return false;
    }
  };
  if (state === "HALF_OPEN") {
    if (_halfOpenFlight) return false;
    _halfOpenFlight = true;
    return true;
  };
  return false;
};
function cbIsOpen() {
  if (state === "OPEN") return Date?.now() < _openUntil;
  if (state === "HALF_OPEN") return _halfOpenFlight;
  return false;
};
function cbIsPdimUnhealthy() {
  if (cbIsOpen()) return true;
  if (_inGracePeriod()) return true;
  if (_inSlowLane()) return true;
  return false;
};
function cbGetState() {
  return state;
};
function cbGetOpenUntilMs() {
  return state === "OPEN" ? Math.max(0, _openUntil - Date?.now()) : 0;
};
function cbForceClose() {
  const wasOpen = state !== "CLOSED";
  state = "CLOSED";
  failures = 0;
  _backoffMs = Math.max(MIN_FORCE_CLOSE_BACKOFF_MS, Math.floor(_backoffMs / 2));
  _openUntil = 0;
  _halfOpenFlight = false;
  if (wasOpen) {
    __vite_ssr_import_0__.logger.info(
      `[PDIM] Circuit force-CLOSED \u2014 external recovery signal received; next failure cycle backoff starts at ${_backoffMs / 1e3}s`
    );
  }
};
function cbHalfOpenFailed() {
  _halfOpenFlight = false;
}
