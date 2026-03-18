#!/usr/bin/env node
/**
 * postinstall.mjs — runs after every `npm install`.
 * 1. Remove TensorFlow native symlinks that trip up the deployment image.
 * 2. Patch BullMQ worker.js: guard stalled.forEach against non-array PDIM returns.
 * 3. Patch BullMQ lock-manager.js: guard erroredJobIds.includes against non-array
 *    returns from extendJobLocks Lua script (PDIM slow-response causes null return).
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

// ── 2. BullMQ worker.js: stalled.forEach → Array.isArray guard ───────────
const BULLMQ_WORKER = 'node_modules/bullmq/dist/cjs/classes/worker.js';
if (existsSync(BULLMQ_WORKER)) {
  let src = readFileSync(BULLMQ_WORKER, 'utf8');
  const NEEDLE  = 'stalled.forEach((jobId)';
  const REPLACE = '(Array.isArray(stalled) ? stalled : []).forEach((jobId)';
  if (src.includes(NEEDLE)) {
    src = src.replaceAll(NEEDLE, REPLACE);
    writeFileSync(BULLMQ_WORKER, src, 'utf8');
    console.log('[postinstall] Patched BullMQ worker.js: stalled.forEach → Array.isArray guard');
  } else if (src.includes(REPLACE)) {
    console.log('[postinstall] BullMQ worker.js already patched (stalled guard) — skipping');
  } else {
    console.warn('[postinstall] BullMQ worker.js: stalled patch target not found — BullMQ version may have changed');
  }
}

// ── 3. BullMQ lock-manager.js: erroredJobIds → Array.isArray guard ────────
// extendJobLocks() runs a Lua script via the PDIM LuaExecutor. When PDIM is
// slow and the script times out, it returns null/undefined instead of [].
// This causes "erroredJobIds.includes is not a function" (and .length throws
// before it). Guard both uses of erroredJobIds with an Array.isArray check.
const BULLMQ_LOCK_MANAGER = 'node_modules/bullmq/dist/cjs/classes/lock-manager.js';
if (existsSync(BULLMQ_LOCK_MANAGER)) {
  let src = readFileSync(BULLMQ_LOCK_MANAGER, 'utf8');
  let patched = false;

  // Patch 1: .length check  (line ~41): erroredJobIds.length → safeErroredJobIds.length
  // Patch 2: .includes check (line ~47): erroredJobIds.includes → safeErroredJobIds.includes
  // Approach: inject a safeErroredJobIds binding right after the await line.
  const AWAIT_LINE   = 'const erroredJobIds = await this.worker.extendJobLocks(jobIds, jobTokens, this.opts.lockDuration);';
  const SAFE_BINDING = 'const erroredJobIds = await this.worker.extendJobLocks(jobIds, jobTokens, this.opts.lockDuration);\n                const safeErroredJobIds = Array.isArray(erroredJobIds) ? erroredJobIds : [];';
  const LENGTH_CHECK  = 'if (erroredJobIds.length > 0)';
  const LENGTH_SAFE   = 'if (safeErroredJobIds.length > 0)';
  const EMIT_FAILED   = 'this.worker.emit(\'lockRenewalFailed\', erroredJobIds);';
  const EMIT_SAFE     = 'this.worker.emit(\'lockRenewalFailed\', safeErroredJobIds);';
  const FOR_ERRORED   = 'for (const jobId of erroredJobIds)';
  const FOR_SAFE      = 'for (const jobId of safeErroredJobIds)';
  const INCLUDES_CALL = '!erroredJobIds.includes(id)';
  const INCLUDES_SAFE = '!safeErroredJobIds.includes(id)';

  const alreadyPatched = src.includes('safeErroredJobIds');

  if (alreadyPatched) {
    console.log('[postinstall] BullMQ lock-manager.js already patched (erroredJobIds guard) — skipping');
  } else if (src.includes(AWAIT_LINE)) {
    src = src
      .replace(AWAIT_LINE,   SAFE_BINDING)
      .replace(LENGTH_CHECK, LENGTH_SAFE)
      .replace(EMIT_FAILED,  EMIT_SAFE)
      .replace(FOR_ERRORED,  FOR_SAFE)
      .replace(INCLUDES_CALL, INCLUDES_SAFE);
    writeFileSync(BULLMQ_LOCK_MANAGER, src, 'utf8');
    patched = true;
    console.log('[postinstall] Patched BullMQ lock-manager.js: erroredJobIds → safeErroredJobIds Array.isArray guard');
  } else {
    console.warn('[postinstall] BullMQ lock-manager.js: erroredJobIds patch target not found — BullMQ version may have changed');
  }
}
