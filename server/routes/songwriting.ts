import { Router } from 'express';
import { db } from '../db';
import { songwritingSessions, insertSongwritingSessionSchema } from '@shared/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { z } from 'zod';
import { parsePaginationParams } from '../middleware/pagination.js';
import { unifiedAIController } from '../services/unifiedAIController.js';

const router = Router();

const aiAssistSchema = z.object({
  prompt: z.string().max(1000).optional(),
  genre: z.string().max(100).optional(),
  mood: z.string().max(100).optional(),
  existing: z.string().max(5000).optional(),
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const sessions = await db.select().from(songwritingSessions)
      .where(eq(songwritingSessions.userId, req.user!.id))
      .orderBy(desc(songwritingSessions.updatedAt))
      .limit(limit)
      .offset(offset);
    res.json(sessions);
  } catch (error) {
    logger.error('[Songwriting] Failed to list sessions:', error);
    res.status(500).json({ error: 'Failed to fetch songwriting sessions' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const data = insertSongwritingSessionSchema.parse({ ...req.body, userId: req.user!.id });
    const [session] = await db.insert(songwritingSessions).values(data).returning();
    res.status(201).json(session);
  } catch (error: unknown) {
    logger.error('[Songwriting] Failed to create session:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: (error as any).flatten() });
    }
    res.status(500).json({ error: 'Failed to create songwriting session' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(songwritingSessions)
      .where(and(eq(songwritingSessions.id, id), eq(songwritingSessions.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const data = insertSongwritingSessionSchema.partial().parse(req.body);
    const [session] = await db.update(songwritingSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(songwritingSessions.id, id), eq(songwritingSessions.userId, userId)))
      .returning();
    res.json(session);
  } catch (error: unknown) {
    logger.error('[Songwriting] Failed to update session:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: (error as any).flatten() });
    }
    res.status(500).json({ error: 'Failed to update songwriting session' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(songwritingSessions)
      .where(and(eq(songwritingSessions.id, id), eq(songwritingSessions.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await db.delete(songwritingSessions)
      .where(and(eq(songwritingSessions.id, id), eq(songwritingSessions.userId, userId)));
    res.json({ success: true });
  } catch (error) {
    logger.error('[Songwriting] Failed to delete session:', error);
    res.status(500).json({ error: 'Failed to delete songwriting session' });
  }
});

router.post('/ai-assist', requireAuth, async (req, res) => {
  try {
    const parsed = aiAssistSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    }

    const { prompt = '', genre = 'pop', mood = 'uplifting', existing = '' } = parsed.data;
    const genreNorm = (genre || 'pop').toLowerCase();
    const moodNorm = (mood || 'uplifting').toLowerCase();

    let suggestions: string[] = [];
    let rhymes: string[] = [];

    const [lyricResult, rhymeResult] = await Promise.allSettled([
      unifiedAIController.generateContent({
        topic: `${genreNorm} song lyric ideas about "${prompt || 'music'}", ${moodNorm} mood${existing ? ', continuing: ' + existing.slice(0, 200) : ''}`,
        contentType: 'engagement',
        tone: 'energetic',
        platform: 'instagram',
        includeHashtags: false,
        includeEmojis: false,
      }),
      prompt
        ? unifiedAIController.generateContent({
            topic: `${genreNorm} lyrics with words that rhyme with "${prompt}"`,
            contentType: 'engagement',
            tone: 'casual',
            platform: 'twitter',
            includeHashtags: false,
            includeEmojis: false,
          })
        : Promise.resolve(null),
    ]);

    if (lyricResult.status === 'fulfilled' && lyricResult.value?.success && lyricResult.value.data) {
      const text: string = lyricResult.value.data.caption || '';
      suggestions = text
        .split(/[.!?]+/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 8)
        .slice(0, 5);
    }

    if (
      rhymeResult.status === 'fulfilled' &&
      rhymeResult.value &&
      (rhymeResult.value as any)?.success &&
      (rhymeResult.value as any)?.data
    ) {
      const rhymeText: string = (rhymeResult.value as any).data.caption || '';
      const extracted = rhymeText
        .split(/[\s,;|/]+/)
        .map((w: string) => w.replace(/[^a-zA-Z'-]/g, '').toLowerCase())
        .filter((w: string) => w.length > 2 && w.length < 16 && w !== prompt?.toLowerCase())
        .slice(0, 8);
      rhymes = extracted.length > 0 ? extracted : getRhymes(prompt);
    } else {
      rhymes = getRhymes(prompt);
    }

    if (suggestions.length === 0) {
      suggestions = getDefaultSuggestions(prompt, genreNorm, moodNorm);
    }

    res.json({
      suggestions,
      rhymes,
      chordProgression: getChordSuggestion(genreNorm, moodNorm),
      structures: getSongStructures(),
    });
  } catch (error) {
    logger.error('[Songwriting] AI assist error:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

function getRhymes(word: string): string[] {
  const rhymeMap: Record<string, string[]> = {
    love: ['above', 'dove', 'shove', 'glove', 'of'],
    heart: ['start', 'art', 'apart', 'smart', 'part'],
    life: ['wife', 'knife', 'strife', 'rife'],
    night: ['light', 'right', 'fight', 'sight', 'might', 'bright', 'white'],
    day: ['way', 'say', 'play', 'stay', 'away', 'today', 'okay'],
    mind: ['find', 'blind', 'kind', 'behind', 'defined'],
    time: ['rhyme', 'climb', 'prime', 'dime', 'crime'],
    fire: ['desire', 'higher', 'wire', 'inspire', 'entire'],
    real: ['feel', 'deal', 'heal', 'reveal', 'appeal', 'steel'],
    pain: ['rain', 'gain', 'again', 'remain', 'insane', 'chain'],
    dream: ['seem', 'team', 'stream', 'scheme', 'extreme'],
    shine: ['mine', 'fine', 'line', 'divine', 'define', 'nine'],
    soul: ['whole', 'role', 'goal', 'toll', 'control', 'scroll'],
    flow: ['know', 'show', 'grow', 'glow', 'below', 'bestow'],
    game: ['name', 'fame', 'claim', 'flame', 'came', 'same'],
    rise: ['eyes', 'skies', 'ties', 'wise', 'disguise', 'surprise'],
    wave: ['save', 'brave', 'gave', 'grave', 'behave', 'crave'],
    sound: ['found', 'ground', 'bound', 'around', 'profound', 'crown'],
  };
  const w = (word || '').toLowerCase().trim();
  return rhymeMap[w] || ['(type a word to get rhymes)'];
}

function getDefaultSuggestions(prompt: string, genre: string, mood: string): string[] {
  const theme = prompt || 'music';
  return [
    `Write a ${mood} verse about ${theme} in a ${genre} style`,
    `Create a hook that captures the feeling of ${theme}`,
    `Build a bridge that transitions the emotion around ${theme}`,
    `Open with a strong image or metaphor related to ${theme}`,
  ];
}

function getChordSuggestion(genre?: string, mood?: string): string {
  const progressions: Record<string, string[]> = {
    pop: ['I – V – vi – IV (C–G–Am–F)', 'I – IV – V (C–F–G)', 'vi – IV – I – V (Am–F–C–G)'],
    'hip-hop': ['i – VII – VI (Am–G–F)', 'i – iv – VII (Am–Dm–G)', 'I – IV – I – V (C–F–C–G)'],
    rnb: ['Imaj7 – IVmaj7 – iii – vi (Cmaj7–Fmaj7–Em–Am)', 'ii – V – I (Dm–G–C)'],
    rock: ['I – IV – V (C–F–G)', 'I – bVII – IV (C–Bb–F)', 'vi – IV – I – V'],
    country: ['I – IV – V – I', 'I – V – vi – IV', 'I – II – IV – I'],
    electronic: ['i – VI – III – VII', 'I – V – vi – IV', 'i – iv – i – V'],
    reggae: ['I – IV – I – V', 'I – bVII – IV', 'i – VII – VI – VII'],
    jazz: ['ii – V – I (Dm7–G7–Cmaj7)', 'I – VI – ii – V', 'iii – VI – ii – V'],
    blues: ['I – IV – I – V – IV – I (12-bar blues)', 'i – iv – i – V'],
    trap: ['i – VI – III – VII', 'i – VII – VI – VII', 'i – iv – bVII – i'],
    soul: ['I – IV – iii – vi', 'ii – V – I – VI', 'Imaj7 – IVmaj7 – ii – V'],
    folk: ['I – IV – V – I', 'I – V – IV – I', 'vi – IV – I – V'],
  };
  const moodOverrides: Record<string, string> = {
    dark: 'i – VI – III – VII',
    sad: 'vi – IV – I – V (minor feel)',
    happy: 'I – V – vi – IV',
    uplifting: 'I – IV – V – I',
    aggressive: 'i – bVII – bVI – V',
    romantic: 'Imaj7 – IVmaj7 – iii – vi',
    nostalgic: 'I – vi – IV – V',
  };

  const g = (genre || 'pop').toLowerCase();
  const m = (mood || '').toLowerCase();

  if (m && moodOverrides[m]) {
    return moodOverrides[m];
  }

  const options = progressions[g] || progressions['pop'];
  return options[Math.floor(Math.random() * options.length)];
}

function getSongStructures(): string[] {
  return [
    'Verse – Chorus – Verse – Chorus – Bridge – Chorus',
    'Intro – Verse – Pre-Chorus – Chorus – Verse – Pre-Chorus – Chorus – Outro',
    'Intro – Verse – Chorus – Verse – Chorus – Bridge – Chorus – Outro',
    'Verse – Verse – Chorus – Verse – Chorus – Outro',
    'Intro – Hook – Verse – Hook – Bridge – Hook',
    'Verse – Chorus – Verse – Chorus – Chorus (extended outro)',
    'Hook – Verse – Hook – Verse – Bridge – Hook',
  ];
}

export default router;
