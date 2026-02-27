import { Router } from 'express';
import { db } from '../db';
import { playlistPitches, insertPlaylistPitchSchema } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

// GET /api/playlist-pitching - list user's submissions with status
router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  
  const pitches = await db.select()
    .from(playlistPitches)
    .where(eq(playlistPitches.userId, req.session.userId))
    .orderBy(desc(playlistPitches.createdAt));
    
  res.json(pitches);
});

// POST /api/playlist-pitching - create new pitch
router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  
  try {
    const validatedData = insertPlaylistPitchSchema.parse(req.body);
    const [newPitch] = await db.insert(playlistPitches)
      .values({
        ...validatedData,
        userId: req.session.userId,
      })
      .returning();
      
    res.json(newPitch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).send('Internal Server Error');
  }
});

// PUT /api/playlist-pitching/:id - update pitch
router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  
  try {
    const [updatedPitch] = await db.update(playlistPitches)
      .set({
        ...req.body,
        updatedAt: new Date(),
      })
      .where(and(
        eq(playlistPitches.id, req.params.id),
        eq(playlistPitches.userId, req.session.userId)
      ))
      .returning();
      
    if (!updatedPitch) return res.status(404).send('Pitch not found');
    res.json(updatedPitch);
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});

// DELETE /api/playlist-pitching/:id - delete pitch
router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  
  const [deletedPitch] = await db.delete(playlistPitches)
    .where(and(
      eq(playlistPitches.id, req.params.id),
      eq(playlistPitches.userId, req.session.userId)
    ))
    .returning();
    
  if (!deletedPitch) return res.status(404).send('Pitch not found');
  res.json({ success: true });
});

// GET /api/playlist-pitching/curators - list known playlist curators
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

router.get('/curators', (req, res) => {
  res.json(CURATORS);
});

// GET /api/playlist-pitching/stats - accepted count, pending, rejected, conversion rate
router.get('/stats', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  
  const stats = await db.select({
    status: playlistPitches.status,
    count: sql<number>`count(*)`,
  })
  .from(playlistPitches)
  .where(eq(playlistPitches.userId, req.session.userId))
  .groupBy(playlistPitches.status);
  
  const result = {
    total: 0,
    accepted: 0,
    pending: 0,
    rejected: 0,
    conversionRate: 0,
  };
  
  stats.forEach(s => {
    result.total += Number(s.count);
    if (s.status === 'accepted') result.accepted = Number(s.count);
    if (s.status === 'submitted' || s.status === 'under_review') result.pending += Number(s.count);
    if (s.status === 'rejected') result.rejected = Number(s.count);
  });
  
  if (result.total > 0) {
    result.conversionRate = (result.accepted / result.total) * 100;
  }
  
  res.json(result);
});

export default router;
