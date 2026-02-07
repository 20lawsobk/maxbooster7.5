import { getBoosterStateClient } from '../lib/boosterStateClient.js';
import { config } from '../config/defaults.js';
import { logger } from '../logger.js';

export interface AudioConvertJobData {
  userId: string;
  filePath: string;
  format: 'mp3' | 'wav' | 'flac' | 'aiff' | 'ogg' | 'm4a';
  quality?: 'low' | 'medium' | 'high';
  storageKey?: string;
}

export interface AudioMixJobData {
  userId: string;
  tracks: Array<{ storageKey: string; volume: number }>;
  outputFormat: string;
}

export interface CSVImportJobData {
  userId: string;
  storageKey: string;
  type: 'royalties' | 'analytics';
}

export interface AnalyticsJobData {
  userId?: string;
  type: 'anomaly-detection' | 'report-generation';
  params?: any;
}

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface WarpJobPayload {
  userId: string;
  clipId: string;
  storageKey: string;
  markers: Array<{
    id: string;
    sourceTime: number;
    targetTime: number;
  }>;
  pitchShift?: number;
  preserveFormants?: boolean;
  algorithm?: 'rubberband' | 'phase_vocoder' | 'wsola';
  quality?: 'fast' | 'normal' | 'high';
}

export interface WarpPreviewPayload extends WarpJobPayload {
  startTime: number;
  endTime: number;
  previewDuration?: number;
}

export interface TransientDetectionPayload {
  userId: string;
  clipId: string;
  storageKey: string;
  sensitivity?: number;
  minTransientGap?: number;
}

export interface WarpJobResult {
  storageKey: string;
  duration: number;
  format: string;
  markers?: Array<{
    sourceTime: number;
    targetTime: number;
    transientStrength?: number;
  }>;
}

export interface TransientDetectionResult {
  transients: Array<{
    time: number;
    strength: number;
    suggestedBeat?: number;
  }>;
  detectedBpm?: number;
  duration: number;
}

export interface AudioJobResult {
  storageKey: string;
  duration: number;
  format: string;
}

export interface CSVImportResult {
  rowsProcessed: number;
  errors: number;
  duration: number;
}

export class BoosterQueue<TData = any, TResult = any> {
  public readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async add(jobName: string, data: TData, opts?: { priority?: number; timeout?: number; delay?: number; jobId?: string }): Promise<{ id: string; name: string; data: TData }> {
    try {
      const client = await getBoosterStateClient();
      const payload = JSON.stringify({ name: jobName, data, opts });
      const id = client
        ? await client.queuePush(this.name, payload, opts?.priority)
        : `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return { id: id || `local_${Date.now()}`, name: jobName, data };
    } catch (error) {
      logger.warn(`Failed to add job to queue ${this.name}:`, error);
      return { id: `fallback_${Date.now()}`, name: jobName, data };
    }
  }

  async close(): Promise<void> {
    // No persistent connection to close
  }
}

class QueueService {
  public audioQueue: BoosterQueue<AudioConvertJobData | AudioMixJobData, AudioJobResult>;
  public csvQueue: BoosterQueue<CSVImportJobData, CSVImportResult>;
  public analyticsQueue: BoosterQueue<AnalyticsJobData, any>;
  public emailQueue: BoosterQueue<EmailJobData, void>;

  constructor() {
    this.audioQueue = new BoosterQueue('audio');
    this.csvQueue = new BoosterQueue('csv');
    this.analyticsQueue = new BoosterQueue('analytics');
    this.emailQueue = new BoosterQueue('email');

    logger.info('📋 Job queues initialized (boosterstate-backed)');
  }

  async addAudioJob(
    type: 'convert' | 'mix',
    data: AudioConvertJobData | AudioMixJobData,
    priority?: number
  ): Promise<{ id: string; name: string; data: AudioConvertJobData | AudioMixJobData }> {
    return await this.audioQueue.add(type, data, {
      priority,
      timeout: config.queue.timeout.audio,
    });
  }

  async addCSVImportJob(data: CSVImportJobData): Promise<{ id: string; name: string; data: CSVImportJobData }> {
    return await this.csvQueue.add('import', data, {
      timeout: config.queue.timeout.csv,
    });
  }

  async addAnalyticsJob(
    type: string,
    data: AnalyticsJobData,
    priority?: number
  ): Promise<{ id: string; name: string; data: AnalyticsJobData }> {
    return await this.analyticsQueue.add(type, data, {
      priority,
      timeout: config.queue.timeout.analytics,
    });
  }

  async addEmailJob(data: EmailJobData, priority?: number): Promise<{ id: string; name: string; data: EmailJobData }> {
    return await this.emailQueue.add('send', data, {
      priority,
      timeout: config.queue.timeout.email,
    });
  }

  async getJobStatus(
    queueName: string,
    jobId: string
  ): Promise<{
    state: string;
    progress: number;
    result?: any;
    failedReason?: string;
  }> {
    return {
      state: 'unknown',
      progress: 0,
      result: undefined,
      failedReason: undefined,
    };
  }

  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    return { waiting: 0, active: 0, completed: 0, failed: 0 };
  }

  async getAllQueueStats(): Promise<Record<string, any>> {
    const [audio, csv, analytics, email] = await Promise.all([
      this.getQueueStats('audio'),
      this.getQueueStats('csv'),
      this.getQueueStats('analytics'),
      this.getQueueStats('email'),
    ]);

    return { audio, csv, analytics, email };
  }

  async pauseQueue(queueName: string): Promise<void> {
    logger.info(`⏸️  Queue ${queueName} pause requested (no-op with boosterstate)`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    logger.info(`▶️  Queue ${queueName} resume requested (no-op with boosterstate)`);
  }

  async cleanQueue(
    queueName: string,
    grace: number = 3600000,
    status: 'completed' | 'failed' = 'completed'
  ): Promise<void> {
    logger.info(`🧹 Clean ${status} jobs from ${queueName} queue (no-op with boosterstate)`);
  }

  private getQueue(queueName: string): BoosterQueue {
    switch (queueName) {
      case 'audio':
        return this.audioQueue;
      case 'csv':
        return this.csvQueue;
      case 'analytics':
        return this.analyticsQueue;
      case 'email':
        return this.emailQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  async close(): Promise<void> {
    await Promise.all([
      this.audioQueue.close(),
      this.csvQueue.close(),
      this.analyticsQueue.close(),
      this.emailQueue.close(),
    ]);

    logger.info('📋 All queues closed');
  }
}

export const queueService = new QueueService();
