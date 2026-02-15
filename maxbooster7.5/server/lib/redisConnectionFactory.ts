import { getBoosterStateClient, isBoosterStateHealthy, shutdownBoosterState } from './boosterStateClient.js';
import { logger } from '../logger.js';

export type RedisClientType = any;

export async function getRedisClient(): Promise<any> {
  try {
    return await getBoosterStateClient();
  } catch (error: unknown) {
    logger.warn('⚠️ BoosterState not available, falling back to in-memory operation');
    return null;
  }
}

export async function isRedisHealthy(): Promise<boolean> {
  return await isBoosterStateHealthy();
}

export async function shutdownRedis(): Promise<void> {
  return await shutdownBoosterState();
}
