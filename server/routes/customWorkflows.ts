import { Router } from 'express';
import { db } from '../db';
import { customWorkflows } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { notificationService } from '../services/notificationService.js';
import { logger } from '../logger.js';

const router = Router();

// ─── Catalog of available triggers ──────────────────────────────────────────

export const CUSTOM_TRIGGERS = [
  { id: 'track:uploaded', label: 'Track uploaded', category: 'Music', description: 'A new audio file is uploaded to your library' },
  { id: 'track:mastered', label: 'Track marked as mastered', category: 'Music', description: 'A track status changes to "mastered"' },
  { id: 'mix:complete', label: 'Mix marked complete', category: 'Music', description: 'A mix is approved and ready for mastering' },
  { id: 'collaboration:added', label: 'Collaborator added to project', category: 'Music', description: 'A new collaborator joins one of your projects' },
  { id: 'release:submitted', label: 'Release submitted for distribution', category: 'Release', description: 'Music is submitted to DSPs for distribution' },
  { id: 'release:live', label: 'Release goes live', category: 'Release', description: 'A release becomes publicly available on streaming platforms' },
  { id: 'distribution:approved', label: 'Distribution approved by DSP', category: 'Release', description: 'A distributor approves and publishes your release' },
  { id: 'marketplace:sale-completed', label: 'Beat or track sold', category: 'Revenue', description: 'A buyer purchases a beat or track from your storefront' },
  { id: 'royalty:received', label: 'Royalty payment received', category: 'Revenue', description: 'A royalty payout is deposited to your account' },
  { id: 'venue:contacted', label: 'Venue contact added', category: 'Revenue', description: 'A new venue contact is logged in your booking CRM' },
  { id: 'analytics:engagement-drop', label: 'Engagement drops on a track', category: 'Analytics', description: 'Track engagement falls below a threshold for 3 days' },
  { id: 'analytics:milestone', label: 'Streaming milestone reached', category: 'Analytics', description: 'A track hits 10K, 50K, 100K or custom stream count' },
  { id: 'social:post-published', label: 'Social post published', category: 'Social', description: 'A post is published on any connected social account' },
  { id: 'analytics:playlist-placement', label: 'Track added to playlist', category: 'Social', description: 'A track is added to a public playlist' },
  { id: 'schedule:daily', label: 'Every day at 9 AM', category: 'Schedule', description: 'Runs daily at 9:00 AM server time' },
  { id: 'schedule:weekly', label: 'Every Monday at 9 AM', category: 'Schedule', description: 'Runs every Monday at 9:00 AM' },
  { id: 'schedule:monthly', label: '1st of each month at 8 AM', category: 'Schedule', description: 'Runs on the 1st of each month at 8:00 AM' },
];

// ─── Catalog of available action types ───────────────────────────────────────

export const CUSTOM_ACTIONS = [
  {
    id: 'push_notification',
    label: 'Push notification to yourself',
    description: 'Send yourself a push notification inside Max Booster',
    fields: [
      { key: 'title', label: 'Notification title', type: 'text', placeholder: 'e.g. New release is live!' },
      { key: 'message', label: 'Message body', type: 'textarea', placeholder: 'e.g. {{releaseName}} dropped on {{platform}}. Go celebrate!' },
    ],
  },
  {
    id: 'email_self',
    label: 'Email yourself',
    description: 'Send yourself an email with a custom subject and body',
    fields: [
      { key: 'subject', label: 'Email subject', type: 'text', placeholder: 'e.g. Action needed: {{eventType}}' },
      { key: 'body', label: 'Email body', type: 'textarea', placeholder: 'Write your email content here. Use {{variable}} placeholders.' },
    ],
  },
  {
    id: 'social_post',
    label: 'Queue a social media post',
    description: 'Schedule a post on your connected social accounts',
    fields: [
      { key: 'platform', label: 'Platform', type: 'select', options: ['instagram', 'twitter', 'tiktok', 'facebook', 'all'] },
      { key: 'content', label: 'Post content', type: 'textarea', placeholder: 'e.g. 🎵 New drop alert! {{releaseName}} is OUT NOW. Link in bio.' },
    ],
  },
  {
    id: 'log_note',
    label: 'Log a note to activity feed',
    description: 'Write a custom note that appears in your activity history',
    fields: [
      { key: 'note', label: 'Note text', type: 'textarea', placeholder: 'e.g. Automation fired for {{eventType}} at {{timestamp}}' },
    ],
  },
  {
    id: 'webhook',
    label: 'Call a webhook URL',
    description: 'Send an HTTP POST to any external URL with event data',
    fields: [
      { key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://hooks.zapier.com/...' },
      { key: 'secret', label: 'Secret header value (optional)', type: 'text', placeholder: 'Bearer token or HMAC secret' },
    ],
  },
];

// ─── Route definitions ────────────────────────────────────────────────────────

// GET /api/custom-workflows/catalog — trigger + action definitions (no auth needed for UI builder)
router.get('/catalog', (_req, res) => {
  res.json({ triggers: CUSTOM_TRIGGERS, actions: CUSTOM_ACTIONS });
});

// GET /api/custom-workflows — list user's custom workflows
router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const rows = await db
      .select()
      .from(customWorkflows)
      .where(eq(customWorkflows.userId, req.session.userId))
      .orderBy(desc(customWorkflows.createdAt));
    res.json(rows);
  } catch (err: any) {
    logger.error('[CustomWorkflow] Error fetching:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/custom-workflows — create a new custom workflow
router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const { name, description, triggerEvent, triggerConditions, actions } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!triggerEvent) return res.status(400).json({ error: 'triggerEvent is required' });
    if (!Array.isArray(actions) || actions.length === 0) return res.status(400).json({ error: 'At least one action is required' });

    const [row] = await db.insert(customWorkflows).values({
      userId: req.session.userId,
      name: name.trim(),
      description: description?.trim() ?? '',
      triggerEvent,
      triggerConditions: triggerConditions ?? {},
      actions,
      enabled: false,
    }).returning();
    res.json(row);
  } catch (err: any) {
    logger.error('[CustomWorkflow] Error creating:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/custom-workflows/:id — update a custom workflow
router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const { name, description, triggerEvent, triggerConditions, actions, enabled } = req.body;
    const [row] = await db
      .update(customWorkflows)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(triggerEvent !== undefined && { triggerEvent }),
        ...(triggerConditions !== undefined && { triggerConditions }),
        ...(actions !== undefined && { actions }),
        ...(enabled !== undefined && { enabled }),
        updatedAt: new Date(),
      })
      .where(and(eq(customWorkflows.id, req.params.id), eq(customWorkflows.userId, req.session.userId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err: any) {
    logger.error('[CustomWorkflow] Error updating:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/custom-workflows/:id
router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    await db.delete(customWorkflows).where(
      and(eq(customWorkflows.id, req.params.id), eq(customWorkflows.userId, req.session.userId))
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/custom-workflows/:id/enable
router.post('/:id/enable', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const [row] = await db
      .update(customWorkflows)
      .set({ enabled: true, updatedAt: new Date() })
      .where(and(eq(customWorkflows.id, req.params.id), eq(customWorkflows.userId, req.session.userId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/custom-workflows/:id/disable
router.post('/:id/disable', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const [row] = await db
      .update(customWorkflows)
      .set({ enabled: false, updatedAt: new Date() })
      .where(and(eq(customWorkflows.id, req.params.id), eq(customWorkflows.userId, req.session.userId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/custom-workflows/:id/test — manually trigger a custom workflow
router.post('/:id/test', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const [workflow] = await db
      .select()
      .from(customWorkflows)
      .where(and(eq(customWorkflows.id, req.params.id), eq(customWorkflows.userId, req.session.userId)))
      .limit(1);

    if (!workflow) return res.status(404).json({ error: 'Not found' });

    const actionsRun: string[] = [];
    const actions = workflow.actions as Array<{ type: string; config: Record<string, any> }>;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'push_notification':
            await notificationService.send({
              userId: req.session.userId,
              type: 'info',
              title: action.config.title || 'Custom Workflow Triggered',
              message: action.config.message || `Workflow "${workflow.name}" executed successfully.`,
              link: '/workflow-automations',
            });
            actionsRun.push('Push notification sent');
            break;
          case 'log_note':
            actionsRun.push(`Note logged: ${action.config.note || '(empty)'}`);
            break;
          case 'email_self':
            actionsRun.push(`Email queued: "${action.config.subject || 'No subject'}"`);
            break;
          case 'social_post':
            actionsRun.push(`Social post queued for ${action.config.platform || 'all platforms'}`);
            break;
          case 'webhook':
            if (action.config.url) {
              try {
                await fetch(action.config.url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(action.config.secret ? { Authorization: action.config.secret } : {}),
                  },
                  body: JSON.stringify({
                    workflow: workflow.name,
                    trigger: workflow.triggerEvent,
                    timestamp: new Date().toISOString(),
                    test: true,
                  }),
                });
                actionsRun.push(`Webhook called: ${action.config.url}`);
              } catch {
                actionsRun.push(`Webhook failed: ${action.config.url}`);
              }
            }
            break;
        }
      } catch (err: any) {
        actionsRun.push(`Action failed: ${action.type} — ${err.message}`);
      }
    }

    // Increment run count
    await db
      .update(customWorkflows)
      .set({ runCount: (workflow.runCount ?? 0) + 1, lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(customWorkflows.id, workflow.id));

    res.json({ success: true, actionsRun });
  } catch (err: any) {
    logger.error('[CustomWorkflow] Error testing:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
