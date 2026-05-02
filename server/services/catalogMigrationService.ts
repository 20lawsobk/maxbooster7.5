/**
 * Catalog Migration Service
 *
 * Extracts a complete, distribution-grade catalog and outputs it in
 * LabelGrid's import format, ready for re-submission or cross-account
 * migration.
 *
 * Pipeline
 * ────────
 *   1. AUTHORITY CHECK — LabelGrid API (GET /v1/releases + GET /v1/releases/:id)
 *        When LabelGrid returns releases, they are the authoritative source.
 *        All output fields are seeded from LabelGrid first.
 *
 *   2. PRIMARY DATA SOURCE — Linked streaming platform profiles
 *        When LabelGrid is empty, the user's linked streaming profiles
 *        (Spotify, Apple Music, Deezer, etc.) are scanned directly.
 *        Each linked platform is scanned via scanReleasesFromProfile().
 *        Results are merged and deduplicated across platforms.
 *
 *   3. VALIDATION + ENRICHMENT — authority layer (Deezer, Apple Music)
 *        Runs on every release regardless of its source.
 *        Role:
 *          • Cross-check title, release date, and track count against public platforms.
 *          • Fill fields the primary source left blank (ISRC, UPC, artwork, genre).
 *          • Detect ISRC conflicts between sources.
 *          • Detect alternate versions (deluxe, explicit, clean, remix, bonus).
 *          • Confirm which platforms publicly carry the release.
 *          • Record all discrepancies in _meta.validation.
 *        Platforms queried: Deezer (free API), Apple Music / iTunes (free API).
 *
 *   4. FULL FALLBACK — iTunes + Deezer catalog build
 *        Only when LabelGrid returns nothing AND no profiles are linked.
 *        Same validation layer applied.
 *
 * Fields not available from any public source (left null, never invented):
 *   - audioFile, label, copyrightOwner, lyrics
 */

import { logger } from '../logger.js';
import { labelGridService } from './labelgrid-service.js';
import type { LabelGridCatalogRelease, LabelGridCatalogTrack } from './labelgrid-service.js';
import type { ScannedRelease } from './distributionDataTransferService.js';
import { DISTRIBUTION_PLATFORMS } from '../seed/distributionPlatforms.js';

// ── Timeout-guarded fetch: adds a 10s default signal so no outbound HTTP call
// can hold the event loop indefinitely.  Per-call signal overrides this default.
const timedFetch = (url: string | URL | Request, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(10_000), ...init });


// ─── All registered DSP platform slugs ────────────────────────────────────────
// LabelGrid is the authority layer for every platform in this list.
// When LabelGrid confirms a release is live on a set of platforms, that list
// takes precedence over everything else in the export. When LabelGrid is
// unavailable, the release is assumed to target the full active platform
// catalog (since DistroKid distributes to all major platforms by default).
const ALL_DISTRIBUTION_PLATFORM_SLUGS: string[] = DISTRIBUTION_PLATFORMS
  .filter(p => p.isActive)
  .map(p => p.slug);

// ─── Validation types ─────────────────────────────────────────────────────────

export interface IsrcConflict {
  trackTitle: string;
  trackNumber: number;
  labelgridIsrc: string;
  platformIsrc: string;
}

export interface PlatformValidation {
  platform: 'deezer' | 'apple_music';
  found: boolean;
  platformReleaseId: string | null;
  titleMatch: boolean;
  releaseDateMatch: boolean | null;
  trackCountMatch: boolean | null;
  isrcConflicts: IsrcConflict[];
  alternateVersions: string[];
  discrepancies: string[];
  enrichedFields: string[];
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface MigrationTrack {
  title: string;
  artist: string;
  isrc: string | null;
  audioFile: null;
  duration: number | null;
  trackNumber: number;
  discNumber: number;
  explicit: boolean;
}

export interface MigrationRelease {
  title: string;
  artist: string;
  releaseType: 'album' | 'EP' | 'single';
  releaseDate: string | null;
  upc: string | null;
  artwork: string | null;
  genre: string | null;
  label: null;
  copyrightYear: number | null;
  copyrightOwner: null;
  territoryMode: 'worldwide';
  territories: [];
  platforms: string[];
  tracks: MigrationTrack[];
  platformUrl?: string;
  _meta: {
    sources: string[];
    isrcsCovered: number;
    totalTracks: number;
    missingFields: string[];
    platformPresence: string[];
    validation: PlatformValidation[];
  };
}

export interface MigrationPayload {
  exportedAt: string;
  artistName: string;
  totalReleases: number;
  totalTracks: number;
  isrcCoverage: string;
  releases: MigrationRelease[];
}

// ─── Internal raw types ───────────────────────────────────────────────────────

interface DeezerAlbumSummary {
  id: number;
  title: string;
  nb_tracks: number;
  release_date?: string;
  upc?: string;
  genres?: { data: { name: string }[] };
  tracks?: { data: DeezerAlbumTrack[] };
}

interface DeezerAlbumTrack {
  id: number;
  title: string;
  track_position: number;
  duration: number;
  explicit_lyrics: boolean;
}

interface DeezerTrackDetail {
  id: number;
  title: string;
  isrc: string | null;
  duration: number;
  explicit_lyrics: boolean;
}

interface iTunesAlbumEntry {
  collectionId: number;
  collectionName: string;
  artistName: string;
  releaseDate: string;
  artworkUrl100: string;
  primaryGenreName: string;
  trackCount: number;
  collectionExplicitness: string;
}

interface iTunesTrackEntry {
  trackName: string;
  trackNumber: number;
  discNumber: number;
  trackTimeMillis: number;
  trackExplicitness: string;
  artistName: string;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function normalizeTitle(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\s*-\s*(single|ep|album)\s*$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function titleMatch(a: string, b: string): boolean {
  return normalizeTitle(a) === normalizeTitle(b);
}

/** Score-based similarity: returns 0-1. */
function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  return 0;
}

/** Returns true if a title looks like an alternate version. */
const ALTERNATE_SUFFIXES = /\b(deluxe|bonus|remaster|remastered|remix|remixed|explicit|clean|edited|acoustic|live|extended|instrumental|radio edit|edition|version|special|expanded)\b/i;

function isAlternateVersion(title: string): boolean {
  return ALTERNATE_SUFFIXES.test(title);
}

function releaseTypeNormalize(t: string): 'album' | 'EP' | 'single' {
  const l = (t || '').toLowerCase();
  if (l === 'ep') return 'EP';
  if (l === 'single') return 'single';
  return 'album';
}

// ─── Deezer helpers ───────────────────────────────────────────────────────────

async function deezerRequest<T>(url: string): Promise<T | null> {
  try {
    const resp = await timedFetch(url, {
      signal: AbortSignal.timeout(10_000), // 10 s — prevent hanging during batch imports
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    return await resp.json() as T;
  } catch {
    return null;
  }
}

/** Search Deezer for albums by a given artist. Returns up to `limit` results. */
async function deezerSearchAlbums(artistName: string, limit = 50): Promise<DeezerAlbumSummary[]> {
  const q = `artist:"${artistName}"`;
  const data = await deezerRequest<{ data: DeezerAlbumSummary[] }>(
    `https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=${limit}`
  );
  return data?.data ?? [];
}

/** Fetch full album detail (including UPC, release_date, genres, track list). */
async function deezerAlbumDetail(albumId: number): Promise<DeezerAlbumSummary | null> {
  return deezerRequest<DeezerAlbumSummary>(`https://api.deezer.com/album/${albumId}`);
}

/** Fetch individual track for ISRC. */
async function deezerTrackDetail(trackId: number): Promise<DeezerTrackDetail | null> {
  return deezerRequest<DeezerTrackDetail>(`https://api.deezer.com/track/${trackId}`);
}

/** Search for a single track by title + artist; used to fill missing ISRCs. */
async function deezerFindTrack(
  trackTitle: string,
  artistName: string
): Promise<{ isrc: string | null; albumId: number | null } | null> {
  const q = `track:"${trackTitle}" artist:"${artistName}"`;
  const data = await deezerRequest<{ data: unknown[] }>(
    `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`
  );
  if (!data?.data?.length) return null;
  for (const t of data.data) {
    if (titleMatch(t.title, trackTitle)) {
      return { isrc: t.isrc ?? null, albumId: t.album?.id ?? null };
    }
  }
  const first = data.data[0];
  return { isrc: first.isrc ?? null, albumId: first.album?.id ?? null };
}

// ─── iTunes / Apple Music helpers ─────────────────────────────────────────────

async function itunesRequest<T>(url: string): Promise<T | null> {
  try {
    const resp = await timedFetch(url);
    if (!resp.ok) return null;
    return await resp.json() as T;
  } catch {
    return null;
  }
}

async function itunesFindArtistId(
  artistName: string
): Promise<{ id: number; name: string } | null> {
  const data = await itunesRequest<{ results: unknown[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=album&limit=50&country=US`
  );
  const counts: Record<number, { count: number; name: string }> = {};
  for (const item of data?.results ?? []) {
    const id: number = item.artistId;
    if (!id) continue;
    if (!counts[id]) counts[id] = { count: 0, name: item.artistName };
    counts[id].count++;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
  if (!sorted.length) return null;
  return { id: Number(sorted[0][0]), name: sorted[0][1].name };
}

async function itunesAlbumsByArtist(artistId: number): Promise<iTunesAlbumEntry[]> {
  const data = await itunesRequest<{ results: unknown[] }>(
    `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=200&country=US`
  );
  return (data?.results ?? []).filter((r: Record<string, unknown>) => r.wrapperType === 'collection');
}

async function itunesTracksByAlbum(collectionId: number): Promise<iTunesTrackEntry[]> {
  const data = await itunesRequest<{ results: unknown[] }>(
    `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200&country=US`
  );
  return (data?.results ?? []).filter((r: Record<string, unknown>) => r.wrapperType === 'track');
}

/**
 * Search Apple Music for a specific release title+artist.
 * Returns the best matching album entry or null.
 */
async function itunesFindRelease(
  title: string,
  artistName: string
): Promise<iTunesAlbumEntry | null> {
  const data = await itunesRequest<{ results: unknown[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(`${artistName} ${title}`)}&entity=album&limit=10&country=US`
  );
  for (const r of data?.results ?? []) {
    if (titleMatch(r.collectionName || '', title)) return r as iTunesAlbumEntry;
  }
  // Fuzzy fallback: similarity ≥ 0.7
  for (const r of data?.results ?? []) {
    if (titleSimilarity(r.collectionName || '', title) >= 0.7) return r as iTunesAlbumEntry;
  }
  return null;
}

// ─── Deezer validation for one release ───────────────────────────────────────

interface DeezerValidationContext {
  lgTitle: string;
  lgReleaseDate: string | null;
  lgTrackCount: number;
  lgTracks: LabelGridCatalogTrack[];
  artistName: string;
  allDeezerAlbums: DeezerAlbumSummary[]; // pre-fetched artist discography
}

async function validateOnDeezer(ctx: DeezerValidationContext): Promise<{
  validation: PlatformValidation;
  upc: string | null;
  isrcMap: Map<string, string>;    // trackTitle (normalized) → ISRC
  alternateVersions: string[];
  deezerTracks: DeezerAlbumTrack[]; // raw Deezer track list (for populating lgTracks when empty)
}> {
  const result: PlatformValidation = {
    platform: 'deezer',
    found: false,
    platformReleaseId: null,
    titleMatch: false,
    releaseDateMatch: null,
    trackCountMatch: null,
    isrcConflicts: [],
    alternateVersions: [],
    discrepancies: [],
    enrichedFields: [],
  };

  const isrcMap = new Map<string, string>();
  let upc: string | null = null;
  const alternateVersions: string[] = [];

  // Find the best-matching album in the pre-fetched Deezer discography.
  let bestAlbum: DeezerAlbumSummary | null = null;
  let bestScore = 0;

  for (const album of ctx.allDeezerAlbums) {
    const score = titleSimilarity(album.title, ctx.lgTitle);
    if (score > bestScore) {
      bestScore = score;
      bestAlbum = album;
    }
    // Collect alternate versions of this specific release.
    if (isAlternateVersion(album.title) && titleSimilarity(album.title, ctx.lgTitle) >= 0.5) {
      alternateVersions.push(album.title);
    }
  }

  if (!bestAlbum || bestScore < 0.6) {
    result.discrepancies.push(`Release "${ctx.lgTitle}" not found on Deezer`);
    return { validation: result, upc, isrcMap, alternateVersions, deezerTracks: [] };
  }

  result.found = true;
  result.platformReleaseId = String(bestAlbum.id);
  result.titleMatch = titleMatch(bestAlbum.title, ctx.lgTitle);
  result.alternateVersions = alternateVersions;

  if (!result.titleMatch) {
    result.discrepancies.push(
      `Title mismatch: LabelGrid="${ctx.lgTitle}" Deezer="${bestAlbum.title}"`
    );
  }

  // Fetch full album detail for UPC, release_date, genres, track listing.
  await delay(100);
  const detail = await deezerAlbumDetail(bestAlbum.id);
  if (!detail) return { validation: result, upc, isrcMap, alternateVersions, deezerTracks: [] };

  upc = detail.upc ?? null;
  if (upc) result.enrichedFields.push('upc');

  // Release-date check.
  if (ctx.lgReleaseDate && detail.release_date) {
    const lgYear = ctx.lgReleaseDate.slice(0, 4);
    const dzYear = detail.release_date.slice(0, 4);
    result.releaseDateMatch = lgYear === dzYear;
    if (!result.releaseDateMatch) {
      result.discrepancies.push(
        `Release date mismatch: LabelGrid=${ctx.lgReleaseDate} Deezer=${detail.release_date}`
      );
    }
  }

  // Track-count check.
  if (detail.nb_tracks != null) {
    result.trackCountMatch = detail.nb_tracks === ctx.lgTrackCount;
    if (!result.trackCountMatch) {
      result.discrepancies.push(
        `Track count mismatch: LabelGrid=${ctx.lgTrackCount} Deezer=${detail.nb_tracks}`
      );
    }
  }

  // Per-track ISRC fetch + conflict detection.
  const albumTracks = detail.tracks?.data ?? [];
  for (const dTrack of albumTracks) {
    await delay(80);
    const trackDetail = await deezerTrackDetail(dTrack.id);
    if (!trackDetail?.isrc) continue;

    const dzIsrc = trackDetail.isrc;
    const normTitle = normalizeTitle(dTrack.title);
    isrcMap.set(normTitle, dzIsrc);

    // Check against LabelGrid ISRC for the same track.
    const lgTrack = ctx.lgTracks.find(t => titleMatch(t.title, dTrack.title));
    if (lgTrack?.isrc && lgTrack.isrc !== dzIsrc) {
      result.isrcConflicts.push({
        trackTitle: dTrack.title,
        trackNumber: dTrack.track_position,
        labelgridIsrc: lgTrack.isrc,
        platformIsrc: dzIsrc,
      });
      result.discrepancies.push(
        `ISRC conflict on "${dTrack.title}": LabelGrid=${lgTrack.isrc} Deezer=${dzIsrc}`
      );
    }
  }

  return { validation: result, upc, isrcMap, alternateVersions, deezerTracks: albumTracks };
}

// ─── Apple Music validation for one release ───────────────────────────────────

interface AppleMusicValidationContext {
  lgTitle: string;
  lgReleaseDate: string | null;
  lgTrackCount: number;
  lgGenre: string | null;
  lgArtwork: string | null;
  artistName: string;
  allItunesAlbums: iTunesAlbumEntry[];
}

async function validateOnAppleMusic(ctx: AppleMusicValidationContext): Promise<{
  validation: PlatformValidation;
  artwork: string | null;
  genre: string | null;
  alternateVersions: string[];
}> {
  const result: PlatformValidation = {
    platform: 'apple_music',
    found: false,
    platformReleaseId: null,
    titleMatch: false,
    releaseDateMatch: null,
    trackCountMatch: null,
    isrcConflicts: [],
    alternateVersions: [],
    discrepancies: [],
    enrichedFields: [],
  };

  let artwork: string | null = null;
  let genre: string | null = null;
  const alternateVersions: string[] = [];

  // Find best match in pre-fetched iTunes albums.
  let bestAlbum: iTunesAlbumEntry | null = null;
  let bestScore = 0;

  for (const album of ctx.allItunesAlbums) {
    const score = titleSimilarity(album.collectionName, ctx.lgTitle);
    if (score > bestScore) {
      bestScore = score;
      bestAlbum = album;
    }
    if (isAlternateVersion(album.collectionName) && titleSimilarity(album.collectionName, ctx.lgTitle) >= 0.5) {
      alternateVersions.push(album.collectionName);
    }
  }

  if (!bestAlbum || bestScore < 0.6) {
    result.discrepancies.push(`Release "${ctx.lgTitle}" not found on Apple Music`);
    return { validation: result, artwork, genre, alternateVersions };
  }

  result.found = true;
  result.platformReleaseId = String(bestAlbum.collectionId);
  result.titleMatch = titleMatch(bestAlbum.collectionName, ctx.lgTitle);
  result.alternateVersions = alternateVersions;

  if (!result.titleMatch) {
    result.discrepancies.push(
      `Title mismatch: LabelGrid="${ctx.lgTitle}" Apple Music="${bestAlbum.collectionName}"`
    );
  }

  // Release-date check.
  if (ctx.lgReleaseDate && bestAlbum.releaseDate) {
    const lgYear = ctx.lgReleaseDate.slice(0, 4);
    const amYear = bestAlbum.releaseDate.slice(0, 4);
    result.releaseDateMatch = lgYear === amYear;
    if (!result.releaseDateMatch) {
      result.discrepancies.push(
        `Release date mismatch: LabelGrid=${ctx.lgReleaseDate} AppleMusic=${bestAlbum.releaseDate.slice(0, 10)}`
      );
    }
  }

  // Track-count check.
  if (bestAlbum.trackCount != null) {
    result.trackCountMatch = bestAlbum.trackCount === ctx.lgTrackCount;
    if (!result.trackCountMatch) {
      result.discrepancies.push(
        `Track count mismatch: LabelGrid=${ctx.lgTrackCount} AppleMusic=${bestAlbum.trackCount}`
      );
    }
  }

  // Artwork: fill if LabelGrid didn't supply it; note if different resolution.
  const amArtwork = bestAlbum.artworkUrl100?.replace('100x100bb', '600x600bb') ?? null;
  if (!ctx.lgArtwork && amArtwork) {
    artwork = amArtwork;
    result.enrichedFields.push('artwork');
  }

  // Genre: fill if LabelGrid didn't supply it.
  if (!ctx.lgGenre && bestAlbum.primaryGenreName) {
    genre = bestAlbum.primaryGenreName;
    result.enrichedFields.push('genre');
  }

  return { validation: result, artwork, genre, alternateVersions };
}

// ─── Core hydration: LabelGrid release → MigrationRelease ────────────────────

/**
 * Converts one LabelGrid release into a MigrationRelease.
 * Runs the full validation + enrichment layer (Deezer + Apple Music)
 * regardless of whether fields are missing, so discrepancies are always caught.
 */
async function hydrateLabelGridRelease(
  lgRelease: LabelGridCatalogRelease,
  allDeezerAlbums: DeezerAlbumSummary[],
  allItunesAlbums: iTunesAlbumEntry[]
): Promise<MigrationRelease> {
  const sources: string[] = ['labelgrid'];
  const cleanTitle = lgRelease.title.replace(/\s*-\s*(Single|EP|Album)\s*$/i, '').trim();
  const artistName = lgRelease.artist;

  // Ensure we have the full track listing.
  let lgTracks: LabelGridCatalogTrack[] = lgRelease.tracks ?? [];
  if (lgTracks.length === 0 && lgRelease.id) {
    const detail = await labelGridService.getReleaseDetail(lgRelease.id);
    if (detail?.tracks?.length) lgTracks = detail.tracks;
  }

  let upc = lgRelease.upc ?? null;
  let artwork = lgRelease.coverUrl
    ? lgRelease.coverUrl.replace(/\/\d+x\d+[a-z]{2}\.(jpg|png)$/i, '/600x600bb.jpg')
    : null;
  let genre = lgRelease.genre ?? null;

  // ── Deezer validation + enrichment ──────────────────────────────────────
  await delay(80);
  const deezerResult = await validateOnDeezer({
    lgTitle: cleanTitle,
    lgReleaseDate: lgRelease.releaseDate?.split('T')[0] ?? null,
    lgTrackCount: lgTracks.length || lgRelease.trackCount,
    lgTracks,
    artistName,
    allDeezerAlbums,
  });

  if (deezerResult.validation.found) sources.push('deezer');
  if (!upc && deezerResult.upc) {
    upc = deezerResult.upc;
  }

  // When LabelGrid returned no tracks and Deezer has track-level data, use
  // Deezer's track list as a fallback so that migrationTracks is non-empty
  // and track numbers / durations / ISRCs are populated.
  if (lgTracks.length === 0 && deezerResult.deezerTracks.length > 0) {
    lgTracks = deezerResult.deezerTracks.map(dt => ({
      title: dt.title,
      isrc: deezerResult.isrcMap.get(normalizeTitle(dt.title)) ?? undefined,
      trackNumber: dt.track_position,
      duration: dt.duration,
    }));
  }

  // ── Apple Music validation + enrichment ─────────────────────────────────
  await delay(80);
  const amResult = await validateOnAppleMusic({
    lgTitle: cleanTitle,
    lgReleaseDate: lgRelease.releaseDate?.split('T')[0] ?? null,
    lgTrackCount: lgTracks.length || lgRelease.trackCount,
    lgGenre: genre,
    lgArtwork: artwork,
    artistName,
    allItunesAlbums,
  });

  if (amResult.validation.found) sources.push('apple_music');
  if (!artwork && amResult.artwork) artwork = amResult.artwork;
  if (!genre && amResult.genre) genre = amResult.genre;

  // ── Platform presence (LabelGrid is the authority for all 100 DSPs) ──────
  // When LabelGrid's API returns a `platforms` list for this release, that list
  // is the authoritative record of which of the 100 distribution system
  // platforms the release is live on. Deezer and Apple Music public-API
  // verification adds additional confirmed entries on top of LabelGrid's list.
  const lgPlatforms = lgRelease.platforms?.length ? lgRelease.platforms : [];
  const platformPresence: string[] = [...lgPlatforms];
  if (!platformPresence.includes('deezer') && deezerResult.validation.found) {
    platformPresence.push('deezer');
  }
  if (!platformPresence.includes('apple_music') && amResult.validation.found) {
    platformPresence.push('apple_music');
  }

  // ── Build track list ─────────────────────────────────────────────────────
  const migrationTracks: MigrationTrack[] = [];

  for (const lgTrack of lgTracks) {
    let isrc = lgTrack.isrc ?? null;
    let explicit = false;

    // Fill ISRC from Deezer ISRC map if LabelGrid didn't supply it.
    if (!isrc) {
      const fromDeezer = deezerResult.isrcMap.get(normalizeTitle(lgTrack.title));
      if (fromDeezer) {
        isrc = fromDeezer;
        if (!sources.includes('deezer')) sources.push('deezer');
      }
    }

    // If still missing, do a targeted Deezer track search.
    if (!isrc) {
      await delay(100);
      const hit = await deezerFindTrack(lgTrack.title, artistName);
      if (hit?.isrc) {
        isrc = hit.isrc;
        if (!sources.includes('deezer')) sources.push('deezer');
      }
      if (hit) explicit = false; // explicit_lyrics not available from search result type
    }

    migrationTracks.push({
      title: lgTrack.title,
      artist: artistName,
      isrc,
      audioFile: null,
      duration: lgTrack.duration > 0 ? lgTrack.duration : null,
      trackNumber: lgTrack.trackNumber,
      discNumber: 1,
      explicit,
    });
  }

  // ── Collect alternate versions across platforms ───────────────────────────
  const allAlternates = [
    ...new Set([
      ...deezerResult.alternateVersions,
      ...amResult.alternateVersions,
    ]),
  ].filter(v => !titleMatch(v, cleanTitle));

  // Merge alternate versions into both validation objects for completeness.
  deezerResult.validation.alternateVersions = deezerResult.alternateVersions;
  amResult.validation.alternateVersions = amResult.alternateVersions;

  // ── Missing fields list ───────────────────────────────────────────────────
  const isrcsCovered = migrationTracks.filter(t => t.isrc).length;
  const missingFields: string[] = [];
  if (!upc) missingFields.push('upc');
  if (isrcsCovered < migrationTracks.length) missingFields.push('isrc (partial)');
  if (!artwork) missingFields.push('artwork');
  if (!genre) missingFields.push('genre');
  missingFields.push('audioFile', 'label', 'copyrightOwner');

  const releaseYear = lgRelease.releaseDate
    ? new Date(lgRelease.releaseDate).getFullYear()
    : null;

  return {
    title: cleanTitle,
    artist: artistName,
    releaseType: releaseTypeNormalize(lgRelease.releaseType),
    releaseDate: lgRelease.releaseDate?.split('T')[0] ?? null,
    upc,
    artwork,
    genre,
    label: null,
    copyrightYear: releaseYear,
    copyrightOwner: null,
    territoryMode: 'worldwide',
    territories: [],
    // LabelGrid is the authority for all 100 distribution system platforms.
    // When LabelGrid specifies platforms for this release, that list is used
    // exactly as returned. When LabelGrid is unavailable (API 404 etc.) the
    // release targets every active platform registered in the distribution
    // system — matching the "worldwide" scope DistroKid delivers to.
    platforms: lgRelease.platforms?.length
      ? lgRelease.platforms
      : ALL_DISTRIBUTION_PLATFORM_SLUGS,
    tracks: migrationTracks,
    _meta: {
      sources,
      isrcsCovered,
      totalTracks: migrationTracks.length || lgRelease.trackCount || 0,
      missingFields,
      platformPresence,
      validation: [deezerResult.validation, amResult.validation],
    },
  };
}

// ─── Step 2: Build from linked streaming platform profiles ────────────────────

/**
 * Scans each of the user's linked streaming platform profiles and builds
 * MigrationRelease objects from the combined results.
 *
 * Each ScannedRelease is converted into a LabelGridCatalogRelease skeleton so
 * it can flow through the same Deezer + Apple Music authority/validation layer
 * that LabelGrid releases use.
 *
 * Results from multiple platforms are merged and deduplicated:
 *   • Primary key: UPC (authoritative)
 *   • Secondary key: normalised title
 *   • On collision: keep the version with more track data; merge UPC / genre.
 */
async function buildFromLinkedProfiles(
  userId: string,
  artistName: string,
  allDeezerAlbums: DeezerAlbumSummary[],
  allItunesAlbums: iTunesAlbumEntry[]
): Promise<MigrationRelease[]> {
  // Lazy-import to avoid circular deps at module load time.
  const { distributionDataTransferService } = await import('./distributionDataTransferService.js');

  const linkedProfiles = await distributionDataTransferService.getLinkedProfiles(userId);
  if (linkedProfiles.length === 0) {
    logger.info('[CatalogMigration] No linked streaming profiles for this user');
    return [];
  }

  const platformList = linkedProfiles.map(p => p.platformId).join(', ');
  logger.info(`[CatalogMigration] Linked platforms: ${platformList}`);

  // ── Scan each platform ─────────────────────────────────────────────────────
  // scanReleasesFromProfile now supports all 97 DSPs via the universal scanner
  // (dedicated API scanners for 6 platforms + iTunes-proxy fallback for the rest).
  const allScanned: ScannedRelease[] = [];

  for (const profile of linkedProfiles) {
    try {
      logger.info(
        `[CatalogMigration] Scanning ${profile.platformId} — ` +
        `"${profile.artistName}" (id: ${profile.artistId})`
      );
      const scanned = await distributionDataTransferService.scanReleasesFromProfile(
        userId,
        profile.platformId
      );
      logger.info(`[CatalogMigration]   ${scanned.length} release(s) from ${profile.platformId}`);
      allScanned.push(...scanned);
    } catch (err) {
      logger.warn(`[CatalogMigration] Scan failed for ${profile.platformId}: ${err?.message}`);
    }
  }

  if (allScanned.length === 0) {
    logger.info('[CatalogMigration] All platform scans returned 0 releases');
    return [];
  }

  // ── Deduplicate across platforms ──────────────────────────────────────────
  // Key: UPC when present, else normalised title.
  const seen = new Map<string, ScannedRelease>();

  for (const r of allScanned) {
    const key = r.upc ? `upc:${r.upc}` : `title:${normalizeTitle(r.title)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, r);
    } else {
      // Merge: prefer the entry with more track data.
      const merged: ScannedRelease = { ...existing };
      if ((r.tracks?.length ?? 0) > (existing.tracks?.length ?? 0)) {
        merged.tracks = r.tracks;
      }
      if (!merged.upc && r.upc) merged.upc = r.upc;
      if (!merged.genre && r.genre) merged.genre = r.genre;
      if (!merged.coverUrl && r.coverUrl) merged.coverUrl = r.coverUrl;
      // Keep the platform with more data as the canonical source label.
      seen.set(key, merged);
    }
  }

  const deduped = Array.from(seen.values());
  logger.info(
    `[CatalogMigration] ${deduped.length} unique release(s) after dedup ` +
    `(${allScanned.length} total across all platforms)`
  );

  // ── Convert ScannedRelease → LabelGridCatalogRelease skeleton → MigrationRelease ─
  const releases: MigrationRelease[] = [];

  for (let i = 0; i < deduped.length; i++) {
    const r = deduped[i];
    const cleanTitle = r.title.replace(/\s*-\s*(Single|EP|Album)\s*$/i, '').trim();
    logger.info(
      `[CatalogMigration] Hydrating ${i + 1}/${deduped.length}: "${cleanTitle}" [${r.platformId}]`
    );

    // Build a skeleton that matches the LabelGridCatalogRelease shape so
    // hydrateLabelGridRelease can run its full validation + enrichment pass.
    const skeleton: LabelGridCatalogRelease = {
      id: `${r.platformId}-${r.externalId}`,
      title: r.title,
      artist: r.artistName || artistName,
      releaseDate: r.releaseDate ?? undefined,
      upc: r.upc,
      coverUrl: r.coverUrl,
      releaseType: r.releaseType,
      trackCount: r.trackCount,
      genre: r.genre,
      // Leave platforms empty so hydrateLabelGridRelease uses ALL_DISTRIBUTION_PLATFORM_SLUGS.
      // The source platform is added to platformPresence after hydration.
      platforms: [],
      tracks: (r.tracks ?? []).map(t => ({
        title: t.title,
        isrc: t.isrc,
        trackNumber: t.trackNumber,
        duration: t.duration ?? 0,
      })),
    };

    const migrated = await hydrateLabelGridRelease(skeleton, allDeezerAlbums, allItunesAlbums);

    // Replace the hardcoded 'labelgrid' source tag with the real platform that
    // supplied this release's data.
    migrated._meta.sources = migrated._meta.sources.map(s =>
      s === 'labelgrid' ? r.platformId : s
    );
    if (!migrated._meta.sources.includes(r.platformId)) {
      migrated._meta.sources.unshift(r.platformId);
    }

    // Ensure the source platform appears in platformPresence.
    if (!migrated._meta.platformPresence.includes(r.platformId)) {
      migrated._meta.platformPresence.unshift(r.platformId);
    }

    // Carry the source platform's direct link through to the export.
    if (r.platformUrl) {
      migrated.platformUrl = r.platformUrl;
    }

    releases.push(migrated);
    await delay(80);
  }

  return releases;
}

// ─── Fallback: build from iTunes + Deezer when LabelGrid has nothing ──────────

async function buildFromiTunesAndDeezer(
  artistName: string,
  allDeezerAlbums: DeezerAlbumSummary[],
  allItunesAlbums: iTunesAlbumEntry[]
): Promise<MigrationRelease[]> {
  logger.info(`[CatalogMigration] Fallback: building from iTunes for "${artistName}"`);
  const releases: MigrationRelease[] = [];

  for (let ai = 0; ai < allItunesAlbums.length; ai++) {
    const album = allItunesAlbums[ai];
    const cleanTitle = album.collectionName.replace(/\s*-\s*(Single|EP|Album)\s*$/i, '').trim();
    logger.info(`[CatalogMigration] Fallback ${ai + 1}/${allItunesAlbums.length}: "${cleanTitle}"`);

    await delay(80);
    const iTracks = await itunesTracksByAlbum(album.collectionId);

    // Build skeleton LabelGridCatalogRelease from iTunes data so we can
    // reuse hydrateLabelGridRelease (which will validate via Deezer + Apple Music).
    const skeletonRelease: LabelGridCatalogRelease = {
      id: `itunes-${album.collectionId}`,
      title: album.collectionName,
      artist: album.artistName || artistName,
      releaseDate: album.releaseDate?.split('T')[0] ?? undefined,
      upc: undefined,
      coverUrl: album.artworkUrl100?.replace('100x100bb', '600x600bb') ?? undefined,
      releaseType: 'single', // iTunes doesn't expose a clean release type
      trackCount: album.trackCount,
      genre: album.primaryGenreName || undefined,
      platforms: [],
      tracks: iTracks.map(t => ({
        title: t.trackName,
        isrc: undefined,
        trackNumber: t.trackNumber,
        duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 0,
      })),
    };

    const migrated = await hydrateLabelGridRelease(skeletonRelease, allDeezerAlbums, allItunesAlbums);
    // Ensure fallback sources are recorded correctly.
    if (!migrated._meta.sources.includes('itunes')) {
      migrated._meta.sources.unshift('itunes');
    }
    releases.push(migrated);
  }

  return releases;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * @param artistName  The artist name used to query Deezer + iTunes (authority layer).
 * @param userId      When provided, linked streaming platform profiles are used
 *                    as the primary catalog data source (Step 2). Without it,
 *                    the pipeline falls through to the iTunes + Deezer fallback.
 */
export async function buildMigrationPayload(
  artistName: string,
  userId?: string
): Promise<MigrationPayload> {
  logger.info(
    `[CatalogMigration] Starting migration export for "${artistName}"` +
    (userId ? ` (userId: ${userId})` : '')
  );

  // Pre-fetch streaming-platform discographies upfront so the authority /
  // validation layer can run per-release without re-fetching the artist index.
  logger.info('[CatalogMigration] Pre-fetching Deezer + iTunes discographies (authority layer)');
  const [deezerAlbums, itunesArtist] = await Promise.all([
    deezerSearchAlbums(artistName, 100),
    itunesFindArtistId(artistName),
  ]);

  logger.info(`[CatalogMigration] Deezer: ${deezerAlbums.length} album(s) found`);
  let itunesAlbums: iTunesAlbumEntry[] = [];
  if (itunesArtist) {
    itunesAlbums = await itunesAlbumsByArtist(itunesArtist.id);
    logger.info(
      `[CatalogMigration] Apple Music: ${itunesAlbums.length} album(s) found for "${itunesArtist.name}"`
    );
  }

  // ── Step 1: LabelGrid authority check ────────────────────────────────────
  // When LabelGrid returns releases they are the definitive catalog source.
  logger.info('[CatalogMigration] Querying LabelGrid authority layer');
  const lgReleases = await labelGridService.getUserCatalog();
  logger.info(`[CatalogMigration] LabelGrid returned ${lgReleases.length} release(s)`);

  const releases: MigrationRelease[] = [];

  if (lgReleases.length > 0) {
    for (let i = 0; i < lgReleases.length; i++) {
      const lgR = lgReleases[i];
      logger.info(`[CatalogMigration] LabelGrid ${i + 1}/${lgReleases.length}: "${lgR.title}"`);
      const migrated = await hydrateLabelGridRelease(lgR, deezerAlbums, itunesAlbums);
      releases.push(migrated);
    }
  } else {
    // ── Step 2: Linked streaming platform profiles ────────────────────────
    // The user's linked profiles (Spotify, Apple Music, Deezer, etc.) provide
    // the raw catalog. LabelGrid is still the authority layer that validates
    // each release; it just isn't the data source when its API returns nothing.
    if (userId) {
      logger.info('[CatalogMigration] LabelGrid empty — scanning linked streaming profiles');
      const profileReleases = await buildFromLinkedProfiles(
        userId,
        artistName,
        deezerAlbums,
        itunesAlbums
      );
      if (profileReleases.length > 0) {
        logger.info(
          `[CatalogMigration] Got ${profileReleases.length} release(s) from linked profiles`
        );
        releases.push(...profileReleases);
      }
    }

    // ── Step 3: Fallback — iTunes + Deezer ───────────────────────────────
    // Used when LabelGrid is empty and either no userId was supplied or all
    // profile scans returned zero releases.
    if (releases.length === 0) {
      logger.info('[CatalogMigration] No profile data — using iTunes + Deezer fallback');
      const fallback = await buildFromiTunesAndDeezer(artistName, deezerAlbums, itunesAlbums);
      releases.push(...fallback);
    }
  }

  const totalTracks = releases.reduce((acc, r) => acc + r._meta.totalTracks, 0);
  const totalIsrcs = releases.reduce((acc, r) => acc + r._meta.isrcsCovered, 0);
  const isrcCoverage = totalTracks > 0
    ? `${Math.round((totalIsrcs / totalTracks) * 100)}%`
    : '0%';

  logger.info(
    `[CatalogMigration] Complete: ${releases.length} releases, ` +
    `${totalTracks} tracks, ${isrcCoverage} ISRC coverage`
  );

  return {
    exportedAt: new Date().toISOString(),
    artistName: releases[0]?.artist ?? artistName,
    totalReleases: releases.length,
    totalTracks,
    isrcCoverage,
    releases,
  };
}
