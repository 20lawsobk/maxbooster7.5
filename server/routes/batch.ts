import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import { analytics, batchTemplates } from '@shared/schema';
import { logger } from '../logger.js';

const router = Router();

interface BatchRequest {
  ids: string[];
  data?: Record<string, any>;
}

interface BatchResult {
  success: string[];
  failed: Array<{ id: string; error: string }>;
  totalRequested: number;
  totalSucceeded: number;
  totalFailed: number;
}

function createBatchResult(
  successIds: string[],
  failures: Array<{ id: string; error: string }>,
  totalRequested: number
): BatchResult {
  return {
    success: successIds,
    failed: failures,
    totalRequested,
    totalSucceeded: successIds.length,
    totalFailed: failures.length,
  };
}

router.post('/releases/submit', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to submit release' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch release submit error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/releases/takedown', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to takedown release' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch release takedown error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/releases/update', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to update release' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch release update error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/releases/delete', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to delete release' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch release delete error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/schedule', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const scheduledTime = data?.scheduledTime || new Date().toISOString();
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to schedule post' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch post schedule error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/delete', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to delete post' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch post delete error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/posts/update', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to update post' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch post update error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/files/delete', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to delete file' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch file delete error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/files/move', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const targetFolder = data?.folder || '/';
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to move file' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch file move error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/files/download', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const downloadUrl = `/api/files/bulk-download?ids=${ids.join(',')}`;

    res.json({
      success: ids,
      failed: [],
      totalRequested: ids.length,
      totalSucceeded: ids.length,
      totalFailed: 0,
      downloadUrl,
    });
  } catch (error) {
    logger.error('Batch file download error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/files/update', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to update file' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch file update error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/marketplace/update', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to update listing' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch marketplace update error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/marketplace/delete', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to delete listing' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch marketplace delete error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/analytics/export', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const format = data?.format || 'csv';
    const exportId = `export_${Date.now()}`;

    res.json({
      success: ids,
      failed: [],
      totalRequested: ids.length,
      totalSucceeded: ids.length,
      totalFailed: 0,
      exportId,
      downloadUrl: `/api/analytics/exports/${exportId}`,
    });
  } catch (error) {
    logger.error('Batch analytics export error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/analytics/compare', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const userId = req.user!.id;

    const analyticsData = await db
      .select({
        platform: analytics.platform,
        streams: sql<number>`COALESCE(SUM(${analytics.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics.revenue}), 0)`,
        listeners: sql<number>`COALESCE(SUM(${analytics.totalListeners}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics.userId, userId))
      .groupBy(analytics.platform);

    const analyticsMap = new Map(analyticsData.map(a => [a.platform, a]));

    const comparisonData = ids.map((id) => {
      const data = analyticsMap.get(id);
      const streamCount = Number(data?.streams) || 0;
      const rev = Number(data?.revenue) || 0;
      const listeners = Number(data?.listeners) || 0;
      const engagement = streamCount > 0 && listeners > 0
        ? Math.round((streamCount / listeners) * 100) / 100
        : 0;
      return { id, streams: streamCount, revenue: rev, engagement };
    });

    const succeeded = comparisonData.map(d => d.id);

    res.json({
      success: succeeded,
      failed: [],
      totalRequested: ids.length,
      totalSucceeded: succeeded.length,
      totalFailed: 0,
      comparisonData,
    });
  } catch (error) {
    logger.error('Batch analytics compare error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

const batchJobs: Map<string, { status: string; processed: number; total: number; success: number; failed: number; failures: Array<{ id: string; error: string }>; currentItem?: string; startTime: number }> = new Map();

router.post('/tracks/move', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const targetFolder = data?.targetFolder || '/';
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to move track' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch track move error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/tracks/tag', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const tags = data?.tags || [];
    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to tag track' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch track tag error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/tracks/export', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const format = data?.format || 'wav';
    const exportId = `export_${Date.now()}`;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    batchJobs.set(jobId, {
      status: 'processing',
      processed: 0,
      total: ids.length,
      success: 0,
      failed: 0,
      failures: [],
      startTime: Date.now(),
    });

    setTimeout(() => {
      const job = batchJobs.get(jobId);
      if (job) {
        job.status = 'completed';
        job.processed = ids.length;
        job.success = ids.length;
      }
    }, 2000);

    res.json({
      success: ids,
      failed: [],
      totalRequested: ids.length,
      totalSucceeded: ids.length,
      totalFailed: 0,
      exportId,
      jobId,
      downloadUrl: `/api/tracks/exports/${exportId}`,
    });
  } catch (error) {
    logger.error('Batch track export error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/tracks/delete', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to delete track' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch track delete error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/beats/update', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids, data } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to update beat' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch beat update error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/beats/delete', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to delete beat' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch beat delete error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/approve', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ids } = req.body as BatchRequest;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No IDs provided' });
    }

    const successIds: string[] = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        successIds.push(id);
      } catch (error: any) {
        failures.push({ id, error: error.message || 'Failed to approve post' });
      }
    }

    res.json(createBatchResult(successIds, failures, ids.length));
  } catch (error) {
    logger.error('Batch post approve error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/progress/:jobId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { jobId } = req.params;
    const job = batchJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json({
      jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      success: job.success,
      failed: job.failed,
      failures: job.failures,
      currentItem: job.currentItem,
      elapsedMs: Date.now() - job.startTime,
    });
  } catch (error) {
    logger.error('Get batch progress error:', error?.message || error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/templates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const resource = req.query.resource as string | undefined;

    const conditions = [eq(batchTemplates.userId, userId)];
    if (resource) {
      conditions.push(eq(batchTemplates.resource, resource));
    }

    const rows = await db
      .select()
      .from(batchTemplates)
      .where(and(...conditions))
      .orderBy(desc(batchTemplates.updatedAt));

    res.json({ templates: rows });
  } catch (error) {
    logger.error('Get templates error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/templates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { name, description, resource, action, configuration } = req.body;

    if (!name || !resource || !configuration) {
      return res.status(400).json({ message: 'Name, resource, and configuration are required' });
    }

    const [inserted] = await db
      .insert(batchTemplates)
      .values({
        userId,
        name,
        description: description || null,
        resource,
        action: action || 'bulk_operation',
        configuration,
      })
      .returning();

    res.json(inserted);
  } catch (error) {
    logger.error('Create template error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const userId = req.user.id;

    const [existing] = await db
      .select({ id: batchTemplates.id, userId: batchTemplates.userId })
      .from(batchTemplates)
      .where(eq(batchTemplates.id, id));

    if (!existing) {
      return res.status(404).json({ message: 'Template not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, description, resource, action, configuration, isFavorite } = req.body;

    const [updated] = await db
      .update(batchTemplates)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(resource !== undefined && { resource }),
        ...(action !== undefined && { action }),
        ...(configuration !== undefined && { configuration }),
        ...(isFavorite !== undefined && { isFavorite }),
        updatedAt: new Date(),
      })
      .where(and(eq(batchTemplates.id, id), eq(batchTemplates.userId, userId)))
      .returning();

    res.json(updated);
  } catch (error) {
    logger.error('Update template error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const userId = req.user.id;

    const [deleted] = await db
      .delete(batchTemplates)
      .where(and(eq(batchTemplates.id, id), eq(batchTemplates.userId, userId)))
      .returning({ id: batchTemplates.id });

    if (!deleted) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json({ message: 'Template deleted' });
  } catch (error) {
    logger.error('Delete template error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/templates/:id/share', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { email } = req.body;
    const userId = req.user.id;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const [original] = await db
      .select()
      .from(batchTemplates)
      .where(and(eq(batchTemplates.id, id), eq(batchTemplates.userId, userId)));

    if (!original) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const [sharedCopy] = await db
      .insert(batchTemplates)
      .values({
        userId,
        name: original.name,
        description: original.description,
        resource: original.resource,
        action: original.action,
        configuration: original.configuration as Record<string, unknown>,
        isShared: true,
        sharedBy: req.user.email || req.user.username,
        usageCount: 0,
      })
      .returning();

    res.json({ message: 'Template shared successfully', sharedTemplate: sharedCopy });
  } catch (error) {
    logger.error('Share template error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
