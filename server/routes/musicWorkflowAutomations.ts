import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../logger.js";
import {
  musicWorkflowAutomationService,
  WORKFLOW_TEMPLATES,
} from "../services/musicWorkflowAutomationService.js";

const router = Router();

function validateConfig(
  template: (typeof WORKFLOW_TEMPLATES)[number],
  config: unknown,
): Record<string, unknown> | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  for (const [key, value] of Object.entries(config)) {
    const field = template.configSchema[key];
    if (!field) return null;
    if (
      (field.type === "boolean" && typeof value !== "boolean") ||
      (field.type === "string" && typeof value !== "string") ||
      (field.type === "number" &&
        (typeof value !== "number" || !Number.isFinite(value))) ||
      (field.type === "select" &&
        (typeof value !== "string" || !field.options?.includes(value)))
    ) {
      return null;
    }
  }

  return config as Record<string, unknown>;
}

// GET /api/music-workflow-automations/templates
// Returns all available workflow templates (static, no auth needed)
router.get("/templates", async (_req: Request, res: Response) => {
  try {
    res.json({ templates: WORKFLOW_TEMPLATES });
  } catch (err) {
    logger.warn({ err: err }, "[MusicWorkflow] Error fetching templates:");
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

// GET /api/music-workflow-automations
// Returns the current user's enabled/config state for all templates
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userAutomations =
      await musicWorkflowAutomationService?.getUserAutomations(userId);

    const combined = WORKFLOW_TEMPLATES?.map((template) => {
      const userState = userAutomations[template?.id];
      return {
        ...template,
        enabled: userState.enabled ?? false,
        config: userState.config ?? template?.defaultConfig,
      };
    });

    res.json({ automations: combined });
  } catch (err) {
    logger.warn(
      { err: err },
      "[MusicWorkflow] Error fetching user automations:",
    );
    res.status(500).json({ error: "Failed to fetch automations" });
  }
});

// POST /api/music-workflow-automations/:templateId/enable
router.post(
  "/:templateId/enable",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { templateId } = req.params as Record<string, string>;
      const { config } = req.body ?? {};

      const template = WORKFLOW_TEMPLATES?.find((t) => t?.id === templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      const validatedConfig =
        config === undefined ? undefined : validateConfig(template, config);
      if (config !== undefined && !validatedConfig) {
        return res.status(400).json({ error: "Invalid automation config" });
      }

      await musicWorkflowAutomationService?.enableAutomation(
        userId,
        templateId,
        validatedConfig ?? undefined,
      );
      res.json({ success: true, templateId, enabled: true });
    } catch (err) {
      logger.warn({ err: err }, "[MusicWorkflow] Error enabling automation:");
      res.status(500).json({ error: "Failed to enable automation" });
    }
  },
);

// POST /api/music-workflow-automations/:templateId/disable
router.post(
  "/:templateId/disable",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { templateId } = req.params as Record<string, string>;

      const template = WORKFLOW_TEMPLATES?.find((t) => t?.id === templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      await musicWorkflowAutomationService?.disableAutomation(
        userId,
        templateId,
      );
      res.json({ success: true, templateId, enabled: false });
    } catch (err) {
      logger.warn({ err: err }, "[MusicWorkflow] Error disabling automation:");
      res.status(500).json({ error: "Failed to disable automation" });
    }
  },
);

// PUT /api/music-workflow-automations/:templateId/config
router.put(
  "/:templateId/config",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { templateId } = req.params as Record<string, string>;
      const { config } = req.body ?? {};

      const template = WORKFLOW_TEMPLATES?.find((t) => t?.id === templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const validatedConfig = validateConfig(template, config);
      if (!validatedConfig) {
        return res.status(400).json({ error: "Invalid automation config" });
      }

      await musicWorkflowAutomationService?.updateConfig(
        userId,
        templateId,
        validatedConfig,
      );
      res.json({ success: true, templateId, config });
    } catch (err) {
      logger.warn({ err: err }, "[MusicWorkflow] Error updating config:");
      res.status(500).json({ error: "Failed to update config" });
    }
  },
);

// POST /api/music-workflow-automations/trigger
// Manually fire an event (for testing automations from the UI)
router.post("/trigger", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const schema = z.object({
      eventType: z.string().min(1),
      data: z.record(z.string(), z.any()).optional(),
    });
    const parsed = schema?.safeParse(req.body);
    if (!parsed?.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { eventType, data = {} } = parsed.data;
    const executions = await musicWorkflowAutomationService.triggerEvent(eventType, {
      ...data,
      userId,
    });
    const failedExecutions = executions.filter(
      (execution) => execution.status === "failed",
    );
    res.json({
      success: failedExecutions.length === 0 && executions.length > 0,
      eventType,
      executions,
      message:
        executions.length === 0
          ? "No enabled automation is configured for this event."
          : failedExecutions.length > 0
            ? `${failedExecutions.length} workflow execution(s) failed. Check Run History for details.`
            : `${executions.length} workflow execution(s) completed and logged.`,
    });
  } catch (err) {
    logger.warn({ err: err }, "[MusicWorkflow] Error triggering event:");
    res.status(500).json({ error: "Failed to trigger event" });
  }
});

// GET /api/music-workflow-automations/stats
router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await musicWorkflowAutomationService?.getStats(userId);
    res.json(stats);
  } catch (err) {
    logger.warn({ err: err }, "[MusicWorkflow] Error fetching stats:");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /api/music-workflow-automations/logs
router.get("/logs", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const templateId = req.query.templateId as string | undefined;
    const parsedLimit = z.coerce.number().int().min(1).max(200).safeParse(
      req.query.limit ?? 50,
    );
    if (!parsedLimit.success) {
      return res.status(400).json({ error: "limit must be an integer from 1 to 200" });
    }
    const limit = parsedLimit.data;

    const logs = await musicWorkflowAutomationService?.getExecutionLogs(
      userId,
      templateId,
      limit,
    );
    res.json({ logs });
  } catch (err) {
    logger.warn({ err: err }, "[MusicWorkflow] Error fetching logs:");
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

export default router;
