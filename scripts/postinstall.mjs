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

// Confirm the server entry point exists so a bad install is caught early
const serverEntry = join(root, 'server', 'index.ts');
if (!existsSync(serverEntry)) {
  console.error('[postinstall] ERROR: server/index.ts not found — installation may be incomplete.');
  process.exit(1);
}

// Runtime env vars (NEON_DATABASE_URL, STRIPE_SECRET_KEY, etc.) are injected
// by the deployment platform at server start-up, not during npm install.
// No env var checks needed here.

console.log('[postinstall] Max Booster dependencies installed successfully.');
