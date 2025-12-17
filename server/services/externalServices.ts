import {
  CircuitBreaker,
  circuitBreakerRegistry,
  withTimeout,
  CircuitBreakerError,
  TimeoutError,
} from './circuitBreaker.js';
import { logger } from '../logger.js';
import { getRedisClient } from '../lib/redisConnectionFactory.js';

const CACHE_PREFIX = 'circuit_breaker:cache:';
const CACHE_TTL = 300;

export const stripeCircuit = new CircuitBreaker({
  name: 'stripe',
  failureThreshold: 3,
  resetTimeout: 30000,
  monitorInterval: 5000,
  timeout: 15000,
  successThreshold: 2,
});

export const sendgridCircuit = new CircuitBreaker({
  name: 'sendgrid',
  failureThreshold: 5,
  resetTimeout: 60000,
  monitorInterval: 5000,
  timeout: 10000,
  successThreshold: 3,
});

export const socialApiCircuit = new CircuitBreaker({
  name: 'socialApi',
  failureThreshold: 5,
  resetTimeout: 45000,
  monitorInterval: 5000,
  timeout: 20000,
  successThreshold: 3,
});

export const twitterCircuit = new CircuitBreaker({
  name: 'twitter',
  failureThreshold: 5,
  resetTimeout: 60000,
  monitorInterval: 5000,
  timeout: 15000,
  successThreshold: 3,
});

export const facebookCircuit = new CircuitBreaker({
  name: 'facebook',
  failureThreshold: 5,
  resetTimeout: 60000,
  monitorInterval: 5000,
  timeout: 20000,
  successThreshold: 3,
});

export const instagramCircuit = new CircuitBreaker({
  name: 'instagram',
  failureThreshold: 5,
  resetTimeout: 60000,
  monitorInterval: 5000,
  timeout: 20000,
  successThreshold: 3,
});

export const linkedinCircuit = new CircuitBreaker({
  name: 'linkedin',
  failureThreshold: 5,
  resetTimeout: 60000,
  monitorInterval: 5000,
  timeout: 15000,
  successThreshold: 3,
});

export const tiktokCircuit = new CircuitBreaker({
  name: 'tiktok',
  failureThreshold: 5,
  resetTimeout: 60000,
  monitorInterval: 5000,
  timeout: 25000,
  successThreshold: 3,
});

export const youtubeCircuit = new CircuitBreaker({
  name: 'youtube',
  failureThreshold: 5,
  resetTimeout: 60000,
  monitorInterval: 5000,
  timeout: 30000,
  successThreshold: 3,
});

export const aiServiceCircuit = new CircuitBreaker({
  name: 'aiService',
  failureThreshold: 3,
  resetTimeout: 45000,
  monitorInterval: 5000,
  timeout: 30000,
  successThreshold: 2,
});

export const labelGridCircuit = new CircuitBreaker({
  name: 'labelGrid',
  failureThreshold: 5,
  resetTimeout: 60000,
  monitorInterval: 5000,
  timeout: 20000,
  successThreshold: 3,
});

export const dspCircuit = new CircuitBreaker({
  name: 'dsp',
  failureThreshold: 5,
  resetTimeout: 120000,
  monitorInterval: 10000,
  timeout: 30000,
  successThreshold: 3,
});

circuitBreakerRegistry.register(stripeCircuit);
circuitBreakerRegistry.register(sendgridCircuit);
circuitBreakerRegistry.register(socialApiCircuit);
circuitBreakerRegistry.register(twitterCircuit);
circuitBreakerRegistry.register(facebookCircuit);
circuitBreakerRegistry.register(instagramCircuit);
circuitBreakerRegistry.register(linkedinCircuit);
circuitBreakerRegistry.register(tiktokCircuit);
circuitBreakerRegistry.register(youtubeCircuit);
circuitBreakerRegistry.register(aiServiceCircuit);
circuitBreakerRegistry.register(labelGridCircuit);
circuitBreakerRegistry.register(dspCircuit);

function setupCircuitBreakerLogging(): void {
  const circuits = circuitBreakerRegistry.getAll();

  circuits.forEach((circuit) => {
    circuit.on('state_change', (event) => {
      logger.warn(
        `🔌 Circuit ${event.name} state changed: ${event.previousState} → ${event.newState}`
      );
    });

    circuit.on('failure', (event) => {
      logger.warn(`⚠️ Circuit ${event.name} failure: ${event.error?.message || 'Unknown error'}`);
    });

    circuit.on('timeout', (event) => {
      logger.warn(`⏱️ Circuit ${event.name} timeout`);
    });
  });
}

setupCircuitBreakerLogging();

async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const cached = await redis.get(`${CACHE_PREFIX}${key}`);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return null;
  } catch (error) {
    logger.debug(`Cache read error for ${key}:`, error);
    return null;
  }
}

async function setCachedData<T>(key: string, data: T, ttl: number = CACHE_TTL): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.set(`${CACHE_PREFIX}${key}`, JSON.stringify(data), { EX: ttl });
  } catch (error) {
    logger.debug(`Cache write error for ${key}:`, error);
  }
}

interface RetryQueueItem {
  id: string;
  serviceName: string;
  operation: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  nextRetry: Date;
  createdAt: Date;
}

const retryQueue: Map<string, RetryQueueItem> = new Map();

export function queueForRetry(
  serviceName: string,
  operation: string,
  payload: unknown,
  maxAttempts: number = 3
): string {
  const id = `${serviceName}:${operation}:${Date.now()}`;

  retryQueue.set(id, {
    id,
    serviceName,
    operation,
    payload,
    attempts: 0,
    maxAttempts,
    nextRetry: new Date(Date.now() + 30000),
    createdAt: new Date(),
  });

  logger.info(`📥 Queued operation for retry: ${id}`);
  return id;
}

export function getRetryQueue(): RetryQueueItem[] {
  return Array.from(retryQueue.values());
}

export function clearRetryQueue(): void {
  retryQueue.clear();
}

export interface FallbackResult<T> {
  data: T;
  source: 'live' | 'cache' | 'fallback';
  warning?: string;
}

export async function executeWithFallback<T>(
  circuit: CircuitBreaker,
  operation: () => Promise<T>,
  options: {
    cacheKey?: string;
    cacheTtl?: number;
    fallbackValue?: T;
    queueOnFailure?: boolean;
    operationName?: string;
    payload?: unknown;
  } = {}
): Promise<FallbackResult<T>> {
  const { cacheKey, cacheTtl, fallbackValue, queueOnFailure, operationName, payload } = options;

  try {
    const result = await circuit.execute(operation);

    if (cacheKey) {
      await setCachedData(cacheKey, result, cacheTtl);
    }

    return { data: result, source: 'live' };
  } catch (error) {
    const errorMessage =
      error instanceof CircuitBreakerError || error instanceof TimeoutError
        ? error.message
        : (error as Error).message;

    logger.warn(`⚠️ ${circuit.name} operation failed: ${errorMessage}`);

    if (cacheKey) {
      const cached = await getCachedData<T>(cacheKey);
      if (cached !== null) {
        logger.info(`📦 Using cached data for ${circuit.name}`);
        return {
          data: cached,
          source: 'cache',
          warning: `Using cached data due to: ${errorMessage}`,
        };
      }
    }

    if (queueOnFailure && operationName) {
      queueForRetry(circuit.name, operationName, payload);
    }

    if (fallbackValue !== undefined) {
      return {
        data: fallbackValue,
        source: 'fallback',
        warning: `Using fallback value due to: ${errorMessage}`,
      };
    }

    throw error;
  }
}

export async function executeStripeOperation<T>(
  operation: () => Promise<T>,
  options?: {
    cacheKey?: string;
    fallbackValue?: T;
  }
): Promise<FallbackResult<T>> {
  return executeWithFallback(stripeCircuit, operation, {
    ...options,
    queueOnFailure: true,
    operationName: 'stripe_operation',
  });
}

export async function executeSendgridOperation<T>(
  operation: () => Promise<T>,
  options?: {
    cacheKey?: string;
    fallbackValue?: T;
    queueOnFailure?: boolean;
    emailData?: unknown;
  }
): Promise<FallbackResult<T>> {
  return executeWithFallback(sendgridCircuit, operation, {
    ...options,
    queueOnFailure: options?.queueOnFailure ?? true,
    operationName: 'sendgrid_email',
    payload: options?.emailData,
  });
}

export async function executeSocialApiOperation<T>(
  platform: 'twitter' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'youtube' | 'generic',
  operation: () => Promise<T>,
  options?: {
    cacheKey?: string;
    cacheTtl?: number;
    fallbackValue?: T;
    queueOnFailure?: boolean;
    postData?: unknown;
  }
): Promise<FallbackResult<T>> {
  const circuitMap: Record<string, CircuitBreaker> = {
    twitter: twitterCircuit,
    facebook: facebookCircuit,
    instagram: instagramCircuit,
    linkedin: linkedinCircuit,
    tiktok: tiktokCircuit,
    youtube: youtubeCircuit,
    generic: socialApiCircuit,
  };

  const circuit = circuitMap[platform] || socialApiCircuit;

  return executeWithFallback(circuit, operation, {
    ...options,
    queueOnFailure: options?.queueOnFailure ?? true,
    operationName: `${platform}_api_call`,
    payload: options?.postData,
  });
}

export async function executeAiOperation<T>(
  operation: () => Promise<T>,
  options?: {
    cacheKey?: string;
    cacheTtl?: number;
    fallbackValue?: T;
  }
): Promise<FallbackResult<T>> {
  return executeWithFallback(aiServiceCircuit, operation, {
    ...options,
    queueOnFailure: false,
  });
}

export async function executeLabelGridOperation<T>(
  operation: () => Promise<T>,
  options?: {
    cacheKey?: string;
    cacheTtl?: number;
    fallbackValue?: T;
    queueOnFailure?: boolean;
  }
): Promise<FallbackResult<T>> {
  return executeWithFallback(labelGridCircuit, operation, {
    ...options,
    queueOnFailure: options?.queueOnFailure ?? true,
    operationName: 'labelgrid_operation',
  });
}

export async function executeDspOperation<T>(
  operation: () => Promise<T>,
  options?: {
    cacheKey?: string;
    cacheTtl?: number;
    fallbackValue?: T;
    queueOnFailure?: boolean;
  }
): Promise<FallbackResult<T>> {
  return executeWithFallback(dspCircuit, operation, {
    ...options,
    queueOnFailure: options?.queueOnFailure ?? true,
    operationName: 'dsp_operation',
  });
}

export function getCircuitHealthSummary() {
  return circuitBreakerRegistry.getHealthSummary();
}

export function getCircuitStats(name: string) {
  const circuit = circuitBreakerRegistry.get(name);
  return circuit?.getStats() || null;
}

export function resetCircuit(name: string): boolean {
  const circuit = circuitBreakerRegistry.get(name);
  if (circuit) {
    circuit.reset();
    return true;
  }
  return false;
}

export function resetAllCircuits(): void {
  circuitBreakerRegistry.resetAll();
}

export {
  CircuitBreaker,
  CircuitBreakerError,
  TimeoutError,
  withTimeout,
  circuitBreakerRegistry,
};

logger.info('🔌 External service circuit breakers initialized');
