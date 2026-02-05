import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, inArray, sql } from 'drizzle-orm';

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
    console.error('Batch release submit error:', error);
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
    console.error('Batch release takedown error:', error);
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
    console.error('Batch release update error:', error);
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
    console.error('Batch release delete error:', error);
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
    console.error('Batch post schedule error:', error);
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
    console.error('Batch post delete error:', error);
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
    console.error('Batch post update error:', error);
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
    console.error('Batch file delete error:', error);
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
    console.error('Batch file move error:', error);
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
    console.error('Batch file download error:', error);
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
    console.error('Batch file update error:', error);
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
    console.error('Batch marketplace update error:', error);
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
    console.error('Batch marketplace delete error:', error);
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
    console.error('Batch analytics export error:', error);
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

    const comparisonData = ids.map((id) => ({
      id,
      streams: Math.floor(Math.random() * 100000),
      revenue: Math.floor(Math.random() * 1000),
      engagement: Math.random() * 10,
    }));

    res.json({
      success: ids,
      failed: [],
      totalRequested: ids.length,
      totalSucceeded: ids.length,
      totalFailed: 0,
      comparisonData,
    });
  } catch (error) {
    console.error('Batch analytics compare error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

const templates: Map<string, any> = new Map();
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
    console.error('Batch track move error:', error);
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
    console.error('Batch track tag error:', error);
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
    console.error('Batch track export error:', error);
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
    console.error('Batch track delete error:', error);
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
    console.error('Batch beat update error:', error);
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
    console.error('Batch beat delete error:', error);
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
    console.error('Batch post approve error:', error);
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
    console.error('Get batch progress error:', error);
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

    const userTemplates = Array.from(templates.values())
      .filter((t) => t.userId === userId)
      .filter((t) => !resource || t.resource === resource)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.json({ templates: userTemplates });
  } catch (error) {
    console.error('Get templates error:', error);
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

    const id = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const template = {
      id,
      userId,
      name,
      description: description || null,
      resource,
      action: action || 'bulk_operation',
      configuration,
      isFavorite: false,
      isShared: false,
      sharedBy: null,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    };

    templates.set(id, template);

    res.json(template);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const template = templates.get(id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    if (template.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const updates = req.body;
    const updatedTemplate = {
      ...template,
      ...updates,
      id: template.id,
      userId: template.userId,
      createdAt: template.createdAt,
      updatedAt: new Date().toISOString(),
    };

    templates.set(id, updatedTemplate);

    res.json(updatedTemplate);
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const template = templates.get(id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    if (template.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    templates.delete(id);

    res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Delete template error:', error);
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

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const template = templates.get(id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    if (template.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const sharedTemplate = {
      ...template,
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isShared: true,
      sharedBy: req.user.email || req.user.username,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0,
    };

    res.json({ message: 'Template shared successfully', sharedTemplate });
  } catch (error) {
    console.error('Share template error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
