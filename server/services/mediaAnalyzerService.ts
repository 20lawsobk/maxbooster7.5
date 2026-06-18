/**
 * Media Analyzer Service — Max Booster
 *
 * URL analysis runs through the in-house TypeScript parser
 * (advancedUrlParser, SSRF-safe). Audio and image analysis spawn their
 * respective Python scripts (audioAnalyzer, imageAnalyzer) and return JSON
 * as typed objects. Audio and image analysis run on-device with no external
 * calls; URL analysis performs a bounded, SSRF-guarded fetch of the page.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { advancedUrlParser, type UrlCategory } from "./advancedUrlParser.js";

const PYTHON = process?.env.PYTHON_PATH || "python3";
const SERVICE_DIR = path?.join(process?.cwd(), "server", "services");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UrlAnalysis {
  // Core identifiers
  url: string;
  domain: string;
  platform: string;
  platform_category: string;
  is_music: boolean;
  // Basic metadata
  title: string;
  description: string;
  author: string;
  published: string;
  modified: string;
  og_image: string;
  thumbnail_url: string;
  canonical: string;
  language: string;
  // Classification
  content_type: string;
  content_category: string;
  genre: string;
  tone: string;
  // Music-specific
  artist: string;
  track: string;
  album: string;
  duration: string;
  release_date: string;
  label: string;
  isrc: string;
  bpm: string;
  tracklist?: string[];
  track_count?: number;
  members?: string[];
  // Content arrays
  keywords: string[];
  tags: string[];
  headings: string[];
  body_preview: string;
  summary: string;
  // Engagement metrics (null when unavailable)
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  play_count?: number | null;
  share_count?: number | null;
  subscriber_count?: number | string | null;
  // Media
  embed_url?: string;
  // Article
  reading_time_minutes?: number | null;
  word_count?: number | null;
  section?: string;
  // Event-specific
  event_date?: string;
  event_end_date?: string;
  event_location?: string;
  performers?: string[];
  organizer?: string;
  // Product-specific
  price?: string;
  currency?: string;
  brand?: string;
  rating?: string;
  review_count?: number | null;
  // Platform IDs
  final_url?: string;
  youtube_id?: string;
  spotify_type?: string;
  spotify_id?: string;
  apple_music_type?: string;
  apple_music_id?: string;
  // Meta
  data_sources?: string[];
  error?: string;
}

export interface AudioAnalysis {
  title: string;
  artist: string;
  album: string;
  duration: number;
  bpm: number;
  bpm_detected: number;
  bpm_from_tag: number | null;
  energy: number;
  valence: number;
  dance: number;
  tempo_norm: number;
  spectral_flatness: number;
  bands: { bass: number; mid: number; treble: number };
  genre: string;
  genre_tag: string;
  nn_features: {
    energy: number;
    valence: number;
    dance: number;
    tempo_norm: number;
  };
  analysis_quality: "full" | "metadata_only";
  error?: string;
}

export interface PaletteColor {
  hex: string;
  rgb: [number, number, number];
  weight: number;
  hue_deg: number;
  sat: number;
  val: number;
}

export interface ImageAnalysis {
  width: number;
  height: number;
  brightness: number;
  saturation: number;
  contrast: number;
  warmth: number;
  mood: string;
  genre_hint: string;
  tone: string;
  palette: PaletteColor[];
  primary_hex: string;
  accent_hex: string;
  bg_color: string;
  ac_color: string;
  hue_shift_suggest: number;
  sat_mult_suggest: number;
  val_mult_suggest: number;
  error?: string;
}

// ── Shared Python runner ──────────────────────────────────────────────────────

function runPython(
  script: string,
  arg: string,
  timeout = 20_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [script, arg], {
      env: { ...process?.env, PYTHONPATH: SERVICE_DIR },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child?.stdout.on("data", (d: Buffer) => {
      stdout += d?.toString();
    });
    child?.stderr.on("data", (d: Buffer) => {
      stderr += d?.toString();
    });

    const timer = setTimeout(() => {
      child?.kill("SIGKILL");
      reject(new Error(`Analyzer timed out after ${timeout}ms`));
    }, timeout);

    child?.on("close", (_code) => {
      clearTimeout(timer);
      const trimmed = stdout?.trim();
      if (!trimmed) {
        reject(
          new Error(
            `Analyzer produced no output. stderr: ${stderr?.slice(0, 300)}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON?.parse(trimmed));
      } catch {
        reject(
          new Error(`Invalid JSON from analyzer: ${trimmed?.slice(0, 200)}`),
        );
      }
    });

    child?.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

// Maps the parser's structured category to the (content_type, platform_category)
// vocabulary the content-generation routes and client expect. This preserves
// video/article/event/product/podcast/profile semantics that downstream CTA
// selection and the client categorizer rely on.
const URL_CATEGORY_TO_ANALYSIS: Record<
  UrlCategory,
  { content_type: string; platform_category: string }
> = {
  music_stream: { content_type: "music_track", platform_category: "music" },
  music_download: { content_type: "music_track", platform_category: "music" },
  music_video: { content_type: "music_video", platform_category: "music" },
  podcast: { content_type: "podcast", platform_category: "audio" },
  social_post: { content_type: "social_post", platform_category: "social" },
  profile: { content_type: "profile", platform_category: "social" },
  event: { content_type: "event", platform_category: "event" },
  press: { content_type: "article", platform_category: "news" },
  ecommerce: { content_type: "product", platform_category: "shopping" },
  article: { content_type: "article", platform_category: "news" },
  video: { content_type: "video", platform_category: "video" },
  web: { content_type: "website", platform_category: "web" },
};

/**
 * Analyze a URL with the in-house TypeScript parser and map its result into
 * the UrlAnalysis shape consumed across the content-generation routes.
 *
 * The parser only populates the fields it can extract from page metadata
 * (title/description/image, artist/track/album/genre, platform IDs,
 * keywords/hashtags); the richer engagement/event/product fields the old
 * Python analyzer guessed at are intentionally left at their empty defaults.
 * Throws only when the URL itself is rejected (e.g. SSRF-blocked target);
 * an unreachable page still yields a structure-derived analysis.
 */
export async function analyzeUrl(url: string): Promise<UrlAnalysis> {
  const parsed = await advancedUrlParser.parseUrl(url);
  const platform = parsed.platform || "web";
  const { content_type, platform_category } =
    URL_CATEGORY_TO_ANALYSIS[parsed.category] ?? URL_CATEGORY_TO_ANALYSIS.web;
  const image = parsed.imageUrl ?? "";
  return {
    url: parsed.url,
    domain: parsed.host,
    platform,
    platform_category,
    is_music: parsed.isMusic,
    title: parsed.title ?? "",
    description: parsed.description ?? "",
    author: parsed.artist ?? "",
    published: "",
    modified: "",
    og_image: image,
    thumbnail_url: image,
    canonical: parsed.finalUrl,
    language: parsed.language ?? "",
    content_type,
    content_category: parsed.category,
    genre: parsed.genre ?? "default",
    tone: "default",
    artist: parsed.artist ?? "",
    track: parsed.track ?? "",
    album: parsed.album ?? "",
    duration: "",
    release_date: "",
    label: "",
    isrc: "",
    bpm: "",
    keywords: parsed.keywords ?? [],
    tags: (parsed.hashtags ?? []).map((h) => h.replace(/^#/, "")),
    headings: [],
    body_preview: parsed.summary ?? "",
    summary: parsed.summary ?? parsed.description ?? "",
    view_count: null,
    like_count: null,
    comment_count: null,
    play_count: null,
    share_count: null,
    subscriber_count: null,
    embed_url: "",
    reading_time_minutes: null,
    word_count: null,
    section: "",
    event_date: "",
    event_end_date: "",
    event_location: "",
    performers: [],
    organizer: "",
    price: "",
    currency: "",
    brand: "",
    rating: "",
    review_count: null,
    final_url: parsed.finalUrl,
    youtube_id: parsed.ids.youtube ?? "",
    spotify_type: parsed.ids.spotifyType ?? "",
    spotify_id: parsed.ids.spotify ?? "",
    apple_music_type: "",
    apple_music_id: parsed.ids.appleMusic ?? "",
    data_sources: ["advanced_url_parser"],
  };
}

export async function analyzeAudio(
  fileBuffer: Buffer,
  originalName: string,
): Promise<AudioAnalysis> {
  // Write buffer to a temp file
  const ext = path?.extname(originalName) || ".mp3";
  const tmp = path?.join(os?.tmpdir(), `mb_audio_${Date?.now()}${ext}`);
  await fs?.writeFile(tmp, fileBuffer);

  try {
    const script = path?.join(SERVICE_DIR, "audioAnalyzer.py");
    const result = (await runPython(script, tmp, 60_000)) as AudioAnalysis;
    return result;
  } finally {
    await fs?.unlink(tmp).catch(() => {});
  }
}

export async function analyzeImage(
  fileBuffer: Buffer,
  originalName: string,
): Promise<ImageAnalysis> {
  const ext = path?.extname(originalName) || ".jpg";
  const tmp = path?.join(os?.tmpdir(), `mb_image_${Date?.now()}${ext}`);
  await fs?.writeFile(tmp, fileBuffer);

  try {
    const script = path?.join(SERVICE_DIR, "imageAnalyzer.py");
    const result = (await runPython(script, tmp, 30_000)) as ImageAnalysis;
    return result;
  } finally {
    await fs?.unlink(tmp).catch(() => {});
  }
}

// ── Content generation seed ───────────────────────────────────────────────────
// Converts any analysis result into the standard topic/genre/tone payload
// accepted by unifiedAIController?.generateContent()

export function urlToContentSeed(a: UrlAnalysis) {
  const topic = a?.track
    ? `${a?.track}${a?.artist ? ` by ${a?.artist}` : ""}`
    : a?.summary || a?.title || a?.domain || a?.url;
  return {
    topic,
    genre: a.genre || "default",
    tone: a.tone || "default",
    artist: a.artist || "",
    track: a.track || "",
    album: a.album || "",
    author: a.author || "",
    label: a.label || "",
    release_date: a.release_date || "",
    duration: a.duration || "",
    content_type: a.content_type || "website",
    content_category: a.content_category || "general",
    is_music: a.is_music,
    platform: a.platform,
    platform_category: a.platform_category || "web",
    og_image: a.og_image || "",
    thumbnail_url: a.thumbnail_url || "",
    embed_url: a.embed_url || "",
    keywords: a.keywords || [],
    tags: a.tags || [],
    headings: a.headings || [],
    body_preview: a.body_preview || "",
    // Engagement
    view_count: a.view_count ?? null,
    like_count: a.like_count ?? null,
    play_count: a.play_count ?? null,
    subscriber_count: a.subscriber_count ?? null,
    // Event-specific
    event_date: a.event_date || "",
    event_location: a.event_location || "",
    performers: a.performers || [],
    // Product-specific
    price: a.price || "",
    currency: a.currency || "",
    brand: a.brand || "",
    rating: a.rating || "",
    // Article-specific
    reading_time_minutes: a.reading_time_minutes ?? null,
    section: a.section || "",
    // Platform IDs
    youtube_id: a.youtube_id || "",
    spotify_id: a.spotify_id || "",
    spotify_type: a.spotify_type || "",
    // Metadata
    language: a.language || "",
    data_sources: a.data_sources || [],
  };
}

export function audioToContentSeed(a: AudioAnalysis) {
  const topic = a?.track
    ? `${a?.track}${a?.artist ? ` by ${a?.artist}` : ""}`
    : a?.title || "New Track";
  return {
    topic,
    genre: a.genre || "hip-hop",
    tone: "default",
    artist: a.artist || "",
    track: a.title || "",
    bpm: a.bpm,
    energy: a.energy,
    valence: a.valence,
    tempo_norm: a.tempo_norm,
    nn_features: a.nn_features,
  };
}

export function imageToContentSeed(a: ImageAnalysis) {
  return {
    topic: `Visual mood: ${a?.mood}`,
    genre: a.genre_hint || "pop",
    tone: a.tone || "default",
    bg_color: a.bg_color,
    ac_color: a.ac_color,
    palette: a.palette.slice(0, 3).map((p) => p?.hex),
    mood: a.mood,
    hue_shift_suggest: a.hue_shift_suggest,
    sat_mult_suggest: a.sat_mult_suggest,
    val_mult_suggest: a.val_mult_suggest,
  };
}
