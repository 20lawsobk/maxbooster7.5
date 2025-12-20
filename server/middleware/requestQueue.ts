import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger.js';

interface QueuedRequest {
  id: string;
  req: Request;
  res: Response;
  next: NextFunction;
  timestamp: number;
  priority: number;
  timeout: NodeJS.Timeout;
}

interface QueueConfig {
  maxQueueSize: number;
  maxConcurrent: number;
  requestTimeout: number;
  priorityLevels: number;
}

class RequestQueue {
  private queues: Map<number, QueuedRequest[]> = new Map();
  private processing = 0;
  private config: QueueConfig;
  private stats = {
    queued: 0,
    processed: 0,
    rejected: 0,
    timedOut: 0,
  };

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      maxQueueSize: 10000,
      maxConcurrent: 500,
      requestTimeout: 30000,
      priorityLevels: 3,
      ...config,
    };

    for (let i = 0; i < this.config.priorityLevels; i++) {
      this.queues.set(i, []);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getTotalQueueSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  enqueue(req: Request, res: Response, next: NextFunction): boolean {
    if (this.getTotalQueueSize() >= this.config.maxQueueSize) {
      this.stats.rejected++;
      return false;
    }

    const priority = this.determinePriority(req);
    const id = this.generateId();

    const timeout = setTimeout(() => {
      this.handleTimeout(id, priority);
    }, this.config.requestTimeout);

    const queuedRequest: QueuedRequest = {
      id,
      req,
      res,
      next,
      timestamp: Date.now(),
      priority,
      timeout,
    };

    this.queues.get(priority)!.push(queuedRequest);
    this.stats.queued++;

    this.processQueue();

    return true;
  }

  private determinePriority(req: Request): number {
    const user = (req as any).user;
    
    if (user?.subscriptionTier === 'enterprise') return 0;
    if (user?.subscriptionTier === 'pro') return 1;
    
    if (req.path.includes('/health') || req.path.includes('/status')) return 0;
    
    return 2;
  }

  private processQueue(): void {
    if (this.processing >= this.config.maxConcurrent) {
      return;
    }

    for (let priority = 0; priority < this.config.priorityLevels; priority++) {
      const queue = this.queues.get(priority)!;
      
      while (queue.length > 0 && this.processing < this.config.maxConcurrent) {
        const request = queue.shift()!;
        this.processRequest(request);
      }
    }
  }

  private processRequest(queuedRequest: QueuedRequest): void {
    this.processing++;
    clearTimeout(queuedRequest.timeout);

    const originalEnd = queuedRequest.res.end.bind(queuedRequest.res);
    
    queuedRequest.res.end = (...args: any[]) => {
      this.processing--;
      this.stats.processed++;
      
      setImmediate(() => this.processQueue());
      
      return originalEnd(...args);
    };

    const waitTime = Date.now() - queuedRequest.timestamp;
    queuedRequest.res.setHeader('X-Queue-Wait-Ms', waitTime);

    queuedRequest.next();
  }

  private handleTimeout(id: string, priority: number): void {
    const queue = this.queues.get(priority)!;
    const index = queue.findIndex(r => r.id === id);
    
    if (index !== -1) {
      const request = queue.splice(index, 1)[0];
      this.stats.timedOut++;
      
      if (!request.res.headersSent) {
        request.res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'Request timed out in queue. Please try again.',
          retryAfter: 5,
        });
      }
    }
  }

  getStats() {
    const queueSizes: Record<string, number> = {};
    for (const [priority, queue] of this.queues.entries()) {
      queueSizes[`priority_${priority}`] = queue.length;
    }

    return {
      ...this.stats,
      currentlyProcessing: this.processing,
      queueSizes,
      totalQueued: this.getTotalQueueSize(),
    };
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      for (const request of queue) {
        clearTimeout(request.timeout);
        if (!request.res.headersSent) {
          request.res.status(503).json({
            error: 'Queue cleared',
            message: 'The request queue was cleared.',
          });
        }
      }
      queue.length = 0;
    }
  }
}

const globalRequestQueue = new RequestQueue({
  maxQueueSize: 50000,
  maxConcurrent: 1000,
  requestTimeout: 30000,
  priorityLevels: 3,
});

export const createQueueMiddleware = (queueInstance?: RequestQueue): RequestHandler => {
  const queue = queueInstance || globalRequestQueue;

  return (req: Request, res: Response, next: NextFunction): void => {
    const shouldSkipQueue = 
      req.path.startsWith('/api/health') ||
      req.path.startsWith('/api/monitoring') ||
      req.method === 'OPTIONS';

    if (shouldSkipQueue) {
      next();
      return;
    }

    const enqueued = queue.enqueue(req, res, next);
    
    if (!enqueued) {
      res.status(503).json({
        error: 'Service overloaded',
        message: 'Too many requests. Please try again in a few seconds.',
        retryAfter: 5,
      });
    }
  };
};

export const requestQueueMiddleware = createQueueMiddleware();

export const getQueueStats = () => globalRequestQueue.getStats();

export const clearRequestQueue = () => globalRequestQueue.clear();

export class LoadShedder {
  private shedding = false;
  private threshold = 0.9;
  private recoveryThreshold = 0.7;

  constructor(private queue: RequestQueue = globalRequestQueue) {
    setInterval(() => this.evaluate(), 5000);
  }

  private evaluate(): void {
    const stats = this.queue.getStats();
    const utilization = stats.currentlyProcessing / 1000;

    if (!this.shedding && utilization > this.threshold) {
      this.shedding = true;
      logger.warn(`Load shedding ACTIVATED - utilization at ${(utilization * 100).toFixed(1)}%`);
    } else if (this.shedding && utilization < this.recoveryThreshold) {
      this.shedding = false;
      logger.info(`Load shedding DEACTIVATED - utilization at ${(utilization * 100).toFixed(1)}%`);
    }
  }

  shouldShed(req: Request): boolean {
    if (!this.shedding) return false;

    const user = (req as any).user;
    if (user?.subscriptionTier === 'enterprise') return false;
    if (req.path.includes('/health') || req.path.includes('/critical')) return false;

    return Math.random() > 0.5;
  }

  middleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (this.shouldShed(req)) {
        res.status(503).json({
          error: 'Service overloaded',
          message: 'Server is under heavy load. Please try again shortly.',
          retryAfter: Math.floor(Math.random() * 10) + 5,
        });
        return;
      }
      next();
    };
  }
}

export const loadShedder = new LoadShedder();
export const loadSheddingMiddleware = loadShedder.middleware();

export { RequestQueue, globalRequestQueue };
