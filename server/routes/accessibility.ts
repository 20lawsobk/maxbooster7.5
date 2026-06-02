import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { logger } from "../logger";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

export interface AccessibilityPreferences {
  reducedMotion: boolean | null;
  contrastMode: "normal" | "high" | "more" | null;
  fontSize: "small" | "medium" | "large" | "x-large";
  colorBlindMode:
    | "none"
    | "protanopia"
    | "deuteranopia"
    | "tritanopia"
    | "achromatopsia";
  focusIndicatorWidth: number;
  screenReaderOptimized: boolean;
  keyboardNavigationEnabled: boolean;
}

const defaultPreferences: AccessibilityPreferences = {
  reducedMotion: null,
  contrastMode: null,
  fontSize: "medium",
  colorBlindMode: "none",
  focusIndicatorWidth: 2,
  screenReaderOptimized: false,
  keyboardNavigationEnabled: true,
};

function validatePreferences(preferences: Partial<AccessibilityPreferences>): {
  valid: boolean;
  errors: string[];
  sanitized: Partial<AccessibilityPreferences>;
} {
  const errors: string[] = [];
  const sanitized: Partial<AccessibilityPreferences> = {};

  if (preferences.reducedMotion !== undefined) {
    if (
      preferences.reducedMotion !== null &&
      typeof preferences.reducedMotion !== "boolean"
    ) {
      errors.push("reducedMotion must be a boolean or null");
    } else {
      sanitized.reducedMotion = preferences.reducedMotion;
    }
  }

  if (preferences.contrastMode !== undefined) {
    const validModes = ["normal", "high", "more", null];
    if (!validModes.includes(preferences.contrastMode)) {
      errors.push("contrastMode must be normal, high, more, or null");
    } else {
      sanitized.contrastMode = preferences.contrastMode;
    }
  }

  if (preferences.fontSize !== undefined) {
    const validSizes = ["small", "medium", "large", "x-large"];
    if (!validSizes.includes(preferences.fontSize)) {
      errors.push("fontSize must be small, medium, large, or x-large");
    } else {
      sanitized.fontSize = preferences.fontSize;
    }
  }

  if (preferences.colorBlindMode !== undefined) {
    const validModes = [
      "none",
      "protanopia",
      "deuteranopia",
      "tritanopia",
      "achromatopsia",
    ];
    if (!validModes.includes(preferences.colorBlindMode)) {
      errors.push(
        "colorBlindMode must be none, protanopia, deuteranopia, tritanopia, or achromatopsia",
      );
    } else {
      sanitized.colorBlindMode = preferences.colorBlindMode;
    }
  }

  if (preferences.focusIndicatorWidth !== undefined) {
    if (
      typeof preferences.focusIndicatorWidth !== "number" ||
      preferences.focusIndicatorWidth < 1 ||
      preferences.focusIndicatorWidth > 8
    ) {
      errors.push("focusIndicatorWidth must be a number between 1 and 8");
    } else {
      sanitized.focusIndicatorWidth = preferences.focusIndicatorWidth;
    }
  }

  if (preferences.screenReaderOptimized !== undefined) {
    if (typeof preferences.screenReaderOptimized !== "boolean") {
      errors.push("screenReaderOptimized must be a boolean");
    } else {
      sanitized.screenReaderOptimized = preferences.screenReaderOptimized;
    }
  }

  if (preferences.keyboardNavigationEnabled !== undefined) {
    if (typeof preferences.keyboardNavigationEnabled !== "boolean") {
      errors.push("keyboardNavigationEnabled must be a boolean");
    } else {
      sanitized.keyboardNavigationEnabled =
        preferences.keyboardNavigationEnabled;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

router.get(
  "/accessibility-preferences",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const preferences = user.accessibilityPreferences || defaultPreferences;

      return res.json({
        ...defaultPreferences,
        ...preferences,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error fetching accessibility preferences:");
      return res
        .status(500)
        .json({ error: "Failed to fetch accessibility preferences" });
    }
  },
);

router.put(
  "/accessibility-preferences",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const updates = req.body;

      const { valid, errors, sanitized } = validatePreferences(updates);

      if (!valid) {
        return res.status(400).json({
          message: "Invalid accessibility preferences",
          errors,
        });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const currentPreferences =
        user.accessibilityPreferences || defaultPreferences;
      const newPreferences = {
        ...currentPreferences,
        ...sanitized,
      };

      await storage.updateUser(userId, {
        accessibilityPreferences: newPreferences,
      });

      logger.info(`Updated accessibility preferences for user ${userId}`);

      return res.json({
        message: "Accessibility preferences updated successfully",
        preferences: newPreferences,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error updating accessibility preferences:");
      return res
        .status(500)
        .json({ error: "Failed to update accessibility preferences" });
    }
  },
);

router.delete(
  "/accessibility-preferences",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;

      await storage.updateUser(userId, {
        accessibilityPreferences: defaultPreferences,
      });

      logger.info(`Reset accessibility preferences for user ${userId}`);

      return res.json({
        message: "Accessibility preferences reset to defaults",
        preferences: defaultPreferences,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error resetting accessibility preferences:");
      return res
        .status(500)
        .json({ error: "Failed to reset accessibility preferences" });
    }
  },
);

router.get(
  "/accessibility-preferences/defaults",
  (_req: Request, res: Response) => {
    return res.json(defaultPreferences);
  },
);

export default router;
