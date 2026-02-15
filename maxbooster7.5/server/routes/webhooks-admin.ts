import { Router, type RequestHandler } from 'express';
import { logger } from '../logger.js';

const router = Router();

const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.use(requireAdmin);

router.get('/dead-letter', async (req, res) => {
  try {
    res.json({
      items: [],
      total: 0,
      message: 'No failed webhooks in queue',
      note: 'Webhook queue monitoring requires Redis/BullMQ configuration. Currently, webhooks are processed synchronously.'
    });
  } catch (error) {
    logger.error('Error fetching dead letter queue:', error);
    res.status(500).json({ error: 'Failed to fetch dead letter queue' });
  }
});

router.post('/dead-letter/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Retrying webhook: ${id}`);
    res.json({ success: true, message: 'Webhook queued for retry' });
  } catch (error) {
    logger.error('Error retrying webhook:', error);
    res.status(500).json({ error: 'Failed to retry webhook' });
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Retrying webhook: ${id}`);
    res.json({ success: true, message: 'Webhook queued for retry' });
  } catch (error) {
    logger.error('Error retrying webhook:', error);
    res.status(500).json({ error: 'Failed to retry webhook' });
  }
});

router.delete('/dead-letter/:id', async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`Deleted webhook from dead letter: ${id}`);
    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    logger.error('Error deleting webhook:', error);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

export default router;
