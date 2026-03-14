#!/usr/bin/env node
/**
 * postinstall.mjs — runs after every `npm install`.
 * 1. Remove TensorFlow native symlinks that trip up the deployment image.
 * 2. Patch BullMQ worker to guard against PDIM returning a non-array from the
 *    moveStalledJobsToWait Lua script (PDIM doesn't implement Lua natively so
 *    the result is sometimes null/undefined instead of []).
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';

// ── 1. TensorFlow native binary cleanup ───────────────────────────────────
const TF_LIBS = [
  'node_modules/@tensorflow/tfjs-node/deps/lib/libtensorflow.so.2',
  'node_modules/@tensorflow/tfjs-node/deps/lib/libtensorflow_framework.so.2',
];
for (const lib of TF_LIBS) {
  if (existsSync(lib)) {
    try { rmSync(lib); console.log(`[postinstall] Removed ${lib}`); } catch {}
  }
}

// ── 2. BullMQ stalled.forEach → safe array guard ─────────────────────────
const BULLMQ_WORKER = 'node_modules/bullmq/dist/cjs/classes/worker.js';
if (existsSync(BULLMQ_WORKER)) {
  let src = readFileSync(BULLMQ_WORKER, 'utf8');
  const NEEDLE   = 'stalled.forEach((jobId)';
  const REPLACE  = '(Array.isArray(stalled) ? stalled : []).forEach((jobId)';
  if (src.includes(NEEDLE)) {
    src = src.replaceAll(NEEDLE, REPLACE);
    writeFileSync(BULLMQ_WORKER, src, 'utf8');
    console.log('[postinstall] Patched BullMQ worker: stalled.forEach → Array.isArray guard');
  } else if (src.includes(REPLACE)) {
    console.log('[postinstall] BullMQ worker already patched — skipping');
  } else {
    console.warn('[postinstall] BullMQ worker patch target not found — BullMQ version may have changed');
  }
}
