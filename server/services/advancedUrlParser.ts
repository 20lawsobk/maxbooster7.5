/**
 * Advanced URL Parser — Max Booster (custom, in-house).
 *
 * Pure-TypeScript, SSRF-safe parser that turns any link an artist or autopilot
 * supplies into a normalized {@link ParsedUrl}, plus a {@link UrlContentBrief}
 * that maps onto the exact AdvancedContentRequest fields MaxCore actually
 * consumes (topic / genre / artistName / contentType / promotionContext).
 *
 * It classifies 25+ music & social platforms, extracts canonical platform IDs
 * (Spotify, YouTube, Apple Music, SoundCloud …), parses artist/track/album +
 * release type, and derives keywords, hashtags and a content angle from the
 * page's OpenGraph / Twitter-card / JSON-LD / oEmbed / semantic metadata.
 *
 * All network access goes through safeUrlFetch (no raw fetch, no Python here),
 * so it is safe to call from the autopilot generation loops.
 */

import { logger } from "../logger";
import { safeFetchText, assertPublicHttpUrl } from "./safeUrlFetch";

export type UrlPlatform =
  | "spotify"
  | "apple_music"
  | "soundcloud"
  | "youtube"
  | "bandcamp"
  | "tidal"
  | "deezer"
  | "amazon_music"
  | "audiomack"
  | "pandora"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "facebook"
  | "threads"
  | "linkedin"
  | "twitch"
  | "patreon"
  | "eventbrite"
  | "bandsintown"
  | "songkick"
  | "dice"
  | "web";

export type UrlCategory =
  | "music_stream"
  | "music_video"
  | "music_download"
  | "podcast"
  | "social_post"
  | "profile"
  | "event"
  | "press"
  | "ecommerce"
  | "article"
  | "video"
  | "web";

export type ReleaseType =
  | "single"
  | "album"
  | "ep"
  | "playlist"
  | "track"
  | "video"
  | "podcast"
  | "none";

export interface ParsedUrlIds {
  spotify?: string;
  spotifyType?: string;
  youtube?: string;
  appleMusic?: string;
  soundcloud?: string;
}

export interface ParsedUrl {
  url: string;
  finalUrl: string;
  host: string;
  platform: UrlPlatform;
  category: UrlCategory;
  ids: ParsedUrlIds;
  title: string | null;
  artist: string | null;
  track: string | null;
  album: string | null;
  genre: string | null;
  releaseType: ReleaseType;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  language: string | null;
  keywords: string[];
  hashtags: string[];
  suggestedTopic: string;
  suggestedAngle: string;
  summary: string;
  isMusic: boolean;
  fetched: boolean;
}

export interface UrlContentBrief {
  topic: string;
  genre?: string;
  artistName?: string;
  contentType?:
    | "announcement"
    | "behind_scenes"
    | "engagement"
    | "promotional"
    | "storytelling";
  promotionContext: string;
  sourceUrl: string;
  platform: UrlPlatform;
  category: UrlCategory;
  hashtags: string[];
  imageUrl?: string;
}

export interface ParseUrlOptions {
  /** Skip the network fetch and classify from the URL structure alone. */
  skipFetch?: boolean;
  timeoutMs?: number;
}

const MUSIC_PLATFORMS = new Set<UrlPlatform>([
  "spotify",
  "apple_music",
  "soundcloud",
  "bandcamp",
  "tidal",
  "deezer",
  "amazon_music",
  "audiomack",
  "pandora",
]);

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","by","at",
  "from","is","are","was","were","be","this","that","my","your","his","her",
  "out","now","new","official","video","audio","lyric","lyrics","feat","ft",
  "song","music","listen","stream","watch","free","com","www","http","https",
]);

const KNOWN_GENRES = [
  "hip hop","hip-hop","rap","trap","drill","r&b","rnb","soul","pop","rock",
  "indie","metal","punk","jazz","blues","country","folk","reggae","reggaeton",
  "afrobeats","amapiano","house","techno","edm","dubstep","drum and bass",
  "dnb","lo-fi","lofi","ambient","classical","gospel","funk","disco","grime",
  "k-pop","kpop","latin","electronic","alternative","emo","hyperpop",
];

interface PageMeta {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  language: string | null;
  ogType: string | null;
  keywords: string[];
  jsonLd: Record<string, unknown>[];
  h1: string | null;
  firstParagraph: string | null;
}

interface CacheEntry {
  data: ParsedUrl;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;

function cacheGet(key: string): ParsedUrl | null {
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  if (hit) _cache.delete(key);
  return null;
}

function cacheSet(key: string, data: ParsedUrl): void {
  if (_cache.size >= CACHE_MAX) {
    const oldest = _cache.keys().next().value;
    if (oldest !== undefined) _cache.delete(oldest);
  }
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, d) => {
      const n = Number(d);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : _m;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => {
      const n = parseInt(h, 16);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : _m;
    })
    .trim();
}

function clean(s: string | null | undefined): string | null {
  if (!s) return null;
  const out = decodeEntities(String(s)).replace(/\s+/g, " ").trim();
  return out.length ? out : null;
}

/** Find the first known type token in a path (handles locale prefixes). */
function findSegmentType(
  segments: string[],
  types: string[],
): { type: string; id: string } | null {
  for (let i = 0; i < segments.length - 1; i++) {
    if (types.includes(segments[i].toLowerCase())) {
      return { type: segments[i].toLowerCase(), id: segments[i + 1] };
    }
  }
  return null;
}

function classify(u: URL): {
  platform: UrlPlatform;
  category: UrlCategory;
  ids: ParsedUrlIds;
} {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const segments = u.pathname.split("/").filter(Boolean);
  const ids: ParsedUrlIds = {};

  const h = (s: string) => host === s || host.endsWith(`.${s}`);

  if (h("spotify.com")) {
    const m = findSegmentType(segments, [
      "track",
      "album",
      "artist",
      "playlist",
      "episode",
      "show",
    ]);
    if (m) {
      ids.spotify = m.id?.split("?")[0];
      ids.spotifyType = m.type;
      const category: UrlCategory =
        m.type === "episode" || m.type === "show"
          ? "podcast"
          : m.type === "artist"
            ? "profile"
            : "music_stream";
      return { platform: "spotify", category, ids };
    }
    return { platform: "spotify", category: "music_stream", ids };
  }

  if (h("music.apple.com") || h("itunes.apple.com")) {
    const m = findSegmentType(segments, [
      "album",
      "artist",
      "playlist",
      "song",
    ]);
    if (m) {
      ids.appleMusic = u.searchParams.get("i") ?? m.id;
      const category: UrlCategory =
        m.type === "artist" ? "profile" : "music_stream";
      return { platform: "apple_music", category, ids };
    }
    return { platform: "apple_music", category: "music_stream", ids };
  }

  if (h("soundcloud.com")) {
    if (!segments.length) return { platform: "soundcloud", category: "profile", ids };
    if (segments[1] === "sets")
      return { platform: "soundcloud", category: "music_stream", ids };
    if (segments.length >= 2) {
      ids.soundcloud = segments.slice(0, 2).join("/");
      return { platform: "soundcloud", category: "music_stream", ids };
    }
    return { platform: "soundcloud", category: "profile", ids };
  }

  if (host.endsWith("bandcamp.com")) {
    const t = segments[0]?.toLowerCase();
    if (t === "track" || t === "album")
      return { platform: "bandcamp", category: "music_download", ids };
    return { platform: "bandcamp", category: "profile", ids };
  }

  if (h("youtube.com") || h("youtu.be")) {
    if (h("youtu.be")) {
      ids.youtube = segments[0];
      return { platform: "youtube", category: "music_video", ids };
    }
    if (segments[0] === "watch") {
      ids.youtube = u.searchParams.get("v") ?? undefined;
      return { platform: "youtube", category: "music_video", ids };
    }
    if (segments[0] === "shorts") {
      ids.youtube = segments[1];
      return { platform: "youtube", category: "video", ids };
    }
    if (
      segments[0]?.startsWith("@") ||
      ["channel", "c", "user"].includes(segments[0] ?? "")
    ) {
      return { platform: "youtube", category: "profile", ids };
    }
    return { platform: "youtube", category: "video", ids };
  }

  if (h("tidal.com")) return { platform: "tidal", category: "music_stream", ids };
  if (h("deezer.com")) return { platform: "deezer", category: "music_stream", ids };
  if (h("music.amazon.com") || h("amazon.com"))
    return { platform: "amazon_music", category: "music_stream", ids };
  if (h("audiomack.com"))
    return { platform: "audiomack", category: "music_stream", ids };
  if (h("pandora.com"))
    return { platform: "pandora", category: "music_stream", ids };

  if (h("instagram.com")) {
    if (["p", "reel", "reels", "tv"].includes(segments[0] ?? ""))
      return { platform: "instagram", category: "social_post", ids };
    return { platform: "instagram", category: "profile", ids };
  }
  if (h("tiktok.com")) {
    if (u.pathname.includes("/video/"))
      return { platform: "tiktok", category: "social_post", ids };
    return { platform: "tiktok", category: "profile", ids };
  }
  if (h("twitter.com") || h("x.com")) {
    if (u.pathname.includes("/status/"))
      return { platform: "twitter", category: "social_post", ids };
    return { platform: "twitter", category: "profile", ids };
  }
  if (h("facebook.com") || h("fb.watch"))
    return { platform: "facebook", category: "social_post", ids };
  if (h("threads.net"))
    return { platform: "threads", category: "social_post", ids };
  if (h("linkedin.com"))
    return { platform: "linkedin", category: "social_post", ids };
  if (h("twitch.tv")) return { platform: "twitch", category: "video", ids };
  if (h("patreon.com"))
    return { platform: "patreon", category: "ecommerce", ids };

  if (h("eventbrite.com") || h("eventbrite.co.uk"))
    return { platform: "eventbrite", category: "event", ids };
  if (h("bandsintown.com"))
    return { platform: "bandsintown", category: "event", ids };
  if (h("songkick.com"))
    return { platform: "songkick", category: "event", ids };
  if (h("dice.fm")) return { platform: "dice", category: "event", ids };

  return { platform: "web", category: "web", ids };
}

function getMeta(html: string, ...props: string[]): string | undefined {
  for (const prop of props) {
    const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m =
      html.match(
        new RegExp(
          `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']{1,800})["']`,
          "i",
        ),
      ) ??
      html.match(
        new RegExp(
          `<meta[^>]+content=["']([^"']{1,800})["'][^>]+(?:property|name)=["']${escaped}["']`,
          "i",
        ),
      );
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return undefined;
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(html)) !== null && guard++ < 12) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as Record<string, unknown>)["@graph"])
          ? ((parsed as Record<string, unknown>)["@graph"] as unknown[])
          : [parsed];
      for (const it of items) {
        if (it && typeof it === "object")
          out.push(it as Record<string, unknown>);
      }
    } catch {
      /* skip malformed JSON-LD */
    }
  }
  return out;
}

function parseMeta(html: string): PageMeta {
  const titleTag = html.match(/<title[^>]*>([^<]{1,400})<\/title>/i)?.[1];
  const langAttr = html.match(/<html[^>]+lang=["']([a-zA-Z-]{2,8})["']/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i)?.[1];
  const firstP = html.match(/<p[^>]*>([\s\S]{20,600}?)<\/p>/i)?.[1];
  const kw = getMeta(html, "keywords");

  return {
    title:
      clean(getMeta(html, "og:title", "twitter:title")) ?? clean(titleTag),
    description: clean(
      getMeta(html, "og:description", "twitter:description", "description"),
    ),
    image: clean(getMeta(html, "og:image", "twitter:image", "og:image:url")),
    siteName: clean(getMeta(html, "og:site_name", "application-name")),
    language: clean(langAttr),
    ogType: clean(getMeta(html, "og:type")),
    keywords: kw
      ? kw
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 15)
      : [],
    jsonLd: extractJsonLd(html),
    h1: clean(h1 ? h1.replace(/<[^>]+>/g, "") : null),
    firstParagraph: clean(firstP ? firstP.replace(/<[^>]+>/g, "") : null),
  };
}

function jsonLdString(
  obj: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v === "string") return clean(v);
  if (v && typeof v === "object") {
    const name = (v as Record<string, unknown>).name;
    if (typeof name === "string") return clean(name);
  }
  if (Array.isArray(v) && v.length) {
    const first = v[0];
    if (typeof first === "string") return clean(first);
    if (first && typeof first === "object") {
      const name = (first as Record<string, unknown>).name;
      if (typeof name === "string") return clean(name);
    }
  }
  return null;
}

/** Split a page title into {artist, track} using common platform patterns. */
function parseArtistTrack(
  rawTitle: string | null,
  platform: UrlPlatform,
): { artist: string | null; track: string | null } {
  if (!rawTitle) return { artist: null, track: null };
  let t = rawTitle;

  // Strip common site suffixes.
  t = t
    .replace(/\s*[|\-–—]\s*Spotify.*$/i, "")
    .replace(/\s*[|\-–—]\s*YouTube.*$/i, "")
    .replace(/\s*[|\-–—]\s*SoundCloud.*$/i, "")
    .replace(/\s*\|\s*Free Listening.*$/i, "")
    .replace(/\s*-\s*song and lyrics.*$/i, "")
    .replace(/\s*\((Official|Lyric|Audio|Music)[^)]*\)\s*$/i, "")
    .replace(/\s*\[(Official|Lyric|Audio|Music)[^\]]*\]\s*$/i, "")
    .trim();

  // "Track by Artist" (SoundCloud, Bandcamp, Spotify lyric pages).
  const byMatch = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch && platform !== "youtube") {
    return { track: clean(byMatch[1]), artist: clean(byMatch[2]) };
  }

  // "Artist - Track" (YouTube and generic).
  const dashMatch = t.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (dashMatch) {
    return { artist: clean(dashMatch[1]), track: clean(dashMatch[2]) };
  }

  return { artist: null, track: clean(t) };
}

function deriveReleaseType(
  category: UrlCategory,
  ids: ParsedUrlIds,
  pathname: string,
  title: string | null,
): ReleaseType {
  if (title && /\bEP\b/.test(title)) return "ep";
  if (ids.spotifyType) {
    if (ids.spotifyType === "track") return "single";
    if (ids.spotifyType === "album") return "album";
    if (ids.spotifyType === "playlist") return "playlist";
    if (ids.spotifyType === "episode" || ids.spotifyType === "show")
      return "podcast";
  }
  if (/\/album\//i.test(pathname)) return "album";
  if (/\/(track|song)\//i.test(pathname)) return "single";
  if (/\/(sets|playlist)\b/i.test(pathname)) return "playlist";
  if (category === "music_video" || category === "video") return "video";
  if (category === "podcast") return "podcast";
  if (category === "music_stream") return "track";
  return "none";
}

function detectGenre(haystack: string[]): string | undefined {
  const blob = haystack.join(" ").toLowerCase();
  for (const g of KNOWN_GENRES) {
    if (blob.includes(g)) return g.replace(/-/g, " ");
  }
  return undefined;
}

function toHashtag(text: string): string | null {
  const parts = text
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return null;
  const tag = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  if (tag.length < 2 || tag.length > 30) return null;
  return `#${tag}`;
}

function buildKeywords(meta: PageMeta, title: string | null): string[] {
  const set = new Set<string>();
  for (const k of meta.keywords) if (k.length > 2) set.add(k.toLowerCase());
  if (title) {
    for (const tok of title.toLowerCase().split(/[^a-z0-9]+/)) {
      if (tok.length > 2 && !STOPWORDS.has(tok)) set.add(tok);
    }
  }
  return Array.from(set).slice(0, 12);
}

function buildHashtags(
  artist: string | null,
  track: string | null,
  category: UrlCategory,
  keywords: string[],
): string[] {
  const tags = new Set<string>();
  if (artist) {
    const t = toHashtag(artist);
    if (t) tags.add(t);
  }
  if (track) {
    const t = toHashtag(track);
    if (t) tags.add(t);
  }
  if (category === "music_stream" || category === "music_download") {
    tags.add("#NewMusic");
    tags.add("#NewRelease");
  } else if (category === "music_video" || category === "video") {
    tags.add("#MusicVideo");
  } else if (category === "event") {
    tags.add("#LiveShow");
    tags.add("#OnTour");
  } else if (category === "podcast") {
    tags.add("#Podcast");
  }
  for (const k of keywords) {
    if (tags.size >= 8) break;
    const t = toHashtag(k);
    if (t) tags.add(t);
  }
  return Array.from(tags).slice(0, 8);
}

const ANGLE_BY_CATEGORY: Record<UrlCategory, string> = {
  music_stream: "Announce the release and drive streams/saves",
  music_download: "Announce the release and drive purchases/downloads",
  music_video: "Tease the visual and drive views",
  podcast: "Promote the episode and drive listens",
  social_post: "Amplify the post and drive engagement",
  profile: "Introduce the artist and grow followers",
  event: "Promote the event and sell tickets",
  press: "Share the feature and build credibility",
  ecommerce: "Drive purchases and support",
  article: "Share the story and spark conversation",
  video: "Tease the video and drive views",
  web: "Drive clicks to the link",
};

const CONTENT_TYPE_BY_CATEGORY: Record<
  UrlCategory,
  NonNullable<UrlContentBrief["contentType"]> | undefined
> = {
  music_stream: "announcement",
  music_download: "announcement",
  music_video: "behind_scenes",
  podcast: "storytelling",
  social_post: "engagement",
  profile: "engagement",
  event: "promotional",
  press: "storytelling",
  ecommerce: "promotional",
  article: "storytelling",
  video: "behind_scenes",
  web: undefined,
};

function refineCategory(base: UrlCategory, meta: PageMeta): UrlCategory {
  if (base !== "web") return base;
  const types = meta.jsonLd
    .map((j) => String((j as Record<string, unknown>)["@type"] ?? ""))
    .join(" ")
    .toLowerCase();
  if (
    meta.ogType === "article" ||
    /article|newsarticle|blogposting/.test(types)
  ) {
    return "article";
  }
  if (meta.ogType === "product" || /product|offer/.test(types))
    return "ecommerce";
  if (/musicevent|event/.test(types)) return "event";
  if (meta.ogType?.startsWith("video")) return "video";
  return "web";
}

/**
 * Parse a URL into a normalized {@link ParsedUrl}. Network metadata fetch is
 * best-effort: classification from URL structure always succeeds, and a failed
 * or skipped fetch simply yields a lower-confidence result (fetched=false).
 */
export async function parseUrl(
  rawUrl: string,
  opts: ParseUrlOptions = {},
): Promise<ParsedUrl> {
  const u = assertPublicHttpUrl(rawUrl);
  const cacheKey = `${u.href}|${opts.skipFetch ? "nofetch" : "fetch"}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const { platform, category: baseCategory, ids } = classify(u);

  let meta: PageMeta = {
    title: null,
    description: null,
    image: null,
    siteName: null,
    language: null,
    ogType: null,
    keywords: [],
    jsonLd: [],
    h1: null,
    firstParagraph: null,
  };
  let fetched = false;

  if (!opts.skipFetch) {
    try {
      const res = await safeFetchText(u.href, {
        timeoutMs: opts.timeoutMs ?? 12_000,
      });
      if (res.status < 400 && /html|xml|text/i.test(res.contentType)) {
        meta = parseMeta(res.body);
        fetched = true;
      }
    } catch (err) {
      logger.warn(
        `[AdvancedUrlParser] metadata fetch failed for host=${host}: ${
          (err as Error)?.message ?? String(err)
        }`,
      );
    }

    // Spotify's SSR HTML returns a generic "Spotify – Web Player" title — not
    // the actual track/album/artist name.  Detect any generic Spotify title and
    // replace it with the real title from the public oEmbed endpoint (no auth).
    const isGenericSpotifyTitle =
      !meta.title ||
      /^spotify\b/i.test(meta.title.trim()) ||
      meta.title.trim() === "Spotify";
    if (platform === "spotify" && ids.spotify && isGenericSpotifyTitle) {
      try {
        // Use native fetch (not the SSRF-guarded axios agent) for the hardcoded
        // Spotify oEmbed endpoint — this is a known public API, not a user URL.
        // The custom axios agent's DNS lookup is incompatible with Spotify's TLS
        // stack in this environment, causing ERR_INVALID_IP_ADDRESS failures.
        const oeFetch = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(u.href)}`,
          {
            headers: { "User-Agent": "MaxBooster/3.0", Accept: "application/json" },
            signal: AbortSignal.timeout(8_000),
          },
        );
        if (oeFetch.ok) {
          const oeJson = (await oeFetch.json()) as {
            title?: string;
            thumbnail_url?: string;
            author_name?: string;
          };
          if (oeJson.title) {
            meta.title = oeJson.title;
            if (oeJson.author_name) meta.h1 = oeJson.author_name;
            meta.siteName = "Spotify";
            fetched = true;
          }
          if (oeJson.thumbnail_url && !meta.image) {
            meta.image = oeJson.thumbnail_url;
          }
        }
      } catch (err) {
        logger.warn(
          { err },
          `[AdvancedUrlParser] Spotify oEmbed failed for id=${ids.spotify}`,
        );
      }
    }
  }

  const category = refineCategory(baseCategory, meta);

  const ld = meta.jsonLd.find((j) => {
    const t = String((j as Record<string, unknown>)["@type"] ?? "").toLowerCase();
    return /music|song|album|video|article|event|product/.test(t);
  });

  const title =
    meta.title ?? jsonLdString(ld, "name") ?? jsonLdString(ld, "headline");

  const at = parseArtistTrack(title, platform);
  const artist =
    jsonLdString(ld, "byArtist") ??
    jsonLdString(ld, "author") ??
    at.artist;
  const isMusic =
    MUSIC_PLATFORMS.has(platform) ||
    ["music_stream", "music_video", "music_download", "podcast"].includes(
      category,
    );
  const track = isMusic ? at.track : null;
  const album =
    jsonLdString(ld, "inAlbum") ?? (ids.spotifyType === "album" ? title : null);

  const description = meta.description ?? meta.firstParagraph;
  const keywords = buildKeywords(meta, title);
  const genre = detectGenre([
    title ?? "",
    description ?? "",
    ...keywords,
    ...meta.keywords,
  ]);
  const hashtags = buildHashtags(artist, track, category, keywords);
  const releaseType = deriveReleaseType(category, ids, u.pathname, title);

  const suggestedTopic =
    isMusic && track && artist
      ? `${track} by ${artist}`
      : (title ?? meta.siteName ?? host);
  const suggestedAngle = ANGLE_BY_CATEGORY[category];
  const summary =
    description ?? (title ? `${title} (${platform})` : `${platform} ${category}`);

  const parsed: ParsedUrl = {
    url: rawUrl,
    finalUrl: u.href,
    host,
    platform,
    category,
    ids,
    title,
    artist,
    track,
    album,
    genre: genre ?? null,
    releaseType,
    description,
    imageUrl: meta.image,
    siteName: meta.siteName,
    language: meta.language,
    keywords,
    hashtags,
    suggestedTopic,
    suggestedAngle,
    summary,
    isMusic,
    fetched,
  };

  cacheSet(cacheKey, parsed);
  return parsed;
}

/**
 * Map a {@link ParsedUrl} onto the AdvancedContentRequest fields that MaxCore
 * actually consumes, so the link demonstrably reshapes generated output.
 */
export function toContentBrief(parsed: ParsedUrl): UrlContentBrief {
  const label = parsed.category.replace(/_/g, " ");
  const subject = parsed.title ?? parsed.suggestedTopic;
  const byline = parsed.artist ? ` by ${parsed.artist}` : "";
  const desc = parsed.description ? ` ${parsed.description.slice(0, 220)}` : "";

  const promotionContext = (
    `Create a post promoting this ${label} on ${parsed.platform}: ` +
    `"${subject}"${byline}.${desc} Goal: ${parsed.suggestedAngle}. ` +
    `Source: ${parsed.finalUrl}`
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);

  return {
    topic: parsed.suggestedTopic,
    genre: parsed.genre ?? undefined,
    artistName: parsed.artist ?? undefined,
    contentType: CONTENT_TYPE_BY_CATEGORY[parsed.category],
    promotionContext,
    sourceUrl: parsed.finalUrl,
    platform: parsed.platform,
    category: parsed.category,
    hashtags: parsed.hashtags,
    imageUrl: parsed.imageUrl ?? undefined,
  };
}

/** Convenience: parse a URL and return its content brief in one call. */
export async function urlToContentBrief(
  rawUrl: string,
  opts?: ParseUrlOptions,
): Promise<UrlContentBrief> {
  return toContentBrief(await parseUrl(rawUrl, opts));
}

export const advancedUrlParser = {
  parseUrl,
  toContentBrief,
  urlToContentBrief,
};
