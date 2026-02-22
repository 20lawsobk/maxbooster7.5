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

interface PlatformSearchResults {
  spotify: SpotifyArtistResult[];
  apple: AppleArtistResult[];
  deezer: DeezerArtistResult[];
}

class ArtistProfileService {
  private spotifyToken: string | null = null;
  private spotifyTokenExpiry: number = 0;

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

  async searchAllPlatforms(query: string): Promise<PlatformSearchResults> {
    const [spotify, apple, deezer] = await Promise.allSettled([
      this.searchSpotifyArtists(query),
      this.searchAppleArtists(query),
      this.searchDeezerArtists(query),
    ]);

    return {
      spotify: spotify.status === 'fulfilled' ? spotify.value : [],
      apple: apple.status === 'fulfilled' ? apple.value : [],
      deezer: deezer.status === 'fulfilled' ? deezer.value : [],
    };
  }

  async createProfile(data: InsertArtistProfile): Promise<ArtistProfile> {
    const [profile] = await db.insert(artistProfiles).values({
      ...data,
      updatedAt: new Date(),
    }).returning();
    return profile;
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
