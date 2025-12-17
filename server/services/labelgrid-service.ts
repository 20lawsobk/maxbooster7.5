import axios, { AxiosInstance, AxiosError } from 'axios';
import { loggingService } from './loggingService';
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
    const errorDetails = {
      context,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
    };

    loggingService.logError(`${context}: ${error.message}`, errorDetails);
  }

  private logApiCall(method: string, endpoint: string, data?: unknown): void {
    loggingService.logInfo(`LabelGrid API ${method} ${endpoint}`, {
      endpoint,
      method,
      hasData: !!data,
    });
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
      this.logError('Failed to create LabelGrid release', error);
      throw new Error(`LabelGrid API error: ${error.response?.data?.message || error.message}`);
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
      this.logError('Failed to get LabelGrid release status', error);
      throw new Error(`LabelGrid API error: ${error.response?.data?.message || error.message}`);
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
      this.logError('Failed to generate ISRC', error);
      throw new Error(`LabelGrid API error: ${error.response?.data?.message || error.message}`);
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
      this.logError('Failed to generate UPC', error);
      throw new Error(`LabelGrid API error: ${error.response?.data?.message || error.message}`);
    }
  }

  async getReleaseAnalytics(releaseId: string): Promise<LabelGridAnalytics> {
    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated analytics');
      return this.simulateGetReleaseAnalytics(releaseId);
    }

    this.logApiCall('GET', `/releases/${releaseId}/analytics`);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridAnalytics>(`/v1/releases/${releaseId}/analytics`);
      });

      return response.data;
    } catch (error: unknown) {
      this.logError('Failed to get LabelGrid release analytics', error);
      throw new Error(`LabelGrid API error: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateRelease(
    releaseId: string,
    updates: Partial<LabelGridRelease>
  ): Promise<LabelGridReleaseResponse> {
    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return this.simulateUpdateRelease(releaseId, updates);
    }

    this.logApiCall('PATCH', `/releases/${releaseId}`, updates);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.patch<LabelGridReleaseResponse>(
          `/v1/releases/${releaseId}`,
          updates
        );
      });

      loggingService.logInfo('LabelGrid release updated successfully', {
        releaseId,
      });

      return response.data;
    } catch (error: unknown) {
      this.logError('Failed to update LabelGrid release', error);
      throw new Error(`LabelGrid API error: ${error.response?.data?.message || error.message}`);
    }
  }

  async takedownRelease(releaseId: string): Promise<{ success: boolean }> {
    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated response');
      return { success: true };
    }

    this.logApiCall('DELETE', `/releases/${releaseId}`);

    try {
      await this.retryWithBackoff(async () => {
        return await this.client.delete(`/v1/releases/${releaseId}/takedown`);
      });

      loggingService.logInfo('LabelGrid release takedown initiated', {
        releaseId,
      });

      return { success: true };
    } catch (error: unknown) {
      this.logError('Failed to takedown LabelGrid release', error);
      throw new Error(`LabelGrid API error: ${error.response?.data?.message || error.message}`);
    }
  }

  async getArtistAnalytics(artistId: string): Promise<LabelGridAnalytics> {
    if (!this.isConfigured) {
      logger.warn('⚠️  LabelGrid not configured - returning simulated analytics');
      return this.simulateGetArtistAnalytics(artistId);
    }

    this.logApiCall('GET', `/artists/${artistId}/analytics`);

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get<LabelGridAnalytics>(`/v1/artists/${artistId}/analytics`);
      });

      return response.data;
    } catch (error: unknown) {
      this.logError('Failed to get LabelGrid artist analytics', error);
      throw new Error(`LabelGrid API error: ${error.response?.data?.message || error.message}`);
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
}

export const labelGridService = new LabelGridService();
