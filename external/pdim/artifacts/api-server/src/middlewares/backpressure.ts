/**
 * REQUEST BACKPRESSURE MIDDLEWARE
 *
 * Tracks in-flight HTTP requests.  When the count exceeds MAX_CONCURRENT the
 * server returns 503 Service Unavailable instead of queuing the request.
 *
 * Why: an unbounded queue lets callers pile up in memory during a spike,
 * eventually triggering an OOM kill — the worst possible outcome.  Returning
 * 503 immediately gives callers a clean signal to back off and retry with
 * exponential back-off, which is the correct behaviour at 90M-user scale.
 *
 * The default is Number.MAX_SAFE_INTEGER (effectively unlimited) so no
 * legitimate caller is ever shed.  Set MAX_CONCURRENT_REQUESTS via env to
 * apply a lower ceiling in memory-constrained deployments.
 */

import type { Request, Response, NextFunction } from "express";

const MAX_CONCURRENT = Number(
  process.env["MAX_CONCURRENT_REQUESTS"] ?? Number.MAX_SAFE_INTEGER,
);

let _active = 0;
let _dropped = 0;

export function backpressureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (_active >= MAX_CONCURRENT) {
    _dropped++;
    res.setHeader("Retry-After", "1");
    res.status(503).json({
      error: "Server overloaded — please retry",
      activeRequests: _active,
      maxConcurrent: MAX_CONCURRENT,
    });
    return;
  }

  _active++;

  // Settled flag prevents double-decrement: both 'finish' and 'close' can fire
  // on a single response (e.g. client disconnects mid-stream), so without this
  // guard _active would drop by 2 per request instead of 1.
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    if (_active > 0) _active--;
  };

  res.on("finish", settle);
  res.on("close", settle);
  next();
}

/** Expose counters for the health monitor. */
export function getBackpressureStats(): {
  activeRequests: number;
  droppedRequests: number;
  maxConcurrent: number;
} {
  return {
    activeRequests: _active,
    droppedRequests: _dropped,
    maxConcurrent: MAX_CONCURRENT,
  };
}
