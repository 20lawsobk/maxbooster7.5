import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  body: any;
  headers: Record<string, string>;
  statusCode: number;
  timestamp: number;
  etag: string;
}

class APIResponseCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 20_000;
  private hitCount = 0;
  private missCount = 0;

  private generateETag(body: any): string {
    let hash = 0;
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `"${Math.abs(hash).toString(36)}"`;
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      this.hitCount++;
      return entry;
    }
    this.missCount++;
    return undefined;
  }

  set(key: string, entry: CacheEntry): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, entry);
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  invalidateForUser(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`u:${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: this.hitCount + this.missCount > 0 
        ? (this.hitCount / (this.hitCount + this.missCount) * 100).toFixed(1) + '%' 
        : '0%',
    };
  }
}

export const apiCache = new APIResponseCache();

interface CacheOptions {
  ttlSeconds?: number;
  varyByUser?: boolean;
  varyByQuery?: boolean;
}

export function cacheMiddleware(options: CacheOptions = {}) {
  const { ttlSeconds = 30, varyByUser = true, varyByQuery = true } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const userId = varyByUser ? ((req.session as any)?.userId || 'anon') : 'shared';
    const queryStr = varyByQuery ? JSON.stringify(req.query) : '';
    const cacheKey = `u:${userId}:${req.path}:${queryStr}`;

    const cached = apiCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < ttlSeconds * 1000) {
        const clientETag = req.headers['if-none-match'];
        if (clientETag && clientETag === cached.etag) {
          return res.status(304).end();
        }

        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Age', Math.round(age / 1000).toString());
        res.setHeader('ETag', cached.etag);
        res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`);
        
        for (const [key, value] of Object.entries(cached.headers)) {
          if (key.toLowerCase() !== 'transfer-encoding') {
            res.setHeader(key, value);
          }
        }
        
        return res.status(cached.statusCode).json(cached.body);
      }
    }

    const originalJson = res.json.bind(res);
    res.json = function(body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const etag = apiCache['generateETag'](body);
        apiCache.set(cacheKey, {
          body,
          headers: {
            'Content-Type': 'application/json',
          },
          statusCode: res.statusCode,
          timestamp: Date.now(),
          etag,
        });
        
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`);
      }
      return originalJson(body);
    };

    next();
  };
}

export function invalidateCacheOnMutation() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const userId = (req.session as any)?.userId;
      if (userId) {
        apiCache.invalidateForUser(userId);
      }
      
      const basePath = req.path.split('/').slice(0, 4).join('/');
      apiCache.invalidatePattern(basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
    next();
  };
}
