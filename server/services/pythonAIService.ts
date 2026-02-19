import { logger } from '../logger.js';

const AI_MODEL_URL = process.env.AI_MODEL_SERVICE_URL || 'http://127.0.0.1:9878';
const TIMEOUT_MS = 30000;

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
      headers: { 'Content-Type': 'application/json' },
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

  static getInstance(): PythonAIService {
    if (!PythonAIService.instance) {
      PythonAIService.instance = new PythonAIService();
    }
    return PythonAIService.instance;
  }

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/health`, {
        method: 'GET',
      }, 5000);
      this.available = response.ok;
      if (this.available) {
        logger.info('[PythonAI] AI Content Model service is available');
      }
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  resetAvailability(): void {
    this.available = null;
  }

  async generateScript(idea: string, platform: string, goal = 'growth', tone = 'energetic'): Promise<AIModelResponse<ScriptResult>> {
    return callAIModel<ScriptResult>('/generate/script', { idea, platform, goal, tone });
  }

  async generateContent(platform: string, topic: string, tone = 'energetic', goal = 'growth', includeHashtags = true): Promise<AIModelResponse<ContentResult>> {
    return callAIModel<ContentResult>('/generate/content', {
      platform,
      topic,
      tone,
      goal,
      include_hashtags: includeHashtags,
      include_distribution: true,
    });
  }

  async generateMultiPlatform(options: {
    platforms: string[];
    topic: string;
    tone?: string;
    goal?: string;
    targetAudience?: string;
    format?: string;
    url?: string;
  }): Promise<AIModelResponse<MultiPlatformResult>> {
    return callAIModel<MultiPlatformResult>('/generate/multi-platform', {
      platforms: options.platforms,
      topic: options.topic,
      tone: options.tone || 'energetic',
      goal: options.goal || 'growth',
      target_audience: options.targetAudience,
      format: options.format || 'text',
      url: options.url,
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

  async checkHealth(): Promise<AIModelResponse<HealthResult>> {
    try {
      const response = await fetchWithTimeout(`${AI_MODEL_URL}/health`, {
        method: 'GET',
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
}

export const pythonAIService = PythonAIService.getInstance();
