/**
 * tls-proxy — Entry Point
 *
 * Max Booster TLS SNI termination proxy.
 * Deploy on GCP instance 34.117.33.233.
 *
 * Required environment variables (see .env.example):
 *   DATABASE_URL          — Neon PostgreSQL connection string
 *   BACKEND_HOST          — Replit app hostname (e.g. maxbooster.replit.app)
 *   ACME_KEY_ENCRYPTION_KEY — (optional) 64 hex chars; falls back to platform_settings
 *
 * Run:
 *   node dist/index.js
 *   DNS_PORT=53 HEALTH_PORT=8080 node dist/index.js
 */

import 'dotenv/config';
import { startProxy } from './sniProxy.js';

const VERSION = '1.0.0';

const BANNER = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Max Booster TLS SNI Proxy  v${VERSION}
  Port  : ${process.env.PROXY_PORT  || '443'}
  Backend: ${process.env.BACKEND_HOST || 'maxbooster.replit.app'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

async function main(): Promise<void> {
  console.log(BANNER);

  if (!process.env.DATABASE_URL) {
    console.error('[fatal] DATABASE_URL is required');
    process.exit(1);
  }

  if (!process.env.BACKEND_HOST) {
    console.warn('[warn] BACKEND_HOST not set — defaulting to maxbooster.replit.app');
    console.warn('[warn] Make sure this is NOT max-booster.com or a loop will occur!');
  }

  try {
    await startProxy();
    console.log('[proxy] Ready');
  } catch (err) {
    console.error('[fatal] Failed to start proxy:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
