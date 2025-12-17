import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { SocialMediaAutopilotAI } from '../../shared/ml/models/SocialMediaAutopilotAI.js';
import { AdvertisingAutopilotAI_v3 } from '../../shared/ml/models/AdvertisingAutopilotAI_v3.js';
import { aiModelTelemetry } from '../monitoring/aiModelTelemetry.js';

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
  private socialModels: Map<string, ModelCacheEntry<SocialMediaAutopilotAI>> = new Map();
  private advertisingModels: Map<string, ModelCacheEntry<AdvertisingAutopilotAI_v3>> = new Map();

  // Cache limits (evict least recently used when exceeded)
  private readonly MAX_SOCIAL_MODELS = 100; // Keep 100 social models in memory
  private readonly MAX_ADVERTISING_MODELS = 50; // Keep 50 advertising models in memory

  // Eviction check interval
  private evictionInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic eviction of stale models
    this.startEvictionScheduler();
    logger.info('✅ AI Model Manager initialized (per-user isolation enabled)');
  }

  /**
   * Get or create Social Media Autopilot AI for a specific user
   * CRITICAL: Per-user isolation prevents cross-tenant data leakage
   */
  async getSocialAutopilot(userId: string): Promise<SocialMediaAutopilotAI> {
    const startTime = Date.now();
    
    // Check cache first
    const cached = this.socialModels.get(userId);
    if (cached) {
      cached.lastAccessed = new Date();
      logger.debug(`Using cached Social AI model for user ${userId}`);
      
      // Record cache hit
      aiModelTelemetry.recordModelLoad({
        userId,
        modelType: 'social',
        loadTimeMs: Date.now() - startTime,
        cacheHit: true,
        timestamp: new Date(),
      });
      
      return cached.model;
    }

    // Create new model instance for this user
    const model = new SocialMediaAutopilotAI();

    // Try to load persisted model from database
    const persistedModel = await storage.getUserAIModel(userId, 'social_autopilot');
    if (persistedModel) {
      try {
        await this.loadModelWeights(model, persistedModel.weights);
        
        // CRITICAL: Restore per-user metadata to prevent cross-tenant data leakage
        if (persistedModel.metadata) {
          model.deserializeMetadata(persistedModel.metadata);
          logger.info(`✅ Loaded persisted Social AI model for user ${userId} (with metadata)`);
        } else {
          logger.info(`✅ Loaded persisted Social AI model for user ${userId} (weights only)`);
        }
      } catch (error) {
        logger.warn(`Failed to load persisted model for user ${userId}, using fresh model:`, error);
      }
    }

    // Try to train on user's data if not yet trained
    if (!persistedModel) {
      try {
        const posts = await storage.getUserSocialPosts(userId);
        if (posts && posts.length >= 50) {
          await model.trainOnUserEngagementData(posts);
          
          // Persist trained model
          await this.persistSocialModel(userId, model);
          logger.info(`✅ Trained and persisted Social AI model for user ${userId} (${posts.length} posts)`);
        }
      } catch (error) {
        logger.warn(`Could not train Social AI for user ${userId}:`, error);
      }
    }

    // Add to cache
    this.addToSocialCache(userId, model, !!persistedModel);

    // Record cache miss and model load
    aiModelTelemetry.recordModelLoad({
      userId,
      modelType: 'social',
      loadTimeMs: Date.now() - startTime,
      cacheHit: false,
      timestamp: new Date(),
    });

    return model;
  }

  /**
   * Get or create Advertising Autopilot AI v3.0 for a specific user
   * CRITICAL: Per-user isolation prevents cross-tenant data leakage
   */
  async getAdvertisingAutopilot(userId: string): Promise<AdvertisingAutopilotAI_v3> {
    const startTime = Date.now();
    
    // Check cache first
    const cached = this.advertisingModels.get(userId);
    if (cached) {
      cached.lastAccessed = new Date();
      logger.debug(`Using cached Advertising AI model for user ${userId}`);
      
      // Record cache hit
      aiModelTelemetry.recordModelLoad({
        userId,
        modelType: 'advertising',
        loadTimeMs: Date.now() - startTime,
        cacheHit: true,
        timestamp: new Date(),
      });
      
      return cached.model;
    }

    // Create new model instance for this user
    const model = new AdvertisingAutopilotAI_v3();

    // Try to load persisted model from database
    const persistedModel = await storage.getUserAIModel(userId, 'advertising_autopilot');
    if (persistedModel) {
      try {
        await this.loadModelWeights(model, persistedModel.weights);
        
        // CRITICAL: Restore per-user metadata to prevent cross-tenant data leakage
        if (persistedModel.metadata) {
          model.deserializeMetadata(persistedModel.metadata);
          logger.info(`✅ Loaded persisted Advertising AI model for user ${userId} (with metadata)`);
        } else {
          logger.info(`✅ Loaded persisted Advertising AI model for user ${userId} (weights only)`);
        }
      } catch (error) {
        logger.warn(`Failed to load persisted model for user ${userId}, using fresh model:`, error);
      }
    }

    // Try to train on user's data if not yet trained
    if (!persistedModel) {
      try {
        const campaigns = await storage.getOrganicCampaigns(userId);
        if (campaigns && campaigns.length >= 30) {
          await model.trainOnOrganicCampaigns(campaigns);
          
          // Persist trained model
          await this.persistAdvertisingModel(userId, model);
          logger.info(`✅ Trained and persisted Advertising AI model for user ${userId} (${campaigns.length} campaigns)`);
        }
      } catch (error) {
        logger.warn(`Could not train Advertising AI for user ${userId}:`, error);
      }
    }

    // Add to cache
    this.addToAdvertisingCache(userId, model, !!persistedModel);

    // Record cache miss and model load
    aiModelTelemetry.recordModelLoad({
      userId,
      modelType: 'advertising',
      loadTimeMs: Date.now() - startTime,
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
    const cached = this.socialModels.get(userId);
    if (!cached) {
      throw new Error(`No Social AI model found in cache for user ${userId}`);
    }
    await this.persistSocialModel(userId, cached.model);
  }

  /**
   * Save Advertising Autopilot model to database (public method for manual persistence)
   * Call this after training to ensure model state is persisted
   */
  async saveAdvertisingModel(userId: string): Promise<void> {
    const cached = this.advertisingModels.get(userId);
    if (!cached) {
      throw new Error(`No Advertising AI model found in cache for user ${userId}`);
    }
    await this.persistAdvertisingModel(userId, cached.model);
  }

  /**
   * Persist Social Media Autopilot model to database
   * CRITICAL: Saves both weights AND metadata for complete per-user isolation
   */
  private async persistSocialModel(userId: string, model: SocialMediaAutopilotAI): Promise<void> {
    try {
      const weights = await this.extractModelWeights(model);
      const metadata = model.serializeMetadata();
      
      await storage.saveAIModel({
        userId,
        modelType: 'social_autopilot',
        weights,
        metadata,
        trainedAt: new Date(),
      });
      logger.info(`💾 Persisted Social AI model for user ${userId} (with metadata)`);
    } catch (error) {
      logger.error(`Failed to persist Social AI model for user ${userId}:`, error);
    }
  }

  /**
   * Persist Advertising Autopilot model to database
   * CRITICAL: Saves both weights AND metadata for complete per-user isolation
   */
  private async persistAdvertisingModel(userId: string, model: AdvertisingAutopilotAI_v3): Promise<void> {
    try {
      const weights = await this.extractModelWeights(model);
      const metadata = model.serializeMetadata();
      
      await storage.saveAIModel({
        userId,
        modelType: 'advertising_autopilot',
        weights,
        metadata,
        trainedAt: new Date(),
      });
      logger.info(`💾 Persisted Advertising AI model for user ${userId} (with metadata)`);
    } catch (error) {
      logger.error(`Failed to persist Advertising AI model for user ${userId}:`, error);
    }
  }

  /**
   * Add model to Social AI cache with LRU eviction
   */
  private addToSocialCache(userId: string, model: SocialMediaAutopilotAI, trained: boolean) {
    // Check if cache is full
    if (this.socialModels.size >= this.MAX_SOCIAL_MODELS) {
      this.evictLRUSocialModel();
    }

    this.socialModels.set(userId, {
      model,
      userId,
      lastAccessed: new Date(),
      trained,
    });
  }

  /**
   * Add model to Advertising AI cache with LRU eviction
   */
  private addToAdvertisingCache(userId: string, model: AdvertisingAutopilotAI_v3, trained: boolean) {
    // Check if cache is full
    if (this.advertisingModels.size >= this.MAX_ADVERTISING_MODELS) {
      this.evictLRUAdvertisingModel();
    }

    this.advertisingModels.set(userId, {
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

    for (const [key, entry] of this.socialModels.entries()) {
      if (!oldestEntry || entry.lastAccessed < oldestEntry.lastAccessed) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }

    if (oldestKey && oldestEntry) {
      const idleTimeMs = Date.now() - oldestEntry.lastAccessed.getTime();
      this.socialModels.delete(oldestKey);
      logger.debug(`Evicted Social AI model for user ${oldestKey} (LRU)`);
      
      // Record eviction telemetry
      aiModelTelemetry.recordModelEviction({
        userId: oldestKey,
        modelType: 'social',
        reason: 'lru',
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

    for (const [key, entry] of this.advertisingModels.entries()) {
      if (!oldestEntry || entry.lastAccessed < oldestEntry.lastAccessed) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }

    if (oldestKey && oldestEntry) {
      const idleTimeMs = Date.now() - oldestEntry.lastAccessed.getTime();
      this.advertisingModels.delete(oldestKey);
      logger.debug(`Evicted Advertising AI model for user ${oldestKey} (LRU)`);
      
      // Record eviction telemetry
      aiModelTelemetry.recordModelEviction({
        userId: oldestKey,
        modelType: 'advertising',
        reason: 'lru',
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
    this.evictionInterval = setInterval(() => {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      // Evict stale social models
      for (const [key, entry] of this.socialModels.entries()) {
        if (entry.lastAccessed < thirtyMinutesAgo) {
          const idleTimeMs = now.getTime() - entry.lastAccessed.getTime();
          this.socialModels.delete(key);
          logger.debug(`Evicted stale Social AI model for user ${key}`);
          
          // Record telemetry
          aiModelTelemetry.recordModelEviction({
            userId: key,
            modelType: 'social',
            reason: 'timeout',
            idleTimeMs,
            timestamp: new Date(),
          });
        }
      }

      // Evict stale advertising models
      for (const [key, entry] of this.advertisingModels.entries()) {
        if (entry.lastAccessed < thirtyMinutesAgo) {
          const idleTimeMs = now.getTime() - entry.lastAccessed.getTime();
          this.advertisingModels.delete(key);
          logger.debug(`Evicted stale Advertising AI model for user ${key}`);
          
          // Record telemetry
          aiModelTelemetry.recordModelEviction({
            userId: key,
            modelType: 'advertising',
            reason: 'timeout',
            idleTimeMs,
            timestamp: new Date(),
          });
        }
      }
    }, 10 * 60 * 1000); // Run every 10 minutes
  }

  /**
   * Extract model weights for persistence
   * TODO: Implement actual weight extraction when TensorFlow.js models are used
   */
  private async extractModelWeights(model: any): Promise<any> {
    // Placeholder: In production, this would extract actual TensorFlow.js weights
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      // weights: await model.getWeights(), // TensorFlow.js method
    };
  }

  /**
   * Load model weights from persisted data
   * TODO: Implement actual weight loading when TensorFlow.js models are used
   */
  private async loadModelWeights(model: any, weights: any): Promise<void> {
    // Placeholder: In production, this would load actual TensorFlow.js weights
    // await model.setWeights(weights.weights); // TensorFlow.js method
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      socialModels: {
        count: this.socialModels.size,
        max: this.MAX_SOCIAL_MODELS,
        trained: Array.from(this.socialModels.values()).filter(e => e.trained).length,
      },
      advertisingModels: {
        count: this.advertisingModels.size,
        max: this.MAX_ADVERTISING_MODELS,
        trained: Array.from(this.advertisingModels.values()).filter(e => e.trained).length,
      },
    };
  }

  /**
   * Clear all cached models (for testing/maintenance)
   */
  clearCache() {
    this.socialModels.clear();
    this.advertisingModels.clear();
    logger.info('🗑️ Cleared all AI model caches');
  }

  /**
   * Shutdown: Clear interval and caches
   */
  shutdown() {
    if (this.evictionInterval) {
      clearInterval(this.evictionInterval);
    }
    this.clearCache();
    logger.info('✅ AI Model Manager shut down gracefully');
  }

  /**
   * Get current cache metrics for monitoring
   */
  getMetrics() {
    return aiModelTelemetry.captureMetrics(
      this.socialModels,
      this.advertisingModels,
      this.MAX_SOCIAL_MODELS,
      this.MAX_ADVERTISING_MODELS
    );
  }

  /**
   * Get telemetry summary for health checks
   */
  getTelemetrySummary() {
    return aiModelTelemetry.getSummary();
  }
}

// Export singleton instance
export const aiModelManager = new AIModelManager();
