import { Router } from "express";
import { onboardingService } from "../services/onboardingService.js";
import { db } from "../db.js";
import { users } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/progress", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const progress = await onboardingService?.getOnboardingProgress(userId);
    res.json(progress);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching onboarding progress:");
    res.status(500).json({ error: "Failed to fetch onboarding progress" });
  }
});

router.post("/complete-step", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { stepId } = req.body;
    if (!stepId) {
      return res.status(400).json({ error: "stepId is required" });
    }

    const result = await onboardingService?.completeStep(userId, stepId);
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error completing onboarding step:");
    res.status(500).json({ error: "Failed to complete step" });
  }
});

router.post("/skip", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const result = await onboardingService?.skipOnboarding(userId);
    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, "Error skipping onboarding:");
    res.status(500).json({ error: "Failed to skip onboarding" });
  }
});

router.get("/recommended-step", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const step = await onboardingService?.getRecommendedNextStep(userId);
    res.json({ recommendedStep: step });
  } catch (error) {
    logger.warn({ err: error }, "Error getting recommended step:");
    res.status(500).json({ error: "Failed to get recommended step" });
  }
});

router.get("/tasks", requireAuth, async (_req, res) => {
  try {
    const tasks = await onboardingService?.getTasks();
    res.json({ tasks });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching onboarding tasks:");
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.post("/seed", requireAuth, async (req, res) => {
  if ((!req.user as any)?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    await onboardingService?.seedDefaultTasks();
    res.json({
      success: true,
      message: "Onboarding tasks seeded successfully",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error seeding onboarding tasks:");
    res.status(500).json({ error: "Failed to seed tasks" });
  }
});

router.get("/status", async (_req, res) => {
  try {
    const tasks = await onboardingService?.getTasks();
    res.json({
      status: "active",
      totalTasks: tasks.length || 0,
      version: "1.0.0",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching onboarding status:");
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

router.post("/complete-welcome", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { displayName, bio, avatarUrl, genres, interests, artistType } =
      req.body;

    await db
      .update(users)
      .set({
        displayName: displayName || undefined,
        bio: bio || undefined,
        avatarUrl: avatarUrl || undefined,
        onboardingData: {
          welcomeCompleted: true,
          genres: genres || [],
          interests: interests || [],
          artistType: artistType || null,
          completedAt: new Date().toISOString(),
        },
      })
      .where(eq(users.id, userId));

    logger.info(`Welcome flow completed for user ${userId}`);

    res.json({
      success: true,
      message: "Welcome flow completed successfully",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error completing welcome flow:");
    res.status(500).json({ error: "Failed to complete welcome flow" });
  }
});

router.post("/track-tutorial", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { tutorialId, stepId, completed } = req.body;

    if (!tutorialId || !stepId) {
      return res
        .status(400)
        .json({ error: "tutorialId and stepId are required" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const tutorialProgress =
      (user?.onboardingData as Record<string, unknown>)?.tutorials || {};
    const tutorialData = tutorialProgress[tutorialId] || {
      completedSteps: [],
      startedAt: null,
      completedAt: null,
    };

    if (!tutorialData?.startedAt) {
      tutorialData.startedAt = new Date().toISOString();
    }

    if (completed && !tutorialData?.completedSteps.includes(stepId)) {
      tutorialData?.completedSteps.push(stepId);
    }

    tutorialProgress[tutorialId] = tutorialData;

    await db
      .update(users)
      .set({
        onboardingData: {
          ...((user?.onboardingData as object) || {}),
          tutorials: tutorialProgress,
        },
      })
      .where(eq(users.id, userId));

    logger.info(
      `Tutorial ${tutorialId} step ${stepId} tracked for user ${userId}`,
    );

    res.json({
      success: true,
      tutorialId,
      stepId,
      completed,
      progress: tutorialData,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error tracking tutorial progress:");
    res.status(500).json({ error: "Failed to track tutorial progress" });
  }
});

router.post("/skip-tutorial", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { tutorialId, showAgainLater } = req.body;

    if (!tutorialId) {
      return res.status(400).json({ error: "tutorialId is required" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const tutorialProgress =
      (user?.onboardingData as Record<string, unknown>)?.tutorials || {};
    const tutorialData = tutorialProgress[tutorialId] || {
      completedSteps: [],
      startedAt: null,
    };

    tutorialData.skippedAt = new Date().toISOString();
    tutorialData.showAgainLater = showAgainLater || false;

    tutorialProgress[tutorialId] = tutorialData;

    await db
      .update(users)
      .set({
        onboardingData: {
          ...((user?.onboardingData as object) || {}),
          tutorials: tutorialProgress,
        },
      })
      .where(eq(users.id, userId));

    logger.info(`Tutorial ${tutorialId} skipped for user ${userId}`);

    res.json({
      success: true,
      tutorialId,
      showAgainLater,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error skipping tutorial:");
    res.status(500).json({ error: "Failed to skip tutorial" });
  }
});

router.get("/tutorials", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const tutorialProgress =
      (user?.onboardingData as Record<string, unknown>)?.tutorials || {};

    res.json({
      tutorials: tutorialProgress,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching tutorial progress:");
    res.status(500).json({ error: "Failed to fetch tutorial progress" });
  }
});

router.post("/mark-celebrated", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { actionType } = req.body;

    if (!actionType) {
      return res.status(400).json({ error: "actionType is required" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const celebrations =
      (user?.onboardingData as Record<string, unknown>)?.celebrations || {};
    celebrations[actionType] = {
      celebratedAt: new Date().toISOString(),
    };

    await db
      .update(users)
      .set({
        onboardingData: {
          ...((user?.onboardingData as object) || {}),
          celebrations,
        },
      })
      .where(eq(users.id, userId));

    logger.info(`First action ${actionType} celebrated for user ${userId}`);

    res.json({
      success: true,
      actionType,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error marking celebration:");
    res.status(500).json({ error: "Failed to mark celebration" });
  }
});

router.get("/first-actions", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const celebrations =
      (user?.onboardingData as Record<string, unknown>)?.celebrations || {};

    res.json({
      celebrations,
      pending: {
        first_track_upload: !(celebrations as any).first_track_upload,
        first_post_scheduled: !(celebrations as any).first_post_scheduled,
        first_beat_listed: !(celebrations as any).first_beat_listed,
        first_payout: !(celebrations as any).first_payout,
        first_collaboration: !(celebrations as any).first_collaboration,
        first_release: !(celebrations as any).first_release,
        profile_complete: !(celebrations as any).profile_complete,
        social_connected: !(celebrations as any).social_connected,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching first actions:");
    res.status(500).json({ error: "Failed to fetch first actions" });
  }
});

router.get("/check-first-login", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const onboardingData = user?.onboardingData as Record<string, unknown>;
    const isFirstLogin = !onboardingData?.welcomeCompleted;
    const hasCompletedOnboarding = user?.onboardingCompleted || false;

    res.json({
      isFirstLogin,
      hasCompletedOnboarding,
      showWelcomeWizard: isFirstLogin && !hasCompletedOnboarding,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error checking first login:");
    res.status(500).json({ error: "Failed to check first login" });
  }
});

router.post("/dismiss-reminder", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { remindLater } = req.body;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await db
      .update(users)
      .set({
        onboardingData: {
          ...((user?.onboardingData as object) || {}),
          reminderDismissedAt: new Date().toISOString(),
          remindLater: remindLater || false,
          remindAt: remindLater
            ? new Date(Date?.now() + 24 * 60 * 60 * 1000).toISOString()
            : null,
        },
      })
      .where(eq(users.id, userId));

    res.json({
      success: true,
      remindLater,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error dismissing reminder:");
    res.status(500).json({ error: "Failed to dismiss reminder" });
  }
});

const DEFAULT_ACHIEVEMENTS = [
  {
    id: "profile_complete",
    name: "Profile Pro",
    description: "Complete your artist profile",
    category: "onboarding",
    rarity: "common",
    icon: "User",
    points: 50,
  },
  {
    id: "first_track",
    name: "First Sound",
    description: "Upload your first track",
    category: "studio",
    rarity: "common",
    icon: "Music",
    points: 100,
  },
  {
    id: "first_release",
    name: "Going Live",
    description: "Distribute your first release",
    category: "distribution",
    rarity: "rare",
    icon: "Rocket",
    points: 200,
  },
  {
    id: "social_connected",
    name: "Connected",
    description: "Link your social media accounts",
    category: "social",
    rarity: "common",
    icon: "Share2",
    points: 75,
  },
  {
    id: "first_beat_sale",
    name: "First Sale",
    description: "Sell your first beat on the marketplace",
    category: "marketplace",
    rarity: "rare",
    icon: "DollarSign",
    points: 250,
  },
  {
    id: "collaboration_started",
    name: "Team Player",
    description: "Start your first collaboration",
    category: "collaboration",
    rarity: "common",
    icon: "Users",
    points: 100,
  },
  {
    id: "week_streak",
    name: "On Fire",
    description: "Login for 7 days in a row",
    category: "streak",
    rarity: "rare",
    icon: "Flame",
    points: 150,
    threshold: 7,
  },
  {
    id: "month_streak",
    name: "Dedicated Artist",
    description: "Login for 30 days in a row",
    category: "streak",
    rarity: "epic",
    icon: "Crown",
    points: 500,
    threshold: 30,
  },
  {
    id: "ten_releases",
    name: "Prolific",
    description: "Release 10 tracks to streaming platforms",
    category: "distribution",
    rarity: "epic",
    icon: "Trophy",
    points: 400,
    threshold: 10,
  },
  {
    id: "verified_artist",
    name: "Verified",
    description: "Get verified on Max Booster",
    category: "onboarding",
    rarity: "legendary",
    icon: "Award",
    points: 1000,
    threshold: 1,
  },
  {
    id: "first_payout",
    name: "Paid",
    description: "Receive your first royalty payout",
    category: "marketplace",
    rarity: "rare",
    icon: "DollarSign",
    points: 300,
    threshold: 1,
  },
  {
    id: "studio_master",
    name: "Studio Master",
    description: "Create 50 beats in the studio",
    category: "studio",
    rarity: "epic",
    icon: "Headphones",
    points: 450,
    threshold: 50,
  },
];

router.get("/achievements", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const unlockedAchievements =
      (user?.onboardingData as Record<string, unknown>)?.achievements || {};
    const celebrations =
      (user?.onboardingData as Record<string, unknown>)?.celebrations || {};

    const achievements = DEFAULT_ACHIEVEMENTS?.map((achievement) => {
      const unlocked =
        unlockedAchievements[achievement?.id] ||
        celebrations[achievement?.id] ||
        {};
      return {
        ...achievement,
        unlockedAt: unlocked.unlockedAt || unlocked?.celebratedAt || null,
        progress: unlocked.progress || 0,
        maxProgress: (achievement as Record<string, unknown>).threshold ?? 1,
      };
    });

    const totalPoints = achievements
      .filter((a) => a?.unlockedAt)
      .reduce((sum, a) => sum + a?.points, 0);

    const stats = {
      total: achievements.length,
      unlocked: achievements.filter((a) => a?.unlockedAt).length,
      totalPoints,
      byCategory: {
        onboarding: achievements.filter((a) => a?.category === "onboarding"),
        studio: achievements.filter((a) => a?.category === "studio"),
        distribution: achievements.filter((a) => a?.category === "distribution"),
        social: achievements.filter((a) => a?.category === "social"),
        marketplace: achievements.filter((a) => a?.category === "marketplace"),
        collaboration: achievements.filter(
          (a) => a?.category === "collaboration",
        ),
        streak: achievements.filter((a) => a?.category === "streak"),
      },
      byRarity: {
        common: achievements.filter((a) => a?.rarity === "common"),
        rare: achievements.filter((a) => a?.rarity === "rare"),
        epic: achievements.filter((a) => a?.rarity === "epic"),
        legendary: achievements.filter((a) => a?.rarity === "legendary"),
      },
    };

    res.json({
      achievements,
      stats,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching achievements:");
    res.status(500).json({ error: "Failed to fetch achievements" });
  }
});

router.post("/unlock-achievement", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { achievementId } = req.body;

    if (!achievementId) {
      return res.status(400).json({ error: "achievementId is required" });
    }

    const achievement = DEFAULT_ACHIEVEMENTS?.find(
      (a) => a?.id === achievementId,
    );
    if (!achievement) {
      return res.status(404).json({ error: "Achievement not found" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const achievements =
      (user?.onboardingData as Record<string, unknown>)?.achievements || {};

    if (achievements[achievementId]?.unlockedAt) {
      return res.json({
        success: true,
        alreadyUnlocked: true,
        achievement: {
          ...achievement,
          unlockedAt: achievements[achievementId].unlockedAt,
        },
      });
    }

    achievements[achievementId] = {
      unlockedAt: new Date().toISOString(),
    };

    await db
      .update(users)
      .set({
        onboardingData: {
          ...((user?.onboardingData as object) || {}),
          achievements,
        },
      })
      .where(eq(users.id, userId));

    logger.info(`Achievement ${achievementId} unlocked for user ${userId}`);

    res.json({
      success: true,
      achievement: {
        ...achievement,
        unlockedAt: achievements[achievementId].unlockedAt,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Error unlocking achievement:");
    res.status(500).json({ error: "Failed to unlock achievement" });
  }
});

router.get("/profile/completion", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const onboardingData = (user?.onboardingData as unknown) || {};

    const completion = {
      emailVerified: user.emailVerified || false,
      artistType: (onboardingData as any).artistType || null,
      genres: (onboardingData as any).genres || [],
      hasPhoto: !!user?.avatarUrl,
      bio: user.bio || null,
      socialLinks: (onboardingData as any).socialLinks || [],
    };

    let completedSteps = 0;
    const totalSteps = 6;

    if (completion?.emailVerified) completedSteps++;
    if (completion?.artistType) completedSteps++;
    if (completion?.genres.length > 0) completedSteps++;
    if (completion?.hasPhoto) completedSteps++;
    if (completion?.bio && completion?.bio.length > 20) completedSteps++;
    if (completion?.socialLinks.length > 0) completedSteps++;

    res.json({
      ...completion,
      completionPercentage: Math.round((completedSteps / totalSteps) * 100),
      totalPoints: completedSteps * 25,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching profile completion:");
    res.status(500).json({ error: "Failed to fetch profile completion" });
  }
});

export default router;
