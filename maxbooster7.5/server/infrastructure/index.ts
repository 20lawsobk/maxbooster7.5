export { distributedCache, DistributedCache } from './distributedCache.js';
export { CircuitBreaker, circuitBreakerRegistry } from './circuitBreaker.js';
export { cdnManager, cdnCacheMiddleware, cdnAssetUrlHelper } from './cdnConfig.js';
export { autoScalingManager, scalingMetricsRouter } from './autoScaling.js';
export { clusterSessionManager } from './clusterSession.js';

import { logger } from '../logger.js';
import { distributedCache } from './distributedCache.js';
import { clusterSessionManager } from './clusterSession.js';
import { autoScalingManager } from './autoScaling.js';
import { circuitBreakerRegistry } from './circuitBreaker.js';

export async function initializeInfrastructure(): Promise<void> {
  logger.info('════════════════════════════════════════════════════════');
  logger.info('🏗️ INITIALIZING SCALABLE INFRASTRUCTURE');
  logger.info('════════════════════════════════════════════════════════');

  try {
    await distributedCache.connect();
    logger.info('   ✓ Distributed cache initialized');
  } catch (error) {
    logger.warn('   ⚠️ Distributed cache using fallback mode:', error);
  }

  try {
    await clusterSessionManager.initialize();
    logger.info(`   ✓ Session manager initialized (${clusterSessionManager.getStatus().mode} mode)`);
  } catch (error) {
    logger.warn('   ⚠️ Session manager using memory store:', error);
  }

  logger.info('════════════════════════════════════════════════════════');
  logger.info('✅ INFRASTRUCTURE READY FOR SCALE');
  logger.info('════════════════════════════════════════════════════════');
}

export function getInfrastructureStatus(): {
  cache: any;
  sessions: any;
  circuitBreakers: any;
  scaling: any;
} {
  return {
    cache: distributedCache.getStats(),
    sessions: clusterSessionManager.getStatus(),
    circuitBreakers: circuitBreakerRegistry.getAllStats(),
    scaling: autoScalingManager.getMetrics(),
  };
}
