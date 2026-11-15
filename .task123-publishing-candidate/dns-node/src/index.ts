/**
 * dns-node — Standalone Authoritative Nameserver Entry Point.
 *
 * Wires together zone, DNSSEC, GeoDNS, DNS server, and health HTTP.
 * Runs as a completely self-contained process — no shared app code.
 *
 * Usage:
 *   DNS_PORT=5353 DNS_SERVER_ROLE=ns1 node dns-node/dist/index.js
 *   DNS_PORT=5354 DNS_SERVER_ROLE=ns2 node dns-node/dist/index.js
 *
 *   (or via tsx for development)
 *   DNS_PORT=5353 tsx dns-node/src/index.ts
 */

import "dotenv/config";

import { initZone, getDomain } from "./zone.js";
import { initDnssec } from "./dnssec.js";
import { warmGeoDb } from "./geodns.js";
import {
  startDnsServer,
  stopDnsServer,
  isDnsRunning,
  getQueryCount,
} from "./server.js";
import { startHealthServer } from "./health.js";

const ROLE = process.env.DNS_SERVER_ROLE || "ns1";
const PORT = parseInt(process.env.DNS_PORT || "5353");
const HEALTH = parseInt(process.env.HEALTH_PORT || "5380");
const DNSSEC_ENABLED = process.env.DNSSEC_ENABLED === "true";
const HEARTBEAT_MS = 60_000;

const BANNER = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Max Booster DNS Node — v3.0.0
  Role: ${ROLE.toUpperCase()}   Port: ${PORT}   Health: ${HEALTH}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

async function main() {
  console.log(BANNER);
  console.log(`[${ROLE}] Starting up...`);

  // 1. Load zone data
  await initZone();
  const domain = getDomain();
  console.log(`[${ROLE}] Zone: ${domain}`);

  // 2. Initialize DNSSEC
  if (DNSSEC_ENABLED) {
    initDnssec(domain);
    console.log(`[${ROLE}] DNSSEC: enabled (ECDSAP256SHA256)`);
  } else {
    console.log(
      `[${ROLE}] DNSSEC: disabled (set DNSSEC_ENABLED=true to enable)`,
    );
  }

  // 3. Warm GeoDNS database
  await warmGeoDb();

  // 4. Start DNS server (UDP + TCP)
  await startDnsServer();

  if (!isDnsRunning()) {
    console.error(
      `[${ROLE}] ❌ DNS server failed to start on :${PORT}. Exiting.`,
    );
    process.exit(1);
  }

  // 5. Start health + metrics HTTP server
  startHealthServer();

  console.log(
    `[${ROLE}] ✅ Online — ${domain} UDP+TCP :${PORT}  Health: :${HEALTH}`,
  );

  // 6. Heartbeat log
  setInterval(() => {
    console.log(
      `[${ROLE}] 💓 alive — queries=${getQueryCount()} uptime=${Math.floor(process.uptime())}s`,
    );
  }, HEARTBEAT_MS);

  // 7. Graceful shutdown
  const shutdown = (sig: string) => {
    console.log(`[${ROLE}] ${sig} received — shutting down`);
    stopDnsServer();
    process.exit(0);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    console.error(`[${ROLE}] Uncaught exception:`, err.message);
  });
  process.on("unhandledRejection", (reason) => {
    console.error(`[${ROLE}] Unhandled rejection:`, reason);
  });
}

main().catch((err) => {
  console.error("[dns-node] Fatal startup error:", err);
  process.exit(1);
});
