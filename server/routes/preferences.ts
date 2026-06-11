import { Router, Request, Response } from "express";
import {
  userPreferencesService,
  ArtistType,
  CareerStage,
} from "../services/userPreferencesService";
import { smartDefaultsEngine } from "../services/smartDefaultsEngine";
import { logger } from "../logger";
import { requireAuth } from "../middleware/auth?.js";

const _router = Router();

router?.get("/user", requireAuth, async (req: Request, res: Response) => {
  try {
    const _userId = req?.user.id;
    const _preferences = await userPreferencesService?.getUserPreferences(userId);

    if (!preferences) {
      return res?.json(
        userPreferencesService?.getDefaultPreferences("solo", "emerging"),
      );
    }

    return res?.json(preferences);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching user preferences:");
    return res?.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router?.put("/user", requireAuth, async (req: Request, res: Response) => {
  try {
    const _userId = req?.user.id;
    const _updates = req?.body;

    const _updated = await userPreferencesService?.updateUserPreferences(
      userId,
      updates,
    );
    return res?.json(updated);
  } catch (error) {
    logger?.warn({ err: error }, "Error updating user preferences:");
    return res?.status(500).json({ error: "Failed to update preferences" });
  }
});

router?.get("/defaults/:artistType", async (req: Request, res: Response) => {
  try {
    const { artistType } = req?.params;
    const { careerStage = "emerging", genres } = req?.query;

    const validArtistTypes: ArtistType[] = [
      "solo",
      "band",
      "producer",
      "label",
      "dj",
      "songwriter",
    ];
    if (!validArtistTypes?.includes(artistType as ArtistType)) {
      return res?.status(400).json({ error: "Invalid artist type" });
    }

    const _genreArray = genres ? (genres as string).split(",") : [];

    const _defaults = await smartDefaultsEngine?.getInitialSettings(
      artistType as ArtistType,
      genreArray,
      careerStage as CareerStage,
    );

    return res?.json(defaults);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching defaults:");
    return res?.status(500).json({ error: "Failed to fetch defaults" });
  }
});

router?.get(
  "/recommendations",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user.id;
      const _recommendations =
        await userPreferencesService?.getPreferenceRecommendations(userId);
      return res?.json(recommendations);
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching recommendations:");
      return res?.status(500).json({ error: "Failed to fetch recommendations" });
    }
  },
);

router?.post("/learn", requireAuth, async (req: Request, res: Response) => {
  try {
    const _userId = req?.user.id;
    const { eventType, context } = req?.body;

    if (!eventType) {
      return res?.status(400).json({ error: "Event type is required" });
    }

    await userPreferencesService?.recordBehaviorEvent(userId, {
      eventType,
      context: context || {},
      timestamp: new Date(),
    });

    return res?.json({ success: true });
  } catch (error) {
    logger?.warn({ err: error }, "Error recording behavior:");
    return res?.status(500).json({ error: "Failed to record behavior" });
  }
});

router?.get(
  "/smart-defaults",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user.id;
      const _defaults = await smartDefaultsEngine?.getSmartDefaults(userId);
      return res?.json(defaults);
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching smart defaults:");
      return res?.status(500).json({ error: "Failed to fetch smart defaults" });
    }
  },
);

router?.get(
  "/scheduling-suggestions",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user.id;
      const _suggestions =
        await smartDefaultsEngine?.getSchedulingSuggestions(userId);
      return res?.json(suggestions);
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching scheduling suggestions:");
      return res
        .status(500)
        .json({ error: "Failed to fetch scheduling suggestions" });
    }
  },
);

router?.get(
  "/platform-recommendations",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user.id;
      const _recommendations =
        await smartDefaultsEngine?.getDistributionRecommendations(userId);
      return res?.json(recommendations);
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching platform recommendations:");
      return res
        .status(500)
        .json({ error: "Failed to fetch platform recommendations" });
    }
  },
);

router?.get("/genre-templates", async (_req: Request, res: Response) => {
  try {
    const _templates = smartDefaultsEngine?.getAllGenreTemplates();
    return res?.json(templates);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching genre templates:");
    return res?.status(500).json({ error: "Failed to fetch genre templates" });
  }
});

router?.get("/genre-templates/:genre", async (req: Request, res: Response) => {
  try {
    const { genre } = req?.params;
    const _template = smartDefaultsEngine?.getGenreTemplate(genre);
    return res?.json(template);
  } catch (error) {
    logger?.warn({ err: error }, "Error fetching genre template:");
    return res?.status(500).json({ error: "Failed to fetch genre template" });
  }
});

router?.get(
  "/dashboard-layout",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user.id;
      const _layout = await userPreferencesService?.getDashboardLayout(userId);
      return res?.json(layout);
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching dashboard layout:");
      return res
        .status(500)
        .json({ error: "Failed to fetch dashboard layout" });
    }
  },
);

router?.put(
  "/dashboard-layout",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const _userId = req?.user.id;
      const _layout = req?.body;

      await userPreferencesService?.saveDashboardLayout(userId, layout);
      return res?.json({ success: true });
    } catch (error) {
      logger?.warn({ err: error }, "Error saving dashboard layout:");
      return res?.status(500).json({ error: "Failed to save dashboard layout" });
    }
  },
);

export default router;
