import { Router, Request, Response } from "express";
import {
  userPreferencesService,
  ArtistType,
  CareerStage,
} from "../services/userPreferencesService";
import { smartDefaultsEngine } from "../services/smartDefaultsEngine";
import { logger } from "../logger";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db.js";
import { users } from "../../shared/schema.js";
import { eq, sql } from "drizzle-orm";

const router = Router();

const securityAlertDefaults = {
  emailOnNewLogin: true,
  emailOnPasswordChange: true,
  emailOn2FAChange: true,
  emailOnSuspiciousActivity: true,
  emailOnNewDevice: true,
  pushOnLogin: false,
  pushOnSecurityChange: true,
  loginAlertFrequency: "new_device",
} as const;

const securityAlertBooleanFields = [
  "emailOnNewLogin",
  "emailOnPasswordChange",
  "emailOn2FAChange",
  "emailOnSuspiciousActivity",
  "emailOnNewDevice",
  "pushOnLogin",
  "pushOnSecurityChange",
] as const;

router.get("/security-alerts", requireAuth, async (req: Request, res: Response) => {
  try {
    const [user] = await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);
    const preferences = (user?.preferences as Record<string, unknown> | null) ?? {};
    const stored = (preferences.securityAlerts as Record<string, unknown> | undefined) ?? {};

    return res.json({ ...securityAlertDefaults, ...stored });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching security alert preferences");
    return res.status(500).json({ error: "Failed to fetch security alert preferences" });
  }
});

router.put("/security-alerts", requireAuth, async (req: Request, res: Response) => {
  try {
    const updates: Record<string, boolean | string> = {};
    for (const field of securityAlertBooleanFields) {
      if (req.body[field] !== undefined) {
        if (typeof req.body[field] !== "boolean") {
          return res.status(400).json({ error: `${field} must be a boolean` });
        }
        updates[field] = req.body[field];
      }
    }

    if (req.body.loginAlertFrequency !== undefined) {
      const frequency = req.body.loginAlertFrequency;
      if (!["always", "new_device", "suspicious_only"].includes(frequency)) {
        return res.status(400).json({ error: "Invalid login alert frequency" });
      }
      updates.loginAlertFrequency = frequency;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No security alert settings supplied" });
    }

    const [updated] = await db
      .update(users)
      .set({
        preferences: sql`jsonb_set(
          coalesce(${users.preferences}, '{}'::jsonb),
          '{securityAlerts}',
          coalesce(${users.preferences}->'securityAlerts', '{}'::jsonb) || ${JSON.stringify(updates)}::jsonb,
          true
        )`,
      })
      .where(eq(users.id, req.user!.id))
      .returning({ preferences: users.preferences });

    const preferences = (updated?.preferences as Record<string, unknown> | null) ?? {};
    return res.json({
      ...securityAlertDefaults,
      ...((preferences.securityAlerts as Record<string, unknown> | undefined) ?? {}),
    });
  } catch (error) {
    logger.warn({ err: error }, "Error updating security alert preferences");
    return res.status(500).json({ error: "Failed to update security alert preferences" });
  }
});

router.get("/user", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const preferences = await userPreferencesService?.getUserPreferences(userId);

    if (!preferences) {
      return res.json(
        userPreferencesService?.getDefaultPreferences("solo", "emerging"),
      );
    }

    return res.json(preferences);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching user preferences:");
    return res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.put("/user", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const updates = req.body;

    const updated = await userPreferencesService?.updateUserPreferences(
      userId,
      updates,
    );
    return res.json(updated);
  } catch (error) {
    logger.warn({ err: error }, "Error updating user preferences:");
    return res.status(500).json({ error: "Failed to update preferences" });
  }
});

router.get("/defaults/:artistType", async (req: Request, res: Response) => {
  try {
    const { artistType } = req.params as Record<string, string>;
    const { careerStage = "emerging", genres } = req.query;

    const validArtistTypes: ArtistType[] = [
      "solo",
      "band",
      "producer",
      "label",
      "dj",
      "songwriter",
    ];
    if (!validArtistTypes?.includes(artistType as ArtistType)) {
      return res.status(400).json({ error: "Invalid artist type" });
    }

    const genreArray = genres ? (genres as string).split(",") : [];

    const defaults = await smartDefaultsEngine?.getInitialSettings(
      artistType as ArtistType,
      genreArray,
      careerStage as CareerStage,
    );

    return res.json(defaults);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching defaults:");
    return res.status(500).json({ error: "Failed to fetch defaults" });
  }
});

router.get(
  "/recommendations",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const recommendations =
        await userPreferencesService?.getPreferenceRecommendations(userId);
      return res.json(recommendations);
    } catch (error) {
      logger.warn({ err: error }, "Error fetching recommendations:");
      return res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  },
);

router.post("/learn", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { eventType, context } = req.body;

    if (!eventType) {
      return res.status(400).json({ error: "Event type is required" });
    }

    await userPreferencesService?.recordBehaviorEvent(userId, {
      eventType,
      context: context || {},
      timestamp: new Date(),
    });

    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "Error recording behavior:");
    return res.status(500).json({ error: "Failed to record behavior" });
  }
});

router.get(
  "/smart-defaults",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const defaults = await smartDefaultsEngine?.getSmartDefaults(userId);
      return res.json(defaults);
    } catch (error) {
      logger.warn({ err: error }, "Error fetching smart defaults:");
      return res.status(500).json({ error: "Failed to fetch smart defaults" });
    }
  },
);

router.get(
  "/scheduling-suggestions",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const suggestions =
        await smartDefaultsEngine?.getSchedulingSuggestions(userId);
      return res.json(suggestions);
    } catch (error) {
      logger.warn({ err: error }, "Error fetching scheduling suggestions:");
      return res
        .status(500)
        .json({ error: "Failed to fetch scheduling suggestions" });
    }
  },
);

router.get(
  "/platform-recommendations",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const recommendations =
        await smartDefaultsEngine?.getDistributionRecommendations(userId);
      return res.json(recommendations);
    } catch (error) {
      logger.warn({ err: error }, "Error fetching platform recommendations:");
      return res
        .status(500)
        .json({ error: "Failed to fetch platform recommendations" });
    }
  },
);

router.get("/genre-templates", async (_req: Request, res: Response) => {
  try {
    const templates = smartDefaultsEngine?.getAllGenreTemplates();
    return res.json(templates);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching genre templates:");
    return res.status(500).json({ error: "Failed to fetch genre templates" });
  }
});

router.get("/genre-templates/:genre", async (req: Request, res: Response) => {
  try {
    const { genre } = req.params as Record<string, string>;
    const template = smartDefaultsEngine?.getGenreTemplate(genre);
    return res.json(template);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching genre template:");
    return res.status(500).json({ error: "Failed to fetch genre template" });
  }
});

router.get(
  "/dashboard-layout",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const layout = await userPreferencesService?.getDashboardLayout(userId);
      return res.json(layout);
    } catch (error) {
      logger.warn({ err: error }, "Error fetching dashboard layout:");
      return res
        .status(500)
        .json({ error: "Failed to fetch dashboard layout" });
    }
  },
);

router.put(
  "/dashboard-layout",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const layout = req.body;

      await userPreferencesService?.saveDashboardLayout(userId, layout);
      return res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Error saving dashboard layout:");
      return res.status(500).json({ error: "Failed to save dashboard layout" });
    }
  },
);

export default router;
