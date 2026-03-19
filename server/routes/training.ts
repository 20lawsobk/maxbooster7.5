import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

const _PORT = process.env.PORT || 5000;
const AI_URL = process.env.AI_MODEL_SERVICE_URL || `http://127.0.0.1:${_PORT}/api/ai-service`;
const TRAIN_TIMEOUT = 60_000;
const LONG_TIMEOUT  = 3_600_000;

const _INTERNAL_SECRET = process.env.BOOSTERSTATE_SECRET || '';
function internalAuthHeaders(): Record<string, string> {
  return _INTERNAL_SECRET ? { Authorization: `Bearer ${_INTERNAL_SECRET}` } : {};
}

async function proxyToAI(
  endpoint: string,
  method: 'GET' | 'POST',
  body?: unknown,
  timeoutMs = TRAIN_TIMEOUT
): Promise<{ ok: boolean; data: unknown; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AI_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json();
    return { ok: res.ok, data, status: res.status };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, data: { error: msg }, status: 503 };
  } finally {
    clearTimeout(timer);
  }
}

router.post('/start', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { mode = 'session', n_sessions = 3, phase_id } = req.body || {};
    const result = await proxyToAI('/train/start', 'POST', { mode, n_sessions, phase_id });
    res.status(result.ok ? 200 : result.status).json(result.data);
  } catch (err) {
    logger.error('[Training] /start error:', err);
    res.status(500).json({ error: 'Failed to start training' });
  }
});

router.post('/stop', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await proxyToAI('/train/stop', 'POST');
    res.status(result.ok ? 200 : result.status).json(result.data);
  } catch (err) {
    logger.error('[Training] /stop error:', err);
    res.status(500).json({ error: 'Failed to stop training' });
  }
});

router.get('/status', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await proxyToAI('/train/status', 'GET');
    res.status(result.ok ? 200 : result.status).json(result.data);
  } catch (err) {
    logger.error('[Training] /status error:', err);
    res.status(500).json({ error: 'Failed to get training status' });
  }
});

router.post('/session', requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const result = await proxyToAI('/train/session', 'POST', body, LONG_TIMEOUT);
    res.status(result.ok ? 200 : result.status).json(result.data);
  } catch (err) {
    logger.error('[Training] /session error:', err);
    res.status(500).json({ error: 'Failed to run training session' });
  }
});

router.get('/datasets', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await proxyToAI('/train/datasets', 'GET');
    res.status(result.ok ? 200 : result.status).json(result.data);
  } catch (err) {
    logger.error('[Training] /datasets error:', err);
    res.status(500).json({ error: 'Failed to get dataset stats' });
  }
});

router.get('/schedule', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await proxyToAI('/train/schedule', 'GET');
    res.status(result.ok ? 200 : result.status).json(result.data);
  } catch (err) {
    logger.error('[Training] /schedule error:', err);
    res.status(500).json({ error: 'Failed to get training schedule' });
  }
});

export default router;
