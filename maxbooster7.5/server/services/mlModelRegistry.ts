/**
 * ML Model Registry Service
 * Comprehensive model management for Max Booster's custom AI infrastructure
 * 
 * Features:
 * - Model registration and versioning
 * - Model metadata storage with file persistence
 * - A/B testing support for model variants
 * - Performance tracking for predictions
 * - Model lifecycle management
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger.js';
import type { ModelMetadata, EvaluationMetrics } from '../../shared/ml/types.js';
import type { BaseModel } from '../../shared/ml/models/BaseModel.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type ModelStatus = 'active' | 'deprecated' | 'archived' | 'testing' | 'pending';

export interface RegisteredModel {
  id: string;
  name: string;
  version: string;
  type: ModelMetadata['type'];
  status: ModelStatus;
  inputShape: number[];
  outputShape: number[];
  createdAt: Date;
  lastTrained: Date;
  updatedAt: Date;
  accuracy?: number;
  loss?: number;
  metrics: Record<string, number>;
  parameters: ModelParameters;
  filePath?: string;
  tags: string[];
  description?: string;
}

export interface ModelParameters {
  epochs?: number;
  batchSize?: number;
  learningRate?: number;
  optimizer?: string;
  layers?: number;
  hiddenUnits?: number[];
  dropoutRate?: number;
  activationFunction?: string;
  regularization?: string;
  customParams?: Record<string, unknown>;
}

export interface ModelVariant {
  id: string;
  modelId: string;
  variantName: string;
  trafficWeight: number;
  isControl: boolean;
  status: ModelStatus;
  createdAt: Date;
  metrics: VariantMetrics;
}

export interface VariantMetrics {
  totalPredictions: number;
  successfulPredictions: number;
  averageLatency: number;
  averageConfidence: number;
  conversionRate?: number;
  errorRate: number;
}

export interface ABTestConfig {
  experimentId: string;
  modelId: string;
  variants: ModelVariant[];
  startDate: Date;
  endDate?: Date;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  minSampleSize: number;
  confidenceLevel: number;
}

export interface PredictionRecord {
  id: string;
  modelId: string;
  variantId?: string;
  timestamp: Date;
  inputHash: string;
  predictions: number[];
  confidence: number[];
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface ModelPerformance {
  modelId: string;
  totalPredictions: number;
  successRate: number;
  averageLatency: number;
  averageConfidence: number;
  errorRate: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  predictionsByDay: Record<string, number>;
  recentPredictions: PredictionRecord[];
}

export interface ModelRegistrationOptions {
  name: string;
  version: string;
  type: ModelMetadata['type'];
  inputShape: number[];
  outputShape: number[];
  parameters?: ModelParameters;
  tags?: string[];
  description?: string;
  accuracy?: number;
  loss?: number;
  metrics?: Record<string, number>;
}

export interface ModelFilter {
  status?: ModelStatus;
  type?: ModelMetadata['type'];
  tags?: string[];
  name?: string;
  minAccuracy?: number;
}

// ============================================================================
// ML Model Registry Service
// ============================================================================

export class MLModelRegistry {
  private static instance: MLModelRegistry;
  private models: Map<string, RegisteredModel> = new Map();
  private modelInstances: Map<string, BaseModel> = new Map();
  private variants: Map<string, ModelVariant[]> = new Map();
  private abTests: Map<string, ABTestConfig> = new Map();
  private predictions: Map<string, PredictionRecord[]> = new Map();
  private readonly storageDir: string;
  private readonly metadataFile: string;
  private initialized: boolean = false;
  private readonly MAX_PREDICTIONS_PER_MODEL = 10000;

  private constructor() {
    this.storageDir = path.join(process.cwd(), 'uploads', 'models');
    this.metadataFile = path.join(this.storageDir, 'registry.json');
  }

  public static getInstance(): MLModelRegistry {
    if (!MLModelRegistry.instance) {
      MLModelRegistry.instance = new MLModelRegistry();
    }
    return MLModelRegistry.instance;
  }

  /**
   * Initialize the registry and load persisted data
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.ensureStorageDirectory();
      await this.loadPersistedData();
      this.initialized = true;
      logger.info('ML Model Registry initialized successfully', {
        modelsLoaded: this.models.size,
        storageDir: this.storageDir
      });
    } catch (error) {
      logger.error('Failed to initialize ML Model Registry', error as Error);
      throw error;
    }
  }

  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.promises.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      const exists = fs.existsSync(this.metadataFile);
      if (!exists) {
        logger.info('No existing registry found, starting fresh');
        return;
      }

      const data = await fs.promises.readFile(this.metadataFile, 'utf-8');
      const parsed = JSON.parse(data);

      if (parsed.models) {
        for (const model of parsed.models) {
          model.createdAt = new Date(model.createdAt);
          model.lastTrained = new Date(model.lastTrained);
          model.updatedAt = new Date(model.updatedAt);
          this.models.set(model.id, model);
        }
      }

      if (parsed.variants) {
        for (const [modelId, variantList] of Object.entries(parsed.variants)) {
          const processedVariants = (variantList as ModelVariant[]).map(v => ({
            ...v,
            createdAt: new Date(v.createdAt)
          }));
          this.variants.set(modelId, processedVariants);
        }
      }

      if (parsed.abTests) {
        for (const [experimentId, config] of Object.entries(parsed.abTests)) {
          const processedConfig = config as ABTestConfig;
          processedConfig.startDate = new Date(processedConfig.startDate);
          if (processedConfig.endDate) {
            processedConfig.endDate = new Date(processedConfig.endDate);
          }
          processedConfig.variants = processedConfig.variants.map(v => ({
            ...v,
            createdAt: new Date(v.createdAt)
          }));
          this.abTests.set(experimentId, processedConfig);
        }
      }

      logger.info('Registry data loaded from disk', {
        models: this.models.size,
        variants: this.variants.size,
        abTests: this.abTests.size
      });
    } catch (error) {
      logger.error('Error loading persisted registry data', error as Error);
    }
  }

  private async persistData(): Promise<void> {
    try {
      const data = {
        models: Array.from(this.models.values()),
        variants: Object.fromEntries(this.variants.entries()),
        abTests: Object.fromEntries(this.abTests.entries()),
        lastUpdated: new Date().toISOString()
      };

      await fs.promises.writeFile(
        this.metadataFile,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error('Failed to persist registry data', error as Error);
      throw error;
    }
  }

  // ============================================================================
  // Model Registration Methods
  // ============================================================================

  /**
   * Register a new model in the registry
   */
  public async registerModel(options: ModelRegistrationOptions): Promise<RegisteredModel> {
    await this.ensureInitialized();

    const id = this.generateModelId(options.name, options.version);
    
    if (this.models.has(id)) {
      throw new Error(`Model with id ${id} already exists. Use a different version.`);
    }

    const now = new Date();
    const model: RegisteredModel = {
      id,
      name: options.name,
      version: options.version,
      type: options.type,
      status: 'pending',
      inputShape: options.inputShape,
      outputShape: options.outputShape,
      createdAt: now,
      lastTrained: now,
      updatedAt: now,
      accuracy: options.accuracy,
      loss: options.loss,
      metrics: options.metrics || {},
      parameters: options.parameters || {},
      tags: options.tags || [],
      description: options.description
    };

    this.models.set(id, model);
    this.predictions.set(id, []);
    await this.persistData();

    logger.info('Model registered successfully', { 
      modelId: id, 
      name: options.name, 
      version: options.version 
    });

    return model;
  }

  /**
   * Register a model instance (BaseModel) with the registry
   */
  public async registerModelInstance(
    options: ModelRegistrationOptions,
    instance: BaseModel
  ): Promise<RegisteredModel> {
    const model = await this.registerModel(options);
    this.modelInstances.set(model.id, instance);
    
    const modelPath = path.join(this.storageDir, model.id);
    model.filePath = modelPath;
    
    try {
      await instance.save(`file://${modelPath}`);
      model.status = 'active';
      await this.persistData();
      logger.info('Model instance saved to disk', { modelId: model.id, path: modelPath });
    } catch (error) {
      logger.error('Failed to save model instance', error as Error);
    }

    return model;
  }

  /**
   * Get a model by ID
   */
  public async getModel(modelId: string): Promise<RegisteredModel | null> {
    await this.ensureInitialized();
    return this.models.get(modelId) || null;
  }

  /**
   * Get a model instance by ID
   */
  public getModelInstance(modelId: string): BaseModel | null {
    return this.modelInstances.get(modelId) || null;
  }

  /**
   * List all models with optional filtering
   */
  public async listModels(filter?: ModelFilter): Promise<RegisteredModel[]> {
    await this.ensureInitialized();

    let models = Array.from(this.models.values());

    if (filter) {
      if (filter.status) {
        models = models.filter(m => m.status === filter.status);
      }
      if (filter.type) {
        models = models.filter(m => m.type === filter.type);
      }
      if (filter.tags && filter.tags.length > 0) {
        models = models.filter(m => 
          filter.tags!.some(tag => m.tags.includes(tag))
        );
      }
      if (filter.name) {
        const searchName = filter.name.toLowerCase();
        models = models.filter(m => 
          m.name.toLowerCase().includes(searchName)
        );
      }
      if (filter.minAccuracy !== undefined) {
        models = models.filter(m => 
          m.accuracy !== undefined && m.accuracy >= filter.minAccuracy!
        );
      }
    }

    return models.sort((a, b) => 
      b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * Get all versions of a model by name
   */
  public async getModelVersions(modelName: string): Promise<RegisteredModel[]> {
    await this.ensureInitialized();
    
    return Array.from(this.models.values())
      .filter(m => m.name === modelName)
      .sort((a, b) => this.compareVersions(b.version, a.version));
  }

  /**
   * Get the latest version of a model by name
   */
  public async getLatestModel(modelName: string): Promise<RegisteredModel | null> {
    const versions = await this.getModelVersions(modelName);
    return versions[0] || null;
  }

  // ============================================================================
  // Model Lifecycle Management
  // ============================================================================

  /**
   * Update model status
   */
  public async updateModelStatus(
    modelId: string, 
    status: ModelStatus
  ): Promise<RegisteredModel> {
    await this.ensureInitialized();

    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const previousStatus = model.status;
    model.status = status;
    model.updatedAt = new Date();

    await this.persistData();

    logger.info('Model status updated', { 
      modelId, 
      previousStatus, 
      newStatus: status 
    });

    return model;
  }

  /**
   * Update model metadata
   */
  public async updateModelMetadata(
    modelId: string,
    updates: Partial<Pick<RegisteredModel, 
      'accuracy' | 'loss' | 'metrics' | 'parameters' | 'tags' | 'description'
    >>
  ): Promise<RegisteredModel> {
    await this.ensureInitialized();

    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    if (updates.accuracy !== undefined) model.accuracy = updates.accuracy;
    if (updates.loss !== undefined) model.loss = updates.loss;
    if (updates.metrics) model.metrics = { ...model.metrics, ...updates.metrics };
    if (updates.parameters) model.parameters = { ...model.parameters, ...updates.parameters };
    if (updates.tags) model.tags = updates.tags;
    if (updates.description !== undefined) model.description = updates.description;
    
    model.updatedAt = new Date();

    await this.persistData();

    logger.info('Model metadata updated', { modelId, updates: Object.keys(updates) });

    return model;
  }

  /**
   * Mark model as trained with updated metrics
   */
  public async markModelTrained(
    modelId: string,
    metrics: EvaluationMetrics
  ): Promise<RegisteredModel> {
    await this.ensureInitialized();

    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    model.lastTrained = new Date();
    model.updatedAt = new Date();
    model.accuracy = metrics.accuracy;
    model.loss = metrics.mse;
    model.metrics = {
      ...model.metrics,
      precision: metrics.precision || 0,
      recall: metrics.recall || 0,
      f1Score: metrics.f1Score || 0,
      mae: metrics.mae || 0,
      r2Score: metrics.r2Score || 0
    };

    if (model.status === 'pending') {
      model.status = 'active';
    }

    await this.persistData();

    logger.info('Model marked as trained', { modelId, accuracy: metrics.accuracy });

    return model;
  }

  /**
   * Delete a model from the registry
   */
  public async deleteModel(modelId: string): Promise<void> {
    await this.ensureInitialized();

    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const instance = this.modelInstances.get(modelId);
    if (instance) {
      instance.dispose();
      this.modelInstances.delete(modelId);
    }

    if (model.filePath) {
      try {
        await fs.promises.rm(model.filePath, { recursive: true, force: true });
      } catch (error) {
        logger.warn('Failed to delete model files', { modelId, error });
      }
    }

    this.models.delete(modelId);
    this.predictions.delete(modelId);
    this.variants.delete(modelId);

    await this.persistData();

    logger.info('Model deleted', { modelId });
  }

  // ============================================================================
  // A/B Testing Support
  // ============================================================================

  /**
   * Create an A/B test experiment
   */
  public async createABTest(
    modelId: string,
    variantConfigs: Array<{
      variantName: string;
      trafficWeight: number;
      isControl: boolean;
    }>,
    options?: {
      minSampleSize?: number;
      confidenceLevel?: number;
      endDate?: Date;
    }
  ): Promise<ABTestConfig> {
    await this.ensureInitialized();

    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const totalWeight = variantConfigs.reduce((sum, v) => sum + v.trafficWeight, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      throw new Error('Traffic weights must sum to 1');
    }

    const controlCount = variantConfigs.filter(v => v.isControl).length;
    if (controlCount !== 1) {
      throw new Error('Exactly one variant must be marked as control');
    }

    const experimentId = `exp_${modelId}_${Date.now()}`;
    const now = new Date();

    const variants: ModelVariant[] = variantConfigs.map((config, index) => ({
      id: `var_${experimentId}_${index}`,
      modelId,
      variantName: config.variantName,
      trafficWeight: config.trafficWeight,
      isControl: config.isControl,
      status: 'active',
      createdAt: now,
      metrics: {
        totalPredictions: 0,
        successfulPredictions: 0,
        averageLatency: 0,
        averageConfidence: 0,
        errorRate: 0
      }
    }));

    const abTest: ABTestConfig = {
      experimentId,
      modelId,
      variants,
      startDate: now,
      endDate: options?.endDate,
      status: 'running',
      minSampleSize: options?.minSampleSize || 1000,
      confidenceLevel: options?.confidenceLevel || 0.95
    };

    this.abTests.set(experimentId, abTest);
    this.variants.set(modelId, variants);
    await this.persistData();

    logger.info('A/B test created', { 
      experimentId, 
      modelId, 
      variantCount: variants.length 
    });

    return abTest;
  }

  /**
   * Select a variant for prediction based on traffic weights
   */
  public selectVariant(modelId: string): ModelVariant | null {
    const variants = this.variants.get(modelId);
    if (!variants || variants.length === 0) return null;

    const activeVariants = variants.filter(v => v.status === 'active');
    if (activeVariants.length === 0) return null;

    const random = Math.random();
    let cumulative = 0;

    for (const variant of activeVariants) {
      cumulative += variant.trafficWeight;
      if (random <= cumulative) {
        return variant;
      }
    }

    return activeVariants[activeVariants.length - 1];
  }

  /**
   * Get A/B test results
   */
  public async getABTestResults(experimentId: string): Promise<{
    experiment: ABTestConfig;
    winner?: string;
    significanceAchieved: boolean;
    variantComparison: Array<{
      variantId: string;
      variantName: string;
      isControl: boolean;
      metrics: VariantMetrics;
      improvement?: number;
    }>;
  }> {
    const experiment = this.abTests.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const control = experiment.variants.find(v => v.isControl);
    if (!control) {
      throw new Error('No control variant found');
    }

    const variantComparison = experiment.variants.map(variant => {
      let improvement: number | undefined;
      
      if (!variant.isControl && control.metrics.totalPredictions > 0) {
        const controlSuccessRate = control.metrics.successfulPredictions / control.metrics.totalPredictions;
        const variantSuccessRate = variant.metrics.totalPredictions > 0
          ? variant.metrics.successfulPredictions / variant.metrics.totalPredictions
          : 0;
        
        improvement = controlSuccessRate > 0
          ? ((variantSuccessRate - controlSuccessRate) / controlSuccessRate) * 100
          : 0;
      }

      return {
        variantId: variant.id,
        variantName: variant.variantName,
        isControl: variant.isControl,
        metrics: variant.metrics,
        improvement
      };
    });

    const totalPredictions = experiment.variants.reduce(
      (sum, v) => sum + v.metrics.totalPredictions, 
      0
    );
    const significanceAchieved = totalPredictions >= experiment.minSampleSize;

    let winner: string | undefined;
    if (significanceAchieved) {
      const bestVariant = variantComparison.reduce((best, current) => {
        const currentRate = current.metrics.totalPredictions > 0
          ? current.metrics.successfulPredictions / current.metrics.totalPredictions
          : 0;
        const bestRate = best.metrics.totalPredictions > 0
          ? best.metrics.successfulPredictions / best.metrics.totalPredictions
          : 0;
        return currentRate > bestRate ? current : best;
      });
      winner = bestVariant.variantId;
    }

    return {
      experiment,
      winner,
      significanceAchieved,
      variantComparison
    };
  }

  /**
   * End an A/B test
   */
  public async endABTest(
    experimentId: string, 
    status: 'completed' | 'cancelled'
  ): Promise<ABTestConfig> {
    const experiment = this.abTests.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    experiment.status = status;
    experiment.endDate = new Date();

    for (const variant of experiment.variants) {
      variant.status = 'archived';
    }

    await this.persistData();

    logger.info('A/B test ended', { experimentId, status });

    return experiment;
  }

  // ============================================================================
  // Performance Tracking
  // ============================================================================

  /**
   * Track a prediction for performance monitoring
   */
  public async trackPrediction(
    modelId: string,
    record: Omit<PredictionRecord, 'id' | 'timestamp'>
  ): Promise<void> {
    await this.ensureInitialized();

    const model = this.models.get(modelId);
    if (!model) {
      logger.warn('Tracking prediction for unknown model', { modelId });
      return;
    }

    const prediction: PredictionRecord = {
      id: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...record
    };

    let modelPredictions = this.predictions.get(modelId);
    if (!modelPredictions) {
      modelPredictions = [];
      this.predictions.set(modelId, modelPredictions);
    }

    modelPredictions.push(prediction);

    if (modelPredictions.length > this.MAX_PREDICTIONS_PER_MODEL) {
      modelPredictions.shift();
    }

    if (record.variantId) {
      this.updateVariantMetrics(modelId, record.variantId, prediction);
    }
  }

  private updateVariantMetrics(
    modelId: string, 
    variantId: string, 
    prediction: PredictionRecord
  ): void {
    const variants = this.variants.get(modelId);
    if (!variants) return;

    const variant = variants.find(v => v.id === variantId);
    if (!variant) return;

    const metrics = variant.metrics;
    metrics.totalPredictions++;
    
    if (prediction.success) {
      metrics.successfulPredictions++;
    }

    const n = metrics.totalPredictions;
    metrics.averageLatency = ((metrics.averageLatency * (n - 1)) + prediction.latencyMs) / n;
    
    const avgConfidence = prediction.confidence.reduce((a, b) => a + b, 0) / prediction.confidence.length;
    metrics.averageConfidence = ((metrics.averageConfidence * (n - 1)) + avgConfidence) / n;
    
    metrics.errorRate = 1 - (metrics.successfulPredictions / metrics.totalPredictions);
  }

  /**
   * Get model performance metrics
   */
  public async getModelPerformance(modelId: string): Promise<ModelPerformance> {
    await this.ensureInitialized();

    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const predictions = this.predictions.get(modelId) || [];
    
    if (predictions.length === 0) {
      return {
        modelId,
        totalPredictions: 0,
        successRate: 0,
        averageLatency: 0,
        averageConfidence: 0,
        errorRate: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        predictionsByDay: {},
        recentPredictions: []
      };
    }

    const successfulPredictions = predictions.filter(p => p.success).length;
    const latencies = predictions.map(p => p.latencyMs).sort((a, b) => a - b);
    const confidences = predictions.flatMap(p => p.confidence);

    const predictionsByDay: Record<string, number> = {};
    for (const pred of predictions) {
      const day = pred.timestamp.toISOString().split('T')[0];
      predictionsByDay[day] = (predictionsByDay[day] || 0) + 1;
    }

    return {
      modelId,
      totalPredictions: predictions.length,
      successRate: successfulPredictions / predictions.length,
      averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      averageConfidence: confidences.length > 0 
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
        : 0,
      errorRate: 1 - (successfulPredictions / predictions.length),
      p50Latency: this.percentile(latencies, 50),
      p95Latency: this.percentile(latencies, 95),
      p99Latency: this.percentile(latencies, 99),
      predictionsByDay,
      recentPredictions: predictions.slice(-100)
    };
  }

  /**
   * Get aggregated performance across all models
   */
  public async getAggregatedPerformance(): Promise<{
    totalModels: number;
    activeModels: number;
    totalPredictions: number;
    averageAccuracy: number;
    modelsByStatus: Record<ModelStatus, number>;
    modelsByType: Record<string, number>;
  }> {
    await this.ensureInitialized();

    const models = Array.from(this.models.values());
    const activeModels = models.filter(m => m.status === 'active');

    const modelsByStatus: Record<ModelStatus, number> = {
      active: 0,
      deprecated: 0,
      archived: 0,
      testing: 0,
      pending: 0
    };

    const modelsByType: Record<string, number> = {};

    let totalAccuracy = 0;
    let modelsWithAccuracy = 0;
    let totalPredictions = 0;

    for (const model of models) {
      modelsByStatus[model.status]++;
      modelsByType[model.type] = (modelsByType[model.type] || 0) + 1;

      if (model.accuracy !== undefined) {
        totalAccuracy += model.accuracy;
        modelsWithAccuracy++;
      }

      const predictions = this.predictions.get(model.id);
      if (predictions) {
        totalPredictions += predictions.length;
      }
    }

    return {
      totalModels: models.length,
      activeModels: activeModels.length,
      totalPredictions,
      averageAccuracy: modelsWithAccuracy > 0 ? totalAccuracy / modelsWithAccuracy : 0,
      modelsByStatus,
      modelsByType
    };
  }

  // ============================================================================
  // Model Loading/Saving
  // ============================================================================

  /**
   * Save a model to the file system
   */
  public async saveModel(modelId: string, model: BaseModel): Promise<string> {
    await this.ensureInitialized();

    const registeredModel = this.models.get(modelId);
    if (!registeredModel) {
      throw new Error(`Model ${modelId} not found in registry`);
    }

    const modelPath = path.join(this.storageDir, modelId);
    await fs.promises.mkdir(modelPath, { recursive: true });

    await model.save(`file://${modelPath}`);
    
    registeredModel.filePath = modelPath;
    registeredModel.updatedAt = new Date();
    
    this.modelInstances.set(modelId, model);
    await this.persistData();

    logger.info('Model saved to file system', { modelId, path: modelPath });

    return modelPath;
  }

  /**
   * Load a model from the file system
   */
  public async loadModel(modelId: string, modelInstance: BaseModel): Promise<void> {
    await this.ensureInitialized();

    const registeredModel = this.models.get(modelId);
    if (!registeredModel) {
      throw new Error(`Model ${modelId} not found in registry`);
    }

    if (!registeredModel.filePath) {
      throw new Error(`Model ${modelId} has no saved file path`);
    }

    await modelInstance.load(`file://${registeredModel.filePath}/model.json`);
    this.modelInstances.set(modelId, modelInstance);

    logger.info('Model loaded from file system', { modelId, path: registeredModel.filePath });
  }

  /**
   * Export model metadata to JSON
   */
  public async exportModelMetadata(modelId: string): Promise<string> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const performance = await this.getModelPerformance(modelId);
    const variants = this.variants.get(modelId) || [];

    return JSON.stringify({
      model,
      performance: {
        totalPredictions: performance.totalPredictions,
        successRate: performance.successRate,
        averageLatency: performance.averageLatency,
        errorRate: performance.errorRate
      },
      variants: variants.length,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private generateModelId(name: string, version: string): string {
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const sanitizedVersion = version.replace(/\./g, '_');
    return `${sanitizedName}_v${sanitizedVersion}`;
  }

  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA !== numB) return numA - numB;
    }
    return 0;
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private hashInput(input: unknown): string {
    const str = JSON.stringify(input);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get registry statistics
   */
  public getRegistryStats(): {
    totalModels: number;
    loadedInstances: number;
    activeExperiments: number;
    trackedPredictions: number;
  } {
    let trackedPredictions = 0;
    for (const predictions of this.predictions.values()) {
      trackedPredictions += predictions.length;
    }

    const activeExperiments = Array.from(this.abTests.values())
      .filter(exp => exp.status === 'running').length;

    return {
      totalModels: this.models.size,
      loadedInstances: this.modelInstances.size,
      activeExperiments,
      trackedPredictions
    };
  }

  /**
   * Dispose all resources
   */
  public async dispose(): Promise<void> {
    for (const instance of this.modelInstances.values()) {
      instance.dispose();
    }
    this.modelInstances.clear();
    
    logger.info('ML Model Registry disposed');
  }
}

export const mlModelRegistry = MLModelRegistry.getInstance();
