import { MaxCoreAIClient } from "./maxcoreClient.js";
import { ensureMaxCoreAudioAsset } from "./maxcoreAssetTransport.js";
import { getMaxcoreOrigin } from "./maxcoreConnector.js";

interface AIModelResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function callAIModel<T>(
  endpoint: string,
  _body: Record<string, unknown>,
): Promise<AIModelResponse<T>> {
  return {
    success: false,
    error: `Legacy Python AI endpoint ${endpoint} is disabled; no verified MaxCore contract with authenticated ownership is available`,
  };
}

export interface ScriptResult {
  success: boolean;
  hook: string;
  body: string;
  cta: string;
  platform: string;
  processing_time_ms: number;
}

export interface ContentResult {
  success: boolean;
  platform: string;
  caption: string;
  content: string;
  hashtags: string[];
  hook: string;
  body: string;
  cta: string;
  video_hook?: string;
  video_body?: string;
  video_cta?: string;
  visual_spec?: Record<string, unknown>;
  posting_time?: string;
  processing_time_ms: number;
}

export interface MultiPlatformResult {
  success: boolean;
  generated_content: Array<{
    platform: string;
    caption: string;
    content: string;
    hashtags: string[];
    posting_time: string;
    hook: string;
    body: string;
    cta: string;
    video_hook?: string;
    video_body?: string;
    video_cta?: string;
    format: string;
    target_audience?: string;
    sourceUrl?: string;
  }>;
  processing_time_ms: number;
}

export interface DistributionResult {
  success: boolean;
  caption: string;
  content: string;
  hashtags: string[];
  posting_time: string;
  platform: string;
}

export interface BoostSheetResult {
  success: boolean;
  sheet_id: string;
  type: string;
  platform: string;
  blocks: Record<string, unknown>;
  history: string[];
}

export interface VideoResult {
  success: boolean;
  filename: string;
  url: string;
  duration: number;
  width: number;
  height: number;
  aspect_ratio: string;
  template: string;
  platform: string;
  hook: string;
  body: string;
  cta: string;
  source: string;
  processing_time_ms: number;
  error?: string;
}

export interface HealthResult {
  status: string;
  model_loaded: boolean;
  vocab_size: number;
  device: string;
  version: string;
}

export class PythonAIService {
  private static instance: PythonAIService;

  static getInstance(): PythonAIService {
    if (!PythonAIService?.instance) {
      PythonAIService.instance = new PythonAIService();
    }
    return PythonAIService?.instance;
  }

  async isAvailable(): Promise<boolean> {
    return MaxCoreAIClient.isAvailable();
  }

  resetAvailability(): void {
    // Availability is queried directly from MaxCore; no local state is cached.
  }

  async generateScript(
    idea: string,
    platform: string,
    goal = "growth",
    tone = "energetic",
  ): Promise<AIModelResponse<ScriptResult>> {
    return callAIModel<ScriptResult>("/generate/script", {
      idea,
      platform,
      goal,
      tone,
    });
  }

  async generateContent(
    platform: string,
    topic: string,
    tone = "energetic",
    goal = "growth",
    includeHashtags = true,
    genre?: string,
    artist?: string,
    track?: string,
    contentType?: string,
  ): Promise<AIModelResponse<ContentResult>> {
    return callAIModel<ContentResult>("/generate/content", {
      platform,
      topic,
      tone,
      goal,
      genre: genre || undefined,
      artist: artist || undefined,
      track: track || undefined,
      content_type: contentType || undefined,
      include_hashtags: includeHashtags,
      include_distribution: true,
    });
  }

  async generateMultiPlatform(options: {
    platforms: string[];
    topic: string;
    tone?: string;
    goal?: string;
    genre?: string;
    artist?: string;
    track?: string;
    contentType?: string;
    targetAudience?: string;
    format?: string;
    url?: string;
  }): Promise<AIModelResponse<MultiPlatformResult>> {
    return callAIModel<MultiPlatformResult>("/generate/multi-platform", {
      platforms: options.platforms,
      topic: options.topic,
      tone: options.tone || "energetic",
      goal: options.goal || "growth",
      genre: options.genre || undefined,
      artist: options.artist || undefined,
      track: options.track || undefined,
      content_type: options.contentType || undefined,
      target_audience: options.targetAudience,
      format: options.format || "text",
      url: options.url,
    });
  }

  async generateDistribution(
    script: string,
    platform: string,
    goal = "growth",
  ): Promise<AIModelResponse<DistributionResult>> {
    return callAIModel<DistributionResult>("/generate/distribution", {
      script,
      platform,
      goal,
    });
  }

  async createBoostSheet(options: {
    platform: string;
    content: string;
    format?: string;
    url?: string;
    goal?: string;
    tone?: string;
  }): Promise<AIModelResponse<BoostSheetResult>> {
    return callAIModel<BoostSheetResult>("/boostsheet/create", {
      platform: options.platform,
      content: options.content,
      format: options.format || "text",
      url: options.url,
      goal: options.goal || "growth",
      tone: options.tone || "default",
    });
  }

  async getBoostSheet(
    _sheetId: string,
  ): Promise<AIModelResponse<BoostSheetResult>> {
    return {
      success: false,
      error: "Legacy boost-sheet jobs have no verified MaxCore contract",
    };
  }

  async optimize(
    sheetId: string,
    performance: Record<string, number>,
    platform = "tiktok",
    goal = "growth",
  ): Promise<AIModelResponse<unknown>> {
    return callAIModel<unknown>("/optimize", {
      sheet_id: sheetId,
      performance,
      platform,
      goal,
    });
  }

  async generateVideo(options: {
    hook?: string;
    body?: string;
    cta?: string;
    platform?: string;
    aspect_ratio?: string;
    template?: string;
    duration?: number;
    bg_color?: string;
    text_color?: string;
    accent_color?: string;
    artist_name?: string;
    topic?: string;
    goal?: string;
    tone?: string;
    quality?: string;
  }): Promise<AIModelResponse<VideoResult>> {
    return callAIModel<VideoResult>("/generate/video", {
      hook: options.hook || "",
      body: options.body || "",
      cta: options.cta || "",
      platform: options.platform || "tiktok",
      aspect_ratio: options.aspect_ratio,
      template: options.template || "cinematic_promo",
      duration: options.duration || 10.0,
      bg_color: options.bg_color,
      text_color: options.text_color,
      accent_color: options.accent_color,
      artist_name: options.artist_name,
      topic: options.topic,
      goal: options.goal || "growth",
      tone: options.tone || "energetic",
      quality: options.quality || "cinematic",
    });
  }

  async generateVisualSpec(options: {
    topic: string;
    platform: string;
    tone?: string;
    goal?: string;
    artist_name?: string;
    style?: string;
    // URL analysis context
    artist?: string;
    track?: string;
    genre?: string;
    thumbnail_url?: string;
    keywords?: string[];
    description?: string;
  }): Promise<AIModelResponse<unknown>> {
    return callAIModel("/generate/visual-spec", {
      topic: options.topic,
      platform: options.platform || "instagram",
      tone: options.tone || "energetic",
      artist: options.artist || options?.artist_name || "",
      track: options.track || "",
      genre: options.genre || "",
      thumbnail_url: options.thumbnail_url || "",
      keywords: options.keywords || [],
      description: options.description || "",
    });
  }

  async generateImage(options: {
    topic: string;
    platform: string;
    tone?: string;
    goal?: string;
    artist_name?: string;
    style?: string;
  }): Promise<
    AIModelResponse<{
      success: boolean;
      url: string;
      width: number;
      height: number;
      format: string;
      platform: string;
      prompt_used: string;
      color_scheme: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
      };
      processing_time_ms: number;
    }>
  > {
    return callAIModel("/generate/image", {
      topic: options.topic,
      platform: options.platform || "instagram",
      tone: options.tone || "energetic",
      goal: options.goal || "growth",
      artist_name: options.artist_name,
      style: options.style || "modern",
    });
  }

  async startVideoJob(options: {
    hook?: string;
    body?: string;
    cta?: string;
    topic?: string;
    platform?: string;
    aspect_ratio?: string;
    template?: string;
    duration?: number;
    artist_name?: string;
    genre?: string;
    tone?: string;
    goal?: string;
    quality?: string;
    user_audio_path?: string;
    voiceover?: boolean;
  }): Promise<AIModelResponse<{ job_id: string; status: string }>> {
    return callAIModel<{ job_id: string; status: string }>("/generate-video", {
      hook: options.hook || "",
      body: options.body || "",
      cta: options.cta || "",
      topic: options.topic,
      platform: options.platform || "tiktok",
      aspect_ratio: options.aspect_ratio,
      template: options.template || "cinematic_promo",
      duration: options.duration || 10,
      artist_name: options.artist_name,
      genre: options.genre || "hip-hop",
      tone: options.tone || "energetic",
      goal: options.goal || "growth",
      quality: options.quality || "cinematic",
      user_audio_path: options.user_audio_path || undefined,
      voiceover: options.voiceover || false,
    });
  }

  async getVideoJobStatus(jobId: string): Promise<AIModelResponse<unknown>> {
    void jobId;
    return {
      success: false,
      error:
        "Video job polling requires authenticated MaxCore job ownership transport",
    };
  }

  async getCinematicTemplates(): Promise<AIModelResponse<unknown>> {
    return {
      success: false,
      error: "Legacy cinematic templates have no verified MaxCore contract",
    };
  }

  async checkHealth(): Promise<AIModelResponse<HealthResult>> {
    const available = await MaxCoreAIClient.isAvailable();
    return available
      ? {
          success: true,
          data: {
            status: "available",
            model_loaded: true,
            vocab_size: 0,
            device: "maxcore",
            version: "maxcore",
          },
        }
      : { success: false, error: "MaxCore unavailable" };
  }

  async analyzeAudio(
    filePath: string,
    detailed = false,
    userId?: string,
  ): Promise<AIModelResponse<unknown>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: "Authenticated owner identity is required for audio analysis",
        };
      }
      if (/^https?:\/\//i.test(filePath)) {
        const candidate = new URL(filePath);
        const maxcore = new URL(getMaxcoreOrigin());
        if (
          candidate.origin !== maxcore.origin ||
          !candidate.pathname.startsWith("/uploads/audio-inputs/")
        ) {
          return {
            success: false,
            error: "Remote audio URLs are not accepted for owned-asset analysis",
          };
        }
      }
      if (filePath.includes("..")) {
        return {
          success: false,
          error: "Invalid owned audio asset path",
        };
      }
      const audioUrl = await ensureMaxCoreAudioAsset(filePath, userId);
      const data = await MaxCoreAIClient.generate<Record<string, unknown>>(
        "/api/audio/analyze",
        {
          user_id: userId,
          audio_url: audioUrl,
          context: { detailed },
        },
      );
      if (!data || data.source !== "maxcore_audio_conductor") {
        return { success: false, error: "MaxCore audio conductor unavailable" };
      }
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: `MaxCore audio analysis failed: ${(error as Error).message}`,
      };
    }
  }

  async getAudioFeatureInfo(): Promise<AIModelResponse<unknown>> {
    return {
      success: true,
      data: {
        available: true,
        source: "maxcore_audio_conductor",
        features: [
          "bpm",
          "beats",
          "downbeats",
          "onsets",
          "energy_envelope",
          "band_envelopes",
          "sections",
          "key",
          "mode",
          "key_confidence",
        ],
      },
    };
  }

  async transcribeToMidi(filePath: string): Promise<AIModelResponse<unknown>> {
    void filePath;
    return {
      success: false,
      error: "MaxCore has no verified audio-to-MIDI contract",
    };
  }
}

export const pythonAIService = PythonAIService?.getInstance();
