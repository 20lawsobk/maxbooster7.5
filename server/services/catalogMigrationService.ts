/**
 * Catalog Migration Service
 *
 * Extracts a complete, distribution-grade catalog from LabelGrid's API and
 * outputs it in LabelGrid's import format, ready for re-submission or
 * cross-account migration.
 *
 * Pipeline:
 *   1. PRIMARY — LabelGrid API (GET /v1/releases + GET /v1/releases/:id)
 *        Full UPCs, ISRCs, contributor metadata, distribution fields, artwork.
 *   2. ISRC GAP FILL — Deezer public API (free, no key required)
 *        Used only for tracks that LabelGrid returned without an ISRC.
 *   3. ARTWORK / GENRE GAP FILL — Apple Music / iTunes public API (free)
 *        Used only when LabelGrid did not supply artwork or genre for a release.
 *   4. FULL FALLBACK — iTunes + Deezer only
 *        Used only when LabelGrid's API returns zero releases (e.g. token not
 *        yet configured, account not linked). Spotify is never used.
 *
 * Fields that are not publicly available and are left null rather than invented:
 *   - audioFile (binary audio content)
 *   - label (not exposed by public APIs)
 *   - copyrightOwner (not exposed by public APIs)
 *   - lyrics (not exposed by public APIs)
 */

import { logger } from '../logger.js';
import { labelGridService } from './labelgrid-service.js';
import type { LabelGridCatalogRelease, LabelGridCatalogTrack } from './labelgrid-service.js';

// ─── Public output types ──────────────────────────────────────────────────────

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
  _meta: {
    sources: string[];
    isrcsCovered: number;
    totalTracks: number;
    missingFields: string[];
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

// ─── Internal types ───────────────────────────────────────────────────────────

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
  collectionId: number;
  trackName: string;
  trackNumber: number;
  discNumber: number;
  trackTimeMillis: number;
  trackExplicitness: string;
  artistName: string;
}

interface DeezerSearchTrack {
  id: number;
  title: string;
  isrc: string | null;
  duration: number;
  explicit_lyrics: boolean;
  album: { id: number; title: string };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*-\s*(single|ep|album)\s*$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function titleMatch(a: string, b: string): boolean {
  return normalizeTitle(a) === normalizeTitle(b);
}

function releaseTypeNormalize(t: string): 'album' | 'EP' | 'single' {
  const l = (t || '').toLowerCase();
  if (l === 'ep') return 'EP';
  if (l === 'single') return 'single';
  return 'album';
}

// ─── Deezer ISRC lookup ───────────────────────────────────────────────────────

async function deezerSearchTrack(
  trackTitle: string,
  artistName: string
): Promise<DeezerSearchTrack | null> {
  try {
    const q = `track:"${trackTitle}" artist:"${artistName}"`;
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const data = await resp.json() as { data: DeezerSearchTrack[] };
    const items = data.data || [];
    for (const item of items) {
      if (titleMatch(item.title, trackTitle)) return item;
    }
    return items[0] ?? null;
  } catch {
    return null;
  }
}

async function deezerAlbumUPC(deezerAlbumId: number): Promise<string | null> {
  try {
    const url = `https://api.deezer.com/album/${deezerAlbumId}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const data = await resp.json() as { upc?: string };
    return data.upc ?? null;
  } catch {
    return null;
  }
}

// ─── iTunes helpers (artwork / genre / fallback catalog) ──────────────────────

async function itunesFindArtistId(
  artistName: string
): Promise<{ id: number; name: string } | null> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=album&limit=50&country=US`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json() as { results: any[] };

    const counts: Record<number, { count: number; name: string }> = {};
    for (const item of data.results || []) {
      const id: number = item.artistId;
      if (!id) continue;
      if (!counts[id]) counts[id] = { count: 0, name: item.artistName };
      counts[id].count++;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
    if (!sorted.length) return null;
    return { id: Number(sorted[0][0]), name: sorted[0][1].name };
  } catch {
    return null;
  }
}

async function itunesAlbums(artistId: number): Promise<iTunesAlbumEntry[]> {
  try {
    const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=200&country=US`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json() as { results: any[] };
    return (data.results || []).filter((r: any) => r.wrapperType === 'collection');
  } catch {
    return [];
  }
}

async function itunesTracks(collectionId: number): Promise<iTunesTrackEntry[]> {
  try {
    const url = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200&country=US`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json() as { results: any[] };
    return (data.results || []).filter((r: any) => r.wrapperType === 'track');
  } catch {
    return [];
  }
}

/** Find artwork + genre for a release title from iTunes. */
async function itunesMetadataForRelease(
  title: string,
  artistName: string
): Promise<{ artwork: string | null; genre: string | null }> {
  try {
    const q = `${artistName} ${title}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=10&country=US`;
    const resp = await fetch(url);
    if (!resp.ok) return { artwork: null, genre: null };
    const data = await resp.json() as { results: any[] };
    for (const r of data.results || []) {
      if (titleMatch(r.collectionName || '', title)) {
        return {
          artwork: (r.artworkUrl100 as string)?.replace('100x100bb', '3000x3000bb') ?? null,
          genre: r.primaryGenreName ?? null,
        };
      }
    }
    return { artwork: null, genre: null };
  } catch {
    return { artwork: null, genre: null };
  }
}

// ─── LabelGrid → MigrationRelease ────────────────────────────────────────────

/**
 * Convert a LabelGrid catalog release (possibly enriched with track detail)
 * into a MigrationRelease, filling ISRC gaps from Deezer and artwork/genre
 * gaps from iTunes.
 */
async function hydrateLabelGridRelease(
  lgRelease: LabelGridCatalogRelease
): Promise<MigrationRelease> {
  const sources: string[] = ['labelgrid'];
  const cleanTitle = lgRelease.title.replace(/\s*-\s*(Single|EP|Album)\s*$/i, '').trim();
  const artistName = lgRelease.artist;

  // If the catalog response didn't include tracks inline, fetch the detail record.
  let tracks: LabelGridCatalogTrack[] = lgRelease.tracks ?? [];
  if (tracks.length === 0 && lgRelease.id) {
    const detail = await labelGridService.getReleaseDetail(lgRelease.id);
    if (detail?.tracks?.length) {
      tracks = detail.tracks;
    }
  }

  // Gap-fill: artwork and genre from iTunes when LabelGrid didn't supply them.
  let artwork = lgRelease.coverUrl
    ? lgRelease.coverUrl.replace(/\/\d+x\d+[a-z]{2}\.(jpg|png)$/, '/3000x3000bb.jpg')
    : null;
  let genre = lgRelease.genre ?? null;

  if (!artwork || !genre) {
    const itunesMeta = await itunesMetadataForRelease(cleanTitle, artistName);
    if (!artwork && itunesMeta.artwork) {
      artwork = itunesMeta.artwork;
      if (!sources.includes('itunes')) sources.push('itunes');
    }
    if (!genre && itunesMeta.genre) {
      genre = itunesMeta.genre;
      if (!sources.includes('itunes')) sources.push('itunes');
    }
  }

  // Build track list; gap-fill missing ISRCs from Deezer.
  const migrationTracks: MigrationTrack[] = [];
  let deezerAlbumId: number | null = null;

  for (const track of tracks) {
    let isrc = track.isrc ?? null;

    if (!isrc) {
      await delay(120);
      const deezerHit = await deezerSearchTrack(track.title, artistName);
      if (deezerHit) {
        if (!deezerAlbumId) deezerAlbumId = deezerHit.album.id;
        isrc = deezerHit.isrc ?? null;
        if (isrc && !sources.includes('deezer')) sources.push('deezer');
      }
    }

    migrationTracks.push({
      title: track.title,
      artist: artistName,
      isrc,
      audioFile: null,
      duration: track.duration > 0 ? track.duration : null,
      trackNumber: track.trackNumber,
      discNumber: 1,
      explicit: false,
    });
  }

  // Gap-fill UPC from Deezer album if LabelGrid didn't supply it.
  let upc = lgRelease.upc ?? null;
  if (!upc && deezerAlbumId) {
    await delay(120);
    const deezerUPC = await deezerAlbumUPC(deezerAlbumId);
    if (deezerUPC) {
      upc = deezerUPC;
      if (!sources.includes('deezer')) sources.push('deezer');
    }
  }

  const isrcsCovered = migrationTracks.filter(t => t.isrc).length;
  const missingFields: string[] = [];
  if (!upc) missingFields.push('upc');
  if (isrcsCovered < migrationTracks.length) missingFields.push('isrc (partial)');
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
    platforms: lgRelease.platforms?.length
      ? lgRelease.platforms
      : ['spotify', 'apple_music', 'amazon_music', 'deezer', 'tidal', 'youtube_music', 'pandora'],
    tracks: migrationTracks,
    _meta: {
      sources,
      isrcsCovered,
      totalTracks: migrationTracks.length,
      missingFields,
    },
  };
}

// ─── iTunes + Deezer fallback pipeline ───────────────────────────────────────

/**
 * Full fallback: fetches catalog from iTunes and enriches with Deezer ISRCs.
 * Only called when LabelGrid returns zero releases.
 */
async function buildFromiTunesAndDeezer(artistName: string): Promise<MigrationRelease[]> {
  logger.info(`[CatalogMigration] Fallback: fetching catalog from iTunes for "${artistName}"`);

  const itunesArtist = await itunesFindArtistId(artistName);
  if (!itunesArtist) {
    logger.warn(`[CatalogMigration] Could not locate "${artistName}" on iTunes`);
    return [];
  }

  const resolvedName = itunesArtist.name;
  const albums = await itunesAlbums(itunesArtist.id);
  logger.info(`[CatalogMigration] iTunes returned ${albums.length} album(s) for "${resolvedName}"`);

  const releases: MigrationRelease[] = [];

  for (let ai = 0; ai < albums.length; ai++) {
    const album = albums[ai];
    const cleanTitle = album.collectionName
      .replace(/\s*-\s*(Single|EP|Album)\s*$/i, '')
      .trim();

    logger.info(`[CatalogMigration] Fallback processing ${ai + 1}/${albums.length}: "${cleanTitle}"`);

    await delay(80);
    const tracks = await itunesTracks(album.collectionId);

    const migrationTracks: MigrationTrack[] = [];
    let deezerAlbumId: number | null = null;

    for (const track of tracks) {
      await delay(120);
      const deezerHit = await deezerSearchTrack(track.trackName, resolvedName);
      if (deezerHit && !deezerAlbumId) deezerAlbumId = deezerHit.album.id;

      migrationTracks.push({
        title: track.trackName,
        artist: track.artistName || resolvedName,
        isrc: deezerHit?.isrc ?? null,
        audioFile: null,
        duration: track.trackTimeMillis ? Math.round(track.trackTimeMillis / 1000) : null,
        trackNumber: track.trackNumber,
        discNumber: track.discNumber || 1,
        explicit: track.trackExplicitness === 'explicit',
      });
    }

    let upc: string | null = null;
    if (deezerAlbumId) {
      await delay(120);
      upc = await deezerAlbumUPC(deezerAlbumId);
    }

    const isrcsCovered = migrationTracks.filter(t => t.isrc).length;
    const missingFields: string[] = [];
    if (!upc) missingFields.push('upc');
    if (isrcsCovered < migrationTracks.length) missingFields.push('isrc (partial)');
    missingFields.push('audioFile', 'label', 'copyrightOwner');

    releases.push({
      title: cleanTitle,
      artist: resolvedName,
      releaseType: 'single',
      releaseDate: album.releaseDate?.split('T')[0] ?? null,
      upc,
      artwork: album.artworkUrl100?.replace('100x100bb', '3000x3000bb') ?? null,
      genre: album.primaryGenreName || null,
      label: null,
      copyrightYear: album.releaseDate ? new Date(album.releaseDate).getFullYear() : null,
      copyrightOwner: null,
      territoryMode: 'worldwide',
      territories: [],
      platforms: ['spotify', 'apple_music', 'amazon_music', 'deezer', 'tidal', 'youtube_music', 'pandora'],
      tracks: migrationTracks,
      _meta: {
        sources: deezerAlbumId ? ['itunes', 'deezer'] : ['itunes'],
        isrcsCovered,
        totalTracks: migrationTracks.length,
        missingFields,
      },
    });
  }

  return releases;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function buildMigrationPayload(artistName: string): Promise<MigrationPayload> {
  logger.info(`[CatalogMigration] Starting catalog migration export for "${artistName}"`);

  const releases: MigrationRelease[] = [];

  // ── Step 1: Primary — LabelGrid API ──────────────────────────────────────
  logger.info('[CatalogMigration] Querying LabelGrid API for authenticated user catalog');
  const lgReleases = await labelGridService.getUserCatalog();

  if (lgReleases.length > 0) {
    logger.info(`[CatalogMigration] LabelGrid returned ${lgReleases.length} release(s) — using as primary source`);

    for (let i = 0; i < lgReleases.length; i++) {
      const lgR = lgReleases[i];
      logger.info(`[CatalogMigration] Processing LabelGrid release ${i + 1}/${lgReleases.length}: "${lgR.title}"`);
      await delay(80);
      const migrated = await hydrateLabelGridRelease(lgR);
      releases.push(migrated);
    }
  } else {
    // ── Step 2: Full fallback — iTunes + Deezer ───────────────────────────
    logger.info('[CatalogMigration] LabelGrid returned 0 releases — falling back to iTunes + Deezer');
    const fallbackReleases = await buildFromiTunesAndDeezer(artistName);
    releases.push(...fallbackReleases);
  }

  const totalTracks = releases.reduce((acc, r) => acc + r.tracks.length, 0);
  const totalIsrcs = releases.reduce((acc, r) => acc + r._meta.isrcsCovered, 0);
  const isrcCoverage = totalTracks > 0
    ? `${Math.round((totalIsrcs / totalTracks) * 100)}%`
    : '0%';

  const resolvedArtistName = releases[0]?.artist ?? artistName;

  logger.info(
    `[CatalogMigration] Complete: ${releases.length} releases, ` +
    `${totalTracks} tracks, ${isrcCoverage} ISRC coverage`
  );

  return {
    exportedAt: new Date().toISOString(),
    artistName: resolvedArtistName,
    totalReleases: releases.length,
    totalTracks,
    isrcCoverage,
    releases,
  };
}
