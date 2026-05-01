/**
 * Creative Model Routes
 *
 * Exposes the AdvancedCreativeModel pipeline (ported from Python) as REST endpoints.
 *
 * Mounted at: /api/content/creative-model
 *
 * POST /generate      — Full 7-stage pipeline: music analysis → plan → keyframes
 *                       → alignment → video assembly → scoring → feedback
 * POST /plan          — Planning only: music analysis + plan + script (no media)
 * POST /score         — Engagement scoring only (no media generation)
 * POST /feedback      — Ingest real post metrics back into the learning system
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import {
  generateCreativePackage,
  planCreative,
  scoreCreative,
  submitFeedback,
  type CreativeBrief,
  type CreativePlan,
  type EngagementScores,
} from '../services/creativeModelService.js';

const router = Router();

function requireAuth(req: Request, res: Response): number | null {
  const userId = (req.session as any)?.userId ?? (req.user as any)?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return Number(userId);
}

function parseBrief(body: any): CreativeBrief | string {
  const { domain, platform, goal, tone, offer, callToAction, keyMessages, style } = body;
  if (!platform) return 'platform is required';
  if (!offer) return 'offer is required';
  return {
    domain: domain ?? 'music',
    platform,
    goal: goal ?? 'awareness',
    tone: tone ?? 'high_energy',
    offer,
    callToAction: callToAction ?? body.call_to_action ?? 'Learn more',
    keyMessages: Array.isArray(keyMessages)
      ? keyMessages
      : Array.isArray(body.key_messages)
        ? body.key_messages
        : [],
    style: style ?? {},
  };
}

// ─── POST /generate ───────────────────────────────────────────────────────────

router.post('/generate', async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const brief = parseBrief(req.body);
  if (typeof brief === 'string') {
    return res.status(400).json({ error: brief });
  }

  const audioPath: string = req.body.audioPath ?? req.body.audio_path ?? '';
  const assetId: string | undefined = req.body.assetId ?? req.body.asset_id;

  try {
    const pkg = await generateCreativePackage({ brief, audioPath, userId, assetId });
    res.json({ success: true, data: pkg });
  } catch (err: any) {
    logger.warn('[CreativeModel] /generate error', { err });
    res.status(500).json({ error: 'Creative generation failed', detail: err?.message });
  }
});

// ─── POST /plan ───────────────────────────────────────────────────────────────

router.post('/plan', async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const brief = parseBrief(req.body);
  if (typeof brief === 'string') {
    return res.status(400).json({ error: brief });
  }

  const audioPath: string = req.body.audioPath ?? req.body.audio_path ?? '';

  try {
    const result = await planCreative(brief, audioPath);
    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.warn('[CreativeModel] /plan error', { err });
    res.status(500).json({ error: 'Planning failed', detail: err?.message });
  }
});

// ─── POST /score ──────────────────────────────────────────────────────────────

router.post('/score', async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const brief = parseBrief(req.body);
  if (typeof brief === 'string') {
    return res.status(400).json({ error: brief });
  }

  const plan: CreativePlan | undefined = req.body.plan;
  const MAX_SCRIPT_CHARS = 10_000;
  const script: string = (req.body.script ?? '').toString().slice(0, MAX_SCRIPT_CHARS);

  if (!plan || !Array.isArray(plan.beats)) {
    return res.status(400).json({ error: 'plan with beats array is required' });
  }

  try {
    const scores = await scoreCreative(brief, plan, script);
    res.json({ success: true, data: scores });
  } catch (err: any) {
    logger.warn('[CreativeModel] /score error', { err });
    res.status(500).json({ error: 'Scoring failed', detail: err?.message });
  }
});

// ─── POST /feedback ───────────────────────────────────────────────────────────

router.post('/feedback', async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { assetId, brief: rawBrief, scores: rawScores, metrics } = req.body;

  if (!assetId) {
    return res.status(400).json({ error: 'assetId is required' });
  }

  const brief = parseBrief(rawBrief ?? {});
  if (typeof brief === 'string') {
    return res.status(400).json({ error: `brief.${brief}` });
  }

  const scores: EngagementScores = {
    watchTimeScore: Number(rawScores?.watchTimeScore ?? 0.7),
    hookStrength: Number(rawScores?.hookStrength ?? 0.7),
    conversionScore: Number(rawScores?.conversionScore ?? 0.7),
  };

  try {
    await submitFeedback(assetId, userId, brief, scores, metrics ?? {});
    res.json({ success: true });
  } catch (err: any) {
    logger.warn('[CreativeModel] /feedback error', { err });
    res.status(500).json({ error: 'Feedback submission failed', detail: err?.message });
  }
});

export default router;
