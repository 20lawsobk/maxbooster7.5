import { Request, Response, NextFunction } from 'express';
import { idempotencyService, IdempotencyOptions } from '../services/idempotencyService.js';
import { logger } from '../logger.js';

export interface IdempotencyMiddlewareOptions {
  ttl?: number;
  prefix?: string;
  headerName?: string;
  generateKey?: (req: Request) => string | null;
  skipMethods?: string[];
  successOnly?: boolean;
}

const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const X_IDEMPOTENCY_HEADER = 'X-Idempotency-Key';

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  timestamp: string;
}

export function idempotencyMiddleware(options: IdempotencyMiddlewareOptions = {}) {
  const {
    ttl = 86400,
    prefix = 'api:',
    headerName = IDEMPOTENCY_HEADER,
    generateKey,
    skipMethods = ['GET', 'HEAD', 'OPTIONS'],
    successOnly = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skipMethods.includes(req.method)) {
      return next();
    }

    let idempotencyKey: string | null = null;

    if (generateKey) {
      idempotencyKey = generateKey(req);
    }

    if (!idempotencyKey) {
      idempotencyKey = req.get(headerName) || req.get(X_IDEMPOTENCY_HEADER) || null;
    }

    if (!idempotencyKey) {
      return next();
    }

    const fullKey = `${prefix}${req.method}:${req.path}:${idempotencyKey}`;

    try {
      const cached = await idempotencyService.get<CachedResponse>(fullKey, {
        ttlSeconds: ttl,
        prefix: 'idempotency:middleware:',
      });

      if (cached) {
        logger.info(`Idempotency cache hit for ${req.method} ${req.path} (key: ${idempotencyKey})`);

        res.set('X-Idempotency-Replayed', 'true');
        res.set('X-Idempotency-Cached-At', cached.timestamp);

        if (cached.headers) {
          Object.entries(cached.headers).forEach(([key, value]) => {
            if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
              res.set(key, value);
            }
          });
        }

        return res.status(cached.statusCode).json(cached.body);
      }

      const canProcess = await idempotencyService.markProcessing(fullKey, {
        ttlSeconds: 60,
        prefix: 'idempotency:middleware:',
      });

      if (!canProcess) {
        logger.warn(`Concurrent request detected for idempotency key: ${idempotencyKey}`);
        return res.status(409).json({
          error: 'Request already in progress',
          message: 'A request with this idempotency key is currently being processed. Please wait and retry.',
          retryAfter: 5,
        });
      }

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const captureAndCache = async (body: any) => {
        await idempotencyService.clearProcessing(fullKey, {
          prefix: 'idempotency:middleware:',
        });

        const shouldCache = successOnly ? res.statusCode >= 200 && res.statusCode < 300 : true;

        if (shouldCache) {
          const headersToCache: Record<string, string> = {};
          const cacheableHeaders = ['content-type', 'x-request-id', 'x-correlation-id'];

          cacheableHeaders.forEach((header) => {
            const value = res.get(header);
            if (value) {
              headersToCache[header] = value;
            }
          });

          const cachedResponse: CachedResponse = {
            statusCode: res.statusCode,
            headers: headersToCache,
            body,
            timestamp: new Date().toISOString(),
          };

          await idempotencyService.set(fullKey, cachedResponse, {
            ttlSeconds: ttl,
            prefix: 'idempotency:middleware:',
          });

          logger.info(`Idempotency response cached for ${req.method} ${req.path} (key: ${idempotencyKey})`);
        }
      };

      res.json = function (body: any) {
        captureAndCache(body).catch((err) => {
          logger.error('Error caching idempotency response:', err);
        });
        return originalJson(body);
      };

      res.send = function (body: any) {
        if (typeof body === 'object') {
          captureAndCache(body).catch((err) => {
            logger.error('Error caching idempotency response:', err);
          });
        }
        return originalSend(body);
      };

      res.on('close', async () => {
        if (!res.writableEnded) {
          await idempotencyService.clearProcessing(fullKey, {
            prefix: 'idempotency:middleware:',
          });
        }
      });

      next();
    } catch (error: unknown) {
      logger.error('Idempotency middleware error:', error);
      next();
    }
  };
}

export function webhookIdempotency(options: { ttl?: number; prefix?: string } = {}) {
  const { ttl = 86400 * 7, prefix = 'webhook:' } = options;

  return async (
    eventId: string,
    eventType: string,
    handler: () => Promise<any>
  ): Promise<{ processed: boolean; result?: any; cached?: boolean }> => {
    const key = idempotencyService.generateWebhookKey(eventId, eventType);

    const existingResult = await idempotencyService.check(key, {
      ttlSeconds: ttl,
      prefix,
    });

    if (existingResult.exists) {
      logger.info(`Webhook already processed: ${eventType} (${eventId})`);
      return {
        processed: true,
        result: existingResult.result,
        cached: true,
      };
    }

    const canProcess = await idempotencyService.markProcessing(key, {
      ttlSeconds: 300,
      prefix,
    });

    if (!canProcess) {
      logger.warn(`Webhook currently being processed: ${eventType} (${eventId})`);
      return {
        processed: false,
        cached: false,
      };
    }

    try {
      const result = await handler();

      await idempotencyService.set(key, { success: true, result }, {
        ttlSeconds: ttl,
        prefix,
      });

      await idempotencyService.clearProcessing(key, { prefix });

      return {
        processed: true,
        result,
        cached: false,
      };
    } catch (error: unknown) {
      await idempotencyService.clearProcessing(key, { prefix });
      throw error;
    }
  };
}

export async function checkWebhookIdempotency(
  eventId: string,
  eventType: string,
  ttl: number = 86400 * 7
): Promise<{ alreadyProcessed: boolean; cachedResult?: any }> {
  const key = idempotencyService.generateWebhookKey(eventId, eventType);
  const result = await idempotencyService.check(key, {
    ttlSeconds: ttl,
    prefix: 'webhook:',
  });

  return {
    alreadyProcessed: result.exists,
    cachedResult: result.result,
  };
}

export async function markWebhookProcessed(
  eventId: string,
  eventType: string,
  result: any,
  ttl: number = 86400 * 7
): Promise<void> {
  const key = idempotencyService.generateWebhookKey(eventId, eventType);
  await idempotencyService.set(key, { success: true, result }, {
    ttlSeconds: ttl,
    prefix: 'webhook:',
  });
}

export async function checkPayoutIdempotency(
  userId: string,
  amount: number,
  currency: string
): Promise<{ alreadyProcessed: boolean; cachedResult?: any }> {
  const key = idempotencyService.generatePayoutKey(userId, amount, currency);
  const result = await idempotencyService.check(key, {
    ttlSeconds: 300,
    prefix: 'payout:',
  });

  return {
    alreadyProcessed: result.exists,
    cachedResult: result.result,
  };
}

export async function markPayoutProcessed(
  userId: string,
  amount: number,
  currency: string,
  result: any
): Promise<void> {
  const key = idempotencyService.generatePayoutKey(userId, amount, currency);
  await idempotencyService.set(key, result, {
    ttlSeconds: 3600,
    prefix: 'payout:',
  });
}

export { idempotencyService };
