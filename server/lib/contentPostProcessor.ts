/**
 * Content Post-Processor
 *
 * Cleans MaxCore content generation output before any caption is stored or
 * posted. Fixes six recurring quality defects observed across all platforms:
 *
 *  1. Audience-segment metadata leaking into body copy ("for Gen-Z (16-24)")
 *  2. Garbage filler lines ("Spotify. Spotify.", "Facebook. Facebook.")
 *  3. Broken hashtags (raw topic string jammed into a # slot with em-dashes,
 *     commas, parens, or spaces) replaced with genre-specific discovery tags
 *  4. Stale hook templates recycled across platforms rotated out and replaced
 *     with fresh beat-specific hooks from a mood-indexed pool
 *  5. Platform-mismatched CTAs overridden with platform-appropriate language
 *  6. Generic audience-metadata phrases stripped from body copy
 *
 * All functions are pure and side-effect free — safe to call anywhere.
 */

// ── Fix 1: Strip audience-segment metadata ──────────────────────────────────

/**
 * Remove internal audience-targeting labels that MaxCore leaks into body copy.
 * Patterns matched: "for Gen-Z (16-24)", "for music-savvy early adopters (20-35)",
 * "for engaged music fans (18-34)", etc.
 */
function stripAudienceMetadata(text: string): string {
  // Use [^\S\n] to collapse only horizontal whitespace — preserving the \n
  // line boundaries that killFillerLines relies on to split and filter.
  return text
    .replace(/ for [^(.\n]+\(\d{2}-\d{2}\)/g, "")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}

// ── Fix 2: Kill garbage filler lines ────────────────────────────────────────

// Matches a line that is nothing but one or two bare platform names (optionally
// followed by a period). The first platform's trailing period is outside the
// optional second-platform group so "Spotify." matches as a single entry.
const FILLER_LINE_RE =
  /^(spotify|facebook|instagram|tiktok|twitter|threads|linkedin|youtube)\.?(\s*(spotify|facebook|instagram|tiktok|twitter|threads|linkedin|youtube)\.?)?$/i;

/**
 * Drop lines that are nothing but a bare platform name repeated 1–2 times.
 * Collapses resulting triple-newlines to double.
 */
function killFillerLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !FILLER_LINE_RE.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Fix 3: Normalise hashtags ────────────────────────────────────────────────

/** Genre → beat-market discovery hashtags. Keyed by lowercase, no hyphens. */
const GENRE_HASHTAGS: Record<string, string[]> = {
  trap:       ["#trapbeats", "#traptype", "#808trap", "#darktrapsound"],
  drill:      ["#drillbeats", "#ukdrill", "#brooklyndrill", "#drilltype"],
  rnb:        ["#rnbbeats", "#rnbtypebeat", "#neosoulbeats", "#smoothrnb"],
  "r&b":      ["#rnbbeats", "#rnbtypebeat", "#neosoulbeats", "#smoothrnb"],
  afrobeats:  ["#afrobeatstypebeat", "#afropop", "#afrobeatsnew", "#afrotrap"],
  dancehall:  ["#dancehallbeats", "#afropop", "#riddimbeats", "#caribbeanbeats"],
  hiphop:     ["#hiphopbeats", "#hiphoptypebeat", "#boombaptybeats", "#rapbeats"],
  "hip-hop":  ["#hiphopbeats", "#hiphoptypebeat", "#boombaptybeats", "#rapbeats"],
  pop:        ["#popbeats", "#poptypebeat", "#popproducer", "#chartreadybeats"],
  indie:      ["#indiebeats", "#alternativebeats", "#indieproducer", "#indietype"],
  lo_fi:      ["#lofiberats", "#chillbeats", "#studybeats", "#lofihiphop"],
  lofi:       ["#lofiberats", "#chillbeats", "#studybeats", "#lofihiphop"],
  jazz:       ["#jazzbeats", "#neosoulbeats", "#jazztype", "#smoothjazz"],
  reggaeton:  ["#reggaetonbeats", "#latinbeats", "#latintype", "#urbanlatino"],
  amapiano:   ["#amapiano", "#amapianobeats", "#southafricanbeats", "#logbeats"],
  phonk:      ["#phonkbeats", "#phonktype", "#darkphonk", "#driftphonk"],
  cloud:      ["#cloudrap", "#cloudbeats", "#melodictrap", "#sadtrap"],
  jersey:     ["#jerseyclub", "#clubbeats", "#clubtype", "#dancebeats"],
};

/** Always appended (unless LinkedIn) for beat-market discoverability. */
const UNIVERSAL_BEAT_TAGS = ["#beatsforsale", "#typebeat", "#producerlife"];

/** Professional tags for LinkedIn — no beat-market discovery language. */
const LINKEDIN_TAGS = [
  "#musicproducer",
  "#beatmaking",
  "#musicbusiness",
  "#indiemusic",
];

/** A hashtag is "broken" if it contains characters that platforms won't parse. */
function isBrokenHashtag(tag: string): boolean {
  const stripped = tag.startsWith("#") ? tag.slice(1) : tag;
  // em-dash, regular hyphen, en-dash, comma, period, parens, brackets,
  // or any whitespace → broken. Also reject suspiciously long strings
  // (MaxCore sometimes jams the full topic into one hashtag slot).
  return /[\s\u2014\-\u2013,.()\[\]{}]/.test(stripped) || stripped.length > 40;
}

/**
 * Hashtags that are shadow-banned, too broad, or actively hurt reach.
 * MaxCore often returns these when PDIM storage is offline — strip them
 * before merging so they don't consume slots that genre-specific tags need.
 */
const SHADOW_BANNED_TAGS = new Set([
  // Platform names as hashtags are shadow-banned on all major platforms
  "#instagram", "#tiktok", "#twitter", "#facebook", "#youtube",
  "#snapchat", "#pinterest", "#threads",
  // Saturated/ineffective catch-alls
  "#music", "#newrelease", "#newdrop", "#artist", "#art",
  "#love", "#follow", "#followme", "#like", "#likeforlike",
]);

/**
 * Clean MaxCore's hashtag array and enrich with genre-specific discovery tags.
 * Keeps up to 8 tags on most platforms; uses professional tags on LinkedIn.
 */
export function normalizeHashtags(
  tags: string[],
  genre: string,
  platform: string,
): string[] {
  if (platform === "linkedin") {
    const valid = tags
      .filter((t) => !isBrokenHashtag(t) && !SHADOW_BANNED_TAGS.has(t.toLowerCase()))
      .slice(0, 2);
    return [...new Set([...valid, ...LINKEDIN_TAGS])].slice(0, 5);
  }

  // Strip broken + shadow-banned so genre tags get priority slots
  const valid = tags.filter(
    (t) => !isBrokenHashtag(t) && !SHADOW_BANNED_TAGS.has(t.toLowerCase()),
  );

  // Resolve genre key — strip hyphens and spaces for lookup
  const genreKey = genre.toLowerCase().replace(/[\s_-]/g, "");
  const genreTags =
    GENRE_HASHTAGS[genre.toLowerCase()] ||
    GENRE_HASHTAGS[genreKey] ||
    GENRE_HASHTAGS["hiphop"]; // sensible fallback

  return [...new Set([...valid, ...genreTags, ...UNIVERSAL_BEAT_TAGS])].slice(
    0,
    8,
  );
}

// ── Fix 4: Replace stale hook templates ─────────────────────────────────────

/** Hook prefixes MaxCore recycles at high volume. Case-insensitive prefix match. */
const STALE_HOOK_PREFIXES = [
  // Awareness-layer templates observed in the wild (update as new ones appear)
  "exclusive: playlist editors are watching",
  "this is what the viral algorithm wants right now",
  "don't scroll —",
  "don't scroll—",
  "what the artist was really making this whole time",
  "the secret the artist kept for six months just dropped",
  "what the producer was really making this whole time",
  "this is what you've been waiting for",
  "the algorithm is finally pushing",
  "the beat that's been on repeat in my studio",
  "drop everything and listen",
  // Video-endpoint script bleeding into content gen
  "in this video, i'm going to show you something incredible",
  "in this video i'm going to",
  // Generic listener-appreciation hooks with no beat-sale intent
  "real listeners know",
  // Autopilot/template hooks
  "this is what you've been waiting for",
  "new drop alert",
];

function isStaleHook(text: string): boolean {
  const lower = text.toLowerCase().slice(0, 100);
  return STALE_HOOK_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * Fresh, mood-indexed hooks to substitute when MaxCore returns a stale
 * template. Each entry is a ready-to-post first line — no placeholders.
 */
const FRESH_BEAT_HOOKS: Record<string, string[]> = {
  dark: [
    "This one hits different at 2AM. 🌑 Turn it up.",
    "Dark energy. No skips. 808s that shake the room. 🔥",
    "The type of beat that turns a verse into a moment. 🎧",
    "Built for artists who paint pictures with their words. 🖤",
    "Some beats don't ask for attention — they demand it.",
  ],
  aggressive: [
    "No filler. No fluff. Just bars and 808s. 🔥",
    "This beat doesn't wait for permission — neither should you.",
    "Built for artists who mean every single word. 🎧",
    "Hard-hitting production made for records that leave marks.",
    "The drop is doing work before the first bar. 💥",
  ],
  melancholy: [
    "The type of beat that makes you write your best verse. 🎧",
    "Some beats hit different when you've got something to say. 💙",
    "Emotion-first production. Say what needs to be said.",
    "This one was built for the records people keep for years.",
    "Not every beat needs to be loud. Some just need to be true.",
  ],
  empowering: [
    "An anthem-grade beat for artists who make records that move rooms. 🔥",
    "Built for the come-up era. This one's for the ones on the rise. 💪",
    "Production that feels like a win before you write the first word.",
    "The type of instrumental that makes you close your eyes and just go.",
    "This beat's been waiting for someone to say something real over it.",
  ],
  chill: [
    "Late-night energy. Something smooth for the real ones. 🌙",
    "Flow-ready production that gives artists room to breathe and say something.",
    "Not everything needs to be loud. This one hits quiet and hard. 🎧",
    "Laid-back but intentional — the kind of beat that holds a whole verse.",
    "Perfect tempo for the introspective record you've been sitting on.",
  ],
  upbeat: [
    "Feel-good and infectious — the kind of record listeners play twice. 🔥",
    "High energy from the jump. This one was built for playlists and moments.",
    "You'll have the hook before the first loop ends. Trust. 🎶",
    "The production is doing the heavy lifting — just bring the words.",
    "This beat has 'I heard it and had to write something' written all over it.",
  ],
  mysterious: [
    "Dark, layered, and impossible to place. The perfect canvas. 🎧",
    "The kind of beat that gives artists total creative freedom. 🌑",
    "Atmosphere-first production with a hook that lingers.",
    "This one creates space — and space is where the best bars come from.",
    "Intrigue before the first word. That's the goal. 🔥",
  ],
  euphoric: [
    "Euphoric energy that lifts the room — built for moments that matter. ✨",
    "This one was made for the records people remember exactly where they were. 🔥",
    "Production at this level makes the verse write itself.",
    "Feel it in your chest from the first bar. That's the standard. 🎧",
    "The type of instrumental that makes the room go quiet and then loud.",
  ],
  driven: [
    "High-momentum production that demands a verse with something to prove. 🔥",
    "Built for artists in their bag. The energy is already there — use it.",
    "This beat has urgency built into every layer. No slowing down.",
    "The type of instrumental that makes you want to run through a wall. 💪",
    "Relentless tempo. Relentless production. No excuses for a weak verse.",
  ],
};

/** Fallback hooks when mood doesn't match any pool. */
const DEFAULT_FRESH_HOOKS = [
  "The marketplace just got a new drop — and it goes. 🔥",
  "License-ready production built for artists who take their craft seriously. 🎧",
  "This one's been sitting in the vault long enough. Available now.",
  "Built for artists who show up and deliver. The beat will match that energy.",
  "New drop. Real production. Available for immediate licensing. 🎧",
];

/**
 * Pick a random fresh hook from the mood pool. Seeded by title length so
 * successive calls with different titles almost always return different lines.
 */
function freshHook(mood: string, title: string): string {
  const pool =
    FRESH_BEAT_HOOKS[mood.toLowerCase()] ?? DEFAULT_FRESH_HOOKS;
  const seed = (title?.length ?? 0) % pool.length;
  // Shift by a random offset so repeated calls vary even with the same title
  const idx = (seed + Math.floor(Math.random() * pool.length)) % pool.length;
  return pool[idx];
}

/**
 * Choose the best variant from a MaxCore variants array.
 * Skips variants whose hook starts with a known recycled template prefix.
 * Falls back to a random pick from the top-2 when all hooks are stale.
 */
export function selectBestVariant<
  T extends { hook?: string; caption?: string; score?: number },
>(variants: T[]): T {
  if (!variants || variants.length === 0) return variants[0];

  const fresh = variants.find(
    (v) => !isStaleHook(v.hook || v.caption || ""),
  );
  if (fresh) return fresh;

  // All stale — at minimum vary which template fires
  const top2 = variants.slice(0, Math.min(2, variants.length));
  return top2[Math.floor(Math.random() * top2.length)];
}

// ── Fix 5: Platform-specific CTA overrides ──────────────────────────────────

const WEAK_CTA_RE = /^[a-z\s]{0,20}$/i; // no verb, no emoji, very short

/** Beat-sale CTAs — rotated so posts don't all end the same way. */
const BEAT_SALE_CTAS = [
  "License this beat — link in bio 🔗",
  "Available now — link in bio 🎧",
  "Get the license — link in bio 💰",
  "Grab the lease — link in bio 🔥",
  "License available now — link in bio",
];

/**
 * Positive allowlist: a CTA is already beat-sale appropriate if it contains
 * any of these purchase-intent signals. Anything that DOESN'T match gets
 * replaced with a beat-sale CTA when isBeatPost=true.
 *
 * Catches the full range of MaxCore non-sale outputs:
 *   "Add NightFire to the playlist — link in bio"  → no purchase keyword → replace
 *   "Drop a 🔥 if NightFire hits different"        → no purchase keyword → replace
 *   "Follow now and be first for every drop"        → no purchase keyword → replace
 *   "New Drop Alert"                                → no purchase keyword → replace
 *   "License this beat — link in bio 🔗"           → "license" present   → keep
 *   "Get the license — link in bio 💰"             → "license" present   → keep
 *   "First listeners get first access — link in bio"→ "first access"     → keep
 */
const BEAT_SALE_KEYWORDS_RE =
  /\b(licen[sc]e|lease|buy|get the|grab the|purchase|available now|first access)\b/i;

/**
 * Override CTAs that are wrong for a given platform.
 * - instagram/tiktok/threads/facebook beat context: replace any non-purchase CTA
 * - twitter/x: bare category labels → emoji engagement ask
 * - linkedin:  "link in bio" / emoji reaction asks → professional alternatives
 * - tiktok:    standalone "link in bio" → "link in profile"
 */
export function fixPlatformCta(cta: string, platform: string, isBeatPost = false): string {
  if (!cta) return cta;
  const pl = platform.toLowerCase();

  // For beat-sale posts: replace any CTA that lacks purchase-intent language.
  // This catches the full range of MaxCore non-sale outputs (playlist adds,
  // engagement prompts, follow asks, generic awareness CTAs).
  if (isBeatPost && (pl === "instagram" || pl === "tiktok" || pl === "threads" || pl === "facebook")) {
    if (!BEAT_SALE_KEYWORDS_RE.test(cta)) {
      const idx = Math.floor(Math.random() * BEAT_SALE_CTAS.length);
      return BEAT_SALE_CTAS[idx];
    }
  }

  if (pl === "twitter" || pl === "x") {
    if (
      cta.length < 25 &&
      WEAK_CTA_RE.test(cta) &&
      !/[🔥💥🎵🎧✨🚀🎶]/.test(cta)
    ) {
      return "Drop a 🔥 if this hits";
    }
  }

  if (pl === "linkedin") {
    if (/link in bio/i.test(cta)) {
      return "Let me know your thoughts in the comments 👇";
    }
    if (/drop a\s*[🔥💥❤️]/i.test(cta)) {
      return "What do you think? Share your perspective below.";
    }
  }

  if (pl === "tiktok" || pl === "threads") {
    if (/link in bio/i.test(cta)) {
      return "Stream it now — link in profile 🎧";
    }
  }

  return cta;
}

// ── Master clean function ────────────────────────────────────────────────────

export interface CleanContentArgs {
  body: string;
  hook?: string;
  cta?: string;
  hashtags: string[];
  genre: string;
  platform: string;
  /** Beat mood — used to substitute fresh hooks when MaxCore returns a stale template */
  mood?: string;
  /** Beat title — used as a seed for hook variation */
  title?: string;
  /** When true, generic CTAs are replaced with direct beat-licensing language */
  isBeatPost?: boolean;
}

export interface CleanContentResult {
  body: string;
  hook: string;
  cta: string;
  hashtags: string[];
}

// ── Fix 7: Strip prompt bleed + restore title casing in body ────────────────

/**
 * MaxCore sometimes leaks its own system-prompt instructions into body copy
 * when PDIM storage is offline (fallback mode). Patterns observed:
 *  - "Write about the actual beat — trap sound, 145 BPM. Reference these..."
 *  - "Reference these real production facts instead of generic hype."
 * Strip any sentence that reads as an instruction rather than copy.
 * Also restores the proper case of a lowercased beat title.
 */
function repairBody(body: string, title?: string): string {
  const PROMPT_BLEED_RE =
    /^(write about|reference these|add (a |an )?(compelling|urgent)|use the following|replace this with|include the|note:|instruction:)/i;

  const lines = body.split("\n").filter((line) => {
    const t = line.trim();
    return t.length === 0 || !PROMPT_BLEED_RE.test(t);
  });
  let cleaned = lines.join("\n").trim();

  // Restore proper case of beat title if MaxCore lowercased it
  if (title && title.length >= 3) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(
      new RegExp(`\\b${escaped}\\b`, "gi"),
      title,
    );
  }

  return cleaned;
}

/**
 * Apply all seven fixes to a MaxCore content response in one call.
 * Safe to call on already-clean content — functions are idempotent.
 */
export function cleanMaxCoreContent(
  args: CleanContentArgs,
): CleanContentResult {
  const body = repairBody(
    killFillerLines(stripAudienceMetadata(args.body || "")),
    args.title,
  );

  // Replace stale hooks with mood-matched originals so every beat caption
  // has a unique, conversion-optimised opening line.
  const rawHook = args.hook || "";
  const hook = isStaleHook(rawHook)
    ? freshHook(args.mood || "dark", args.title || "")
    : rawHook;

  const cta = fixPlatformCta(args.cta || "", args.platform, args.isBeatPost ?? false);
  const hashtags = normalizeHashtags(
    args.hashtags || [],
    args.genre || "hip-hop",
    args.platform,
  );
  return { body, hook, cta, hashtags };
}
