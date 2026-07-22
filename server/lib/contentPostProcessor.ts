/**
 * Content Post-Processor
 *
 * Cleans MaxCore content generation output before any caption is stored or
 * posted. Fixes five recurring quality defects observed across all platforms:
 *
 *  1. Audience-segment metadata leaking into body copy ("for Gen-Z (16-24)")
 *  2. Garbage filler lines ("Spotify. Spotify.", "Facebook. Facebook.")
 *  3. Broken hashtags (raw topic string jammed into a # slot with em-dashes,
 *     commas, parens, or spaces) replaced with genre-specific discovery tags
 *  4. Stale hook templates recycled across platforms rotated out
 *  5. Platform-mismatched CTAs overridden with platform-appropriate language
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
  trap:       ["#trapbeats", "#trapbeats2026", "#typebeat"],
  drill:      ["#drillbeats", "#ukdrill", "#typebeat"],
  rnb:        ["#rnbbeats", "#rnbtypebeat", "#smoothbeats"],
  "r&b":      ["#rnbbeats", "#rnbtypebeat", "#smoothbeats"],
  afrobeats:  ["#afrobeatstypebeat", "#afropop", "#afrobeatsnew"],
  dancehall:  ["#dancehallbeats", "#afropop", "#typebeat"],
  hiphop:     ["#hiphopbeats", "#hiphoptypebeat", "#beatsforsale"],
  "hip-hop":  ["#hiphopbeats", "#hiphoptypebeat", "#beatsforsale"],
  pop:        ["#popbeats", "#poptypebeat", "#beatsforsale"],
  indie:      ["#indiebeats", "#alternativebeats", "#typebeat"],
  lo_fi:      ["#lofiberats", "#chillbeats", "#studybeats"],
  lofi:       ["#lofiberats", "#chillbeats", "#studybeats"],
  jazz:       ["#jazzbeats", "#neosoulbeats", "#typebeat"],
  reggaeton:  ["#reggaetonbeats", "#latinbeats", "#typebeat"],
};

/** Always appended (unless LinkedIn) for beat-market discoverability. */
const UNIVERSAL_BEAT_TAGS = ["#beatsforsale", "#typebeat"];

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
  // em-dash, comma, period, parens, brackets, or any whitespace → broken
  return /[\s—\-–,.()\[\]{}]/.test(stripped) || stripped.length > 50;
}

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
    const valid = tags.filter((t) => !isBrokenHashtag(t)).slice(0, 2);
    return [...new Set([...valid, ...LINKEDIN_TAGS])].slice(0, 5);
  }

  const valid = tags.filter((t) => !isBrokenHashtag(t));

  // Resolve genre key — strip hyphens and spaces for lookup
  const genreKey = genre.toLowerCase().replace(/[\s-]/g, "");
  const genreTags =
    GENRE_HASHTAGS[genre.toLowerCase()] ||
    GENRE_HASHTAGS[genreKey] ||
    GENRE_HASHTAGS["hiphop"]; // sensible fallback

  return [...new Set([...valid, ...genreTags, ...UNIVERSAL_BEAT_TAGS])].slice(
    0,
    8,
  );
}

// ── Fix 4: Rotate stale hook templates ──────────────────────────────────────

/** Hook prefixes MaxCore recycles at high volume. */
const STALE_HOOK_PREFIXES = [
  "what the artist was really making this whole time",
  "the secret the artist kept for six months just dropped",
  "what the producer was really making this whole time",
];

function isStaleHook(text: string): boolean {
  const lower = text.toLowerCase().slice(0, 80);
  return STALE_HOOK_PREFIXES.some((p) => lower.startsWith(p));
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

/**
 * Override CTAs that are wrong for a given platform.
 * - twitter/x: bare category labels → emoji engagement ask
 * - linkedin:  "link in bio" / emoji reaction asks → professional alternatives
 * - tiktok:    "link in bio" → "link in profile"
 */
export function fixPlatformCta(cta: string, platform: string): string {
  if (!cta) return cta;
  const pl = platform.toLowerCase();

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
}

export interface CleanContentResult {
  body: string;
  hook: string;
  cta: string;
  hashtags: string[];
}

/**
 * Apply all five fixes to a MaxCore content response in one call.
 * Safe to call on already-clean content — functions are idempotent.
 */
export function cleanMaxCoreContent(
  args: CleanContentArgs,
): CleanContentResult {
  const body = killFillerLines(stripAudienceMetadata(args.body || ""));
  const hook = args.hook || "";
  const cta = fixPlatformCta(args.cta || "", args.platform);
  const hashtags = normalizeHashtags(
    args.hashtags || [],
    args.genre || "hip-hop",
    args.platform,
  );
  return { body, hook, cta, hashtags };
}
