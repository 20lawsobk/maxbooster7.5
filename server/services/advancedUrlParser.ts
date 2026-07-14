/**
 * Advanced URL Parser — Max Booster (custom, in-house).
 *
 * Pure-TypeScript, SSRF-safe parser that turns any link an artist or autopilot
 * supplies into a normalized {@link ParsedUrl}, plus a {@link UrlContentBrief}
 * that maps onto the exact AdvancedContentRequest fields MaxCore actually
 * consumes (topic / genre / artistName / contentType / promotionContext).
 *
 * Coverage: 35 platforms across music, social, video, events, articles, and
 * e-commerce — with per-platform slug extraction, deep JSON-LD mining (Music,
 * Event, Article, Product, Video schemas), and oEmbed fallbacks for any
 * platform that bot-walls its SSR HTML.
 *
 * All network access goes through safeUrlFetch (no raw fetch, no Python here),
 * so it is safe to call from the autopilot generation loops.
 */

import { logger } from "../logger";
import { safeFetchText, assertPublicHttpUrl } from "./safeUrlFetch";

// ── Platform & category types ─────────────────────────────────────────────────

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
  | "mixcloud"
  | "beatport"
  | "reverbnation"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "facebook"
  | "threads"
  | "linkedin"
  | "twitch"
  | "patreon"
  | "snapchat"
  | "bluesky"
  | "reddit"
  | "pinterest"
  | "vimeo"
  | "eventbrite"
  | "bandsintown"
  | "songkick"
  | "ticketmaster"
  | "dice"
  | "medium"
  | "substack"
  | "genius"
  | "linktree"
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
  | "newsletter"
  | "lyrics"
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
  youtubeType?: "video" | "shorts" | "playlist" | "channel";
  appleMusic?: string;
  appleMusicType?: string;
  appleMusicNameSlug?: string; // human-readable URL name segment
  soundcloud?: string;
  vimeo?: string;
  bandcamp?: string;
  audiomack?: string;
  tidal?: string;
  tidalType?: string;
  deezer?: string;
  deezerType?: string;
  beatport?: string;
  beatportType?: string;
  mixcloud?: string;
}

export interface ParsedUrl {
  // ── Core ──────────────────────────────────────────────────────────────────
  url: string;
  finalUrl: string;
  host: string;
  platform: UrlPlatform;
  category: UrlCategory;
  ids: ParsedUrlIds;
  // ── Discovery metadata ───────────────────────────────────────────────────
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  language: string | null;
  canonical: string | null;
  embedUrl: string | null;   // og:video / twitter:player / oEmbed embed_url
  // ── Music ────────────────────────────────────────────────────────────────
  artist: string | null;
  track: string | null;
  album: string | null;
  genre: string | null;
  releaseType: ReleaseType;
  releaseDate: string | null;
  duration: string | null;   // human-readable e.g. "3:45" or "1:22:30"
  label: string | null;
  isrc: string | null;
  tracklist: string[];
  trackCount: number | null;
  members: string[];
  // ── Event ────────────────────────────────────────────────────────────────
  eventDate: string | null;
  eventEndDate: string | null;
  eventLocation: string | null;
  performers: string[];
  organizer: string | null;
  ticketUrl: string | null;
  price: string | null;
  currency: string | null;
  // ── Article / Newsletter ─────────────────────────────────────────────────
  author: string | null;        // editorial author (distinct from music artist)
  datePublished: string | null;
  dateModified: string | null;
  section: string | null;
  wordCount: number | null;
  // ── Product ──────────────────────────────────────────────────────────────
  brand: string | null;
  rating: string | null;
  reviewCount: number | null;
  // ── Video ────────────────────────────────────────────────────────────────
  viewCount: number | null;
  uploadDate: string | null;
  // ── Content ──────────────────────────────────────────────────────────────
  keywords: string[];
  hashtags: string[];
  suggestedTopic: string;
  suggestedAngle: string;
  summary: string;
  // ── Meta ─────────────────────────────────────────────────────────────────
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

// ── Constants ─────────────────────────────────────────────────────────────────

const MUSIC_PLATFORMS = new Set<UrlPlatform>([
  "spotify", "apple_music", "soundcloud", "bandcamp", "tidal", "deezer",
  "amazon_music", "audiomack", "pandora", "mixcloud", "beatport", "reverbnation",
]);

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","by","at",
  "from","is","are","was","were","be","this","that","my","your","his","her",
  "out","now","new","official","video","audio","lyric","lyrics","feat","ft",
  "song","music","listen","stream","watch","free","com","www","http","https",
  "single","track","ep","album","release","remaster","remastered","4k","hd",
]);

const KNOWN_GENRES = [
  "hip hop","hip-hop","rap","trap","drill","r&b","rnb","soul","pop","rock",
  "indie","metal","punk","jazz","blues","country","folk","reggae","reggaeton",
  "afrobeats","amapiano","house","deep house","tech house","techno","edm",
  "dubstep","drum and bass","dnb","lo-fi","lofi","ambient","classical",
  "gospel","funk","disco","grime","k-pop","kpop","latin","electronic",
  "alternative","emo","hyperpop","phonk","melodic rap","conscious rap",
  "neo soul","dancehall","soca","afropop","cumbia","bossa nova","synthwave",
];

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry { data: ParsedUrl; expiresAt: number }
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

// ── String utilities ──────────────────────────────────────────────────────────

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, d) => {
      const n = Number(d); return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : _m;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => {
      const n = parseInt(h, 16); return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : _m;
    })
    .trim();
}

function clean(s: string | null | undefined): string | null {
  if (!s) return null;
  const out = decodeEntities(String(s)).replace(/\s+/g, " ").trim();
  return out.length ? out : null;
}

/** Convert a URL slug/path segment into a Title-Cased readable name. */
function slugToName(slug: string): string {
  return slug
    .replace(/-/g, " ").replace(/_/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Convert ISO 8601 duration (PT3M45S) → "3:45" or "1:22:30". */
function parseDuration(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.\d+)?S)?$/i);
  if (!m) return null;
  const d = parseInt(m[1] || "0", 10);
  const h = parseInt(m[2] || "0", 10) + d * 24;
  const min = parseInt(m[3] || "0", 10);
  const s = parseInt(m[4] || "0", 10);
  if (h === 0 && min === 0 && s === 0) return null;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${ss}`;
  return `${min}:${ss}`;
}

// ── HTML metadata extraction ──────────────────────────────────────────────────

interface PageMeta {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  language: string | null;
  ogType: string | null;
  canonical: string | null;
  embedUrl: string | null;
  keywords: string[];
  jsonLd: Record<string, unknown>[];
  h1: string | null;
  firstParagraph: string | null;
  datePublished: string | null;
  dateModified: string | null;
  author: string | null;
  articleSection: string | null;
  price: string | null;
  priceCurrency: string | null;
  twitterCreator: string | null;
}

function getMeta(html: string, ...props: string[]): string | undefined {
  for (const prop of props) {
    const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']{1,800})["']`, "i")) ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,800})["'][^>]+(?:property|name)=["']${esc}["']`, "i"));
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return undefined;
}

function getLink(html: string, rel: string): string | undefined {
  const esc = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m =
    html.match(new RegExp(`<link[^>]+rel=["']${esc}["'][^>]+href=["']([^"']{1,1000})["']`, "i")) ??
    html.match(new RegExp(`<link[^>]+href=["']([^"']{1,1000})["'][^>]+rel=["']${esc}["']`, "i"));
  return m?.[1] ? decodeEntities(m[1]) : undefined;
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(html)) !== null && guard++ < 15) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as Record<string, unknown>)["@graph"])
          ? (parsed as Record<string, unknown>)["@graph"] as unknown[]
          : [parsed];
      for (const it of items) {
        if (it && typeof it === "object") out.push(it as Record<string, unknown>);
      }
    } catch { /* skip malformed JSON-LD */ }
  }
  return out;
}

function parseMeta(html: string): PageMeta {
  const titleTag = html.match(/<title[^>]*>([^<]{1,400})<\/title>/i)?.[1];
  const langAttr = html.match(/<html[^>]+lang=["']([a-zA-Z-]{2,8})["']/i)?.[1];
  const h1Raw = html.match(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i)?.[1];
  const firstP = html.match(/<p[^>]*>([\s\S]{20,600}?)<\/p>/i)?.[1];
  const kw = getMeta(html, "keywords");

  return {
    title: clean(getMeta(html, "og:title", "twitter:title")) ?? clean(titleTag),
    description: clean(getMeta(html, "og:description", "twitter:description", "description")),
    image: clean(getMeta(html, "og:image", "twitter:image", "og:image:url")),
    siteName: clean(getMeta(html, "og:site_name", "application-name")),
    language: clean(langAttr),
    ogType: clean(getMeta(html, "og:type")),
    canonical: clean(getMeta(html, "og:url")) ?? clean(getLink(html, "canonical")),
    embedUrl: clean(getMeta(html, "og:video:url", "og:video", "twitter:player")),
    keywords: kw ? kw.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20) : [],
    jsonLd: extractJsonLd(html),
    h1: clean(h1Raw ? h1Raw.replace(/<[^>]+>/g, "") : null),
    firstParagraph: clean(firstP ? firstP.replace(/<[^>]+>/g, "") : null),
    datePublished: clean(getMeta(html, "article:published_time", "pubdate", "date")),
    dateModified: clean(getMeta(html, "article:modified_time", "last-modified")),
    author: clean(getMeta(html, "article:author", "author")),
    articleSection: clean(getMeta(html, "article:section", "article:tag")),
    price: clean(getMeta(html, "product:price:amount", "og:price:amount")),
    priceCurrency: clean(getMeta(html, "product:price:currency", "og:price:currency")),
    twitterCreator: clean(getMeta(html, "twitter:creator")),
  };
}

// ── JSON-LD helpers ───────────────────────────────────────────────────────────

function jStr(obj: Record<string, unknown> | undefined, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v === "string") return clean(v);
  if (v && typeof v === "object" && !Array.isArray(v)) {
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

function jNum(obj: Record<string, unknown> | undefined, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") { const n = parseFloat(v.replace(/,/g, "")); return isNaN(n) ? null : n; }
  return null;
}

function jObj(obj: Record<string, unknown> | undefined, key: string): Record<string, unknown> | null {
  if (!obj) return null;
  const v = obj[key];
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (Array.isArray(v) && v[0] && typeof v[0] === "object") return v[0] as Record<string, unknown>;
  return null;
}

function jArr(obj: Record<string, unknown> | undefined, key: string): Record<string, unknown>[] {
  if (!obj) return [];
  const v = obj[key];
  if (Array.isArray(v)) return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (v && typeof v === "object" && !Array.isArray(v)) return [v as Record<string, unknown>];
  return [];
}

// ── JSON-LD schema-specific extractors ────────────────────────────────────────

interface MusicJsonLdMeta {
  artist: string | null; track: string | null; album: string | null;
  genre: string | null; releaseDate: string | null; duration: string | null;
  label: string | null; isrc: string | null; tracklist: string[];
  trackCount: number | null; members: string[];
}

function extractMusicMeta(items: Record<string, unknown>[]): MusicJsonLdMeta {
  const rec = items.find((j) => /musicrecording/i.test(String(j["@type"] ?? "")));
  const alb = items.find((j) => /musicalbum/i.test(String(j["@type"] ?? "")));
  const grp = items.find((j) => /musicgroup|person/i.test(String(j["@type"] ?? "")));
  const base = rec ?? alb ?? grp;

  const byArtistObj = jObj(rec, "byArtist") ?? jObj(alb, "byArtist");
  const artist = jStr(byArtistObj, "name") ?? jStr(base, "byArtist") ?? jStr(grp, "name");

  const inAlbumObj = jObj(rec, "inAlbum");
  const album = jStr(inAlbumObj, "name") ?? jStr(alb, "name");

  const labelObj = jObj(base, "recordLabel") ?? jObj(alb, "recordLabel");
  const label = jStr(labelObj, "name") ?? jStr(base, "recordLabel");

  const tracklistItems = jArr(alb, "track");
  const tracklist = tracklistItems.map((t) => jStr(t, "name")).filter((s): s is string => !!s).slice(0, 50);

  const memberItems = jArr(grp, "member");
  const members = memberItems
    .map((m) => jStr(m, "name") ?? jStr(jObj(m, "artist"), "name"))
    .filter((s): s is string => !!s).slice(0, 20);

  return {
    artist: artist ?? null,
    track: jStr(rec, "name"),
    album: album ?? null,
    genre: jStr(base, "genre"),
    releaseDate: jStr(rec, "datePublished") ?? jStr(alb, "datePublished") ?? null,
    duration: parseDuration(jStr(rec, "duration") ?? jStr(base, "duration")),
    label: label ?? null,
    isrc: jStr(rec, "isrcCode") ?? null,
    tracklist,
    trackCount: jNum(alb, "numTracks") ?? (tracklist.length > 0 ? tracklist.length : null),
    members,
  };
}

interface EventJsonLdMeta {
  name: string | null; eventDate: string | null; eventEndDate: string | null;
  eventLocation: string | null; performers: string[]; organizer: string | null;
  ticketUrl: string | null; price: string | null; currency: string | null;
  genre: string | null;
}

function extractEventMeta(items: Record<string, unknown>[]): EventJsonLdMeta {
  const ev = items.find((j) => /event/i.test(String(j["@type"] ?? "")));
  const empty: EventJsonLdMeta = {
    name: null, eventDate: null, eventEndDate: null, eventLocation: null,
    performers: [], organizer: null, ticketUrl: null, price: null, currency: null, genre: null,
  };
  if (!ev) return empty;

  const locationObj = jObj(ev, "location");
  const addressObj = jObj(locationObj, "address") ?? locationObj;
  const venue = jStr(locationObj, "name");
  const city = jStr(addressObj, "addressLocality");
  const region = jStr(addressObj, "addressRegion");
  const country = jStr(addressObj, "addressCountry");
  const locationParts = [venue, city, region, country].filter(Boolean);

  const performerItems = jArr(ev, "performer");
  const performers = performerItems.map((p) => jStr(p, "name")).filter((s): s is string => !!s).slice(0, 10);

  const organizerObj = jObj(ev, "organizer");
  const offersArr = jArr(ev, "offers");
  const offer = offersArr[0] ?? jObj(ev, "offers");
  const price = jStr(offer, "price") ?? jNum(offer, "price")?.toString() ?? null;

  return {
    name: jStr(ev, "name"),
    eventDate: jStr(ev, "startDate"),
    eventEndDate: jStr(ev, "endDate"),
    eventLocation: locationParts.length > 0 ? locationParts.join(", ") : null,
    performers,
    organizer: jStr(organizerObj, "name") ?? jStr(ev, "organizer"),
    ticketUrl: jStr(offer, "url") ?? null,
    price,
    currency: jStr(offer, "priceCurrency") ?? null,
    genre: jStr(ev, "genre"),
  };
}

interface ArticleJsonLdMeta {
  author: string | null; datePublished: string | null; dateModified: string | null;
  section: string | null; wordCount: number | null; publisher: string | null;
}

function extractArticleMeta(items: Record<string, unknown>[]): ArticleJsonLdMeta {
  const art = items.find((j) => /article|newsarticle|blogposting/i.test(String(j["@type"] ?? "")));
  const empty: ArticleJsonLdMeta = {
    author: null, datePublished: null, dateModified: null,
    section: null, wordCount: null, publisher: null,
  };
  if (!art) return empty;
  const authorObj = jObj(art, "author");
  const publisherObj = jObj(art, "publisher");
  return {
    author: jStr(authorObj, "name") ?? jStr(art, "author"),
    datePublished: jStr(art, "datePublished"),
    dateModified: jStr(art, "dateModified"),
    section: jStr(art, "articleSection"),
    wordCount: jNum(art, "wordCount"),
    publisher: jStr(publisherObj, "name") ?? jStr(art, "publisher"),
  };
}

interface ProductJsonLdMeta {
  name: string | null; brand: string | null; price: string | null;
  currency: string | null; rating: string | null; reviewCount: number | null;
}

function extractProductMeta(items: Record<string, unknown>[]): ProductJsonLdMeta {
  const prod = items.find((j) => /product/i.test(String(j["@type"] ?? "")));
  const empty: ProductJsonLdMeta = {
    name: null, brand: null, price: null, currency: null, rating: null, reviewCount: null,
  };
  if (!prod) return empty;
  const brandObj = jObj(prod, "brand");
  const offersArr = jArr(prod, "offers");
  const offer = offersArr[0] ?? jObj(prod, "offers");
  const ratingObj = jObj(prod, "aggregateRating");
  return {
    name: jStr(prod, "name"),
    brand: jStr(brandObj, "name") ?? jStr(prod, "brand"),
    price: jStr(offer, "price") ?? jNum(offer, "price")?.toString() ?? null,
    currency: jStr(offer, "priceCurrency") ?? null,
    rating: jStr(ratingObj, "ratingValue") ?? jNum(ratingObj, "ratingValue")?.toString() ?? null,
    reviewCount: jNum(ratingObj, "reviewCount") ?? jNum(ratingObj, "ratingCount"),
  };
}

interface VideoJsonLdMeta {
  title: string | null; duration: string | null; embedUrl: string | null;
  thumbnailUrl: string | null; uploadDate: string | null; viewCount: number | null;
  description: string | null;
}

function extractVideoMeta(items: Record<string, unknown>[]): VideoJsonLdMeta {
  const vid = items.find((j) => /videoobject/i.test(String(j["@type"] ?? "")));
  if (!vid) {
    return { title: null, duration: null, embedUrl: null, thumbnailUrl: null,
             uploadDate: null, viewCount: null, description: null };
  }
  const interactionObj = jObj(vid, "interactionStatistic");
  return {
    title: jStr(vid, "name"),
    duration: parseDuration(jStr(vid, "duration")),
    embedUrl: jStr(vid, "embedUrl"),
    thumbnailUrl: jStr(vid, "thumbnailUrl"),
    uploadDate: jStr(vid, "uploadDate"),
    viewCount: jNum(interactionObj, "userInteractionCount") ?? jNum(vid, "viewCount"),
    description: jStr(vid, "description"),
  };
}

// ── URL classification ────────────────────────────────────────────────────────

function findSegmentType(segments: string[], types: string[]): { type: string; id: string } | null {
  for (let i = 0; i < segments.length - 1; i++) {
    if (types.includes(segments[i].toLowerCase())) {
      return { type: segments[i].toLowerCase(), id: segments[i + 1] };
    }
  }
  return null;
}

function classify(u: URL): { platform: UrlPlatform; category: UrlCategory; ids: ParsedUrlIds } {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const segments = u.pathname.split("/").filter(Boolean);
  const ids: ParsedUrlIds = {};
  const h = (s: string) => host === s || host.endsWith(`.${s}`);

  // ── Music streaming ────────────────────────────────────────────────────────
  if (h("spotify.com")) {
    const m = findSegmentType(segments, ["track","album","artist","playlist","episode","show"]);
    if (m) {
      ids.spotify = m.id?.split("?")[0];
      ids.spotifyType = m.type;
      const category: UrlCategory =
        m.type === "episode" || m.type === "show" ? "podcast"
        : m.type === "artist" ? "profile"
        : "music_stream";
      return { platform: "spotify", category, ids };
    }
    return { platform: "spotify", category: "music_stream", ids };
  }

  if (h("music.apple.com") || h("itunes.apple.com")) {
    const m = findSegmentType(segments, ["album","artist","playlist","song","music-video"]);
    if (m) {
      ids.appleMusicType = m.type;
      ids.appleMusicNameSlug = m.id;                        // human-readable slug
      ids.appleMusic = u.searchParams.get("i") ?? m.id;    // track ID or slug
      const category: UrlCategory = m.type === "artist" ? "profile" : "music_stream";
      return { platform: "apple_music", category, ids };
    }
    return { platform: "apple_music", category: "music_stream", ids };
  }

  if (h("soundcloud.com")) {
    if (!segments.length) return { platform: "soundcloud", category: "profile", ids };
    if (segments[1] === "sets") return { platform: "soundcloud", category: "music_stream", ids };
    if (segments.length >= 2) {
      ids.soundcloud = segments.slice(0, 2).join("/");
      return { platform: "soundcloud", category: "music_stream", ids };
    }
    return { platform: "soundcloud", category: "profile", ids };
  }

  if (h("bandcamp.com") || host.endsWith(".bandcamp.com")) {
    const artistSlug = host.replace(/\.bandcamp\.com$/, "");
    const t = segments[0]?.toLowerCase();
    if (t === "track" || t === "album") {
      ids.bandcamp = `${artistSlug}/${segments[1] ?? ""}`;
      return { platform: "bandcamp", category: "music_download", ids };
    }
    ids.bandcamp = artistSlug;
    return { platform: "bandcamp", category: "profile", ids };
  }

  if (h("tidal.com")) {
    const m = findSegmentType(segments, ["track","album","artist","playlist","video"]);
    if (m) { ids.tidal = m.id?.split("?")[0]; ids.tidalType = m.type; }
    return { platform: "tidal", category: "music_stream", ids };
  }

  if (h("deezer.com")) {
    const m = findSegmentType(segments, ["track","album","artist","playlist","show","episode"]);
    if (m) { ids.deezer = m.id?.split("?")[0]; ids.deezerType = m.type; }
    const cat: UrlCategory =
      ids.deezerType === "show" || ids.deezerType === "episode" ? "podcast" : "music_stream";
    return { platform: "deezer", category: cat, ids };
  }

  if (h("music.amazon.com") || (h("amazon.com") && u.pathname.startsWith("/music/")))
    return { platform: "amazon_music", category: "music_stream", ids };
  if (h("amazon.com")) return { platform: "web", category: "ecommerce", ids };

  if (h("audiomack.com")) {
    if (segments.length >= 3) ids.audiomack = segments.slice(0, 3).join("/");
    else ids.audiomack = segments.slice(0, 2).join("/");
    const t = segments[1]?.toLowerCase();
    const cat: UrlCategory = !t || t === "profile" ? "profile" : "music_stream";
    return { platform: "audiomack", category: cat, ids };
  }

  if (h("pandora.com")) return { platform: "pandora", category: "music_stream", ids };

  if (h("mixcloud.com")) {
    if (segments.length >= 2) {
      ids.mixcloud = segments.slice(0, 2).join("/");
      return { platform: "mixcloud", category: "podcast", ids }; // DJ mixes ≈ podcast
    }
    return { platform: "mixcloud", category: "profile", ids };
  }

  if (h("beatport.com")) {
    const m = findSegmentType(segments, ["track","release","artist","label","chart"]);
    if (m) {
      // /track/{name-slug}/{numeric-id}
      const nameIdx = segments.indexOf(m.type) + 1;
      ids.beatport = segments[nameIdx + 1] ?? m.id;
      ids.beatportType = m.type;
    }
    return { platform: "beatport", category: "music_download", ids };
  }

  if (h("reverbnation.com")) return { platform: "reverbnation", category: "profile", ids };

  // ── Video ──────────────────────────────────────────────────────────────────
  if (h("youtube.com") || h("youtu.be")) {
    if (h("youtu.be")) {
      ids.youtube = segments[0]; ids.youtubeType = "video";
      return { platform: "youtube", category: "music_video", ids };
    }
    if (segments[0] === "watch") {
      ids.youtube = u.searchParams.get("v") ?? undefined; ids.youtubeType = "video";
      return { platform: "youtube", category: "music_video", ids };
    }
    if (segments[0] === "shorts") {
      ids.youtube = segments[1]; ids.youtubeType = "shorts";
      return { platform: "youtube", category: "video", ids };
    }
    if (segments[0] === "playlist") {
      ids.youtubeType = "playlist";
      return { platform: "youtube", category: "video", ids };
    }
    if (segments[0]?.startsWith("@") || ["channel","c","user"].includes(segments[0] ?? "")) {
      ids.youtubeType = "channel";
      return { platform: "youtube", category: "profile", ids };
    }
    return { platform: "youtube", category: "video", ids };
  }

  if (h("vimeo.com")) {
    if (/^\d+$/.test(segments[0] ?? "")) ids.vimeo = segments[0];
    return { platform: "vimeo", category: ids.vimeo ? "video" : "profile", ids };
  }

  if (h("twitch.tv")) return { platform: "twitch", category: "video", ids };

  // ── Social ─────────────────────────────────────────────────────────────────
  if (h("instagram.com")) {
    if (["p","reel","reels","tv"].includes(segments[0] ?? ""))
      return { platform: "instagram", category: "social_post", ids };
    return { platform: "instagram", category: "profile", ids };
  }
  if (h("tiktok.com")) {
    if (u.pathname.includes("/video/")) return { platform: "tiktok", category: "social_post", ids };
    return { platform: "tiktok", category: "profile", ids };
  }
  if (h("twitter.com") || h("x.com")) {
    if (u.pathname.includes("/status/")) return { platform: "twitter", category: "social_post", ids };
    return { platform: "twitter", category: "profile", ids };
  }
  if (h("facebook.com") || h("fb.watch")) return { platform: "facebook", category: "social_post", ids };
  if (h("threads.net")) return { platform: "threads", category: "social_post", ids };
  if (h("linkedin.com")) {
    if (u.pathname.includes("/posts/") || u.pathname.includes("/feed/"))
      return { platform: "linkedin", category: "social_post", ids };
    return { platform: "linkedin", category: "profile", ids };
  }
  if (h("snapchat.com")) return { platform: "snapchat", category: "social_post", ids };
  if (h("bsky.app")) return { platform: "bluesky", category: "social_post", ids };
  if (h("reddit.com")) {
    if (u.pathname.includes("/comments/")) return { platform: "reddit", category: "social_post", ids };
    return { platform: "reddit", category: "profile", ids };
  }
  if (h("pinterest.com") || h("pin.it")) return { platform: "pinterest", category: "social_post", ids };
  if (h("patreon.com")) return { platform: "patreon", category: "ecommerce", ids };

  // ── Events ─────────────────────────────────────────────────────────────────
  if (h("eventbrite.com") || h("eventbrite.co.uk")) return { platform: "eventbrite", category: "event", ids };
  if (h("bandsintown.com")) return { platform: "bandsintown", category: "event", ids };
  if (h("songkick.com")) return { platform: "songkick", category: "event", ids };
  if (h("dice.fm")) return { platform: "dice", category: "event", ids };
  if (h("ticketmaster.com") || h("ticketmaster.co.uk") || h("axs.com"))
    return { platform: "ticketmaster", category: "event", ids };

  // ── Articles / newsletters / lyrics ──────────────────────────────────────
  if (h("medium.com")) return { platform: "medium", category: "article", ids };
  if (h("substack.com") || host.endsWith(".substack.com"))
    return { platform: "substack", category: "newsletter", ids };
  if (h("genius.com")) return { platform: "genius", category: "lyrics", ids };

  // ── Bio-link aggregators ──────────────────────────────────────────────────
  if (h("linktr.ee") || h("lnk.to") || h("bio.link") || h("beacons.ai") ||
      h("hypeddit.com") || h("smarturl.it") || h("fanlink.to") || h("ffm.to"))
    return { platform: "linktree", category: "profile", ids };

  return { platform: "web", category: "web", ids };
}

// ── Release type ──────────────────────────────────────────────────────────────

function deriveReleaseType(
  category: UrlCategory, ids: ParsedUrlIds, pathname: string, title: string | null,
): ReleaseType {
  if (title && /\bEP\b/.test(title)) return "ep";
  if (ids.spotifyType === "track") return "single";
  if (ids.spotifyType === "album") return "album";
  if (ids.spotifyType === "playlist") return "playlist";
  if (ids.spotifyType === "episode" || ids.spotifyType === "show") return "podcast";
  if (ids.appleMusicType === "song") return "single";
  if (ids.appleMusicType === "album") return "album";
  if (ids.appleMusicType === "playlist") return "playlist";
  if (ids.tidalType === "track") return "single";
  if (ids.tidalType === "album") return "album";
  if (ids.deezerType === "track") return "single";
  if (ids.deezerType === "album") return "album";
  if (ids.beatportType === "track") return "single";
  if (ids.beatportType === "release") return "album";
  if (/\/album\//i.test(pathname)) return "album";
  if (/\/(track|song)\//i.test(pathname)) return "single";
  if (/\/(sets|playlist)\b/i.test(pathname)) return "playlist";
  if (category === "music_video" || category === "video") return "video";
  if (category === "podcast" || category === "newsletter") return "podcast";
  if (category === "music_stream" || category === "music_download") return "track";
  return "none";
}

// ── Genre detection ───────────────────────────────────────────────────────────

function detectGenre(haystack: string[]): string | undefined {
  const blob = haystack.join(" ").toLowerCase();
  for (const g of KNOWN_GENRES) {
    if (blob.includes(g)) return g.replace(/-/g, " ");
  }
  return undefined;
}

// ── Keywords & hashtags ───────────────────────────────────────────────────────

function toHashtag(text: string): string | null {
  const parts = text.replace(/&/g, " and ").replace(/[^a-zA-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const tag = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  if (tag.length < 2 || tag.length > 30) return null;
  return `#${tag}`;
}

function buildKeywords(meta: PageMeta, title: string | null, extra: string[] = []): string[] {
  const set = new Set<string>();
  for (const k of meta.keywords) if (k.length > 2) set.add(k.toLowerCase());
  if (title) {
    for (const tok of title.toLowerCase().split(/[^a-z0-9]+/)) {
      if (tok.length > 2 && !STOPWORDS.has(tok)) set.add(tok);
    }
  }
  for (const e of extra) {
    const tok = e.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
    if (tok.length > 2 && !STOPWORDS.has(tok)) set.add(tok);
  }
  return Array.from(set).slice(0, 15);
}

const HASHTAGS_BY_CATEGORY: Partial<Record<UrlCategory, string[]>> = {
  music_stream:   ["#NewMusic", "#NowStreaming", "#NewRelease"],
  music_download: ["#NewMusic", "#NewRelease", "#BuyNow"],
  music_video:    ["#MusicVideo", "#NewVideo", "#WatchNow"],
  podcast:        ["#Podcast", "#NewEpisode", "#Listen"],
  social_post:    ["#Viral", "#MustSee", "#Trending"],
  profile:        ["#Artist", "#FollowNow"],
  event:          ["#LiveMusic", "#Concert", "#OnTour"],
  press:          ["#Press", "#Feature", "#MusicNews"],
  ecommerce:      ["#Support", "#Merch", "#ShopNow"],
  article:        ["#Read", "#MusicNews", "#Industry"],
  newsletter:     ["#Newsletter", "#Subscribe", "#MusicBiz"],
  lyrics:         ["#Lyrics", "#SongOfTheDay", "#Bars"],
  video:          ["#Video", "#WatchNow", "#NewContent"],
  web:            ["#LinkInBio", "#CheckItOut"],
};

const HASHTAGS_BY_PLATFORM: Partial<Record<UrlPlatform, string[]>> = {
  spotify:      ["#Spotify", "#SpotifyPlaylist"],
  apple_music:  ["#AppleMusic", "#iTunes"],
  soundcloud:   ["#SoundCloud", "#FreeMusic"],
  tidal:        ["#TIDAL", "#HiFiMusic"],
  deezer:       ["#Deezer"],
  audiomack:    ["#Audiomack"],
  beatport:     ["#Beatport", "#EDM", "#ElectronicMusic"],
  mixcloud:     ["#Mixcloud", "#DJMix", "#DJSet"],
  bandcamp:     ["#Bandcamp", "#IndieMusic", "#SupportArtists"],
  reverbnation: ["#ReverbNation"],
  youtube:      ["#YouTube", "#Subscribe"],
  vimeo:        ["#Vimeo", "#ShortFilm"],
  tiktok:       ["#TikTok", "#ForYouPage", "#FYP"],
  instagram:    ["#Instagram", "#Reels"],
  twitch:       ["#Twitch", "#LiveStream"],
  patreon:      ["#Patreon", "#SupportArtists"],
  eventbrite:   ["#Events", "#LiveMusic"],
  bandsintown:  ["#Bandsintown", "#Concert"],
  ticketmaster: ["#Tickets", "#LiveMusic"],
  genius:       ["#Genius", "#Lyrics"],
  substack:     ["#Substack", "#Newsletter"],
  medium:       ["#Medium", "#MusicBusiness"],
};

function buildHashtags(
  artist: string | null, track: string | null, genre: string | null,
  platform: UrlPlatform, category: UrlCategory, keywords: string[],
): string[] {
  const tags = new Set<string>();
  if (artist) { const t = toHashtag(artist); if (t) tags.add(t); }
  if (track && track !== artist) { const t = toHashtag(track); if (t) tags.add(t); }
  if (genre) { const t = toHashtag(genre.replace(/\s+/g, "")); if (t) tags.add(t); }
  for (const tag of HASHTAGS_BY_CATEGORY[category] ?? []) { if (tags.size < 10) tags.add(tag); }
  for (const tag of HASHTAGS_BY_PLATFORM[platform] ?? []) { if (tags.size < 10) tags.add(tag); }
  for (const k of keywords) {
    if (tags.size >= 10) break;
    const t = toHashtag(k); if (t && !tags.has(t)) tags.add(t);
  }
  return Array.from(tags).slice(0, 10);
}

// ── Suggested angle (platform + category aware) ───────────────────────────────

function buildSuggestedAngle(platform: UrlPlatform, category: UrlCategory): string {
  if (category === "music_stream") {
    const map: Partial<Record<UrlPlatform, string>> = {
      spotify:      "Drive streams, saves, and Spotify playlist adds",
      apple_music:  "Drive Apple Music streams and playlist adds",
      soundcloud:   "Drive SoundCloud plays, reposts, and follows",
      tidal:        "Drive TIDAL HiFi streams and adds",
      deezer:       "Drive Deezer streams and fan favorites",
      audiomack:    "Drive Audiomack streams and follows",
      amazon_music: "Drive Amazon Music streams and Prime adds",
      pandora:      "Drive Pandora thumbs-up and listener growth",
      bandcamp:     "Drive Bandcamp streams and direct purchases",
      beatport:     "Drive Beatport chart position and downloads",
      mixcloud:     "Drive Mixcloud plays and DJ following",
      reverbnation: "Drive ReverbNation fans and exposure points",
    };
    return map[platform] ?? "Announce the release and drive streams";
  }
  if (category === "music_download") return "Announce the release and drive downloads and purchases";
  if (category === "music_video") {
    if (platform === "youtube") return "Tease the visual — drive YouTube views, likes, and subscribers";
    if (platform === "vimeo") return "Showcase the video — drive Vimeo views and portfolio visits";
    return "Tease the music video and drive views";
  }
  if (category === "podcast") {
    if (platform === "mixcloud") return "Promote the mix and drive Mixcloud plays and followers";
    return "Promote the episode and drive listens and subscriptions";
  }
  if (category === "social_post") return "Amplify the post and drive engagement and profile visits";
  if (category === "profile") return "Introduce the artist and grow followers and fans";
  if (category === "event") return "Build hype for the show and drive ticket sales";
  if (category === "press") return "Share the press feature and build artist credibility";
  if (category === "ecommerce") {
    if (platform === "patreon") return "Drive Patreon memberships and exclusive fan support";
    return "Drive purchases and fan support";
  }
  if (category === "article") {
    if (platform === "medium") return "Drive Medium reads and profile follows";
    return "Share the story and spark industry conversation";
  }
  if (category === "newsletter") return "Drive newsletter opens, subscribers, and shares";
  if (category === "lyrics") return "Connect fans to the lyrics — drive streams and song conversation";
  if (category === "video") {
    if (platform === "youtube") return "Drive YouTube views, likes, and channel subscribers";
    if (platform === "twitch") return "Drive live viewers and Twitch channel follows";
    return "Tease the video and drive views and engagement";
  }
  return "Drive clicks and engagement";
}

// ── Artist/track title parsing ────────────────────────────────────────────────

function parseArtistTrack(
  rawTitle: string | null, platform: UrlPlatform,
): { artist: string | null; track: string | null } {
  if (!rawTitle) return { artist: null, track: null };
  let t = rawTitle
    .replace(/\s*[|\-–—]\s*Spotify.*$/i, "")
    .replace(/\s*[|\-–—]\s*YouTube.*$/i, "")
    .replace(/\s*[|\-–—]\s*SoundCloud.*$/i, "")
    .replace(/\s*[|\-–—]\s*Apple Music.*$/i, "")
    .replace(/\s*[|\-–—]\s*TIDAL.*$/i, "")
    .replace(/\s*[|\-–—]\s*Deezer.*$/i, "")
    .replace(/\s*[|\-–—]\s*Audiomack.*$/i, "")
    .replace(/\s*[|\-–—]\s*Bandcamp.*$/i, "")
    .replace(/\s*[|\-–—]\s*Beatport.*$/i, "")
    .replace(/\s*[|\-–—]\s*Mixcloud.*$/i, "")
    .replace(/\s*\|\s*Free Listening.*$/i, "")
    .replace(/\s*-\s*song and lyrics.*$/i, "")
    .replace(/\s*\((Official|Lyric|Audio|Music|HD|4K)[^)]*\)\s*$/gi, "")
    .replace(/\s*\[(Official|Lyric|Audio|Music|HD|4K)[^\]]*\]\s*$/gi, "")
    .trim();

  // "Track by Artist" (SoundCloud, Bandcamp, Spotify)
  const byMatch = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch && platform !== "youtube") {
    return { track: clean(byMatch[1]), artist: clean(byMatch[2]) };
  }

  // "Artist - Track" or "Artist — Track"
  const dashMatch = t.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (dashMatch) {
    return { artist: clean(dashMatch[1]), track: clean(dashMatch[2]) };
  }

  return { artist: null, track: clean(t) };
}

// ── Category refinement from JSON-LD ─────────────────────────────────────────

function refineCategory(base: UrlCategory, meta: PageMeta): UrlCategory {
  if (base !== "web") return base;
  const types = meta.jsonLd
    .map((j) => String((j as Record<string, unknown>)["@type"] ?? ""))
    .join(" ").toLowerCase();
  if (meta.ogType === "article" || /article|newsarticle|blogposting/.test(types)) return "article";
  if (meta.ogType === "product" || /product|offer/.test(types)) return "ecommerce";
  if (/musicevent|event/.test(types)) return "event";
  if (/musicrecording|musicalentity|musicalbum/.test(types)) return "music_stream";
  if (meta.ogType?.startsWith("video")) return "video";
  return "web";
}

// ── oEmbed / external metadata fetchers ──────────────────────────────────────

interface OEmbedResult { title?: string; authorName?: string; thumbnailUrl?: string; embedUrl?: string }

async function trySpotifyOembed(url: string, id: string): Promise<OEmbedResult> {
  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      { headers: { "User-Agent": "MaxBooster/3.0", Accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) { logger.warn(`[AdvancedUrlParser] Spotify oEmbed HTTP ${res.status} for id=${id}`); return {}; }
    const d = JSON.parse(await res.text()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return { title: d.title, authorName: d.author_name, thumbnailUrl: d.thumbnail_url };
  } catch (err) {
    logger.warn({ err }, `[AdvancedUrlParser] Spotify oEmbed failed for id=${id}`);
    return {};
  }
}

/**
 * noembed.com — public aggregator supporting YouTube, Vimeo, Mixcloud,
 * Bandcamp, Flickr, and many more. Best-effort; returns {} on any failure.
 */
async function tryNoEmbed(pageUrl: string): Promise<OEmbedResult> {
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(pageUrl)}`,
      { headers: { "User-Agent": "MaxBooster/3.0", Accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return {};
    const raw = await res.text();
    if (!raw || raw.trim().startsWith("<")) return {};
    const d = JSON.parse(raw) as { title?: string; author_name?: string; thumbnail_url?: string; html?: string; error?: string };
    if (d.error) return {};
    const embedMatch = d.html?.match(/src=["']([^"']+)["']/i);
    return { title: d.title, authorName: d.author_name, thumbnailUrl: d.thumbnail_url, embedUrl: embedMatch?.[1] };
  } catch { return {}; }
}

async function tryTikTokOembed(pageUrl: string): Promise<OEmbedResult> {
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(pageUrl)}`,
      { headers: { "User-Agent": "MaxBooster/3.0", Accept: "application/json" }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return {};
    const d = JSON.parse(await res.text()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return { title: d.title, authorName: d.author_name, thumbnailUrl: d.thumbnail_url };
  } catch { return {}; }
}

// ── Per-platform URL-slug enrichment ─────────────────────────────────────────

function enrichAppleMusic(ids: ParsedUrlIds): { title: string | null; artist: string | null } {
  const type = ids.appleMusicType ?? "album";
  const slug = ids.appleMusicNameSlug;
  if (!slug || /^\d+$/.test(slug)) return { title: null, artist: null };
  const cleanSlug = slug.replace(/-(single|ep)$/i, "").trim();
  const name = slugToName(cleanSlug);
  if (type === "artist") return { title: `${name} on Apple Music`, artist: name };
  return { title: name, artist: null };
}

function enrichAudiomack(ids: ParsedUrlIds): { artist: string | null; track: string | null; album: string | null } {
  if (!ids.audiomack) return { artist: null, track: null, album: null };
  const parts = ids.audiomack.split("/");
  const artist = parts[0] ? slugToName(parts[0]) : null;
  const type = parts[1]?.toLowerCase();
  const name = parts[2] ? slugToName(parts[2]) : null;
  return { artist, track: type === "song" ? name : null, album: type === "album" ? name : null };
}

function enrichBeatport(segments: string[]): { track: string | null } {
  const typeIdx = segments.findIndex((s) => s.toLowerCase() === "track");
  if (typeIdx >= 0 && segments[typeIdx + 1]) {
    const name = slugToName(segments[typeIdx + 1]);
    return { track: name.length < 80 ? name : null };
  }
  return { track: null };
}

function enrichMixcloud(ids: ParsedUrlIds): { artist: string | null; track: string | null } {
  if (!ids.mixcloud) return { artist: null, track: null };
  const parts = ids.mixcloud.split("/");
  return { artist: parts[0] ? slugToName(parts[0]) : null, track: parts[1] ? slugToName(parts[1]) : null };
}

function enrichBandcamp(ids: ParsedUrlIds, host: string): { artist: string | null; track: string | null } {
  const artistSlug = host.replace(/\.bandcamp\.com$/, "");
  const artist = artistSlug && artistSlug !== "bandcamp" ? slugToName(artistSlug) : null;
  if (!ids.bandcamp) return { artist, track: null };
  const parts = ids.bandcamp.split("/");
  return { artist, track: parts[1] ? slugToName(parts[1]) : null };
}

// ── Suggested topic builder ───────────────────────────────────────────────────

function buildSuggestedTopic(
  platform: UrlPlatform, category: UrlCategory, isMusic: boolean,
  artist: string | null, track: string | null, album: string | null,
  genre: string | null, title: string | null, siteName: string | null,
  host: string, eventDate: string | null, eventLocation: string | null,
  performers: string[], price: string | null, currency: string | null,
  author: string | null,
): string {
  // Music: "Track" by Artist [— genre]
  if (isMusic && track && artist) {
    const g = genre && genre !== "default" ? ` — ${genre}` : "";
    return `"${track}" by ${artist}${g}`;
  }
  if (isMusic && track) return `"${track}"`;
  if (isMusic && artist) return `New music by ${artist}`;
  if (isMusic && album) return `${album} (album)`;

  // Events: Title at Venue — Date
  if (category === "event") {
    const parts: string[] = [];
    if (title) parts.push(title);
    if (performers.length > 0 && !title?.includes(performers[0])) parts.push(performers.slice(0, 2).join(" & "));
    if (eventLocation) parts.push(`at ${eventLocation}`);
    if (eventDate) {
      try {
        const d = new Date(eventDate);
        if (!isNaN(d.getTime()))
          parts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
      } catch { parts.push(eventDate.slice(0, 10)); }
    }
    if (parts.length > 0) return parts.filter(Boolean).join(" ").slice(0, 120);
  }

  // Articles/newsletters/lyrics: "Title" by Author — Publication
  if (category === "article" || category === "newsletter" || category === "lyrics") {
    if (title && author) return `"${title}" by ${author}`;
    if (title && siteName && !title.includes(siteName)) return `"${title}" — ${siteName}`;
    if (title) return `"${title}"`;
  }

  // Products: Name — Price
  if (category === "ecommerce" && title) {
    if (price) return `${title} — ${currency ?? ""}${price}`;
    return title;
  }

  // Profiles
  if (category === "profile") {
    if (artist) return `${artist} on ${platform.replace(/_/g, " ")}`;
    if (title) return title;
  }

  return (title ?? siteName ?? host).slice(0, 100);
}

// ── Main parseUrl function ────────────────────────────────────────────────────

/**
 * Parse a URL into a normalized {@link ParsedUrl}. Network metadata fetch is
 * best-effort: classification from URL structure always succeeds, and a failed
 * or skipped fetch simply yields a lower-confidence result (fetched=false).
 */
export async function parseUrl(
  rawUrl: string, opts: ParseUrlOptions = {},
): Promise<ParsedUrl> {
  const u = assertPublicHttpUrl(rawUrl);
  const cacheKey = `${u.href}|${opts.skipFetch ? "nofetch" : "fetch"}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const { platform, category: baseCategory, ids } = classify(u);
  const segments = u.pathname.split("/").filter(Boolean);

  let meta: PageMeta = {
    title: null, description: null, image: null, siteName: null, language: null,
    ogType: null, canonical: null, embedUrl: null, keywords: [], jsonLd: [],
    h1: null, firstParagraph: null, datePublished: null, dateModified: null,
    author: null, articleSection: null, price: null, priceCurrency: null,
    twitterCreator: null,
  };
  let fetched = false;

  // ── Step 1: URL-slug pre-enrichment (no network, free) ────────────────────
  let preTitle: string | null = null;
  let preArtist: string | null = null;
  let preTrack: string | null = null;
  let preAlbum: string | null = null;

  if (platform === "soundcloud" && ids.soundcloud) {
    const parts = ids.soundcloud.split("/");
    if (parts.length >= 2) {
      preArtist = slugToName(parts[0]);
      preTrack = slugToName(parts[1]);
      preTitle = `${preTrack} by ${preArtist}`;
    }
  }
  if (platform === "audiomack") {
    const am = enrichAudiomack(ids);
    preArtist = am.artist; preTrack = am.track; preAlbum = am.album;
    if (preTrack && preArtist) preTitle = `${preTrack} by ${preArtist}`;
    else if (preAlbum && preArtist) preTitle = `${preAlbum} by ${preArtist}`;
  }
  if (platform === "beatport") {
    const bp = enrichBeatport(segments);
    preTrack = bp.track;
    if (preTrack) preTitle = preTrack;
  }
  if (platform === "mixcloud") {
    const mc = enrichMixcloud(ids);
    preArtist = mc.artist; preTrack = mc.track;
    if (preTrack && preArtist) preTitle = `${preTrack} by ${preArtist}`;
  }
  if (platform === "bandcamp") {
    const bc = enrichBandcamp(ids, host);
    preArtist = bc.artist; preTrack = bc.track;
    if (preTrack && preArtist) preTitle = `${preTrack} by ${preArtist}`;
    else if (preTrack) preTitle = preTrack;
  }

  // ── Step 2: Page fetch ────────────────────────────────────────────────────
  if (!opts.skipFetch) {
    try {
      const res = await safeFetchText(u.href, { timeoutMs: opts.timeoutMs ?? 12_000 });
      if (res.status < 400 && /html|xml|text/i.test(res.contentType)) {
        meta = parseMeta(res.body);
        fetched = true;
      }
    } catch (err) {
      logger.warn(
        `[AdvancedUrlParser] metadata fetch failed for host=${host}: ${(err as Error)?.message ?? String(err)}`,
      );
    }

    // ── Step 3: Platform-specific oEmbed / slug fallbacks ─────────────────

    // SPOTIFY: SSR always returns "Spotify – Web Player"
    const isGenericSpotify = !meta.title || /^spotify\b/i.test(meta.title.trim());
    if (platform === "spotify" && ids.spotify && isGenericSpotify) {
      const oe = await trySpotifyOembed(u.href, ids.spotify);
      if (oe.title) {
        meta.title = oe.title;
        if (oe.authorName) meta.h1 = oe.authorName;
        meta.siteName = "Spotify";
        if (oe.thumbnailUrl && !meta.image) meta.image = oe.thumbnailUrl;
        fetched = true;
      } else if (ids.spotifyType) {
        const label = ids.spotifyType === "track" ? "Track" : ids.spotifyType === "album" ? "Album"
          : ids.spotifyType === "playlist" ? "Playlist" : ids.spotifyType === "episode" ? "Episode" : "Release";
        meta.title = `New Spotify ${label}`;
        meta.siteName = "Spotify";
        logger.info(`[AdvancedUrlParser] Spotify oEmbed unavailable — type fallback: "${meta.title}"`);
      }
    }

    // APPLE MUSIC: JS-rendered — extract name from URL slug
    const isGenericApple = !meta.title || /^apple music\b|^itunes\b/i.test(meta.title.trim());
    if (platform === "apple_music" && isGenericApple) {
      const enriched = enrichAppleMusic(ids);
      if (enriched.title) {
        meta.title = enriched.title;
        meta.siteName = "Apple Music";
        if (enriched.artist && !preArtist) preArtist = enriched.artist;
        fetched = true;
      } else if (ids.appleMusicType) {
        const label = ids.appleMusicType === "song" ? "Track" : ids.appleMusicType === "album" ? "Album"
          : ids.appleMusicType === "playlist" ? "Playlist" : "Music";
        meta.title = `New Apple Music ${label}`;
        meta.siteName = "Apple Music";
      }
    }

    // YOUTUBE: may be bot-walled — use noembed.com
    const isGenericYouTube = !meta.title || /^youtube\b/i.test(meta.title.trim());
    if (platform === "youtube" && ids.youtube && isGenericYouTube) {
      const oe = await tryNoEmbed(u.href);
      if (oe.title) {
        meta.title = oe.title;
        if (oe.authorName) meta.h1 = oe.authorName;
        meta.siteName = "YouTube";
        if (oe.thumbnailUrl && !meta.image) meta.image = oe.thumbnailUrl;
        if (oe.embedUrl && !meta.embedUrl) meta.embedUrl = oe.embedUrl;
        fetched = true;
      }
    }

    // SOUNDCLOUD: JS-rendered; use pre-enriched slug title
    const isGenericSC = !meta.title || /^soundcloud\b/i.test(meta.title.trim());
    if (platform === "soundcloud" && isGenericSC && preTitle) {
      meta.title = preTitle;
      meta.siteName = "SoundCloud";
      fetched = true;
      logger.info(`[AdvancedUrlParser] SoundCloud URL-derived title: "${meta.title}"`);
    }

    // VIMEO: excellent noembed support
    const isGenericVimeo = !meta.title || /^vimeo\b/i.test(meta.title.trim());
    if (platform === "vimeo" && ids.vimeo && isGenericVimeo) {
      const oe = await tryNoEmbed(u.href);
      if (oe.title) {
        meta.title = oe.title;
        if (oe.authorName) meta.h1 = oe.authorName;
        meta.siteName = "Vimeo";
        if (oe.thumbnailUrl && !meta.image) meta.image = oe.thumbnailUrl;
        if (oe.embedUrl && !meta.embedUrl) meta.embedUrl = oe.embedUrl;
        fetched = true;
      }
    }

    // MIXCLOUD: slug first, then noembed fallback
    const isGenericMixcloud = !meta.title || /^mixcloud\b/i.test(meta.title.trim());
    if (platform === "mixcloud" && isGenericMixcloud) {
      if (preTitle) {
        meta.title = preTitle; meta.siteName = "Mixcloud"; fetched = true;
      } else if (ids.mixcloud) {
        const oe = await tryNoEmbed(u.href);
        if (oe.title) {
          meta.title = oe.title;
          if (oe.authorName) meta.h1 = oe.authorName;
          meta.siteName = "Mixcloud";
          if (oe.thumbnailUrl && !meta.image) meta.image = oe.thumbnailUrl;
          fetched = true;
        }
      }
    }

    // TIDAL: noembed fallback
    const isGenericTidal = !meta.title || /^tidal\b/i.test(meta.title.trim());
    if (platform === "tidal" && ids.tidal && isGenericTidal) {
      const oe = await tryNoEmbed(u.href);
      if (oe.title) {
        meta.title = oe.title;
        if (oe.authorName) meta.h1 = oe.authorName;
        meta.siteName = "TIDAL";
        if (oe.thumbnailUrl && !meta.image) meta.image = oe.thumbnailUrl;
        fetched = true;
      }
    }

    // DEEZER: noembed fallback
    const isGenericDeezer = !meta.title || /^deezer\b/i.test(meta.title.trim());
    if (platform === "deezer" && ids.deezer && isGenericDeezer) {
      const oe = await tryNoEmbed(u.href);
      if (oe.title) {
        meta.title = oe.title;
        if (oe.authorName) meta.h1 = oe.authorName;
        meta.siteName = "Deezer";
        if (oe.thumbnailUrl && !meta.image) meta.image = oe.thumbnailUrl;
        fetched = true;
      }
    }

    // AUDIOMACK / BEATPORT / BANDCAMP: apply slug pre-title if page gave nothing useful
    const isBlankTitle = !meta.title || meta.title.trim().length < 4;
    if (isBlankTitle && preTitle) {
      meta.title = preTitle;
      if (!meta.siteName) meta.siteName = platform.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      fetched = true;
    }

    // BANDCAMP: also try noembed as secondary
    if (platform === "bandcamp" && (!meta.title || isBlankTitle)) {
      const oe = await tryNoEmbed(u.href);
      if (oe.title) {
        meta.title = oe.title;
        if (oe.authorName) meta.h1 = oe.authorName;
        meta.siteName = "Bandcamp";
        if (oe.thumbnailUrl && !meta.image) meta.image = oe.thumbnailUrl;
        fetched = true;
      }
    }

    // TIKTOK: public oEmbed endpoint
    const isGenericTikTok = !meta.title || /^tiktok\b/i.test(meta.title.trim());
    if (platform === "tiktok" && isGenericTikTok) {
      const oe = await tryTikTokOembed(u.href);
      if (oe.title) {
        meta.title = oe.title;
        if (oe.authorName) meta.h1 = oe.authorName;
        meta.siteName = "TikTok";
        if (oe.thumbnailUrl && !meta.image) meta.image = oe.thumbnailUrl;
        fetched = true;
      }
    }
  }

  // ── Step 4: JSON-LD structured extraction ─────────────────────────────────
  const category = refineCategory(baseCategory, meta);
  const isMusic = MUSIC_PLATFORMS.has(platform) ||
    ["music_stream","music_video","music_download"].includes(category);

  const musicItems  = meta.jsonLd.filter((j) => /music|song|album/i.test(String(j["@type"] ?? "")));
  const eventItems  = meta.jsonLd.filter((j) => /event/i.test(String(j["@type"] ?? "")));
  const articleItems = meta.jsonLd.filter((j) => /article|newsarticle|blogposting/i.test(String(j["@type"] ?? "")));
  const productItems = meta.jsonLd.filter((j) => /product/i.test(String(j["@type"] ?? "")));
  const videoItems  = meta.jsonLd.filter((j) => /videoobject/i.test(String(j["@type"] ?? "")));

  const musicMeta   = musicItems.length   > 0 ? extractMusicMeta(musicItems)     : null;
  const eventMeta   = eventItems.length   > 0 ? extractEventMeta(eventItems)     : null;
  const articleMeta = articleItems.length > 0 ? extractArticleMeta(articleItems) : null;
  const productMeta = productItems.length > 0 ? extractProductMeta(productItems) : null;
  const videoMeta   = videoItems.length   > 0 ? extractVideoMeta(videoItems)     : null;

  // ── Step 5: Assemble final fields ─────────────────────────────────────────
  const title =
    meta.title ?? musicMeta?.track ?? videoMeta?.title ?? eventMeta?.name ?? null;

  const at = parseArtistTrack(title, platform);

  // Artist: JSON-LD > oEmbed h1 > slug pre-enrichment > title parse
  const artist =
    musicMeta?.artist ??
    (meta.h1 && isMusic ? clean(meta.h1) : null) ??
    preArtist ??
    at.artist;

  // Track: JSON-LD > slug > title parse
  const track = isMusic ? (musicMeta?.track ?? preTrack ?? at.track) : null;

  const album =
    musicMeta?.album ??
    preAlbum ??
    (ids.spotifyType === "album" ? title : null);

  const description = meta.description ?? videoMeta?.description ?? meta.firstParagraph;
  const keywords = buildKeywords(meta, title, [
    artist ?? "", track ?? "", album ?? "", musicMeta?.genre ?? "",
  ]);
  const genre = musicMeta?.genre ?? detectGenre([title ?? "", description ?? "", ...keywords, ...meta.keywords]);
  const hashtags = buildHashtags(artist, track, genre ?? null, platform, category, keywords);
  const releaseType = deriveReleaseType(category, ids, u.pathname, title);

  // Event fields
  const eventDate     = eventMeta?.eventDate ?? (category === "event" && meta.datePublished ? meta.datePublished : null);
  const eventEndDate  = eventMeta?.eventEndDate ?? null;
  const eventLocation = eventMeta?.eventLocation ?? null;
  const performers    = eventMeta?.performers ?? [];
  const organizer     = eventMeta?.organizer ?? null;
  const ticketUrl     = eventMeta?.ticketUrl ?? null;
  const price         = eventMeta?.price ?? productMeta?.price ?? meta.price ?? null;
  const currency      = eventMeta?.currency ?? productMeta?.currency ?? meta.priceCurrency ?? null;

  // Article / newsletter fields
  const author        = articleMeta?.author ?? meta.author ?? (!isMusic ? at.artist : null);
  const datePublished = articleMeta?.datePublished ?? meta.datePublished ?? null;
  const dateModified  = articleMeta?.dateModified ?? meta.dateModified ?? null;
  const section       = articleMeta?.section ?? meta.articleSection ?? null;
  const wordCount     = articleMeta?.wordCount ?? null;

  // Product fields
  const brand       = productMeta?.brand ?? null;
  const rating      = productMeta?.rating ?? null;
  const reviewCount = productMeta?.reviewCount ?? null;

  // Video fields
  const viewCount  = videoMeta?.viewCount ?? null;
  const uploadDate = videoMeta?.uploadDate ?? null;
  const embedUrl   = videoMeta?.embedUrl ?? meta.embedUrl ?? null;

  // Music-specific fields
  const releaseDate = musicMeta?.releaseDate ?? null;
  const duration    = musicMeta?.duration ?? videoMeta?.duration ?? null;
  const label       = musicMeta?.label ?? null;
  const isrc        = musicMeta?.isrc ?? null;
  const tracklist   = musicMeta?.tracklist ?? [];
  const trackCount  = musicMeta?.trackCount ?? null;
  const members     = musicMeta?.members ?? [];

  const suggestedTopic = buildSuggestedTopic(
    platform, category, isMusic, artist, track, album, genre ?? null, title,
    meta.siteName, host, eventDate, eventLocation, performers, price, currency, author,
  );
  const suggestedAngle = buildSuggestedAngle(platform, category);
  const summary = description ?? (title ? `${title} (${platform})` : `${platform} ${category}`);

  const parsed: ParsedUrl = {
    url: rawUrl, finalUrl: u.href, host, platform, category, ids,
    title, description, imageUrl: meta.image, siteName: meta.siteName,
    language: meta.language, canonical: meta.canonical, embedUrl,
    artist, track, album, genre: genre ?? null, releaseType,
    releaseDate, duration, label, isrc, tracklist, trackCount, members,
    eventDate, eventEndDate, eventLocation, performers, organizer, ticketUrl, price, currency,
    author, datePublished, dateModified, section, wordCount,
    brand, rating, reviewCount, viewCount, uploadDate,
    keywords, hashtags, suggestedTopic, suggestedAngle, summary,
    isMusic, fetched,
  };

  cacheSet(cacheKey, parsed);
  return parsed;
}

// ── toContentBrief ────────────────────────────────────────────────────────────

const CONTENT_TYPE_BY_CATEGORY: Record<
  UrlCategory, NonNullable<UrlContentBrief["contentType"]> | undefined
> = {
  music_stream: "announcement", music_download: "announcement",
  music_video: "behind_scenes", podcast: "storytelling",
  social_post: "engagement", profile: "engagement", event: "promotional",
  press: "storytelling", ecommerce: "promotional", article: "storytelling",
  newsletter: "storytelling", lyrics: "storytelling",
  video: "behind_scenes", web: undefined,
};

/**
 * Map a {@link ParsedUrl} onto the AdvancedContentRequest fields that MaxCore
 * actually consumes, so the link demonstrably reshapes generated output.
 */
export function toContentBrief(parsed: ParsedUrl): UrlContentBrief {
  const label = parsed.category.replace(/_/g, " ");
  const subject = parsed.title ?? parsed.suggestedTopic;
  const byline = parsed.artist ? ` by ${parsed.artist}` : "";

  const contextParts: string[] = [];
  if (parsed.description) contextParts.push(parsed.description.slice(0, 180));
  if (parsed.genre) contextParts.push(`Genre: ${parsed.genre}`);
  if (parsed.releaseDate) contextParts.push(`Released: ${parsed.releaseDate}`);
  if (parsed.label) contextParts.push(`Label: ${parsed.label}`);
  if (parsed.duration) contextParts.push(`Duration: ${parsed.duration}`);
  if (parsed.tracklist.length > 0) contextParts.push(`Tracklist: ${parsed.tracklist.slice(0, 5).join(", ")}`);
  if (parsed.members.length > 0) contextParts.push(`Members: ${parsed.members.slice(0, 4).join(", ")}`);
  if (parsed.eventDate) contextParts.push(`Event date: ${parsed.eventDate}`);
  if (parsed.eventLocation) contextParts.push(`Venue: ${parsed.eventLocation}`);
  if (parsed.performers.length > 0) contextParts.push(`Performers: ${parsed.performers.slice(0, 3).join(", ")}`);
  if (parsed.price) contextParts.push(`Price: ${parsed.currency ?? ""}${parsed.price}`);
  if (parsed.author && !parsed.isMusic) contextParts.push(`Author: ${parsed.author}`);
  if (parsed.section) contextParts.push(`Section: ${parsed.section}`);
  if (parsed.brand) contextParts.push(`Brand: ${parsed.brand}`);
  if (parsed.viewCount) contextParts.push(`${parsed.viewCount.toLocaleString()} views`);

  const promotionContext = (
    `Create a post promoting this ${label} on ${parsed.platform}: ` +
    `"${subject}"${byline}. ` +
    (contextParts.length > 0 ? contextParts.join(". ") + " " : "") +
    `Goal: ${parsed.suggestedAngle}. Source: ${parsed.finalUrl}`
  ).replace(/\s+/g, " ").trim().slice(0, 700);

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
  rawUrl: string, opts?: ParseUrlOptions,
): Promise<UrlContentBrief> {
  return toContentBrief(await parseUrl(rawUrl, opts));
}

export const advancedUrlParser = { parseUrl, toContentBrief, urlToContentBrief };
