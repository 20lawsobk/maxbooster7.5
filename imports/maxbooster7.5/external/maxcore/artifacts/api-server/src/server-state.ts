/**
 * Shared mutable server state.
 *
 * Written by python-server.ts (the spawn manager) and read by model-proxy.ts
 * (the request router).  Kept in a separate module so neither side imports
 * the other, which would create a circular dependency.
 *
 * Rule: only python-server.ts calls the setters; everyone else calls the
 * getters.
 */

import cluster from "node:cluster";

const STATE_MESSAGE = "maxcore:python-restarting";
const STATE_REQUEST = "maxcore:python-state-request";
// Workers must receive an authoritative primary snapshot before forwarding.
let _pythonRestarting = true;

function sendState(worker: import("node:cluster").Worker) {
  if (worker.isConnected()) {
    worker.send({ type: STATE_MESSAGE, restarting: _pythonRestarting }, error => {
      if (error && worker.isConnected()) console.error("[ServerState] IPC state delivery failed", error);
    });
  }
}

if (cluster.isPrimary) {
  cluster.on("online", sendState);
  cluster.on("message", (worker, message) => {
    if (message?.type === STATE_REQUEST) sendState(worker);
  });
} else {
  process.on("message", (message: unknown) => {
    const state = message as { type?: string; restarting?: unknown } | null;
    if (state?.type === STATE_MESSAGE && typeof state.restarting === "boolean") {
      _pythonRestarting = state.restarting;
    }
  });
  // The online notification may predate module initialization; explicitly
  // request the latest state after registering the message listener.
  process.send?.({ type: STATE_REQUEST });
}

/**
 * Mark Python as in the middle of a crash-restart cycle.
 * While true, the proxy hold-queue will park incoming requests instead of
 * returning 503 — they drain automatically when setPythonRestarting(false)
 * is called after the warm-up pass succeeds.
 */
export function setPythonRestarting(v: boolean): void {
  const prev = _pythonRestarting;
  _pythonRestarting = v;
  if (cluster.isPrimary) {
    for (const worker of Object.values(cluster.workers ?? {})) {
      if (worker) sendState(worker);
    }
  }
  if (v && !prev) {
    console.log("[ServerState] Python restarting — holding incoming requests");
  } else if (!v && prev) {
    console.log("[ServerState] Python ready — releasing held requests");
  }
}

/**
 * True between a Python crash and the completion of its post-restart warm pass.
 * Proxy functions check this to decide whether to hold or forward requests.
 */
export function isPythonRestarting(): boolean {
  return _pythonRestarting;
}
