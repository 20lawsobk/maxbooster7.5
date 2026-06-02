import { Router, Request, Response } from "express";
import { achievementService } from "../services/achievementService";
import { logger } from "../logger.js";
import { requireAuth } from "../middleware/auth.js";
import { requireSafeParam } from "../middleware/requestValidation.js";

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const achievements = await achievementService.getAllAchievements();
    return res.json(achievements);
  } catch (error) {
    logger.warn("Error fetching achievements:", error?.message || error);
    return res.status(500).json({ error: "Failed to fetch achievements" });
  }
});

router.get("/user", requireAuth, async (req: Request, res: Response) => {
  try {
    const achievements = await achievementService.getUserAchievements(
      req.user!.id,
    );
    return res.json(achievements);
  } catch (error) {
    logger.warn("Error fetching user achievements:", error?.message || error);
    return res.status(500).json({ error: "Failed to fetch user achievements" });
  }
});

router.get("/unnotified", requireAuth, async (req: Request, res: Response) => {
  try {
    const achievements = await achievementService.getUnnotifiedAchievements(
      req.user!.id,
    );
    return res.json(achievements);
  } catch (error) {
    logger.warn(
      "Error fetching unnotified achievements:",
      error?.message || error,
    );
    return res
      .status(500)
      .json({ error: "Failed to fetch unnotified achievements" });
  }
});

router.post(
  "/mark-notified/:achievementId",
  requireAuth,
  requireSafeParam("achievementId"),
  async (req: Request, res: Response) => {
    try {
      await achievementService.markAchievementNotified(
        req.user!.id,
        req.params.achievementId,
      );
      return res.json({ success: true });
    } catch (error) {
      logger.warn(
        "Error marking achievement notified:",
        error?.message || error,
      );
      return res
        .status(500)
        .json({ error: "Failed to mark achievement notified" });
    }
  },
);

router.get("/leaderboard", requireAuth, async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    const leaderboard = await achievementService.getLeaderboard(
      category,
      limit,
    );
    return res.json(leaderboard);
  } catch (error) {
    logger.warn("Error fetching leaderboard:", error?.message || error);
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.get("/streaks", requireAuth, async (req: Request, res: Response) => {
  try {
    const streaks = await achievementService.getUserStreaks(req.user!.id);
    return res.json(streaks);
  } catch (error) {
    logger.warn("Error fetching streaks:", error?.message || error);
    return res.status(500).json({ error: "Failed to fetch streaks" });
  }
});

router.post(
  "/streaks/:type",
  requireAuth,
  requireSafeParam("type"),
  async (req: Request, res: Response) => {
    try {
      const streak = await achievementService.updateStreak(
        req.user!.id,
        req.params.type,
      );
      return res.json(streak);
    } catch (error) {
      logger.warn("Error updating streak:", error?.message || error);
      return res.status(500).json({ error: "Failed to update streak" });
    }
  },
);

export default router;
