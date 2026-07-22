import { logger } from "../logger";
import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { users } from "../../shared/schema";

const router = Router();

interface ShortcutConfig {
  id: string;
  key: string;
  modifiers: string[];
  enabled: boolean;
}

interface ShortcutPreferences {
  shortcuts: ShortcutConfig[];
  updatedAt: string;
}

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { id: "global.command-palette", key: "k", modifiers: ["cmd"], enabled: true },
  { id: "global.help", key: "/", modifiers: ["cmd"], enabled: true },
  { id: "global.settings", key: ",", modifiers: ["cmd"], enabled: true },
  { id: "global.search", key: "/", modifiers: [], enabled: true },
  { id: "global.escape", key: "Escape", modifiers: [], enabled: true },
  { id: "studio.play-pause", key: " ", modifiers: [], enabled: true },
  { id: "studio.record", key: "r", modifiers: [], enabled: true },
  { id: "studio.mute", key: "m", modifiers: [], enabled: true },
  { id: "studio.solo", key: "s", modifiers: [], enabled: true },
  { id: "studio.save", key: "s", modifiers: ["cmd"], enabled: true },
  { id: "studio.undo", key: "z", modifiers: ["cmd"], enabled: true },
  { id: "studio.redo", key: "z", modifiers: ["cmd", "shift"], enabled: true },
  { id: "studio.loop", key: "l", modifiers: [], enabled: true },
  { id: "studio.metronome", key: "k", modifiers: [], enabled: true },
  { id: "studio.split", key: "b", modifiers: [], enabled: true },
  { id: "studio.delete", key: "Delete", modifiers: [], enabled: true },
  { id: "studio.zoom-in", key: "=", modifiers: ["cmd"], enabled: true },
  { id: "studio.zoom-out", key: "-", modifiers: ["cmd"], enabled: true },
  { id: "studio.add-track", key: "t", modifiers: [], enabled: true },
  { id: "studio.mixer", key: "x", modifiers: ["shift"], enabled: true },
  { id: "dashboard.new-project", key: "n", modifiers: [], enabled: true },
  { id: "dashboard.upload", key: "u", modifiers: [], enabled: true },
  { id: "dashboard.distribution", key: "d", modifiers: [], enabled: true },
  { id: "social.new-post", key: "p", modifiers: [], enabled: true },
  { id: "social.schedule", key: "s", modifiers: [], enabled: true },
  { id: "social.analytics", key: "a", modifiers: [], enabled: true },
  { id: "analytics.date-range", key: "d", modifiers: [], enabled: true },
  { id: "analytics.export", key: "e", modifiers: ["cmd"], enabled: true },
  { id: "analytics.refresh", key: "r", modifiers: ["cmd"], enabled: true },
  { id: "distribution.new-release", key: "n", modifiers: [], enabled: true },
  { id: "distribution.upload", key: "u", modifiers: [], enabled: true },
  { id: "marketplace.search", key: "/", modifiers: [], enabled: true },
  { id: "marketplace.filter", key: "f", modifiers: [], enabled: true },
];

router?.get("/user", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users?.id, req.user.id))
      .limit(1);

    if (!user?.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const userPrefs = user[0].preferences as Record<string, any> | null;
    const preferences = userPrefs?.shortcuts as ShortcutPreferences | null;

    if (!preferences) {
      return res.json(null);
    }

    return res.json(preferences);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching user shortcuts:");
    return res.status(500).json({ error: "Failed to fetch shortcuts" });
  }
});

router?.put("/user", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { shortcuts } = req.body;

    if (!Array.isArray(shortcuts)) {
      return res.status(400).json({ error: "Shortcuts must be an array" });
    }

    for (const shortcut of shortcuts) {
      if (!shortcut?.id || typeof shortcut?.key !== "string") {
        return res.status(400).json({ error: "Invalid shortcut format" });
      }
    }

    const preferences: ShortcutPreferences = {
      shortcuts,
      updatedAt: new Date().toISOString(),
    };

    const currentPrefs =
      ((
        await db
          .select({ preferences: users.preferences })
          .from(users)
          .where(eq(users?.id, req.user.id))
          .limit(1)
      )[0]?.preferences as Record<string, any>) || {};

    await db
      .update(users)
      .set({ preferences: { ...currentPrefs, shortcuts: preferences } })
      .where(eq(users?.id, req.user.id));

    return res.json(preferences);
  } catch (error) {
    logger.warn({ err: error }, "Error saving user shortcuts:");
    return res.status(500).json({ error: "Failed to save shortcuts" });
  }
});

router?.delete("/user", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const currentPrefs =
      ((
        await db
          .select({ preferences: users.preferences })
          .from(users)
          .where(eq(users?.id, req.user.id))
          .limit(1)
      )[0]?.preferences as Record<string, any>) || {};

    const { shortcuts: _, ...restPrefs } = currentPrefs;

    await db
      .update(users)
      .set({ preferences: restPrefs })
      .where(eq(users?.id, req.user.id));

    return res.json({ success: true, message: "Shortcuts reset successfully" });
  } catch (error) {
    logger.warn({ err: error }, "Error resetting shortcuts:");
    return res.status(500).json({ error: "Failed to reset shortcuts" });
  }
});

router?.get("/defaults", async (_req: Request, res: Response) => {
  try {
    return res.json({
      shortcuts: DEFAULT_SHORTCUTS,
      version: "1.0.0",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching default shortcuts:");
    return res.status(500).json({ error: "Failed to fetch defaults" });
  }
});

router?.get("/conflicts", async (req: Request, res: Response) => {
  try {
    const { key, modifiers,  excludeId } = req.query;

    if (!key) {
      return res.status(400).json({ error: "Key is required" });
    }

    const modifierList = modifiers
      ? (modifiers as string).split(",").filter(Boolean)
      : [];

    const conflicts = DEFAULT_SHORTCUTS?.filter((s) => {
      if (excludeId && s?.id === excludeId) return false;
      if (s?.key.toLowerCase() !== (key as string).toLowerCase()) return false;
      if (s?.modifiers.length !== modifierList?.length) return false;
      return s?.modifiers.every((m) => modifierList?.includes(m));
    });

    return res.json({ conflicts });
  } catch (error) {
    logger.warn({ err: error }, "Error checking conflicts:");
    return res.status(500).json({ error: "Failed to check conflicts" });
  }
});

export default router;
