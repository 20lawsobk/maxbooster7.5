import { logger } from '../logger';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { users } from '../../shared/schema';

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
  { id: 'global.command-palette', key: 'k', modifiers: ['cmd'], enabled: true },
  { id: 'global.help', key: '/', modifiers: ['cmd'], enabled: true },
  { id: 'global.settings', key: ',', modifiers: ['cmd'], enabled: true },
  { id: 'global.search', key: '/', modifiers: [], enabled: true },
  { id: 'global.escape', key: 'Escape', modifiers: [], enabled: true },
  { id: 'studio.play-pause', key: ' ', modifiers: [], enabled: true },
  { id: 'studio.record', key: 'r', modifiers: [], enabled: true },
  { id: 'studio.mute', key: 'm', modifiers: [], enabled: true },
  { id: 'studio.solo', key: 's', modifiers: [], enabled: true },
  { id: 'studio.save', key: 's', modifiers: ['cmd'], enabled: true },
  { id: 'studio.undo', key: 'z', modifiers: ['cmd'], enabled: true },
  { id: 'studio.redo', key: 'z', modifiers: ['cmd', 'shift'], enabled: true },
  { id: 'studio.loop', key: 'l', modifiers: [], enabled: true },
  { id: 'studio.metronome', key: 'k', modifiers: [], enabled: true },
  { id: 'studio.split', key: 'b', modifiers: [], enabled: true },
  { id: 'studio.delete', key: 'Delete', modifiers: [], enabled: true },
  { id: 'studio.zoom-in', key: '=', modifiers: ['cmd'], enabled: true },
  { id: 'studio.zoom-out', key: '-', modifiers: ['cmd'], enabled: true },
  { id: 'studio.add-track', key: 't', modifiers: [], enabled: true },
  { id: 'studio.mixer', key: 'x', modifiers: ['shift'], enabled: true },
  { id: 'dashboard.new-project', key: 'n', modifiers: [], enabled: true },
  { id: 'dashboard.upload', key: 'u', modifiers: [], enabled: true },
  { id: 'dashboard.distribution', key: 'd', modifiers: [], enabled: true },
  { id: 'social.new-post', key: 'p', modifiers: [], enabled: true },
  { id: 'social.schedule', key: 's', modifiers: [], enabled: true },
  { id: 'social.analytics', key: 'a', modifiers: [], enabled: true },
  { id: 'analytics.date-range', key: 'd', modifiers: [], enabled: true },
  { id: 'analytics.export', key: 'e', modifiers: ['cmd'], enabled: true },
  { id: 'analytics.refresh', key: 'r', modifiers: ['cmd'], enabled: true },
  { id: 'distribution.new-release', key: 'n', modifiers: [], enabled: true },
  { id: 'distribution.upload', key: 'u', modifiers: [], enabled: true },
  { id: 'marketplace.search', key: '/', modifiers: [], enabled: true },
  { id: 'marketplace.filter', key: 'f', modifiers: [], enabled: true },
];

router.get('/user', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!user.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userPrefs = user[0].preferences as Record<string, any> | null;
    const preferences = userPrefs?.shortcuts as ShortcutPreferences | null;

    if (!preferences) {
      return res.json(null);
    }

    return res.json(preferences);
  } catch (error) {
    logger.error('Error fetching user shortcuts:', error);
    return res.status(500).json({ message: 'Failed to fetch shortcuts' });
  }
});

router.put('/user', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { shortcuts } = req.body;

    if (!Array.isArray(shortcuts)) {
      return res.status(400).json({ message: 'Shortcuts must be an array' });
    }

    for (const shortcut of shortcuts) {
      if (!shortcut.id || typeof shortcut.key !== 'string') {
        return res.status(400).json({ message: 'Invalid shortcut format' });
      }
    }

    const preferences: ShortcutPreferences = {
      shortcuts,
      updatedAt: new Date().toISOString(),
    };

    const currentPrefs = (await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1))[0]?.preferences as Record<string, any> || {};

    await db
      .update(users)
      .set({ preferences: { ...currentPrefs, shortcuts: preferences } })
      .where(eq(users.id, req.user.id));

    return res.json(preferences);
  } catch (error) {
    logger.error('Error saving user shortcuts:', error);
    return res.status(500).json({ message: 'Failed to save shortcuts' });
  }
});

router.delete('/user', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const currentPrefs = (await db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1))[0]?.preferences as Record<string, any> || {};

    const { shortcuts: _, ...restPrefs } = currentPrefs;
    
    await db
      .update(users)
      .set({ preferences: restPrefs })
      .where(eq(users.id, req.user.id));

    return res.json({ message: 'Shortcuts reset successfully' });
  } catch (error) {
    logger.error('Error resetting shortcuts:', error);
    return res.status(500).json({ message: 'Failed to reset shortcuts' });
  }
});

router.get('/defaults', async (_req: Request, res: Response) => {
  try {
    return res.json({
      shortcuts: DEFAULT_SHORTCUTS,
      version: '1.0.0',
    });
  } catch (error) {
    logger.error('Error fetching default shortcuts:', error);
    return res.status(500).json({ message: 'Failed to fetch defaults' });
  }
});

router.get('/conflicts', async (req: Request, res: Response) => {
  try {
    const { key, modifiers, context, excludeId } = req.query;

    if (!key) {
      return res.status(400).json({ message: 'Key is required' });
    }

    const modifierList = modifiers
      ? (modifiers as string).split(',').filter(Boolean)
      : [];

    const conflicts = DEFAULT_SHORTCUTS.filter((s) => {
      if (excludeId && s.id === excludeId) return false;
      if (s.key.toLowerCase() !== (key as string).toLowerCase()) return false;
      if (s.modifiers.length !== modifierList.length) return false;
      return s.modifiers.every((m) => modifierList.includes(m));
    });

    return res.json({ conflicts });
  } catch (error) {
    logger.error('Error checking conflicts:', error);
    return res.status(500).json({ message: 'Failed to check conflicts' });
  }
});

export default router;
