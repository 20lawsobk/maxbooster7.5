import { logger } from '../logger.js';

const AI_MODEL_URL = process.env.AI_MODEL_SERVICE_URL || 'http://127.0.0.1:9878';
const VEO_TIMEOUT_MS = 60000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = VEO_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export interface VeoCampaignRequest {
  track_id?: string;
  title: string;
  artist: string;
  album?: string;
  story?: string;
  mood?: string;
  era?: string;
  references?: string[];
  label?: string;
  brand_notes?: string;
  lyrics?: string;
  primary_platforms?: string[];
  campaign_notes?: string;
  targets?: Array<{
    platform: string;
    goal?: string;
    duration_sec?: number;
    aspect_ratio?: string;
  }>;
  audio_duration_sec?: number;
}

export interface VeoAsset {
  platform: string;
  goal: string;
  duration_sec: number;
  aspect_ratio: string;
  fps: number;
  frame_count: number;
  resolution: string;
  status: string;
  video_url: string;
}

export interface VeoCampaignResult {
  success: boolean;
  campaign?: {
    track_id: string;
    artist: string;
    title: string;
    master_video?: VeoAsset;
    assets: VeoAsset[];
    generation_time_s: number;
    gpu_ops: number;
    gpu_compute_ms: number;
    total_platforms: number;
    total_frames: number;
  };
  error?: string;
}

export interface VeoPlatformInfo {
  default_duration_sec: number;
  default_aspect_ratio: string;
  default_fps: number;
}

class VeoMusicService {
  private static instance: VeoMusicService;

  static getInstance(): VeoMusicService {
    if (!VeoMusicService.instance) {
      VeoMusicService.instance = new VeoMusicService();
    }
    return VeoMusicService.instance;
  }

  async generateCampaign(request: VeoCampaignRequest): Promise<VeoCampaignResult> {
    try {
      logger.info(`[VeoMusic] Generating campaign for "${request.title}" by ${request.artist}`);
      logger.info(`[VeoMusic] Platforms: ${(request.primary_platforms || ['tiktok', 'youtube', 'instagram']).join(', ')}`);

      const response = await fetchWithTimeout(`${AI_MODEL_URL}/veo/campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[VeoMusic] Campaign generation failed: ${response.status} - ${errorText}`);
        return { success: false, error: `Veo pipeline returned ${response.status}` };
      }

      const data = await response.json() as VeoCampaignResult;

      if (data.success && data.campaign) {
        logger.info(`[VeoMusic] Campaign generated: ${data.campaign.total_platforms} platforms, ${data.campaign.total_frames} frames in ${data.campaign.generation_time_s}s`);
      }

      return data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.error(`[VeoMusic] Campaign generation timed out after ${VEO_TIMEOUT_MS}ms`);
        return { success: false, error: 'Veo campaign generation timed out' };
      }
      logger.error('[VeoMusic] Campaign generation failed:', err);
      return { success: false, error: 'Veo Music service unavailable' };
    }
  }

  async getAvailablePlatforms(): Promise<any> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/veo/platforms`, {
        method: 'GET',
      }, 10000);

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getAvailableGoals(): Promise<any> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/veo/goals`, {
        method: 'GET',
      }, 10000);

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getRecommendedGoals(platform: string): Promise<any> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/veo/recommend/${platform}`, {
        method: 'GET',
      }, 10000);

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getPipelineStatus(): Promise<any> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/veo/status`, {
        method: 'GET',
      }, 10000);

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async generateForPost(options: {
    title: string;
    artist: string;
    platform: string;
    mood?: string;
    story?: string;
    lyrics?: string;
    tone?: string;
  }): Promise<VeoAsset | null> {
    const result = await this.generateCampaign({
      title: options.title,
      artist: options.artist,
      mood: options.mood || options.tone || 'energetic',
      story: options.story || '',
      lyrics: options.lyrics,
      primary_platforms: [options.platform],
    });

    if (!result.success || !result.campaign) return null;

    const asset = result.campaign.assets.find(a => a.platform === options.platform);
    return asset || result.campaign.assets[0] || null;
  }
}

export const veoMusicService = VeoMusicService.getInstance();
