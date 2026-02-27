import { Router } from 'express';
import { db } from '../db';
import { songwritingSessions, insertSongwritingSessionSchema } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const sessions = await db.select().from(songwritingSessions)
    .where(eq(songwritingSessions.userId, req.session.userId))
    .orderBy(desc(songwritingSessions.updatedAt));
  res.json(sessions);
});

router.post('/', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = insertSongwritingSessionSchema.parse({ ...req.body, userId: req.session.userId });
    const [session] = await db.insert(songwritingSessions).values(data).returning();
    res.json(session);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const [session] = await db.update(songwritingSessions)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(songwritingSessions.id, req.params.id))
    .returning();
  res.json(session);
});

router.delete('/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  await db.delete(songwritingSessions).where(eq(songwritingSessions.id, req.params.id));
  res.json({ success: true });
});

router.post('/ai-assist', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  const { prompt, genre, mood, existing } = req.body;
  const suggestions: string[] = [];
  const rhymes = getRhymes(prompt);
  const chord = getChordSuggestion(genre, mood);
  res.json({ suggestions, rhymes, chordProgression: chord, structures: getSongStructures() });
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
  };
  const w = (word || '').toLowerCase().trim();
  return rhymeMap[w] || ['(type a word to get rhymes)'];
}

function getChordSuggestion(genre?: string, mood?: string): string {
  const progressions: Record<string, string[]> = {
    pop: ['I – V – vi – IV (C–G–Am–F)', 'I – IV – V (C–F–G)', 'vi – IV – I – V (Am–F–C–G)'],
    'hip-hop': ['i – VII – VI (Am–G–F)', 'i – iv – VII (Am–Dm–G)', 'I – IV – I – V (C–F–C–G)'],
    rnb: ['Imaj7 – IVmaj7 – iii – vi (Cmaj7–Fmaj7–Em–Am)', 'ii – V – I (Dm–G–C)'],
    rock: ['I – IV – V (C–F–G)', 'I – bVII – IV (C–Bb–F)', 'vi – IV – I – V'],
    country: ['I – IV – V – I', 'I – V – vi – IV', 'I – II – IV – I'],
    electronic: ['i – VI – III – VII', 'I – V – vi – IV', 'i – iv – i – V'],
  };
  const g = (genre || 'pop').toLowerCase();
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
  ];
}

export default router;
