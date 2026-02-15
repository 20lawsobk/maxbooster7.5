import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger.js';

interface CacheEntry {
  data: any;
  timestamp: number;
  etag: string;
  contentType: string;
}

interface CacheConfig {
  ttlMs: number;
  maxEntries: number;
  enabled: boolean;
}

class InMemoryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = [];
  private config: CacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      ttlMs: 60000,
      maxEntries: 10000,
      enabled: true,
      ...config,
    };

    setInterval(() => this.cleanup(), 60000);
  }

  private generateEtag(data: any): string {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `"${Math.abs(hash).toString(16)}"`;
  }

  set(key: string, data: any, contentType: string = 'application/json'): void {
    if (!this.config.enabled) return;

    if (this.cache.size >= this.config.maxEntries) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      etag: this.generateEtag(data),
      contentType,
    });

    const existingIndex = this.accessOrder.indexOf(key);
    if (existingIndex > -1) {
      this.accessOrder.splice(existingIndex, 1);
    }
    this.accessOrder.push(key);
  }

  get(key: string): CacheEntry | null {
    if (!this.config.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }

    return entry;
  }

  invalidate(pattern: string | RegExp): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (typeof pattern === 'string') {
        if (key.includes(pattern)) {
          keysToDelete.push(key);
        }
      } else {
        if (pattern.test(key)) {
          keysToDelete.push(key);
        }
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.ttlMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
  }

  getStats(): { hits: number; misses: number; hitRate: number; size: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size,
    };
  }
}

const globalCache = new InMemoryCache({
  ttlMs: 30000,
  maxEntries: 10000,
});

const shortTermCache = new InMemoryCache({
  ttlMs: 5000,
  maxEntries: 5000,
});

const longTermCache = new InMemoryCache({
  ttlMs: 300000,
  maxEntries: 2000,
});

interface CachingMiddlewareOptions {
  ttlMs?: number;
  keyGenerator?: (req: Request) => string;
  shouldCache?: (req: Request, res: Response) => boolean;
  cacheInstance?: InMemoryCache;
}

export const createCachingMiddleware = (options: CachingMiddlewareOptions = {}): RequestHandler => {
  const cache = options.cacheInstance || globalCache;
  
  const generateKey = options.keyGenerator || ((req: Request) => {
    const userId = (req as any).user?.id || 'anonymous';
    return `${req.method}:${req.originalUrl}:${userId}`;
  });

  const shouldCache = options.shouldCache || ((req: Request) => {
    return req.method === 'GET' && !req.originalUrl.includes('/auth/');
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!shouldCache(req, res)) {
      next();
      return;
    }

    const key = generateKey(req);
    const cached = cache.get(key);

    if (cached) {
      const clientEtag = req.headers['if-none-match'];
      
      if (clientEtag === cached.etag) {
        res.status(304).end();
        return;
      }

      res.setHeader('X-Cache', 'HIT');
      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.setHeader('Content-Type', cached.contentType);
      
      if (typeof cached.data === 'object') {
        res.json(cached.data);
      } else {
        res.send(cached.data);
      }
      return;
    }

    res.setHeader('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = (data: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, data, 'application/json');
      }
      return originalJson(data);
    };

    res.send = (data: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const contentType = res.getHeader('Content-Type') as string || 'text/html';
        cache.set(key, data, contentType);
      }
      return originalSend(data);
    };

    next();
  };
};

export const apiResponseCache = createCachingMiddleware({
  cacheInstance: shortTermCache,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || 'anon';
    return `api:${req.originalUrl}:${userId}`;
  },
  shouldCache: (req) => {
    if (req.method !== 'GET') return false;
    
    const noCachePaths = [
      '/api/auth',
      '/api/user/profile',
      '/api/notifications',
      '/api/messages',
    ];
    
    return !noCachePaths.some(path => req.originalUrl.startsWith(path));
  },
});

export const staticDataCache = createCachingMiddleware({
  cacheInstance: longTermCache,
  keyGenerator: (req) => `static:${req.originalUrl}`,
  shouldCache: (req) => {
    const staticPaths = [
      '/api/distribution/platforms',
      '/api/marketplace/categories',
      '/api/genres',
      '/api/instruments',
    ];
    return req.method === 'GET' && staticPaths.some(p => req.originalUrl.startsWith(p));
  },
});

export const noCacheMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
};

export const getCacheStats = () => ({
  global: globalCache.getStats(),
  shortTerm: shortTermCache.getStats(),
  longTerm: longTermCache.getStats(),
});

export const invalidateCache = (pattern: string | RegExp) => {
  globalCache.invalidate(pattern);
  shortTermCache.invalidate(pattern);
  longTermCache.invalidate(pattern);
};

export const clearAllCaches = () => {
  globalCache.clear();
  shortTermCache.clear();
  longTermCache.clear();
};

export { globalCache, shortTermCache, longTermCache, InMemoryCache };
