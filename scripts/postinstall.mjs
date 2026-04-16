#!/usr/bin/env node
/**
 * Max Booster — post-install setup
 * Runs automatically after `npm install` / `npm ci`.
 *
 * Kept intentionally lightweight so it never blocks production deployments.
 * Heavy tasks (DB migrations, asset builds) are handled by the dedicated
 * build scripts in script/build.ts and the start-up sequence in server/index.ts.
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Skip everything when running inside CI or explicitly opted out
if (process.env.SKIP_POSTINSTALL === '1' || process.env.CI === 'true') {
  console.log('[postinstall] Skipping (SKIP_POSTINSTALL or CI=true).');
  process.exit(0);
}

// Warn if critical env vars are absent (non-fatal — server handles this at boot)
const recommended = ['NEON_DATABASE_URL', 'STRIPE_SECRET_KEY', 'SENDGRID_API_KEY'];
const missing = recommended.filter(k => !process.env[k]);
if (missing.length) {
  console.warn(`[postinstall] Note: the following env vars are not set yet: ${missing.join(', ')}`);
  console.warn('[postinstall] They must be configured before starting the server.');
}

// Confirm the server entry point exists so a bad build is caught early
const serverEntry = join(root, 'server', 'index.ts');
if (!existsSync(serverEntry)) {
  console.error('[postinstall] ERROR: server/index.ts not found — installation may be incomplete.');
  process.exit(1);
}

console.log('[postinstall] Max Booster dependencies installed successfully.');
