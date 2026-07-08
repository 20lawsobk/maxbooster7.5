/**
 * PDIM credential reconciliation.
 *
 * PDIM_BEARER_TOKEN / PDIM_EXEC_TOKEN are stale secrets — the PDIM instance
 * at PDIM_EXEC_URL / PDIM_HTTP_EXEC_URL now rejects them with
 * `403 WRONGPASS Invalid token for this instance`, even though the PDIM
 * server itself is up and reachable.
 *
 * STORAGE_HTTP_URL points at the SAME instance (verified: identical host +
 * instance id) and STORAGE_BEARER_TOKEN is the CURRENT, valid token for it
 * (verified via a direct PING against the instance).
 *
 * Every PDIM call site across the codebase reads PDIM_EXEC_URL /
 * PDIM_HTTP_EXEC_URL / PDIM_EXEC_TOKEN / PDIM_BEARER_TOKEN /
 * POCKET_DIMENSION_KEY directly from process.env, so rather than touch every
 * call site we reconcile process.env once, here, before any other module
 * that reads these vars is loaded. This file MUST be the first import in
 * server/index.ts.
 */
import { logger } from "../logger.js";

function reconcilePdimCredentials(): void {
  const storageUrl = process.env.STORAGE_HTTP_URL;
  const storageToken = process.env.STORAGE_BEARER_TOKEN;

  if (!storageUrl || !storageToken) {
    return; // nothing to reconcile against
  }

  const staleUrl =
    process.env.PDIM_EXEC_URL || process.env.PDIM_HTTP_EXEC_URL;
  const staleToken =
    process.env.PDIM_EXEC_TOKEN ||
    process.env.PDIM_BEARER_TOKEN ||
    process.env.POCKET_DIMENSION_KEY;

  // Same instance (URL matches) but a different token value → the PDIM_*
  // token is stale relative to the working STORAGE_* credentials.
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

reconcilePdimCredentials();
