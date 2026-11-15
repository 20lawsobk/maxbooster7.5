export { distributedCache, DistributedCache } from "./distributedCache.js";
export { CircuitBreaker, circuitBreakerRegistry } from "./circuitBreaker.js";
export {
  cdnManager,
  cdnCacheMiddleware,
  cdnAssetUrlHelper,
} from "./cdnConfig.js";
export { autoScalingManager, scalingMetricsRouter } from "./autoScaling.js";
export { clusterSessionManager } from "./clusterSession.js";

import { logger } from "../logger.js";
import { distributedCache } from "./distributedCache.js";
import { clusterSessionManager } from "./clusterSession.js";
import { autoScalingManager } from "./autoScaling.js";
import { circuitBreakerRegistry } from "./circuitBreaker.js";

export async function initializeInfrastructure(): Promise<void> {
  logger.info("════════════════════════════════════════════════════════");
  logger.info("🏗️ INITIALIZING SCALABLE INFRASTRUCTURE");
  logger.info("════════════════════════════════════════════════════════");

  try {
    await distributedCache?.connect();
    logger.info("   ✓ Distributed cache initialized");
  } catch (error) {
    logger.warn({ err: error }, "   ⚠️ Distributed cache using fallback mode:");
  }

  try {
    await clusterSessionManager?.initialize();
    logger.info(
      `   ✓ Session manager initialized (${clusterSessionManager?.getStatus().mode} mode)`,
    );
  } catch (error) {
    logger.warn({ err: error }, "   ⚠️ Session manager using memory store:");
  }

  logger.info("════════════════════════════════════════════════════════");
  logger.info("✅ INFRASTRUCTURE READY FOR SCALE");
  logger.info("════════════════════════════════════════════════════════");
}

export function getInfrastructureStatus() {
  return {
    cache: distributedCache.getStats() as unknown as Record<string, unknown>,
    sessions: clusterSessionManager.getStatus() as Record<string, unknown>,
    circuitBreakers: circuitBreakerRegistry.getAllStats() as Record<
      string,
      unknown
    >,
    scaling: autoScalingManager.getMetrics() as unknown as Record<
      string,
      unknown
    >,
  };
}
