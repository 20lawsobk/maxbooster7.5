import { logger } from '../logger.js';

const _PORT = process.env.PORT || 5000;
const AI_MODEL_URL = process.env.AI_MODEL_SERVICE_URL || `http://127.0.0.1:${_PORT}/api/ai-service`;
const TIMEOUT_MS = 30000;

const _INTERNAL_SECRET = process.env.BOOSTERSTATE_SECRET || '';
function internalAuthHeaders(): Record<string, string> {
  return _INTERNAL_SECRET ? { Authorization: `Bearer ${_INTERNAL_SECRET}` } : {};
}

interface AIModelResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAIModel<T>(endpoint: string, body: any): Promise<AIModelResponse<T>> {
  try {
    const response = await fetchWithTimeout(`${AI_MODEL_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[PythonAI] ${endpoint} returned ${response.status}: ${errorText}`);
      return { success: false, error: `AI Model returned ${response.status}` };
    }

    const data = await response.json() as T;
    return { success: true, data };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error(`[PythonAI] ${endpoint} timed out after ${TIMEOUT_MS}ms`);
      return { success: false, error: 'AI Model request timed out' };
    }
    logger.error(`[PythonAI] ${endpoint} failed:`, err);
    return { success: false, error: 'AI Model service unavailable' };
  }
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
  visual_spec?: any;
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
  blocks: any;
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
  private available: boolean | null = null;
  private lastCheckMs = 0;
  private readonly RECHECK_INTERVAL_MS = 30_000;

  static getInstance(): PythonAIService {
    if (!PythonAIService.instance) {
      PythonAIService.instance = new PythonAIService();
    }
    return PythonAIService.instance;
  }

  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (this.available === true) return true;
    if (this.available === false && now - this.lastCheckMs < this.RECHECK_INTERVAL_MS) return false;
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/health`, {
        method: 'GET',
        headers: { ...internalAuthHeaders() },
      }, 5000);
      this.available = response.ok;
      this.lastCheckMs = now;
      if (this.available) {
        logger.info('[PythonAI] AI Content Model service is available');
      }
      return this.available;
    } catch {
      this.available = false;
      this.lastCheckMs = now;
      return false;
    }
  }

  resetAvailability(): void {
    this.available = null;
    this.lastCheckMs = 0;
  }

  async generateScript(idea: string, platform: string, goal = 'growth', tone = 'energetic'): Promise<AIModelResponse<ScriptResult>> {
    return callAIModel<ScriptResult>('/generate/script', { idea, platform, goal, tone });
  }

  async generateContent(platform: string, topic: string, tone = 'energetic', goal = 'growth', includeHashtags = true, genre?: string, artist?: string, track?: string, contentType?: string): Promise<AIModelResponse<ContentResult>> {
    return callAIModel<ContentResult>('/generate/content', {
      platform,
      topic,
      tone,
      goal,
      genre:         genre       || undefined,
      artist:        artist      || undefined,
      track:         track       || undefined,
      content_type:  contentType || undefined,
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
    return callAIModel<MultiPlatformResult>('/generate/multi-platform', {
      platforms:       options.platforms,
      topic:           options.topic,
      tone:            options.tone      || 'energetic',
      goal:            options.goal      || 'growth',
      genre:           options.genre     || undefined,
      artist:          options.artist    || undefined,
      track:           options.track     || undefined,
      content_type:    options.contentType || undefined,
      target_audience: options.targetAudience,
      format:          options.format    || 'text',
      url:             options.url,
    });
  }

  async generateDistribution(script: string, platform: string, goal = 'growth'): Promise<AIModelResponse<DistributionResult>> {
    return callAIModel<DistributionResult>('/generate/distribution', { script, platform, goal });
  }

  async createBoostSheet(options: {
    platform: string;
    content: string;
    format?: string;
    url?: string;
    goal?: string;
    tone?: string;
  }): Promise<AIModelResponse<BoostSheetResult>> {
    return callAIModel<BoostSheetResult>('/boostsheet/create', {
      platform: options.platform,
      content: options.content,
      format: options.format || 'text',
      url: options.url,
      goal: options.goal || 'growth',
      tone: options.tone || 'default',
    });
  }

  async getBoostSheet(sheetId: string): Promise<AIModelResponse<BoostSheetResult>> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/boostsheet/${sheetId}`, {
        method: 'GET',
        headers: { ...internalAuthHeaders() },
      });
      if (!response.ok) {
        return { success: false, error: `Not found: ${response.status}` };
      }
      const data = await response.json() as BoostSheetResult;
      return { success: true, data };
    } catch (err) {
      return { success: false, error: 'AI Model service unavailable' };
    }
  }

  async optimize(sheetId: string, performance: Record<string, number>, platform = 'tiktok', goal = 'growth'): Promise<AIModelResponse<any>> {
    return callAIModel<any>('/optimize', {
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
    return callAIModel<VideoResult>('/generate/video', {
      hook: options.hook || '',
      body: options.body || '',
      cta: options.cta || '',
      platform: options.platform || 'tiktok',
      aspect_ratio: options.aspect_ratio,
      template: options.template || 'cinematic_promo',
      duration: options.duration || 10.0,
      bg_color: options.bg_color,
      text_color: options.text_color,
      accent_color: options.accent_color,
      artist_name: options.artist_name,
      topic: options.topic,
      goal: options.goal || 'growth',
      tone: options.tone || 'energetic',
      quality: options.quality || 'cinematic',
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
  }): Promise<AIModelResponse<any>> {
    return callAIModel('/generate/visual-spec', {
      topic:         options.topic,
      platform:      options.platform || 'instagram',
      tone:          options.tone || 'energetic',
      artist:        options.artist || options.artist_name || '',
      track:         options.track || '',
      genre:         options.genre || '',
      thumbnail_url: options.thumbnail_url || '',
      keywords:      options.keywords || [],
      description:   options.description || '',
    });
  }

  async generateImage(options: {
    topic: string;
    platform: string;
    tone?: string;
    goal?: string;
    artist_name?: string;
    style?: string;
  }): Promise<AIModelResponse<{
    success: boolean;
    url: string;
    width: number;
    height: number;
    format: string;
    platform: string;
    prompt_used: string;
    color_scheme: { primary: string; secondary: string; accent: string; background: string };
    processing_time_ms: number;
  }>> {
    return callAIModel('/generate/image', {
      topic: options.topic,
      platform: options.platform || 'instagram',
      tone: options.tone || 'energetic',
      goal: options.goal || 'growth',
      artist_name: options.artist_name,
      style: options.style || 'modern',
    });
  }

  async startVideoJob(options: {
    hook?: string; body?: string; cta?: string; topic?: string;
    platform?: string; aspect_ratio?: string; template?: string;
    duration?: number; artist_name?: string; genre?: string;
    tone?: string; goal?: string; quality?: string;
    user_audio_path?: string;
    voiceover?: boolean;
  }): Promise<AIModelResponse<{ job_id: string; status: string }>> {
    return callAIModel<{ job_id: string; status: string }>('/generate-video', {
      hook: options.hook || '',
      body: options.body || '',
      cta: options.cta || '',
      topic: options.topic,
      platform: options.platform || 'tiktok',
      aspect_ratio: options.aspect_ratio,
      template: options.template || 'cinematic_promo',
      duration: options.duration || 10,
      artist_name: options.artist_name,
      genre: options.genre || 'hip-hop',
      tone: options.tone || 'energetic',
      goal: options.goal || 'growth',
      quality: options.quality || 'cinematic',
      user_audio_path: options.user_audio_path || undefined,
      voiceover: options.voiceover || false,
    });
  }

  async getVideoJobStatus(jobId: string): Promise<AIModelResponse<any>> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/video-job/${jobId}`, {
        method: 'GET',
        headers: { ...internalAuthHeaders() },
      }, 10000);
      if (!response.ok) {
        return { success: false, error: `Job status check failed: ${response.status}` };
      }
      const data = await response.json();
      return { success: true, data };
    } catch {
      return { success: false, error: 'AI Model service unavailable' };
    }
  }

  async getCinematicTemplates(): Promise<AIModelResponse<any>> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/cinematic-templates`, {
        method: 'GET',
        headers: { ...internalAuthHeaders() },
      }, 10000);
      if (!response.ok) {
        return { success: false, error: `Failed to fetch templates: ${response.status}` };
      }
      const data = await response.json();
      return { success: true, data };
    } catch {
      return { success: false, error: 'AI Model service unavailable' };
    }
  }

  async checkHealth(): Promise<AIModelResponse<HealthResult>> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/health`, {
        method: 'GET',
        headers: { ...internalAuthHeaders() },
      }, 5000);
      if (!response.ok) {
        return { success: false, error: `Health check failed: ${response.status}` };
      }
      const data = await response.json() as HealthResult;
      return { success: true, data };
    } catch {
      return { success: false, error: 'AI Model service unavailable' };
    }
  }

  async analyzeAudio(filePath: string, detailed = false): Promise<AIModelResponse<any>> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/analyze/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
        body: JSON.stringify({ file_path: filePath, detailed }),
      }, 60000);
      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `Audio analysis failed: ${err}` };
      }
      const data = await response.json();
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: `Audio analysis error: ${e.message}` };
    }
  }

  async getAudioFeatureInfo(): Promise<AIModelResponse<any>> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/analyze/audio-features`, {
        method: 'GET',
        headers: { ...internalAuthHeaders() },
      }, 5000);
      if (!response.ok) {
        return { success: false, error: 'Failed to get audio feature info' };
      }
      const data = await response.json();
      return { success: true, data };
    } catch {
      return { success: false, error: 'AI Model service unavailable' };
    }
  }

  async transcribeToMidi(filePath: string): Promise<AIModelResponse<any>> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/analyze/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
        body: JSON.stringify({ file_path: filePath }),
      }, 120000);
      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `MIDI transcription failed: ${err}` };
      }
      const data = await response.json();
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: `MIDI transcription error: ${e.message}` };
    }
  }
}

export const pythonAIService = PythonAIService.getInstance();
