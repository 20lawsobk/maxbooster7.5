import { Router } from "express";
import { db } from "../db";
import { customWorkflows } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { notificationService } from "../services/notificationService.js";
import { logger } from "../logger.js";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";
import { parsePaginationParams } from "../middleware/pagination.js";

const router = Router();

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^localhost$/i,
];

function isSafeWebhookUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed?.protocol !== "https:") return false;
  const hostname = parsed?.hostname;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern?.test(hostname)) return false;
  }
  return true;
}

export const CUSTOM_TRIGGERS = [
  {
    id: "track:uploaded",
    label: "Track uploaded",
    category: "Music",
    description: "A new audio file is uploaded to your library",
  },
  {
    id: "track:mastered",
    label: "Track marked as mastered",
    category: "Music",
    description: 'A track status changes to "mastered"',
  },
  {
    id: "mix:complete",
    label: "Mix marked complete",
    category: "Music",
    description: "A mix is approved and ready for mastering",
  },
  {
    id: "collaboration:added",
    label: "Collaborator added to project",
    category: "Music",
    description: "A new collaborator joins one of your projects",
  },
  {
    id: "release:submitted",
    label: "Release submitted for distribution",
    category: "Release",
    description: "Music is submitted to DSPs for distribution",
  },
  {
    id: "release:live",
    label: "Release goes live",
    category: "Release",
    description: "A release becomes publicly available on streaming platforms",
  },
  {
    id: "distribution:approved",
    label: "Distribution approved by DSP",
    category: "Release",
    description: "A distributor approves and publishes your release",
  },
  {
    id: "marketplace:sale-completed",
    label: "Beat or track sold",
    category: "Revenue",
    description: "A buyer purchases a beat or track from your storefront",
  },
  {
    id: "royalty:received",
    label: "Royalty payment received",
    category: "Revenue",
    description: "A royalty payout is deposited to your account",
  },
  {
    id: "venue:contacted",
    label: "Venue contact added",
    category: "Revenue",
    description: "A new venue contact is logged in your booking CRM",
  },
  {
    id: "analytics:engagement-drop",
    label: "Engagement drops on a track",
    category: "Analytics",
    description: "Track engagement falls below a threshold for 3 days",
  },
  {
    id: "analytics:milestone",
    label: "Streaming milestone reached",
    category: "Analytics",
    description: "A track hits 10K, 50K, 100K or custom stream count",
  },
  {
    id: "social:post-published",
    label: "Social post published",
    category: "Social",
    description: "A post is published on any connected social account",
  },
  {
    id: "analytics:playlist-placement",
    label: "Track added to playlist",
    category: "Social",
    description: "A track is added to a public playlist",
  },
  {
    id: "schedule:daily",
    label: "Every day at 9 AM",
    category: "Schedule",
    description: "Runs daily at 9:00 AM server time",
  },
  {
    id: "schedule:weekly",
    label: "Every Monday at 9 AM",
    category: "Schedule",
    description: "Runs every Monday at 9:00 AM",
  },
  {
    id: "schedule:monthly",
    label: "1st of each month at 8 AM",
    category: "Schedule",
    description: "Runs on the 1st of each month at 8:00 AM",
  },
];

export const CUSTOM_ACTIONS = [
  {
    id: "push_notification",
    label: "Push notification to yourself",
    description: "Send yourself a push notification inside Max Booster",
    fields: [
      {
        key: "title",
        label: "Notification title",
        type: "text",
        placeholder: "e.g. New release is live!",
      },
      {
        key: "message",
        label: "Message body",
        type: "textarea",
        placeholder:
          "e.g. {{releaseName}} dropped on {{platform}}. Go celebrate!",
      },
    ],
  },
  {
    id: "email_self",
    label: "Email yourself",
    description: "Send yourself an email with a custom subject and body",
    fields: [
      {
        key: "subject",
        label: "Email subject",
        type: "text",
        placeholder: "e.g. Action needed: {{eventType}}",
      },
      {
        key: "body",
        label: "Email body",
        type: "textarea",
        placeholder:
          "Write your email content here. Use {{variable}} placeholders.",
      },
    ],
  },
  {
    id: "social_post",
    label: "Queue a social media post",
    description: "Schedule a post on your connected social accounts",
    fields: [
      {
        key: "platform",
        label: "Platform",
        type: "select",
        options: ["instagram", "twitter", "tiktok", "facebook", "all"],
      },
      {
        key: "content",
        label: "Post content",
        type: "textarea",
        placeholder:
          "e.g. 🎵 New drop alert! {{releaseName}} is OUT NOW. Link in bio.",
      },
    ],
  },
  {
    id: "log_note",
    label: "Log a note to activity feed",
    description: "Write a custom note that appears in your activity history",
    fields: [
      {
        key: "note",
        label: "Note text",
        type: "textarea",
        placeholder: "e.g. Automation fired for {{eventType}} at {{timestamp}}",
      },
    ],
  },
  {
    id: "webhook",
    label: "Call a webhook URL",
    description: "Send an HTTP POST to any external URL with event data",
    fields: [
      {
        key: "url",
        label: "Webhook URL",
        type: "text",
        placeholder: "https://hooks.zapier.com/...",
      },
      {
        key: "secret",
        label: "Secret header value (optional)",
        type: "text",
        placeholder: "Bearer token or HMAC secret",
      },
    ],
  },
  {
    id: "share_smart_link",
    label: "Share release smart link",
    description:
      "Post your release smart link (lnk.to URL) to social media. Use {{releaseName}}, {{artistName}}, {{smartLink}} as placeholders.",
    fields: [
      {
        key: "platform",
        label: "Platform",
        type: "select",
        options: ["all", "instagram", "twitter", "tiktok", "facebook"],
      },
      {
        key: "message",
        label: "Post message",
        type: "textarea",
        placeholder:
          "e.g. 🎵 {{releaseName}} by {{artistName}} is OUT NOW! Stream it everywhere: {{smartLink}} 🔥 #NewMusic",
      },
      {
        key: "smartLink",
        label: "Smart link URL (auto-filled from release)",
        type: "text",
        placeholder: "https://lnk.to/your-release",
      },
    ],
  },
];

const VALID_TRIGGER_IDS = new Set(CUSTOM_TRIGGERS?.map((t) => t?.id));

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  triggerEvent: z
    .string()
    .refine((v) => VALID_TRIGGER_IDS?.has(v), {
      message: "Invalid trigger event",
    }),
  triggerConditions: z.record(z.string(), z.unknown()).optional(),
  actions: z
    .array(
      z.object({
        type: z.string().max(100),
        config: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1, "At least one action is required")
    .max(10),
});

const updateWorkflowSchema = createWorkflowSchema?.partial().extend({
  enabled: z.boolean().optional(),
});

router?.get("/catalog", (_req, res) => {
  res.json({ triggers: CUSTOM_TRIGGERS, actions: CUSTOM_ACTIONS });
});

router?.get("/", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const rows = await db
      .select()
      .from(customWorkflows)
      .where(eq(customWorkflows?.userId, req.user!.id))
      .orderBy(desc(customWorkflows?.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(rows);
  } catch (error) {
    logger.warn({ err: error }, "[CustomWorkflow] Error fetching:");
    res.status(500).json({ error: "Failed to fetch custom workflows" });
  }
});

router?.get("/:id", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(customWorkflows)
      .where(
        and(
          eq(customWorkflows?.id, req.params.id),
          eq(customWorkflows?.userId, req.user!.id),
        ),
      )
      .limit(1);
    if (!row) return res.status(404).json({ error: "Workflow not found" });
    res.json(row);
  } catch (error) {
    logger.warn({ err: error }, "[CustomWorkflow] Error fetching workflow:");
    res.status(500).json({ error: "Failed to fetch workflow" });
  }
});

router?.post("/", requireAuth, async (req, res) => {
  try {
    const parsed = createWorkflowSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const { name, description, triggerEvent, triggerConditions, actions } =
      parsed?.data;
    const [row] = await db
      .insert(customWorkflows)
      .values({
        userId: req.user!.id,
        name,
        description: description!.trim() ?? "",
        triggerEvent,
        triggerConditions: triggerConditions ?? {},
        actions,
        enabled: false,
      })
      .returning();
    res.status(201).json(row);
  } catch (error) {
    logger.warn({ err: error }, "[CustomWorkflow] Error creating:");
    res.status(500).json({ error: "Failed to create custom workflow" });
  }
});

router?.put("/:id", requireAuth, async (req, res) => {
  try {
    const parsed = updateWorkflowSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed.error.flatten() });
    }

    const {
      name,
      description,
      triggerEvent,
      triggerConditions,
      actions,
      enabled,
    } = parsed?.data;
    const [row] = await db
      .update(customWorkflows)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description.trim() }),
        ...(triggerEvent !== undefined && { triggerEvent }),
        ...(triggerConditions !== undefined && { triggerConditions }),
        ...(actions !== undefined && { actions }),
        ...(enabled !== undefined && { enabled }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customWorkflows?.id, req.params.id),
          eq(customWorkflows?.userId, req.user!.id),
        ),
      )
      .returning();
    if (!row) return res.status(404).json({ error: "Workflow not found" });
    res.json(row);
  } catch (error) {
    logger.warn({ err: error }, "[CustomWorkflow] Error updating:");
    res.status(500).json({ error: "Failed to update custom workflow" });
  }
});

router?.delete("/:id", requireAuth, async (req, res) => {
  try {
    const [deleted] = await db
      .delete(customWorkflows)
      .where(
        and(
          eq(customWorkflows?.id, req.params.id),
          eq(customWorkflows?.userId, req.user!.id),
        ),
      )
      .returning();
    if (!deleted) return res.status(404).json({ error: "Workflow not found" });
    res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "[CustomWorkflow] Error deleting:");
    res.status(500).json({ error: "Failed to delete custom workflow" });
  }
});

router?.post("/:id/enable", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .update(customWorkflows)
      .set({ enabled: true, updatedAt: new Date() })
      .where(
        and(
          eq(customWorkflows?.id, req.params.id),
          eq(customWorkflows?.userId, req.user!.id),
        ),
      )
      .returning();
    if (!row) return res.status(404).json({ error: "Workflow not found" });
    res.json(row);
  } catch (error) {
    logger.warn({ err: error }, "[CustomWorkflow] Error enabling:");
    res.status(500).json({ error: "Failed to enable workflow" });
  }
});

router?.post("/:id/disable", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .update(customWorkflows)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(customWorkflows?.id, req.params.id),
          eq(customWorkflows?.userId, req.user!.id),
        ),
      )
      .returning();
    if (!row) return res.status(404).json({ error: "Workflow not found" });
    res.json(row);
  } catch (error) {
    logger.warn({ err: error }, "[CustomWorkflow] Error disabling:");
    res.status(500).json({ error: "Failed to disable workflow" });
  }
});

router?.post("/:id/test", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const [workflow] = await db
      .select()
      .from(customWorkflows)
      .where(
        and(
          eq(customWorkflows?.id, req.params.id),
          eq(customWorkflows?.userId, userId),
        ),
      )
      .limit(1);

    if (!workflow) return res.status(404).json({ error: "Workflow not found" });

    const actionsRun: string[] = [];
    const actions = workflow?.actions as Array<{
      type: string;
      config: Record<string, unknown>;
    }>;

    for (const action of actions) {
      try {
        switch (action?.type) {
          case "push_notification":
            await notificationService?.send({
              userId,
              type: "info",
              title: String(action?.config.title || "Custom Workflow Triggered"),
              message: String(
                action?.config.message ||
                  `Workflow "${workflow.name}" executed successfully.`,
              ),
              link: "/workflow-automations",
            });
            actionsRun?.push("Push notification sent");
            break;
          case "log_note":
            actionsRun?.push(
              `Note logged: ${String(action?.config.note || "(empty)")}`,
            );
            break;
          case "email_self":
            actionsRun?.push(
              `Email queued: "${String(action.config.subject || "No subject")}"`,
            );
            break;
          case "social_post":
            actionsRun?.push(
              `Social post queued for ${String(action?.config.platform || "all platforms")}`,
            );
            break;
          case "share_smart_link": {
            const platform = String(action?.config.platform || "all");
            const link = String(action?.config.smartLink || "");
            const msg = String(action?.config.message || "").replace(
              "{{smartLink}}",
              link || "https://lnk.to/your-release",
            );
            actionsRun?.push(
              `Smart link share queued for ${platform}: "${msg.slice(0, 60)}${msg.length > 60 ? "…" : ""}"`,
            );
            break;
          }
          case "webhook":
            if (action?.config.url && typeof action?.config.url === "string") {
              const webhookUrl = String(action?.config.url);
              if (!isSafeWebhookUrl(webhookUrl)) {
                logger.warn(
                  `[CustomWorkflow] Blocked SSRF attempt — unsafe webhook URL: ${webhookUrl}`,
                );
                actionsRun?.push(
                  `Webhook blocked: URL must be a public HTTPS endpoint`,
                );
              } else {
                try {
                  await fetch(webhookUrl, {
                    method: "POST",
                    signal: AbortSignal.timeout(10_000), // 10 s hard cap — prevents hanging slots
                    headers: {
                      "Content-Type": "application/json",
                      ...(action?.config.secret
                        ? { Authorization: String(action?.config.secret) }
                        : {}),
                    },
                    body: JSON.stringify({
                      workflow: workflow.name,
                      trigger: workflow.triggerEvent,
                      timestamp: new Date().toISOString(),
                      test: true,
                    }),
                  });
                  actionsRun?.push(`Webhook called: ${webhookUrl}`);
                } catch {
                  actionsRun?.push(`Webhook failed: ${webhookUrl}`);
                }
              }
            }
            break;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err?.message : String(err);
        actionsRun?.push(`Action failed: ${action?.type} — ${msg}`);
      }
    }

    await db
      .update(customWorkflows)
      .set({
        runCount: (workflow?.runCount ?? 0) + 1,
        lastRunAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customWorkflows?.id, workflow?.id));

    res.json({ success: true, actionsRun });
  } catch (error) {
    logger.warn({ err: error }, "[CustomWorkflow] Error testing:");
    res.status(500).json({ error: "Failed to test workflow" });
  }
});

export default router;
