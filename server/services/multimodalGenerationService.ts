// @ts-nocheck
import { randomUUID } from "crypto";
import path from "path";
import { promises as fsPromises } from "fs";
import { logger } from "../logger.js";
import { AIUnavailableError } from "../lib/aiSource.js";
import {
  getMaxcoreGenerationKey,
  getMaxcoreOriginOrDefault,
} from "./maxcoreConnector.js";
import { generateAudio as generateLocalAudio } from "./audioGeneratorService.js";
import { sharpImageService as _sharpImageService } from "./sharpImageService.js";
import { db } from "../db.js";
import { eq } from "drizzle-orm";
import { autopilotPreferences, userBrandVoices } from "@shared/schema";
import {
  type GenerationRequest,
  type GeneratedAsset,
  type TaskStep,
  type TaskPlan,
  type MultimodalPackage,
  type Platform,
  type OutputModality,
  PACK_DEFINITIONS,
} from "@shared/types/multimodalGeneration.js";
import { PLATFORM_RULES, getRules, enforceTextLength, type PlatformRules } from "@shared/config/platformRules.js";

// Resolved through the shared connector (single MaxCore contract boundary);
// the connector normalizes root-vs-/api URL forms.
const MAXCORE_URL = `${getMaxcoreOriginOrDefault()}/api`;
const MAXCORE_KEY = getMaxcoreGenerationKey();

// ── Port 8008 gateway (MaxCore Diffusion + training time simulator) ──────────
// This is the primary gateway for ALL content generation on the platform.
// Proxies to MaxCore when local model is untrained; gradually switches to
// local inference as the model accumulates simulated training years.
const DIT24_GATEWAY = `http://localhost:${process.env.VIDEO_DIFFUSION_PORT ?? 8008}`;
const DIT24_PROXY_TIMEOUT_MS = 8_000; // fast timeout — fall through to direct MaxCore if 8008 is down

async function dit24GatewayPost(
  proxyPath: string,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(`${DIT24_GATEWAY}${proxyPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DIT24_PROXY_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Port-8008 gateway ${proxyPath} → HTTP ${res.status}: ${text?.slice(0, 200)}`,
    );
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct?.includes("application/json")) {
    throw new Error(`Port-8008 gateway ${proxyPath} returned non-JSON`);
  }
  return res.json();
}

// Paths proxied through port 8008 → /proxy<path> on the gateway
const DIT24_PROXY_PATHS = new Set([
  "/generate/text",
  "/generate/image",
  "/generate/content",
  "/audio/analyze",
  "/analyze/sentiment",
]);

async function maxcorePost(
  path: string,
  body: unknown,
  timeoutMs = 90_000,
): Promise<unknown> {
  // Route through the port-8008 training gateway when the path is supported.
  // The gateway server proxies to MaxCore internally (and will eventually
  // serve locally once the local model is trained). This makes port 8008
  // the single source of truth for all content generation.
  if (DIT24_PROXY_PATHS?.has(path)) {
    try {
      return await dit24GatewayPost(`/proxy${path}`, body);
    } catch {
      // Port 8008 not ready — fall through to direct MaxCore call
    }
  }

  const res = await fetch(`${MAXCORE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // MaxCore auth is Bearer-ONLY — sending X-API-Key/X-Admin-Key alongside
      // makes MaxCore validate those schemes first and 401 every call.
      ...(MAXCORE_KEY ? { Authorization: `Bearer ${MAXCORE_KEY}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MaxCore ${path} → HTTP ${res.status}: ${text?.slice(0, 200)}`,
    );
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct?.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MaxCore ${path} returned non-JSON (${ct || "no content-type"}): ${text?.slice(0, 200)}`,
    );
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Remote media mirroring — MaxCore returns relative /uploads/... URLs that our
// server cannot serve.  Absolute-ize them against the MaxCore origin and
// best-effort mirror the bytes into public/generated-content/<kind>/ so the
// asset survives MaxCore restarts and downloads work same-origin.
// ---------------------------------------------------------------------------

const MEDIA_MAGIC: Record<string, (b: Buffer) => boolean> = {
  images: (b) =>
    (b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47) || // PNG
    (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || // JPEG
    (b.length > 12 && b.slice(8, 12).toString("ascii") === "WEBP") || // WebP
    (b.length > 6 && b.slice(0, 4).toString("ascii") === "GIF8"), // GIF
  audio: (b) =>
    (b.length > 3 && b.slice(0, 3).toString("ascii") === "ID3") || // MP3 w/ ID3
    (b.length > 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) || // MP3 frame
    (b.length > 12 && b.slice(0, 4).toString("ascii") === "RIFF") || // WAV
    (b.length > 4 && b.slice(0, 4).toString("ascii") === "OggS") || // OGG
    (b.length > 12 && b.slice(4, 8).toString("ascii") === "ftyp"), // M4A/MP4
};

function absolutizeMaxCoreUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  return rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
    ? rawUrl
    : `${_MAXCORE_BASE}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
}

/** True only when the URL's scheme+host exactly match the MaxCore origin. */
function isMaxCoreOrigin(absoluteUrl: string): boolean {
  try {
    return new URL(absoluteUrl).origin === new URL(_MAXCORE_BASE).origin;
  } catch {
    return false;
  }
}

async function mirrorRemoteAssetLocally(
  rawUrl: string,
  kind: "images" | "audio",
): Promise<string> {
  const absolute = absolutizeMaxCoreUrl(rawUrl);
  if (!absolute) return "";
  // SECURITY: only fetch (and only ever send the Bearer key to) the MaxCore
  // origin. A non-MaxCore absolute URL in a MaxCore response must NOT be
  // fetched server-side (SSRF pivot) nor receive our credentials — pass it
  // through untouched for the client to resolve, matching prior behavior.
  if (!isMaxCoreOrigin(absolute)) return absolute;
  try {
    const res = await fetch(absolute, {
      headers: MAXCORE_KEY
        ? { Authorization: `Bearer ${MAXCORE_KEY}` }
        : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return absolute;
    const buffer = Buffer.from(await res.arrayBuffer());
    // MaxCore's SPA answers unknown paths with HTML 200 — magic bytes are the
    // only trustworthy validation.
    if (buffer.length < 128 || !MEDIA_MAGIC[kind](buffer)) return absolute;

    const baseName = path
      .basename(absolute.split("?")[0])
      .replace(/[^A-Za-z0-9._-]/g, "_");
    const filename = `mc_${baseName || randomUUID()}`;
    const dir = path.join(process.cwd(), "public", "generated-content", kind);
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(path.join(dir, filename), buffer);
    return `/generated-content/${kind}/${filename}`;
  } catch (err) {
    logger.warn(
      { err },
      `[MultimodalGen] Failed to mirror ${kind} asset locally — using remote URL: ${err instanceof Error ? err.message : String(err)}`,
    );
    return absolute;
  }
}

// ---------------------------------------------------------------------------
// User context enrichment — pulls autopilot preferences from the database so
// MaxCore gets real artist name, genre, brand voice, etc. instead of guessing.
// ---------------------------------------------------------------------------
interface UserContext {
  artistName: string | null;
  artistBio: string | null;
  genre: string | null;
  subGenres: string[] | null;
  brandVoice: string | null;
  targetAudience: string | null;
  preferredHashtags: string[] | null;
  avoidTopics: string[] | null;
  contentTone: string | null;
  callToActionStyle: string | null;
  uniqueSellingPoints: string[] | null;
  currentReleases: Array<{
    title: string;
    type: string;
    releaseDate: string;
    streamingLinks: Record<string, string>;
    promoUntil: string;
  }> | null;
}

const _userContextCache = new Map<
  string,
  { data: UserContext; expiresAt: number }
>();
const USER_CTX_TTL_MS = 60_000;

function emptyUserContext(): UserContext {
  return {
    artistName: null,
    artistBio: null,
    genre: null,
    subGenres: [],
    brandVoice: null,
    targetAudience: null,
    preferredHashtags: [],
    avoidTopics: [],
    contentTone: null,
    callToActionStyle: null,
    uniqueSellingPoints: [],
    currentReleases: [],
  };
}

async function fetchUserContext(userId: string): Promise<UserContext> {
  if (!userId) return emptyUserContext();
  const cached = _userContextCache?.get(userId);
  if (cached && cached?.expiresAt > Date.now()) return cached?.data;

  try {
    const [[prefs], [voice]] = await Promise.all([
      db
        .select()
        .from(autopilotPreferences)
        .where(eq(autopilotPreferences.userId, userId))
        .limit(1),
      db
        .select({
          tone: userBrandVoices.tone,
          writingStyle: userBrandVoices.writingStyle,
          targetAudience: userBrandVoices.targetAudience,
          personality: userBrandVoices.personality,
          brandValues: userBrandVoices.brandValues,
          avoidWords: userBrandVoices.avoidWords,
        })
        .from(userBrandVoices)
        .where(eq(userBrandVoices.userId, userId))
        .limit(1),
    ]);

    // Derive a brand-voice label: prefer autopilot setting, fall back to voice table tone
    const resolvedBrandVoice = prefs?.brandVoice ?? voice?.tone ?? null;
    // Derive target audience: prefer autopilot, fall back to brand-voice table
    const resolvedTargetAudience =
      prefs?.targetAudience ?? voice?.targetAudience ?? null;

    const data: UserContext = {
      artistName: prefs?.artistName ?? null,
      artistBio: prefs?.artistBio ?? null,
      genre: prefs?.genre ?? null,
      subGenres: (prefs?.subGenres as string[] | null) ?? null,
      brandVoice: resolvedBrandVoice,
      targetAudience: resolvedTargetAudience,
      preferredHashtags: (prefs?.preferredHashtags as string[] | null) ?? null,
      avoidTopics: (prefs?.avoidTopics as string[] | null) ?? null,
      contentTone: prefs?.contentTone ?? voice?.writingStyle ?? null,
      callToActionStyle: prefs?.callToActionStyle ?? null,
      uniqueSellingPoints:
        (prefs?.uniqueSellingPoints as string[] | null) ?? null,
      currentReleases:
        (prefs?.currentReleases as UserContext["currentReleases"]) ?? null,
    };

    _userContextCache?.set(userId, {
      data,
      expiresAt: Date.now() + USER_CTX_TTL_MS,
    });
    return data;
  } catch (err) {
    logger.warn(
      { err },
      `[MultimodalGen] fetchUserContext DB error (non-fatal): ${(err as Error)?.message ?? String(err)}`,
    );
    return emptyUserContext();
  }
}

/**
 * Given a URL, check whether it matches any streaming link in the user's
 * currentReleases preference list.  Returns the release record or undefined.
 */
function matchReleaseByUrl(
  url: string,
  releases: UserContext["currentReleases"],
): { title: string; type: string; releaseDate: string } | undefined {
  if (!url || !releases?.length) return undefined;
  try {
    const needle = new URL(url).href.replace(/\/$/, "").toLowerCase();
    for (const rel of releases) {
      for (const link of Object.values(rel.streamingLinks ?? {})) {
        try {
          if (new URL(link).href.replace(/\/$/, "").toLowerCase() === needle)
            return rel;
        } catch {
          /* skip malformed links */
        }
      }
    }
  } catch {
    /* skip malformed input */
  }
  return undefined;
}



// ── Local URL analyzer ────────────────────────────────────────────────────────

type UrlCategory =
  | "music_stream" // Spotify, Apple Music, Tidal, Deezer, Audiomack, Bandcamp
  | "music_video" // YouTube music video, Vevo
  | "video" // YouTube non-music, Vimeo, Dailymotion
  | "social_post" // Instagram, TikTok, X/Twitter, Facebook, Threads
  | "podcast" // Podcast platforms
  | "article" // Blog post, news article, Medium
  | "ecommerce" // Online store, merch, product
  | "website" // General website / artist site
  | "press" // Music press: Pitchfork, Rolling Stone, NME, etc.
  | "event" // Show listing, ticketing (Eventbrite, Dice, Ticketmaster)
  | "other";

interface UrlContext {
  category: UrlCategory;
  platform: string;
  contentType: string;
  id?: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function classifyUrl(url: string): UrlContext {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);

    // ── Max Booster own-app URLs ─────────────────────────────────
    // Detect any maxbooster domain and route to 'article' category so copy
    // templates produce promotional content suited to feature/info pages
    // ("Worth reading", "check this out") rather than generic "link in bio".
    if (
      host === "max-booster.com" ||
      host.endsWith(".max-booster.com") ||
      host === "maxbooster.replit.app" ||
      host.endsWith(".maxbooster.replit.app") ||
      host === "maxbooster.app" ||
      host.endsWith(".maxbooster.app") ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      const firstPath = parts[0] ?? "";
      return {
        category: "article",
        platform: "Max Booster",
        contentType: firstPath || "page",
      };
    }

    // ── Music streaming ─────────────────────────────────────────
    if (host.includes("spotify.com"))
      return {
        category: "music_stream",
        platform: "Spotify",
        contentType: parts[0] ?? "track",
        id: parts[1],
      };
    if (host.includes("music.apple.com"))
      return {
        category: "music_stream",
        platform: "Apple Music",
        contentType: "album",
      };
    if (host.includes("tidal.com"))
      return {
        category: "music_stream",
        platform: "Tidal",
        contentType: "track",
      };
    if (host.includes("deezer.com"))
      return {
        category: "music_stream",
        platform: "Deezer",
        contentType: "track",
      };
    if (host.includes("audiomack.com"))
      return {
        category: "music_stream",
        platform: "Audiomack",
        contentType: "song",
      };
    if (host.includes("bandcamp.com"))
      return {
        category: "music_stream",
        platform: "Bandcamp",
        contentType: "track",
      };
    if (host.includes("soundcloud.com"))
      return {
        category: "music_stream",
        platform: "SoundCloud",
        contentType: "track",
        id: parts.join("/"),
      };
    if (host.includes("boomplay.com"))
      return {
        category: "music_stream",
        platform: "Boomplay",
        contentType: "track",
      };
    if (host.includes("pandora.com"))
      return {
        category: "music_stream",
        platform: "Pandora",
        contentType: "station",
      };
    if (host.includes("music.amazon"))
      return {
        category: "music_stream",
        platform: "Amazon Music",
        contentType: "track",
      };
    if (host.includes("napster.com"))
      return {
        category: "music_stream",
        platform: "Napster",
        contentType: "track",
      };
    if (host.includes("anghami.com"))
      return {
        category: "music_stream",
        platform: "Anghami",
        contentType: "track",
      };
    if (host.includes("kkbox.com"))
      return {
        category: "music_stream",
        platform: "KKBOX",
        contentType: "track",
      };
    if (host.includes("joox.com"))
      return {
        category: "music_stream",
        platform: "JOOX",
        contentType: "track",
      };
    if (host.includes("gaana.com"))
      return {
        category: "music_stream",
        platform: "Gaana",
        contentType: "song",
      };
    if (host.includes("jiosaavn.com"))
      return {
        category: "music_stream",
        platform: "JioSaavn",
        contentType: "song",
      };
    if (host.includes("music.youtube.com"))
      return {
        category: "music_stream",
        platform: "YouTube Music",
        contentType: "track",
      };
    if (host.includes("vevo.com"))
      return {
        category: "music_video",
        platform: "Vevo",
        contentType: "video",
      };

    // ── Video ────────────────────────────────────────────────────
    if (host.includes("youtube.com") || host.includes("youtu.be"))
      return {
        category: "video",
        platform: "YouTube",
        contentType: "video",
        id: u.searchParams.get("v") ?? parts[0],
      };
    if (host.includes("vimeo.com"))
      return { category: "video", platform: "Vimeo", contentType: "video" };
    if (host.includes("dailymotion.com"))
      return {
        category: "video",
        platform: "Dailymotion",
        contentType: "video",
      };
    if (host.includes("twitch.tv"))
      return { category: "video", platform: "Twitch", contentType: "stream" };
    if (host.includes("kick.com"))
      return { category: "video", platform: "Kick", contentType: "stream" };
    if (host.includes("rumble.com"))
      return { category: "video", platform: "Rumble", contentType: "video" };

    // ── Social posts ─────────────────────────────────────────────
    if (host.includes("instagram.com"))
      return {
        category: "social_post",
        platform: "Instagram",
        contentType:
          parts[0] === "p" || parts[0] === "reel" ? parts[0] : "post",
      };
    if (host.includes("tiktok.com"))
      return {
        category: "social_post",
        platform: "TikTok",
        contentType: "video",
      };
    if (host.includes("twitter.com") || host.includes("x.com"))
      return {
        category: "social_post",
        platform: "X (Twitter)",
        contentType: "tweet",
      };
    if (host.includes("facebook.com"))
      return {
        category: "social_post",
        platform: "Facebook",
        contentType: "post",
      };
    if (host.includes("threads.net"))
      return {
        category: "social_post",
        platform: "Threads",
        contentType: "post",
      };
    if (host.includes("linkedin.com"))
      return {
        category: "social_post",
        platform: "LinkedIn",
        contentType: "post",
      };
    if (host.includes("pinterest.com"))
      return {
        category: "social_post",
        platform: "Pinterest",
        contentType: "pin",
      };
    if (host.includes("reddit.com"))
      return {
        category: "social_post",
        platform: "Reddit",
        contentType: "post",
      };

    // ── Podcast ──────────────────────────────────────────────────
    if (host.includes("podcasts.apple.com"))
      return {
        category: "podcast",
        platform: "Apple Podcasts",
        contentType: "episode",
      };
    if (host.includes("open.spotify.com") && parts[0] === "episode")
      return {
        category: "podcast",
        platform: "Spotify Podcasts",
        contentType: "episode",
      };
    if (host.includes("anchor.fm") || host.includes("podcasters.spotify.com"))
      return {
        category: "podcast",
        platform: "Spotify Podcasts",
        contentType: "episode",
      };
    if (host.includes("buzzsprout.com"))
      return {
        category: "podcast",
        platform: "Buzzsprout",
        contentType: "episode",
      };
    if (host.includes("podbean.com"))
      return {
        category: "podcast",
        platform: "Podbean",
        contentType: "episode",
      };

    // ── Events / ticketing ───────────────────────────────────────
    if (host.includes("eventbrite.com"))
      return {
        category: "event",
        platform: "Eventbrite",
        contentType: "event",
      };
    if (host.includes("dice.fm"))
      return { category: "event", platform: "Dice", contentType: "event" };
    if (host.includes("ticketmaster.com"))
      return {
        category: "event",
        platform: "Ticketmaster",
        contentType: "event",
      };
    if (host.includes("axs.com"))
      return { category: "event", platform: "AXS", contentType: "event" };
    if (host.includes("songkick.com"))
      return { category: "event", platform: "Songkick", contentType: "event" };
    if (host.includes("bandsintown.com"))
      return {
        category: "event",
        platform: "Bandsintown",
        contentType: "event",
      };
    if (host.includes("seetickets.com"))
      return {
        category: "event",
        platform: "See Tickets",
        contentType: "event",
      };
    if (host.includes("skiddle.com"))
      return { category: "event", platform: "Skiddle", contentType: "event" };

    // ── Music press ──────────────────────────────────────────────
    if (
      [
        "pitchfork.com",
        "rollingstone.com",
        "nme.com",
        "billboard.com",
        "stereogum.com",
        "theneedledrop.com",
        "xxlmag.com",
        "hotnewhiphop.com",
        "complex.com",
        "consequence.net",
        "allmusic.com",
        "discogs.com",
      ].some((d) => host.includes(d))
    )
      return {
        category: "press",
        platform: host.replace(/\.com$/, ""),
        contentType: "review",
      };

    // ── E-commerce / merch ───────────────────────────────────────
    if (
      host.includes("merch") ||
      host.includes("shop") ||
      host.includes("store") ||
      host.includes("bigcartel.com") ||
      host.includes("shopify.com") ||
      host.includes("etsy.com")
    )
      return { category: "ecommerce", platform: host, contentType: "product" };

    // ── Article / blog ───────────────────────────────────────────
    if (
      host.includes("medium.com") ||
      host.includes("substack.com") ||
      host.includes("wordpress.com") ||
      host.includes("ghost.io") ||
      host.includes("blogspot.com")
    )
      return { category: "article", platform: host, contentType: "article" };

    return { category: "website", platform: host, contentType: "page" };
  } catch {
    return { category: "other", platform: "", contentType: "link" };
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

interface PageMeta {
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  author?: string;
  type?: string; // og:type (article, music.song, video.other, etc.)
  publishDate?: string;
}

async function tryOEmbed(oembedUrl: string): Promise<PageMeta | null> {
  try {
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      title: d.title,
      author: d.author_name,
      siteName: d.provider_name,
    };
  } catch {
    return null;
  }
}

function inferSiteNameFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // "en.wikipedia.org" → "Wikipedia"
    const parts = host.split(".");
    if (parts.length >= 2) {
      const domain = parts[parts.length - 2];
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function scrapeHtml(url: string): Promise<PageMeta> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(14_000),
    redirect: "follow",
  });
  if (!res.ok) return {};

  const html = await res.text();

  // ── 1. Meta tag extractor (handles both attribute orderings) ──
  const getMeta = (...props: string[]): string | undefined => {
    for (const prop of props) {
      const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m =
        html.match(
          new RegExp(
            `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']{1,600})["']`,
            "i",
          ),
        ) ??
        html?.match(
          new RegExp(
            `<meta[^>]+content=["']([^"']{1,600})["'][^>]+(?:property|name)=["']${escaped}["']`,
            "i",
          ),
        );
      if (m?.[1]) return decodeHtmlEntities(m[1]);
    }
    return undefined;
  };

  // ── 2. JSON-LD structured data ─────────────────────────────────
  let jsonLdTitle: string | undefined;
  let jsonLdDescription: string | undefined;
  let jsonLdAuthor: string | undefined;
  let jsonLdDate: string | undefined;
  try {
    const ldMatches = [
      ...html.matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ];
    for (const m of ldMatches) {
      try {
        const ld = JSON.parse(m[1].trim());
        const items = Array.isArray(ld) ? ld : [ld];
        for (const item of items) {
          if (!jsonLdTitle && item.name) jsonLdTitle = String(item.name);
          if (!jsonLdTitle && item.headline)
            jsonLdTitle = String(item.headline);
          if (!jsonLdDescription && item.description)
            jsonLdDescription = String(item.description).slice(0, 400);
          if (!jsonLdAuthor && item.author)
            jsonLdAuthor =
              typeof item.author === "string"
                ? item.author
                : (item.author.name ?? "");
          if (!jsonLdDate && item.datePublished)
            jsonLdDate = String(item.datePublished);
        }
      } catch {
        /* malformed JSON-LD */
      }
    }
  } catch {
    /* ignore */
  }

  // ── 3. oEmbed discovery from HTML link tag ─────────────────────
  let oembedResult: PageMeta | null = null;
  try {
    const oembedLink =
      html.match(
        /<link[^>]+type=["']application\/json\+oembed["'][^>]+href=["']([^"']+)["']/i,
      ) ??
      html?.match(
        /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/json\+oembed["']/i,
      );
    if (oembedLink?.[1]) {
      oembedResult = await tryOEmbed(oembedLink[1]);
    }
  } catch {
    /* ignore */
  }

  // ── 4. Fallback: h1 + first paragraph ─────────────────────────
  const h1 = html.match(/<h1[^>]*>([^<]{3,200})<\/h1>/i)?.[1];
  const firstPara = html.match(/<p[^>]*>([^<]{30,400})<\/p>/i)?.[1];

  // ── 5. Assemble with priority ──────────────────────────────────
  // OG/twitter titles are already clean — only strip site-suffix from <title> tags
  const ogTitle =
    oembedResult?.title ??
    getMeta("og:title", "twitter:title", "dc.title") ??
    jsonLdTitle;
  const rawPageTitle = html.match(/<title[^>]*>([^<]{1,250})<\/title>/i)?.[1];
  const h1Title = h1 ? decodeHtmlEntities(h1) : undefined;

  // Strip "Page Title | Site Name" or "Page Title - Site Name" only from <title> tag
  const cleanPageTitle = rawPageTitle
    ? decodeHtmlEntities(rawPageTitle)
        .replace(/\s+[|\u2013\u2014]\s+[^|\u2013\u2014]{2,60}$/, "")
        .trim()
    : undefined;

  const siteNameFromMeta = oembedResult?.siteName ?? getMeta("og:site_name");
  const inferredSiteName = inferSiteNameFromUrl(url);
  const effectiveSiteName = siteNameFromMeta ?? inferredSiteName;

  let finalTitle = ogTitle
    ? decodeHtmlEntities(ogTitle).trim()
    : (cleanPageTitle ?? h1Title);
  // Strip site-name suffix from title (e.g. "Miles Davis - Wikipedia" → "Miles Davis")
  if (finalTitle && effectiveSiteName) {
    const esc = effectiveSiteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    finalTitle =
      finalTitle
        .replace(new RegExp(`\\s*[-–—|]\\s*${esc}\\s*$`, "i"), "")
        .trim() || finalTitle;
  }

  const rawDesc =
    getMeta(
      "og:description",
      "twitter:description",
      "description",
      "dc.description",
    ) ??
    jsonLdDescription ??
    (firstPara
      ? decodeHtmlEntities(firstPara.replace(/<[^>]+>/g, ""))
      : undefined);

  const cleanDesc = rawDesc?.replace(/<[^>]+>/g, "").trim();
  const BOT_WALL_DESC = [
    /confirm.*you.*re a human/i,
    /not a (robot|bot|spambot)/i,
    /verify.*you.*re a human/i,
    /ddos protection/i,
    /cloudflare.*ray id/i,
    /enable.*javascript.*cookies/i,
    /please enable cookies/i,
  ];
  const safeDesc =
    cleanDesc && BOT_WALL_DESC.some((re) => re.test(cleanDesc))
      ? undefined
      : cleanDesc;

  return {
    title: finalTitle || undefined,
    description: safeDesc,
    siteName: effectiveSiteName ?? undefined,
    image: getMeta("og:image", "twitter:image") ?? undefined,
    author:
      oembedResult?.author ??
      jsonLdAuthor ??
      getMeta("author", "dc.creator") ??
      undefined,
    type: getMeta("og:type") ?? undefined,
    publishDate: jsonLdDate ?? getMeta("article:published_time") ?? undefined,
  };
}

// ── MaxBooster own-app route metadata (no HTTP round-trip needed) ────────────
// When a user pastes a URL from the Max Booster app itself, we know exactly
// what each page is about without scraping.
const MAXBOOSTER_ROUTE_META: Record<string, PageMeta> = {
  "/": {
    title: "Max Booster - AI-Powered Music Career Platform",
    description:
      "All-in-one platform for artists and producers: AI music production studio, global distribution to 150+ platforms, beat marketplace, social media autopilot, streaming analytics, royalty management, and AI career coaching.",
    siteName: "Max Booster",
  },
  "/pricing": {
    title: "Max Booster Pricing - Plans Starting at $39/mo",
    description:
      "Monthly at $49/mo, Yearly at $39/mo (billed annually, save $120/year), or Lifetime access for a one-time $699 payment. Every plan includes AI music studio, distribution to 150+ platforms, social media autopilot, beat marketplace, analytics, and custom storefront. No hidden fees.",
    siteName: "Max Booster",
  },
  "/distribution": {
    title: "Music Distribution to 150+ Platforms - Max Booster",
    description:
      "Distribute your music to Spotify, Apple Music, TikTok, Amazon Music, and 150+ stores worldwide. Included in every Max Booster plan — no per-release fees. Keep 100% of your royalties and track streams in real time.",
    siteName: "Max Booster",
  },
  "/social-media": {
    title: "AI Social Media Manager for Music Artists - Max Booster",
    description:
      "Auto-generate platform-specific posts and schedule content across Instagram, TikTok, Twitter, Facebook, and more — powered by MaxCore AI. Turn any URL, track, or idea into ready-to-post social content in seconds.",
    siteName: "Max Booster",
  },
  "/analytics": {
    title: "Music Analytics Dashboard - Max Booster",
    description:
      "Track streams, royalties, audience demographics, and playlist placements across every DSP in one dashboard. AI-powered insights help you understand what's working and what to release next.",
    siteName: "Max Booster",
  },
  "/studio": {
    title: "AI Music Studio & Production Tools - Max Booster",
    description:
      "Professional-grade DAW powered by AI. Compose, mix, and master tracks in your browser. MaxCore AI generates beats, hooks, and arrangement ideas tailored to your style and genre.",
    siteName: "Max Booster",
  },
  "/beat-store": {
    title: "Beat Marketplace - Max Booster",
    description:
      "Browse and license beats from top producers. Find the perfect beat for your next hit with advanced AI-powered discovery, instant licensing, and secure payments.",
    siteName: "Max Booster",
  },
  "/marketplace": {
    title: "Beat Marketplace - Max Booster",
    description:
      "Browse and license beats from top producers. Find the perfect beat for your next hit with advanced AI-powered discovery, instant licensing, and secure payments.",
    siteName: "Max Booster",
  },
  "/career": {
    title: "AI Music Career Coach - Max Booster",
    description:
      "Get personalized career strategy powered by MaxCore AI. Identify growth opportunities, plan your next release, optimise your social presence, and build a sustainable music career.",
    siteName: "Max Booster",
  },
  "/dashboard": {
    title: "Your Music Career Dashboard - Max Booster",
    description:
      "Everything in one place: streams, earnings, upcoming releases, social performance, and AI recommendations — your complete music career command centre.",
    siteName: "Max Booster",
  },
  "/login": {
    title: "Sign In - Max Booster",
    description: "Sign in to Max Booster and manage your music career with AI.",
    siteName: "Max Booster",
  },
  "/register": {
    title: "Create Your Free Account - Max Booster",
    description:
      "Join Max Booster for free. AI music production, global distribution, social media automation, and more — no credit card required.",
    siteName: "Max Booster",
  },
};

// Plain hostnames (no regex chars) — checked with Set.has() or endsWith()
const MAXBOOSTER_HOSTS = new Set([
  "max-booster.com",
  "maxbooster.replit.app", // legacy
  "maxbooster.app",
  "localhost",
  "127.0.0.1",
]);

/** Return true when `host` looks like a Replit-hosted deployment of this app. */
function isReplitDevHost(host: string): boolean {
  // *.replit.dev  — Replit development preview URLs (any user handle + project UUID)
  // *.repl.co     — older Replit format
  // *.replit.app  — Replit deployment format (already in MAXBOOSTER_HOSTS but catch-all)
  return (
    host.endsWith(".replit.dev") ||
    host.endsWith(".repl.co") ||
    host.endsWith(".replit.app")
  );
}

function getMaxBoosterRouteMeta(url: string): PageMeta | null {
  try {
    const u = new URL(url);
    const host = u.hostname.split(":")[0].toLowerCase();
    const isOwnApp =
      MAXBOOSTER_HOSTS.has(host) ||
      host.endsWith(".max-booster.com") ||
      host.endsWith(".maxbooster.replit.app") ||
      host.endsWith(".maxbooster.app") ||
      isReplitDevHost(host); // dev previews of this very app
    if (!isOwnApp) return null;

    const cleanPath = u.pathname.replace(/\/$/, "") || "/";
    // Exact match first, then first path segment (e.g. /pricing?plan=pro → /pricing)
    return (
      MAXBOOSTER_ROUTE_META[cleanPath] ??
      MAXBOOSTER_ROUTE_META[`/${cleanPath.split("/")[1]}`] ??
      // For Replit dev URLs with no specific route data, fall back to root meta
      // so the generator always has meaningful platform copy instead of the raw URL.
      MAXBOOSTER_ROUTE_META["/"] ??
      null
    );
  } catch {
    return null;
  }
}

async function fetchUrlMetadata(
  url: string,
  _ctx: UrlContext,
): Promise<PageMeta> {
  // ── Max Booster own-app routes — no HTTP round-trip needed ─────
  const ownMeta = getMaxBoosterRouteMeta(url);
  if (ownMeta) return ownMeta;

  // ── Known oEmbed endpoints (no need to scrape HTML first) ──────
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const r = await tryOEmbed(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (r?.title)
      return {
        ...r,
        siteName: "YouTube",
        description: `Video by ${r.author ?? "creator"}`,
      };
  }
  if (url.includes("spotify.com")) {
    const r = await tryOEmbed(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
    );
    if (r?.title)
      return {
        ...r,
        siteName: "Spotify",
        description: r.author
          ? `by ${r.author} on Spotify`
          : "Streaming on Spotify",
      };
  }
  if (url.includes("soundcloud.com")) {
    const r = await tryOEmbed(
      `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (r?.title)
      return {
        ...r,
        siteName: "SoundCloud",
        description: r.author
          ? `Track by ${r.author} on SoundCloud`
          : undefined,
      };
  }
  if (url.includes("vimeo.com")) {
    const r = await tryOEmbed(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
    );
    if (r?.title)
      return {
        ...r,
        siteName: "Vimeo",
        description: r.author ? `Video by ${r.author}` : undefined,
      };
  }
  if (url.includes("twitter.com") || url.includes("x.com")) {
    const r = await tryOEmbed(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`,
    );
    if (r?.title) return { ...r, siteName: "X (Twitter)" };
  }
  if (url.includes("bandcamp.com")) {
    const r = await tryOEmbed(
      `https://bandcamp.com/api/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (r?.title)
      return {
        ...r,
        siteName: "Bandcamp",
        description: r.author ? `by ${r.author} on Bandcamp` : undefined,
      };
  }

  // ── HTML scrape with full extraction pipeline ──────────────────
  try {
    const meta = await scrapeHtml(url);
    // Strip generic "shell" titles returned by JS-rendered apps
    const GENERIC_TITLES = [
      /^spotify\s*[-–—|]/i,
      /^spotify$/i,
      /^soundcloud\s*[-–—|]/i,
      /^soundcloud$/i,
      /^tiktok\s*[-–—|]/i,
      /^tiktok$/i,
      /^instagram\s*[-–—|]/i,
      /^instagram$/i,
      /^facebook\s*[-–—|]/i,
      /^facebook$/i,
      /^twitter\s*[-–—|]/i,
      /^x\s*[-–—|]/i,
      /^medium$/i,
      /^home$/i,
      /^just a moment/i,
      /^loading/i,
      /^please wait/i,
      /^access denied/i,
      /^403/i,
      /^404/i,
      /^page not found/i,
      /^error/i,
      /^verify to continue/i,
      /^security check/i,
      /^attention required/i,
      /^ddos protection/i,
      /^bot.*detected/i,
      /^captcha/i,
      /^one more step/i,
      /^checking your browser/i,
    ];
    if (meta.title) {
      const isGeneric = GENERIC_TITLES.some((re) => re.test(meta.title!));
      if (isGeneric) meta.title = undefined;
    }
    // Also strip if title exactly matches site name
    if (
      meta.title &&
      meta.siteName &&
      meta.title.toLowerCase() === meta.siteName.toLowerCase()
    ) {
      meta.title = undefined;
    }
    // Wipe description if it looks like a bot-wall / captcha page
    if (meta.description) {
      const BOT_WALL = [
        /confirm.*you.*re a human/i,
        /not a (robot|bot|spambot)/i,
        /verify.*you.*re a human/i,
        /security check/i,
        /cloudflare.*ray id/i,
        /enable.*javascript.*cookies/i,
      ];
      if (BOT_WALL.some((re) => re.test(meta.description!))) {
        meta.description = undefined;
      }
    }
    return meta;
  } catch {
    return {};
  }
}

// ─── Dynamic Hashtag Engine ──────────────────────────────────────────────────
// Per content-category, per platform hashtag pools (ordered by performance weight)
const HASHTAG_LIBRARY: Record<string, Record<string, string[]>> = {
  music_stream: {
    instagram: [
      "#newmusic",
      "#nowplaying",
      "#streaming",
      "#newrelease",
      "#indieartist",
      "#musician",
      "#hiphop",
      "#rnb",
      "#music",
      "#artist",
    ],
    facebook: ["#newmusic", "#streaming", "#music"],
    tiktok: ["#newmusic", "#fyp", "#music", "#artist", "#viral"],
    twitter: ["#newmusic", "#music"],
    youtube: [],
    linkedin: ["#music", "#newrelease", "#artist"],
    threads: [],
    google_business: [],
  },
  music_video: {
    instagram: [
      "#musicvideo",
      "#officialvideo",
      "#newvideo",
      "#nowplaying",
      "#musician",
      "#newmusic",
      "#hiphop",
      "#vibes",
      "#music",
      "#artist",
    ],
    facebook: ["#musicvideo", "#newrelease", "#music"],
    tiktok: ["#musicvideo", "#fyp", "#newmusic", "#official", "#viral"],
    twitter: ["#musicvideo", "#music"],
    youtube: [],
    linkedin: ["#music", "#musicvideo", "#artist"],
    threads: [],
    google_business: [],
  },
  video: {
    instagram: [
      "#newvideo",
      "#contentcreator",
      "#behindthescenes",
      "#music",
      "#artist",
      "#vlog",
      "#viral",
      "#fyp",
    ],
    facebook: ["#video", "#music", "#artist"],
    tiktok: ["#fyp", "#viral", "#artist", "#music", "#trending"],
    twitter: ["#video", "#music"],
    youtube: [],
    linkedin: ["#video", "#music", "#artist"],
    threads: [],
    google_business: [],
  },
  event: {
    instagram: [
      "#concert",
      "#livemusic",
      "#tickets",
      "#event",
      "#live",
      "#musicfestival",
      "#tour",
      "#artist",
    ],
    facebook: ["#concert", "#livemusic", "#tickets"],
    tiktok: ["#concert", "#fyp", "#livemusic", "#tickets", "#tour"],
    twitter: ["#concert", "#livemusic"],
    youtube: [],
    linkedin: ["#event", "#music", "#concert"],
    threads: [],
    google_business: [],
  },
  press: {
    instagram: [
      "#press",
      "#feature",
      "#media",
      "#artist",
      "#music",
      "#interview",
      "#magazine",
      "#promo",
    ],
    facebook: ["#press", "#feature", "#music"],
    tiktok: ["#press", "#fyp", "#music", "#feature", "#viral"],
    twitter: ["#press", "#music"],
    youtube: [],
    linkedin: ["#press", "#media", "#music", "#feature", "#musicindustry"],
    threads: [],
    google_business: [],
  },
  ecommerce: {
    instagram: [
      "#merch",
      "#drop",
      "#shopnow",
      "#limitededition",
      "#newdrop",
      "#merchandise",
      "#artist",
      "#fashion",
    ],
    facebook: ["#merch", "#drop", "#shopnow"],
    tiktok: ["#merch", "#fyp", "#drop", "#shopnow", "#tiktokshop"],
    twitter: ["#merch", "#drop"],
    youtube: [],
    linkedin: ["#merch", "#merchandise", "#artist"],
    threads: [],
    google_business: [],
  },
  podcast: {
    instagram: [
      "#podcast",
      "#newepisode",
      "#music",
      "#interview",
      "#podcastlife",
      "#listen",
      "#nowplaying",
    ],
    facebook: ["#podcast", "#newepisode", "#music"],
    tiktok: ["#podcast", "#fyp", "#newepisode", "#music", "#podcastclips"],
    twitter: ["#podcast", "#music"],
    youtube: [],
    linkedin: ["#podcast", "#music", "#interview", "#content"],
    threads: [],
    google_business: [],
  },
  article: {
    instagram: [
      "#article",
      "#blog",
      "#music",
      "#read",
      "#musicindustry",
      "#artist",
      "#culture",
    ],
    facebook: ["#article", "#blog", "#music"],
    tiktok: ["#music", "#fyp", "#article", "#learn"],
    twitter: ["#music", "#article"],
    youtube: [],
    linkedin: ["#article", "#musicindustry", "#music", "#insights"],
    threads: [],
    google_business: [],
  },
  social_post: {
    instagram: ["#music", "#artist", "#vibes", "#content", "#newpost"],
    facebook: ["#music", "#artist"],
    tiktok: ["#fyp", "#music", "#artist", "#viral"],
    twitter: ["#music", "#artist"],
    youtube: [],
    linkedin: ["#music", "#artist"],
    threads: [],
    google_business: [],
  },
};

function getHashtagsForPlatform(
  category: string,
  platform: string,
  max: number,
  artistName?: string,
): string {
  if (max === 0) return "";
  const pool =
    HASHTAG_LIBRARY[category][platform] ??
    HASHTAG_LIBRARY["social_post"][platform] ??
    [];
  const tags = pool.slice(0, max - (artistName ? 1 : 0));
  if (artistName) {
    const artistTag =
      "#" + artistName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (artistTag.length > 1 && !tags.includes(artistTag)) tags.push(artistTag);
  }
  return tags.length > 0 ? "\n\n" + tags.join(" ") : "";
}

// ─── Per-Platform Copy Builder ────────────────────────────────────────────────
// Returns genuinely differentiated copy for each target platform.
// Content style, length, tone, and angle all vary by platform norms.
function buildCopyFromContext(
  ctx: UrlContext,
  meta: PageMeta,
  _intent: string,
  targetPlatform?: string,
): { hook: string; body: string; cta: string } {
  const title = meta.title ?? "";
  const desc = meta.description ?? "";
  const platform = meta.siteName ?? ctx.platform;
  const author = meta.author ?? "";
  const tp = targetPlatform ?? "";

  // Per-platform copy factories per content category
  switch (ctx.category) {
    case "music_stream": {
      if (tp === "tiktok")
        return {
          hook: title
            ? `POV: "${title}" just hit different 🎵`
            : `POV: This song just changed everything 🎵`,
          body: desc.slice(0, 80) || "The vibes are immaculate 🔥",
          cta: `🔗 Link in bio to stream`,
        };
      if (tp === "twitter")
        return {
          hook: title
            ? `🎵 "${title}" is out now on ${platform}`
            : `🎵 New music just dropped`,
          body: desc.slice(0, 100) || "",
          cta: `Stream it 🔗`,
        };
      if (tp === "youtube")
        return {
          hook: title
            ? `New Release: "${title}" — Out Now on ${platform}`
            : `New Music — Out Now`,
          body:
            desc ||
            `Stream "${title}" on ${platform}. Drop a comment with your favorite lyric! 🎤`,
          cta: `🔔 Subscribe for more and hit the like button!`,
        };
      if (tp === "linkedin")
        return {
          hook: title
            ? `Excited to announce my latest release: "${title}"`
            : `New music release announcement`,
          body:
            desc ||
            `After months of work, this track is finally out on ${platform}. Music is the universal language — I hope it resonates.`,
          cta: `Stream it now — link in the first comment.`,
        };
      if (tp === "threads")
        return {
          hook: title ? `"${title}" is out now 🎶` : `New music just dropped`,
          body: desc.slice(0, 100) || `Feels like the right time for this one`,
          cta: `Link in bio`,
        };
      if (tp === "facebook")
        return {
          hook: title
            ? `🎵 "${title}" is now streaming everywhere!`
            : `🎵 New music is now streaming!`,
          body:
            desc ||
            `I've been working on this for a while and I'm so excited to finally share it. This track means a lot to me and I can't wait for you all to hear it.`,
          cta: `Stream now on ${platform} — link in the comments 🔗`,
        };
      if (tp === "google_business")
        return {
          hook: title ? `New Music Release: "${title}"` : `New music release`,
          body: desc || `Now available on all major streaming platforms.`,
          cta: `Listen now on ${platform}`,
        };
      return {
        hook: title
          ? `🎵 "${title}" is streaming now on ${platform}!`
          : `🎵 New music on ${platform}!`,
        body:
          desc ||
          (title
            ? `Listen to "${title}" — link in bio!`
            : `Stream the latest on ${platform}`),
        cta: `Stream on ${platform} 🔗 Link in bio!`,
      };
    }

    case "music_video": {
      if (tp === "tiktok")
        return {
          hook: title
            ? `🎬 We need to talk about this music video "${title}"`
            : `🎬 This music video hits HARD`,
          body: `Tell me your favorite part in the comments 👇`,
          cta: `🔗 Full video — link in bio`,
        };
      if (tp === "twitter")
        return {
          hook: title
            ? `🎬 "${title}" — official video is out`
            : `🎬 New music video just dropped`,
          body: "",
          cta: `Watch now 🔗`,
        };
      if (tp === "youtube")
        return {
          hook: title
            ? `Official Music Video: "${title}"`
            : `Official Music Video — Out Now`,
          body:
            desc ||
            `Watch the official music video. If you love it, hit subscribe and turn on notifications for more!`,
          cta: `🔔 Subscribe for new music videos and hit the like button!`,
        };
      if (tp === "linkedin")
        return {
          hook: title
            ? `Proud to share the official music video for "${title}"`
            : `New music video release`,
          body:
            desc ||
            `Storytelling through visuals — this video took months of creative work to bring to life.`,
          cta: `Watch the full video — link below.`,
        };
      if (tp === "threads")
        return {
          hook: title
            ? `music video for "${title}" is live 🎬`
            : `new music video is live 🎬`,
          body: desc.slice(0, 80) || `go watch it`,
          cta: `link in bio`,
        };
      if (tp === "facebook")
        return {
          hook: title
            ? `🎬 The official music video for "${title}" is HERE!`
            : `🎬 New music video just dropped!`,
          body:
            desc ||
            `I'm so proud of this one. Every scene tells a story. Watch the full video and let me know what you think in the comments!`,
          cta: `Watch on ${platform} — link below! 🎬`,
        };
      return {
        hook: title
          ? `🎬 "${title}" — official music video just dropped!`
          : `🎬 New music video just dropped!`,
        body: desc || `Watch the official video — link in bio!`,
        cta: `Watch on ${platform} 🎬 Link in bio!`,
      };
    }

    case "video": {
      if (tp === "tiktok")
        return {
          hook: title
            ? `you need to watch this "${title}" 👀`
            : `you need to see this 👀`,
          body: author ? `by ${author}` : "",
          cta: `🔗 Watch the full thing`,
        };
      if (tp === "twitter")
        return {
          hook: title ? `📹 "${title}"` : `📹 New video`,
          body: author ? `by ${author}` : "",
          cta: `Watch 🔗`,
        };
      if (tp === "youtube")
        return {
          hook: title ? `Watch: "${title}"` : `New Video — Watch Now`,
          body:
            desc ||
            (author ? `by ${author}` : "") ||
            "Like and subscribe for more content!",
          cta: `🔔 Subscribe and hit the like button!`,
        };
      if (tp === "linkedin")
        return {
          hook: title ? `Worth watching: "${title}"` : `Sharing this video`,
          body:
            desc || (author ? `by ${author}` : "") || "Great perspective here.",
          cta: `Full video in the comments.`,
        };
      if (tp === "threads")
        return {
          hook: title ? `"${title}" 📹` : `new video 📹`,
          body: desc.slice(0, 80) || "",
          cta: `link in bio`,
        };
      if (tp === "facebook")
        return {
          hook: title ? `📹 Watch: "${title}"` : `📹 New video — check it out!`,
          body:
            desc ||
            (author ? `by ${author}` : "") ||
            "Let me know what you think in the comments!",
          cta: `Watch on ${platform} ▶️`,
        };
      return {
        hook: title ? `📹 Watch: "${title}"` : `📹 New video — check it out!`,
        body: desc || (author ? `by ${author}` : "") || "Link in bio!",
        cta: `Watch on ${platform} ▶️ Link in bio!`,
      };
    }

    case "social_post": {
      if (tp === "tiktok")
        return {
          hook: title || `check this out 👀`,
          body: desc.slice(0, 60) || "",
          cta: `🔗 follow for more`,
        };
      if (tp === "twitter")
        return {
          hook: title || `Check this out`,
          body: "",
          cta: `🔗`,
        };
      if (tp === "linkedin")
        return {
          hook: title || `Worth sharing`,
          body: desc || `Interesting content from ${platform}.`,
          cta: `Link in comments.`,
        };
      if (tp === "threads")
        return {
          hook: title || `look at this`,
          body: desc.slice(0, 80) || "",
          cta: ``,
        };
      return {
        hook: title || `Check out this ${ctx.contentType} 👀`,
        body: desc || `See what I posted on ${platform}!`,
        cta: `Follow me on ${platform} 🔗 Link in bio!`,
      };
    }

    case "podcast": {
      if (tp === "tiktok")
        return {
          hook: title
            ? `🎙️ this podcast episode "${title}" changed how I think about music`
            : `🎙️ this podcast episode is insane`,
          body: desc.slice(0, 80) || "",
          cta: `🔗 full episode — link in bio`,
        };
      if (tp === "twitter")
        return {
          hook: title
            ? `🎙️ New episode: "${title}"`
            : `🎙️ New podcast episode out`,
          body: desc.slice(0, 80) || "",
          cta: `Listen 🔗`,
        };
      if (tp === "youtube")
        return {
          hook: title
            ? `New Episode: "${title}"`
            : `New Podcast Episode — Out Now`,
          body:
            desc ||
            `Listen to the full episode. Subscribe and leave a comment!`,
          cta: `🔔 Subscribe for new episodes every week!`,
        };
      if (tp === "linkedin")
        return {
          hook: title
            ? `New podcast episode: "${title}"`
            : `New podcast episode out now`,
          body:
            desc ||
            `Diving deep into topics that matter for artists and creators.`,
          cta: `Listen in the link below.`,
        };
      if (tp === "threads")
        return {
          hook: title
            ? `new episode: "${title}" 🎙️`
            : `new podcast episode just dropped 🎙️`,
          body: desc.slice(0, 80) || "",
          cta: `link in bio`,
        };
      if (tp === "facebook")
        return {
          hook: title
            ? `🎙️ New podcast episode: "${title}"`
            : `🎙️ New podcast episode!`,
          body:
            desc ||
            `We covered so much ground in this one. Whether you're an artist, producer, or music fan — this episode is for you. Drop your thoughts in the comments!`,
          cta: `Listen on ${platform} 🎙️ Link in comments!`,
        };
      return {
        hook: title
          ? `🎙️ New episode: "${title}"`
          : `🎙️ New podcast episode out now!`,
        body: desc || "Listen to the latest episode — link in bio!",
        cta: `Listen on ${platform} 🎙️ Link in bio!`,
      };
    }

    case "event": {
      if (tp === "tiktok")
        return {
          hook: title
            ? `🎟️ get your tickets NOW for "${title}" before they sell out`
            : `🎟️ tickets dropping NOW — don't miss this`,
          body: desc.slice(0, 80) || `these go FAST`,
          cta: `🔗 grab tickets — link in bio`,
        };
      if (tp === "twitter")
        return {
          hook: title ? `🎟️ ${title}` : `🎟️ Tickets on sale now`,
          body: desc.slice(0, 80) || "",
          cta: `Get yours 🔗`,
        };
      if (tp === "youtube")
        return {
          hook: title
            ? `Live Event: "${title}" — Get Your Tickets Now`
            : `Live Event — Tickets Available Now`,
          body:
            desc ||
            `Don't miss this live experience. Tickets available now. Subscribe for tour updates!`,
          cta: `🔔 Subscribe for announcements and upcoming dates!`,
        };
      if (tp === "linkedin")
        return {
          hook: title
            ? `Excited to announce: "${title}"`
            : `Event announcement`,
          body:
            desc ||
            `This is going to be an incredible experience. Come join us.`,
          cta: `Tickets available — link in comments.`,
        };
      if (tp === "threads")
        return {
          hook: title ? `"${title}" 🎟️` : `tickets are up 🎟️`,
          body: desc.slice(0, 80) || `get em before they're gone`,
          cta: `link in bio`,
        };
      if (tp === "facebook")
        return {
          hook: title
            ? `🎟️ Tickets are LIVE for "${title}"!`
            : `🎟️ Tickets are on sale now!`,
          body:
            desc ||
            `Don't wait — these tickets WILL sell out. Tag a friend you want to come with and grab your tickets now!`,
          cta: `Get your tickets on ${platform} 🎟️ Link in comments!`,
        };
      return {
        hook: title ? `🎟️ ${title}` : `🎟️ Tickets on sale now!`,
        body: desc || "Get your tickets before they sell out!",
        cta: `Grab tickets on ${platform} 🎟️ Link in bio!`,
      };
    }

    case "press": {
      if (tp === "tiktok")
        return {
          hook: title
            ? `🗞️ they wrote about me "${title}" and I'm not okay`
            : `🗞️ press feature just dropped and I'm emotional`,
          body: author
            ? `shoutout ${author} for the love`
            : `grateful for the coverage`,
          cta: `🔗 read the full article — link in bio`,
        };
      if (tp === "twitter")
        return {
          hook: title ? `📰 "${title}"` : `📰 Press feature just dropped`,
          body: author ? `via ${author}` : "",
          cta: `Read it 🔗`,
        };
      if (tp === "youtube")
        return {
          hook: title
            ? `Press Feature: "${title}"`
            : `Press Feature — Read Now`,
          body:
            desc ||
            (author ? `Written by ${author}` : "") ||
            `Read the full article. Subscribe for more updates!`,
          cta: `🔔 Subscribe for more news and updates!`,
        };
      if (tp === "linkedin")
        return {
          hook: title
            ? `Honored to be featured: "${title}"`
            : `Exciting press coverage`,
          body:
            desc ||
            (author ? `A thoughtful piece by ${author}` : "") ||
            `Grateful for the recognition and the opportunity to share my story.`,
          cta: `Read the full feature — link in comments.`,
        };
      if (tp === "threads")
        return {
          hook: title ? `"${title}" 📰` : `press feature just went up 📰`,
          body: author ? `written by ${author}` : "",
          cta: `link in bio`,
        };
      if (tp === "facebook")
        return {
          hook: title
            ? `📰 Just got featured: "${title}"`
            : `📰 Press feature just dropped!`,
          body:
            desc ||
            (author
              ? `Thank you to ${author} for this incredible piece. Read the full article and let me know what you think!`
              : `So grateful for this feature. Read the full article — link below!`),
          cta: `Read on ${platform} 📰 Link in comments!`,
        };
      return {
        hook: title ? `📰 "${title}"` : `📰 Press feature just dropped!`,
        body:
          desc ||
          (author ? `Review by ${author}` : "") ||
          `Read the full feature — link in bio!`,
        cta: `Read on ${platform} 📰 Link in bio!`,
      };
    }

    case "ecommerce": {
      if (tp === "tiktok")
        return {
          hook: title
            ? `🛍️ the "${title}" drop is HERE and it's selling OUT`
            : `🛍️ new merch drop and it's going FAST`,
          body: `get it before it's gone 🔥`,
          cta: `🔗 shop now — link in bio`,
        };
      if (tp === "twitter")
        return {
          hook: title ? `🛍️ ${title} — just dropped` : `🛍️ New merch drop`,
          body: "",
          cta: `Shop now 🔗`,
        };
      if (tp === "youtube")
        return {
          hook: title
            ? `New Merch Drop: "${title}" — Available Now`
            : `New Merch — Shop Now`,
          body:
            desc ||
            `Grab the latest before it sells out. Subscribe for future drops!`,
          cta: `🔔 Subscribe for exclusive drops and announcements!`,
        };
      if (tp === "linkedin")
        return {
          hook: title
            ? `New merchandise available: "${title}"`
            : `New merchandise drop`,
          body:
            desc ||
            `Excited to share the latest merch drop with the community.`,
          cta: `Shop now — link in comments.`,
        };
      if (tp === "threads")
        return {
          hook: title
            ? `"${title}" merch is live 🛍️`
            : `new merch just dropped 🛍️`,
          body: desc.slice(0, 80) || `grab it before it's gone`,
          cta: `link in bio`,
        };
      if (tp === "facebook")
        return {
          hook: title
            ? `🛍️ NEW DROP: "${title}" is available NOW!`
            : `🛍️ New merch just dropped!`,
          body:
            desc ||
            `We worked hard on this and I think you're going to love it. Quantities are limited — don't sleep on this! Tag someone who needs this in their life.`,
          cta: `Shop now 🛍️ Link in comments!`,
        };
      return {
        hook: title ? `🛍️ ${title}` : `🛍️ New merch drop!`,
        body: desc || "Shop the latest — link in bio!",
        cta: `Shop now 🛍️ Link in bio!`,
      };
    }

    case "article": {
      if (tp === "tiktok")
        return {
          hook: title
            ? `📖 "${title}" — read this if you care about your music career`
            : `📖 this article on music is required reading`,
          body: author ? `by ${author}` : "",
          cta: `🔗 link in bio`,
        };
      if (tp === "twitter")
        return {
          hook: title ? `✍️ "${title}"` : `✍️ New post just went live`,
          body: author ? `by ${author}` : "",
          cta: `Read 🔗`,
        };
      if (tp === "youtube")
        return {
          hook: title ? `Read This: "${title}"` : `New Article — Read Now`,
          body:
            desc ||
            (author ? `by ${author}` : "") ||
            `New content out now. Subscribe for more!`,
          cta: `🔔 Subscribe for regular content and updates!`,
        };
      if (tp === "linkedin")
        return {
          hook: title
            ? `Worth reading: "${title}"`
            : `New article I think you should read`,
          body:
            desc ||
            (author ? `Written by ${author}` : "") ||
            `Insightful read for anyone in the music industry.`,
          cta: `Full article in the comments.`,
        };
      if (tp === "threads")
        return {
          hook: title ? `"${title}" ✍️` : `new post just went live ✍️`,
          body: desc.slice(0, 80) || "",
          cta: `link in bio`,
        };
      if (tp === "facebook")
        return {
          hook: title
            ? `✍️ New article: "${title}"`
            : `✍️ New post just went live!`,
          body:
            desc ||
            (author ? `Written by ${author}` : "") ||
            `Really proud of this one. Read it and let me know what you think in the comments!`,
          cta: `Read more ✍️ Link in comments!`,
        };
      return {
        hook: title ? `✍️ "${title}"` : `✍️ New post just went live!`,
        body:
          desc ||
          (author ? `Written by ${author}` : "") ||
          "Read it — link in bio!",
        cta: `Read more ✍️ Link in bio!`,
      };
    }

    default: {
      if (tp === "tiktok")
        return {
          hook: title
            ? `check this out "${title}" 🔗`
            : `you need to see this 🔗`,
          body: desc.slice(0, 60) || "",
          cta: `link in bio`,
        };
      if (tp === "twitter")
        return {
          hook: title ? `🔗 ${title}` : `🔗 Check this out`,
          body: "",
          cta: `🔗`,
        };
      if (tp === "linkedin")
        return {
          hook: title || `Worth sharing`,
          body: desc || `Sharing this with my network.`,
          cta: platform
            ? `More on ${platform} — link in comments.`
            : `Link in comments.`,
        };
      if (tp === "threads")
        return {
          hook: title || `look at this`,
          body: desc.slice(0, 80) || "",
          cta: `link in bio`,
        };
      if (tp === "facebook")
        return {
          hook: title ? `🔗 ${title}` : `🔗 Check this out!`,
          body:
            desc ||
            `Sharing this with all of you. Let me know your thoughts in the comments!`,
          cta: platform
            ? `Visit on ${platform} 🔗 Link in comments!`
            : `🔗 Link in comments!`,
        };
      return {
        hook: title ? `🔗 ${title}` : `🔗 Check this out!`,
        body: desc || "Link in bio!",
        cta: platform
          ? `Visit on ${platform} 🔗 Link in bio!`
          : "🔗 Link in bio!",
      };
    }
  }
}

async function _localAnalyzeUrl(
  url: string,
  req: GenerationRequest,
  platformRulesSubset: Record<string, PlatformRules>,
): Promise<unknown> {
  const ctx = classifyUrl(url);
  const meta = await fetchUrlMetadata(url, ctx);

  const title = meta.title ?? "";
  const desc = meta.description ?? "";
  const siteName = meta.siteName ?? ctx.platform;

  // Generate shared (generic) copy and per-platform differentiated copy
  const copy = buildCopyFromContext(
    ctx,
    { ...meta, siteName },
    req.intent ?? "promote",
  );
  const perPlatformCopy: Record<
    string,
    { hook: string; body: string; cta: string }
  > = {};
  for (const p of req.platforms) {
    perPlatformCopy[p] = buildCopyFromContext(
      ctx,
      { ...meta, siteName },
      req.intent ?? "promote",
      p,
    );
  }

  const summary =
    [title, desc.slice(0, 120)].filter(Boolean).join(" — ") ||
    `${ctx.category === "event" ? "Upcoming event" : "New content"} on ${siteName || url}`;

  logger.info(
    `[MultimodalGen] URL analyzed: category=${ctx.category} title="${title || "(none)"}" platform=${siteName || ctx.platform}`,
  );

  return {
    summary,
    hook: copy.hook,
    body: copy.body,
    cta: copy.cta,
    perPlatformCopy,
    title,
    description: desc,
    siteName,
    author: meta.author,
    imageUrl: meta.image,
    publishDate: meta.publishDate,
    sourceUrl: url,
    urlCategory: ctx.category,
    modality: "url",
    platforms: req.platforms,
    intent: req.intent,
    metadata: {
      ...(req.input.metadata || {}),
      sourceUrl: url,
      title,
      siteName,
      urlCategory: ctx.category,
    },
    platformRules: platformRulesSubset,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function normalizeInput(req: GenerationRequest): Promise<unknown> {
  const platformRulesSubset = req.platforms.reduce<
    Record<string, PlatformRules>
  >((acc, p) => {
    acc[p] = getRules(p);
    return acc;
  }, {});

  const payload = req.input.payload ?? "";
  let prefetchedMeta: PageMeta | null = null;

  // Pre-fetch URL metadata so MaxCore gets the full page content, not just a bare URL
  if (req.input.modality === "url" && /^https?:\/\//i.test(payload)) {
    try {
      const ctx = classifyUrl(payload);
      prefetchedMeta = await fetchUrlMetadata(payload, ctx);
      logger.debug(
        `[MultimodalGen] Pre-fetched URL metadata: title="${prefetchedMeta.title ?? ""}" siteName="${prefetchedMeta.siteName ?? ""}"`,
      );
    } catch (fetchErr) {
      logger.debug({ err: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) }, "[MultimodalGen] URL pre-fetch failed (non-fatal):",
      );
    }
  }

  try {
    return await maxcorePost(
      "/analyze",
      {
        modality: req.input.modality,
        payload: req.input.payload,
        artistProfileId: req.artistProfileId,
        platforms: req.platforms,
        intent: req.intent,
        // Merge pre-fetched metadata so MaxCore has the actual page content
        metadata: {
          ...(req.input.metadata || {}),
          ...(prefetchedMeta
            ? {
                title: prefetchedMeta.title,
                description: prefetchedMeta.description,
                siteName: prefetchedMeta.siteName,
                author: prefetchedMeta.author,
                image: prefetchedMeta.image,
                publishDate: prefetchedMeta.publishDate,
              }
            : {}),
        },
        platformRules: platformRulesSubset,
      },
      8_000,
    ); // 8 s — fail fast to local fallback
  } catch (err) {
    // MaxCore is the sole AI source — no local fallback.
    logger.warn(
      { err },
      `[MultimodalGen] MaxCore /analyze unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw new AIUnavailableError("multimodal content analysis");
  }
}

function buildStepParamsForPlatform(
  platform: Platform,
  modality: "text" | "image" | "audio" | "video",
  slotId?: string,
  purpose?: string,
): Record<string, any> {
  const rules = getRules(platform);
  const base: Record<string, any> = { platform, slotId, purpose };

  if (modality === "text") {
    base.maxLength = rules.text.maxLength ?? rules.text.descriptionMax ?? 5000;
    base.recommendedLength = rules.text.recommendedLength;
    base.tone = rules.text.tone;
    base.hashtagsAllowed = rules.text.hashtags?.allowed ?? false;
    base.maxHashtags = rules.text.hashtags?.allowed
      ? (rules.text.hashtags.max ?? 5)
      : 0;
    if (platform === "youtube") {
      base.titleMax = rules.text.titleMax;
      base.descriptionMax = rules.text.descriptionMax;
    }
  } else if (modality === "image") {
    base.aspectRatios = rules.image.aspectRatios;
    base.recommendedAspectRatio =
      rules.image.recommended ?? rules.image.aspectRatios[0];
  } else if (modality === "video") {
    base.aspectRatios = rules.video.aspectRatios;
    base.recommendedAspectRatio = rules.video.aspectRatios[0];
    base.maxDurationSec = rules.video.maxDurationSec;
    base.recommendedDurationSec =
      rules.video.recommendedDurationSec ?? rules.video.recommendedShortSec;
    base.requiresHook = rules.video.requiresHook ?? false;
  } else if (modality === "audio") {
    base.voiceover = rules.audio.voiceover;
    base.maxDurationSec = rules.audio.maxDurationSec;
    base.audioStyle = rules.audio.style ?? rules.audio.tone ?? [];
  }

  return base;
}

async function planTasks(
  _normalized: Record<string, unknown>,
  req: GenerationRequest,
): Promise<TaskPlan> {
  // The remote planner (/generate/text with mode: 'planner') always produces
  // garbled output that fails JSON parsing, causing a 30-second timeout on
  // every request.  Use the deterministic local plan builder directly.
  return buildDefaultPlan(req);
}

function buildDefaultPlan(req: GenerationRequest): TaskPlan {
  const packSpec = req.packId ? (PACK_DEFINITIONS[req.packId] ?? null) : null;
  const steps: TaskStep[] = [];

  if (packSpec) {
    const textSlots = packSpec.filter((s) => s.modality === "text");
    const imageSlots = packSpec.filter((s) => s.modality === "image");
    const audioSlots = packSpec.filter((s) => s.modality === "audio");
    const videoSlots = packSpec.filter((s) => s.modality === "video");

    if (textSlots.length > 0) {
      steps.push({
        id: "step_text",
        type: "generate",
        worker: "text",
        inputFrom: "normalizedInput",
        params: {
          slots: textSlots.map((slot) => ({
            ...slot,
            ...buildStepParamsForPlatform(
              slot.platform as Platform,
              "text",
              slot.id,
              slot.purpose,
            ),
          })),
        },
      });
    }

    if (imageSlots.length > 0) {
      steps.push({
        id: "step_image",
        type: "generate",
        worker: "image",
        inputFrom: "normalizedInput",
        params: {
          slots: imageSlots.map((slot) => ({
            ...slot,
            ...buildStepParamsForPlatform(
              slot.platform as Platform,
              "image",
              slot.id,
              slot.purpose,
            ),
          })),
        },
      });
    }

    for (const slot of audioSlots) {
      steps.push({
        id: `step_audio_${slot.id}`,
        type: "generate",
        worker: "audio",
        inputFrom: "normalizedInput",
        params: buildStepParamsForPlatform(
          slot.platform as Platform,
          "audio",
          slot.id,
          slot.purpose,
        ),
      });
    }

    for (const slot of videoSlots) {
      steps.push({
        id: `step_video_${slot.id}`,
        type: "generate",
        worker: "video",
        inputFrom: "normalizedInput",
        params: buildStepParamsForPlatform(
          slot.platform as Platform,
          "video",
          slot.id,
          slot.purpose,
        ),
      });
    }
  } else {
    const rawModality = ((req.constraints as any)?.outputModality as string) || "text";
    const outputModality: "text" | "image" | "audio" | "video" = [
      "text",
      "image",
      "audio",
      "video",
    ].includes(rawModality)
      ? (rawModality as "text" | "image" | "audio" | "video")
      : "text";

    if (outputModality === "image") {
      const imageSlots = req.platforms.map((p) => ({
        id: `${p}_image`,
        platform: p,
        modality: "image",
        purpose: "Platform image creative",
      }));
      steps.push({
        id: "step_image",
        type: "generate",
        worker: "image",
        inputFrom: "normalizedInput",
        params: {
          slots: imageSlots.map((slot) => ({
            ...slot,
            ...buildStepParamsForPlatform(
              slot.platform as Platform,
              "image",
              slot.id,
              slot.purpose,
            ),
          })),
        },
      });
    } else if (outputModality === "audio") {
      for (const platform of req.platforms) {
        steps.push({
          id: `step_audio_${platform}`,
          type: "generate",
          worker: "audio",
          inputFrom: "normalizedInput",
          params: buildStepParamsForPlatform(
            platform,
            "audio",
            `${platform}_audio`,
            "Audio voiceover",
          ),
        });
      }
    } else if (outputModality === "video") {
      // Always include a text step so the URL-extracted hook/body/cta is returned
      // in data.assets — the client uses it to seed the video generator topic.
      for (const platform of req.platforms) {
        steps.push({
          id: `step_text_${platform}`,
          type: "generate",
          worker: "text",
          inputFrom: "normalizedInput",
          params: buildStepParamsForPlatform(platform, "text"),
        });
      }
      for (const platform of req.platforms) {
        steps.push({
          id: `step_video_${platform}`,
          type: "generate",
          worker: "video",
          inputFrom: "normalizedInput",
          params: buildStepParamsForPlatform(
            platform,
            "video",
            `${platform}_video`,
            "Video content",
          ),
        });
      }
    } else {
      for (const platform of req.platforms) {
        steps.push({
          id: `step_text_${platform}`,
          type: "generate",
          worker: "text",
          inputFrom: "normalizedInput",
          params: buildStepParamsForPlatform(platform, "text"),
        });
      }
    }
  }

  if (steps.length === 0) {
    steps.push({
      id: "step_text_default",
      type: "generate",
      worker: "text",
      inputFrom: "normalizedInput",
      params: buildStepParamsForPlatform(
        req.platforms[0] ?? "instagram",
        "text",
      ),
    });
  }

  return { requestId: req.id, steps };
}

const textWorker = {
  async run(
    step: TaskStep,
    inputs: Record<string, unknown>,
    req: GenerationRequest,
  ): Promise<GeneratedAsset[]> {
    const packSpec = req.packId ? (PACK_DEFINITIONS[req.packId] ?? null) : null;
    const rawSlots: Record<string, unknown>[] =
      step.params!.slots ||
      (step.params!.platform
        ? [
            {
              id: `${step.params!.platform}_post`,
              platform: step.params!.platform,
              modality: "text",
              purpose: "Post copy",
            },
          ]
        : packSpec!.filter((s) => s.modality === "text") || [
            {
              id: "post",
              platform: req.platforms[0],
              modality: "text",
              purpose: "Post copy",
            },
          ]);

    rawSlots.map((slot) => ({
      ...slot,
      platformRules: getRules(slot.platform as Platform).text ?? null,
    }));

    // /generate/text returns raw model tokens or serialised internal objects.
    // Use /generate/content per slot instead — it always builds
    // caption = hook + "\n\n" + body + "\n\n" + cta server-side (never raw tokens).
    try {
      const normalized = inputs.normalized ?? {};
      const semantic: Record<string, string> = (normalized as any).semantic ?? {};

      // Fetch this user's stored artist profile / autopilot preferences from the DB.
      // These fields take priority over whatever MaxCore's /analyze guessed, giving
      // every generation call a grounding in the user's own identity and style.
      const userCtx = await fetchUserContext(req.userId ?? "");

      // For URL inputs, build a human-readable topic from extracted metadata so
      // MaxCore generates content about the actual page, not a bare URL string.
      let topic: string;
      if (req.input.modality === "url") {
        // First check: does this URL exactly match one of the user's current releases?
        // If so, the release title + type + date is the most authoritative topic.
        const matchedRelease = matchReleaseByUrl(
          req.input.payload ?? "",
          userCtx.currentReleases ?? null,
        );
        if (matchedRelease) {
          const relParts = [`${matchedRelease.title} (${matchedRelease.type})`];
          if (matchedRelease.releaseDate)
            relParts.push(`released ${matchedRelease.releaseDate}`);
          if (userCtx.artistName) relParts.push(`by ${userCtx.artistName}`);
          topic = relParts.join(" ");
          logger.debug(`[MultimodalGen] URL matched user release: "${topic}"`);
        } else {
          const meta = ((normalized as any).metadata ?? {}) as Record<string, string>;
          const urlTitle = (normalized as any).title ?? meta.title ?? "";
          const urlAuthor = (normalized as any).author ?? meta.author ?? "";
          const urlSite = (normalized as any).siteName ?? meta.siteName ?? "";
          const urlDesc = (normalized as any).description ?? meta.description ?? "";
          if (urlTitle) {
            const parts: string[] = [urlTitle];
            if (urlAuthor) parts.push(`by ${urlAuthor}`);
            if (urlSite) parts.push(`on ${urlSite}`);
            if (urlDesc) parts.push(`— ${urlDesc.slice(0, 200)}`);
            topic = parts.join(" ");
          } else {
            // No title from metadata — try to parse a readable slug from the URL path.
            // e.g. "pitchfork.com/reviews/albums/frank-ocean-blonde/" → "Frank Ocean Blonde"
            const slugTopic = (() => {
              try {
                const u = new URL(req.input.payload ?? "");
                const segments = u.pathname.split("/").filter(Boolean);
                // Skip common non-descriptive segments like 'reviews', 'albums', 'watch', 'track', 'e', 'p', 'reel', 'posts'
                const skip = new Set([
                  "reviews",
                  "albums",
                  "watch",
                  "track",
                  "tracks",
                  "e",
                  "p",
                  "reel",
                  "reels",
                  "posts",
                  "post",
                  "video",
                  "videos",
                  "playlist",
                  "article",
                  "articles",
                  "news",
                  "blog",
                  "read",
                ]);
                const slug =
                  segments
                    .filter((s) => !skip.has(s) && !/^\d{4,}$/.test(s))
                    .pop() ?? "";
                if (!slug) return "";
                // Convert kebab/snake to title case: "frank-ocean-blonde" → "Frank Ocean Blonde"
                const readable = slug
                  .replace(/[-_]/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                const site =
                  urlSite || u.hostname.replace(/^www\./, "").split(".")[0];
                return site
                  ? `${readable} on ${site.charAt(0).toUpperCase() + site.slice(1)}`
                  : readable;
              } catch {
                return "";
              }
            })();
            // Never use the raw URL string as the topic — MaxCore will quote it
            // verbatim in captions ("Content from URL: https://...").  Fall back
            // to a human-readable domain label instead.
            const rawUrlFallback = (() => {
              try {
                const u = new URL(req.input.payload ?? "");
                const segments = u.hostname
                  .replace(/^www\./, "")
                  .split(".");
                // e.g. "51b4500f-...kirk.replit.dev" → "Max Booster"
                //      "spotify.com"                  → "Spotify"
                //      "my-beats.netlify.app"          → "My Beats"
                const meaningfulPart = segments[0]
                  .replace(/^[a-z0-9]{6,}-[a-z0-9-]{8,}$/, "") // strip UUID/hash-like prefixes
                  .replace(/[-_]/g, " ")
                  .trim();
                if (!meaningfulPart) return "music platform promotion";
                return meaningfulPart
                  .replace(/\b\w/g, (c) => c.toUpperCase());
              } catch {
                return "music platform promotion";
              }
            })();
            topic =
              slugTopic ||
              (normalized as any).summary ||
              (normalized as any).payload_summary ||
              semantic.core_message ||
              rawUrlFallback;
          }
        }
        logger.debug(
          `[MultimodalGen] URL topic built: "${topic.slice(0, 120)}"`,
        );
      } else {
        topic =
          (normalized as any).payload_summary ??
          req.input.payload ??
          semantic.core_message ??
          "";
      }

      // Merge DB context into the MaxCore params.  DB values take priority because
      // the user explicitly set them; fall back to whatever /analyze returned.
      const resolvedArtistName =
        userCtx.artistName ??
        (normalized as any).artistName ??
        semantic.artist_name ??
        (normalized as any).author ??
        ((normalized as any).metadata as Record<string, unknown> | undefined)?.author ??
        undefined;
      const resolvedGenre =
        userCtx.genre ?? (normalized as any).genre ?? semantic.genre ?? undefined;
      const resolvedBrandVoice =
        userCtx.brandVoice ??
        (normalized as any).brandVoice ??
        semantic.brand_voice ??
        undefined;
      const resolvedTargetAudience =
        userCtx.targetAudience ??
        (normalized as any).targetAudience ??
        semantic.target_audience ??
        undefined;
      const resolvedTone = userCtx.contentTone ?? req.intent ?? "professional";
      // Merge preferred hashtags: DB list first, then any from normalized (deduplicated)
      const dbHashtags = userCtx.preferredHashtags ?? [];
      const normHashtags =
        ((normalized as any).preferredHashtags as string[] | undefined) ?? [];
      const resolvedHashtags = dbHashtags.length
        ? [...new Set([...dbHashtags, ...normHashtags])]
        : normHashtags.length
          ? normHashtags
          : undefined;

      // Build an artist_context string so MaxCore can use the bio + USPs for richer copy.
      const artistContextParts: string[] = [];
      if (userCtx.artistBio)
        artistContextParts.push(userCtx.artistBio.slice(0, 300));
      if (userCtx.uniqueSellingPoints?.length)
        artistContextParts.push(
          `Key strengths: ${userCtx.uniqueSellingPoints.slice(0, 5).join(", ")}`,
        );
      if (userCtx.subGenres?.length)
        artistContextParts.push(
          `Sub-genres: ${userCtx.subGenres.slice(0, 4).join(", ")}`,
        );
      const artistContext = artistContextParts.join(". ") || undefined;

      const perSlotResults = await Promise.allSettled(
        rawSlots.map(async (slot: Record<string, unknown>) => {
          const platform: string =
            (slot.platform as string) ?? req.platforms[0] ?? "instagram";
          const mc = await maxcorePost(
            "/generate/content",
            {
              platform,
              topic,
              tone: resolvedTone,
              genre: resolvedGenre,
              artist_name: resolvedArtistName,
              brand_voice: resolvedBrandVoice,
              target_audience: resolvedTargetAudience,
              preferred_hashtags: resolvedHashtags,
              ...(artistContext ? { artist_context: artistContext } : {}),
              ...(userCtx.callToActionStyle
                ? { cta_style: userCtx.callToActionStyle }
                : {}),
              ...(userCtx.avoidTopics?.length
                ? { avoid_topics: userCtx.avoidTopics }
                : {}),
            },
            20_000,
          ); // 20 s per slot — MaxCore's awareness layer takes ~8-13 s under load
          // (an 8 s budget flaked to local fallback); slots run in parallel and
          // the local fallback is instant, so this still fits the 30 s client window.

          // /generate/content always returns { caption, hook, body, cta, hashtags, confidence }
          const caption: string = (mc as any).caption ?? "";
          if (!caption) throw new Error("empty caption");

          const rules = getRules(platform as Platform);
          const payload = enforceTextLength(caption, rules.text);
          const enriched = enrichTextAssetMetadata(payload, platform, rules, {
            platformRules: rules.text,
            hook: (mc as any).hook ?? "",
            body: (mc as any).body ?? "",
            cta: (mc as any).cta ?? "",
          });

          return {
            id: randomUUID(),
            modality: "text" as OutputModality,
            payload,
            platform: platform as Platform,
            slotId: slot.id,
            purpose: slot.purpose ?? "Post copy",
            metadata: enriched,
          };
        }),
      );

      const successful = perSlotResults
        .filter(
          (r): r is PromiseFulfilledResult<GeneratedAsset> =>
            r.status === "fulfilled",
        )
        .map((r) => (r as any).value);

      if (successful.length > 0) return successful;

      // All per-slot MaxCore calls failed — fail explicitly (MaxCore-only
      // contract): never substitute locally-templated text assets.
      const firstFailure = perSlotResults.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      const reason =
        firstFailure?.reason instanceof Error
          ? firstFailure.reason.message
          : String(firstFailure?.reason ?? "unknown");
      logger.warn(
        { reason },
        "[MultimodalGen] All /generate/content slot calls failed — failing explicitly (no local fallback)",
      );
      if (firstFailure?.reason instanceof AIUnavailableError)
        throw firstFailure.reason;
      throw new AIUnavailableError("multimodal text generation");
    } catch (err) {
      if (err instanceof AIUnavailableError) throw err;
      logger.warn(
        { err },
        `[MultimodalGen] /generate/content text worker error: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new AIUnavailableError("multimodal text generation");
    }
  },
};

const PLATFORM_OPTIMAL_TIMES: Record<string, string> = {
  instagram: "6–9 PM local",
  facebook: "1–4 PM local",
  tiktok: "7–9 PM local",
  youtube: "2–4 PM EST",
  linkedin: "10 AM–12 PM local",
  threads: "9 AM or 8 PM local",
  google_business: "9–11 AM local",
};

function enrichTextAssetMetadata(
  payload: string,
  platform: string,
  rules: PlatformRules,
  existingMeta: Record<string, any> = {},
): Record<string, any> {
  const hashtagRegex = /#[\w\u0080-\uFFFF]+/g;
  const extractedHashtags: string[] = payload.match(hashtagRegex) ?? [];
  const cleanText = payload.replace(hashtagRegex, "").trim();

  const emojiRegex = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;
  const emojiCount = (payload.match(emojiRegex) ?? []).length;
  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
  const charCount = payload.length;
  const charLimit = (rules.text as any).maxCharCount ?? null;

  let hook: string | undefined = existingMeta.hook;
  let body: string | undefined = existingMeta.body;
  let cta: string | undefined = existingMeta.cta;

  if (!hook && !body && !cta && cleanText) {
    const paragraphs = cleanText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length >= 3) {
      hook = paragraphs[0];
      cta = paragraphs[paragraphs.length - 1];
      body = paragraphs.slice(1, -1).join("\n\n");
    } else if (paragraphs.length === 2) {
      hook = paragraphs[0];
      body = paragraphs[1];
    } else {
      const sentences = cleanText.split(/(?<=[.!?])\s+/);
      if (sentences.length >= 2) {
        hook = sentences[0];
        body = sentences.slice(1).join(" ");
      }
    }
    if (body) {
      const ctaKw =
        /\b(subscribe|follow|check out|stream now|listen now|tap|click|link in bio|watch|download|buy|shop|join|sign up|get it|available now|out now)\b/i;
      const lines = body.split("\n");
      const ctaIdx =
        lines
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => ctaKw.test(l))
          .pop()?.i ?? -1;
      if (ctaIdx > 0) {
        cta = lines.slice(ctaIdx).join("\n").trim();
        body = lines.slice(0, ctaIdx).join("\n").trim();
      }
    }
  }

  // Platform-calibrated engagement scoring
  let score = 50;
  const suggestions: string[] = [];

  switch (platform) {
    case "tiktok":
      // TikTok: hook-first wins, keep it SHORT, 1–2 emojis max, a few hashtags
      if (hook) score += 20;
      else
        suggestions.push(
          "Start with a viral hook in the first 5 words to stop the scroll",
        );
      if (wordCount <= 15) score += 15;
      else if (wordCount > 25)
        suggestions.push(
          "Keep TikTok captions under 15 words for best performance",
        );
      if (emojiCount >= 1 && emojiCount <= 3) score += 10;
      else if (emojiCount === 0) suggestions.push("Add 1–2 trending emojis");
      if (extractedHashtags.length >= 2 && extractedHashtags.length <= 5)
        score += 5;
      if (cta) score += 10;
      else suggestions.push('Add a "link in bio" or "follow for more" CTA');
      break;

    case "instagram":
      // Instagram: hashtags are essential (5–8 optimal), emoji adds flair, hook + CTA needed
      if (hook) score += 10;
      else suggestions.push("Open with an attention-grabbing first line");
      if (extractedHashtags.length >= 5) score += 20;
      else if (extractedHashtags.length >= 2) score += 10;
      else suggestions.push("Add 5–8 hashtags for maximum Instagram reach");
      if (emojiCount >= 2 && emojiCount <= 8) score += 10;
      else if (emojiCount === 0)
        suggestions.push("Add 2–4 emojis to boost visual appeal");
      if (cta) score += 10;
      else suggestions.push('Add "Link in bio" to drive traffic');
      if (wordCount >= 20 && wordCount <= 150) score += 10;
      break;

    case "facebook":
      // Facebook: conversational, moderate length, story-driven
      if (hook) score += 10;
      else
        suggestions.push(
          "Start with an engaging personal statement or question",
        );
      if (wordCount >= 20 && wordCount <= 80) score += 15;
      else if (wordCount < 10)
        suggestions.push(
          "Expand the post — Facebook users engage more with 40–80 word posts",
        );
      if (emojiCount >= 1 && emojiCount <= 5) score += 10;
      else if (emojiCount > 8)
        suggestions.push(
          "Too many emojis can reduce Facebook reach — keep it to 3–5",
        );
      if (cta) score += 15;
      else
        suggestions.push(
          "Add a call-to-action directing users to the link in comments",
        );
      if (extractedHashtags.length <= 3) score += 5;
      else if (extractedHashtags.length > 5)
        suggestions.push("Facebook posts perform best with 1–3 hashtags");
      break;

    case "twitter":
      // Twitter/X: punchy, witty, under 240 chars is ideal, 1–2 hashtags only
      if (charCount <= 240) score += 20;
      else if (charCount > 270)
        suggestions.push(
          "Keep tweets under 240 characters for best engagement",
        );
      if (hook) score += 20;
      else
        suggestions.push(
          "Lead with your most interesting point — no warmup needed on X",
        );
      if (extractedHashtags.length <= 2) score += 10;
      else
        suggestions.push(
          "1–2 hashtags max on X/Twitter — more reduces engagement",
        );
      if (cta) score += 10;
      break;

    case "linkedin":
      // LinkedIn: professional, insightful, longer is OK, minimal emoji, strong hook
      if (hook) score += 20;
      else
        suggestions.push(
          "Open with a bold professional insight or surprising statistic",
        );
      if (wordCount >= 50) score += 15;
      else
        suggestions.push(
          "LinkedIn posts with 150+ words see 3x more engagement",
        );
      if (emojiCount <= 2) score += 10;
      else
        suggestions.push(
          "Reduce emojis for a more professional and credible tone",
        );
      if (cta) score += 15;
      else suggestions.push("End with a question or CTA to drive comments");
      if (extractedHashtags.length >= 2 && extractedHashtags.length <= 5)
        score += 5;
      else if (extractedHashtags.length === 0)
        suggestions.push(
          "Add 3–5 professional hashtags to increase discoverability",
        );
      break;

    case "youtube":
      // YouTube: SEO-rich description, subscribe CTA is critical, keyword density matters
      if (/subscribe|🔔/i.test(payload)) score += 25;
      else
        suggestions.push(
          "Always include a subscribe + notification bell CTA for YouTube",
        );
      if (wordCount >= 30) score += 15;
      else
        suggestions.push(
          "YouTube descriptions should be 100–300 words for SEO",
        );
      if (hook) score += 15;
      else
        suggestions.push(
          "Put key info and keywords in the first 2 sentences of your description",
        );
      if (cta) score += 10;
      if (emojiCount >= 1 && emojiCount <= 6) score += 5;
      break;

    case "threads":
      // Threads: casual, authentic, conversational — NO hashtags, minimal emoji
      if (extractedHashtags.length === 0) score += 15;
      else
        suggestions.push(
          "Threads performs better without hashtags — remove them",
        );
      if (emojiCount <= 3) score += 10;
      else suggestions.push("Keep it casual — max 2–3 emojis on Threads");
      if (wordCount >= 10 && wordCount <= 60) score += 15;
      else if (wordCount > 100)
        suggestions.push(
          "Shorter, more conversational posts work best on Threads",
        );
      if (hook) score += 10;
      break;

    case "google_business":
      // Google Business: professional, local, clear action CTA
      if (cta) score += 25;
      else
        suggestions.push(
          "Google Business posts must include a clear action (Visit, Call, Book)",
        );
      if (wordCount >= 20 && wordCount <= 100) score += 15;
      if (hook) score += 10;
      if (extractedHashtags.length === 0) score += 10;
      else suggestions.push("Google Business posts do not use hashtags");
      break;

    default:
      if (emojiCount >= 1 && emojiCount <= 5) score += 10;
      if (extractedHashtags.length > 0 && extractedHashtags.length <= 10)
        score += 10;
      if (wordCount >= 15 && wordCount <= 60) score += 10;
      if (hook) score += 10;
      if (cta) score += 10;
      if (emojiCount === 0)
        suggestions.push("Add 1–3 emojis to increase engagement");
      if (extractedHashtags.length === 0)
        suggestions.push("Include relevant hashtags");
      if (!cta) suggestions.push("Add a clear call-to-action");
      if (wordCount < 10) suggestions.push("Expand content for better reach");
  }

  if (charLimit && charCount > charLimit * 0.9)
    suggestions.push("Near character limit — consider trimming");
  score = Math.min(100, score);

  const positive =
    /\b(amazing|excited|love|great|best|awesome|happy|proud|thrilled|celebrate|new|launch|drop|release)\b/i;
  const negative =
    /\b(struggle|hard|difficult|bad|fail|problem|issue|concern)\b/i;
  const sentimentLabel = positive.test(payload)
    ? "positive"
    : negative.test(payload)
      ? "negative"
      : "neutral";

  return {
    ...existingMeta,
    hook: hook ?? existingMeta.hook,
    body: body ?? existingMeta.body,
    cta: cta ?? existingMeta.cta,
    hashtags:
      existingMeta.hashtags ??
      (extractedHashtags.length > 0 ? extractedHashtags : undefined),
    charCount,
    charLimit,
    wordCount,
    emojiCount,
    engagementScore: score,
    sentimentLabel,
    suggestions,
    optimalPostTime:
      existingMeta.optimalPostTime ??
      PLATFORM_OPTIMAL_TIMES[platform] ??
      "6 PM local",
  };
}

const imageWorker = {
  async run(
    step: TaskStep,
    inputs: Record<string, unknown>,
    req: GenerationRequest,
  ): Promise<GeneratedAsset[]> {
    const slots = step.params!.slots || [];
    const slotsWithRules = slots.map((slot: Record<string, unknown>) => ({
      ...slot,
      platformRules: getRules(slot.platform as Platform).image ?? null,
    }));

    const mapOutputs = (outputs: unknown[]) =>
      (outputs as Record<string, unknown>[]).map((o) => ({
        id: randomUUID(),
        modality: "image" as OutputModality,
        payload: o.url || o.src || "",
        platform: o.platform as Platform | undefined,
        slotId: o.slotId,
        purpose: o.purpose,
        metadata: {
          ...(o.meta ?? {}),
          aspectRatio: o.aspectRatio ?? step.params!.recommendedAspectRatio,
          platformRules: o.platform
            ? getRules(o.platform as Platform).image
            : null,
        },
      }));

    try {
      const result = await maxcorePost("/generate/image", {
        step,
        inputs,
        slots: slotsWithRules,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
        platformRules: Object.fromEntries(
          req.platforms.map((p) => [p, getRules(p).image]),
        ),
      });
      const allOutputs = Array.isArray((result as any).outputs) ? (result as any).outputs : [];
      // MaxCore returns relative /uploads/images/... URLs — absolute-ize them
      // against the MaxCore origin and mirror locally so they serve same-origin.
      const outputs = (
        await Promise.all(
          allOutputs.map(async (o: Record<string, unknown>) => {
            const rawUrl = String(o.url || o.src || "");
            if (!rawUrl) return null;
            const servedUrl = await mirrorRemoteAssetLocally(rawUrl, "images");
            if (!servedUrl) return null;
            return { ...o, url: servedUrl, src: servedUrl };
          }),
        )
      ).filter(Boolean) as Record<string, unknown>[];
      if (outputs.length > 0) return mapOutputs(outputs);
    } catch (err) {
      logger.warn(
        { err },
        `[MultimodalGen] MaxCore /generate/image unavailable, using local fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // MaxCore is the sole AI source — no local image generation fallback.
    throw new AIUnavailableError("multimodal image generation");
  },
};

const audioWorker = {
  async run(
    step: TaskStep,
    inputs: Record<string, unknown>,
    req: GenerationRequest,
  ): Promise<GeneratedAsset[]> {
    const platform = step.params!.platform as Platform | undefined;
    const audioRules = platform ? getRules(platform).audio : null;

    // 1. Try MaxCore remote audio generation first
    try {
      const result = await maxcorePost("/generate/audio", {
        step,
        inputs,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
        platformRules: audioRules,
      });

      // Inline outputs (legacy shape) — use them directly.
      let outputs = Array.isArray((result as any).outputs) ? (result as any).outputs : [];

      // Async job shape — MaxCore returns { job_id, status: "processing" }.
      // Poll GET /api/audio-job/:id until done/error, bounded so the caller's
      // HTTP request cannot hang indefinitely.
      const jobId =
        outputs.length === 0 && typeof (result as any)?.job_id === "string"
          ? ((result as any).job_id as string)
          : null;
      if (jobId) {
        const AUDIO_POLL_ATTEMPTS = 20;
        const AUDIO_POLL_INTERVAL_MS = 3_000;
        logger.info(
          `[MultimodalGen] MaxCore audio job ${jobId} — polling /audio-job (max ${AUDIO_POLL_ATTEMPTS} × ${AUDIO_POLL_INTERVAL_MS / 1000}s)`,
        );
        for (let attempt = 0; attempt < AUDIO_POLL_ATTEMPTS; attempt++) {
          await new Promise((r) => setTimeout(r, AUDIO_POLL_INTERVAL_MS));
          let jobStatus: Record<string, unknown> | null = null;
          try {
            const pollRes = await fetch(`${MAXCORE_URL}/audio-job/${jobId}`, {
              headers: MAXCORE_KEY
                ? { Authorization: `Bearer ${MAXCORE_KEY}` }
                : undefined,
              signal: AbortSignal.timeout(15_000),
            });
            if (!pollRes.ok) continue;
            const ct = pollRes.headers.get("content-type") ?? "";
            if (!ct.includes("application/json")) continue;
            jobStatus = (await pollRes.json()) as Record<string, unknown>;
          } catch {
            continue; // transient poll failure — retry
          }
          const st = String(jobStatus?.status ?? "");
          if (st === "error" || st === "failed") {
            throw new Error(
              `MaxCore audio job ${jobId} failed: ${String(jobStatus?.error ?? "unknown")}`,
            );
          }
          if ((st === "done" || st === "completed") && jobStatus?.url) {
            outputs = [
              {
                url: String(jobStatus.url),
                platform,
                meta: { maxcoreJobId: jobId },
              },
            ];
            break;
          }
        }
        if (outputs.length === 0) {
          throw new Error(
            `MaxCore audio job ${jobId} did not finish within the poll budget`,
          );
        }
      }

      if (outputs.length > 0) {
        // Mirror remote (possibly relative) URLs locally so they serve same-origin.
        return await Promise.all(
          outputs.map(async (o: Record<string, unknown>) => ({
            id: randomUUID(),
            modality: "audio" as OutputModality,
            payload: await mirrorRemoteAssetLocally(
              String(o.url || ""),
              "audio",
            ),
            platform: (o.platform as Platform | undefined) ?? platform,
            slotId: o.slotId,
            metadata: {
              ...(o.meta ?? {}),
              maxDurationSec: audioRules!.maxDurationSec,
              platformRules: audioRules,
            },
          })),
        );
      }
    } catch (err) {
      logger.warn(
        { err },
        `[MultimodalGen] MaxCore /generate/audio unavailable — falling back to local audio generator: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2. Local FFmpeg audio generator fallback — produces a real .mp3 file
    try {
      const normalized = inputs.normalized ?? {};
      const genre = (normalized as any).genre ?? (req.constraints as any)?.genre ?? "default";
      const maxSec = audioRules!.maxDurationSec ?? 30;
      const ttsText = [
        (normalized as any).hook,
        (normalized as any).body,
        (normalized as any).cta,
        (normalized as any).summary,
      ]
        .filter(Boolean)
        .join(". ");

      const audioResult = await generateLocalAudio({
        genre,
        duration: Math.min(maxSec, 60),
        text: ttsText || req.intent || undefined,
        topic: req.intent,
        artistName: (normalized as any).artistName,
      });

      if (audioResult.success && audioResult.url) {
        logger.info(
          `[MultimodalGen] Local audio generated: ${audioResult.url}`,
        );
        return [
          {
            id: randomUUID(),
            modality: "audio" as OutputModality,
            payload: audioResult.url,
            platform,
            metadata: {
              source: "local_ffmpeg",
              durationSec: audioResult.durationSec,
              maxDurationSec: audioRules!.maxDurationSec,
              platformRules: audioRules,
            },
          },
        ];
      }

      logger.warn(
        { err: audioResult.error },
        "[MultimodalGen] Local audio generator returned no file",
      );
    } catch (localErr) {
      logger.warn(
        { err: localErr },
        `[MultimodalGen] Local audio generator threw: ${localErr instanceof Error ? localErr.message : String(localErr)}`,
      );
    }

    return [];
  },
};

const videoWorker = {
  async run(
    step: TaskStep,
    _inputs: Record<string, unknown>,
    req: GenerationRequest,
  ): Promise<GeneratedAsset[]> {
    // FFmpeg video generation takes 2–5 minutes and cannot be run inline inside
    // a synchronous HTTP request (the client timeout fires first, leaving the
    // caller with a network error rather than a usable result).
    //
    // The correct path for video generation is the dedicated async job endpoint:
    //   POST /api/social/generate-video  →  GET /api/social/video-job/:jobId
    //
    // Returning an empty array here is intentional — the client detects zero
    // video assets and renders the ServerVideoGenerator widget, which drives the
    // async job flow described above.
    logger.info(
      `[MultimodalGen] videoWorker: skipping inline FFmpeg for step ${step.id} ` +
        `(req ${req.id}) — client will use the async ServerVideoGenerator instead`,
    );
    // Return empty so the client's zero-asset guard fires and renders the
    // ServerVideoGenerator widget (which drives the async job endpoint instead).
    return [];
  },
};

const workers = {
  text: textWorker,
  image: imageWorker,
  audio: audioWorker,
  video: videoWorker,
};

export async function handleGeneration(
  req: GenerationRequest,
): Promise<MultimodalPackage> {
  logger.info(
    `[MultimodalGen] Starting generation: id=${req.id}, pack=${req.packId ?? "none"}, platforms=${req.platforms.join(",")}`,
  );

  const normalized = await normalizeInput(req) as Record<string, unknown>;
  const plan = await planTasks(normalized, req);

  const stepOutputs = new Map<string, GeneratedAsset[]>();

  // Separate steps that depend only on normalized input (can run in parallel)
  // from steps that depend on earlier step outputs (must run serially after dependencies)
  const independentSteps = plan.steps.filter(
    (s) => !s.inputFrom || s.inputFrom === "normalizedInput",
  );
  const dependentSteps = plan.steps.filter(
    (s) => s.inputFrom && s.inputFrom !== "normalizedInput",
  );

  // Run all independent steps concurrently.
  // Each step is wrapped in try/catch so a failing video/audio render
  // doesn't abort the entire pipeline — the client handles empty assets
  // by showing appropriate fallback UI (e?.g. ServerVideoGenerator).
  if (independentSteps?.length > 0) {
    const settled = await Promise.allSettled(
      independentSteps?.map(async (step) => {
        const worker = workers[step?.worker];
        if (!worker) {
          logger.warn(`[MultimodalGen] Unknown worker: ${step?.worker}`);
          stepOutputs?.set(step?.id, []);
          return;
        }
        try {
          const assets = await worker?.run(step, { normalized }, req);
          stepOutputs?.set(step?.id, assets);
          logger.info(
            `[MultimodalGen] Step ${step?.id} (${step?.worker}) → ${assets?.length} asset(s) [parallel]`,
          );
        } catch (err) {
          if (err instanceof AIUnavailableError) throw err;
          logger.warn(
            { err },
            `[MultimodalGen] Step ${step?.id} (${step?.worker}) failed — returning empty assets: ${err instanceof Error ? err?.message : String(err)}`,
          );
          stepOutputs?.set(step?.id, []);
        }
      }),
    );
    // MaxCore-only contract: an AIUnavailableError thrown inside a settled
    // promise must propagate, not be silently discarded.
    const aiFailure = settled.find(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" && r.reason instanceof AIUnavailableError,
    );
    if (aiFailure) throw aiFailure.reason;
  }

  // Run dependent steps serially, each resolving its upstream outputs
  for (const step of dependentSteps) {
    const worker = workers[step?.worker];
    if (!worker) {
      logger.warn(`[MultimodalGen] Unknown worker: ${step?.worker}`);
      continue;
    }
    const inputs = {
      normalized,
      stepAssets: (Array.isArray(step?.inputFrom)
        ? (step?.inputFrom ?? [])
        : [step?.inputFrom]
      ).flatMap((id: string) => stepOutputs?.get(id) ?? []),
    };
    try {
      const assets = await worker?.run(step, inputs, req);
      stepOutputs?.set(step?.id, assets);
      logger.info(
        `[MultimodalGen] Step ${step?.id} (${step?.worker}) → ${assets?.length} asset(s) [sequential]`,
      );
    } catch (err) {
      if (err instanceof AIUnavailableError) throw err;
      logger.warn(
        { err },
        `[MultimodalGen] Step ${step?.id} (${step?.worker}) failed — returning empty assets: ${err instanceof Error ? err?.message : String(err)}`,
      );
      stepOutputs?.set(step?.id, []);
    }
  }

  const allAssets = Array.from(stepOutputs?.values()).flat();

  logger.info(
    `[MultimodalGen] Done: id=${req.id}, total_assets=${allAssets?.length}`,
  );

  return {
    requestId: req.id,
    assets: allAssets,
    plan,
    generatedAt: new Date().toISOString(),
  };
}

export { PLATFORM_RULES };
