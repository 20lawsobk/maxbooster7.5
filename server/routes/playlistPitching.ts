import { Router } from 'express';
import { db } from '../db';
import { playlistPitches, insertPlaylistPitchSchema } from '@shared/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { queryCache, createCacheKey } from '../lib/queryCache.js';
import { parsePaginationParams } from '../middleware/pagination.js';

const router = Router();

const CURATORS = [
  { id: '1', name: 'Indie Mono', genre: 'Indie, Pop', followers: '1.2M', submissionUrl: 'https://indiemono.com/submit-music/', email: 'submissions@indiemono.com' },
  { id: '2', name: 'Soundplate', genre: 'Electronic, House', followers: '500K', submissionUrl: 'https://soundplate.com/submit-music/', email: 'info@soundplate.com' },
  { id: '3', name: 'SubmitHub', genre: 'All Genres', followers: '5M+', submissionUrl: 'https://www.submithub.com/', email: 'support@submithub.com' },
  { id: '4', name: 'Daily Playlists', genre: 'All Genres', followers: '2M', submissionUrl: 'https://dailyplaylists.com/', email: 'hello@dailyplaylists.com' },
  { id: '5', name: 'Work Hard Playlist Hard', genre: 'Pop, Rock, Hip-Hop', followers: '150K', submissionUrl: 'https://workhardplaylisthard.com/submit/', email: 'info@workhardplaylisthard.com' },
  { id: '6', name: 'CloudKid', genre: 'Electronic, Trap, Pop', followers: '5M', submissionUrl: 'https://cldkid.com/submit', email: 'hello@cldkid.com' },
  { id: '7', name: 'Chillhop Music', genre: 'Lofi, Chillhop', followers: '3M', submissionUrl: 'https://chillhop.com/submit/', email: 'info@chillhop.com' },
  { id: '8', name: 'Majestic Casual', genre: 'Electronic, Indie, R&B', followers: '4M', submissionUrl: 'https://www.majesticcasual.com/submit', email: 'majestic@casual.com' },
  { id: '9', name: 'The Vibe Guide', genre: 'House, Pop', followers: '1M', submissionUrl: 'https://thevibeguide.net/submit', email: 'info@thevibeguide.net' },
  { id: '10', name: 'Birp.fm', genre: 'Indie', followers: '200K', submissionUrl: 'https://www.birp.fm/submit', email: 'hello@birp.fm' },
  { id: '11', name: 'Lofi Girl', genre: 'Lofi Hip Hop', followers: '12M', submissionUrl: 'https://lofigirl.com/pages/submit-your-music', email: 'hello@lofigirl.com' },
  { id: '12', name: 'Spinnin Records Playlists', genre: 'EDM, Dance', followers: '10M', submissionUrl: 'https://spinninrecords.com/talentpool/', email: 'talentpool@spinninrecords.com' },
  { id: '13', name: 'Selected.', genre: 'Deep House, House', followers: '2M', submissionUrl: 'https://www.selected-music.com/demo', email: 'demo@selected-music.com' },
  { id: '14', name: 'Trap Nation', genre: 'Trap, EDM', followers: '30M', submissionUrl: 'https://nations.io/submit', email: 'submissions@trapnation.io' },
  { id: '15', name: 'Proximity', genre: 'EDM, Progressive House', followers: '8M', submissionUrl: 'https://proximity.wetransfer.com/', email: 'proximity@proximity.com' },
  { id: '16', name: 'Colors x Studios', genre: 'Alternative, R&B, Hip Hop', followers: '6M', submissionUrl: 'https://colorsxstudios.com/contact', email: 'info@colorsxstudios.com' },
  { id: '17', name: 'Nice Guys', genre: 'Indie, Dream Pop', followers: '100K', submissionUrl: 'https://niceguys.fm/submit', email: 'hello@niceguys.fm' },
  { id: '18', name: 'The Jazz Hop Café', genre: 'Jazz Hop, Lofi', followers: '1M', submissionUrl: 'https://thejazzhopcafe.com/submissions', email: 'jazz@hopcafe.com' },
  { id: '19', name: 'AlexRainbirdMusic', genre: 'Indie Rock, Folk', followers: '1.2M', submissionUrl: 'https://www.alexrainbirdmusic.com/submit', email: 'alex@rainbirdmusic.com' },
  { id: '20', name: 'Eton Messy', genre: 'House, Electronic', followers: '500K', submissionUrl: 'https://etonmessy.com/submit', email: 'info@etonmessy.com' },
];

router.get('/curators', (_req, res) => {
  res.json(CURATORS);
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const pitches = await db.select()
      .from(playlistPitches)
      .where(eq(playlistPitches.userId, req.user!.id))
      .orderBy(desc(playlistPitches.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(pitches);
  } catch (error) {
    logger.warn('[PlaylistPitching] Failed to list pitches:', error);
    res.status(500).json({ error: 'Failed to fetch playlist pitches' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const validatedData = insertPlaylistPitchSchema.parse({ ...req.body, userId: req.user!.id });
    const [newPitch] = await db.insert(playlistPitches)
      .values(validatedData)
      .returning();
    await queryCache.invalidate(createCacheKey('stats:playlistPitches', req.user!.id));
    res.status(201).json(newPitch);
  } catch (error) {
    logger.warn('[PlaylistPitching] Failed to create pitch:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to create playlist pitch' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const validatedData = insertPlaylistPitchSchema.partial().omit({ userId: true }).parse(req.body);
    const [updatedPitch] = await db.update(playlistPitches)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(and(eq(playlistPitches.id, req.params.id), eq(playlistPitches.userId, req.user!.id)))
      .returning();

    if (!updatedPitch) return res.status(404).json({ error: 'Pitch not found' });
    await queryCache.invalidate(createCacheKey('stats:playlistPitches', req.user!.id));
    res.json(updatedPitch);
  } catch (error) {
    logger.warn('[PlaylistPitching] Failed to update pitch:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to update playlist pitch' });
  }
});

// PATCH /api/playlist-pitching/:id/status — record pitch outcome (placed, rejected, etc.)
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const statusSchema = z.object({
      status: z.enum(['draft', 'submitted', 'under_review', 'accepted', 'rejected', 'placed', 'following_up']),
      responseNote: z.string().max(2000).optional(),
    });
    const { status, responseNote } = statusSchema.parse(req.body);

    const setFields: Record<string, unknown> = { status, updatedAt: new Date() };
    if (responseNote !== undefined) setFields.responseNote = responseNote;
    if (['accepted', 'rejected', 'placed'].includes(status)) setFields.responseAt = new Date();
    if (status === 'submitted') setFields.submittedAt = new Date();

    const [updated] = await db.update(playlistPitches)
      .set(setFields)
      .where(and(eq(playlistPitches.id, id), eq(playlistPitches.userId, userId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Pitch not found' });
    await queryCache.invalidate(createCacheKey('stats:playlistPitches', userId));
    res.json(updated);
  } catch (error) {
    logger.warn('[PlaylistPitching] Failed to update status:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.flatten() });
    }
    res.status(500).json({ error: 'Failed to update pitch status' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const [deletedPitch] = await db.delete(playlistPitches)
      .where(and(eq(playlistPitches.id, req.params.id), eq(playlistPitches.userId, req.user!.id)))
      .returning();

    if (!deletedPitch) return res.status(404).json({ error: 'Pitch not found' });
    await queryCache.invalidate(createCacheKey('stats:playlistPitches', req.user!.id));
    res.json({ success: true });
  } catch (error) {
    logger.warn('[PlaylistPitching] Failed to delete pitch:', error);
    res.status(500).json({ error: 'Failed to delete playlist pitch' });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cacheKey = createCacheKey('stats:playlistPitches', userId);

    const result = await queryCache.getOrCompute(cacheKey, async () => {
      const stats = await db.select({
        status: playlistPitches.status,
        count: sql<number>`count(*)`,
      })
        .from(playlistPitches)
        .where(eq(playlistPitches.userId, userId))
        .groupBy(playlistPitches.status);

      const r = { total: 0, accepted: 0, pending: 0, rejected: 0, conversionRate: 0 };
      stats.forEach(s => {
        r.total += Number(s.count);
        if (s.status === 'accepted') r.accepted = Number(s.count);
        if (s.status === 'submitted' || s.status === 'under_review') r.pending += Number(s.count);
        if (s.status === 'rejected') r.rejected = Number(s.count);
      });
      if (r.total > 0) r.conversionRate = (r.accepted / r.total) * 100;
      return r;
    }, 300);

    res.json(result);
  } catch (error) {
    logger.warn('[PlaylistPitching] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /:id must come after /stats to prevent route shadowing
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [item] = await db.select().from(playlistPitches)
      .where(and(eq(playlistPitches.id, req.params.id), eq(playlistPitches.userId, req.user!.id)))
      .limit(1);
    if (!item) return res.status(404).json({ error: 'Pitch not found' });
    res.json(item);
  } catch (error) {
    logger.warn('[PlaylistPitching] Failed to fetch pitch:', error);
    res.status(500).json({ error: 'Failed to fetch playlist pitch' });
  }
});

export default router;
