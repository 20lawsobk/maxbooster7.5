/**
 * Max Booster — HNS (Handshake) API Routes  (Build 3)
 *
 * REST API for Handshake name auction management.
 * All routes require authentication.
 *
 * GET  /api/hns/status              — hsd node status + balance
 * GET  /api/hns/name/:name          — name info + availability
 * GET  /api/hns/auctions            — list user's auctions
 * GET  /api/hns/auctions/:id        — auction detail
 * POST /api/hns/auctions            — open auction (start bidding process)
 * POST /api/hns/auctions/:id/bid    — place bid (during BIDDING period)
 * POST /api/hns/auctions/:id/reveal — reveal bid (during REVEAL period)
 * POST /api/hns/auctions/:id/register — register won name with NS records
 * POST /api/hns/auctions/:id/sync   — sync state from blockchain
 * GET  /api/hns/wallet              — wallet info + balance
 * GET  /api/hns/wallet/address      — get receive address for funding
 */

import { Router }    from 'express';
import { z }         from 'zod';
import { logger }    from '../logger.js';
import { hnsClient, hnsManager, hnsReady } from '../services/hns/index.js';

const router = Router();

function authRequired(req: Record<string, unknown>, res: Record<string, unknown>, next: Record<string, unknown>) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const ready = await hnsReady();
    if (!ready) {
      return res.json({
        ok:      false,
        message: 'HNS node not configured. Set HNS_HOST, HNS_PORT, HNS_API_KEY env vars.',
        configured: !!process.env.HNS_API_KEY,
      });
    }

    const [info, balance] = await Promise.all([
      hnsClient.getInfo(),
      hnsClient.getWalletBalance().catch(() => null),
    ]);

    res.json({
      ok:        true,
      network:   process.env.HNS_NETWORK || 'main',
      version:   info?.version,
      height:    info?.chain?.height,
      balance:   balance ? {
        confirmed:   (balance.confirmed   / 1_000_000).toFixed(6) + ' HNS',
        unconfirmed: (balance.unconfirmed / 1_000_000).toFixed(6) + ' HNS',
      } : null,
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] /status error');
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ── Name info ─────────────────────────────────────────────────────────────────
router.get('/name/:name', authRequired, async (req, res) => {
  try {
    const name = req.params.name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!name) return res.status(400).json({ error: 'Invalid name' });

    const [avail, resource] = await Promise.all([
      hnsClient.checkAvailability(name),
      hnsClient.getNameResource(name).catch(() => null),
    ]);

    res.json({ name, ...avail, resource });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] /name error');
    res.status(500).json({ error: err.message });
  }
});

// ── Auction list ──────────────────────────────────────────────────────────────
router.get('/auctions', authRequired, async (req, res) => {
  try {
    const userId = (req.user as Record<string, unknown>).id;
    const auctions = await hnsManager.listAuctions(userId);
    res.json({ auctions });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] list auctions error');
    res.status(500).json({ error: err.message });
  }
});

// ── Auction detail ────────────────────────────────────────────────────────────
router.get('/auctions/:id', authRequired, async (req, res) => {
  try {
    const userId  = (req.user as Record<string, unknown>).id;
    const auction = await hnsManager.getAuction(req.params.id, userId);
    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    res.json({ auction });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] get auction error');
    res.status(500).json({ error: err.message });
  }
});

// ── Open auction ──────────────────────────────────────────────────────────────
const openSchema = z.object({
  name:      z.string().min(1).max(63).regex(/^[a-z0-9-]+$/i),
  bidHNS:    z.number().positive().max(1_000_000),
  lockupHNS: z.number().positive().max(2_000_000),
}).refine(d => d.lockupHNS >= d.bidHNS, {
  message: 'lockupHNS must be >= bidHNS',
  path: ['lockupHNS'],
});

router.post('/auctions', authRequired, async (req, res) => {
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  try {
    const userId  = (req.user as Record<string, unknown>).id;
    const { name, bidHNS, lockupHNS } = parsed.data;
    const auction = await hnsManager.openAuction(userId, name, bidHNS, lockupHNS);
    res.status(201).json({ auction });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] open auction error');
    res.status(500).json({ error: err.message });
  }
});

// ── Place bid ─────────────────────────────────────────────────────────────────
router.post('/auctions/:id/bid', authRequired, async (req, res) => {
  try {
    const userId  = (req.user as Record<string, unknown>).id;
    const auction = await hnsManager.placeBid(req.params.id, userId);
    res.json({ auction });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] place bid error');
    res.status(500).json({ error: err.message });
  }
});

// ── Reveal bid ────────────────────────────────────────────────────────────────
router.post('/auctions/:id/reveal', authRequired, async (req, res) => {
  try {
    const userId  = (req.user as Record<string, unknown>).id;
    const auction = await hnsManager.revealBid(req.params.id, userId);
    res.json({ auction });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] reveal bid error');
    res.status(500).json({ error: err.message });
  }
});

// ── Register won name ─────────────────────────────────────────────────────────
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const registerSchema = z.object({
  ns1IP: z.string().regex(IPV4_RE, 'Invalid IPv4 address'),
  ns2IP: z.string().regex(IPV4_RE, 'Invalid IPv4 address'),
});

router.post('/auctions/:id/register', authRequired, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

  try {
    const userId  = (req.user as Record<string, unknown>).id;
    const { ns1IP, ns2IP } = parsed.data;
    const auction = await hnsManager.registerName(req.params.id, userId, ns1IP, ns2IP);
    res.json({ auction });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] register name error');
    res.status(500).json({ error: err.message });
  }
});

// ── Sync state ────────────────────────────────────────────────────────────────
router.post('/auctions/:id/sync', authRequired, async (req, res) => {
  try {
    const userId  = (req.user as Record<string, unknown>).id;
    const auction = await hnsManager.syncState(req.params.id, userId);
    res.json({ auction });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] sync state error');
    res.status(500).json({ error: err.message });
  }
});

// ── Wallet ────────────────────────────────────────────────────────────────────
router.get('/wallet', authRequired, async (req, res) => {
  try {
    const [info, balance] = await Promise.all([
      hnsClient.getWalletInfo(),
      hnsClient.getWalletBalance(),
    ]);
    res.json({
      wallet:  process.env.HNS_WALLET || 'primary',
      balance: {
        confirmed:   (balance.confirmed   / 1_000_000).toFixed(6) + ' HNS',
        unconfirmed: (balance.unconfirmed / 1_000_000).toFixed(6) + ' HNS',
      },
      info,
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] wallet error');
    res.status(500).json({ error: err.message });
  }
});

router.get('/wallet/address', authRequired, async (req, res) => {
  try {
    const address = await hnsClient.getReceiveAddress();
    res.json({ address, network: process.env.HNS_NETWORK || 'main' });
  } catch (err) {
    logger.warn({ err: err.message }, '[HNS] wallet address error');
    res.status(500).json({ error: err.message });
  }
});

export default router;
