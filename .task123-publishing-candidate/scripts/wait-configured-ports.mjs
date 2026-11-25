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
  return [
    { name: "authoritative DNS", port: portFromEnv(env, "DNS_AUTHORITY_PORT", 53), udp: true },
    { name: "web application", port: portFromEnv(env, "PORT", 5000) },
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
    { name: "MaxCore diffusion gateway", port: portFromEnv(env, "VIDEO_DIFFUSION_PORT", 8008) },
    { name: "MaxCore API", port: portFromEnv(env, "MAXCORE_LOCAL_PORT", 8090) },
    { name: "BoosterState", port: portFromEnv(env, "BOOSTERSTATE_SIDECAR_PORT", 9877) },
    { name: "MaxCore model API", port: portFromEnv(env, "MODEL_API_PORT", 9878) },
    { name: "MaxCore model health", port: portFromEnv(env, "MODEL_API_HEALTH_PORT", 9879) },
    { name: "MaxCore proxy sidecar", port: portFromEnv(env, "PYTHON_AI_PORT", 9880) },
  ];
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
    return response.status === 200;
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
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    console.error("[PortReadiness] invalid --timeout-ms");
    process.exitCode = 2;
  } else {
    const ports = configuredPortSpecs();
    const result = await waitForConfiguredPorts(ports, { timeoutMs });
    if (result.ready) {
      console.log(`[PortReadiness] all ${ports.length} configured listeners are ready (including DNS UDP and HTTP health checks)`);
    } else {
      console.error(`[PortReadiness] timed out; not listening: ${result.missing.join(", ")}`);
      process.exitCode = 1;
    }
  }
}
