import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { requireAuthOnly } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { handleGeneration } from '../services/multimodalGenerationService.js';
import {
  type GenerationRequest,
  type Platform,
  type PackId,
  PACK_DEFINITIONS,
} from '@shared/types/multimodalGeneration.js';
import { PLATFORM_RULES } from '@shared/config/platformRules.js';

const router = Router();

const VALID_PLATFORMS = new Set<Platform>([
  'facebook', 'instagram', 'threads', 'tiktok', 'youtube', 'google_business', 'linkedin', 'twitter',
]);

const VALID_PACKS = new Set<PackId>(
  Object.keys(PACK_DEFINITIONS) as PackId[]
);

// POST /api/multimodal/generate
// Full multimodal content generation: normalise → plan → workers → package
router.post('/generate', requireAuthOnly, async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<GenerationRequest> & { userId?: string };
    const userId: string = (req as any).user?.id || body.userId || '';

    if (!body.input?.payload) {
      return res.status(400).json({ error: 'input.payload is required' });
    }
    if (!Array.isArray(body.platforms) || body.platforms.length === 0) {
      return res.status(400).json({ error: 'platforms array is required and must not be empty' });
    }

    const platforms = body.platforms.filter(p => VALID_PLATFORMS.has(p as Platform)) as Platform[];
    if (platforms.length === 0) {
      return res.status(400).json({
        error: `No valid platforms. Accepted: ${[...VALID_PLATFORMS].join(', ')}`,
      });
    }

    const packId = body.packId && VALID_PACKS.has(body.packId as PackId)
      ? body.packId as PackId
      : undefined;

    const genRequest: GenerationRequest = {
      id: body.id || randomUUID(),
      userId,
      artistProfileId: body.artistProfileId,
      input: {
        modality: body.input.modality || 'text',
        payload: body.input.payload,
        metadata: body.input.metadata,
      },
      platforms,
      packId,
      intent: body.intent,
      constraints: body.constraints,
    };

    const pkg = await handleGeneration(genRequest);
    return res.json(pkg);
  } catch (err: any) {
    logger.error('[POST /multimodal/generate]', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

// GET /api/multimodal/platform-rules  — return all platform rules (for maxcore and frontend)
router.get('/platform-rules', requireAuthOnly, (_req: Request, res: Response) => {
  return res.json({ platformRules: PLATFORM_RULES });
});

// GET /api/multimodal/platform-rules/:platform  — rules for a single platform
router.get('/platform-rules/:platform', requireAuthOnly, (req: Request, res: Response) => {
  const platform = req.params.platform as Platform;
  const rules = PLATFORM_RULES[platform];
  if (!rules) {
    return res.status(404).json({ error: `Unknown platform: ${platform}` });
  }
  return res.json({ platform, rules });
});

// GET /api/multimodal/packs  — list available pack definitions
router.get('/packs', requireAuthOnly, (_req: Request, res: Response) => {
  const packs = Object.entries(PACK_DEFINITIONS).map(([id, slots]) => ({
    id,
    slotCount: slots.length,
    platforms: [...new Set(slots.map(s => s.platform))],
    modalities: [...new Set(slots.map(s => s.modality))],
    slots: slots.map(s => ({ id: s.id, platform: s.platform, modality: s.modality, purpose: s.purpose })),
  }));
  return res.json({ packs });
});

export default router;
