import { Router } from 'express';
import { dmcaService } from '../services/dmcaService.js';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = Router();

const dmcaNoticeSchema = z.object({
  type: z.enum(['takedown', 'counter']),
  contentId: z.string().min(1),
  contentType: z.enum(['track', 'artwork', 'video', 'other']),
  claimantName: z.string().min(1),
  claimantEmail: z.string().email(),
  claimantAddress: z.string().min(1),
  claimantPhone: z.string().optional(),
  originalWorkUrl: z.string().url(),
  originalWorkDescription: z.string().optional(),
  infringingUrl: z.string().url().optional(),
  signature: z.string().min(1),
  goodFaithStatement: z.boolean(),
  accuracyStatement: z.boolean(),
  perjuryStatement: z.boolean(),
});

const counterNoticeSchema = z.object({
  originalNoticeId: z.string().min(1),
  claimantName: z.string().min(1),
  claimantEmail: z.string().email(),
  claimantAddress: z.string().min(1),
  counterNoticeReason: z.string().min(1),
  signature: z.string().min(1),
  goodFaithStatement: z.boolean(),
  perjuryStatement: z.boolean(),
});

router.post('/notice', async (req, res) => {
  try {
    const validated = dmcaNoticeSchema.parse(req.body);
    
    if (validated.type === 'counter') {
      return res.status(400).json({ error: 'Use /counter endpoint for counter-notifications' });
    }

    const notice = await dmcaService.submitNotice(validated);

    res.status(201).json({
      success: true,
      notice,
      message: 'DMCA notice submitted successfully. It will be reviewed within 24-48 hours.',
    });
  } catch (error: unknown) {
    logger.error('Error submitting DMCA notice:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to submit DMCA notice';
    res.status(500).json({ error: message });
  }
});

router.post('/counter', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validated = counterNoticeSchema.parse(req.body);
    const counterNotice = await dmcaService.submitCounterNotice(validated);

    res.status(201).json({
      success: true,
      notice: counterNotice,
      message: 'Counter-notification submitted. The original claimant has 10-14 business days to respond.',
    });
  } catch (error: unknown) {
    logger.error('Error submitting counter-notice:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to submit counter-notification';
    res.status(500).json({ error: message });
  }
});

router.get('/notices', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const notices = await dmcaService.getNoticesByUser(req.user.id);
    const strikeInfo = await dmcaService.getStrikeInfo(req.user.id);

    res.json({
      notices,
      strikes: strikeInfo,
    });
  } catch (error: unknown) {
    logger.error('Error fetching DMCA notices:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch DMCA notices';
    res.status(500).json({ error: message });
  }
});

router.get('/notices/:noticeId', async (req, res) => {
  try {
    const { noticeId } = req.params;
    const notice = await dmcaService.getNotice(noticeId);

    if (!notice) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    if (req.user && notice.contentOwnerId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(notice);
  } catch (error: unknown) {
    logger.error('Error fetching DMCA notice:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch DMCA notice';
    res.status(500).json({ error: message });
  }
});

router.get('/strikes', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const strikeInfo = await dmcaService.getStrikeInfo(req.user.id);

    res.json(strikeInfo);
  } catch (error: unknown) {
    logger.error('Error fetching strike info:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch strike information';
    res.status(500).json({ error: message });
  }
});

router.get('/admin/pending', async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pending = await dmcaService.getPendingNotices();

    res.json({ notices: pending });
  } catch (error: unknown) {
    logger.error('Error fetching pending notices:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch pending notices';
    res.status(500).json({ error: message });
  }
});

router.get('/admin/all', async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;

    const result = await dmcaService.getAllNotices({
      limit,
      offset,
      status: status as any,
    });

    res.json(result);
  } catch (error: unknown) {
    logger.error('Error fetching all notices:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch notices';
    res.status(500).json({ error: message });
  }
});

router.post('/admin/process/:noticeId', async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { noticeId } = req.params;
    const { action, notes } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject"' });
    }

    const notice = await dmcaService.processNotice(noticeId, req.user.id, action, notes);

    res.json({
      success: true,
      notice,
      message: `Notice ${action}d successfully`,
    });
  } catch (error: unknown) {
    logger.error('Error processing notice:', error);
    const message = error instanceof Error ? error.message : 'Failed to process notice';
    res.status(500).json({ error: message });
  }
});

router.post('/admin/strikes/:strikeId/revoke', async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { strikeId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Revocation reason required' });
    }

    const strike = await dmcaService.revokeStrike(strikeId, req.user.id, reason);

    res.json({
      success: true,
      strike,
      message: 'Strike revoked successfully',
    });
  } catch (error: unknown) {
    logger.error('Error revoking strike:', error);
    const message = error instanceof Error ? error.message : 'Failed to revoke strike';
    res.status(500).json({ error: message });
  }
});

router.get('/legal-holds', async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const contentId = req.query.contentId as string | undefined;
    const holds = await dmcaService.getActiveLegalHolds(contentId);

    res.json({ holds });
  } catch (error: unknown) {
    logger.error('Error fetching legal holds:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch legal holds';
    res.status(500).json({ error: message });
  }
});

router.post('/legal-holds/:holdId/release', async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { holdId } = req.params;
    const hold = await dmcaService.releaseLegalHold(holdId, req.user.id);

    res.json({
      success: true,
      hold,
      message: 'Legal hold released successfully',
    });
  } catch (error: unknown) {
    logger.error('Error releasing legal hold:', error);
    const message = error instanceof Error ? error.message : 'Failed to release legal hold';
    res.status(500).json({ error: message });
  }
});

export default router;
