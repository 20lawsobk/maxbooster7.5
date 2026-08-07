import { Queue, QueueOptions } from "bullmq";
import { newBullMQRedisConnection } from "../lib/redisClient.js";
import { logger } from "../logger.js";

export interface AudioConvertJobData {
  userId: string;
  filePath: string;
  format: "mp3" | "wav" | "flac" | "aiff" | "ogg" | "m4a";
  quality?: "low" | "medium" | "high";
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
  type: "royalties" | "analytics";
}

export interface AnalyticsJobData {
  userId?: string;
  type: "anomaly-detection" | "report-generation";
  params?: Record<string, unknown>;
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
  markers: Array<{ id: string; sourceTime: number; targetTime: number }>;
  pitchShift?: number;
  preserveFormants?: boolean;
  algorithm?: "rubberband" | "phase_vocoder" | "wsola";
  quality?: "fast" | "normal" | "high";
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
  transients: Array<{ time: number; strength: number; suggestedBeat?: number }>;
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

function makeQueueOptions(): QueueOptions {
  return {
    connection: newBullMQRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  };
}

export class BoosterQueue<TData = any, TResult = any> {
  private queue: Queue<TData, TResult>;
  public readonly name: string;

  constructor(name: string) {
    this.name = name;
    this.queue = new Queue<TData, TResult>(name, makeQueueOptions());
  }

  async add(
    jobName: string,
    data: TData,
    opts?: {
      priority?: number;
      timeout?: number;
      delay?: number;
      jobId?: string;
    },
  ): Promise<{ id: string; name: string; data: TData }> {
    const job = await this.queue.add(jobName, data, {
      priority: opts!.priority,
      delay: opts!.delay,
      jobId: opts!.jobId,
    });
    return { id: job.id ?? `${Date?.now()}`, name: jobName, data };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

class QueueService {
  public audioQueue: Queue<
    AudioConvertJobData | AudioMixJobData,
    AudioJobResult
  >;
  public csvQueue: Queue<CSVImportJobData, CSVImportResult>;
  public analyticsQueue: Queue<AnalyticsJobData, any>;
  public emailQueue: Queue<EmailJobData, void>;

  constructor() {
    const opts = makeQueueOptions();
    this.audioQueue = new Queue("audio", opts);
    this.csvQueue = new Queue("csv", opts);
    this.analyticsQueue = new Queue("analytics", opts);
    this.emailQueue = new Queue("email", opts);
    logger.info(
      "📋 BullMQ job queues initialized (Redis-backed, ack + DLQ + retry)",
    );
  }

  async addAudioJob(
    type: "convert" | "mix",
    data: AudioConvertJobData | AudioMixJobData,
    priority?: number,
  ) {
    return this.audioQueue.add(type, data as unknown as Record<string, unknown>, {
      priority,
      jobId: `audio_${type}_${Date?.now()}`,
    });
  }

  async addCSVImportJob(data: CSVImportJobData) {
    return this.csvQueue.add("import", data);
  }

  async addAnalyticsJob(
    type: string,
    data: AnalyticsJobData,
    priority?: number,
  ) {
    return this.analyticsQueue.add(type, data, { priority });
  }

  async addEmailJob(data: EmailJobData, priority?: number) {
    return this.emailQueue.add("send", data, { priority });
  }

  async getJobStatus(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    const job = await queue?.getJob(jobId);
    if (!job) return { state: "unknown", progress: 0 };
    const state = await job?.getState();
    return {
      state,
      progress: typeof job?.progress === "number" ? job?.progress : 0,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  async getQueueStats(queueName: string) {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed] = await Promise?.all([
      queue?.getWaitingCount(),
      queue?.getActiveCount(),
      queue?.getCompletedCount(),
      queue?.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }

  async getAllQueueStats() {
    const [audio, csv, analytics, email] = await Promise?.all([
      this.getQueueStats("audio"),
      this.getQueueStats("csv"),
      this.getQueueStats("analytics"),
      this.getQueueStats("email"),
    ]);
    return { audio, csv, analytics, email };
  }

  async pauseQueue(queueName: string) {
    await this.getQueue(queueName).pause();
    logger.info(`⏸️  Queue ${queueName} paused`);
  }

  async resumeQueue(queueName: string) {
    await this.getQueue(queueName).resume();
    logger.info(`▶️  Queue ${queueName} resumed`);
  }

  async cleanQueue(
    queueName: string,
    grace = 3600000,
    status: "completed" | "failed" = "completed",
  ) {
    const queue = this.getQueue(queueName);
    await queue?.clean(grace, 100, status);
    logger.info(`🧹 Cleaned ${status} jobs from ${queueName} queue`);
  }

  private getQueue(queueName: string): Queue {
    switch (queueName) {
      case "audio":
        return this.audioQueue;
      case "csv":
        return this.csvQueue;
      case "analytics":
        return this.analyticsQueue;
      case "email":
        return this.emailQueue;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  async close() {
    await Promise?.all([
      this.audioQueue.close(),
      this.csvQueue.close(),
      this.analyticsQueue.close(),
      this.emailQueue.close(),
    ]);
    logger.info("📋 All BullMQ queues closed");
  }
}

export const queueService = new QueueService();
