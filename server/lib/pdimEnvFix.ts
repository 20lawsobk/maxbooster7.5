/**
 * PDIM credential reconciliation.
 *
 * Problem: token drift.
 *   PDIM_BEARER_TOKEN / PDIM_EXEC_TOKEN may be stale — the PDIM instance now
 *   rejects them with `403 WRONGPASS`.  STORAGE_HTTP_URL points at the SAME
 *   instance and STORAGE_BEARER_TOKEN is the current, valid token for it.
 *   We overwrite all PDIM_* vars with the STORAGE_* pair once, before any
 *   call site reads them.
 *
 * This file MUST be the first import in server/index.ts.  Token reconciliation
 * runs synchronously so the corrected values are visible to every subsequent
 * module that initialises a PDIM client.
 */

import { logger } from "../logger.js";
import { loopbackUrl, runtimePorts } from "../config/ports.js";

// ── Local PDIM repoint ────────────────────────────────────────────────────────
// PDIM is an internal subsystem now (server/lib/localPdimServer.ts on :5556).
// Every PDIM/storage env var is repointed at the local exec endpoint BEFORE any
// client (including the MaxCore child, which inherits this env) reads them.
// Set PDIM_FORCE_REMOTE=1 to opt back into a remote instance.
if (process.env.PDIM_FORCE_REMOTE !== "1") {
  const LOCAL_EXEC_URL =
    `${loopbackUrl(runtimePorts.localPdim)}/api/redis/instances/local/exec`;
  const prev = process.env.STORAGE_HTTP_URL;
  process.env.STORAGE_HTTP_URL = LOCAL_EXEC_URL;
  process.env.PDIM_EXEC_URL = LOCAL_EXEC_URL;
  process.env.PDIM_HTTP_EXEC_URL = LOCAL_EXEC_URL;
  if (prev && prev !== LOCAL_EXEC_URL) {
    logger.info(
      `[PDIM] Repointed storage config to the internal PDIM subsystem (${LOCAL_EXEC_URL})`,
    );
  }
}

// ── Token reconciliation ───────────────────────────────────────────────────────

const storageUrl = process.env.STORAGE_HTTP_URL;
const storageToken = process.env.STORAGE_BEARER_TOKEN;

if (storageUrl && storageToken) {
  const staleUrl =
    process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL;
  const staleToken =
    process.env.PDIM_EXEC_TOKEN ||
    process.env.PDIM_BEARER_TOKEN ||
    process.env.POCKET_DIMENSION_KEY;

  const sameInstance = staleUrl === storageUrl;
  const tokenDiffers = staleToken !== storageToken;

  if (sameInstance && tokenDiffers) {
    process.env.PDIM_EXEC_URL = storageUrl;
    process.env.PDIM_HTTP_EXEC_URL = storageUrl;
    process.env.PDIM_EXEC_TOKEN = storageToken;
    process.env.PDIM_BEARER_TOKEN = storageToken;
    process.env.POCKET_DIMENSION_KEY = storageToken;
    logger.info(
      "[PDIM] Reconciled stale PDIM_* credentials with working STORAGE_* token for the same instance",
    );
  }
}
