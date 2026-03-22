/**
 * Catalog Migration Service
 *
 * Parses an artist's public streaming-platform profiles and converts
 * the extracted metadata into LabelGrid's import format.
 *
 * Data sources (no credentials required):
 *   - Apple Music / iTunes  : album list, track order, duration, artwork, genre, release date
 *   - Deezer                : ISRC per track, UPC per album (via track search + album endpoint)
 *
 * Fields that are NOT available from public sources and are therefore
 * left null rather than invented:
 *   - audioFile (binary audio)
 *   - label
 *   - copyrightOwner
 *   - lyrics
 */

import { logger } from '../logger.js';

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
  collectionViewUrl: string;
}

interface iTunesTrackEntry {
  trackId: number;
  collectionId: number;
  trackName: string;
  trackNumber: number;
  discNumber: number;
  trackTimeMillis: number;
  trackExplicitness: string;
  primaryGenreName: string;
  artistName: string;
  collectionName: string;
  releaseDate: string;
  artworkUrl100: string;
}

interface DeezerSearchTrack {
  id: number;
  title: string;
  isrc: string | null;
  duration: number;
  explicit_lyrics: boolean;
  album: { id: number; title: string };
  artist: { name: string };
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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

// ─── iTunes helpers ───────────────────────────────────────────────────────────

async function findItunesArtistId(artistName: string): Promise<{ id: number; name: string } | null> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=album&limit=50&country=US`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json() as any;

    const idCounts: Record<number, { count: number; name: string }> = {};
    for (const item of (data.results || [])) {
      const id = item.artistId as number;
      const name = item.artistName as string;
      if (!id) continue;
      if (!idCounts[id]) idCounts[id] = { count: 0, name };
      idCounts[id].count++;
    }

    const sorted = Object.entries(idCounts).sort((a, b) => b[1].count - a[1].count);
    if (!sorted.length) return null;
    return { id: Number(sorted[0][0]), name: sorted[0][1].name };
  } catch {
    return null;
  }
}

async function fetchItunesAlbums(artistId: number): Promise<iTunesAlbumEntry[]> {
  try {
    const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=200&country=US`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data.results || []).filter((r: any) => r.wrapperType === 'collection' && r.collectionId);
  } catch {
    return [];
  }
}

async function fetchItunesTracks(collectionId: number): Promise<iTunesTrackEntry[]> {
  try {
    const url = `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200&country=US`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data.results || []).filter((r: any) => r.wrapperType === 'track');
  } catch {
    return [];
  }
}

// ─── Deezer helpers ───────────────────────────────────────────────────────────

async function searchDeezerTrack(trackTitle: string, artistName: string): Promise<DeezerSearchTrack | null> {
  try {
    const q = `track:"${trackTitle}" artist:"${artistName}"`;
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const items: DeezerSearchTrack[] = data.data || [];

    for (const item of items) {
      if (titleMatch(item.title, trackTitle)) return item;
    }
    return items[0] || null;
  } catch {
    return null;
  }
}

async function fetchDeezerAlbumUPC(deezerAlbumId: number): Promise<string | null> {
  try {
    const url = `https://api.deezer.com/album/${deezerAlbumId}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return data.upc || null;
  } catch {
    return null;
  }
}

// ─── Main migration function ──────────────────────────────────────────────────

export async function buildMigrationPayload(artistName: string): Promise<MigrationPayload> {
  logger.info(`[CatalogMigration] Starting catalog parse for "${artistName}"`);

  // Step 1 — Find iTunes artist ID
  const itunesArtist = await findItunesArtistId(artistName);
  if (!itunesArtist) {
    logger.warn(`[CatalogMigration] Could not locate "${artistName}" on iTunes`);
    return {
      exportedAt: new Date().toISOString(),
      artistName,
      totalReleases: 0,
      totalTracks: 0,
      isrcCoverage: '0%',
      releases: [],
    };
  }

  const resolvedName = itunesArtist.name;
  logger.info(`[CatalogMigration] iTunes artist resolved: "${resolvedName}" (id=${itunesArtist.id})`);

  // Step 2 — Fetch full album list from iTunes
  const albums = await fetchItunesAlbums(itunesArtist.id);
  logger.info(`[CatalogMigration] iTunes returned ${albums.length} album(s)`);

  const releases: MigrationRelease[] = [];
  let totalIsrcs = 0;
  let totalTracks = 0;

  // Step 3 — For each album, fetch track listing and enrich with Deezer ISRCs/UPC
  for (let ai = 0; ai < albums.length; ai++) {
    const album = albums[ai];
    const cleanTitle = album.collectionName
      .replace(/\s*-\s*(Single|EP|Album)\s*$/i, '')
      .trim();

    logger.info(`[CatalogMigration] Processing ${ai + 1}/${albums.length}: "${cleanTitle}"`);

    // Fetch iTunes tracks for this album
    await delay(80);
    const itunesTracks = await fetchItunesTracks(album.collectionId);

    // For each track, query Deezer for ISRC
    const migrationTracks: MigrationTrack[] = [];
    let albumDeezerAlbumId: number | null = null;

    for (const track of itunesTracks) {
      await delay(120); // respect Deezer rate limits (~5 req/s)
      const deezerTrack = await searchDeezerTrack(track.trackName, resolvedName);

      if (deezerTrack) {
        if (!albumDeezerAlbumId) albumDeezerAlbumId = deezerTrack.album.id;
        if (deezerTrack.isrc) totalIsrcs++;
      }

      migrationTracks.push({
        title: track.trackName,
        artist: track.artistName || resolvedName,
        isrc: deezerTrack?.isrc ?? null,
        audioFile: null,
        duration: track.trackTimeMillis ? Math.round(track.trackTimeMillis / 1000) : null,
        trackNumber: track.trackNumber,
        discNumber: track.discNumber || 1,
        explicit:
          track.trackExplicitness === 'explicit' ||
          (deezerTrack?.explicit_lyrics ?? false),
      });
    }

    totalTracks += migrationTracks.length;

    // Fetch Deezer album UPC if we found a Deezer album match
    let upc: string | null = null;
    if (albumDeezerAlbumId) {
      await delay(120);
      upc = await fetchDeezerAlbumUPC(albumDeezerAlbumId);
    }

    // Determine missing fields
    const missingFields: string[] = [];
    if (!upc) missingFields.push('upc');
    if (migrationTracks.some(t => !t.isrc)) missingFields.push('isrc (partial)');
    missingFields.push('audioFile', 'label', 'copyrightOwner');

    const releaseYear = album.releaseDate
      ? new Date(album.releaseDate).getFullYear()
      : null;

    releases.push({
      title: cleanTitle,
      artist: resolvedName,
      releaseDate: album.releaseDate ? album.releaseDate.split('T')[0] : null,
      upc,
      artwork: album.artworkUrl100?.replace('100x100bb', '3000x3000bb') ?? null,
      genre: album.primaryGenreName || null,
      label: null,
      copyrightYear: releaseYear,
      copyrightOwner: null,
      territoryMode: 'worldwide',
      territories: [],
      platforms: ['spotify', 'apple_music', 'amazon_music', 'deezer', 'tidal', 'youtube_music', 'pandora'],
      tracks: migrationTracks,
      _meta: {
        sources: albumDeezerAlbumId ? ['itunes', 'deezer'] : ['itunes'],
        isrcsCovered: migrationTracks.filter(t => t.isrc).length,
        totalTracks: migrationTracks.length,
        missingFields,
      },
    });
  }

  const isrcPct =
    totalTracks > 0
      ? `${Math.round((totalIsrcs / totalTracks) * 100)}%`
      : '0%';

  logger.info(
    `[CatalogMigration] Done: ${releases.length} releases, ${totalTracks} tracks, ${isrcPct} ISRC coverage`
  );

  return {
    exportedAt: new Date().toISOString(),
    artistName: resolvedName,
    totalReleases: releases.length,
    totalTracks,
    isrcCoverage: isrcPct,
    releases,
  };
}
