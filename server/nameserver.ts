/**
 * Max Booster — Standalone Authoritative Nameserver Entry Point
 *
 * Runs ONLY the DNS server (UDP + TCP on DNS_PORT).
 * No HTTP routes, no job queues, no background workers.
 * Designed to run as an independent process alongside the main app
 * so ns1 and ns2 are separate OS processes — true redundancy on the same host,
 * and easy to move to a separate VPS later.
 *
 * Usage:
 *   DNS_PORT=5354 DNS_SERVER_ROLE=ns2 tsx server/nameserver.ts
 */

import 'dotenv/config';
import { logger } from './logger.js';
import { startDNSServer, isDNSRunning, getQueryCount } from './services/dnsServer.js';

const ROLE    = process.env.DNS_SERVER_ROLE || 'ns1';
const PORT    = parseInt(process.env.DNS_PORT || '5353', 10);
const BASE    = process.env.BASE_DOMAIN      || 'max-booster.com';
const HEALTH_INTERVAL_MS = 60_000;

async function main() {
  logger.info(`[${ROLE}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  logger.info(`[${ROLE}] Max Booster Nameserver — role=${ROLE} port=${PORT} zone=${BASE}`);
  logger.info(`[${ROLE}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  await startDNSServer();

  if (!isDNSRunning()) {
    logger.error(`[${ROLE}] ❌ DNS server failed to start on port ${PORT}. Exiting.`);
    process.exit(1);
  }

  logger.info(`[${ROLE}] ✅ Nameserver online — ${BASE} UDP+TCP :${PORT}`);

  // Periodic health log so Replit workflow console shows it's alive
  setInterval(() => {
    const qc = getQueryCount();
    logger.info(`[${ROLE}] 💓 alive — queries served: ${qc}`);
  }, HEALTH_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = (sig: string) => {
    logger.info(`[${ROLE}] Received ${sig} — shutting down`);
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  logger.error({ err }, '[nameserver] Fatal startup error');
  process.exit(1);
});
