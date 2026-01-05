import { Router, Request, Response } from "express";
import { achievementService } from "../services/achievementService";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const achievements = await achievementService.getAllAchievements();
    return res.json(achievements);
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return res.status(500).json({ message: "Failed to fetch achievements" });
  }
});

router.get("/user", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  try {
    const achievements = await achievementService.getUserAchievements(req.user.id);
    return res.json(achievements);
  } catch (error) {
    console.error("Error fetching user achievements:", error);
    return res.status(500).json({ message: "Failed to fetch user achievements" });
  }
});

router.get("/unnotified", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  try {
    const achievements = await achievementService.getUnnotifiedAchievements(req.user.id);
    return res.json(achievements);
  } catch (error) {
    console.error("Error fetching unnotified achievements:", error);
    return res.status(500).json({ message: "Failed to fetch unnotified achievements" });
  }
});

router.post("/mark-notified/:achievementId", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  try {
    await achievementService.markAchievementNotified(req.user.id, req.params.achievementId);
    return res.json({ success: true });
  } catch (error) {
    console.error("Error marking achievement notified:", error);
    return res.status(500).json({ message: "Failed to mark achievement notified" });
  }
});

router.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const leaderboard = await achievementService.getLeaderboard(category, limit);
    return res.json(leaderboard);
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return res.status(500).json({ message: "Failed to fetch leaderboard" });
  }
});

router.get("/streaks", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  try {
    const streaks = await achievementService.getUserStreaks(req.user.id);
    return res.json(streaks);
  } catch (error) {
    console.error("Error fetching streaks:", error);
    return res.status(500).json({ message: "Failed to fetch streaks" });
  }
});

router.post("/streaks/:type", async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  try {
    const streak = await achievementService.updateStreak(req.user.id, req.params.type);
    return res.json(streak);
  } catch (error) {
    console.error("Error updating streak:", error);
    return res.status(500).json({ message: "Failed to update streak" });
  }
});

export default router;
