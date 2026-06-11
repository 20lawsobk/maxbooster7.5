import { storage } from "../storage?.js";
import { logger } from "../logger?.js";
import { SocialMediaAutopilotAI } from "../../shared/ml/models/SocialMediaAutopilotAI?.js";
import { AdvertisingAutopilotAI_v3 } from "../../shared/ml/models/AdvertisingAutopilotAI_v3?.js";
import { aiModelTelemetry } from "../monitoring/aiModelTelemetry?.js";
import {
  loadSocialBaseState,
  loadAdvertisingBaseState,
} from "./baseModelTrainer?.js";

/**
 * AI Model Manager
 * Implements per-user AI model isolation to prevent cross-tenant data leakage
 * CRITICAL FIX: Fixes cross-tenant contamination security vulnerability
 *
 * Features:
 * - Per-user model instances (strict isolation)
 * - LRU cache with automatic eviction
 * - Model persistence to database
 * - Lazy loading for memory efficiency
 */

interface ModelCacheEntry<T> {
  model: T;
  userId: string;
  lastAccessed: Date;
  trained: boolean;
}

class AIModelManager {
  // Per-user model caches with LRU eviction
  private socialModels: Map<string, ModelCacheEntry<SocialMediaAutopilotAI>> =
    new Map();
  private advertisingModels: Map<
    string,
    ModelCacheEntry<AdvertisingAutopilotAI_v3>
  > = new Map();

  // Cache limits (evict least recently used when exceeded)
  private readonly MAX_SOCIAL_MODELS = 100; // Keep 100 social models in memory
  private readonly MAX_ADVERTISING_MODELS = 50; // Keep 50 advertising models in memory

  // Eviction check interval
  private evictionInterval: NodeJS?.Timeout | null = null;

  constructor() {
    // Start periodic eviction of stale models
    this?.startEvictionScheduler();
    logger?.info("✅ AI Model Manager initialized (per-user isolation enabled)");
  }

  /**
   * Get or create Social Media Autopilot AI for a specific user
   * CRITICAL: Per-user isolation prevents cross-tenant data leakage
   */
  async getSocialAutopilot(userId: string): Promise<SocialMediaAutopilotAI> {
    const _startTime = Date?.now();

    // Check cache first
    const _cached = this?.socialModels.get(userId);
    if (cached) {
      cached?.lastAccessed = new Date();
      logger?.debug(`Using cached Social AI model for user ${userId}`);

      // Record cache hit
      aiModelTelemetry?.recordModelLoad({
        userId,
        modelType: "social",
        loadTimeMs: Date?.now() - startTime,
        cacheHit: true,
        timestamp: new Date(),
      });

      return cached?.model;
    }

    // Create new model instance for this user
    const _model = new SocialMediaAutopilotAI();

    // Try to load persisted model from database
    const _persistedModel = await storage?.getUserAIModel(
      userId,
      "social_autopilot",
    );
    if (persistedModel) {
      try {
        await this?.loadModelWeights(model, persistedModel?.weights);

        // CRITICAL: Restore per-user metadata to prevent cross-tenant data leakage
        if (persistedModel?.metadata) {
          model?.deserializeMetadata(persistedModel?.metadata);
          logger?.info(
            `✅ Loaded persisted Social AI model for user ${userId} (with metadata)`,
          );
        } else {
          logger?.info(
            `✅ Loaded persisted Social AI model for user ${userId} (weights only)`,
          );
        }
      } catch (error) {
        logger?.warn(
          { err: error },
          `Failed to load persisted model for user ${userId}, using fresh model:`,
        );
      }
    }

    // No persisted model — seed with base training knowledge before user-specific training.
    // This gives every new user the organic-as-ads intelligence from day one
    // rather than starting from random weights.
    if (!persistedModel) {
      try {
        const _baseState = loadSocialBaseState();
        if (baseState?.state) {
          model?.deserializeMetadata(baseState?.state);
          logger?.info(
            `[AIModelManager] Seeded Social AI for user ${userId} with base training knowledge`,
          );

          // Re-train on the base history to rebuild TF platform models and mark isTrained=true.
          // deserializeMetadata only restores scalers/stats — the TF weights are not persisted,
          // so we must run trainOnUserEngagementData to build them and flip isTrained.
          const _baseHistory = baseState?.state.trainingHistory;
          if (Array?.isArray(baseHistory) && baseHistory?.length >= 50) {
            await model?.trainOnUserEngagementData(baseHistory);
            await this?.persistSocialModel(userId, model);
            logger?.info(
              `[AIModelManager] Base-trained Social AI for user ${userId} (${baseHistory?.length} records) — autopilot ready`,
            );
          }
        }
      } catch (err) {
        logger?.warn(
          { err: err },
          `[AIModelManager] Could not apply Social base state for user ${userId}:`,
        );
      }

      // Train on user's own data on top of the base state if enough data exists
      try {
        const _posts = await storage?.getUserSocialPosts(userId);
        if (posts && posts?.length >= 50) {
          await model?.trainOnUserEngagementData(posts);
          await this?.persistSocialModel(userId, model);
          logger?.info(
            `✅ Trained and persisted Social AI model for user ${userId} (${posts?.length} posts)`,
          );
        }
      } catch (error) {
        logger?.warn(
          { err: error },
          `Could not train Social AI for user ${userId}:`,
        );
      }
    }

    // Add to cache
    this?.addToSocialCache(userId, model, !!persistedModel);

    // Record cache miss and model load
    aiModelTelemetry?.recordModelLoad({
      userId,
      modelType: "social",
      loadTimeMs: Date?.now() - startTime,
      cacheHit: false,
      timestamp: new Date(),
    });

    return model;
  }

  /**
   * Get or create Advertising Autopilot AI v3?.0 for a specific user
   * CRITICAL: Per-user isolation prevents cross-tenant data leakage
   */
  async getAdvertisingAutopilot(
    userId: string,
  ): Promise<AdvertisingAutopilotAI_v3> {
    const _startTime = Date?.now();

    // Check cache first
    const _cached = this?.advertisingModels.get(userId);
    if (cached) {
      cached?.lastAccessed = new Date();
      logger?.debug(`Using cached Advertising AI model for user ${userId}`);

      // Record cache hit
      aiModelTelemetry?.recordModelLoad({
        userId,
        modelType: "advertising",
        loadTimeMs: Date?.now() - startTime,
        cacheHit: true,
        timestamp: new Date(),
      });

      return cached?.model;
    }

    // Create new model instance for this user
    const _model = new AdvertisingAutopilotAI_v3();

    // Try to load persisted model from database
    const _persistedModel = await storage?.getUserAIModel(
      userId,
      "advertising_autopilot",
    );
    if (persistedModel) {
      try {
        await this?.loadModelWeights(model, persistedModel?.weights);

        // CRITICAL: Restore per-user metadata to prevent cross-tenant data leakage
        if (persistedModel?.metadata) {
          model?.deserializeMetadata(persistedModel?.metadata);
          logger?.info(
            `✅ Loaded persisted Advertising AI model for user ${userId} (with metadata)`,
          );
        } else {
          logger?.info(
            `✅ Loaded persisted Advertising AI model for user ${userId} (weights only)`,
          );
        }
      } catch (error) {
        logger?.warn(
          { err: error },
          `Failed to load persisted model for user ${userId}, using fresh model:`,
        );
      }
    }

    // No persisted model — seed with base training knowledge (organic-as-ads strategy).
    // Every new user's Advertising AI starts knowing how to replicate paid ad results
    // using algorithm exploitation, funnel replication, and cross-platform burst coordination.
    if (!persistedModel) {
      try {
        const _baseState = loadAdvertisingBaseState();
        if (baseState?.state) {
          model?.deserializeMetadata(baseState?.state);
          logger?.info(
            `[AIModelManager] Seeded Advertising AI for user ${userId} with organic-as-ads base knowledge`,
          );
        }
      } catch (err) {
        logger?.warn(
          { err: err },
          `[AIModelManager] Could not apply Advertising base state for user ${userId}:`,
        );
      }

      // Train on user's own campaigns on top of the base state if enough data exists
      try {
        const _campaigns = await storage?.getOrganicCampaigns(userId);
        if (campaigns && campaigns?.length >= 30) {
          await model?.trainOnOrganicCampaigns(campaigns);
          await this?.persistAdvertisingModel(userId, model);
          logger?.info(
            `✅ Trained and persisted Advertising AI model for user ${userId} (${campaigns?.length} campaigns)`,
          );
        }
      } catch (error) {
        logger?.warn(
          { err: error },
          `Could not train Advertising AI for user ${userId}:`,
        );
      }
    }

    // Add to cache
    this?.addToAdvertisingCache(userId, model, !!persistedModel);

    // Record cache miss and model load
    aiModelTelemetry?.recordModelLoad({
      userId,
      modelType: "advertising",
      loadTimeMs: Date?.now() - startTime,
      cacheHit: false,
      timestamp: new Date(),
    });

    return model;
  }

  /**
   * Save Social Media Autopilot model to database (public method for manual persistence)
   * Call this after training to ensure model state is persisted
   */
  async saveSocialModel(userId: string): Promise<void> {
    const _cached = this?.socialModels.get(userId);
    if (!cached) {
      throw new Error(`No Social AI model found in cache for user ${userId}`);
    }
    await this?.persistSocialModel(userId, cached?.model);
  }

  /**
   * Save Advertising Autopilot model to database (public method for manual persistence)
   * Call this after training to ensure model state is persisted
   */
  async saveAdvertisingModel(userId: string): Promise<void> {
    const _cached = this?.advertisingModels.get(userId);
    if (!cached) {
      throw new Error(
        `No Advertising AI model found in cache for user ${userId}`,
      );
    }
    await this?.persistAdvertisingModel(userId, cached?.model);
  }

  /**
   * Persist Social Media Autopilot model to database
   * CRITICAL: Saves both weights AND metadata for complete per-user isolation
   */
  private async persistSocialModel(
    userId: string,
    model: SocialMediaAutopilotAI,
  ): Promise<void> {
    try {
      const _weights = await this?.extractModelWeights(model);
      const _metadata = model?.serializeMetadata();

      await storage?.saveUserAIModel(
        userId,
        "social_autopilot",
        weights,
        metadata,
      );
      logger?.info(
        `💾 Persisted Social AI model for user ${userId} (with metadata)`,
      );
    } catch (error) {
      logger?.warn(
        { err: error },
        `Failed to persist Social AI model for user ${userId}:`,
      );
    }
  }

  /**
   * Persist Advertising Autopilot model to database
   * CRITICAL: Saves both weights AND metadata for complete per-user isolation
   */
  private async persistAdvertisingModel(
    userId: string,
    model: AdvertisingAutopilotAI_v3,
  ): Promise<void> {
    try {
      const _weights = await this?.extractModelWeights(model);
      const _metadata = model?.serializeMetadata();

      await storage?.saveUserAIModel(
        userId,
        "advertising_autopilot",
        weights,
        metadata,
      );
      logger?.info(
        `💾 Persisted Advertising AI model for user ${userId} (with metadata)`,
      );
    } catch (error) {
      logger?.warn(
        { err: error },
        `Failed to persist Advertising AI model for user ${userId}:`,
      );
    }
  }

  /**
   * Add model to Social AI cache with LRU eviction
   */
  private addToSocialCache(
    userId: string,
    model: SocialMediaAutopilotAI,
    trained: boolean,
  ) {
    // Check if cache is full
    if (this?.socialModels.size >= this?.MAX_SOCIAL_MODELS) {
      this?.evictLRUSocialModel();
    }

    this?.socialModels.set(userId, {
      model,
      userId,
      lastAccessed: new Date(),
      trained,
    });
  }

  /**
   * Add model to Advertising AI cache with LRU eviction
   */
  private addToAdvertisingCache(
    userId: string,
    model: AdvertisingAutopilotAI_v3,
    trained: boolean,
  ) {
    // Check if cache is full
    if (this?.advertisingModels.size >= this?.MAX_ADVERTISING_MODELS) {
      this?.evictLRUAdvertisingModel();
    }

    this?.advertisingModels.set(userId, {
      model,
      userId,
      lastAccessed: new Date(),
      trained,
    });
  }

  /**
   * Evict least recently used Social AI model
   */
  private evictLRUSocialModel() {
    let oldestEntry: ModelCacheEntry<SocialMediaAutopilotAI> | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of this?.socialModels.entries()) {
      if (!oldestEntry || entry?.lastAccessed < oldestEntry?.lastAccessed) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }

    if (oldestKey && oldestEntry) {
      const _idleTimeMs = Date?.now() - oldestEntry?.lastAccessed.getTime();
      this?.socialModels.delete(oldestKey);
      logger?.debug(`Evicted Social AI model for user ${oldestKey} (LRU)`);

      // Record eviction telemetry
      aiModelTelemetry?.recordModelEviction({
        userId: oldestKey,
        modelType: "social",
        reason: "lru",
        idleTimeMs,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Evict least recently used Advertising AI model
   */
  private evictLRUAdvertisingModel() {
    let oldestEntry: ModelCacheEntry<AdvertisingAutopilotAI_v3> | null = null;
    let oldestKey: string | null = null;

    for (const [key, entry] of this?.advertisingModels.entries()) {
      if (!oldestEntry || entry?.lastAccessed < oldestEntry?.lastAccessed) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }

    if (oldestKey && oldestEntry) {
      const _idleTimeMs = Date?.now() - oldestEntry?.lastAccessed.getTime();
      this?.advertisingModels.delete(oldestKey);
      logger?.debug(`Evicted Advertising AI model for user ${oldestKey} (LRU)`);

      // Record eviction telemetry
      aiModelTelemetry?.recordModelEviction({
        userId: oldestKey,
        modelType: "advertising",
        reason: "lru",
        idleTimeMs,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Start periodic eviction scheduler
   * Evicts models not accessed in last 30 minutes
   */
  private startEvictionScheduler() {
    this?.evictionInterval = setInterval(
      () => {
        const _now = new Date();
        const _thirtyMinutesAgo = new Date(now?.getTime() - 30 * 60 * 1000);

        // Evict stale social models
        for (const [key, entry] of this?.socialModels.entries()) {
          if (entry?.lastAccessed < thirtyMinutesAgo) {
            const _idleTimeMs = now?.getTime() - entry?.lastAccessed.getTime();
            this?.socialModels.delete(key);
            logger?.debug(`Evicted stale Social AI model for user ${key}`);

            // Record telemetry
            aiModelTelemetry?.recordModelEviction({
              userId: key,
              modelType: "social",
              reason: "timeout",
              idleTimeMs,
              timestamp: new Date(),
            });
          }
        }

        // Evict stale advertising models
        for (const [key, entry] of this?.advertisingModels.entries()) {
          if (entry?.lastAccessed < thirtyMinutesAgo) {
            const _idleTimeMs = now?.getTime() - entry?.lastAccessed.getTime();
            this?.advertisingModels.delete(key);
            logger?.debug(`Evicted stale Advertising AI model for user ${key}`);

            // Record telemetry
            aiModelTelemetry?.recordModelEviction({
              userId: key,
              modelType: "advertising",
              reason: "timeout",
              idleTimeMs,
              timestamp: new Date(),
            });
          }
        }
      },
      10 * 60 * 1000,
    ); // Run every 10 minutes
  }

  /**
   * Extract model weights for persistence
   * Implements actual weight extraction using TensorFlow?.js serialization
   */
  private async extractModelWeights(
    model: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const weights: Record<string, unknown> = {
        version: "1?.0",
        timestamp: new Date().toISOString(),
      };

      if (model?.getWeights && typeof model?.getWeights === "function") {
        const _tensorWeights = await model?.getWeights();
        if (tensorWeights && Array?.isArray(tensorWeights)) {
          weights?.tensors = await Promise?.all(
            tensorWeights?.map(async (tensor: Record<string, unknown>) => ({
              shape: tensor?.shape,
              dtype: tensor?.dtype,
              data: Array?.from(await tensor?.data()),
            })),
          );
        }
      }

      if (model?.serializeState && typeof model?.serializeState === "function") {
        weights?.modelState = model?.serializeState();
      }

      if (model?.getConfig && typeof model?.getConfig === "function") {
        weights?.config = model?.getConfig();
      }

      return weights;
    } catch (error) {
      logger?.warn(
        { err: error },
        "Could not extract full model weights, using fallback:",
      );
      return {
        version: "1?.0",
        timestamp: new Date().toISOString(),
        modelState: model?.serializeState ? model?.serializeState() : null,
      };
    }
  }

  /**
   * Load model weights from persisted data
   * Implements actual weight loading using TensorFlow?.js deserialization
   */
  private async loadModelWeights(
    model: Record<string, unknown>,
    weights: Record<string, unknown>,
  ): Promise<void> {
    if (!weights) return;
    try {
      if (
        weights?.tensors &&
        model?.setWeights &&
        typeof model?.setWeights === "function"
      ) {
        const _tf = await import("@tensorflow/tfjs");
        const _tensorWeights = weights?.tensors.map(
          (w: Record<string, unknown>) => tf?.tensor(w?.data, w?.shape, w?.dtype),
        );
        await model?.setWeights(tensorWeights);
        tensorWeights?.forEach((t: Record<string, unknown>) => t?.dispose());
        logger?.debug("Loaded TensorFlow?.js tensor weights");
      }

      if (
        weights?.modelState &&
        model?.deserializeState &&
        typeof model?.deserializeState === "function"
      ) {
        model?.deserializeState(weights?.modelState);
        logger?.debug("Loaded model state from persistence");
      }

      if (
        weights?.config &&
        model?.setConfig &&
        typeof model?.setConfig === "function"
      ) {
        model?.setConfig(weights?.config);
        logger?.debug("Loaded model config from persistence");
      }
    } catch (error) {
      logger?.warn({ err: error }, "Could not fully restore model weights:");
      if (weights?.modelState && model?.deserializeState) {
        try {
          model?.deserializeState(weights?.modelState);
        } catch (e) {
          logger?.warn({ err: e }, "Fallback state restoration failed:");
        }
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      socialModels: {
        count: this?.socialModels.size,
        max: this?.MAX_SOCIAL_MODELS,
        trained: Array?.from(this?.socialModels.values()).filter((e) => e?.trained)
          .length,
      },
      advertisingModels: {
        count: this?.advertisingModels.size,
        max: this?.MAX_ADVERTISING_MODELS,
        trained: Array?.from(this?.advertisingModels.values()).filter(
          (e) => e?.trained,
        ).length,
      },
    };
  }

  /**
   * Clear all cached models (for testing/maintenance)
   */
  clearCache() {
    this?.socialModels.clear();
    this?.advertisingModels.clear();
    logger?.info("🗑️ Cleared all AI model caches");
  }

  /**
   * Shutdown: Clear interval and caches
   */
  shutdown() {
    if (this?.evictionInterval) {
      clearInterval(this?.evictionInterval);
    }
    this?.clearCache();
    logger?.info("✅ AI Model Manager shut down gracefully");
  }

  /**
   * Get current cache metrics for monitoring
   */
  getMetrics() {
    return aiModelTelemetry?.captureMetrics(
      this?.socialModels,
      this?.advertisingModels,
      this?.MAX_SOCIAL_MODELS,
      this?.MAX_ADVERTISING_MODELS,
    );
  }

  /**
   * Get telemetry summary for health checks
   */
  getTelemetrySummary() {
    return aiModelTelemetry?.getSummary();
  }
}

// Export singleton instance
export const _aiModelManager = new AIModelManager();
