import { storage } from '../storage';
import { logger } from '../logger';
import { z } from 'zod';
import { createHash } from 'crypto';
import { CircuitBreaker, CircuitBreakerRegistry } from '../services/circuitBreaker';

export const SUPPORTED_DISTRIBUTORS = [
  { id: 'distrokid', name: 'DistroKid', importFormat: 'csv', exportUrl: 'https://distrokid.com/stats/' },
  { id: 'tunecore', name: 'TuneCore', importFormat: 'csv', exportUrl: 'https://www.tunecore.com/dashboard' },
  { id: 'cdbaby', name: 'CD Baby', importFormat: 'csv', exportUrl: 'https://members.cdbaby.com/' },
  { id: 'landr', name: 'LANDR', importFormat: 'csv', exportUrl: 'https://app.landr.com/distribution' },
  { id: 'ditto', name: 'Ditto Music', importFormat: 'csv', exportUrl: 'https://members.dittomusic.com/' },
  { id: 'amuse', name: 'Amuse', importFormat: 'csv', exportUrl: 'https://artists.amuse.io/' },
  { id: 'unitedmasters', name: 'UnitedMasters', importFormat: 'csv', exportUrl: 'https://unitedmasters.com/dashboard' },
  { id: 'onerpm', name: 'ONErpm', importFormat: 'csv', exportUrl: 'https://onerpm.com/' },
  { id: 'routenote', name: 'RouteNote', importFormat: 'csv', exportUrl: 'https://routenote.com/account/' },
  { id: 'believe', name: 'Believe Distribution', importFormat: 'csv', exportUrl: 'https://backstage.believe.com/' },
  { id: 'symphonic', name: 'Symphonic Distribution', importFormat: 'csv', exportUrl: 'https://portal.symphonic.com/' },
  { id: 'repost', name: 'Repost by SoundCloud', importFormat: 'csv', exportUrl: 'https://repostnetwork.com/' },
  { id: 'manual', name: 'Manual Entry', importFormat: 'manual', exportUrl: null },
] as const;

export const STREAMING_PLATFORMS = [
  { id: 'spotify', name: 'Spotify', profileType: 'spotify_artist_id', apiSupported: true, syncMethod: 'api' as const },
  { id: 'apple_music', name: 'Apple Music', profileType: 'apple_artist_id', apiSupported: true, syncMethod: 'api' as const },
  { id: 'amazon_music', name: 'Amazon Music', profileType: 'amazon_artist_asin', apiSupported: true, syncMethod: 'manual' as const },
  { id: 'youtube_music', name: 'YouTube Music', profileType: 'youtube_channel_id', apiSupported: true, syncMethod: 'api' as const },
  { id: 'deezer', name: 'Deezer', profileType: 'deezer_artist_id', apiSupported: true, syncMethod: 'api' as const },
  { id: 'tidal', name: 'Tidal', profileType: 'tidal_artist_id', apiSupported: true, syncMethod: 'api' as const },
  { id: 'soundcloud', name: 'SoundCloud', profileType: 'soundcloud_permalink', apiSupported: true, syncMethod: 'api' as const },
  { id: 'bandcamp', name: 'Bandcamp', profileType: 'bandcamp_url', apiSupported: true, syncMethod: 'scrape' as const },
  { id: 'audiomack', name: 'Audiomack', profileType: 'audiomack_url', apiSupported: true, syncMethod: 'api' as const },
  { id: 'beatport', name: 'Beatport', profileType: 'beatport_artist_id', apiSupported: true, syncMethod: 'manual' as const },
] as const;

export interface ImportedRelease {
  title: string;
  artistName: string;
  releaseType: 'single' | 'EP' | 'album';
  releaseDate: string | null;
  upc?: string;
  isrc?: string;
  genre?: string;
  label?: string;
  tracks: ImportedTrack[];
  platformLinks?: Record<string, string>;
  originalDistributor: string;
  streamingStats?: {
    totalStreams?: number;
    monthlyListeners?: number;
    platforms?: Record<string, { streams: number; revenue: number }>;
  };
}

export interface ImportedTrack {
  title: string;
  trackNumber: number;
  isrc?: string;
  duration?: number;
  explicit?: boolean;
  contributors?: Array<{ name: string; role: string }>;
}

export interface StreamingProfileData {
  platformId: string;
  artistId: string;
  artistName: string;
  profileUrl: string;
  verified: boolean;
  followers?: number;
  monthlyListeners?: number;
  totalStreams?: number;
  topTracks?: Array<{ title: string; streams: number; isrc?: string }>;
  topCities?: Array<{ city: string; country: string; listeners: number }>;
  genres?: string[];
  imageUrl?: string;
  bio?: string;
  socialLinks?: Record<string, string>;
  lastSyncedAt?: string;
  lastSyncStatus?: 'success' | 'failed' | 'partial';
  lastSyncMethod?: 'auto' | 'manual' | 'api';
  syncCount?: number;
  consecutiveFailures?: number;
  autoSyncEnabled?: boolean;
}

export interface ScannedRelease {
  id: string;
  title: string;
  artistName: string;
  releaseType: 'single' | 'EP' | 'album';
  releaseDate: string | null;
  trackCount: number;
  coverUrl?: string;
  platformUrl?: string;
  platformId: string;
  externalId: string;
  upc?: string;
  genre?: string;
  tracks?: Array<{
    title: string;
    trackNumber: number;
    isrc?: string;
    duration?: number;
  }>;
}

export interface DataTransferJob {
  id: string;
  userId: string;
  type: 'import' | 'sync';
  source: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  progress: number;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  errors: Array<{ item: string; error: string }>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  result?: {
    importedReleases?: number;
    syncedProfiles?: number;
    totalStreams?: number;
    linkedPlatforms?: string[];
  };
}

interface SyncResult {
  platformId: string;
  status: 'success' | 'failed';
  error?: string;
  timestamp: string;
}

interface SyncHistoryEntry {
  syncId: string;
  userId: string;
  timestamp: string;
  method: 'auto' | 'manual';
  results: SyncResult[];
  summary: { total: number; succeeded: number; failed: number };
}

interface AutoSyncState {
  interval: NodeJS.Timeout;
  intervalMinutes: number;
  startedAt: string;
  lastSyncAt?: string;
}

const importedReleaseSchema = z.object({
  title: z.string().min(1),
  artistName: z.string().min(1),
  releaseType: z.enum(['single', 'EP', 'album']).default('single'),
  releaseDate: z.string().nullable().optional(),
  upc: z.string().optional(),
  genre: z.string().optional(),
  label: z.string().optional(),
  tracks: z.array(z.object({
    title: z.string(),
    trackNumber: z.number().int().positive(),
    isrc: z.string().optional(),
    duration: z.number().optional(),
    explicit: z.boolean().optional(),
  })).default([]),
  platformLinks: z.record(z.string()).optional(),
  originalDistributor: z.string(),
});

function deterministicNumber(seed: string, max: number): number {
  const hash = createHash('sha256').update(seed).digest('hex');
  const value = parseInt(hash.substring(0, 8), 16);
  return value % max;
}

class DistributionDataTransferService {
  private jobs: Map<string, DataTransferJob> = new Map();
  private linkedProfiles: Map<string, Map<string, StreamingProfileData>> = new Map();
  private autoSyncStates: Map<string, AutoSyncState> = new Map();
  private syncHistory: Map<string, SyncHistoryEntry[]> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private spotifyTokenCache: { token: string; expiresAt: number } | null = null;
  private readonly registry = CircuitBreakerRegistry.getInstance();

  constructor() {
    logger.info('[DataTransfer] Distribution data transfer service initialized');
    this.initCircuitBreakers();
  }

  private initCircuitBreakers(): void {
    const platforms = ['spotify', 'apple_music', 'youtube_music', 'deezer', 'soundcloud', 'tidal', 'bandcamp', 'audiomack'];
    for (const platform of platforms) {
      const breaker = new CircuitBreaker({
        name: `streaming-${platform}`,
        failureThreshold: 3,
        resetTimeout: 60000,
        monitorInterval: 30000,
        timeout: 15000,
        successThreshold: 2,
      });
      this.circuitBreakers.set(platform, breaker);
      this.registry.register(breaker);
    }
  }

  private getCircuitBreaker(platformId: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(platformId);
  }

  getSupportedDistributors() {
    return SUPPORTED_DISTRIBUTORS;
  }

  getSupportedPlatforms() {
    return STREAMING_PLATFORMS;
  }

  async createTransferJob(userId: string, type: 'import' | 'sync', source: string): Promise<DataTransferJob> {
    const jobId = `transfer_${Date.now()}_${createHash('md5').update(`${userId}-${Date.now()}`).digest('hex').substring(0, 7)}`;
    
    const job: DataTransferJob = {
      id: jobId,
      userId,
      type,
      source,
      status: 'pending',
      progress: 0,
      totalItems: 0,
      processedItems: 0,
      successItems: 0,
      failedItems: 0,
      errors: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.jobs.set(jobId, job);
    logger.info(`[DataTransfer] Created ${type} job ${jobId} for user ${userId} from ${source}`);
    
    return job;
  }

  async getTransferJob(jobId: string): Promise<DataTransferJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async getUserTransferJobs(userId: string): Promise<DataTransferJob[]> {
    const userJobs: DataTransferJob[] = [];
    this.jobs.forEach(job => {
      if (job.userId === userId) {
        userJobs.push(job);
      }
    });
    return userJobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async parseDistributorCSV(csvContent: string, distributor: string): Promise<ImportedRelease[]> {
    const releases: ImportedRelease[] = [];
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    
    const columnMappings: Record<string, Record<string, string>> = {
      distrokid: {
        title: 'title',
        artist: 'artist',
        album: 'album',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'date',
        streams: 'streams',
        revenue: 'earnings',
      },
      tunecore: {
        title: 'song name',
        artist: 'artist name',
        album: 'album name',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'release date',
        streams: 'streams',
        revenue: 'net earnings',
      },
      cdbaby: {
        title: 'track title',
        artist: 'artist',
        album: 'album title',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'date',
        streams: 'units',
        revenue: 'earnings',
      },
      landr: {
        title: 'track',
        artist: 'artist',
        album: 'release',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'release date',
        streams: 'streams',
        revenue: 'revenue',
      },
      ditto: {
        title: 'track title',
        artist: 'artist name',
        album: 'release title',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'release date',
        streams: 'streams',
        revenue: 'earnings',
      },
      amuse: {
        title: 'track',
        artist: 'artist',
        album: 'album',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'date',
        streams: 'streams',
        revenue: 'revenue',
      },
      unitedmasters: {
        title: 'song',
        artist: 'artist',
        album: 'project',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'release date',
        streams: 'plays',
        revenue: 'earnings',
      },
      onerpm: {
        title: 'track title',
        artist: 'artist',
        album: 'album title',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'release date',
        streams: 'quantity',
        revenue: 'net revenue',
      },
      routenote: {
        title: 'title',
        artist: 'artist',
        album: 'release',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'date',
        streams: 'streams',
        revenue: 'net revenue',
      },
      believe: {
        title: 'track name',
        artist: 'main artist',
        album: 'album name',
        upc: 'ean/upc',
        isrc: 'isrc',
        release_date: 'sale start date',
        streams: 'streams',
        revenue: 'net revenue',
      },
      symphonic: {
        title: 'track',
        artist: 'artist',
        album: 'album',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'release date',
        streams: 'units',
        revenue: 'net revenue',
      },
      repost: {
        title: 'track title',
        artist: 'artist',
        album: 'release',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'date',
        streams: 'plays',
        revenue: 'revenue',
      },
      default: {
        title: 'title',
        artist: 'artist',
        album: 'album',
        upc: 'upc',
        isrc: 'isrc',
        release_date: 'release_date',
        streams: 'streams',
        revenue: 'revenue',
      },
    };
    
    const mapping = columnMappings[distributor] || columnMappings.default;
    
    const findColumnIndex = (targetName: string): number => {
      const normalizedTarget = targetName.toLowerCase();
      return headers.findIndex(h => h.includes(normalizedTarget) || normalizedTarget.includes(h));
    };
    
    const columnIndices: Record<string, number> = {};
    for (const [key, value] of Object.entries(mapping)) {
      columnIndices[key] = findColumnIndex(value);
    }
    
    const releaseMap = new Map<string, ImportedRelease>();
    
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      
      const getValue = (key: string): string => {
        const idx = columnIndices[key];
        return idx >= 0 && idx < values.length ? values[idx].replace(/['"]/g, '').trim() : '';
      };
      
      const title = getValue('title');
      const artistName = getValue('artist');
      const albumTitle = getValue('album') || title;
      
      if (!title || !artistName) continue;
      
      const releaseKey = `${artistName.toLowerCase()}_${albumTitle.toLowerCase()}`;
      
      if (!releaseMap.has(releaseKey)) {
        releaseMap.set(releaseKey, {
          title: albumTitle,
          artistName,
          releaseType: 'single',
          releaseDate: getValue('release_date') || null,
          upc: getValue('upc') || undefined,
          genre: undefined,
          tracks: [],
          originalDistributor: distributor,
          streamingStats: {
            totalStreams: 0,
            platforms: {},
          },
        });
      }
      
      const release = releaseMap.get(releaseKey)!;
      
      release.tracks.push({
        title,
        trackNumber: release.tracks.length + 1,
        isrc: getValue('isrc') || undefined,
        explicit: false,
      });
      
      const streams = parseInt(getValue('streams')) || 0;
      if (release.streamingStats) {
        release.streamingStats.totalStreams = (release.streamingStats.totalStreams || 0) + streams;
      }
      
      if (release.tracks.length > 1 && release.tracks.length <= 6) {
        release.releaseType = 'EP';
      } else if (release.tracks.length > 6) {
        release.releaseType = 'album';
      }
    }
    
    return Array.from(releaseMap.values());
  }

  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    return values;
  }

  async importFromDistributor(
    userId: string,
    distributor: string,
    csvContent: string
  ): Promise<DataTransferJob> {
    const job = await this.createTransferJob(userId, 'import', distributor);
    
    try {
      job.status = 'processing';
      job.updatedAt = new Date();
      
      const releases = await this.parseDistributorCSV(csvContent, distributor);
      job.totalItems = releases.length;
      
      let imported = 0;
      let failed = 0;
      
      for (const release of releases) {
        try {
          const validated = importedReleaseSchema.parse(release);
          
          const existingRelease = await this.findExistingRelease(userId, validated.upc, validated.title, validated.artistName);
          
          if (existingRelease) {
            await this.mergeReleaseData(existingRelease.id, release);
            logger.info(`[DataTransfer] Merged release: ${release.title}`);
          } else {
            await storage.createDistroRelease({
              artistId: userId,
              title: validated.title,
              releaseDate: validated.releaseDate ? new Date(validated.releaseDate) : null,
              metadata: {
                artistName: validated.artistName,
                releaseType: validated.releaseType,
                primaryGenre: validated.genre || 'Other',
                language: 'en',
                copyrightYear: new Date().getFullYear(),
                copyrightOwner: validated.artistName,
                labelName: validated.label,
                upc: validated.upc,
                importedFrom: distributor,
                originalPlatformLinks: validated.platformLinks,
                streamingStats: release.streamingStats,
                isImported: true,
                importedAt: new Date().toISOString(),
              },
            });
            
            logger.info(`[DataTransfer] Imported release: ${release.title}`);
          }
          
          imported++;
          job.successItems = imported;
        } catch (err: any) {
          failed++;
          job.failedItems = failed;
          job.errors.push({
            item: release.title,
            error: err.message || 'Unknown error',
          });
          logger.error(`[DataTransfer] Failed to import release ${release.title}:`, err);
        }
        
        job.processedItems = imported + failed;
        job.progress = Math.round((job.processedItems / job.totalItems) * 100);
        job.updatedAt = new Date();
      }
      
      job.status = failed === 0 ? 'completed' : (imported > 0 ? 'partial' : 'failed');
      job.completedAt = new Date();
      job.result = {
        importedReleases: imported,
        totalStreams: releases.reduce((sum, r) => sum + (r.streamingStats?.totalStreams || 0), 0),
      };
      
      logger.info(`[DataTransfer] Import job ${job.id} completed: ${imported} imported, ${failed} failed`);
      
    } catch (error: any) {
      job.status = 'failed';
      job.errors.push({ item: 'CSV parsing', error: error.message });
      logger.error(`[DataTransfer] Import job ${job.id} failed:`, error);
    }
    
    return job;
  }

  private async findExistingRelease(userId: string, upc?: string, title?: string, artistName?: string): Promise<any | null> {
    const releases = await storage.getDistroReleasesByArtist(userId);
    
    for (const release of releases) {
      const metadata = release.metadata as any;
      
      if (upc && metadata?.upc === upc) {
        return release;
      }
      
      if (title && artistName) {
        const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedReleaseTitle = release.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedArtist = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedReleaseArtist = (metadata?.artistName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (normalizedTitle === normalizedReleaseTitle && normalizedArtist === normalizedReleaseArtist) {
          return release;
        }
      }
    }
    
    return null;
  }

  private async mergeReleaseData(releaseId: string, importedData: ImportedRelease): Promise<void> {
    const release = await storage.getDistroRelease(releaseId);
    if (!release) return;
    
    const existingMetadata = release.metadata as any;
    
    const mergedMetadata = {
      ...existingMetadata,
      importedFrom: importedData.originalDistributor,
      mergedAt: new Date().toISOString(),
      originalPlatformLinks: {
        ...(existingMetadata.originalPlatformLinks || {}),
        ...(importedData.platformLinks || {}),
      },
      streamingStats: {
        totalStreams: Math.max(
          existingMetadata.streamingStats?.totalStreams || 0,
          importedData.streamingStats?.totalStreams || 0
        ),
        platforms: {
          ...(existingMetadata.streamingStats?.platforms || {}),
          ...(importedData.streamingStats?.platforms || {}),
        },
      },
    };
    
    if (importedData.upc && !existingMetadata.upc) {
      mergedMetadata.upc = importedData.upc;
    }
    
    await storage.updateDistroRelease(releaseId, {
      metadata: mergedMetadata,
    });
  }

  async linkStreamingProfile(
    userId: string,
    platformId: string,
    profileUrl: string,
    profileData?: Partial<StreamingProfileData>
  ): Promise<StreamingProfileData> {
    const platform = STREAMING_PLATFORMS.find(p => p.id === platformId);
    if (!platform) {
      throw new Error(`Unsupported platform: ${platformId}`);
    }
    
    const artistId = this.extractArtistIdFromUrl(platformId, profileUrl);
    
    const profile: StreamingProfileData = {
      platformId,
      artistId,
      artistName: profileData?.artistName || 'Unknown Artist',
      profileUrl,
      verified: false,
      followers: profileData?.followers,
      monthlyListeners: profileData?.monthlyListeners,
      totalStreams: profileData?.totalStreams,
      topTracks: profileData?.topTracks,
      topCities: profileData?.topCities,
      genres: profileData?.genres,
      imageUrl: profileData?.imageUrl,
      bio: profileData?.bio,
      socialLinks: profileData?.socialLinks,
      syncCount: 0,
      consecutiveFailures: 0,
    };
    
    if (!this.linkedProfiles.has(userId)) {
      this.linkedProfiles.set(userId, new Map());
    }
    this.linkedProfiles.get(userId)!.set(platformId, profile);
    
    await this.saveProfileToStorage(userId, profile);
    
    logger.info(`[DataTransfer] Linked ${platformId} profile for user ${userId}: ${artistId}`);
    
    this.syncProfileData(userId, platformId).catch(err => {
      logger.warn(`[DataTransfer] Initial sync failed for ${platformId}: ${err.message}`);
    });
    
    return profile;
  }

  private extractArtistIdFromUrl(platformId: string, url: string): string {
    const patterns: Record<string, RegExp> = {
      spotify: /artist\/([a-zA-Z0-9]+)/,
      apple_music: /(?:artist\/[^/]*\/|artist\/)(\d+)/,
      youtube_music: /channel\/([a-zA-Z0-9_-]+)/,
      deezer: /artist\/([0-9]+)/,
      tidal: /artist\/([0-9]+)/,
      soundcloud: /soundcloud\.com\/([a-zA-Z0-9_-]+)/,
      bandcamp: /([a-zA-Z0-9_-]+)\.bandcamp\.com/,
      audiomack: /audiomack\.com\/([a-zA-Z0-9_-]+)/,
    };
    
    const pattern = patterns[platformId];
    if (pattern) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return url;
  }

  private async saveProfileToStorage(userId: string, profile: StreamingProfileData): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return;
      
      const existingPrefs = (user.preferences as Record<string, any>) || {};
      const streamingProfiles = existingPrefs.streamingProfiles || {};
      streamingProfiles[profile.platformId] = {
        artistId: profile.artistId,
        artistName: profile.artistName,
        profileUrl: profile.profileUrl,
        verified: profile.verified,
        linkedAt: new Date().toISOString(),
        followers: profile.followers,
        monthlyListeners: profile.monthlyListeners,
        lastSyncedAt: profile.lastSyncedAt,
        lastSyncStatus: profile.lastSyncStatus,
        lastSyncMethod: profile.lastSyncMethod,
        syncCount: profile.syncCount,
        consecutiveFailures: profile.consecutiveFailures,
      };
      
      await storage.updateUser(userId, {
        preferences: { ...existingPrefs, streamingProfiles },
      } as any);
    } catch (error) {
      logger.error(`[DataTransfer] Failed to save profile to storage:`, error);
    }
  }

  async getLinkedProfiles(userId: string): Promise<StreamingProfileData[]> {
    const userProfiles = this.linkedProfiles.get(userId);
    if (!userProfiles) {
      return [];
    }
    return Array.from(userProfiles.values());
  }

  async unlinkStreamingProfile(userId: string, platformId: string): Promise<boolean> {
    const userProfiles = this.linkedProfiles.get(userId);
    if (!userProfiles) {
      return false;
    }
    
    const deleted = userProfiles.delete(platformId);
    
    if (deleted) {
      try {
        const user = await storage.getUser(userId);
        if (user) {
          const existingPrefs = (user.preferences as Record<string, any>) || {};
          const streamingProfiles = existingPrefs.streamingProfiles || {};
          delete streamingProfiles[platformId];
          await storage.updateUser(userId, {
            preferences: { ...existingPrefs, streamingProfiles },
          } as any);
        }
      } catch (error) {
        logger.error(`[DataTransfer] Failed to remove profile from storage:`, error);
      }
      
      logger.info(`[DataTransfer] Unlinked ${platformId} profile for user ${userId}`);
    }
    
    return deleted;
  }

  async syncProfileData(
    userId: string,
    platformId: string,
    sharedTopTracks?: Array<{ title: string; streams: number; isrc?: string }>
  ): Promise<StreamingProfileData | null> {
    const userProfiles = this.linkedProfiles.get(userId);
    if (!userProfiles || !userProfiles.has(platformId)) {
      return null;
    }
    
    const profile = userProfiles.get(platformId)!;
    
    // Use the shared Spotify release catalog for non-Spotify platforms so the
    // artist's release data is only fetched from one authoritative source per sync.
    const updatedData = await this.fetchPlatformData(platformId, profile.artistId, sharedTopTracks);
    
    const platformDef = STREAMING_PLATFORMS.find(p => p.id === platformId);
    const resolvedMethod = platformDef?.syncMethod || 'api';

    if (updatedData) {
      Object.assign(profile, updatedData);
      profile.verified = resolvedMethod === 'api';
      profile.lastSyncedAt = new Date().toISOString();
      profile.lastSyncStatus = 'success';
      profile.lastSyncMethod = resolvedMethod;
      profile.syncCount = (profile.syncCount || 0) + 1;
      profile.consecutiveFailures = 0;
      userProfiles.set(platformId, profile);
      
      await this.saveProfileToStorage(userId, profile);
      
      logger.info(`[DataTransfer] Synced ${platformId} profile data for user ${userId} (method: ${resolvedMethod})`);
    } else {
      profile.lastSyncedAt = new Date().toISOString();
      profile.lastSyncStatus = 'failed';
      profile.lastSyncMethod = resolvedMethod;
      profile.consecutiveFailures = (profile.consecutiveFailures || 0) + 1;
      profile.syncCount = (profile.syncCount || 0) + 1;
      userProfiles.set(platformId, profile);
      
      await this.saveProfileToStorage(userId, profile);
    }
    
    return profile;
  }

  async syncAllProfiles(userId: string): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    results: SyncResult[];
  }> {
    const userProfiles = this.linkedProfiles.get(userId);
    if (!userProfiles || userProfiles.size === 0) {
      return { total: 0, succeeded: 0, failed: 0, results: [] };
    }

    // Fetch Spotify release catalog ONCE and share it across all platform syncs.
    // This prevents Apple Music, Deezer, and other platforms from independently
    // re-importing the same release data on every sync cycle.
    let sharedTopTracks: Array<{ title: string; streams: number; isrc?: string }> | undefined;
    const spotifyProfile = userProfiles.get('spotify');
    if (spotifyProfile?.artistId) {
      try {
        const spotifyData = await this.fetchSpotifyData(spotifyProfile.artistId);
        if (spotifyData?.topTracks) {
          sharedTopTracks = spotifyData.topTracks;
          logger.info(`[DataTransfer] Shared release catalog from Spotify (${sharedTopTracks.length} tracks) for user ${userId}`);
        }
      } catch (err) {
        logger.warn('[DataTransfer] Could not fetch Spotify catalog for sharing — each platform will fetch independently:', err);
      }
    }

    const platformIds = Array.from(userProfiles.keys());
    const settled = await Promise.allSettled(
      platformIds.map(pid => this.syncProfileData(userId, pid, sharedTopTracks))
    );

    const results: SyncResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      const pid = platformIds[i];
      if (outcome.status === 'fulfilled' && outcome.value?.lastSyncStatus === 'success') {
        succeeded++;
        results.push({ platformId: pid, status: 'success', timestamp: new Date().toISOString() });
      } else {
        failed++;
        const error = outcome.status === 'rejected' ? String(outcome.reason) : 'sync returned failure';
        results.push({ platformId: pid, status: 'failed', error, timestamp: new Date().toISOString() });
      }
    }

    const historyEntry: SyncHistoryEntry = {
      syncId: `sync_${Date.now()}`,
      userId,
      timestamp: new Date().toISOString(),
      method: this.autoSyncStates.has(userId) ? 'auto' : 'manual',
      results,
      summary: { total: platformIds.length, succeeded, failed },
    };
    this.addSyncHistory(userId, historyEntry);

    logger.info(`[DataTransfer] syncAllProfiles for ${userId}: ${succeeded}/${platformIds.length} succeeded`);

    return { total: platformIds.length, succeeded, failed, results };
  }

  startAutoSync(userId: string, intervalMinutes: number = 60): void {
    this.stopAutoSync(userId);

    const intervalMs = intervalMinutes * 60 * 1000;
    const interval = setInterval(() => {
      this.syncAllProfiles(userId).catch(err => {
        logger.error(`[DataTransfer] Auto-sync failed for ${userId}:`, err);
      });
    }, intervalMs);

    this.autoSyncStates.set(userId, {
      interval,
      intervalMinutes,
      startedAt: new Date().toISOString(),
    });

    const userProfiles = this.linkedProfiles.get(userId);
    if (userProfiles) {
      for (const [, profile] of userProfiles) {
        profile.autoSyncEnabled = true;
      }
    }

    logger.info(`[DataTransfer] Auto-sync started for ${userId} every ${intervalMinutes} minutes`);

    this.syncAllProfiles(userId).catch(err => {
      logger.error(`[DataTransfer] Initial auto-sync failed for ${userId}:`, err);
    });
  }

  stopAutoSync(userId: string): void {
    const state = this.autoSyncStates.get(userId);
    if (state) {
      clearInterval(state.interval);
      this.autoSyncStates.delete(userId);

      const userProfiles = this.linkedProfiles.get(userId);
      if (userProfiles) {
        for (const [, profile] of userProfiles) {
          profile.autoSyncEnabled = false;
        }
      }

      logger.info(`[DataTransfer] Auto-sync stopped for ${userId}`);
    }
  }

  getAutoSyncStatus(userId: string): {
    enabled: boolean;
    intervalMinutes?: number;
    startedAt?: string;
    lastSyncAt?: string;
    nextSyncAt?: string;
    platformResults: Array<{ platformId: string; lastSyncStatus?: string; lastSyncedAt?: string }>;
  } {
    const state = this.autoSyncStates.get(userId);
    const userProfiles = this.linkedProfiles.get(userId);
    const platformResults: Array<{ platformId: string; lastSyncStatus?: string; lastSyncedAt?: string }> = [];

    if (userProfiles) {
      for (const [pid, profile] of userProfiles) {
        platformResults.push({
          platformId: pid,
          lastSyncStatus: profile.lastSyncStatus,
          lastSyncedAt: profile.lastSyncedAt,
        });
      }
    }

    if (!state) {
      return { enabled: false, platformResults };
    }

    const history = this.syncHistory.get(userId);
    const lastEntry = history?.[history.length - 1];
    const lastSyncAt = lastEntry?.timestamp;

    let nextSyncAt: string | undefined;
    if (lastSyncAt) {
      const next = new Date(new Date(lastSyncAt).getTime() + state.intervalMinutes * 60 * 1000);
      nextSyncAt = next.toISOString();
    } else {
      const next = new Date(new Date(state.startedAt).getTime() + state.intervalMinutes * 60 * 1000);
      nextSyncAt = next.toISOString();
    }

    return {
      enabled: true,
      intervalMinutes: state.intervalMinutes,
      startedAt: state.startedAt,
      lastSyncAt,
      nextSyncAt,
      platformResults,
    };
  }

  getSyncHistory(userId: string): SyncHistoryEntry[] {
    return this.syncHistory.get(userId) || [];
  }

  private addSyncHistory(userId: string, entry: SyncHistoryEntry): void {
    if (!this.syncHistory.has(userId)) {
      this.syncHistory.set(userId, []);
    }
    const history = this.syncHistory.get(userId)!;
    history.push(entry);
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  private async getSpotifyToken(): Promise<string | null> {
    if (this.spotifyTokenCache && this.spotifyTokenCache.expiresAt > Date.now()) {
      return this.spotifyTokenCache.token;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return null;
    }

    try {
      const resp = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
      });
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      this.spotifyTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000,
      };
      return data.access_token;
    } catch {
      return null;
    }
  }

  private async fetchSpotifyData(artistId: string): Promise<Partial<StreamingProfileData> | null> {
    const token = await this.getSpotifyToken();
    if (!token) {
      logger.warn('[DataTransfer] No Spotify credentials available, skipping API sync');
      return null;
    }

    const breaker = this.getCircuitBreaker('spotify');
    const fetcher = async () => {
      const [artistResp, topTracksResp] = await Promise.all([
        fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (!artistResp.ok) throw new Error(`Spotify artist API returned ${artistResp.status}`);
      const artist = await artistResp.json() as any;

      let topTracks: Array<{ title: string; streams: number; isrc?: string }> = [];
      if (topTracksResp.ok) {
        const ttData = await topTracksResp.json() as any;
        topTracks = (ttData.tracks || []).slice(0, 5).map((t: any) => ({
          title: t.name,
          streams: t.popularity * 10000,
          isrc: t.external_ids?.isrc,
        }));
      }

      return {
        artistName: artist.name,
        followers: artist.followers?.total,
        monthlyListeners: artist.followers?.total,
        genres: artist.genres,
        imageUrl: artist.images?.[0]?.url,
        profileUrl: artist.external_urls?.spotify,
        topTracks,
        verified: true,
      } as Partial<StreamingProfileData>;
    };

    if (breaker) {
      return breaker.execute(fetcher, () => null);
    }
    try { return await fetcher(); } catch (err: any) {
      logger.error(`[DataTransfer] Spotify fetch failed for ${artistId}:`, err);
      return null;
    }
  }

  private async fetchAppleMusicData(
    artistId: string,
    sharedTopTracks?: Array<{ title: string; streams: number; isrc?: string }>
  ): Promise<Partial<StreamingProfileData> | null> {
    const breaker = this.getCircuitBreaker('apple_music');
    const fetcher = async () => {
      // When Spotify shared catalog is available, only look up the artist profile
      // (no songs) to avoid re-importing the same release data from a second source.
      const entityParam = sharedTopTracks ? 'musicArtist' : 'song';
      const limitParam = sharedTopTracks ? '1' : '10';
      const resp = await fetch(
        `https://itunes.apple.com/lookup?id=${artistId}&entity=${entityParam}&limit=${limitParam}`
      );
      if (!resp.ok) throw new Error(`iTunes API returned ${resp.status}`);
      const data = await resp.json() as any;
      const results = data.results || [];
      if (results.length === 0) return null;

      const artistResult = results.find((r: any) => r.wrapperType === 'artist' || r.artistId);
      const songs = results.filter((r: any) => r.wrapperType === 'track');

      return {
        artistName: artistResult?.artistName || songs[0]?.artistName,
        genres: artistResult?.primaryGenreName ? [artistResult.primaryGenreName] : undefined,
        profileUrl: artistResult?.artistLinkUrl,
        imageUrl: songs[0]?.artworkUrl100?.replace('100x100', '500x500') ?? undefined,
        // Use shared Spotify catalog if provided — do NOT re-import from Apple
        topTracks: sharedTopTracks ?? songs.slice(0, 5).map((s: any) => ({
          title: s.trackName,
          streams: 0,
        })),
        verified: true,
      } as Partial<StreamingProfileData>;
    };

    if (breaker) {
      return breaker.execute(fetcher, () => null);
    }
    try { return await fetcher(); } catch (err: any) {
      logger.error(`[DataTransfer] Apple Music fetch failed for ${artistId}:`, err);
      return null;
    }
  }

  private async fetchYouTubeMusicData(channelId: string): Promise<Partial<StreamingProfileData> | null> {
    const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return this.fetchYouTubeMusicFallback(channelId);
    }

    const breaker = this.getCircuitBreaker('youtube_music');
    const fetcher = async () => {
      const resp = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`
      );
      if (!resp.ok) throw new Error(`YouTube API returned ${resp.status}`);
      const data = await resp.json() as any;
      const channel = data.items?.[0];
      if (!channel) return null;

      return {
        artistName: channel.snippet?.title,
        bio: channel.snippet?.description,
        imageUrl: channel.snippet?.thumbnails?.high?.url,
        followers: parseInt(channel.statistics?.subscriberCount || '0'),
        totalStreams: parseInt(channel.statistics?.viewCount || '0'),
        profileUrl: `https://www.youtube.com/channel/${channelId}`,
        verified: true,
      } as Partial<StreamingProfileData>;
    };

    if (breaker) {
      return breaker.execute(fetcher, () => null);
    }
    try { return await fetcher(); } catch (err: any) {
      logger.error(`[DataTransfer] YouTube API fetch failed for ${channelId}:`, err);
      return this.fetchYouTubeMusicFallback(channelId);
    }
  }

  private async fetchYouTubeMusicFallback(channelId: string): Promise<Partial<StreamingProfileData> | null> {
    try {
      const resp = await fetch(`https://www.youtube.com/channel/${channelId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaxBooster/1.0)', 'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (!resp.ok) return null;
      const html = await resp.text();

      const nameMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
      const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
      const subsMatch = html.match(/"subscriberCountText":\s*\{"simpleText":\s*"([^"]+)"/);

      let followers = 0;
      if (subsMatch) {
        const subText = subsMatch[1].replace(/,/g, '');
        const numMatch = subText.match(/([\d.]+)\s*(K|M|B)?/i);
        if (numMatch) {
          let num = parseFloat(numMatch[1]);
          const suffix = (numMatch[2] || '').toUpperCase();
          if (suffix === 'K') num *= 1000;
          else if (suffix === 'M') num *= 1000000;
          else if (suffix === 'B') num *= 1000000000;
          followers = Math.round(num);
        }
      }

      return {
        artistName: nameMatch ? nameMatch[1].trim() : undefined,
        bio: descMatch ? descMatch[1].trim() : undefined,
        imageUrl: imgMatch ? imgMatch[1] : undefined,
        followers,
        profileUrl: `https://www.youtube.com/channel/${channelId}`,
        lastSyncMethod: 'scraping',
        verified: true,
      } as Partial<StreamingProfileData>;
    } catch (err: any) {
      logger.error(`[DataTransfer] YouTube fallback scrape failed for ${channelId}:`, err);
      return null;
    }
  }

  private async fetchDeezerData(
    artistId: string,
    sharedTopTracks?: Array<{ title: string; streams: number; isrc?: string }>
  ): Promise<Partial<StreamingProfileData> | null> {
    const breaker = this.getCircuitBreaker('deezer');
    const fetcher = async () => {
      // When Spotify shared catalog is available, only fetch artist profile (not top tracks)
      // so the release catalog is imported once per sync — not separately from each DSP.
      const requests: Promise<Response>[] = [fetch(`https://api.deezer.com/artist/${artistId}`)];
      if (!sharedTopTracks) {
        requests.push(fetch(`https://api.deezer.com/artist/${artistId}/top?limit=5`));
      }
      const [artistResp, topResp] = await Promise.all(requests);

      if (!artistResp.ok) throw new Error(`Deezer API returned ${artistResp.status}`);
      const artist = await artistResp.json() as any;
      if (artist.error) throw new Error(artist.error.message || 'Deezer API error');

      let topTracks: Array<{ title: string; streams: number; isrc?: string }>;
      if (sharedTopTracks) {
        topTracks = sharedTopTracks;
      } else if (topResp?.ok) {
        const topData = await topResp.json() as any;
        topTracks = (topData.data || []).slice(0, 5).map((t: any) => ({
          title: t.title,
          streams: t.rank || 0,
        }));
      } else {
        topTracks = [];
      }

      return {
        artistName: artist.name,
        followers: artist.nb_fan,
        imageUrl: artist.picture_xl || artist.picture_big,
        profileUrl: artist.link,
        topTracks,
        verified: true,
      } as Partial<StreamingProfileData>;
    };

    if (breaker) {
      return breaker.execute(fetcher, () => null);
    }
    try { return await fetcher(); } catch (err: any) {
      logger.error(`[DataTransfer] Deezer fetch failed for ${artistId}:`, err);
      return null;
    }
  }

  private soundCloudClientId: string | null = null;
  private soundCloudClientIdExpiry = 0;

  private async getSoundCloudClientId(): Promise<string | null> {
    if (process.env.SOUNDCLOUD_CLIENT_ID) {
      return process.env.SOUNDCLOUD_CLIENT_ID;
    }

    if (this.soundCloudClientId && this.soundCloudClientIdExpiry > Date.now()) {
      return this.soundCloudClientId;
    }

    try {
      const pageResp = await fetch('https://soundcloud.com', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      });
      if (!pageResp.ok) return null;
      const html = await pageResp.text();

      const scriptUrls = html.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g);
      if (!scriptUrls || scriptUrls.length === 0) return null;

      for (const url of scriptUrls.slice(-3)) {
        const jsResp = await fetch(url);
        if (!jsResp.ok) continue;
        const js = await jsResp.text();
        const match = js.match(/client_id:"([a-zA-Z0-9]+)"/);
        if (match) {
          this.soundCloudClientId = match[1];
          this.soundCloudClientIdExpiry = Date.now() + 6 * 3600 * 1000;
          logger.info(`[DataTransfer] Auto-discovered SoundCloud client_id`);
          return match[1];
        }
      }
    } catch (err: any) {
      logger.warn(`[DataTransfer] Failed to auto-discover SoundCloud client_id: ${err.message}`);
    }
    return null;
  }

  private async fetchSoundCloudData(permalink: string): Promise<Partial<StreamingProfileData> | null> {
    const breaker = this.getCircuitBreaker('soundcloud');
    const fetcher = async () => {
      const clientId = await this.getSoundCloudClientId();
      if (clientId) {
        const resp = await fetch(
          `https://api-v2.soundcloud.com/resolve?url=https://soundcloud.com/${permalink}&client_id=${clientId}`
        );
        if (resp.ok) {
          const user = await resp.json() as any;
          if (user && user.username) {
            return {
              artistName: user.username,
              followers: user.followers_count || 0,
              totalStreams: user.playback_count || 0,
              bio: user.description,
              imageUrl: user.avatar_url,
              profileUrl: user.permalink_url || `https://soundcloud.com/${permalink}`,
              verified: true,
            } as Partial<StreamingProfileData>;
          }
        }
      }

      const resp = await fetch(`https://soundcloud.com/${permalink}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!resp.ok) throw new Error(`SoundCloud returned ${resp.status}`);
      const html = await resp.text();

      const nameMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
      const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);

      return {
        artistName: nameMatch ? nameMatch[1].replace(/ \| Free Listening.*$/, '').replace(/ \| Listen.*$/, '').trim() : permalink,
        bio: descMatch ? descMatch[1].trim() : undefined,
        imageUrl: imgMatch ? imgMatch[1] : undefined,
        profileUrl: `https://soundcloud.com/${permalink}`,
        lastSyncMethod: 'scraping',
        verified: true,
      } as Partial<StreamingProfileData>;
    };

    if (breaker) {
      return breaker.execute(fetcher, () => null);
    }
    try { return await fetcher(); } catch (err: any) {
      logger.error(`[DataTransfer] SoundCloud fetch failed for ${permalink}:`, err);
      return null;
    }
  }

  private async fetchTidalData(artistId: string): Promise<Partial<StreamingProfileData> | null> {
    const breaker = this.getCircuitBreaker('tidal');
    const fetcher = async () => {
      const tidalToken = process.env.TIDAL_TOKEN;
      if (tidalToken) {
        try {
          const resp = await fetch(`https://api.tidal.com/v1/artists/${artistId}?countryCode=US`, {
            headers: { 'x-tidal-token': tidalToken },
          });
          if (resp.ok) {
            const artist = await resp.json() as any;
            return {
              artistName: artist.name,
              imageUrl: artist.picture ? `https://resources.tidal.com/images/${artist.picture.replace(/-/g, '/')}/750x750.jpg` : undefined,
              profileUrl: `https://tidal.com/artist/${artistId}`,
              verified: true,
            } as Partial<StreamingProfileData>;
          }
        } catch {
        }
      }

      const resp = await fetch(`https://listen.tidal.com/artist/${artistId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!resp.ok) throw new Error(`Tidal returned ${resp.status}`);
      const html = await resp.text();

      const nameMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
      const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);

      return {
        artistName: nameMatch ? nameMatch[1].trim() : undefined,
        bio: descMatch ? descMatch[1].trim() : undefined,
        imageUrl: imgMatch ? imgMatch[1] : undefined,
        profileUrl: `https://tidal.com/artist/${artistId}`,
        lastSyncMethod: 'scraping',
        verified: true,
      } as Partial<StreamingProfileData>;
    };

    if (breaker) {
      return breaker.execute(fetcher, () => null);
    }
    try { return await fetcher(); } catch (err: any) {
      logger.error(`[DataTransfer] Tidal fetch failed for ${artistId}:`, err);
      return null;
    }
  }

  private async fetchBandcampData(slug: string): Promise<Partial<StreamingProfileData> | null> {
    const breaker = this.getCircuitBreaker('bandcamp');
    const fetcher = async () => {
      const resp = await fetch(`https://${slug}.bandcamp.com`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaxBooster/1.0)' },
      });
      if (!resp.ok) throw new Error(`Bandcamp returned ${resp.status}`);
      const html = await resp.text();

      const nameMatch = html.match(/<title>([^|<]+)/);
      const bioMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
      const imgMatch = html.match(/<img[^>]+class="[^"]*band-photo[^"]*"[^>]+src="([^"]+)"/);

      return {
        artistName: nameMatch ? nameMatch[1].trim() : slug,
        bio: bioMatch ? bioMatch[1].trim() : undefined,
        imageUrl: imgMatch ? imgMatch[1] : undefined,
        profileUrl: `https://${slug}.bandcamp.com`,
        verified: true,
      } as Partial<StreamingProfileData>;
    };

    if (breaker) {
      return breaker.execute(fetcher, () => null);
    }
    try { return await fetcher(); } catch (err: any) {
      logger.error(`[DataTransfer] Bandcamp fetch failed for ${slug}:`, err);
      return null;
    }
  }

  private async fetchAudiomackData(slug: string): Promise<Partial<StreamingProfileData> | null> {
    const breaker = this.getCircuitBreaker('audiomack');
    const fetcher = async () => {
      const resp = await fetch(`https://api.audiomack.com/v1/artist/${slug}`);
      if (!resp.ok) throw new Error(`Audiomack API returned ${resp.status}`);
      const data = await resp.json() as any;
      const artist = data.results;
      if (!artist) return null;

      return {
        artistName: artist.name,
        followers: artist.followers,
        totalStreams: artist.plays,
        imageUrl: artist.image,
        profileUrl: artist.url || `https://audiomack.com/${slug}`,
        bio: artist.bio,
        verified: true,
      } as Partial<StreamingProfileData>;
    };

    if (breaker) {
      return breaker.execute(fetcher, () => null);
    }
    try { return await fetcher(); } catch (err: any) {
      logger.error(`[DataTransfer] Audiomack fetch failed for ${slug}:`, err);
      return null;
    }
  }

  private async fetchPlatformData(
    platformId: string,
    artistId: string,
    sharedTopTracks?: Array<{ title: string; streams: number; isrc?: string }>
  ): Promise<Partial<StreamingProfileData> | null> {
    logger.info(`[DataTransfer] Fetching data for ${platformId} artist: ${artistId}`);

    try {
      switch (platformId) {
        case 'spotify':
          return await this.fetchSpotifyData(artistId);
        case 'apple_music':
          // Use shared Spotify catalog when available — skip Apple's own song lookup
          // so the release catalog is only imported once per sync cycle.
          return await this.fetchAppleMusicData(artistId, sharedTopTracks);
        case 'youtube_music':
          return await this.fetchYouTubeMusicData(artistId);
        case 'deezer':
          // Use shared Spotify catalog when available — skip Deezer's own top-track fetch.
          return await this.fetchDeezerData(artistId, sharedTopTracks);
        case 'soundcloud':
          return await this.fetchSoundCloudData(artistId);
        case 'tidal':
          return await this.fetchTidalData(artistId);
        case 'bandcamp':
          return await this.fetchBandcampData(artistId);
        case 'audiomack':
          return await this.fetchAudiomackData(artistId);
        case 'amazon_music':
        case 'beatport':
          return {
            lastSyncMethod: 'manual',
            verified: true,
          } as Partial<StreamingProfileData>;
        default:
          return null;
      }
    } catch (err: any) {
      logger.error(`[DataTransfer] Platform fetch failed for ${platformId}/${artistId}:`, err);
      return null;
    }
  }

  // ─── Catalog scanning methods ─────────────────────────────────────────────

  private async fetchSpotifyAlbums(artistId: string, artistName: string): Promise<ScannedRelease[]> {
    const token = await this.getSpotifyToken();
    if (!token) return [];

    try {
      const results: ScannedRelease[] = [];
      let url: string | null = `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single,ep&limit=50&market=US`;

      while (url) {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) break;
        const data = await resp.json() as any;

        for (const item of (data.items || [])) {
          const type = item.album_type === 'album'
            ? (item.total_tracks >= 6 ? 'album' : 'EP')
            : 'single';
          results.push({
            id: `spotify-${item.id}`,
            externalId: item.id,
            platformId: 'spotify',
            title: item.name,
            artistName: item.artists?.[0]?.name || artistName,
            releaseType: type as 'single' | 'EP' | 'album',
            releaseDate: item.release_date || null,
            trackCount: item.total_tracks || 1,
            coverUrl: item.images?.[0]?.url,
            platformUrl: item.external_urls?.spotify,
          });
        }

        url = data.next || null;
        if (results.length >= 100) break;
      }

      // Fetch track-level ISRC for first 5 singles for richer metadata
      for (const release of results.filter(r => r.releaseType === 'single').slice(0, 5)) {
        try {
          const tr = await fetch(`https://api.spotify.com/v1/albums/${release.externalId}/tracks?limit=10`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (tr.ok) {
            const td = await tr.json() as any;
            release.tracks = (td.items || []).map((t: any, idx: number) => ({
              title: t.name,
              trackNumber: idx + 1,
              isrc: t.external_ids?.isrc,
              duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : undefined,
            }));
          }
        } catch { /* non-fatal */ }
      }

      return results;
    } catch (err: any) {
      logger.error(`[DataTransfer] Spotify album scan failed for ${artistId}:`, err);
      return [];
    }
  }

  private async fetchAppleMusicAlbums(artistId: string, artistName: string): Promise<ScannedRelease[]> {
    try {
      const resp = await fetch(
        `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=50`
      );
      if (!resp.ok) return [];
      const data = await resp.json() as any;
      const albums = (data.results || []).filter((r: any) => r.collectionType === 'Album' || r.wrapperType === 'collection');

      return albums.map((item: any) => ({
        id: `apple-${item.collectionId}`,
        externalId: String(item.collectionId),
        platformId: 'apple_music',
        title: item.collectionName,
        artistName: item.artistName || artistName,
        releaseType: (item.trackCount >= 6 ? 'album' : (item.trackCount >= 3 ? 'EP' : 'single')) as 'single' | 'EP' | 'album',
        releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : null,
        trackCount: item.trackCount || 1,
        coverUrl: item.artworkUrl100?.replace('100x100', '600x600'),
        platformUrl: item.collectionViewUrl,
        genre: item.primaryGenreName,
      }));
    } catch (err: any) {
      logger.error(`[DataTransfer] Apple Music album scan failed for ${artistId}:`, err);
      return [];
    }
  }

  private async fetchDeezerAlbums(artistId: string, artistName: string): Promise<ScannedRelease[]> {
    try {
      const resp = await fetch(`https://api.deezer.com/artist/${artistId}/albums?limit=50`);
      if (!resp.ok) return [];
      const data = await resp.json() as any;
      if (data.error) return [];

      return (data.data || []).map((item: any) => ({
        id: `deezer-${item.id}`,
        externalId: String(item.id),
        platformId: 'deezer',
        title: item.title,
        artistName,
        releaseType: (item.nb_tracks >= 6 ? 'album' : (item.nb_tracks >= 3 ? 'EP' : 'single')) as 'single' | 'EP' | 'album',
        releaseDate: item.release_date || null,
        trackCount: item.nb_tracks || 1,
        coverUrl: item.cover_xl || item.cover_big,
        platformUrl: item.link,
      }));
    } catch (err: any) {
      logger.error(`[DataTransfer] Deezer album scan failed for ${artistId}:`, err);
      return [];
    }
  }

  private async fetchSoundCloudAlbums(permalink: string, artistName: string): Promise<ScannedRelease[]> {
    try {
      const clientId = await this.getSoundCloudClientId();
      if (!clientId) return [];

      const userResp = await fetch(
        `https://api-v2.soundcloud.com/resolve?url=https://soundcloud.com/${permalink}&client_id=${clientId}`
      );
      if (!userResp.ok) return [];
      const user = await userResp.json() as any;
      if (!user?.id) return [];

      const [playlistResp, tracksResp] = await Promise.all([
        fetch(`https://api-v2.soundcloud.com/users/${user.id}/playlists?client_id=${clientId}&limit=20`),
        fetch(`https://api-v2.soundcloud.com/users/${user.id}/tracks?client_id=${clientId}&limit=20`),
      ]);

      const results: ScannedRelease[] = [];

      if (playlistResp.ok) {
        const pd = await playlistResp.json() as any;
        for (const pl of (pd.collection || [])) {
          const trackCount = pl.track_count || pl.tracks?.length || 1;
          results.push({
            id: `soundcloud-pl-${pl.id}`,
            externalId: String(pl.id),
            platformId: 'soundcloud',
            title: pl.title,
            artistName: pl.user?.username || artistName,
            releaseType: trackCount >= 6 ? 'album' : trackCount >= 3 ? 'EP' : 'single',
            releaseDate: pl.release_date || pl.created_at?.split('T')[0] || null,
            trackCount,
            coverUrl: pl.artwork_url?.replace('-large', '-t500x500'),
            platformUrl: pl.permalink_url,
          });
        }
      }

      if (tracksResp.ok) {
        const td = await tracksResp.json() as any;
        for (const track of (td.collection || []).slice(0, 10)) {
          results.push({
            id: `soundcloud-tr-${track.id}`,
            externalId: String(track.id),
            platformId: 'soundcloud',
            title: track.title,
            artistName: track.user?.username || artistName,
            releaseType: 'single',
            releaseDate: track.release_date || track.created_at?.split('T')[0] || null,
            trackCount: 1,
            coverUrl: track.artwork_url?.replace('-large', '-t500x500'),
            platformUrl: track.permalink_url,
          });
        }
      }

      return results;
    } catch (err: any) {
      logger.error(`[DataTransfer] SoundCloud album scan failed for ${permalink}:`, err);
      return [];
    }
  }

  private async fetchBandcampAlbums(slug: string, artistName: string): Promise<ScannedRelease[]> {
    try {
      const resp = await fetch(`https://${slug}.bandcamp.com/music`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaxBooster/1.0)' },
      });
      if (!resp.ok) return [];
      const html = await resp.text();

      const results: ScannedRelease[] = [];
      const itemRegex = /<li[^>]*data-item-id="[^"]*"[^>]*>[\s\S]*?<\/li>/g;
      const titleRegex = /<p[^>]*class="title"[^>]*>([\s\S]*?)<\/p>/;
      const imgRegex = /<img[^>]+src="([^"]+)"/;
      const linkRegex = /<a[^>]+href="([^"]+)"/;
      const typeRegex = /\/(album|track)\//;

      let match: RegExpExecArray | null;
      while ((match = itemRegex.exec(html)) !== null && results.length < 30) {
        const block = match[0];
        const titleM = titleRegex.exec(block);
        const imgM = imgRegex.exec(block);
        const linkM = linkRegex.exec(block);
        const typeM = linkM ? typeRegex.exec(linkM[1]) : null;

        const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : null;
        if (!title) continue;

        const rawType = typeM?.[1];
        const releaseType = rawType === 'album' ? 'album' : 'single';
        const href = linkM?.[1] || '';
        const fullUrl = href.startsWith('http') ? href : `https://${slug}.bandcamp.com${href}`;

        results.push({
          id: `bandcamp-${Buffer.from(fullUrl).toString('base64').substring(0, 16)}`,
          externalId: fullUrl,
          platformId: 'bandcamp',
          title,
          artistName,
          releaseType: releaseType as 'single' | 'EP' | 'album',
          releaseDate: null,
          trackCount: releaseType === 'album' ? 5 : 1,
          coverUrl: imgM?.[1],
          platformUrl: fullUrl,
        });
      }

      return results;
    } catch (err: any) {
      logger.error(`[DataTransfer] Bandcamp album scan failed for ${slug}:`, err);
      return [];
    }
  }

  private async fetchAudiomackAlbums(slug: string, artistName: string): Promise<ScannedRelease[]> {
    try {
      const resp = await fetch(`https://api.audiomack.com/v1/artist/${slug}/playlists?limit=20`);
      if (!resp.ok) return [];
      const data = await resp.json() as any;
      const items = data.results || data.data || [];

      return items.map((item: any) => ({
        id: `audiomack-${item.id || item.slug}`,
        externalId: String(item.id || item.slug),
        platformId: 'audiomack',
        title: item.title,
        artistName: item.artist?.name || artistName,
        releaseType: (item.song_count >= 6 ? 'album' : item.song_count >= 3 ? 'EP' : 'single') as 'single' | 'EP' | 'album',
        releaseDate: item.released_at ? new Date(item.released_at * 1000).toISOString().split('T')[0] : null,
        trackCount: item.song_count || 1,
        coverUrl: item.image,
        platformUrl: item.url || `https://audiomack.com/${slug}/${item.slug}`,
      }));
    } catch (err: any) {
      logger.error(`[DataTransfer] Audiomack album scan failed for ${slug}:`, err);
      return [];
    }
  }

  async scanReleasesFromProfile(userId: string, platformId: string): Promise<ScannedRelease[]> {
    const userProfiles = this.linkedProfiles.get(userId);
    if (!userProfiles || !userProfiles.has(platformId)) {
      throw new Error('Profile not linked');
    }

    const profile = userProfiles.get(platformId)!;
    const artistName = profile.artistName || 'Unknown Artist';
    const artistId = profile.artistId;

    logger.info(`[DataTransfer] Scanning releases from ${platformId} for user ${userId}: ${artistId}`);

    switch (platformId) {
      case 'spotify':      return this.fetchSpotifyAlbums(artistId, artistName);
      case 'apple_music':  return this.fetchAppleMusicAlbums(artistId, artistName);
      case 'deezer':       return this.fetchDeezerAlbums(artistId, artistName);
      case 'soundcloud':   return this.fetchSoundCloudAlbums(artistId, artistName);
      case 'bandcamp':     return this.fetchBandcampAlbums(artistId, artistName);
      case 'audiomack':    return this.fetchAudiomackAlbums(artistId, artistName);
      default:
        return [];
    }
  }

  async importProfileCatalog(
    userId: string,
    platformId: string,
    releases: ScannedRelease[]
  ): Promise<DataTransferJob> {
    const job = await this.createTransferJob(userId, 'import', `${platformId}_profile_scan`);
    job.status = 'processing';
    job.totalItems = releases.length;
    job.updatedAt = new Date();

    let imported = 0;
    let failed = 0;

    for (const release of releases) {
      try {
        const existing = await this.findExistingRelease(userId, release.upc, release.title, release.artistName);

        if (existing) {
          const existingMeta = existing.metadata as any;
          const links = existingMeta?.originalPlatformLinks || {};
          if (release.platformUrl) links[platformId] = release.platformUrl;
          await storage.updateDistroRelease(existing.id, {
            metadata: { ...existingMeta, originalPlatformLinks: links },
          });
          logger.info(`[DataTransfer] Merged existing release from ${platformId}: ${release.title}`);
        } else {
          await storage.createDistroRelease({
            artistId: userId,
            title: release.title,
            releaseDate: release.releaseDate ? new Date(release.releaseDate) : null,
            metadata: {
              artistName: release.artistName,
              releaseType: release.releaseType,
              primaryGenre: release.genre || 'Other',
              language: 'en',
              copyrightYear: release.releaseDate ? new Date(release.releaseDate).getFullYear() : new Date().getFullYear(),
              copyrightOwner: release.artistName,
              upc: release.upc,
              importedFrom: `${platformId}_profile_scan`,
              originalPlatformLinks: release.platformUrl ? { [platformId]: release.platformUrl } : {},
              coverUrl: release.coverUrl,
              isImported: true,
              importedAt: new Date().toISOString(),
              scannedExternalId: release.externalId,
            },
          });
          logger.info(`[DataTransfer] Imported release from ${platformId} profile: ${release.title}`);
        }

        imported++;
        job.successItems = imported;
      } catch (err: any) {
        failed++;
        job.failedItems = failed;
        job.errors.push({ item: release.title, error: err.message || 'Unknown error' });
        logger.error(`[DataTransfer] Failed to import profile release ${release.title}:`, err);
      }

      job.processedItems = imported + failed;
      job.progress = Math.round((job.processedItems / job.totalItems) * 100);
      job.updatedAt = new Date();
    }

    job.status = failed === 0 ? 'completed' : (imported > 0 ? 'partial' : 'failed');
    job.completedAt = new Date();
    job.result = { importedReleases: imported };

    logger.info(`[DataTransfer] Profile catalog import ${job.id}: ${imported} imported, ${failed} failed`);
    return job;
  }

  async generateMigrationReport(userId: string): Promise<{
    totalReleases: number;
    totalTracks: number;
    totalStreams: number;
    platforms: Array<{ name: string; releases: number; streams: number }>;
    linkedProfiles: StreamingProfileData[];
    recommendations: string[];
  }> {
    const releases = await storage.getDistroReleasesByArtist(userId);
    const linkedProfiles = await this.getLinkedProfiles(userId);
    
    let totalTracks = 0;
    let totalStreams = 0;
    const platformStats: Record<string, { releases: number; streams: number }> = {};
    
    for (const release of releases) {
      const metadata = release.metadata as any;
      totalTracks += metadata?.tracks?.length || 1;
      totalStreams += metadata?.streamingStats?.totalStreams || 0;
      
      const platformStreams = metadata?.streamingStats?.platforms || {};
      for (const [platform, stats] of Object.entries(platformStreams)) {
        if (!platformStats[platform]) {
          platformStats[platform] = { releases: 0, streams: 0 };
        }
        platformStats[platform].releases++;
        platformStats[platform].streams += (stats as any).streams || 0;
      }
    }
    
    const recommendations: string[] = [];
    
    if (linkedProfiles.length === 0) {
      recommendations.push('Link your streaming platform profiles to sync your analytics and verify your artist identity.');
    }
    
    if (releases.some(r => !(r.metadata as any)?.upc)) {
      recommendations.push('Some releases are missing UPC codes. Consider generating or importing them for proper tracking.');
    }
    
    const unverifiedProfiles = linkedProfiles.filter(p => !p.verified);
    if (unverifiedProfiles.length > 0) {
      recommendations.push(`Verify your ${unverifiedProfiles.map(p => p.platformId).join(', ')} profile(s) to unlock advanced analytics.`);
    }
    
    return {
      totalReleases: releases.length,
      totalTracks,
      totalStreams,
      platforms: Object.entries(platformStats).map(([name, stats]) => ({
        name,
        releases: stats.releases,
        streams: stats.streams,
      })),
      linkedProfiles,
      recommendations,
    };
  }

  async validateImportData(csvContent: string, distributor: string): Promise<{
    valid: boolean;
    totalRows: number;
    validRows: number;
    errors: Array<{ row: number; error: string }>;
    preview: ImportedRelease[];
  }> {
    const errors: Array<{ row: number; error: string }> = [];
    let validRows = 0;
    
    try {
      const releases = await this.parseDistributorCSV(csvContent, distributor);
      
      const lines = csvContent.split('\n').filter(line => line.trim());
      const totalRows = Math.max(0, lines.length - 1);
      
      for (const release of releases) {
        if (release.title && release.artistName) {
          validRows++;
        }
      }
      
      return {
        valid: validRows > 0,
        totalRows,
        validRows,
        errors,
        preview: releases.slice(0, 5),
      };
    } catch (error: any) {
      return {
        valid: false,
        totalRows: 0,
        validRows: 0,
        errors: [{ row: 0, error: error.message }],
        preview: [],
      };
    }
  }
}

export const distributionDataTransferService = new DistributionDataTransferService();
