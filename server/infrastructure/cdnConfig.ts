import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

interface CDNConfig {
  enabled: boolean;
  provider: 'cloudflare' | 'fastly' | 'cloudfront' | 'custom';
  baseUrl: string;
  staticAssetPaths: string[];
  cacheControlRules: CacheRule[];
  purgeApiKey?: string;
  purgeEndpoint?: string;
}

interface CacheRule {
  pattern: RegExp | string;
  maxAge: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  private?: boolean;
  immutable?: boolean;
}

const DEFAULT_CACHE_RULES: CacheRule[] = [
  { pattern: /\.(js|css)$/, maxAge: 31536000, immutable: true },
  { pattern: /\.(png|jpg|jpeg|gif|webp|svg|ico)$/, maxAge: 2592000 },
  { pattern: /\.(woff|woff2|ttf|eot)$/, maxAge: 31536000, immutable: true },
  { pattern: /\.(mp3|wav|ogg|flac)$/, maxAge: 86400 },
  { pattern: /\.(mp4|webm)$/, maxAge: 86400 },
  { pattern: '/api/health', maxAge: 5 },
  { pattern: '/api/marketplace', maxAge: 60, staleWhileRevalidate: 300 },
  { pattern: '/api/ai', maxAge: 0, private: true },
];

class CDNManager {
  private static instance: CDNManager;
  private config: CDNConfig;

  private constructor() {
    this.config = {
      enabled: process.env.CDN_ENABLED === 'true',
      provider: (process.env.CDN_PROVIDER as any) || 'cloudflare',
      baseUrl: process.env.CDN_BASE_URL || '',
      staticAssetPaths: ['/static', '/assets', '/uploads', '/audio'],
      cacheControlRules: DEFAULT_CACHE_RULES,
      purgeApiKey: process.env.CDN_PURGE_API_KEY,
      purgeEndpoint: process.env.CDN_PURGE_ENDPOINT,
    };
  }

  static getInstance(): CDNManager {
    if (!CDNManager.instance) {
      CDNManager.instance = new CDNManager();
    }
    return CDNManager.instance;
  }

  getAssetUrl(path: string): string {
    if (!this.config.enabled || !this.config.baseUrl) {
      return path;
    }
    return `${this.config.baseUrl}${path}`;
  }

  getCacheHeaders(path: string): Record<string, string> {
    const headers: Record<string, string> = {};
    
    for (const rule of this.config.cacheControlRules) {
      const matches = typeof rule.pattern === 'string' 
        ? path.includes(rule.pattern)
        : rule.pattern.test(path);
      
      if (matches) {
        const directives: string[] = [];
        
        if (rule.private) {
          directives.push('private');
        } else {
          directives.push('public');
        }
        
        directives.push(`max-age=${rule.maxAge}`);
        
        if (rule.staleWhileRevalidate) {
          directives.push(`stale-while-revalidate=${rule.staleWhileRevalidate}`);
        }
        
        if (rule.staleIfError) {
          directives.push(`stale-if-error=${rule.staleIfError}`);
        }
        
        if (rule.immutable) {
          directives.push('immutable');
        }
        
        headers['Cache-Control'] = directives.join(', ');
        break;
      }
    }
    
    if (!headers['Cache-Control']) {
      headers['Cache-Control'] = 'no-cache';
    }
    
    return headers;
  }

  async purgeCache(paths: string[]): Promise<boolean> {
    if (!this.config.purgeEndpoint || !this.config.purgeApiKey) {
      logger.warn('CDN purge not configured');
      return false;
    }

    try {
      const response = await fetch(this.config.purgeEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.purgeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: paths }),
      });

      if (response.ok) {
        logger.info(`CDN cache purged for ${paths.length} paths`);
        return true;
      } else {
        logger.error('CDN purge failed:', await response.text());
        return false;
      }
    } catch (error) {
      logger.error('CDN purge error:', error);
      return false;
    }
  }

  async purgeAll(): Promise<boolean> {
    if (!this.config.purgeEndpoint || !this.config.purgeApiKey) {
      logger.warn('CDN purge not configured');
      return false;
    }

    try {
      const response = await fetch(this.config.purgeEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.purgeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purge_everything: true }),
      });

      if (response.ok) {
        logger.info('CDN cache fully purged');
        return true;
      } else {
        logger.error('CDN full purge failed:', await response.text());
        return false;
      }
    } catch (error) {
      logger.error('CDN full purge error:', error);
      return false;
    }
  }

  getConfig(): CDNConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }
}

export const cdnManager = CDNManager.getInstance();

export function cdnCacheMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headers = cdnManager.getCacheHeaders(req.path);
  
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  
  next();
}

export function cdnAssetUrlHelper(path: string): string {
  return cdnManager.getAssetUrl(path);
}
