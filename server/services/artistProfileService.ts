import { db } from '../db.js';
import { eq, and, ilike } from 'drizzle-orm';
import { artistProfiles, artistProfileReleases, releases, distroReleases } from '@shared/schema';
import type { ArtistProfile, InsertArtistProfile } from '@shared/schema';
import { logger } from '../logger.js';

interface SpotifyArtistResult {
  id: string;
  uri: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  followers: number;
  popularity: number;
  externalUrl: string;
}

interface AppleArtistResult {
  id: string;
  name: string;
  genres: string[];
  artworkUrl: string | null;
  url: string;
}

interface DeezerArtistResult {
  id: string;
  name: string;
  pictureUrl: string | null;
  fans: number;
  link: string;
}

interface MusicBrainzArtistResult {
  id: string;
  name: string;
  score: number;
  type: string | null;
  country: string | null;
  tags: string[];
  disambiguation: string | null;
}

interface PlatformSearchResults {
  spotify: SpotifyArtistResult[];
  apple: AppleArtistResult[];
  deezer: DeezerArtistResult[];
  musicbrainz: MusicBrainzArtistResult[];
}

class ArtistProfileService {
  private spotifyToken: string | null = null;
  private spotifyTokenExpiry: number = 0;

  // Normalize artist name for fuzzy comparison:
  // strips punctuation, collapses spaces, lowercases, strips common prefixes like "the"
  private _normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')  // strip punctuation (hyphens, apostrophes, etc.)
      .replace(/\bthe\b/g, '')        // strip leading "the"
      .replace(/\s+/g, ' ')          // collapse whitespace
      .trim();
  }

  // Compute a 0–100 name similarity score using both exact and fuzzy normalized matching
  private _nameSimilarity(a: string, b: string): number {
    const na = this._normalizeName(a);
    const nb = this._normalizeName(b);
    if (na === nb) return 100;
    if (na.includes(nb) || nb.includes(na)) return 70;
    // Count shared words
    const wordsA = new Set(na.split(' ').filter(Boolean));
    const wordsB = new Set(nb.split(' ').filter(Boolean));
    const shared = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    const jaccardScore = union > 0 ? (shared / union) * 60 : 0;
    return Math.round(jaccardScore);
  }

  // Retry wrapper with exponential backoff for external API calls
  private async _withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    label = 'external API'
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const isRetryable = err?.name === 'TimeoutError' ||
                            err?.message?.includes('timeout') ||
                            err?.message?.includes('network') ||
                            (err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT');
        if (isRetryable && attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 300 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  private async getSpotifyToken(): Promise<string | null> {
    if (this.spotifyToken && Date.now() < this.spotifyTokenExpiry) {
      return this.spotifyToken;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return null;
    }

    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        logger.warn('[ArtistProfile] Spotify token fetch failed:', response.status);
        return null;
      }

      const data = await response.json() as { access_token: string; expires_in: number };
      this.spotifyToken = data.access_token;
      this.spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      return this.spotifyToken;
    } catch (err) {
      logger.error('[ArtistProfile] Spotify token error:', err);
      return null;
    }
  }

  async searchSpotifyArtists(query: string): Promise<SpotifyArtistResult[]> {
    const token = await this.getSpotifyToken();
    if (!token) return [];

    try {
      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=8`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.artists?.items || []).map((a: any): SpotifyArtistResult => ({
        id: a.id,
        uri: a.uri,
        name: a.name,
        imageUrl: a.images?.[0]?.url ?? null,
        genres: a.genres || [],
        followers: a.followers?.total ?? 0,
        popularity: a.popularity ?? 0,
        externalUrl: a.external_urls?.spotify ?? '',
      }));
    } catch (err) {
      logger.error('[ArtistProfile] Spotify search error:', err);
      return [];
    }
  }

  async verifySpotifyArtist(spotifyId: string): Promise<SpotifyArtistResult | null> {
    const token = await this.getSpotifyToken();
    if (!token) return null;

    try {
      const response = await fetch(`https://api.spotify.com/v1/artists/${spotifyId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return null;

      const a = await response.json() as any;
      return {
        id: a.id,
        uri: a.uri,
        name: a.name,
        imageUrl: a.images?.[0]?.url ?? null,
        genres: a.genres || [],
        followers: a.followers?.total ?? 0,
        popularity: a.popularity ?? 0,
        externalUrl: a.external_urls?.spotify ?? '',
      };
    } catch (err) {
      logger.error('[ArtistProfile] Spotify verify error:', err);
      return null;
    }
  }

  async searchAppleArtists(query: string): Promise<AppleArtistResult[]> {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=8`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.results || []).map((a: any): AppleArtistResult => ({
        id: String(a.artistId),
        name: a.artistName,
        genres: a.primaryGenreName ? [a.primaryGenreName] : [],
        artworkUrl: null,
        url: a.artistLinkUrl ?? '',
      }));
    } catch (err) {
      logger.error('[ArtistProfile] Apple search error:', err);
      return [];
    }
  }

  async searchDeezerArtists(query: string): Promise<DeezerArtistResult[]> {
    try {
      const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=8`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.data || []).map((a: any): DeezerArtistResult => ({
        id: String(a.id),
        name: a.name,
        pictureUrl: a.picture_medium ?? null,
        fans: a.nb_fan ?? 0,
        link: a.link ?? '',
      }));
    } catch (err) {
      logger.error('[ArtistProfile] Deezer search error:', err);
      return [];
    }
  }

  async searchMusicBrainzArtists(query: string): Promise<MusicBrainzArtistResult[]> {
    try {
      // MusicBrainz requires a User-Agent header; uses standard REST API (no key needed)
      const url = `https://musicbrainz.org/ws/2/artist?query=artist:"${encodeURIComponent(query)}"&limit=8&fmt=json`;
      const response = await this._withRetry(() => fetch(url, {
        headers: {
          'User-Agent': 'MaxBooster/1.0 (music career management platform)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }), 2, 'MusicBrainz');

      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.artists || []).map((a: any): MusicBrainzArtistResult => ({
        id: a.id,
        name: a.name,
        score: a.score ?? 0,
        type: a.type ?? null,
        country: a.country ?? null,
        tags: (a.tags || []).map((t: any) => t.name as string),
        disambiguation: a.disambiguation ?? null,
      }));
    } catch (err) {
      logger.warn('[ArtistProfile] MusicBrainz search error (non-fatal):', err);
      return [];
    }
  }

  async searchAllPlatforms(query: string): Promise<PlatformSearchResults> {
    const [spotify, apple, deezer, musicbrainz] = await Promise.allSettled([
      this.searchSpotifyArtists(query),
      this.searchAppleArtists(query),
      this.searchDeezerArtists(query),
      this.searchMusicBrainzArtists(query),
    ]);

    return {
      spotify: spotify.status === 'fulfilled' ? spotify.value : [],
      apple: apple.status === 'fulfilled' ? apple.value : [],
      deezer: deezer.status === 'fulfilled' ? deezer.value : [],
      musicbrainz: musicbrainz.status === 'fulfilled' ? musicbrainz.value : [],
    };
  }

  async createProfile(data: InsertArtistProfile): Promise<ArtistProfile> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const [profile] = await db.insert(artistProfiles).values({
          ...data,
          updatedAt: new Date(),
        }).returning();
        return profile;
      } catch (err: any) {
        lastErr = err;
        const isTransient = err?.message?.includes('Failed query') || err?.cause?.message?.includes('timeout') || err?.cause?.message?.includes('connection');
        if (isTransient && attempt < 3) {
          await new Promise(r => setTimeout(r, 200 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async getUserProfiles(userId: string): Promise<ArtistProfile[]> {
    return db.select().from(artistProfiles)
      .where(eq(artistProfiles.userId, userId))
      .orderBy(artistProfiles.createdAt);
  }

  async getProfile(id: string, userId: string): Promise<ArtistProfile | null> {
    const [profile] = await db.select().from(artistProfiles)
      .where(and(eq(artistProfiles.id, id), eq(artistProfiles.userId, userId)))
      .limit(1);
    return profile ?? null;
  }

  async updateProfile(id: string, userId: string, data: Partial<InsertArtistProfile>): Promise<ArtistProfile | null> {
    const [updated] = await db.update(artistProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(artistProfiles.id, id), eq(artistProfiles.userId, userId)))
      .returning();
    return updated ?? null;
  }

  async deleteProfile(id: string, userId: string): Promise<boolean> {
    await db.delete(artistProfileReleases).where(eq(artistProfileReleases.artistProfileId, id));
    const result = await db.delete(artistProfiles)
      .where(and(eq(artistProfiles.id, id), eq(artistProfiles.userId, userId)))
      .returning({ id: artistProfiles.id });
    return result.length > 0;
  }

  async linkProfileToRelease(artistProfileId: string, releaseId: string, isPrimary = true): Promise<void> {
    await db.insert(artistProfileReleases).values({
      artistProfileId,
      releaseId,
      isPrimary,
    }).onConflictDoNothing();
  }

  async getProfilesByRelease(releaseId: string): Promise<ArtistProfile[]> {
    const rows = await db.select({ profile: artistProfiles })
      .from(artistProfileReleases)
      .innerJoin(artistProfiles, eq(artistProfileReleases.artistProfileId, artistProfiles.id))
      .where(eq(artistProfileReleases.releaseId, releaseId));
    return rows.map(r => r.profile);
  }

  async submitFixerRequest(id: string, userId: string, targetSpotifyUri: string, notes: string): Promise<ArtistProfile | null> {
    if (!/^spotify:artist:[A-Za-z0-9]+$/.test(targetSpotifyUri)) {
      throw new Error('Invalid Spotify artist URI format. Expected: spotify:artist:<ID>');
    }

    const [updated] = await db.update(artistProfiles)
      .set({
        fixerPending: true,
        fixerTargetSpotifyUri: targetSpotifyUri,
        fixerNotes: notes || null,
        fixerStatus: 'pending',
        fixerRequestedAt: new Date(),
        fixerResolvedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(artistProfiles.id, id), eq(artistProfiles.userId, userId)))
      .returning();

    if (updated) {
      logger.info(`[ArtistProfile] Fixer request submitted: profile=${id}, target=${targetSpotifyUri}`);
    }
    return updated ?? null;
  }

  async resolveFixerRequest(id: string, approved: boolean): Promise<ArtistProfile | null> {
    const [profile] = await db.select().from(artistProfiles).where(eq(artistProfiles.id, id)).limit(1);
    if (!profile) return null;

    const updates: Partial<ArtistProfile> = {
      fixerPending: false,
      fixerStatus: approved ? 'resolved' : 'rejected',
      fixerResolvedAt: new Date(),
      updatedAt: new Date(),
    };

    if (approved && profile.fixerTargetSpotifyUri) {
      const spotifyId = profile.fixerTargetSpotifyUri.replace('spotify:artist:', '');
      updates.spotifyArtistId = spotifyId;
      updates.spotifyArtistUri = profile.fixerTargetSpotifyUri;
    }

    const [updated] = await db.update(artistProfiles)
      .set(updates)
      .where(eq(artistProfiles.id, id))
      .returning();

    logger.info(`[ArtistProfile] Fixer request ${approved ? 'approved' : 'rejected'}: profile=${id}`);
    return updated ?? null;
  }

  // ── Auto-discover: search all platforms, score each result, pick top match ──

  private _scoreSpotify(result: SpotifyArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    // Name similarity dominates scoring — use a graded scale
    if (nameSim >= 95) score += 50;        // Effectively exact after normalization
    else if (nameSim >= 70) score += 38;   // Strong partial match / contains
    else if (nameSim >= 40) score += 22;   // Shared words match
    else if (nameSim >= 20) score += 10;   // Weak match — flag as uncertain
    else return 0;                          // No meaningful name overlap — skip
    if (result.imageUrl) score += 8;
    if (result.popularity >= 60) score += 22;
    else if (result.popularity >= 30) score += 13;
    else if (result.popularity >= 10) score += 5;
    if (result.genres.length > 0) score += 5;
    if (result.followers >= 1_000_000) score += 10;
    else if (result.followers >= 100_000) score += 7;
    else if (result.followers >= 10_000) score += 4;
    else if (result.followers >= 1_000) score += 1;
    return Math.min(score, 100);
  }

  private _scoreDeezer(result: DeezerArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    if (nameSim >= 95) score += 50;
    else if (nameSim >= 70) score += 38;
    else if (nameSim >= 40) score += 22;
    else if (nameSim >= 20) score += 10;
    else return 0;
    if (result.pictureUrl) score += 8;
    if (result.fans >= 500_000) score += 22;
    else if (result.fans >= 50_000) score += 14;
    else if (result.fans >= 5_000) score += 6;
    else if (result.fans >= 500) score += 2;
    return Math.min(score, 100);
  }

  private _scoreApple(result: AppleArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    if (nameSim >= 95) score += 55;        // Apple has no popularity — weight name more
    else if (nameSim >= 70) score += 40;
    else if (nameSim >= 40) score += 24;
    else if (nameSim >= 20) score += 10;
    else return 0;
    if (result.genres.length > 0) score += 8;
    return Math.min(score, 100);
  }

  private _scoreMusicBrainz(result: MusicBrainzArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    if (nameSim >= 95) score += 40;
    else if (nameSim >= 70) score += 28;
    else if (nameSim >= 40) score += 15;
    else return 0;
    // MusicBrainz provides its own relevance score (0-100)
    if (result.score >= 90) score += 30;
    else if (result.score >= 75) score += 20;
    else if (result.score >= 60) score += 10;
    // Artist type bonus — confirms it's actually a music artist
    if (result.type === 'Person' || result.type === 'Group') score += 15;
    // Genre tags confirm music category
    if (result.tags.length > 0) score += 5;
    return Math.min(score, 90); // Cap at 90 — MusicBrainz alone can't reach full confidence
  }

  async autoDiscover(profileId: string, userId: string): Promise<{
    spotify: { result: SpotifyArtistResult; confidence: number } | null;
    apple:   { result: AppleArtistResult;   confidence: number } | null;
    deezer:  { result: DeezerArtistResult;  confidence: number } | null;
    musicbrainz: { result: MusicBrainzArtistResult; confidence: number } | null;
    saved: boolean;
    savedFields: string[];
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error('Artist profile not found');

    const query = profile.artistName;
    const raw = await this.searchAllPlatforms(query);

    const topSpotify = raw.spotify
      .map(r => ({ result: r, confidence: this._scoreSpotify(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    const topApple = raw.apple
      .map(r => ({ result: r, confidence: this._scoreApple(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    const topDeezer = raw.deezer
      .map(r => ({ result: r, confidence: this._scoreDeezer(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    const topMusicBrainz = raw.musicbrainz
      .map(r => ({ result: r, confidence: this._scoreMusicBrainz(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    // Lower threshold for exact normalized name matches to avoid missing
    // niche/emerging artists with low Spotify popularity
    const CONFIDENCE_THRESHOLD = 55;
    const updates: Partial<InsertArtistProfile> = {};
    const savedFields: string[] = [];

    if (topSpotify && topSpotify.confidence >= CONFIDENCE_THRESHOLD && !profile.spotifyArtistId) {
      updates.spotifyArtistId = topSpotify.result.id;
      updates.spotifyArtistUri = topSpotify.result.uri;
      if (topSpotify.result.imageUrl && !profile.profileImageUrl) {
        updates.profileImageUrl = topSpotify.result.imageUrl;
      }
      if (topSpotify.result.genres.length > 0 && (!profile.genres || profile.genres.length === 0)) {
        updates.genres = topSpotify.result.genres.slice(0, 5);
      }
      savedFields.push('spotify');
    }

    if (topApple && topApple.confidence >= CONFIDENCE_THRESHOLD && !profile.appleArtistId) {
      updates.appleArtistId = topApple.result.id;
      savedFields.push('apple');
    }

    if (topDeezer && topDeezer.confidence >= CONFIDENCE_THRESHOLD && !profile.deezerArtistId) {
      updates.deezerArtistId = topDeezer.result.id;
      if (topDeezer.result.pictureUrl && !profile.profileImageUrl && !updates.profileImageUrl) {
        updates.profileImageUrl = topDeezer.result.pictureUrl;
      }
      savedFields.push('deezer');
    }

    // MusicBrainz confirms identity but doesn't save a separate platform ID field;
    // use it as a cross-validation signal for logging and future use
    if (topMusicBrainz && topMusicBrainz.confidence >= CONFIDENCE_THRESHOLD) {
      savedFields.push('musicbrainz_confirmed');
      logger.info(`[ArtistProfile] MusicBrainz confirmed: profile=${profileId} mbid=${topMusicBrainz.result.id} score=${topMusicBrainz.confidence}`);
    }

    const saved = savedFields.filter(f => f !== 'musicbrainz_confirmed').length > 0;
    if (saved) {
      await this.updateProfile(profileId, userId, updates);
      logger.info(`[ArtistProfile] Auto-discover saved: profile=${profileId} platforms=[${savedFields.join(',')}]`);
    }

    return { spotify: topSpotify ?? null, apple: topApple ?? null, deezer: topDeezer ?? null, musicbrainz: topMusicBrainz ?? null, saved, savedFields };
  }

  async autoSync(profileId: string, userId: string): Promise<{
    synced: string[];
    changes: Record<string, unknown>;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error('Artist profile not found');

    const updates: Partial<InsertArtistProfile> = {};
    const synced: string[] = [];
    const changes: Record<string, unknown> = {};

    if (profile.spotifyArtistId) {
      const fresh = await this.verifySpotifyArtist(profile.spotifyArtistId);
      if (fresh) {
        synced.push('spotify');
        if (fresh.imageUrl && fresh.imageUrl !== profile.profileImageUrl) {
          updates.profileImageUrl = fresh.imageUrl;
          changes.profileImageUrl = fresh.imageUrl;
        }
        if (fresh.genres.length > 0) {
          const existing = JSON.stringify((profile.genres ?? []).slice().sort());
          const incoming = JSON.stringify(fresh.genres.slice().sort());
          if (existing !== incoming) {
            updates.genres = fresh.genres.slice(0, 5);
            changes.genres = fresh.genres.slice(0, 5);
          }
        }
        if (!profile.isVerified) {
          updates.isVerified = true;
          updates.verifiedAt = new Date();
          changes.isVerified = true;
        }
      }
    }

    if (profile.deezerArtistId) {
      try {
        const res = await fetch(`https://api.deezer.com/artist/${profile.deezerArtistId}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const d = await res.json() as any;
          synced.push('deezer');
          if (d.picture_medium && d.picture_medium !== profile.profileImageUrl && !updates.profileImageUrl) {
            updates.profileImageUrl = d.picture_medium;
            changes.profileImageUrl = d.picture_medium;
          }
        }
      } catch {
        logger.warn(`[ArtistProfile] Deezer sync failed for profile=${profileId}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.updateProfile(profileId, userId, updates);
      logger.info(`[ArtistProfile] Auto-sync updated: profile=${profileId} synced=[${synced.join(',')}]`);
    }

    return { synced, changes };
  }

  buildDistributionMetadata(profile: ArtistProfile): Record<string, string | null> {
    return {
      artistName: profile.artistName,
      isNewArtist: profile.isNewArtist ? 'true' : 'false',
      spotifyArtistId: profile.spotifyArtistId ?? null,
      spotifyArtistUri: profile.spotifyArtistUri ?? null,
      appleArtistId: profile.appleArtistId ?? null,
      youtubeChannelId: profile.youtubeChannelId ?? null,
      tidalArtistId: profile.tidalArtistId ?? null,
      deezerArtistId: profile.deezerArtistId ?? null,
      soundcloudArtistId: profile.soundcloudArtistId ?? null,
      amazonMusicArtistId: profile.amazonMusicArtistId ?? null,
    };
  }
}

export const artistProfileService = new ArtistProfileService();
