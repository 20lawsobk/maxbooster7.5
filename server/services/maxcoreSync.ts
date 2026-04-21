/**
 * MaxCore Sync Service
 *
 * Manages the active connection between Max Booster and the MaxCore / PDIM
 * triangle:
 *
 *   1. Boot-time health probe — logs PDIM + MaxCore reachability on startup.
 *   2. Periodic weight sync — pulls updated base model states from MaxCore
 *      every 6 h and stores them in modelWeightStorage so per-user models
 *      are seeded with the latest trained intelligence.
 *   3. Training feedback push — pushes anonymised engagement signals to both
 *      MaxCore (/train/feedback) and the PDIM queue (mbs:training:feedback)
 *      so MaxCore can consume them on its own schedule.
 */

import { logger } from '../logger.js';
import { modelWeightStorage } from './modelWeightStorage.js';
import { getPdimClient, isPdimConfigured } from '../lib/pdimClient.js';

const AI_SERVER_URL  = process.env.AI_SERVER_URL   || '';
const AI_SERVER_KEY  = process.env.AI_SERVER_KEY   || '';
const PEER_NODE      = process.env.PEER_TRAINING_NODE || '';
const MBS_KEY        = process.env.MBS_AI_TRAINING_KEY || '';

// Sync every 10 minutes — aligned with the continuous training session cycle.
// Each training session takes ~10 real minutes and produces 10 simulated years
// of experience; pulling weights after each session keeps Max Booster models
// continuously up to date with the latest MaxCore-trained intelligence.
const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const HEALTH_TIMEOUT   = 6_000;
const INFER_TIMEOUT    = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchMaxCore<T = any>(
  endpoint: string,
  opts: { method?: string; body?: unknown; key?: string; timeout?: number } = {}
): Promise<{ ok: boolean; data: T | null; status?: number }> {
  const url = (opts.key === 'peer' ? PEER_NODE : AI_SERVER_URL);
  const key  = (opts.key === 'peer' ? MBS_KEY   : AI_SERVER_KEY);
  if (!url || !key) return { ok: false, data: null };
  try {
    const init: RequestInit = {
      method:  opts.method || 'GET',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
        'X-API-Key':     key,
      },
      signal: AbortSignal.timeout(opts.timeout ?? INFER_TIMEOUT),
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    const r = await fetch(`${url}${endpoint}`, init);
    if (!r.ok) return { ok: false, data: null, status: r.status };
    const text = await r.text().catch(() => null);
    if (!text) return { ok: false, data: null, status: r.status };
    // Guard against sleeping-Replit HTML pages that return HTTP 200 with HTML
    if (text.trimStart().startsWith('<')) {
      logger.debug(`[MaxCoreSync] ${endpoint} returned HTML — server waking up`);
      return { ok: false, data: null, status: r.status };
    }
    try {
      const data = JSON.parse(text) as T;
      return { ok: true, data, status: r.status };
    } catch {
      logger.debug(`[MaxCoreSync] ${endpoint} JSON parse failed — body: ${text.slice(0, 120)}`);
      return { ok: false, data: null, status: r.status };
    }
  } catch {
    return { ok: false, data: null };
  }
}

async function pdimRpush(key: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!isPdimConfigured()) return false;
  try {
    const client = getPdimClient();
    await (client as any).rpush(key, JSON.stringify({ ...payload, ts: Date.now() }));
    return true;
  } catch (err) {
    logger.warn(`[MaxCoreSync] PDIM rpush to ${key} failed:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Boot-time health probe
// ─────────────────────────────────────────────────────────────────────────────

async function probeConnectivity(): Promise<void> {
  // PDIM
  if (isPdimConfigured()) {
    try {
      const client = getPdimClient();
      await (client as any).ping();
      logger.info('[MaxCoreSync] PDIM ✅ reachable — Redis-compatible layer active');
    } catch (err) {
      logger.warn('[MaxCoreSync] PDIM ⚠️ ping failed:', err instanceof Error ? err.message : String(err));
    }
  } else {
    logger.warn('[MaxCoreSync] PDIM not configured — PDIM_HTTP_EXEC_URL / PDIM_BEARER_TOKEN missing');
  }

  // MaxCore inference node
  if (AI_SERVER_URL && AI_SERVER_KEY) {
    const { ok } = await fetchMaxCore('/api/health', { timeout: HEALTH_TIMEOUT });
    if (ok) {
      logger.info(`[MaxCoreSync] MaxCore inference ✅ reachable — ${AI_SERVER_URL}`);
    } else {
      logger.warn(`[MaxCoreSync] MaxCore inference ⚠️ unreachable — ${AI_SERVER_URL} (will retry on first inference request)`);
    }
  } else {
    logger.warn('[MaxCoreSync] MaxCore inference not configured — AI_SERVER_URL / AI_SERVER_KEY missing');
  }

  // Training peer node
  if (PEER_NODE && MBS_KEY) {
    const peerUrl = PEER_NODE.startsWith('pdim://') ? null : PEER_NODE;
    if (peerUrl) {
      const { ok } = await fetchMaxCore('/api/health', { key: 'peer', timeout: HEALTH_TIMEOUT });
      if (ok) {
        logger.info(`[MaxCoreSync] Training peer ✅ reachable — ${PEER_NODE}`);
      } else {
        logger.warn(`[MaxCoreSync] Training peer ⚠️ unreachable — ${PEER_NODE}`);
      }
    } else {
      logger.info(`[MaxCoreSync] Training peer — PDIM-bus mode (pdim://…) — no HTTP health check needed`);
    }
  } else {
    logger.warn('[MaxCoreSync] Training peer not configured — PEER_TRAINING_NODE / MBS_AI_TRAINING_KEY missing');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Weight sync — pull trained base states from MaxCore
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_ENDPOINTS: Array<{ name: string; endpoint: string }> = [
  { name: 'social_base',       endpoint: '/api/models/social/state'       },
  { name: 'advertising_base',  endpoint: '/api/models/advertising/state'  },
  { name: 'content_base',      endpoint: '/api/models/content/state'      },
  { name: 'engagement_base',   endpoint: '/api/models/engagement/state'   },
];

async function syncWeightsFromMaxCore(): Promise<void> {
  if (!AI_SERVER_URL || !AI_SERVER_KEY) {
    logger.debug('[MaxCoreSync] Weight sync skipped — MaxCore not configured');
    return;
  }

  logger.info('[MaxCoreSync] Starting weight sync from MaxCore…');
  let updated = 0;
  let skipped = 0;

  for (const { name, endpoint } of MODEL_ENDPOINTS) {
    // Retry up to 3 times — the MaxCore server may be sleeping (returns HTML
    // with HTTP 200) and needs a moment to wake up between attempts.
    let result: { ok: boolean; data: Record<string, unknown> | null; status?: number } =
      { ok: false, data: null };
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await fetchMaxCore<Record<string, unknown>>(endpoint, { timeout: 15_000 });
      if (result.ok && result.data) break;
      if (attempt < 3) {
        logger.debug(
          `[MaxCoreSync] ${name} attempt ${attempt} failed (status: ${result.status ?? 'no-response'}) — retrying in 15s`
        );
        await new Promise(r => setTimeout(r, 15_000));
      }
    }

    const { ok, data } = result;
    if (!ok || !data) {
      skipped++;
      logger.debug(
        `[MaxCoreSync] ${name}: no state after 3 attempts (status: ${result.status ?? 'no-response'}) — server sleeping or endpoint unavailable`
      );
      continue;
    }

    try {
      await modelWeightStorage.save(name, {
        ...(data as object),
        syncedFromMaxCore: true,
        syncedAt: new Date().toISOString(),
      });
      updated++;
      logger.info(`[MaxCoreSync] ${name} ✅ synced from MaxCore (${Object.keys(data).length} keys)`);
    } catch (err) {
      logger.warn(`[MaxCoreSync] ${name} save failed:`, err instanceof Error ? err.message : String(err));
      skipped++;
    }
  }

  logger.info(`[MaxCoreSync] Weight sync complete — updated: ${updated}, skipped/unavailable: ${skipped}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Training feedback push
// ─────────────────────────────────────────────────────────────────────────────

export interface TrainingFeedbackPayload {
  content:         string;   // The actual post text — required by MaxCore
  source:          string;
  trigger:         string;
  engagement_rate: number;
  platform:        string;
  content_type:    string;
  hook_type:       string;
  media_type:      string;
  curriculum_hint: string;
  dispatched_at:   string;
}

/**
 * Push a training feedback signal to both MaxCore (HTTP) and PDIM (queue).
 * Called by autopilotLearningService when a post achieves high engagement.
 */
export async function pushTrainingFeedback(payload: TrainingFeedbackPayload): Promise<void> {
  const enriched = { ...payload, source_node: 'maxbooster', version: '1.0' };

  // HTTP push to training peer (with auth)
  const peerIsPdim = PEER_NODE.startsWith('pdim://');
  if (PEER_NODE && MBS_KEY && !peerIsPdim) {
    try {
      const r = await fetch(`${PEER_NODE}/api/train/feedback`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${MBS_KEY}`,
          'X-API-Key':     MBS_KEY,
        },
        body:   JSON.stringify(enriched),
        signal: AbortSignal.timeout(5_000),
      });
      if (r.ok) {
        logger.info(
          `[MaxCoreSync] Training feedback sent — ${payload.platform} ` +
          `${payload.content_type} at ${payload.engagement_rate.toFixed(2)}% engagement`
        );
      } else {
        logger.warn(`[MaxCoreSync] Training peer returned ${r.status} — queuing to PDIM`);
      }
    } catch {
      logger.warn('[MaxCoreSync] Training peer unreachable — queuing to PDIM');
    }
  }

  // PDIM queue push (durable, MaxCore picks up on its schedule)
  await pdimRpush('mbs:training:feedback', enriched);

  // Also notify inference server if different from training peer
  if (AI_SERVER_URL && AI_SERVER_KEY && AI_SERVER_URL !== PEER_NODE) {
    fetchMaxCore('/api/train/feedback', {
      method:  'POST',
      body:    enriched,
      timeout: 3_000,
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// On-demand sync (called by baseModelTrainer before synthetic seeding)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull model weights from MaxCore immediately (no timer — used at training
 * boot time so MaxCore weights are present before local fallback runs).
 * Returns the number of models successfully synced.
 */
export async function syncWeightsNow(): Promise<number> {
  if (!AI_SERVER_URL || !AI_SERVER_KEY) return 0;
  let updated = 0;
  for (const { name, endpoint } of MODEL_ENDPOINTS) {
    const result = await fetchMaxCore<Record<string, unknown>>(endpoint, { timeout: 20_000 });
    if (!result.ok || !result.data) continue;
    try {
      await modelWeightStorage.save(name, {
        ...(result.data as object),
        syncedFromMaxCore: true,
        syncedAt: new Date().toISOString(),
      });
      logger.info(`[MaxCoreSync] ${name} ✅ eagerly synced from MaxCore`);
      updated++;
    } catch { /* non-critical */ }
  }
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let _syncTimer: NodeJS.Timeout | null = null;

export async function initMaxCoreSync(): Promise<void> {
  // 1. Health probe (non-blocking — don't hold up server startup)
  probeConnectivity().catch(err =>
    logger.warn('[MaxCoreSync] Connectivity probe error:', err instanceof Error ? err.message : String(err))
  );

  // 2. Initial weight sync after 2 minutes — the health probe above wakes up the
  //    MaxCore server; we need to give it enough time to become ready before
  //    syncing weights (sleeping Replit apps take 30-90s to wake up).
  setTimeout(() => {
    syncWeightsFromMaxCore().catch(err =>
      logger.warn('[MaxCoreSync] Initial weight sync error:', err instanceof Error ? err.message : String(err))
    );
  }, 120_000);

  // 3. Periodic weight sync every 6 hours
  _syncTimer = setInterval(() => {
    syncWeightsFromMaxCore().catch(err =>
      logger.warn('[MaxCoreSync] Periodic weight sync error:', err instanceof Error ? err.message : String(err))
    );
  }, SYNC_INTERVAL_MS);

  logger.info('[MaxCoreSync] Initialized — health probe running, weight sync scheduled every 10 min (aligned with 10-min training sessions)');
}

export function stopMaxCoreSync(): void {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
}
