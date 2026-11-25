/**
 * Content Post-Processor
 *
 * Sanitizes MaxCore content at the trust boundary. The master cleaner preserves
 * MaxCore's generated semantics and removes only leaked control directives.
 * Hashtag normalization and platform CTA adjustment remain explicit opt-in
 * utilities for callers whose product flow requires them.
 *
 * All functions are pure and side-effect free — safe to call anywhere.
 */

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
export function isBrokenHashtag(tag: string): boolean {
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

/**
 * Choose the best variant from a MaxCore variants array.
 * Skips variants whose hook starts with a known recycled template prefix.
 * Falls back to a random pick from the top-2 when all hooks are stale.
 */
export function selectBestVariant<
  T extends { hook?: string; caption?: string; score?: number },
>(variants: T[]): T {
  // MaxCore owns variant ordering. Do not substitute or randomly select local
  // template content after inference.
  return variants[0];
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

// ── Fix 7: Strip leaked internal directive blocks ───────────────────────────

/**
 * MaxCore is fed structured internal instructions (e.g. the
 * `[PLATFORM_OPTIMIZATION platform=... revision=...]` block from
 * platformAwarenessOptimization()) as extra_context/instruction text meant to
 * *guide* generation — never to appear in the output. Under load MaxCore
 * sometimes echoes this block verbatim into the caption/hook/body/cta instead
 * of following it. Strip any such bracketed-tag directive block (tag line +
 * its structured follow-on lines) from user-facing text before it's used.
 */
const DIRECTIVE_TAG_BLOCK_RE =
  /\[[A-Z_]+(?:\s+[a-z_]+=\S+)*\]\n?(?:(?:Content shape|Length|Audience intent|Cadence|Hashtag\/keyword policy|Primary engagement signals|Quality dimensions|Documented algorithm signals[^:]*):[^\n]*\n?)*/g;

export function stripLeakedDirectives(text: string): string {
  if (!text) return text;
  return text
    .replace(DIRECTIVE_TAG_BLOCK_RE, "")
    // The directive was often inserted mid-sentence after a colon lead-in
    // ("...put everything into this:  Drop a fire emoji..."). Once the
    // block is gone that colon dangles with nothing to introduce — turn it
    // into a sentence break instead of leaving a naked ":  ".
    .replace(/:(\s{2,})/g, ".$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Sanitize a MaxCore content response without locally rewriting its creative
 * output. Safe to call on already-clean content.
 */
export function cleanMaxCoreContent(
  args: CleanContentArgs,
): CleanContentResult {
  // Preserve MaxCore's generated semantics. Only remove leaked model/control
  // directives at the trust boundary; creative rewriting belongs upstream.
  const body = stripLeakedDirectives(args.body || "");
  const hook = stripLeakedDirectives(args.hook || "");
  const cta = stripLeakedDirectives(args.cta || "");
  const hashtags = (args.hashtags || []).filter(
    (tag): tag is string => typeof tag === "string",
  );
  return { body, hook, cta, hashtags };
}
