import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import {
  musicWorkflowAutomationService,
  WORKFLOW_TEMPLATES,
} from '../services/musicWorkflowAutomationService.js';

const router = Router();

// GET /api/music-workflow-automations/templates
// Returns all available workflow templates (static, no auth needed)
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    res.json({ templates: WORKFLOW_TEMPLATES });
  } catch (err: any) {
    logger.error('[MusicWorkflow] Error fetching templates:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// GET /api/music-workflow-automations
// Returns the current user's enabled/config state for all templates
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userAutomations = await musicWorkflowAutomationService.getUserAutomations(userId);

    const combined = WORKFLOW_TEMPLATES.map((template) => {
      const userState = userAutomations[template.id];
      return {
        ...template,
        enabled: userState?.enabled ?? false,
        config: userState?.config ?? template.defaultConfig,
      };
    });

    res.json({ automations: combined });
  } catch (err: any) {
    logger.error('[MusicWorkflow] Error fetching user automations:', err);
    res.status(500).json({ error: 'Failed to fetch automations' });
  }
});

// POST /api/music-workflow-automations/:templateId/enable
router.post('/:templateId/enable', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { templateId } = req.params;
    const { config } = req.body;

    const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await musicWorkflowAutomationService.enableAutomation(userId, templateId, config);
    res.json({ success: true, templateId, enabled: true });
  } catch (err: any) {
    logger.error('[MusicWorkflow] Error enabling automation:', err);
    res.status(500).json({ error: 'Failed to enable automation' });
  }
});

// POST /api/music-workflow-automations/:templateId/disable
router.post('/:templateId/disable', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { templateId } = req.params;

    const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await musicWorkflowAutomationService.disableAutomation(userId, templateId);
    res.json({ success: true, templateId, enabled: false });
  } catch (err: any) {
    logger.error('[MusicWorkflow] Error disabling automation:', err);
    res.status(500).json({ error: 'Failed to disable automation' });
  }
});

// PUT /api/music-workflow-automations/:templateId/config
router.put('/:templateId/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { templateId } = req.params;
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config object required' });
    }

    const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await musicWorkflowAutomationService.updateConfig(userId, templateId, config);
    res.json({ success: true, templateId, config });
  } catch (err: any) {
    logger.error('[MusicWorkflow] Error updating config:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// POST /api/music-workflow-automations/trigger
// Manually fire an event (for testing automations from the UI)
router.post('/trigger', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const schema = z.object({
      eventType: z.string().min(1),
      data: z.record(z.any()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { eventType, data = {} } = parsed.data;
    await musicWorkflowAutomationService.triggerEvent(eventType, { userId, ...data });
    res.json({ success: true, eventType, message: 'Event triggered. Check your logs for execution status.' });
  } catch (err: any) {
    logger.error('[MusicWorkflow] Error triggering event:', err);
    res.status(500).json({ error: 'Failed to trigger event' });
  }
});

// GET /api/music-workflow-automations/stats
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await musicWorkflowAutomationService.getStats(userId);
    res.json(stats);
  } catch (err: any) {
    logger.error('[MusicWorkflow] Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/music-workflow-automations/logs
router.get('/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const templateId = req.query.templateId as string | undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const logs = await musicWorkflowAutomationService.getExecutionLogs(userId, templateId, limit);
    res.json({ logs });
  } catch (err: any) {
    logger.error('[MusicWorkflow] Error fetching logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;
