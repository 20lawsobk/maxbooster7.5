/**
 * CreativePlannerModel
 *
 * In-house TF.js model that learns which creative plan structures
 * (beat count, hook emotional weight, variant diversity, CTA urgency)
 * drive the highest engagement on a given platform, goal, and tone,
 * informed by the track's musical characteristics.
 *
 * Trained on synthetic music-industry creative briefs and continuously
 * refined via the creativeModelService feedback loop.
 *
 * Input  (12 features): platform, goal, tone, domain, bpm_norm,
 *                        energy_mean, section_count_norm, has_drop,
 *                        is_minor, tempo_stability, energy_peak, mood_energy
 * Output  (4 values):   optimal_beat_count_norm, hook_emotional_weight,
 *                        variant_diversity, cta_urgency
 */

import * as tf from '@tensorflow/tfjs';
import { BaseModel } from './BaseModel.js';

// ─── Lookup Tables ────────────────────────────────────────────────────────────

export const PLATFORM_IDX: Record<string, number> = {
  tiktok: 0, reels: 1, instagram: 1, shorts: 2, youtube: 2,
  twitter: 3, feed: 4, facebook: 4, story: 5, linkedin: 6, threads: 4,
};
export const GOAL_IDX: Record<string, number> = {
  awareness: 0, launch: 1, conversion: 2, engagement: 3, growth: 4,
};
export const TONE_IDX: Record<string, number> = {
  high_energy: 0, cinematic: 1, lo_fi: 2, hype: 3, emotional: 4, chill: 5,
};
export const DOMAIN_IDX: Record<string, number> = {
  music: 0, advertising: 1, social_media: 2, technology: 3,
};

// ─── Feature Extraction ───────────────────────────────────────────────────────

export interface CreativePlannerInput {
  platform: string;
  goal: string;
  tone: string;
  domain: string;
  bpm: number;
  energyMean: number;
  sectionCount: number;
  hasDrop: boolean;
  isMinor: boolean;
  tempoStability: number;
  energyPeak: number;
  moodEnergy: number;
}

export interface CreativePlannerOutput {
  /** Suggested number of beat-scenes (2–8) */
  optimalBeatCount: number;
  /** How emotionally charged the hook should be (0–1) */
  hookEmotionalWeight: number;
  /** How many A/B testing variants to generate (0=1 variant, 1=5 variants) */
  variantDiversity: number;
  /** How urgent the CTA should feel (0=soft, 1=high-pressure) */
  ctaUrgency: number;
}

export function extractCreativePlannerFeatures(input: CreativePlannerInput): number[] {
  return [
    (PLATFORM_IDX[input.platform] ?? 0) / 7,
    (GOAL_IDX[input.goal] ?? 0) / 4,
    (TONE_IDX[input.tone] ?? 0) / 5,
    (DOMAIN_IDX[input.domain] ?? 0) / 3,
    Math.max(0, Math.min(1, (input.bpm - 60) / 160)),
    Math.max(0, Math.min(1, input.energyMean)),
    Math.max(0, Math.min(1, (input.sectionCount - 1) / 7)),
    input.hasDrop ? 1 : 0,
    input.isMinor ? 1 : 0,
    Math.max(0, Math.min(1, input.tempoStability)),
    Math.max(0, Math.min(1, input.energyPeak)),
    Math.max(0, Math.min(1, input.moodEnergy)),
  ];
}

// ─── Model Class ──────────────────────────────────────────────────────────────

export class CreativePlannerModel extends BaseModel {
  constructor() {
    super({
      name: 'CreativePlannerModel',
      version: '1.0.0',
      type: 'regression',
      inputShape: [12],
      outputShape: [4],
    });
  }

  protected buildModel(): tf.LayersModel {
    const input = tf.input({ shape: [12] });
    let x = tf.layers.dense({ units: 64, activation: 'relu', kernelInitializer: 'heNormal' }).apply(input) as tf.SymbolicTensor;
    x = tf.layers.batchNormalization().apply(x) as tf.SymbolicTensor;
    x = tf.layers.dropout({ rate: 0.2 }).apply(x) as tf.SymbolicTensor;
    x = tf.layers.dense({ units: 32, activation: 'relu', kernelInitializer: 'heNormal' }).apply(x) as tf.SymbolicTensor;
    x = tf.layers.dense({ units: 16, activation: 'relu' }).apply(x) as tf.SymbolicTensor;
    const output = tf.layers.dense({ units: 4, activation: 'sigmoid' }).apply(x) as tf.SymbolicTensor;
    const model = tf.model({ inputs: input, outputs: output });
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError', metrics: ['mae'] });
    return model;
  }

  protected preprocessInput(input: number[]): tf.Tensor {
    return tf.tensor2d([input], [1, 12]);
  }

  protected postprocessOutput(output: tf.Tensor): CreativePlannerOutput {
    const values = Array.from(output.dataSync());
    return {
      optimalBeatCount: Math.round(2 + values[0] * 6),
      hookEmotionalWeight: values[1],
      variantDiversity: values[2],
      ctaUrgency: values[3],
    };
  }

  public async predictPlan(input: CreativePlannerInput): Promise<CreativePlannerOutput> {
    if (!this.model) await this.initialize();
    const features = extractCreativePlannerFeatures(input);
    const result = await this.predict(features);
    return result.prediction as CreativePlannerOutput;
  }

  /** Synthetic training sample generator */
  public static makeSyntheticSamples(count: number): { inputs: number[][]; labels: number[][] } {
    const platforms = Object.keys(PLATFORM_IDX);
    const goals = Object.keys(GOAL_IDX);
    const tones = Object.keys(TONE_IDX);
    const domains = Object.keys(DOMAIN_IDX);

    const inputs: number[][] = [];
    const labels: number[][] = [];

    for (let i = 0; i < count; i++) {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      const goal = goals[Math.floor(Math.random() * goals.length)];
      const tone = tones[Math.floor(Math.random() * tones.length)];
      const domain = domains[Math.floor(Math.random() * domains.length)];
      const bpm = 60 + Math.random() * 160;
      const energyMean = Math.random();
      const sectionCount = 1 + Math.floor(Math.random() * 7);
      const hasDrop = Math.random() > 0.5;
      const isMinor = Math.random() > 0.5;
      const tempoStability = Math.random();
      const energyPeak = Math.random();
      const moodEnergy = Math.random();

      inputs.push(extractCreativePlannerFeatures({
        platform, goal, tone, domain, bpm, energyMean, sectionCount,
        hasDrop, isMinor, tempoStability, energyPeak, moodEnergy,
      }));

      // Label heuristics based on platform + goal + music features
      const isTikTok = platform === 'tiktok' || platform === 'reels';
      const isConversion = goal === 'conversion' || goal === 'launch';
      const isHighEnergy = tone === 'high_energy' || tone === 'hype';

      const beatCountNorm = isTikTok ? 0.4 + Math.random() * 0.3 : 0.2 + Math.random() * 0.6;
      const hookWeight = isHighEnergy ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.5;
      const varDiversity = isConversion ? 0.6 + Math.random() * 0.4 : 0.2 + Math.random() * 0.5;
      const ctaUrgency = isConversion ? 0.7 + Math.random() * 0.3 : 0.2 + Math.random() * 0.5;

      labels.push([beatCountNorm, hookWeight, varDiversity, ctaUrgency]);
    }
    return { inputs, labels };
  }
}
