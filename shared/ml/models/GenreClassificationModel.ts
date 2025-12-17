/**
 * Custom Genre Classification CNN
 * Multi-stream CNN processing MFCC features for music genre classification
 * Based on industry research: 40 MFCC coefficients → CNN → Genre predictions
 */

import * as tf from '@tensorflow/tfjs';
import { BaseModel } from './BaseModel.js';
import type { GenreClassificationResult, AudioFeatures } from '../types.js';

export const GENRES = [
  'rock',
  'pop',
  'hip-hop',
  'electronic',
  'jazz',
  'classical',
  'country',
  'r&b',
  'indie',
  'folk',
] as const;

export type Genre = typeof GENRES[number];

export class GenreClassificationModel extends BaseModel {
  private readonly mfccHeight = 40;
  private readonly mfccWidth = 130;
  private readonly numGenres = GENRES.length;

  constructor() {
    super({
      name: 'GenreClassificationCNN',
      type: 'classification',
      version: '1.0.0',
      inputShape: [40, 130, 1],
      outputShape: [GENRES.length],
    });
  }

  protected buildModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.conv2d({
          inputShape: [this.mfccHeight, this.mfccWidth, 1],
          filters: 32,
          kernelSize: [3, 3],
          activation: 'relu',
          padding: 'same',
        }),
        tf.layers.maxPooling2d({
          poolSize: [2, 2],
          strides: [2, 2],
        }),
        tf.layers.dropout({ rate: 0.3 }),

        tf.layers.conv2d({
          filters: 64,
          kernelSize: [3, 3],
          activation: 'relu',
          padding: 'same',
        }),
        tf.layers.maxPooling2d({
          poolSize: [2, 2],
          strides: [2, 2],
        }),
        tf.layers.dropout({ rate: 0.3 }),

        tf.layers.conv2d({
          filters: 128,
          kernelSize: [3, 3],
          activation: 'relu',
          padding: 'same',
        }),
        tf.layers.maxPooling2d({
          poolSize: [2, 2],
          strides: [2, 2],
        }),
        tf.layers.dropout({ rate: 0.4 }),

        tf.layers.flatten(),

        tf.layers.dense({
          units: 256,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
        }),
        tf.layers.dropout({ rate: 0.5 }),

        tf.layers.dense({
          units: this.numGenres,
          activation: 'softmax',
        }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  public async trainOnMFCC(
    mfccData: number[][][],
    genreLabels: Genre[],
    options: { epochs: number; batchSize: number; dataAugmentation?: boolean }
  ): Promise<void> {
    let trainingData = mfccData;
    let trainingLabels = genreLabels;

    if (options.dataAugmentation) {
      const { augmentedData, augmentedLabels } = this.applyDataAugmentation(
        mfccData,
        genreLabels
      );
      trainingData = augmentedData;
      trainingLabels = augmentedLabels;
    }

    const normalized = trainingData.map(mfcc => this.normalizeMFCC(mfcc));
    const oneHotLabels = trainingLabels.map(genre => this.genreToOneHot(genre));

    const inputTensor = tf.tensor4d(
      normalized.map(mfcc => [mfcc]),
      [normalized.length, this.mfccHeight, this.mfccWidth, 1]
    );
    const labelTensor = tf.tensor2d(oneHotLabels);

    await this.train(inputTensor, labelTensor, {
      epochs: options.epochs || 50,
      batchSize: options.batchSize || 32,
      learningRate: 0.001,
      validationSplit: 0.2,
      earlyStopping: true,
    });

    inputTensor.dispose();
    labelTensor.dispose();
  }

  public async classifyGenre(mfcc: number[][]): Promise<GenreClassificationResult> {
    if (!this.model || !this.isTrained) {
      throw new Error('Model must be trained before classification');
    }

    const normalized = this.normalizeMFCC(mfcc);
    const inputTensor = tf.tensor4d([[normalized]], [1, this.mfccHeight, this.mfccWidth, 1]);

    try {
      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      const probabilities = await prediction.data();

      const genreIndex = probabilities.indexOf(Math.max(...Array.from(probabilities)));
      const genre = GENRES[genreIndex];
      const confidence = probabilities[genreIndex];

      const topGenres = GENRES.map((g, i) => ({
        genre: g,
        confidence: probabilities[i],
      }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);

      return {
        genre,
        confidence,
        topGenres,
      };
    } finally {
      inputTensor.dispose();
    }
  }

  private normalizeMFCC(mfcc: number[][]): number[][] {
    const flat = mfcc.flat();
    const mean = flat.reduce((sum, val) => sum + val, 0) / flat.length;
    const variance = flat.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / flat.length;
    const std = Math.sqrt(variance) || 1;

    return mfcc.map(row => row.map(val => (val - mean) / std));
  }

  private genreToOneHot(genre: Genre): number[] {
    const oneHot = new Array(this.numGenres).fill(0);
    const index = GENRES.indexOf(genre);
    if (index !== -1) {
      oneHot[index] = 1;
    }
    return oneHot;
  }

  private applyDataAugmentation(
    mfccData: number[][][],
    labels: Genre[]
  ): { augmentedData: number[][][]; augmentedLabels: Genre[] } {
    const augmented: number[][][] = [...mfccData];
    const augmentedLabels: Genre[] = [...labels];

    for (let i = 0; i < mfccData.length; i++) {
      const mfcc = mfccData[i];
      const label = labels[i];

      const timeShifted = this.timeShift(mfcc);
      augmented.push(timeShifted);
      augmentedLabels.push(label);

      const noisy = this.addNoise(mfcc);
      augmented.push(noisy);
      augmentedLabels.push(label);
    }

    return { augmentedData: augmented, augmentedLabels };
  }

  private timeShift(mfcc: number[][]): number[][] {
    const shiftAmount = Math.floor(Math.random() * 10) - 5;
    
    if (shiftAmount === 0) return mfcc;

    const shifted = mfcc.map(row => {
      const newRow = [...row];
      if (shiftAmount > 0) {
        return [...new Array(shiftAmount).fill(0), ...newRow.slice(0, -shiftAmount)];
      } else {
        return [...newRow.slice(-shiftAmount), ...new Array(-shiftAmount).fill(0)];
      }
    });

    return shifted;
  }

  private addNoise(mfcc: number[][]): number[][] {
    const noiseLevel = 0.005;
    return mfcc.map(row => row.map(val => val + (Math.random() - 0.5) * noiseLevel));
  }

  protected preprocessInput(input: number[][]): tf.Tensor {
    const normalized = this.normalizeMFCC(input);
    return tf.tensor4d([[normalized]], [1, this.mfccHeight, this.mfccWidth, 1]);
  }

  protected postprocessOutput(output: tf.Tensor): Genre {
    const probabilities = output.dataSync();
    const genreIndex = Array.from(probabilities).indexOf(Math.max(...Array.from(probabilities)));
    return GENRES[genreIndex];
  }

  public async evaluateAccuracy(
    testMFCC: number[][][],
    testLabels: Genre[]
  ): Promise<{
    accuracy: number;
    perGenreAccuracy: Record<Genre, number>;
    confusionMatrix: number[][];
  }> {
    const confusionMatrix: number[][] = Array(this.numGenres)
      .fill(0)
      .map(() => Array(this.numGenres).fill(0));

    const genreCounts: Record<Genre, { correct: number; total: number }> = {} as any;
    GENRES.forEach(g => (genreCounts[g] = { correct: 0, total: 0 }));

    let correct = 0;

    for (let i = 0; i < testMFCC.length; i++) {
      const prediction = await this.classifyGenre(testMFCC[i]);
      const actual = testLabels[i];

      const predictedIdx = GENRES.indexOf(prediction.genre);
      const actualIdx = GENRES.indexOf(actual);

      confusionMatrix[actualIdx][predictedIdx]++;
      genreCounts[actual].total++;

      if (prediction.genre === actual) {
        correct++;
        genreCounts[actual].correct++;
      }
    }

    const accuracy = correct / testMFCC.length;
    const perGenreAccuracy: Record<Genre, number> = {} as any;

    GENRES.forEach(genre => {
      const { correct, total } = genreCounts[genre];
      perGenreAccuracy[genre] = total > 0 ? correct / total : 0;
    });

    return { accuracy, perGenreAccuracy, confusionMatrix };
  }
}
