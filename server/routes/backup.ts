/**
 * Backup Admin Routes
 * 
 * Admin-only database backup management endpoints.
 */

import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { databaseBackupService } from '../services/backup/databaseBackupService.js';

const router = Router();

// Backup service is initialized manually in server/index.ts only when DATABASE_URL is valid

// Create manual backup (admin only)
router.post('/api/admin/backup/create', requireAdmin, async (req, res) => {
  try {
    const backupFile = await databaseBackupService.createBackup();
    res.json({ success: true, backupFile });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all backups (admin only)
router.get('/api/admin/backup/list', requireAdmin, async (req, res) => {
  try {
    const backups = await databaseBackupService.listBackups();
    res.json({ backups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get backup metrics (admin only)
router.get('/api/admin/backup/metrics', requireAdmin, async (req, res) => {
  try {
    const metrics = databaseBackupService.getBackupMetrics();
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
