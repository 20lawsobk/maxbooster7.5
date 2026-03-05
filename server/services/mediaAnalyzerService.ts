/**
 * Media Analyzer Service — Max Booster
 *
 * Spawns the three Python analyzer scripts (urlAnalyzer, audioAnalyzer,
 * imageAnalyzer) and returns their JSON output as typed objects.
 * All analysis is performed on-device with no external API calls.
 */

import { spawn }       from 'child_process';
import { promises as fs } from 'fs';
import os              from 'os';
import path            from 'path';

const PYTHON        = process.env.PYTHON_PATH || 'python3';
const SERVICE_DIR   = path.join(process.cwd(), 'server', 'services');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UrlAnalysis {
  // Core identifiers
  url:               string;
  domain:            string;
  platform:          string;
  platform_category: string;
  is_music:          boolean;
  // Basic metadata
  title:             string;
  description:       string;
  author:            string;
  published:         string;
  modified:          string;
  og_image:          string;
  thumbnail_url:     string;
  canonical:         string;
  language:          string;
  // Classification
  content_type:      string;
  content_category:  string;
  genre:             string;
  tone:              string;
  // Music-specific
  artist:            string;
  track:             string;
  album:             string;
  duration:          string;
  release_date:      string;
  label:             string;
  isrc:              string;
  bpm:               string;
  tracklist?:        string[];
  track_count?:      number;
  members?:          string[];
  // Content arrays
  keywords:          string[];
  tags:              string[];
  headings:          string[];
  body_preview:      string;
  summary:           string;
  // Engagement metrics (null when unavailable)
  view_count?:       number | null;
  like_count?:       number | null;
  comment_count?:    number | null;
  play_count?:       number | null;
  share_count?:      number | null;
  subscriber_count?: number | string | null;
  // Media
  embed_url?:        string;
  // Article
  reading_time_minutes?: number | null;
  word_count?:       number | null;
  section?:          string;
  // Event-specific
  event_date?:       string;
  event_end_date?:   string;
  event_location?:   string;
  performers?:       string[];
  organizer?:        string;
  // Product-specific
  price?:            string;
  currency?:         string;
  brand?:            string;
  rating?:           string;
  review_count?:     number | null;
  // Platform IDs
  final_url?:        string;
  youtube_id?:       string;
  spotify_type?:     string;
  spotify_id?:       string;
  apple_music_type?: string;
  apple_music_id?:   string;
  // Meta
  data_sources?:     string[];
  error?:            string;
}

export interface AudioAnalysis {
  title:        string;
  artist:       string;
  album:        string;
  duration:     number;
  bpm:          number;
  bpm_detected: number;
  bpm_from_tag: number | null;
  energy:       number;
  valence:      number;
  dance:        number;
  tempo_norm:   number;
  spectral_flatness: number;
  bands:        { bass: number; mid: number; treble: number };
  genre:        string;
  genre_tag:    string;
  nn_features:  { energy: number; valence: number; dance: number; tempo_norm: number };
  analysis_quality: 'full' | 'metadata_only';
  error?: string;
}

export interface PaletteColor {
  hex:     string;
  rgb:     [number, number, number];
  weight:  number;
  hue_deg: number;
  sat:     number;
  val:     number;
}

export interface ImageAnalysis {
  width:       number;
  height:      number;
  brightness:  number;
  saturation:  number;
  contrast:    number;
  warmth:      number;
  mood:        string;
  genre_hint:  string;
  tone:        string;
  palette:     PaletteColor[];
  primary_hex: string;
  accent_hex:  string;
  bg_color:    string;
  ac_color:    string;
  hue_shift_suggest: number;
  sat_mult_suggest:  number;
  val_mult_suggest:  number;
  error?: string;
}

// ── Shared Python runner ──────────────────────────────────────────────────────

function runPython(script: string, arg: string, timeout = 20_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [script, arg], {
      env:   { ...process.env, PYTHONPATH: SERVICE_DIR },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Analyzer timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(new Error(`Analyzer produced no output. stderr: ${stderr.slice(0, 300)}`));
        return;
      }
      try {
        resolve(JSON.parse(trimmed));
      } catch {
        reject(new Error(`Invalid JSON from analyzer: ${trimmed.slice(0, 200)}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function analyzeUrl(url: string): Promise<UrlAnalysis> {
  const script = path.join(SERVICE_DIR, 'urlAnalyzer.py');
  const result = await runPython(script, url, 30_000) as UrlAnalysis;
  return result;
}

export async function analyzeAudio(
  fileBuffer: Buffer,
  originalName: string,
): Promise<AudioAnalysis> {
  // Write buffer to a temp file
  const ext  = path.extname(originalName) || '.mp3';
  const tmp  = path.join(os.tmpdir(), `mb_audio_${Date.now()}${ext}`);
  await fs.writeFile(tmp, fileBuffer);

  try {
    const script = path.join(SERVICE_DIR, 'audioAnalyzer.py');
    const result = await runPython(script, tmp, 60_000) as AudioAnalysis;
    return result;
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

export async function analyzeImage(
  fileBuffer: Buffer,
  originalName: string,
): Promise<ImageAnalysis> {
  const ext  = path.extname(originalName) || '.jpg';
  const tmp  = path.join(os.tmpdir(), `mb_image_${Date.now()}${ext}`);
  await fs.writeFile(tmp, fileBuffer);

  try {
    const script = path.join(SERVICE_DIR, 'imageAnalyzer.py');
    const result = await runPython(script, tmp, 30_000) as ImageAnalysis;
    return result;
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

// ── Content generation seed ───────────────────────────────────────────────────
// Converts any analysis result into the standard topic/genre/tone payload
// accepted by unifiedAIController.generateContent()

export function urlToContentSeed(a: UrlAnalysis) {
  const topic = a.track
    ? `${a.track}${a.artist ? ` by ${a.artist}` : ''}`
    : a.summary || a.title || a.domain || a.url;
  return {
    topic,
    genre:             a.genre            || 'default',
    tone:              a.tone             || 'default',
    artist:            a.artist           || '',
    track:             a.track            || '',
    album:             a.album            || '',
    author:            a.author           || '',
    label:             a.label            || '',
    release_date:      a.release_date     || '',
    duration:          a.duration         || '',
    content_type:      a.content_type     || 'website',
    content_category:  a.content_category || 'general',
    is_music:          a.is_music,
    platform:          a.platform,
    platform_category: a.platform_category || 'web',
    og_image:          a.og_image         || '',
    thumbnail_url:     a.thumbnail_url    || '',
    embed_url:         a.embed_url        || '',
    keywords:          a.keywords         || [],
    tags:              a.tags             || [],
    headings:          a.headings         || [],
    body_preview:      a.body_preview     || '',
    // Engagement
    view_count:        a.view_count       ?? null,
    like_count:        a.like_count       ?? null,
    play_count:        a.play_count       ?? null,
    subscriber_count:  a.subscriber_count ?? null,
    // Event-specific
    event_date:        a.event_date       || '',
    event_location:    a.event_location   || '',
    performers:        a.performers       || [],
    // Product-specific
    price:             a.price            || '',
    currency:          a.currency         || '',
    brand:             a.brand            || '',
    rating:            a.rating           || '',
    // Article-specific
    reading_time_minutes: a.reading_time_minutes ?? null,
    section:           a.section          || '',
    // Platform IDs
    youtube_id:        a.youtube_id       || '',
    spotify_id:        a.spotify_id       || '',
    spotify_type:      a.spotify_type     || '',
    // Metadata
    language:          a.language         || '',
    data_sources:      a.data_sources     || [],
  };
}

export function audioToContentSeed(a: AudioAnalysis) {
  const topic = a.track
    ? `${a.track}${a.artist ? ` by ${a.artist}` : ''}`
    : a.title || 'New Track';
  return {
    topic,
    genre:      a.genre || 'hip-hop',
    tone:       'default',
    artist:     a.artist || '',
    track:      a.title  || '',
    bpm:        a.bpm,
    energy:     a.energy,
    valence:    a.valence,
    tempo_norm: a.tempo_norm,
    nn_features: a.nn_features,
  };
}

export function imageToContentSeed(a: ImageAnalysis) {
  return {
    topic:    `Visual mood: ${a.mood}`,
    genre:    a.genre_hint || 'pop',
    tone:     a.tone || 'default',
    bg_color: a.bg_color,
    ac_color: a.ac_color,
    palette:  a.palette.slice(0, 3).map(p => p.hex),
    mood:     a.mood,
    hue_shift_suggest:  a.hue_shift_suggest,
    sat_mult_suggest:   a.sat_mult_suggest,
    val_mult_suggest:   a.val_mult_suggest,
  };
}
