import { Router } from 'express';
import { databaseBackupService } from '../services/backup/databaseBackupService.js';
import { requireAdmin } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

// Backup service is initialized manually in server/index.ts only when DATABASE_URL is valid

// Create manual backup (admin only)
router.post('/create', requireAdmin, async (req, res) => {
  try {
    const backupFile = await databaseBackupService.createBackup();
    res.json({ success: true, backupFile });
  } catch (error) {
    logger.warn({ err: error }, '[Backup] Failed to create backup:');
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// List all backups (admin only)
router.get('/list', requireAdmin, async (req, res) => {
  try {
    const backups = await databaseBackupService.listBackups();
    res.json({ backups });
  } catch (error) {
    logger.warn({ err: error }, '[Backup] Failed to list backups:');
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// Get backup metrics (admin only)
router.get('/metrics', requireAdmin, async (req, res) => {
  try {
    const metrics = databaseBackupService.getBackupMetrics();
    res.json(metrics);
  } catch (error) {
    logger.warn({ err: error }, '[Backup] Failed to get backup metrics:');
    res.status(500).json({ error: 'Failed to get backup metrics' });
  }
});

export default router;
