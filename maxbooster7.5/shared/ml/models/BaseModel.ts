/**
 * Base class for all custom ML models
 * Provides common functionality for training, prediction, and persistence
 */

import * as tf from '@tensorflow/tfjs';
import type { ModelMetadata, TrainingOptions, PredictionResult, EvaluationMetrics } from '../types.js';

export abstract class BaseModel {
  protected model: tf.LayersModel | null = null;
  protected metadata: ModelMetadata;
  protected isCompiled: boolean = false;
  protected isTrained: boolean = false;

  constructor(metadata: Partial<ModelMetadata>) {
    this.metadata = {
      id: metadata.id || crypto.randomUUID(),
      name: metadata.name || 'UnnamedModel',
      version: metadata.version || '1.0.0',
      type: metadata.type || 'regression',
      inputShape: metadata.inputShape || [],
      outputShape: metadata.outputShape || [],
      createdAt: metadata.createdAt || new Date(),
      lastTrained: metadata.lastTrained || new Date(),
      metrics: metadata.metrics || {},
    };
  }

  /**
   * Build the model architecture
   * Must be implemented by subclasses
   */
  protected abstract buildModel(): tf.LayersModel;

  /**
   * Preprocess input data before prediction
   */
  protected abstract preprocessInput(input: any): tf.Tensor;

  /**
   * Postprocess model output
   */
  protected abstract postprocessOutput(output: tf.Tensor): any;

  /**
   * Initialize the model
   */
  public async initialize(): Promise<void> {
    if (!this.model) {
      this.model = this.buildModel();
      this.isCompiled = true;
    }
  }

  /**
   * Train the model
   */
  public async train(
    inputs: number[][] | tf.Tensor,
    labels: number[] | number[][] | tf.Tensor,
    options: TrainingOptions
  ): Promise<void> {
    if (!this.model) {
      await this.initialize();
    }

    if (!this.model) {
      throw new Error('Model initialization failed');
    }

    const inputTensor = Array.isArray(inputs) ? tf.tensor(inputs) : inputs;
    const labelTensor = Array.isArray(labels) ? tf.tensor(labels) : labels;

    try {
      const history = await this.model.fit(inputTensor, labelTensor, {
        epochs: options.epochs,
        batchSize: options.batchSize,
        validationSplit: options.validationSplit || 0.2,
        verbose: options.verbose ? 1 : 0,
        callbacks: options.earlyStopping ? [
          tf.callbacks.earlyStopping({ patience: 10, monitor: 'val_loss' })
        ] : undefined,
      });

      // Update metadata
      this.metadata.lastTrained = new Date();
      const finalEpoch = history.history.loss?.length || 1;
      this.metadata.loss = Number(history.history.loss?.[finalEpoch - 1]) || 0;
      this.metadata.accuracy = Number(history.history.acc?.[finalEpoch - 1]) || 
                              Number(history.history.accuracy?.[finalEpoch - 1]) || 0;

      this.isTrained = true;
    } finally {
      // Clean up tensors if we created them
      if (Array.isArray(inputs)) inputTensor.dispose();
      if (Array.isArray(labels)) labelTensor.dispose();
    }
  }

  /**
   * Make predictions
   */
  public async predict(input: any): Promise<PredictionResult> {
    if (!this.model || !this.isTrained) {
      throw new Error('Model must be trained before making predictions');
    }

    const inputTensor = this.preprocessInput(input);

    try {
      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      const output = this.postprocessOutput(prediction);

      // Calculate confidence (simplified)
      const softmax = tf.softmax(prediction);
      const maxConfidence = await softmax.max().data();
      const confidenceArray = await softmax.data();

      return {
        predictions: Array.from(await prediction.data()),
        confidence: Array.from(confidenceArray),
        metadata: {
          modelId: this.metadata.id,
          modelName: this.metadata.name,
          timestamp: new Date(),
        },
      };
    } finally {
      inputTensor.dispose();
    }
  }

  /**
   * Evaluate model on test data
   */
  public async evaluate(
    testInputs: number[][] | tf.Tensor,
    testLabels: number[] | number[][] | tf.Tensor
  ): Promise<EvaluationMetrics> {
    if (!this.model || !this.isTrained) {
      throw new Error('Model must be trained before evaluation');
    }

    const inputTensor = Array.isArray(testInputs) ? tf.tensor(testInputs) : testInputs;
    const labelTensor = Array.isArray(testLabels) ? tf.tensor(testLabels) : testLabels;

    try {
      const result = await this.model.evaluate(inputTensor, labelTensor) as tf.Scalar[];
      
      const loss = await result[0].data();
      const accuracy = result.length > 1 ? await result[1].data() : [0];

      return {
        accuracy: accuracy[0],
        mse: loss[0],
      };
    } finally {
      if (Array.isArray(testInputs)) inputTensor.dispose();
      if (Array.isArray(testLabels)) labelTensor.dispose();
    }
  }

  /**
   * Save model to storage
   */
  public async save(path: string): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    await this.model.save(path);
    
    // Save metadata
    const metadataPath = `${path}/metadata.json`;
    // Note: In browser, this would save to IndexedDB
    // In Node.js, this would save to filesystem
  }

  /**
   * Load model from storage
   */
  public async load(path: string): Promise<void> {
    this.model = await tf.loadLayersModel(path);
    this.isCompiled = true;
    this.isTrained = true;

    // Load metadata
    // const metadataPath = `${path}/metadata.json`;
  }

  /**
   * Get model summary
   */
  public summary(): void {
    if (!this.model) {
      console.log('Model not initialized');
      return;
    }

    this.model.summary();
  }

  /**
   * Get model metadata
   */
  public getMetadata(): ModelMetadata {
    return { ...this.metadata };
  }

  /**
   * Dispose of model resources
   */
  public dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      this.isCompiled = false;
      this.isTrained = false;
    }
  }

  /**
   * Check if model is ready for predictions
   */
  public isReady(): boolean {
    return this.model !== null && this.isCompiled && this.isTrained;
  }

  /**
   * Check if model has been trained (public getter)
   */
  public getIsTrained(): boolean {
    return this.isTrained;
  }

  /**
   * Get model version
   */
  public getVersion(): string {
    return this.metadata.version;
  }
}
