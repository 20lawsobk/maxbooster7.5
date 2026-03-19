/**
 * Internal Proxy Routes
 *
 * Exposes internal sidecar services (Python AI, etc.) through the main
 * application port (PORT) so the entire stack is reachable on one port.
 *
 * Security: requests must carry the BOOSTERSTATE_SECRET as a Bearer token.
 * This stops external callers from using the proxy — only in-process server
 * code (which reads the same env var) can call these routes.
 */
import { Router, Request, Response } from 'express';
import { logger } from '../logger.js';

const PYTHON_AI_PORT = parseInt(process.env.PYTHON_AI_PORT || '9878', 10);
const AI_SERVICE_TARGET = `http://127.0.0.1:${PYTHON_AI_PORT}`;
const INTERNAL_SECRET = process.env.BOOSTERSTATE_SECRET || '';

function checkInternalSecret(req: Request, res: Response): boolean {
  const auth = req.headers['authorization'];
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!INTERNAL_SECRET || provided !== INTERNAL_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

async function proxyTo(
  target: string,
  req: Request,
  res: Response,
  label: string,
): Promise<void> {
  const qs = Object.keys(req.query).length
    ? '?' + new URLSearchParams(req.query as Record<string, string>).toString()
    : '';
  const url = `${target}${req.path}${qs}`;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const opts: RequestInit = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      opts.body = JSON.stringify(req.body);
    }
    const upstream = await fetch(url, opts);
    const ct = upstream.headers.get('content-type') || 'application/json';
    res.status(upstream.status).setHeader('Content-Type', ct);
    if (ct.includes('application/json')) {
      res.json(await upstream.json());
    } else {
      res.send(await upstream.text());
    }
  } catch (err: any) {
    logger.debug(`[${label}] proxy → ${url} failed: ${err.message}`);
    res.status(503).json({ error: `${label} unavailable` });
  }
}

export const aiServiceProxyRouter = Router();

aiServiceProxyRouter.use((req: Request, res: Response) => {
  if (!checkInternalSecret(req, res)) return;
  proxyTo(AI_SERVICE_TARGET, req, res, 'PythonAI');
});

// BOOSTERSTATE_SIDECAR_PORT is the binary's actual internal listen port.
// BOOSTERSTATE_PORT may equal PORT when the one-port config is active; never use
// it here — that would proxy back to the main app and create a loop.
const BOOSTERSTATE_SIDECAR_PORT = parseInt(process.env.BOOSTERSTATE_SIDECAR_PORT || '9877', 10);
const BOOSTERSTATE_TARGET = `http://127.0.0.1:${BOOSTERSTATE_SIDECAR_PORT}`;

export const boosterstateProxyRouter = Router();

boosterstateProxyRouter.use((req: Request, res: Response) => {
  if (!checkInternalSecret(req, res)) return;
  proxyTo(BOOSTERSTATE_TARGET, req, res, 'Boosterstate');
});
