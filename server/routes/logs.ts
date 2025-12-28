/**
 * Logs Admin Routes
 * 
 * Admin-only log querying and management endpoints.
 */

import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { logger } from '../logger.js';

const router = Router();

// Apply admin middleware to all routes
router.use(requireAdmin);

router.get('/query', async (req, res) => {
  try {
    const { level = 'all', service = 'all', limit = '100' } = req.query;
    const limitNum = parseInt(limit as string);

    res.json({
      logs: [],
      total: 0,
      query: { level, service, limit: limitNum },
      note: 'Structured log storage not yet configured. Logs are currently written to console/file. Configure a log aggregation service for queryable logs.'
    });
  } catch (error) {
    logger.error('Error querying logs:', error);
    res.status(500).json({ error: 'Failed to query logs' });
  }
});

router.get('/services', async (req, res) => {
  try {
    res.json({
      services: ['api', 'auth', 'database', 'ai', 'storage', 'queue', 'email', 'social']
    });
  } catch (error) {
    logger.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

router.get('/levels', async (req, res) => {
  try {
    res.json({
      levels: ['debug', 'info', 'warn', 'error', 'fatal']
    });
  } catch (error) {
    logger.error('Error fetching levels:', error);
    res.status(500).json({ error: 'Failed to fetch levels' });
  }
});

export default router;
