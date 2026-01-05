import axios, { AxiosInstance, AxiosError } from 'axios';
import { storage } from '../storage';
import { logger } from '../logger.js';

export interface LabelGridRelease {
  title: string;
  artist: string;
  releaseDate: string;
  upc?: string;
  tracks: LabelGridTrack[];
  artwork: string;
  genre: string;
  platforms: string[];
  label?: string;
  copyrightYear?: number;
  copyrightOwner?: string;
  territoryMode?: 'worldwide' | 'include' | 'exclude';
  territories?: string[];
}

export interface LabelGridTrack {
  title: string;
  artist: string;
  isrc?: string;
  audioFile: string;
  duration: number;
  trackNumber: number;
  explicit?: boolean;
  lyrics?: string;
}

export interface LabelGridReleaseResponse {
  releaseId: string;
  status: 'draft' | 'processing' | 'live' | 'failed';
  submittedAt: string;
  estimatedLiveDate?: string;
  platforms: LabelGridPlatformStatus[];
}

export interface LabelGridPlatformStatus {
  platform: string;
  status: 'pending' | 'processing' | 'live' | 'failed';
  liveDate?: string;
  errorMessage?: string;
}

export interface LabelGridAnalytics {
  releaseId: string;
  totalStreams: number;
  totalRevenue: number;
  platforms: {
    [key: string]: {
      streams: number;
      revenue: number;
      listeners: number;
    };
  };
  timeline: {
    date: string;
    streams: number;
    revenue: number;
  }[];
}

export interface LabelGridWebhookPayload {
  event: string;
  releaseId: string;
  status?: string;
  errorMessage?: string;
  platform?: string;
  data?: any;
  timestamp: string;
}

export interface LabelGridCodeResponse {
  code: string;
  type: 'isrc' | 'upc';
  assignedTo?: string;
  createdAt: string;
}

export interface LabelGridPublishingMetadata {
  writers: string[];
  publishers: string[];
  ipi: string;
  pro: string;
}

export interface LabelGridSyncOpportunity {
  id: string;
  title: string;
  brand: string;
  budget: number;
  deadline: string;
  genre: string;
  mood: string;
}

export interface LabelGridSyncSubmission {
  id: string;
  releaseId: string;
  opportunityId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'placed';
  notes?: string;
}

export interface LabelGridSmartLink {
  id: string;
  url: string;
  releaseId: string;
  platforms: string[];
  customSlug?: string;
  clicks: number;
}

export interface LabelGridSmartLinkAnalytics {
  clicks: number;
  platforms: Record<string, number>;
  countries: Record<string, number>;
}

export interface LabelGridPreSave {
  id: string;
  releaseId: string;
  url: string;
  subscribers: number;
  startDate: string;
  endDate?: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
}

export interface LabelGridPreSaveSubscriber {
  email: string;
  platform: string;
  subscribedAt: string;
}

export interface LabelGridContentClaim {
  id: string;
  releaseId: string;
  platform: string;
  videoId?: string;
  status: 'pending' | 'active' | 'disputed' | 'released';
  revenue: number;
}

export interface LabelGridContentRevenue {
  total: number;
  byPlatform: Record<string, number>;
  byMonth: { month: string; amount: number }[];
}

export interface LabelGridRoyaltySummary {
  pending: number;
  available: number;
  lifetime: number;
  currency: string;
}

export interface LabelGridRoyaltyStatement {
  id: string;
  period: string;
  amount: number;
  status: 'pending' | 'paid' | 'processing';
  pdfUrl: string;
}

export interface LabelGridPayoutRequest {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: string;
  processedAt?: string;
}

export interface LabelGridDSP {
  id: string;
  name: string;
  slug: string;
  category: 'streaming' | 'download' | 'social' | 'electronic' | 'regional' | 'niche' | 'monetization';
  region: string;
  isActive: boolean;
  processingTime: string;
  requirements: {
    isrc: boolean;
    upc: boolean;
    metadata: string[];
    audioFormats: string[];
  };
  deliveryMethod: 'api' | 'ftp' | 'ddex';
  logoUrl?: string;
}

export interface LabelGridDSPListResponse {
  dsps: LabelGridDSP[];
  total: number;
  syncedAt: string;
}

class LabelGridService {
  private client: AxiosInstance;
  private apiToken: string | undefined;
  private baseUrl: string;
  private endpoints: any;
  private authHeaderFormat: string;
  private webhookSecret: string | undefined;
  private isConfigured: boolean = false;
  private configLoaded: boolean = false;
  private maxRetries: number = 3;
  private baseDelay: number = 1000;

  constructor() {
    this.apiToken = process.env.LABELGRID_API_TOKEN;
    this.baseUrl = process.env.LABELGRID_API_URL || 'https://api.labelgrid.com';
    this.webhookSecret = process.env.LABELGRID_WEBHOOK_SECRET;
    this.endpoints = {};
    this.authHeaderFormat = 'Bearer {token}';

    if (!this.apiToken) {
      logger.warn(
        '⚠️  LabelGrid API token not configured. Distribution features will use simulated mode.'
      );
      logger.warn('   Set LABELGRID_API_TOKEN in your environment to enable real distribution.');
    } else {
      this.isConfigured = true;
      logger.info('✅ LabelGrid API client initialized');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiToken && { Authorization: `Bearer ${this.apiToken}` }),
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logError('LabelGrid API Error', error);
        return Promise.reject(error);
      }
    );

    // Load config from database on initialization
    this.loadConfig();
  }

  private async loadConfig() {
    if (this.configLoaded) return;

    try {
      const provider = await storage.getDistributionProvider('labelgrid');

      if (provider) {
        // Use actual fields from the schema
        this.baseUrl = provider.apiBase || this.baseUrl || 'https://api.labelgrid.com';
        this.endpoints = provider.requirements?.endpoints || {};
        this.authHeaderFormat =
          provider.authType === 'api_key' ? 'X-API-Key: {token}' : 'Bearer {token}';
        this.webhookSecret = provider.requirements?.webhookSecret || this.webhookSecret;
        this.configLoaded = true;

        // Update axios client base URL
        this.client.defaults.baseURL = this.baseUrl;

        logger.info('✅ LabelGrid configuration loaded from database');
        logger.info(`   Base URL: ${this.baseUrl}`);
        logger.info(`   Endpoints configured: ${Object.keys(this.endpoints).length}`);
      } else {
        // Fallback to environment variables (expected until provider is configured)
        this.baseUrl = process.env.LABELGRID_API_URL || 'https://api.labelgrid.com';
        this.endpoints = {};
        this.authHeaderFormat = 'Bearer {token}';
        this.configLoaded = true;
        // Silent fallback - provider will be added when distribution is configured
      }
    } catch (error: unknown) {
      logger.error('Failed to load LabelGrid config from database:', error);
      this.baseUrl = process.env.LABELGRID_API_URL || 'https://api.labelgrid.com';
      this.endpoints = {};
      this.authHeaderFormat = 'Bearer {token}';
    }
  }

  private getEndpoint(key: string, fallback: string): string {
    return this.endpoints[key] || fallback;
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = this.maxRetries
  ): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        const isLastAttempt = attempt === retries;
        const axiosError = error as AxiosError;

        const isRetryable =
          axiosError.code === 'ECONNABORTED' ||
          axiosError.code === 'ETIMEDOUT' ||
          (axiosError.response?.status && axiosError.response.status >= 500);

        if (isLastAttempt || !isRetryable) {
          throw error;
        }

        const delay = Math.min(this.baseDelay * Math.pow(2, attempt), 16000);
        logger.info(`⏳ LabelGrid API retry ${attempt + 1}/${retries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }

  private logError(context: string, error: unknown): void {
    const err = error as any;
    logger.error(`${context}: ${err?.message || 'Unknown error'}`, {
      context,
      message: err?.message,
      code: err?.code,
      status: err?.response?.status,
      data: err?.response?.data,
    });
  }

  private logApiCall(method: string, endpoint: string, data?: unknown): void {
    logger.info(`LabelGrid API ${method} ${endpoint}`, {
      endpoint,
      method,
      hasData: !!data,
    });
  }

  /**
   * Check if LabelGrid API is configured
   */
  isApiConfigured(): boolean {
    return !!this.apiToken;
  }

  /**
   * Fetch available DSPs from LabelGrid API
   * This is the CORRECT method to get distribution platforms when API is configured
   * Falls back to local database when API is not available
   */
  async getAvailableDSPs(): Promise<LabelGridDSPListResponse> {
    await this.loadConfig();

    if (!this.isApiConfigured()) {
      logger.info('📦 LabelGrid not configured - using local DSP catalog');
      return this.getLocalDSPCatalog();
    }

    const endpoint = this.getEndpoint('getDSPs', '/v1/dsps');
    this.logApiCall('GET', endpoint);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<{ dsps: any[]; total: number }>(endpoint);
      });

      const dsps: LabelGridDSP[] = response.data.dsps.map((dsp: any) => ({
        id: dsp.id,
        name: dsp.name,
        slug: dsp.slug || dsp.id.toLowerCase().replace(/\s+/g, '-'),
        category: this.categorizeByRegion(dsp.region, dsp.type),
        region: dsp.region || 'global',
        isActive: dsp.active !== false,
        processingTime: dsp.processing_time || dsp.processingTime || '3-7 days',
        requirements: {
          isrc: dsp.requires_isrc ?? true,
          upc: dsp.requires_upc ?? true,
          metadata: dsp.required_metadata || ['title', 'artist', 'album'],
          audioFormats: dsp.audio_formats || ['WAV', 'FLAC'],
        },
        deliveryMethod: dsp.delivery_method || 'api',
        logoUrl: dsp.logo_url,
      }));

      logger.info(`✅ Fetched ${dsps.length} DSPs from LabelGrid API`);

      return {
        dsps,
        total: response.data.total,
        syncedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      logger.warn('⚠️  Failed to fetch DSPs from LabelGrid API - using local catalog');
      return this.getLocalDSPCatalog();
    }
  }

  /**
   * Get local DSP catalog from database as fallback
   */
  private async getLocalDSPCatalog(): Promise<LabelGridDSPListResponse> {
    try {
      const providers = await storage.getAllDSPProviders();
      
      const dsps: LabelGridDSP[] = providers.map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.metadata?.category || 'streaming',
        region: p.metadata?.region || 'global',
        isActive: p.isActive ?? true,
        processingTime: p.metadata?.processingTime || '3-7 days',
        requirements: p.metadata?.requirements || {
          isrc: true,
          upc: true,
          metadata: ['title', 'artist', 'album'],
          audioFormats: ['WAV', 'FLAC'],
        },
        deliveryMethod: p.metadata?.deliveryMethod || 'api',
        logoUrl: p.logoUrl,
      }));

      return {
        dsps,
        total: dsps.length,
        syncedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get local DSP catalog:', error);
      return { dsps: [], total: 0, syncedAt: new Date().toISOString() };
    }
  }

  /**
   * Sync DSPs from LabelGrid API to local database
   * This should be called periodically to keep local catalog updated
   */
  async syncDSPsToDatabase(): Promise<{ synced: number; updated: number; errors: string[] }> {
    const result = { synced: 0, updated: 0, errors: [] as string[] };

    if (!this.isApiConfigured()) {
      logger.info('📦 LabelGrid not configured - skipping DSP sync');
      return result;
    }

    try {
      const response = await this.getAvailableDSPs();
      
      for (const dsp of response.dsps) {
        try {
          const existing = await storage.getDSPProviderBySlug(dsp.slug);
          
          if (existing) {
            await storage.updateDSPProvider(existing.id, {
              name: dsp.name,
              isActive: dsp.isActive,
              metadata: {
                category: dsp.category,
                region: dsp.region,
                processingTime: dsp.processingTime,
                requirements: dsp.requirements,
                deliveryMethod: dsp.deliveryMethod,
                syncedFromLabelGrid: true,
                lastSyncedAt: new Date().toISOString(),
              },
            });
            result.updated++;
          } else {
            await storage.createDSPProvider({
              name: dsp.name,
              slug: dsp.slug,
              isActive: dsp.isActive,
              logoUrl: dsp.logoUrl,
              metadata: {
                category: dsp.category,
                region: dsp.region,
                processingTime: dsp.processingTime,
                requirements: dsp.requirements,
                deliveryMethod: dsp.deliveryMethod,
                syncedFromLabelGrid: true,
                lastSyncedAt: new Date().toISOString(),
              },
            });
            result.synced++;
          }
        } catch (err: any) {
          result.errors.push(`Failed to sync ${dsp.name}: ${err.message}`);
        }
      }

      logger.info(`✅ DSP sync complete: ${result.synced} new, ${result.updated} updated`);
      return result;
    } catch (error: any) {
      logger.error('Failed to sync DSPs from LabelGrid:', error);
      result.errors.push(error.message);
      return result;
    }
  }

  private categorizeByRegion(region: string, type?: string): LabelGridDSP['category'] {
    if (type === 'social' || type === 'ugc') return 'social';
    if (type === 'electronic') return 'electronic';
    if (type === 'monetization' || type === 'content_id') return 'monetization';
    
    const regionalMarkets = ['china', 'india', 'middle_east', 'africa', 'asia', 'russia', 'latin_america', 'korea', 'japan', 'taiwan'];
    if (region && regionalMarkets.some(r => region.toLowerCase().includes(r))) return 'regional';
    
    if (type === 'niche' || type === 'fitness' || type === 'gaming') return 'niche';
    if (type === 'download' || type === 'store') return 'download';
    
    return 'streaming';
  }

  async createRelease(releaseData: LabelGridRelease): Promise<LabelGridReleaseResponse> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateCreateRelease(releaseData);
    }

    const endpoint = this.getEndpoint('createRelease', '/v1/releases');
    this.logApiCall('POST', endpoint, releaseData);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.post<LabelGridReleaseResponse>(endpoint, {
          title: releaseData.title,
          artist: releaseData.artist,
          release_date: releaseData.releaseDate,
          upc: releaseData.upc,
          artwork_url: releaseData.artwork,
          genre: releaseData.genre,
          label: releaseData.label,
          copyright_year: releaseData.copyrightYear,
          copyright_owner: releaseData.copyrightOwner,
          territory_mode: releaseData.territoryMode || 'worldwide',
          territories: releaseData.territories || [],
          platforms: releaseData.platforms,
          tracks: releaseData.tracks.map((track) => ({
            title: track.title,
            artist: track.artist,
            isrc: track.isrc,
            audio_url: track.audioFile,
            duration_seconds: track.duration,
            track_number: track.trackNumber,
            explicit: track.explicit || false,
            lyrics: track.lyrics,
          })),
        });
      });

      loggingService.logInfo('LabelGrid release created successfully', {
        releaseId: response.data.releaseId,
        status: response.data.status,
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to create LabelGrid release', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getReleaseStatus(releaseId: string): Promise<LabelGridReleaseResponse> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetReleaseStatus(releaseId);
    }

    const endpoint = this.getEndpoint('getReleaseStatus', `/v1/releases/:id/status`).replace(
      ':id',
      releaseId
    );
    this.logApiCall('GET', endpoint);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridReleaseResponse>(endpoint);
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get LabelGrid release status', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async generateISRC(artist: string, title: string): Promise<LabelGridCodeResponse> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - generating local ISRC');
      return this.simulateGenerateISRC(artist, title);
    }

    const endpoint = this.getEndpoint('generateISRC', '/v1/codes/isrc');
    this.logApiCall('POST', endpoint, { artist, title });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.post<LabelGridCodeResponse>(endpoint, {
          artist,
          title,
        });
      });

      loggingService.logInfo('ISRC generated successfully', {
        code: response.data.code,
        artist,
        title,
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to generate ISRC', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async generateUPC(releaseTitle: string): Promise<LabelGridCodeResponse> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - generating local UPC');
      return this.simulateGenerateUPC(releaseTitle);
    }

    const endpoint = this.getEndpoint('generateUPC', '/v1/codes/upc');
    this.logApiCall('POST', endpoint, { releaseTitle });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.post<LabelGridCodeResponse>(endpoint, {
          release_title: releaseTitle,
        });
      });

      loggingService.logInfo('UPC generated successfully', {
        code: response.data.code,
        releaseTitle,
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to generate UPC', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getReleaseAnalytics(releaseId: string): Promise<LabelGridAnalytics> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated analytics');
      return this.simulateGetReleaseAnalytics(releaseId);
    }

    const endpoint = this.getEndpoint('getReleaseAnalytics', '/v1/releases/:id/analytics').replace(':id', releaseId);
    this.logApiCall('GET', endpoint);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridAnalytics>(endpoint);
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get LabelGrid release analytics', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async updateRelease(
    releaseId: string,
    updates: Partial<LabelGridRelease>
  ): Promise<LabelGridReleaseResponse> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateUpdateRelease(releaseId, updates);
    }

    const endpoint = this.getEndpoint('updateRelease', '/v1/releases/:id').replace(':id', releaseId);
    this.logApiCall('PATCH', endpoint, updates);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.patch<LabelGridReleaseResponse>(endpoint, updates);
      });

      loggingService.logInfo('LabelGrid release updated successfully', {
        releaseId,
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to update LabelGrid release', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async takedownRelease(releaseId: string): Promise<{ success: boolean }> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return { success: true };
    }

    const endpoint = this.getEndpoint('takedownRelease', '/v1/releases/:id/takedown').replace(':id', releaseId);
    this.logApiCall('DELETE', endpoint);

    try {
      await this.retryWithBackoff(async () => {
        return await this.client.delete(endpoint);
      });

      loggingService.logInfo('LabelGrid release takedown initiated', {
        releaseId,
      });

      return { success: true };
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to takedown LabelGrid release', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getArtistAnalytics(artistId: string): Promise<LabelGridAnalytics> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated analytics');
      return this.simulateGetArtistAnalytics(artistId);
    }

    const endpoint = this.getEndpoint('getArtistAnalytics', '/v1/artists/:id/analytics').replace(':id', artistId);
    this.logApiCall('GET', endpoint);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridAnalytics>(endpoint);
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get LabelGrid artist analytics', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      logger.warn('⚠️  LabelGrid webhook secret not configured - skipping verification');
      return true;
    }

    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch (error: unknown) {
      this.logError('Webhook signature verification failed', error);
      return false;
    }
  }

  async setPublishingMetadata(
    releaseId: string,
    metadata: LabelGridPublishingMetadata
  ): Promise<{ success: boolean; releaseId: string }> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateSetPublishingMetadata(releaseId, metadata);
    }

    const endpoint = this.getEndpoint('setPublishingMetadata', `/v1/releases/${releaseId}/publishing`);
    this.logApiCall('POST', endpoint, metadata);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.post<{ success: boolean; releaseId: string }>(endpoint, {
          writers: metadata.writers,
          publishers: metadata.publishers,
          ipi: metadata.ipi,
          pro: metadata.pro,
        });
      });

      loggingService.logInfo('Publishing metadata set successfully', { releaseId });
      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to set publishing metadata', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getPublishingMetadata(releaseId: string): Promise<LabelGridPublishingMetadata> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetPublishingMetadata(releaseId);
    }

    const endpoint = this.getEndpoint('getPublishingMetadata', `/v1/releases/${releaseId}/publishing`);
    this.logApiCall('GET', endpoint);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridPublishingMetadata>(endpoint);
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get publishing metadata', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async submitForSync(
    releaseId: string,
    data: { genres: string[]; moods: string[]; notes?: string }
  ): Promise<LabelGridSyncSubmission> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateSubmitForSync(releaseId, data);
    }

    const endpoint = this.getEndpoint('submitForSync', `/v1/releases/${releaseId}/sync`);
    this.logApiCall('POST', endpoint, data);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.post<LabelGridSyncSubmission>(endpoint, {
          genres: data.genres,
          moods: data.moods,
          notes: data.notes,
        });
      });

      loggingService.logInfo('Release submitted for sync licensing', { releaseId });
      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to submit for sync', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getSyncOpportunities(filters?: { genre?: string; minBudget?: number }): Promise<LabelGridSyncOpportunity[]> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetSyncOpportunities(filters);
    }

    const endpoint = this.getEndpoint('getSyncOpportunities', '/v1/sync/opportunities');
    this.logApiCall('GET', endpoint, filters);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridSyncOpportunity[]>(endpoint, {
          params: filters,
        });
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get sync opportunities', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async updateSyncSubmission(
    submissionId: string,
    action: 'accept' | 'reject'
  ): Promise<LabelGridSyncSubmission> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateUpdateSyncSubmission(submissionId, action);
    }

    const endpoint = this.getEndpoint('updateSyncSubmission', `/v1/sync/submissions/${submissionId}`);
    this.logApiCall('PUT', endpoint, { action });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.put<LabelGridSyncSubmission>(endpoint, { action });
      });

      loggingService.logInfo('Sync submission updated', { submissionId, action });
      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to update sync submission', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async createSmartLink(
    releaseId: string,
    options?: { customSlug?: string; platforms?: string[] }
  ): Promise<LabelGridSmartLink> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateCreateSmartLink(releaseId, options);
    }

    const endpoint = this.getEndpoint('createSmartLink', '/v1/smartlinks');
    this.logApiCall('POST', endpoint, { releaseId, ...options });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.post<LabelGridSmartLink>(endpoint, {
          release_id: releaseId,
          custom_slug: options?.customSlug,
          platforms: options?.platforms,
        });
      });

      loggingService.logInfo('Smart link created', { releaseId, linkId: response.data.id });
      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to create smart link', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getSmartLink(linkId: string): Promise<LabelGridSmartLink> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetSmartLink(linkId);
    }

    const endpoint = this.getEndpoint('getSmartLink', `/v1/smartlinks/${linkId}`);
    this.logApiCall('GET', endpoint);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridSmartLink>(endpoint);
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get smart link', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getSmartLinkAnalytics(
    linkId: string,
    dateRange?: { start: string; end: string }
  ): Promise<LabelGridSmartLinkAnalytics> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetSmartLinkAnalytics(linkId, dateRange);
    }

    const endpoint = this.getEndpoint('getSmartLinkAnalytics', `/v1/smartlinks/${linkId}/analytics`);
    this.logApiCall('GET', endpoint, dateRange);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridSmartLinkAnalytics>(endpoint, {
          params: dateRange,
        });
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get smart link analytics', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async createPreSaveCampaign(
    releaseId: string,
    startDate: string,
    endDate?: string
  ): Promise<LabelGridPreSave> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateCreatePreSaveCampaign(releaseId, startDate, endDate);
    }

    const endpoint = this.getEndpoint('createPreSaveCampaign', '/v1/presaves');
    this.logApiCall('POST', endpoint, { releaseId, startDate, endDate });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.post<LabelGridPreSave>(endpoint, {
          release_id: releaseId,
          start_date: startDate,
          end_date: endDate,
        });
      });

      loggingService.logInfo('Pre-save campaign created', { releaseId, campaignId: response.data.id });
      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to create pre-save campaign', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getPreSaveCampaign(campaignId: string): Promise<LabelGridPreSave> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetPreSaveCampaign(campaignId);
    }

    const endpoint = this.getEndpoint('getPreSaveCampaign', `/v1/presaves/${campaignId}`);
    this.logApiCall('GET', endpoint);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridPreSave>(endpoint);
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get pre-save campaign', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getPreSaveSubscribers(
    campaignId: string,
    limit?: number,
    offset?: number
  ): Promise<{ subscribers: LabelGridPreSaveSubscriber[]; total: number }> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetPreSaveSubscribers(campaignId, limit, offset);
    }

    const endpoint = this.getEndpoint('getPreSaveSubscribers', `/v1/presaves/${campaignId}/subscribers`);
    this.logApiCall('GET', endpoint, { limit, offset });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<{ subscribers: LabelGridPreSaveSubscriber[]; total: number }>(endpoint, {
          params: { limit, offset },
        });
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get pre-save subscribers', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async submitContentClaim(
    releaseId: string,
    platforms: string[]
  ): Promise<LabelGridContentClaim[]> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateSubmitContentClaim(releaseId, platforms);
    }

    const endpoint = this.getEndpoint('submitContentClaim', '/v1/contentid/claim');
    this.logApiCall('POST', endpoint, { releaseId, platforms });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.post<LabelGridContentClaim[]>(endpoint, {
          release_id: releaseId,
          platforms,
        });
      });

      loggingService.logInfo('Content claim submitted', { releaseId, platforms });
      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to submit content claim', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getContentClaims(releaseId?: string): Promise<LabelGridContentClaim[]> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetContentClaims(releaseId);
    }

    const endpoint = this.getEndpoint('getContentClaims', '/v1/contentid/claims');
    this.logApiCall('GET', endpoint, { releaseId });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridContentClaim[]>(endpoint, {
          params: releaseId ? { release_id: releaseId } : undefined,
        });
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get content claims', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getContentRevenue(dateRange?: { start: string; end: string }): Promise<LabelGridContentRevenue> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetContentRevenue(dateRange);
    }

    const endpoint = this.getEndpoint('getContentRevenue', '/v1/contentid/revenue');
    this.logApiCall('GET', endpoint, dateRange);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridContentRevenue>(endpoint, {
          params: dateRange,
        });
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get content revenue', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getRoyaltySummary(): Promise<LabelGridRoyaltySummary> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetRoyaltySummary();
    }

    const endpoint = this.getEndpoint('getRoyaltySummary', '/v1/royalties/summary');
    this.logApiCall('GET', endpoint);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridRoyaltySummary>(endpoint);
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get royalty summary', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async getRoyaltyStatements(year?: number): Promise<LabelGridRoyaltyStatement[]> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateGetRoyaltyStatements(year);
    }

    const endpoint = this.getEndpoint('getRoyaltyStatements', '/v1/royalties/statements');
    this.logApiCall('GET', endpoint, { year });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridRoyaltyStatement[]>(endpoint, {
          params: year ? { year } : undefined,
        });
      });

      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to get royalty statements', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  async requestPayout(
    amount: number,
    method?: 'paypal' | 'bank'
  ): Promise<LabelGridPayoutRequest> {
    await this.loadConfig();

    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateRequestPayout(amount, method);
    }

    const endpoint = this.getEndpoint('requestPayout', '/v1/payouts/request');
    this.logApiCall('POST', endpoint, { amount, method });

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.post<LabelGridPayoutRequest>(endpoint, {
          amount,
          method: method || 'paypal',
        });
      });

      loggingService.logInfo('Payout requested', { amount, method: method || 'paypal' });
      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as AxiosError;
      this.logError('Failed to request payout', error);
      throw new Error(`LabelGrid API error: ${axiosErr.response?.data?.message || axiosErr.message}`);
    }
  }

  private simulateCreateRelease(releaseData: LabelGridRelease): LabelGridReleaseResponse {
    const releaseId = `lg_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const estimatedLiveDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    return {
      releaseId,
      status: 'processing',
      submittedAt: new Date().toISOString(),
      estimatedLiveDate: estimatedLiveDate.toISOString(),
      platforms: releaseData.platforms.map((platform) => ({
        platform,
        status: 'processing',
      })),
    };
  }

  private simulateGetReleaseStatus(releaseId: string): LabelGridReleaseResponse {
    return {
      releaseId,
      status: 'processing',
      submittedAt: new Date().toISOString(),
      estimatedLiveDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      platforms: [
        { platform: 'spotify', status: 'processing' },
        { platform: 'apple_music', status: 'processing' },
        { platform: 'youtube_music', status: 'processing' },
      ],
    };
  }

  private simulateGenerateISRC(artist: string, title: string): LabelGridCodeResponse {
    const year = new Date().getFullYear().toString().substring(2);
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const code = `US-SIM-${year}-${randomNum}`;

    return {
      code,
      type: 'isrc',
      assignedTo: `${artist} - ${title}`,
      createdAt: new Date().toISOString(),
    };
  }

  private simulateGenerateUPC(releaseTitle: string): LabelGridCodeResponse {
    const randomNum = Math.floor(100000000000 + Math.random() * 900000000000);
    const code = randomNum.toString();

    return {
      code,
      type: 'upc',
      assignedTo: releaseTitle,
      createdAt: new Date().toISOString(),
    };
  }

  private simulateGetReleaseAnalytics(releaseId: string): LabelGridAnalytics {
    return {
      releaseId,
      totalStreams: 0,
      totalRevenue: 0,
      platforms: {},
      timeline: [],
    };
  }

  private simulateGetArtistAnalytics(artistId: string): LabelGridAnalytics {
    return {
      releaseId: artistId,
      totalStreams: 0,
      totalRevenue: 0,
      platforms: {},
      timeline: [],
    };
  }

  private simulateUpdateRelease(
    releaseId: string,
    updates: Partial<LabelGridRelease>
  ): LabelGridReleaseResponse {
    return {
      releaseId,
      status: 'processing',
      submittedAt: new Date().toISOString(),
      platforms: [],
    };
  }

  private simulateSetPublishingMetadata(
    releaseId: string,
    metadata: LabelGridPublishingMetadata
  ): { success: boolean; releaseId: string } {
    return {
      success: true,
      releaseId,
    };
  }

  private simulateGetPublishingMetadata(releaseId: string): LabelGridPublishingMetadata {
    return {
      writers: [],
      publishers: [],
      ipi: '',
      pro: '',
    };
  }

  private simulateSubmitForSync(
    releaseId: string,
    data: { genres: string[]; moods: string[]; notes?: string }
  ): LabelGridSyncSubmission {
    return {
      id: `sync_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      releaseId,
      opportunityId: '',
      status: 'pending',
      notes: data.notes,
    };
  }

  private simulateGetSyncOpportunities(filters?: { genre?: string; minBudget?: number }): LabelGridSyncOpportunity[] {
    return [];
  }

  private simulateUpdateSyncSubmission(
    submissionId: string,
    action: 'accept' | 'reject'
  ): LabelGridSyncSubmission {
    return {
      id: submissionId,
      releaseId: '',
      opportunityId: '',
      status: action === 'accept' ? 'accepted' : 'rejected',
    };
  }

  private simulateCreateSmartLink(
    releaseId: string,
    options?: { customSlug?: string; platforms?: string[] }
  ): LabelGridSmartLink {
    const id = `sl_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const slug = options?.customSlug || id;
    return {
      id,
      url: `https://smartlink.labelgrid.com/${slug}`,
      releaseId,
      platforms: options?.platforms || ['spotify', 'apple_music', 'youtube_music'],
      customSlug: options?.customSlug,
      clicks: 0,
    };
  }

  private simulateGetSmartLink(linkId: string): LabelGridSmartLink {
    return {
      id: linkId,
      url: `https://smartlink.labelgrid.com/${linkId}`,
      releaseId: '',
      platforms: ['spotify', 'apple_music', 'youtube_music'],
      clicks: 0,
    };
  }

  private simulateGetSmartLinkAnalytics(
    linkId: string,
    dateRange?: { start: string; end: string }
  ): LabelGridSmartLinkAnalytics {
    return {
      clicks: 0,
      platforms: {},
      countries: {},
    };
  }

  private simulateCreatePreSaveCampaign(
    releaseId: string,
    startDate: string,
    endDate?: string
  ): LabelGridPreSave {
    const id = `ps_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return {
      id,
      releaseId,
      url: `https://presave.labelgrid.com/${id}`,
      subscribers: 0,
      startDate,
      endDate,
      status: 'active',
    };
  }

  private simulateGetPreSaveCampaign(campaignId: string): LabelGridPreSave {
    return {
      id: campaignId,
      releaseId: '',
      url: `https://presave.labelgrid.com/${campaignId}`,
      subscribers: 0,
      startDate: new Date().toISOString(),
      status: 'active',
    };
  }

  private simulateGetPreSaveSubscribers(
    campaignId: string,
    limit?: number,
    offset?: number
  ): { subscribers: LabelGridPreSaveSubscriber[]; total: number } {
    return {
      subscribers: [],
      total: 0,
    };
  }

  private simulateSubmitContentClaim(
    releaseId: string,
    platforms: string[]
  ): LabelGridContentClaim[] {
    return platforms.map((platform) => ({
      id: `cc_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      releaseId,
      platform,
      status: 'pending' as const,
      revenue: 0,
    }));
  }

  private simulateGetContentClaims(releaseId?: string): LabelGridContentClaim[] {
    return [];
  }

  private simulateGetContentRevenue(dateRange?: { start: string; end: string }): LabelGridContentRevenue {
    return {
      total: 0,
      byPlatform: {},
      byMonth: [],
    };
  }

  private simulateGetRoyaltySummary(): LabelGridRoyaltySummary {
    return {
      pending: 0,
      available: 0,
      lifetime: 0,
      currency: 'USD',
    };
  }

  private simulateGetRoyaltyStatements(year?: number): LabelGridRoyaltyStatement[] {
    return [];
  }

  private simulateRequestPayout(
    amount: number,
    method?: 'paypal' | 'bank'
  ): LabelGridPayoutRequest {
    return {
      id: `po_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      amount,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
  }
}

export const labelGridService = new LabelGridService();
