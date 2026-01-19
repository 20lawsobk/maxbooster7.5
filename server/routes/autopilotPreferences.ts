import { Router, Request, Response } from 'express';
import { db } from '../db';
import { autopilotPreferences } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [preferences] = await db
      .select()
      .from(autopilotPreferences)
      .where(eq(autopilotPreferences.userId, req.user.id));

    if (!preferences) {
      return res.json({
        userId: req.user.id,
        artistName: '',
        artistBio: '',
        genre: '',
        subGenres: [],
        brandVoice: 'casual',
        targetAudience: '',
        uniqueSellingPoints: [],
        contentTone: 'casual',
        preferredEmojis: [],
        avoidEmojis: false,
        preferredHashtags: [],
        avoidHashtags: [],
        contentThemes: [],
        avoidTopics: [],
        callToActionStyle: 'direct',
        platformSettings: {},
        postingSchedule: {
          timezone: 'America/New_York',
          preferredHours: [9, 12, 18, 21],
          preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          avoidHours: [],
          avoidDays: [],
        },
        adAutopilotEnabled: false,
        organicGrowthPriority: 'engagement',
        crossPostingEnabled: true,
        viralOptimizationLevel: 'moderate',
        contentExamples: { goodPosts: [], badPosts: [], inspirationalAccounts: [] },
        currentReleases: [],
        customInstructions: '',
        isActive: true,
      });
    }

    res.json(preferences);
  } catch (error) {
    logger.error('Error fetching autopilot preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = {
      userId: req.user.id,
      artistName: req.body.artistName,
      artistBio: req.body.artistBio,
      genre: req.body.genre,
      subGenres: req.body.subGenres,
      brandVoice: req.body.brandVoice,
      targetAudience: req.body.targetAudience,
      uniqueSellingPoints: req.body.uniqueSellingPoints,
      contentTone: req.body.contentTone,
      preferredEmojis: req.body.preferredEmojis,
      avoidEmojis: req.body.avoidEmojis,
      preferredHashtags: req.body.preferredHashtags,
      avoidHashtags: req.body.avoidHashtags,
      contentThemes: req.body.contentThemes,
      avoidTopics: req.body.avoidTopics,
      callToActionStyle: req.body.callToActionStyle,
      platformSettings: req.body.platformSettings,
      postingSchedule: req.body.postingSchedule,
      adAutopilotEnabled: req.body.adAutopilotEnabled,
      organicGrowthPriority: req.body.organicGrowthPriority,
      crossPostingEnabled: req.body.crossPostingEnabled,
      viralOptimizationLevel: req.body.viralOptimizationLevel,
      contentExamples: req.body.contentExamples,
      currentReleases: req.body.currentReleases,
      customInstructions: req.body.customInstructions,
      isActive: req.body.isActive ?? true,
      lastUpdated: new Date(),
    };

    const [existing] = await db
      .select()
      .from(autopilotPreferences)
      .where(eq(autopilotPreferences.userId, req.user.id));

    let result;
    if (existing) {
      [result] = await db
        .update(autopilotPreferences)
        .set(data)
        .where(eq(autopilotPreferences.userId, req.user.id))
        .returning();
    } else {
      [result] = await db
        .insert(autopilotPreferences)
        .values(data)
        .returning();
    }

    logger.info(`Autopilot preferences saved for user ${req.user.id}`);
    res.json(result);
  } catch (error) {
    logger.error('Error saving autopilot preferences:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

router.patch('/', async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [existing] = await db
      .select()
      .from(autopilotPreferences)
      .where(eq(autopilotPreferences.userId, req.user.id));

    if (!existing) {
      return res.status(404).json({ error: 'Preferences not found. Create them first.' });
    }

    const updateData = { ...req.body, lastUpdated: new Date() };
    delete updateData.id;
    delete updateData.userId;
    delete updateData.createdAt;

    const [result] = await db
      .update(autopilotPreferences)
      .set(updateData)
      .where(eq(autopilotPreferences.userId, req.user.id))
      .returning();

    logger.info(`Autopilot preferences updated for user ${req.user.id}`);
    res.json(result);
  } catch (error) {
    logger.error('Error updating autopilot preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
