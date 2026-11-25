import fs from "node:fs";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

function portFromEnv(env, name, fallback) {
  const value = Number(env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be a valid TCP/UDP port`);
  }
  return value;
}

export function configuredPortSpecs(env = process.env) {
  // Development must keep the preview available while optional subsystems
  // (notably trained-model readiness) are degraded. Use liveness there; keep
  // production's stricter readiness contract unchanged.
  const useDevelopmentLiveness =
    env.NODE_ENV !== "production" && env.MAXBOOSTER_DEV_PORTS === "1";
  return [
    { name: "authoritative DNS", port: portFromEnv(env, "DNS_AUTHORITY_PORT", 53), udp: true },
    {
      name: "web application",
      port: portFromEnv(env, "PORT", 5000),
      httpPath: useDevelopmentLiveness ? "/api/health" : "/ready",
    },
    { name: "local DNS node", port: portFromEnv(env, "DNS_NODE_LOCAL_PORT", 5353), udp: true },
    {
      name: "DNS API",
      port: portFromEnv(env, "DNS_API_PORT", 8080),
      httpPath: "/ready",
    },
    {
      name: "local DNS health",
      port: portFromEnv(env, "DNS_NODE_LOCAL_HEALTH_PORT", 5380),
      httpPath: "/health",
    },
    { name: "PDIM", port: portFromEnv(env, "LOCAL_PDIM_PORT", 5556) },
    {
      name: "MaxCore diffusion gateway",
      port: portFromEnv(env, "VIDEO_DIFFUSION_PORT", 8008),
      httpPath: "/health",
    },
    {
      name: "MaxCore API",
      port: portFromEnv(env, "MAXCORE_LOCAL_PORT", 8090),
      httpPath: "/healthz",
    },
    { name: "BoosterState", port: portFromEnv(env, "BOOSTERSTATE_SIDECAR_PORT", 9877) },
    {
      name: "MaxCore model API",
      port: portFromEnv(env, "MODEL_API_PORT", 9878),
      httpPath: useDevelopmentLiveness ? "/api/health" : "/api/ready",
    },
    {
      name: "MaxCore model health",
      port: portFromEnv(env, "MODEL_API_HEALTH_PORT", 9879),
      httpPath: "/healthz",
    },
    {
      name: "MaxCore proxy sidecar",
      port: portFromEnv(env, "PYTHON_AI_PORT", 9880),
      httpPath: "/health",
    },
  ];
}

export function pidIsRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const commandEnd = stat.lastIndexOf(")");
    const state = stat.slice(commandEnd + 2, commandEnd + 3);
    return state !== "Z" && state !== "X";
  } catch {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error?.code === "EPERM";
    }
  }
}

export function tcpReachable(port, host = "127.0.0.1", timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export function udpBound(port, tablePaths = ["/proc/net/udp", "/proc/net/udp6"]) {
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  return tablePaths.some((tablePath) => {
    try {
      return fs.readFileSync(tablePath, "utf8").split("\n").slice(1).some((line) => {
        const columns = line.trim().split(/\s+/);
        if (columns.length < 4) return false;
        const localPort = columns[1].split(":").at(-1)?.toUpperCase();
        return localPort === hexPort && columns[3] === "07";
      });
    } catch {
      return false;
    }
  });
}

export async function httpHealthy(port, path = "/health", timeoutMs = 500) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    const healthy = response.status === 200;
    await response.body?.cancel();
    return healthy;
  } catch {
    return false;
  }
}

export async function waitForConfiguredPorts(ports, {
  timeoutMs = 300_000,
  intervalMs = 500,
  tcpProbe = tcpReachable,
  udpProbe = udpBound,
  httpProbe = httpHealthy,
  processProbe = null,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let missing = [];
  let lastLog = 0;
  while (Date.now() <= deadline) {
    const checks = await Promise.all(ports.map(async (entry) => {
      const tcpOpen = await tcpProbe(entry.port);
      const udpOpen = !entry.udp || await udpProbe(entry.port);
      const httpOpen = !entry.httpPath ||
        await httpProbe(entry.port, entry.httpPath);
      return tcpOpen && udpOpen && httpOpen ? null : entry.name;
    }));
    missing = checks.filter(Boolean);
    if (processProbe && !(await processProbe())) {
      return { ready: false, missing, processExited: true };
    }
    if (missing.length === 0) return { ready: true, missing: [] };
    const now = Date.now();
    if (now - lastLog >= 10_000) {
      console.log(`[PortReadiness] waiting for: ${missing.join(", ")}`);
      lastLog = now;
    }
    await delay(Math.min(intervalMs, Math.max(0, deadline - now)));
  }
  return { ready: false, missing };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const timeoutArg = process.argv.find((arg) => arg.startsWith("--timeout-ms="));
  const timeoutMs = timeoutArg ? Number(timeoutArg.split("=")[1]) : 300_000;
  const watchPidArg = process.argv.find((arg) => arg.startsWith("--watch-pid="));
  const watchPid = watchPidArg ? Number(watchPidArg.split("=")[1]) : null;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    console.error("[PortReadiness] invalid --timeout-ms");
    process.exitCode = 2;
  } else if (watchPidArg && (!Number.isSafeInteger(watchPid) || watchPid < 1)) {
    console.error("[PortReadiness] invalid --watch-pid");
    process.exitCode = 2;
  } else {
    const ports = configuredPortSpecs();
    const result = await waitForConfiguredPorts(ports, {
      timeoutMs,
      ...(watchPid === null ? {} : { processProbe: () => pidIsRunning(watchPid) }),
    });
    if (result.ready) {
      console.log(`[PortReadiness] all ${ports.length} configured listeners are responding (including DNS UDP and HTTP checks)`);
    } else if (result.processExited) {
      console.error(
        `[PortReadiness] watched application process (pid ${watchPid}) exited before readiness; ` +
        `not listening: ${result.missing.join(", ") || "none"}`,
      );
      process.exitCode = 2;
    } else {
      console.error(`[PortReadiness] timed out; not listening: ${result.missing.join(", ")}`);
      process.exitCode = 1;
    }
  }
}
