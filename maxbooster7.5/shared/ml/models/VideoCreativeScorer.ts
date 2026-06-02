/**
 * VideoCreativeScorer
 *
 * In-house TF.js model that pre-flight scores a creative package before
 * rendering — predicting watch-time retention, hook strength, and conversion
 * likelihood directly from plan features and music metadata.
 *
 * This closes the loop between content creation and real platform outcomes,
 * enabling A/B variant selection before any compute-heavy rendering happens.
 *
 * Input  (14 features): platform, goal, tone, bpm_norm, energy_mean,
 *                        hook_word_count_norm, has_question_hook,
 *                        has_statement_hook, beat_count_norm, visual_diversity_norm,
 *                        has_cta, genre_energy, mood_energy, script_length_norm
 * Output  (3 values):   watch_time_score, hook_strength, conversion_score
 */

import * as tf from "@tensorflow/tfjs";
import { BaseModel } from "./BaseModel.js";
import { PLATFORM_IDX, GOAL_IDX, TONE_IDX } from "./CreativePlannerModel.js";

export interface CreativeScorerInput {
  platform: string;
  goal: string;
  tone: string;
  bpm: number;
  energyMean: number;
  hookWordCount: number;
  hasQuestionHook: boolean;
  hasStatementHook: boolean;
  beatCount: number;
  visualDiversity: number;
  hasCTA: boolean;
  genreEnergy: number;
  moodEnergy: number;
  scriptLength: number;
}

export interface CreativeScorerOutput {
  watchTimeScore: number;
  hookStrength: number;
  conversionScore: number;
  /** Overall composite score (weighted average) */
  compositeScore: number;
}

export function extractScorerFeatures(input: CreativeScorerInput): number[] {
  return [
    (PLATFORM_IDX[input.platform] ?? 0) / 7,
    (GOAL_IDX[input.goal] ?? 0) / 4,
    (TONE_IDX[input.tone] ?? 0) / 5,
    Math.max(0, Math.min(1, (input.bpm - 60) / 160)),
    Math.max(0, Math.min(1, input.energyMean)),
    Math.max(0, Math.min(1, input.hookWordCount / 20)),
    input.hasQuestionHook ? 1 : 0,
    input.hasStatementHook ? 1 : 0,
    Math.max(0, Math.min(1, (input.beatCount - 1) / 7)),
    Math.max(0, Math.min(1, input.visualDiversity)),
    input.hasCTA ? 1 : 0,
    Math.max(0, Math.min(1, input.genreEnergy)),
    Math.max(0, Math.min(1, input.moodEnergy)),
    Math.max(0, Math.min(1, input.scriptLength / 500)),
  ];
}

export class VideoCreativeScorer extends BaseModel {
  constructor() {
    super({
      name: "VideoCreativeScorer",
      version: "1.0.0",
      type: "regression",
      inputShape: [14],
      outputShape: [3],
    });
  }

  protected buildModel(): tf.LayersModel {
    const input = tf.input({ shape: [14] });
    let x = tf.layers
      .dense({ units: 128, activation: "relu", kernelInitializer: "heNormal" })
      .apply(input) as tf.SymbolicTensor;
    x = tf.layers.batchNormalization().apply(x) as tf.SymbolicTensor;
    x = tf.layers.dropout({ rate: 0.25 }).apply(x) as tf.SymbolicTensor;
    x = tf.layers
      .dense({ units: 64, activation: "relu", kernelInitializer: "heNormal" })
      .apply(x) as tf.SymbolicTensor;
    x = tf.layers.batchNormalization().apply(x) as tf.SymbolicTensor;
    x = tf.layers.dropout({ rate: 0.15 }).apply(x) as tf.SymbolicTensor;
    x = tf.layers
      .dense({ units: 32, activation: "relu" })
      .apply(x) as tf.SymbolicTensor;
    const output = tf.layers
      .dense({ units: 3, activation: "sigmoid" })
      .apply(x) as tf.SymbolicTensor;
    const model = tf.model({ inputs: input, outputs: output });
    model.compile({
      optimizer: tf.train.adam(0.0005),
      loss: "meanSquaredError",
      metrics: ["mae"],
    });
    return model;
  }

  protected preprocessInput(input: number[]): tf.Tensor {
    return tf.tensor2d([input], [1, 14]);
  }

  protected postprocessOutput(output: tf.Tensor): CreativeScorerOutput {
    const [watchTime, hook, conversion] = Array.from(output.dataSync());
    return {
      watchTimeScore: watchTime,
      hookStrength: hook,
      conversionScore: conversion,
      compositeScore: watchTime * 0.4 + hook * 0.35 + conversion * 0.25,
    };
  }

  public async scoreCreative(
    input: CreativeScorerInput,
  ): Promise<CreativeScorerOutput> {
    if (!this.model) await this.initialize();
    const features = extractScorerFeatures(input);
    const result = await this.predict(features);
    return result.prediction as CreativeScorerOutput;
  }

  public static makeSyntheticSamples(count: number): {
    inputs: number[][];
    labels: number[][];
  } {
    const platforms = Object.keys(PLATFORM_IDX);
    const goals = Object.keys(GOAL_IDX);
    const tones = Object.keys(TONE_IDX);

    const inputs: number[][] = [];
    const labels: number[][] = [];

    for (let i = 0; i < count; i++) {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      const goal = goals[Math.floor(Math.random() * goals.length)];
      const tone = tones[Math.floor(Math.random() * tones.length)];
      const bpm = 60 + Math.random() * 160;
      const energyMean = Math.random();
      const hookWordCount = 2 + Math.floor(Math.random() * 18);
      const hasQuestionHook = Math.random() > 0.5;
      const hasStatementHook = Math.random() > 0.5;
      const beatCount = 2 + Math.floor(Math.random() * 6);
      const visualDiversity = Math.random();
      const hasCTA = Math.random() > 0.3;
      const genreEnergy = Math.random();
      const moodEnergy = Math.random();
      const scriptLength = 50 + Math.floor(Math.random() * 450);

      inputs.push(
        extractScorerFeatures({
          platform,
          goal,
          tone,
          bpm,
          energyMean,
          hookWordCount,
          hasQuestionHook,
          hasStatementHook,
          beatCount,
          visualDiversity,
          hasCTA,
          genreEnergy,
          moodEnergy,
          scriptLength,
        }),
      );

      // Label heuristics
      const isHighEnergy = tone === "high_energy" || tone === "hype";
      const isConversion = goal === "conversion" || goal === "launch";
      const hookBonus =
        (hasQuestionHook ? 0.1 : 0) + (hasStatementHook ? 0.05 : 0);
      const ctaBonus = hasCTA ? 0.15 : 0;

      const watchTime =
        0.4 + energyMean * 0.2 + (isHighEnergy ? 0.1 : 0) + Math.random() * 0.2;
      const hook =
        0.4 + hookBonus + (isHighEnergy ? 0.15 : 0) + Math.random() * 0.25;
      const conversion =
        0.3 + ctaBonus + (isConversion ? 0.2 : 0) + Math.random() * 0.25;

      labels.push([
        Math.min(1, watchTime),
        Math.min(1, hook),
        Math.min(1, conversion),
      ]);
    }
    return { inputs, labels };
  }
}
