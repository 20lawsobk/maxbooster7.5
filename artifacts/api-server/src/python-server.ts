import { spawn, ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import net from "net";
import { Agent, request as undiciRequest } from "undici";
import { setPythonRestarting } from "./server-state.js";

const PYTHON_PORT = parseInt(process.env.MODEL_API_PORT || "9878", 10);

// Dedicated liveness-probe port for the background healthz thread in Python.
// This server runs in its own daemon thread, completely independent of
// uvicorn's event loop.  GC pauses, model inference, and asyncio blocking
// inside the main server can never stall it — so we probe this port for
// hung-detection instead of the main API port, eliminating false-positives
// from GC-paused-but-healthy servers.
const HEALTHZ_PORT = PYTHON_PORT + 1; // 9879 by default

// Proxy-only mode: this instance must NEVER try to own (spawn or restart) the
// Python server.  Two conditions each independently set this flag:
//
//  1. DISABLE_PYTHON_SPAWN=1   — explicit override; can be set on any workflow.
//  2. MODEL_API_PORT not set   — only the intended owners set MODEL_API_PORT:
//     the "Start application" workflow (dev) and the production "serve"
//     script (deployment).  The artifact-managed dev workflow
//     (artifacts/api-server: API Server) runs `dev` without it, so it falls
//     into proxy-only mode automatically.  This prevents the startup race
//     where two api-server instances compete for the Python lock.  Without
//     MODEL_API_PORT in the serve script, PRODUCTION has no Python owner at
//     all and the whole API 503s — do not remove it from `serve`.
const PYTHON_SPAWN_DISABLED =
  process.env.DISABLE_PYTHON_SPAWN === "1" ||
  process.env.MODEL_API_PORT === undefined;

const PYTHON_SCRIPT = (() => {
  const metaUrl = import.meta?.url;
  if (metaUrl) {
    return path.resolve(
      path.dirname(fileURLToPath(metaUrl)),
      "../../../artifacts/ai-training-server/server.py",
    );
  }
  return path.resolve(process.cwd(), "artifacts/ai-training-server/server.py");
})();

// Backoff: starts at 2 s, doubles each crash, caps at 30 s
const INITIAL_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;

// If the server ran at least this long without crashing, treat the next
// crash as a fresh start (reset backoff).
const MIN_HEALTHY_RUN_MS = 60_000;

// Poll interval for the health monitor (detects silent crashes)
const HEALTH_POLL_INTERVAL_MS = 8_000;

// Consecutive hung-probe threshold before force-killing a process.
//
// OWNED process: each healthz probe waits up to 20 s; poll interval is 8 s.
// Two consecutive failures ≈ 56 s of confirmed hang before SIGKILL.
// This survives brief host-maintenance pauses (observed up to 18 s) and
// Python GC spikes (observed up to 25 s) without causing a needless 3-5 min
// cold restart.  Genuine deadlocks / OOM will still be caught within ~1 min.
const MAX_HUNG_PROBES_OWNED = 2;
//
// UNOWNED process: three probes ≈ 84 s.  Higher because we can only pkill
// (no exit-event), and the extra patience avoids races with a concurrent
// owned restart cycle.
const MAX_HUNG_PROBES_UNOWNED = 3;

// ─── Internal HTTP pool (warm-pass calls only) ────────────────────────────────
// Dedicated undici agent so post-startup warm-up requests never share
// the keepalive pool and can't stall real proxy traffic.
const _warmPool = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 2,
  pipelining: 1,
});

const ADMIN_KEY = process.env.ADMIN_KEY ?? "";

let pythonProcess: ChildProcess | null = null;
let consecutiveCrashes = 0;
let lastStartTime = 0;
let restartScheduled = false;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;
let consecutiveHungProbes = 0;
// "Zombie port" detection: tracked when probeHttpHealth() returns "down" but
// pythonProcess is still set (process alive, port closed — uvicorn crashed
// internally without the OS process exiting).  After PORT_DOWN_KILL_MS we
// SIGKILL the tracked process so its exit event fires and triggers the normal
// backoff-restart path.
let _portDownSince: number | null = null;
const PORT_DOWN_KILL_MS = 60_000; // 60 s of confirmed port-closed → force-kill

// Post-wake-from-sleep grace period: when the VM resumes from sleep, Python's
// GC may block uvicorn's event loop and the healthz thread may be slow to
// respond for 10-30 s.  During this window the health monitor must NOT
// declare "hung" and kill Python — that restarts it needlessly and starts a
// 3-5 min cold-start penalty.  Call notifyWakeFromSleep() (from keepalive.ts
// when it detects a heartbeat gap) to arm the grace window.
let _postWakeGraceUntil = 0;
const POST_WAKE_GRACE_MS = 90_000; // 90 s grace after VM wake

export function notifyWakeFromSleep(): void {
  _postWakeGraceUntil = Date.now() + POST_WAKE_GRACE_MS;
  console.log(
    `[Python] Wake-from-sleep notified — health monitor suspended for ${POST_WAKE_GRACE_MS / 1000}s to let Python resume.`,
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function backoffMs(): number {
  const delay = INITIAL_RETRY_MS * Math.pow(2, consecutiveCrashes - 1);
  return Math.min(Math.round(delay), MAX_RETRY_MS);
}

function isPortOpen(port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error",   () => { sock.destroy(); resolve(false); });
    sock.on("timeout", () => { sock.destroy(); resolve(false); });
    sock.connect(port, "127.0.0.1");
  });
}

function waitForPort(port: number, timeoutMs = 45_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const sock = new net.Socket();
      sock.setTimeout(1000);
      sock.on("connect", () => { sock.destroy(); resolve(); });
      sock.on("error",   () => { sock.destroy(); Date.now() < deadline ? setTimeout(poll, 500) : reject(new Error(`Timeout waiting for port ${port}`)); });
      sock.on("timeout", () => { sock.destroy(); Date.now() < deadline ? setTimeout(poll, 500) : reject(new Error(`Timeout waiting for port ${port}`)); });
      sock.connect(port, "127.0.0.1");
    };
    poll();
  });
}

async function pollUntilOpen(port: number, maxMs = 6_000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ─── HTTP hang probe ─────────────────────────────────────────────────────────
// Distinguishes three states:
//   'down'    — Main API port (9878) not open: Python crashed or not started.
//   'hung'    — Main API port open but the dedicated healthz port (9879) does
//               not respond within 10 s.  The healthz server runs in its own
//               daemon thread inside Python, completely independent of uvicorn's
//               event loop.  It can never be blocked by GC, model inference, or
//               any asyncio operation — so a timeout here means the OS process
//               itself is truly frozen (deadlock, OOM-kill stall, etc.), not
//               just uvicorn's event loop paused during GC.
//   'healthy' — Healthz port responded within the timeout.
//
// Why two ports?
//   GC runs in production block the uvicorn event loop for 10–25 s, which
//   makes /health on the main port time out and look like a hang even when the
//   process is perfectly fine.  Probing the healthz thread instead eliminates
//   that entire class of false-positive kills.

async function probeHttpHealth(): Promise<"healthy" | "hung" | "down"> {
  // Step 1: is the main API port alive? (process down check)
  const portOpen = await isPortOpen(PYTHON_PORT, 2_000);
  if (!portOpen) return "down";

  // Post-wake-from-sleep grace: after a VM suspend/resume, Python's GC can
  // block uvicorn's event loop and the healthz thread for up to 30 s.
  // During the grace window we skip the hung check entirely so we never kill
  // a healthy process just because it hasn't fully resumed yet.
  if (Date.now() < _postWakeGraceUntil) return "healthy";

  // Step 2: is the healthz thread (independent of uvicorn event loop) alive?
  // 10 s timeout — the healthz handler does nothing but write a static JSON
  // byte string, so any response at all means the process is alive.
  const healthzOpen = await isPortOpen(HEALTHZ_PORT, 1_000);
  if (!healthzOpen) {
    // Healthz port not yet bound: Python just started and hasn't called
    // _start_healthz_server() yet, or this is an older deployment without the
    // healthz thread.  Fall back to probing the main port so we don't
    // misclassify a fresh startup as a hang.
    const controller = new AbortController();
    const hangTimer = setTimeout(() => controller.abort(), 25_000);
    try {
      const { statusCode, body } = await undiciRequest(
        `http://localhost:${PYTHON_PORT}/health`,
        { method: "GET", dispatcher: _warmPool, signal: controller.signal,
          headersTimeout: 0, bodyTimeout: 0 },
      );
      await body.dump();
      clearTimeout(hangTimer);
      return statusCode < 500 ? "healthy" : "hung";
    } catch {
      clearTimeout(hangTimer);
      return "hung";
    }
  }

  // Healthz port is bound — probe it.  20 s timeout gives Python's GC
  // (observed up to 25 s on reserved VMs under memory pressure) and
  // host-maintenance pauses (observed up to 18 s) room to pass without
  // triggering a false hang signal.  The threshold-based kill in
  // startHealthMonitor() adds another ~28 s buffer on top of this.
  const controller = new AbortController();
  const hangTimer = setTimeout(() => controller.abort(), 20_000);
  try {
    const { statusCode, body } = await undiciRequest(
      `http://localhost:${HEALTHZ_PORT}/healthz`,
      { method: "GET", dispatcher: _warmPool, signal: controller.signal,
        headersTimeout: 0, bodyTimeout: 0 },
    );
    await body.dump();
    clearTimeout(hangTimer);
    return statusCode < 500 ? "healthy" : "hung";
  } catch {
    clearTimeout(hangTimer);
    // Healthz thread stopped responding — process may be genuinely frozen.
    // The caller's consecutive-probe threshold decides whether to act.
    return "hung";
  }
}

// ─── Post-startup warm-up pass ────────────────────────────────────────────────
// After Python confirms model_loaded=true, POST /api/warm to exercise the
// Digital GPU inference chains (transformer → flash-attn → pocket GEMM) before
// any real user traffic arrives.  On a reserved VM this runs once per deploy so
// the very first request hits a hot path, not a cold one.

async function waitForModelReady(maxMs = 180_000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ADMIN_KEY) headers["X-Admin-Key"] = ADMIN_KEY;

  while (Date.now() < deadline) {
    try {
      const { statusCode, body } = await undiciRequest(
        `http://localhost:${PYTHON_PORT}/health`,
        { method: "GET", dispatcher: _warmPool, headers,
          headersTimeout: 0, bodyTimeout: 0 },
      );
      const raw = await body.text();
      if (statusCode === 200) {
        const parsed = JSON.parse(raw) as { model_loaded?: boolean };
        if (parsed.model_loaded === true) return true;
      }
    } catch {
      // server still starting — keep polling
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return false;
}

async function fireWarmPass(): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ADMIN_KEY) headers["X-Admin-Key"] = ADMIN_KEY;

  try {
    console.log("[Python] Firing production warm-up pass (POST /api/warm)…");
    const { statusCode, body } = await undiciRequest(
      `http://localhost:${PYTHON_PORT}/api/warm`,
      {
        method: "POST",
        dispatcher: _warmPool,
        headers,
        body: "{}",
        headersTimeout: 0,
        bodyTimeout: 0,
      },
    );
    const raw = await body.text();
    if (statusCode === 200) {
      let summary = "";
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const subs = parsed["subsystems"] as Record<string, { ok: boolean; ms: number }> | undefined;
        if (subs) {
          summary = Object.entries(subs)
            .map(([k, v]) => `${k}:${v.ok ? "✓" : "✗"}(${v.ms}ms)`)
            .join(" ");
        }
      } catch { /* ignore parse errors */ }
      console.log(`[Python] Warm-up pass complete — ${summary || "ok"}`);
      // Signal the proxy that Python is fully ready — held requests will drain
      setPythonRestarting(false);
    } else {
      console.warn(`[Python] Warm-up pass returned ${statusCode}: ${raw.slice(0, 300)}`);
      // Still mark ready so requests aren't held indefinitely; keepalive re-warms
      setPythonRestarting(false);
    }
  } catch (err) {
    // Never fatal — keepalive will re-warm on next deep-warm cycle
    console.warn(`[Python] Warm-up pass failed (non-fatal): ${err}`);
    setPythonRestarting(false);
  }
}

// ─── Core spawn logic ─────────────────────────────────────────────────────────

function spawnPython() {
  if (shuttingDown || pythonProcess) return;

  console.log(`[Python] Starting AI training server (port ${PYTHON_PORT})...`);
  lastStartTime = Date.now();

  pythonProcess = spawn("uv", ["run", "python3", PYTHON_SCRIPT], {
    env: {
      ...process.env,
      MODEL_API_PORT: String(PYTHON_PORT),
      HEALTHZ_PORT:   String(HEALTHZ_PORT),
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  pythonProcess.stdout?.on("data", (d: Buffer) => process.stdout.write(`[Python] ${d}`));
  pythonProcess.stderr?.on("data", (d: Buffer) => process.stderr.write(`[Python] ${d}`));

  pythonProcess.on("exit", async (code, signal) => {
    pythonProcess = null;
    restartScheduled = false;
    _portDownSince = null; // clear zombie-port tracker on any real exit

    if (shuttingDown) {
      console.log("[Python] Server shut down gracefully (intentional).");
      return;
    }

    // If Python exited via SIGTERM or SIGINT it may be a system-wide signal
    // (e.g. Replit's process manager stopping the whole workflow) rather than
    // our own stopPythonServer() call.  Give our own SIGTERM handler 500 ms to
    // set shuttingDown=true; if it does, stand down — otherwise restart.
    if (signal === "SIGTERM" || signal === "SIGINT") {
      await new Promise((r) => setTimeout(r, 500));
      if (shuttingDown) {
        console.log("[Python] Server shut down gracefully (system-wide signal).");
        return;
      }
      console.log(`[Python] Received external ${signal} — will restart (not an intentional shutdown).`);
    }

    // If another process grabbed the port (e.g., standalone workflow restarted), don't fight it
    if (await isPortOpen(PYTHON_PORT)) {
      console.log(`[Python] Port ${PYTHON_PORT} is held by another process — standing by.`);
      return;
    }

    const uptime = Date.now() - lastStartTime;
    if (uptime >= MIN_HEALTHY_RUN_MS) {
      console.log(`[Python] Server was healthy for ${Math.round(uptime / 1000)}s — resetting backoff.`);
      consecutiveCrashes = 0;
    }

    consecutiveCrashes++;
    const delay = backoffMs();
    console.log(`[Python] Server exited (code ${code ?? "?"}, signal ${signal ?? "none"}). Restart #${consecutiveCrashes} in ${delay}ms…`);

    // Park incoming requests until the warm pass confirms Python is ready
    setPythonRestarting(true);

    restartScheduled = true;
    setTimeout(() => {
      spawnPython();
      // After each crash-restart, re-run the warm-up pass once Python is back.
      // fireWarmPass() calls setPythonRestarting(false) on completion (success or
      // failure) so held requests are always eventually released.
      waitForModelReady(180_000).then((ready) => {
        if (ready) {
          fireWarmPass().catch(() => {});
        } else {
          console.warn("[Python] Model did not report ready within 3 min after restart — releasing held requests anyway");
          setPythonRestarting(false);
        }
      });
    }, delay);
  });
}

// ─── Health monitor ────────────────────────────────────────────────────────────
// Polls every HEALTH_POLL_INTERVAL_MS.  Handles three states:
//
//   down    — Port 9878 closed.
//             • No tracked process → spawn a new one immediately.
//             • Tracked process alive (zombie-port: uvicorn crashed internally
//               without the OS process exiting) → wait PORT_DOWN_KILL_MS, then
//               SIGKILL so the exit event fires the normal backoff-restart path.
//
//   hung    — Port 9878 open but healthz port 9879 doesn't respond within 10 s.
//             We own the process → SIGKILL so the exit event fires and triggers
//             the normal backoff-restart path.
//             We don't own it → count consecutive hung probes.  After
//             MAX_HUNG_PROBES_UNOWNED we force-kill via pkill so the next
//             "down" probe can spawn a fresh one.
//
//   healthy — Reset all counters; nothing else to do.

function startHealthMonitor() {
  if (healthTimer) return;
  healthTimer = setInterval(async () => {
    if (shuttingDown || restartScheduled) return;

    const status = await probeHttpHealth();

    if (status === "healthy") {
      consecutiveHungProbes = 0;
      _portDownSince = null;
      return;
    }

    if (status === "down") {
      consecutiveHungProbes = 0;
      if (pythonProcess) {
        // Port closed but tracked process still alive — uvicorn may have crashed
        // internally without the OS process exiting (zombie-port scenario).
        // Give it PORT_DOWN_KILL_MS to self-recover, then force-kill so the
        // exit event fires and triggers the normal backoff-restart path.
        const now = Date.now();
        if (_portDownSince === null) {
          _portDownSince = now;
          console.log("[Python] Health monitor: port closed while process is live — watching for zombie-port (will kill in 60s if unrecovered).");
          return;
        }
        if (now - _portDownSince < PORT_DOWN_KILL_MS) return; // still within grace period
        console.warn("[Python] Health monitor: zombie-port detected — process alive but port closed for >60s; force-killing to trigger restart…");
        _portDownSince = null;
        setPythonRestarting(true);
        pythonProcess.kill("SIGKILL");
        // exit event on pythonProcess will fire spawnPython() + warm pass via the
        // normal crash-restart path in spawnPython()'s on("exit") handler.
        return;
      }
      _portDownSince = null;
      console.log("[Python] Health monitor: server is down — restarting...");
      setPythonRestarting(true);
      spawnPython();
      waitForModelReady(180_000).then((ready) => {
        if (ready) fireWarmPass().catch(() => {});
        else { console.warn("[Python] Model not ready after monitor-triggered restart"); setPythonRestarting(false); }
      });
      return;
    }

    if (status === "hung") {
      _portDownSince = null;
      consecutiveHungProbes++;
      if (pythonProcess) {
        // We own the process — wait for MAX_HUNG_PROBES_OWNED consecutive
        // failures before committing to a SIGKILL.  A single probe failure
        // is routinely caused by host-maintenance pauses (≤18 s) or Python
        // GC spikes (≤25 s) on reserved VMs; killing immediately turns
        // every brief pause into a 3-5 min cold restart.
        if (consecutiveHungProbes < MAX_HUNG_PROBES_OWNED) {
          console.warn(
            `[Python] Health monitor: server is HUNG — probe ${consecutiveHungProbes}/${MAX_HUNG_PROBES_OWNED}; waiting for next cycle before acting.`,
          );
          return;
        }
        console.warn("[Python] Health monitor: server is HUNG — force-killing owned process…");
        setPythonRestarting(true);
        pythonProcess.kill("SIGKILL");
        consecutiveHungProbes = 0;
      } else {
        // We don't own the process (api-server restarted and found Python already
        // running — "monitoring only" mode).  We track consecutive hung probes.
        // After MAX_HUNG_PROBES_UNOWNED we resort to pkill so the next "down"
        // poll spawns a clean one.  We do NOT call setPythonRestarting(true)
        // here because there is no restart cycle to release it — that would hold
        // all requests permanently.  Instead pass requests through and let the
        // circuit breaker surface individual 5xx errors during the hang window.
        console.warn(
          `[Python] Hung unowned process — probe ${consecutiveHungProbes}/${MAX_HUNG_PROBES_UNOWNED}; ` +
          `circuit breaker handling per-request errors until Python recovers.`
        );
        if (consecutiveHungProbes >= MAX_HUNG_PROBES_UNOWNED) {
          console.warn("[Python] Hung threshold reached — force-killing unowned process via pkill…");
          consecutiveHungProbes = 0;
          // pkill -9 -f matches against the full command line; targets server.py
          // specifically so we don't hit any other Python processes.
          const { execFile } = await import("child_process");
          execFile("pkill", ["-9", "-f", "server\\.py"], (err) => {
            if (err && (err as NodeJS.ErrnoException).code !== 1) {
              // exit code 1 = no matching process (already dead); any other error is real
              console.warn(`[Python] pkill failed: ${err.message}`);
            } else {
              console.log("[Python] Force-killed hung unowned server.py process — health monitor will respawn.");
            }
          });
        }
      }
    }
  }, HEALTH_POLL_INTERVAL_MS);
  healthTimer.unref();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function ensurePythonServer(): Promise<void> {
  if (PYTHON_SPAWN_DISABLED) {
    console.log(
      `[Python] DISABLE_PYTHON_SPAWN=1 — proxy-only mode, waiting for Python on port ${PYTHON_PORT}…`,
    );
    const alreadyUp = await pollUntilOpen(PYTHON_PORT, 60_000);
    if (!alreadyUp) {
      console.warn(`[Python] Proxy-only: port ${PYTHON_PORT} not yet open — requests will be retried by circuit breaker.`);
    } else {
      console.log(`[Python] AI training server ready on port ${PYTHON_PORT}`);
    }
    return;
  }

  const alreadyUp = await pollUntilOpen(PYTHON_PORT, 6_000);

  if (alreadyUp) {
    console.log(`[Python] AI training server already running on port ${PYTHON_PORT} — monitoring only.`);
  } else {
    spawnPython();
    try {
      await waitForPort(PYTHON_PORT, 45_000);
      consecutiveCrashes = 0;
      console.log(`[Python] AI training server ready on port ${PYTHON_PORT}`);
    } catch {
      console.error("[Python] Warning: server did not respond in time — requests will be retried by proxy.");
    }
  }

  startHealthMonitor();

  // ── Production warm-up pass ───────────────────────────────────────────────
  // Hold incoming user requests until the model is fully hot so the first real
  // request never hits a cold KV-cache or uncompiled kernel path.
  // setPythonRestarting(true) parks requests at the proxy hold-queue;
  // fireWarmPass() clears it via setPythonRestarting(false) on completion
  // (success or failure) so requests are never held indefinitely.
  // Runs in background — never blocks startKeepalive() or worker fork.
  setPythonRestarting(true);
  waitForModelReady(180_000).then((ready): Promise<void> | void => {
    if (ready) {
      return fireWarmPass();
    }
    console.warn("[Python] Model did not become ready within 3 min — warm pass skipped; keepalive will retry on next deep-warm cycle");
    setPythonRestarting(false);
  }).catch(() => { setPythonRestarting(false); });
}

export function stopPythonServer() {
  shuttingDown = true;
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  if (pythonProcess) {
    console.log("[Python] Stopping AI training server...");
    pythonProcess.kill("SIGTERM");
    pythonProcess = null;
  }
}
