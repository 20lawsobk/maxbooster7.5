import { Router } from "express";
import { db } from "../db";
import {
  songwritingSessions,
  insertSongwritingSessionSchema,
} from "@shared/schema";
import { and, eq, desc, count, sql, ilike, or } from "drizzle-orm";
import { requireAuth } from "../middleware/auth?.js";
import { logger } from "../logger?.js";
import { z } from "zod";
import { parsePaginationParams } from "../middleware/pagination?.js";
import { queryCache, createCacheKey } from "../lib/queryCache?.js";
import { unifiedAIController } from "../services/unifiedAIController?.js";
import { musicIndustryContextFilter } from "../services/musicIndustryContextFilter?.js";

const _router = Router();
const _CACHE_TTL = 120;

const _aiAssistSchema = z?.object({
  prompt: z?.string().max(1000).optional(),
  genre: z?.string().max(100).optional(),
  mood: z?.string().max(100).optional(),
  existing: z?.string().max(5000).optional(),
});

router?.get("/", requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePaginationParams(req);
    const { search, genre, mood, status } = req?.query;

    const _conditions = [eq(songwritingSessions?.userId, req?.user!.id)];
    if (search && typeof search === "string" && search?.trim()) {
      // Clamp search to 200 chars — an unbounded ilike pattern causes the DB
      // to do a full-table regex scan against potentially very long strings.
      const _safeSearch = search?.trim().slice(0, 200);
      conditions?.push(
        or(
          ilike(songwritingSessions?.title, `%${safeSearch}%`),
          ilike(songwritingSessions?.notes, `%${safeSearch}%`),
        ) as Record<string, unknown>,
      );
    }
    if (genre && typeof genre === "string") {
      conditions?.push(eq(songwritingSessions?.genre, genre));
    }
    if (mood && typeof mood === "string") {
      conditions?.push(eq(songwritingSessions?.mood, mood));
    }
    if (status && typeof status === "string") {
      conditions?.push(eq(songwritingSessions?.status, status));
    }

    const _sessions = await db
      .select()
      .from(songwritingSessions)
      .where(and(...conditions))
      .orderBy(desc(songwritingSessions?.updatedAt))
      .limit(limit)
      .offset(offset);
    res?.json(sessions);
  } catch (error) {
    logger?.warn({ err: error }, "[Songwriting] Failed to list sessions:");
    res?.status(500).json({ error: "Failed to fetch songwriting sessions" });
  }
});

router?.get("/stats", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const _cacheKey = createCacheKey("stats:songwriting", userId);

    const _stats = await queryCache?.getOrCompute(
      cacheKey,
      async () => {
        const [totals] = await db
          .select({
            total: count(),
            inProgress: sql<number>`count(*) filter (where status = 'in_progress')`,
            completed: sql<number>`count(*) filter (where status = 'completed')`,
            archived: sql<number>`count(*) filter (where status = 'archived')`,
            aiAssisted: sql<number>`count(*) filter (where ai_assisted = true)`,
            withCoWriters: sql<number>`count(*) filter (where array_length(co_writers, 1) > 0)`,
            withLyrics: sql<number>`count(*) filter (where lyrics is not null and lyrics != '')`,
          })
          .from(songwritingSessions)
          .where(eq(songwritingSessions?.userId, userId));

        const _genreBreakdown = await db
          .select({
            genre: songwritingSessions?.genre,
            count: count(),
          })
          .from(songwritingSessions)
          .where(
            and(eq(songwritingSessions?.userId, userId), sql`genre is not null`),
          )
          .groupBy(songwritingSessions?.genre)
          .orderBy(desc(count()))
          .limit(8);

        return {
          total: Number(totals?.total),
          inProgress: Number(totals?.inProgress),
          completed: Number(totals?.completed),
          archived: Number(totals?.archived),
          aiAssisted: Number(totals?.aiAssisted),
          withCoWriters: Number(totals?.withCoWriters),
          withLyrics: Number(totals?.withLyrics),
          topGenres: genreBreakdown?.map((g) => ({
            genre: g?.genre,
            count: Number(g?.count),
          })),
        };
      },
      CACHE_TTL,
    );

    res?.json(stats);
  } catch (error) {
    logger?.warn({ err: error }, "[Songwriting] Failed to fetch stats:");
    res?.status(500).json({ error: "Failed to fetch songwriting stats" });
  }
});

router?.get("/:id", requireAuth, async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(songwritingSessions)
      .where(
        and(
          eq(songwritingSessions?.id, req?.params.id),
          eq(songwritingSessions?.userId, req?.user!.id),
        ),
      )
      .limit(1);
    if (!item) return res?.status(404).json({ error: "Session not found" });
    res?.json(item);
  } catch (error) {
    logger?.warn({ err: error }, "[Songwriting] Failed to fetch session:");
    res?.status(500).json({ error: "Failed to fetch songwriting session" });
  }
});

router?.post("/", requireAuth, async (req, res) => {
  try {
    const _data = insertSongwritingSessionSchema?.parse({
      ...req?.body,
      userId: req?.user!.id,
    });
    const [session] = await db
      .insert(songwritingSessions)
      .values(data)
      .returning();
    await queryCache?.invalidate(
      createCacheKey("stats:songwriting", req?.user!.id),
    );
    res?.status(201).json(session);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[Songwriting] Failed to create session:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to create songwriting session" });
  }
});

router?.put("/:id", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { id } = req?.params;

    const _existing = await db
      .select()
      .from(songwritingSessions)
      .where(
        and(
          eq(songwritingSessions?.id, id),
          eq(songwritingSessions?.userId, userId),
        ),
      )
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Session not found" });
    }

    const _data = insertSongwritingSessionSchema?.partial().parse(req?.body);
    const [session] = await db
      .update(songwritingSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(songwritingSessions?.id, id),
          eq(songwritingSessions?.userId, userId),
        ),
      )
      .returning();
    await queryCache?.invalidate(createCacheKey("stats:songwriting", userId));
    res?.json(session);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "[Songwriting] Failed to update session:");
    if (error instanceof Error && error?.name === "ZodError") {
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: (error as Record<string, unknown>).flatten(),
        });
    }
    res?.status(500).json({ error: "Failed to update songwriting session" });
  }
});

router?.delete("/:id", requireAuth, async (req, res) => {
  try {
    const _userId = req?.user!.id;
    const { id } = req?.params;

    const _existing = await db
      .select()
      .from(songwritingSessions)
      .where(
        and(
          eq(songwritingSessions?.id, id),
          eq(songwritingSessions?.userId, userId),
        ),
      )
      .limit(1);

    if (existing?.length === 0) {
      return res?.status(404).json({ error: "Session not found" });
    }

    await db
      .delete(songwritingSessions)
      .where(
        and(
          eq(songwritingSessions?.id, id),
          eq(songwritingSessions?.userId, userId),
        ),
      );
    await queryCache?.invalidate(createCacheKey("stats:songwriting", userId));
    res?.json({ success: true });
  } catch (error) {
    logger?.warn({ err: error }, "[Songwriting] Failed to delete session:");
    res?.status(500).json({ error: "Failed to delete songwriting session" });
  }
});

router?.get("/rhyme/:word", requireAuth, async (req, res) => {
  try {
    const _word = req?.params.word
      .toLowerCase()
      .trim()
      .replace(/[^a-z'-]/g, "");
    if (!word || word?.length < 2) {
      return res
        .status(400)
        .json({ error: "Word must be at least 2 characters" });
    }
    const _rhymes = getRhymes(word);
    res?.json({ word, rhymes, count: rhymes?.length });
  } catch (error) {
    logger?.warn({ err: error }, "[Songwriting] Rhyme lookup error:");
    res?.status(500).json({ error: "Failed to look up rhymes" });
  }
});

router?.post("/ai-assist", requireAuth, async (req, res) => {
  try {
    const _parsed = aiAssistSchema?.safeParse(req?.body);
    if (!parsed?.success) {
      return res
        .status(400)
        .json({ error: "Validation error", details: parsed?.error.flatten() });
    }

    const {
      prompt = "",
      genre = "pop",
      mood = "uplifting",
      existing = "",
    } = parsed?.data;
    const _genreNorm = (genre || "pop").toLowerCase();
    const _moodNorm = (mood || "uplifting").toLowerCase();

    let suggestions: string[] = [];
    let rhymes: string[] = [];

    // Fetch live industry context for songwriting — appended as extraContext so
    // MaxCore understands what lyrical themes and genres are culturally resonant now.
    // Falls back gracefully to undefined (no behaviour change) if filter is unavailable.
    const __swCtx = await musicIndustryContextFilter
      .getContextForMode("songwriting")
      .catch(() => null);
    const __swExtraContext = _swCtx?.contextString || undefined;

    const [lyricResult, rhymeResult] = await Promise?.allSettled([
      unifiedAIController?.generateContent({
        topic: `${genreNorm} song lyric ideas about "${prompt || "music"}", ${moodNorm} mood${existing ? ", continuing: " + existing?.slice(0, 200) : ""}`,
        contentType: "engagement",
        tone: "energetic",
        platform: "instagram",
        includeHashtags: false,
        includeEmojis: false,
        extraContext: _swExtraContext,
      }),
      prompt
        ? unifiedAIController?.generateContent({
            topic: `${genreNorm} lyrics with words that rhyme with "${prompt}"`,
            contentType: "engagement",
            tone: "casual",
            platform: "twitter",
            includeHashtags: false,
            includeEmojis: false,
          })
        : Promise?.resolve(null),
    ]);

    if (
      lyricResult?.status === "fulfilled" &&
      lyricResult?.value?.success &&
      lyricResult?.value.data
    ) {
      const text: string = lyricResult?.value.data?.caption || "";
      suggestions = text
        .split(/[.!?]+/)
        .map((l: string) => l?.trim())
        .filter((l: string) => l?.length > 8)
        .slice(0, 5);
    }

    if (
      rhymeResult?.status === "fulfilled" &&
      rhymeResult?.value &&
      (rhymeResult?.value as Record<string, unknown>)?.success &&
      (rhymeResult?.value as Record<string, unknown>)?.data
    ) {
      const rhymeText: string =
        (rhymeResult?.value as Record<string, unknown>).data?.caption || "";
      const _extracted = rhymeText
        .split(/[\s,;|/]+/)
        .map((w: string) => w?.replace(/[^a-zA-Z'-]/g, "").toLowerCase())
        .filter(
          (w: string) =>
            w?.length > 2 && w?.length < 16 && w !== prompt?.toLowerCase(),
        )
        .slice(0, 8);
      rhymes = extracted?.length > 0 ? extracted : getRhymes(prompt);
    } else {
      rhymes = getRhymes(prompt);
    }

    if (suggestions?.length === 0) {
      suggestions = getDefaultSuggestions(prompt, genreNorm, moodNorm);
    }

    res?.json({
      suggestions,
      rhymes,
      chordProgression: getChordSuggestion(genreNorm, moodNorm),
      structures: getSongStructures(),
    });
  } catch (error) {
    logger?.warn({ err: error }, "[Songwriting] AI assist error:");
    res?.status(500).json({ error: "Failed to generate suggestions" });
  }
});

function getRhymes(word: string): string[] {
  const rhymeMap: Record<string, string[]> = {
    love: ["above", "dove", "shove", "glove", "push and shove", "of"],
    heart: [
      "start",
      "art",
      "apart",
      "smart",
      "part",
      "chart",
      "dart",
      "impart",
    ],
    life: ["wife", "knife", "strife", "rife", "afterlife"],
    night: [
      "light",
      "right",
      "fight",
      "sight",
      "might",
      "bright",
      "white",
      "ignite",
      "delight",
      "tight",
    ],
    day: [
      "way",
      "say",
      "play",
      "stay",
      "away",
      "today",
      "okay",
      "lay",
      "pay",
      "ray",
      "sway",
    ],
    mind: [
      "find",
      "blind",
      "kind",
      "behind",
      "defined",
      "grind",
      "remind",
      "bind",
      "signed",
    ],
    time: [
      "rhyme",
      "climb",
      "prime",
      "dime",
      "crime",
      "sublime",
      "paradigm",
      "overtime",
    ],
    fire: [
      "desire",
      "higher",
      "wire",
      "inspire",
      "entire",
      "admire",
      "require",
      "empire",
    ],
    real: [
      "feel",
      "deal",
      "heal",
      "reveal",
      "appeal",
      "steel",
      "kneel",
      "conceal",
      "ideal",
    ],
    pain: [
      "rain",
      "gain",
      "again",
      "remain",
      "insane",
      "chain",
      "vain",
      "strain",
      "contain",
      "refrain",
    ],
    dream: [
      "seem",
      "team",
      "stream",
      "scheme",
      "extreme",
      "gleam",
      "cream",
      "esteem",
      "regime",
    ],
    shine: [
      "mine",
      "fine",
      "line",
      "divine",
      "define",
      "nine",
      "wine",
      "spine",
      "resign",
      "combine",
    ],
    soul: [
      "whole",
      "role",
      "goal",
      "toll",
      "control",
      "scroll",
      "patrol",
      "console",
      "extol",
    ],
    flow: [
      "know",
      "show",
      "grow",
      "glow",
      "below",
      "bestow",
      "although",
      "aglow",
      "radio",
    ],
    game: [
      "name",
      "fame",
      "claim",
      "flame",
      "came",
      "same",
      "blame",
      "frame",
      "proclaim",
      "reclaim",
    ],
    rise: [
      "eyes",
      "skies",
      "ties",
      "wise",
      "disguise",
      "surprise",
      "flies",
      "cries",
      "ties",
      "demise",
    ],
    wave: [
      "save",
      "brave",
      "gave",
      "grave",
      "behave",
      "crave",
      "pave",
      "cave",
      "rave",
      "slave",
    ],
    sound: [
      "found",
      "ground",
      "bound",
      "around",
      "profound",
      "crown",
      "drowned",
      "surround",
      "rebound",
    ],
    sky: [
      "fly",
      "high",
      "why",
      "try",
      "cry",
      "by",
      "my",
      "deny",
      "defy",
      "rely",
      "reply",
      "amplify",
    ],
    gold: [
      "bold",
      "told",
      "cold",
      "hold",
      "old",
      "sold",
      "unfold",
      "behold",
      "controlled",
      "untold",
    ],
    road: [
      "code",
      "mode",
      "load",
      "ode",
      "showed",
      "slowed",
      "bestowed",
      "overflowed",
      "unloaded",
    ],
    free: [
      "be",
      "see",
      "me",
      "we",
      "tree",
      "key",
      "agree",
      "flee",
      "guarantee",
      "decree",
    ],
    run: [
      "sun",
      "gun",
      "fun",
      "done",
      "one",
      "begun",
      "overcome",
      "undone",
      "outrun",
      "spun",
    ],
    power: ["hour", "tower", "flower", "shower", "our", "devour", "empower"],
    light: [
      "right",
      "night",
      "fight",
      "sight",
      "might",
      "bright",
      "white",
      "ignite",
      "unite",
      "delight",
    ],
    king: [
      "bring",
      "ring",
      "sing",
      "thing",
      "spring",
      "wing",
      "string",
      "everything",
      "offering",
    ],
    true: [
      "you",
      "do",
      "through",
      "new",
      "blue",
      "grew",
      "knew",
      "pursue",
      "breakthrough",
      "renew",
    ],
    win: [
      "begin",
      "within",
      "skin",
      "spin",
      "again",
      "discipline",
      "origin",
      "feminine",
    ],
    gone: [
      "on",
      "strong",
      "along",
      "belong",
      "prolong",
      "carry on",
      "carry along",
    ],
    top: [
      "drop",
      "stop",
      "hop",
      "non-stop",
      "rooftop",
      "shop",
      "pop",
      "raindrop",
    ],
    back: [
      "track",
      "lack",
      "stack",
      "attack",
      "black",
      "crack",
      "setback",
      "flashback",
    ],
    deep: [
      "keep",
      "sleep",
      "speak",
      "seek",
      "leap",
      "weep",
      "reap",
      "steep",
      "creep",
    ],
    move: [
      "prove",
      "groove",
      "improve",
      "above",
      "approve",
      "remove",
      "soothe",
    ],
    world: ["swirled", "hurled", "curled", "unfurled", "twirled"],
    alone: [
      "known",
      "shown",
      "bone",
      "stone",
      "phone",
      "zone",
      "drone",
      "throne",
      "tone",
      "own",
      "overthrown",
      "microphone",
      "cornerstone",
    ],
    strong: [
      "long",
      "song",
      "along",
      "belong",
      "prolong",
      "wrong",
      "all along",
    ],
    floor: [
      "more",
      "core",
      "score",
      "before",
      "restore",
      "explore",
      "adore",
      "ignore",
      "soar",
    ],
    way: [
      "say",
      "day",
      "play",
      "stay",
      "away",
      "okay",
      "lay",
      "pay",
      "ray",
      "sway",
      "relay",
    ],
    breath: ["death", "beneath", "bequeath", "underneath"],
    high: [
      "sky",
      "fly",
      "try",
      "why",
      "cry",
      "deny",
      "defy",
      "rely",
      "reply",
      "qualify",
    ],
    number: ["thunder", "wonder", "under", "asunder", "blunder", "plunder"],
    place: [
      "face",
      "space",
      "grace",
      "race",
      "trace",
      "embrace",
      "replace",
      "chase",
      "base",
      "erase",
    ],
    money: ["funny", "sunny", "honey", "bunny", "runway", "one day"],
    name: [
      "fame",
      "game",
      "claim",
      "flame",
      "came",
      "same",
      "blame",
      "frame",
      "proclaim",
    ],
    hate: [
      "late",
      "fate",
      "great",
      "wait",
      "state",
      "rate",
      "create",
      "relate",
      "celebrate",
    ],
    break: [
      "take",
      "make",
      "shake",
      "wake",
      "fake",
      "lake",
      "sake",
      "heartache",
      "mistake",
    ],
    fly: [
      "sky",
      "high",
      "try",
      "cry",
      "by",
      "my",
      "deny",
      "defy",
      "rely",
      "reply",
      "supply",
    ],
    cold: [
      "bold",
      "told",
      "hold",
      "old",
      "sold",
      "gold",
      "unfold",
      "behold",
      "controlled",
    ],
    feel: [
      "real",
      "deal",
      "heal",
      "reveal",
      "appeal",
      "steel",
      "conceal",
      "ideal",
      "kneel",
    ],
    stay: [
      "day",
      "way",
      "say",
      "play",
      "away",
      "okay",
      "lay",
      "pay",
      "ray",
      "sway",
      "relay",
    ],
    pray: [
      "day",
      "way",
      "say",
      "play",
      "stay",
      "away",
      "okay",
      "lay",
      "pay",
      "ray",
      "sway",
    ],
    hand: [
      "stand",
      "land",
      "band",
      "sand",
      "understand",
      "demand",
      "expand",
      "planned",
    ],
    chance: [
      "dance",
      "advance",
      "romance",
      "enhance",
      "glance",
      "trance",
      "circumstance",
    ],
    door: [
      "more",
      "core",
      "score",
      "before",
      "restore",
      "explore",
      "adore",
      "ignore",
      "soar",
      "floor",
    ],
    better: [
      "letter",
      "weather",
      "together",
      "forever",
      "whether",
      "never",
      "ever",
      "clever",
    ],
    fear: [
      "near",
      "hear",
      "year",
      "clear",
      "here",
      "appear",
      "sincere",
      "career",
      "volunteer",
    ],
    stand: [
      "hand",
      "land",
      "band",
      "sand",
      "understand",
      "demand",
      "expand",
      "planned",
      "command",
    ],
    hard: [
      "star",
      "far",
      "guard",
      "card",
      "regard",
      "scarred",
      "charred",
      "unmarred",
    ],
    born: [
      "worn",
      "torn",
      "sworn",
      "corn",
      "horn",
      "morning",
      "scorn",
      "forlorn",
      "reborn",
    ],
    see: [
      "free",
      "be",
      "me",
      "we",
      "tree",
      "key",
      "agree",
      "guarantee",
      "decree",
      "spree",
    ],
    know: [
      "flow",
      "show",
      "grow",
      "glow",
      "below",
      "bestow",
      "although",
      "aglow",
      "let go",
    ],
    live: ["give", "forgive", "outlive", "relive", "positive", "fugitive"],
  };
  const _w = (word || "").toLowerCase().trim();
  return rhymeMap[w] || ["(type a word to get rhymes)"];
}

function getDefaultSuggestions(
  prompt: string,
  genre: string,
  mood: string,
): string[] {
  const _theme = prompt || "music";
  return [
    `Write a ${mood} verse about ${theme} in a ${genre} style`,
    `Create a hook that captures the feeling of ${theme} — keep it under 8 bars`,
    `Build a bridge that shifts the emotional perspective on ${theme}`,
    `Open with a strong image or metaphor related to ${theme}`,
    `End with a callback to your opening line about ${theme} for a full-circle structure`,
  ];
}

// ── Deterministic PRNG — FNV-1a 32-bit ──────────────────────────────────────
function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed?.length; i++) {
    h ^= seed?.charCodeAt(i);
    h = Math?.imul(h, 16777619);
    h >>>= 0;
  }
  return h % length;
}
// ────────────────────────────────────────────────────────────────────────────

function getChordSuggestion(genre?: string, mood?: string): string {
  const progressions: Record<string, string[]> = {
    pop: [
      "I – V – vi – IV (C–G–Am–F)",
      "I – IV – V (C–F–G)",
      "vi – IV – I – V (Am–F–C–G)",
      "I – V – IV – I",
    ],
    "hip-hop": [
      "i – VII – VI (Am–G–F)",
      "i – iv – VII (Am–Dm–G)",
      "I – IV – I – V (C–F–C–G)",
      "i – VI – III – VII",
    ],
    rnb: [
      "Imaj7 – IVmaj7 – iii – vi (Cmaj7–Fmaj7–Em–Am)",
      "ii – V – I (Dm–G–C)",
      "Imaj7 – vi – ii – V",
      "I – IV – iii – vi",
    ],
    rock: [
      "I – IV – V (C–F–G)",
      "I – bVII – IV (C–Bb–F)",
      "vi – IV – I – V",
      "I – V – vi – iii – IV",
    ],
    country: [
      "I – IV – V – I",
      "I – V – vi – IV",
      "I – II – IV – I",
      "I – IV – I – V",
    ],
    electronic: [
      "i – VI – III – VII",
      "I – V – vi – IV",
      "i – iv – i – V",
      "I – iii – IV – V",
    ],
    reggae: [
      "I – IV – I – V",
      "I – bVII – IV",
      "i – VII – VI – VII",
      "I – IV – V – IV",
    ],
    jazz: [
      "ii – V – I (Dm7–G7–Cmaj7)",
      "I – VI – ii – V",
      "iii – VI – ii – V",
      "I – IV – iii – VI – ii – V",
    ],
    blues: [
      "I – IV – I – V – IV – I (12-bar blues)",
      "i – iv – i – V",
      "I7 – IV7 – I7 – V7",
    ],
    trap: [
      "i – VI – III – VII",
      "i – VII – VI – VII",
      "i – iv – bVII – i",
      "i – bIII – bVII – IV",
    ],
    soul: [
      "I – IV – iii – vi",
      "ii – V – I – VI",
      "Imaj7 – IVmaj7 – ii – V",
      "I – III – IV – iv",
    ],
    phonk: [
      "i – bVII – bVI – V",
      "i – iv – bVII – i",
      "i – VI – III – VII",
      "i – bIII – bVII – i",
    ],
    lofi: [
      "Imaj7 – IVmaj7 – iii – vi",
      "ii – V – Imaj7",
      "I – vi – IV – V (laid back)",
      "Imaj7 – iii – vi – IV",
    ],
    folk: [
      "I – IV – V – I",
      "I – V – IV – I",
      "vi – IV – I – V",
      "I – IV – I – V – IV",
    ],
    afrobeats: [
      "I – IV – V – vi",
      "i – VII – VI – VII",
      "I – V – vi – IV",
      "i – VI – III – VII",
    ],
    dancehall: [
      "I – IV – I – V",
      "i – VII – VI – VII",
      "I – bVII – IV",
      "i – iv – bVII – i",
    ],
    gospel: [
      "I – IV – V – IV",
      "I – IV – iii – vi – ii – V",
      "IV – I – V – vi",
      "I – ii – IV – V",
    ],
    latin: [
      "i – VI – III – VII",
      "i – iv – V – i",
      "I – IV – V – I (salsa)",
      "i – bVII – bVI – V",
    ],
    classical: [
      "I – V – vi – iii – IV – I – IV – V",
      "i – iv – V – i",
      "I – IV – V7 – I",
      "vi – ii – V – I",
    ],
    "k-pop": [
      "I – V – vi – IV",
      "vi – IV – I – V",
      "I – iii – IV – V",
      "I – IV – vi – V",
    ],
    metal: [
      "i – bVI – bVII – i",
      "i – bVII – bVI – V",
      "i – iv – bVII – i",
      "i – bIII – bVII – i",
    ],
    indie: [
      "I – V – vi – IV",
      "IV – I – V – vi",
      "I – iii – IV – I",
      "vi – iii – IV – I",
    ],
    disco: [
      "I – IV – V – IV",
      "i – IV – V – i",
      "I – V – vi – IV",
      "Imaj7 – IVmaj7 – V7 – I",
    ],
    funk: ["I7 – IV7", "i – iv (with groove)", "I – bVII – IV", "I7 – V7 – I7"],
  };
  const moodOverrides: Record<string, string> = {
    dark: "i – VI – III – VII",
    sad: "vi – IV – I – V (minor feel)",
    happy: "I – V – vi – IV",
    uplifting: "I – IV – V – I",
    aggressive: "i – bVII – bVI – V",
    romantic: "Imaj7 – IVmaj7 – iii – vi",
    nostalgic: "I – vi – IV – V",
    energetic: "I – V – vi – IV (up-tempo)",
    melancholic: "vi – IV – I – V (slow, minor)",
    spiritual: "I – IV – V – IV (gospel feel)",
    triumphant: "I – IV – V – I (strong resolution)",
    mysterious: "i – bVI – bVII – i",
  };

  const _g = (genre || "pop").toLowerCase();
  const _m = (mood || "").toLowerCase();

  if (m && moodOverrides[m]) {
    return moodOverrides[m];
  }

  const _options = progressions[g] || progressions["pop"];
  return options[seededIndex(g + ":" + m, options?.length)];
}

function getSongStructures(): string[] {
  return [
    "Verse – Chorus – Verse – Chorus – Bridge – Chorus",
    "Intro – Verse – Pre-Chorus – Chorus – Verse – Pre-Chorus – Chorus – Outro",
    "Intro – Verse – Chorus – Verse – Chorus – Bridge – Chorus – Outro",
    "Verse – Verse – Chorus – Verse – Chorus – Outro",
    "Intro – Hook – Verse – Hook – Bridge – Hook",
    "Verse – Chorus – Verse – Chorus – Chorus (extended outro)",
    "Hook – Verse – Hook – Verse – Bridge – Hook",
    "Intro – Verse – Verse – Chorus – Verse – Chorus – Outro (no pre-chorus)",
    "Verse – Pre-Chorus – Chorus – Post-Chorus – Verse – Pre-Chorus – Chorus – Post-Chorus – Bridge – Chorus",
    "Intro – Verse – Chorus – Bridge – Verse – Chorus – Outro (compressed)",
    "A – B – A – B – C – B (ABABCB — common in pop ballads)",
    "Verse – Chorus – Verse – Chorus – Bridge – Chorus – Outro (with tag)",
  ];
}

export default router;
