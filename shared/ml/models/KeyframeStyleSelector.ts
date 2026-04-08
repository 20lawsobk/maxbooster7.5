/**
 * KeyframeStyleSelector
 *
 * In-house TF.js model that selects the optimal visual style (one of 13
 * industry-grade styles supported by the video generator) for each keyframe,
 * based on platform, music energy, emotional goal, and aesthetic preference.
 *
 * Output is a probability distribution across all 13 styles — the top-1 pick
 * is used for generation, top-3 are surfaced for A/B variant selection.
 *
 * The 13 visual styles match videoGeneratorService exactly:
 *   Abstract: plasma_fractal, galaxy_spiral, neon_tunnel, aurora_curtains,
 *             warp_speed, liquid_metal, fire_embers, crystal_facets
 *   Realistic: concert_stage, city_nights, studio_session, golden_hour, neon_cityscape
 *
 * Input  (8 features): platform, tone, genre, bpm_norm, energy_at_beat,
 *                       aesthetic_category, emotional_goal, beat_idx_norm
 * Output (13 values):  softmax probability over 13 visual styles
 */

import * as tf from '@tensorflow/tfjs';
import { BaseModel } from './BaseModel.js';
import { PLATFORM_IDX, TONE_IDX } from './CreativePlannerModel.js';

// ─── Style Catalogue (mirrors videoGeneratorService exactly) ──────────────────

export const VIDEO_STYLES = [
  'plasma_fractal',
  'galaxy_spiral',
  'neon_tunnel',
  'aurora_curtains',
  'warp_speed',
  'liquid_metal',
  'fire_embers',
  'crystal_facets',
  'concert_stage',
  'city_nights',
  'studio_session',
  'golden_hour',
  'neon_cityscape',
] as const;

export type VideoStyle = typeof VIDEO_STYLES[number];

export const STYLE_IDX: Record<VideoStyle, number> = Object.fromEntries(
  VIDEO_STYLES.map((s, i) => [s, i])
) as Record<VideoStyle, number>;

export const AESTHETIC_IDX: Record<string, number> = {
  neon_glitch: 0, cinematic: 1, lo_fi: 2, retro: 3, minimal: 4,
  psychedelic: 5, urban: 6, nature: 7, futuristic: 8, vintage: 9,
};

export const EMOTIONAL_GOAL_IDX: Record<string, number> = {
  curiosity: 0, connection: 1, action: 2, excitement: 3, nostalgia: 4,
  inspiration: 5, tension: 6, relief: 7,
};

export const GENRE_ENERGY_MAP: Record<string, number> = {
  'hip-hop': 0.75, 'trap': 0.85, 'electronic': 0.9, 'house': 0.85, 'techno': 0.95,
  'pop': 0.65, 'r&b': 0.6, 'lo-fi': 0.3, 'jazz': 0.45, 'rock': 0.8,
  'metal': 0.95, 'indie': 0.55, 'folk': 0.35, 'classical': 0.4,
};

// ─── Feature Extraction ───────────────────────────────────────────────────────

export interface KeyframeSelectorInput {
  platform: string;
  tone: string;
  genre: string;
  bpm: number;
  energyAtBeat: number;
  aesthetic: string;
  emotionalGoal: string;
  beatIndexNorm: number;
}

export interface KeyframeSelectorOutput {
  /** Recommended style (argmax) */
  primaryStyle: VideoStyle;
  /** Top 3 styles with probabilities for A/B variants */
  topStyles: Array<{ style: VideoStyle; probability: number }>;
  /** Full probability distribution */
  probabilities: number[];
}

export function extractStyleFeatures(input: KeyframeSelectorInput): number[] {
  return [
    (PLATFORM_IDX[input.platform] ?? 0) / 7,
    (TONE_IDX[input.tone] ?? 0) / 5,
    Math.max(0, Math.min(1, GENRE_ENERGY_MAP[input.genre] ?? 0.5)),
    Math.max(0, Math.min(1, (input.bpm - 60) / 160)),
    Math.max(0, Math.min(1, input.energyAtBeat)),
    (AESTHETIC_IDX[input.aesthetic] ?? 0) / 9,
    (EMOTIONAL_GOAL_IDX[input.emotionalGoal] ?? 0) / 7,
    Math.max(0, Math.min(1, input.beatIndexNorm)),
  ];
}

// ─── Model Class ──────────────────────────────────────────────────────────────

export class KeyframeStyleSelector extends BaseModel {
  constructor() {
    super({
      name: 'KeyframeStyleSelector',
      version: '1.0.0',
      type: 'classification',
      inputShape: [8],
      outputShape: [13],
    });
  }

  protected buildModel(): tf.LayersModel {
    const input = tf.input({ shape: [8] });
    let x = tf.layers.dense({ units: 64, activation: 'relu', kernelInitializer: 'glorotNormal' }).apply(input) as tf.SymbolicTensor;
    x = tf.layers.batchNormalization().apply(x) as tf.SymbolicTensor;
    x = tf.layers.dropout({ rate: 0.2 }).apply(x) as tf.SymbolicTensor;
    x = tf.layers.dense({ units: 32, activation: 'relu' }).apply(x) as tf.SymbolicTensor;
    const output = tf.layers.dense({ units: 13, activation: 'softmax' }).apply(x) as tf.SymbolicTensor;
    const model = tf.model({ inputs: input, outputs: output });
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
    return model;
  }

  protected preprocessInput(input: number[]): tf.Tensor {
    return tf.tensor2d([input], [1, 8]);
  }

  protected postprocessOutput(output: tf.Tensor): KeyframeSelectorOutput {
    const probs = Array.from(output.dataSync());
    const indexed = probs.map((p, i) => ({ style: VIDEO_STYLES[i], probability: p }));
    const sorted = [...indexed].sort((a, b) => b.probability - a.probability);
    return {
      primaryStyle: sorted[0].style,
      topStyles: sorted.slice(0, 3),
      probabilities: probs,
    };
  }

  public async selectStyle(input: KeyframeSelectorInput): Promise<KeyframeSelectorOutput> {
    if (!this.model) await this.initialize();
    const features = extractStyleFeatures(input);
    const result = await this.predict(features);
    return result.prediction as KeyframeSelectorOutput;
  }

  public static makeSyntheticSamples(count: number): { inputs: number[][]; labels: number[][] } {
    const platforms = Object.keys(PLATFORM_IDX);
    const tones = Object.keys(TONE_IDX);
    const genres = Object.keys(GENRE_ENERGY_MAP);
    const aesthetics = Object.keys(AESTHETIC_IDX);
    const goals = Object.keys(EMOTIONAL_GOAL_IDX);

    const inputs: number[][] = [];
    const labels: number[][] = [];

    // Style affinity rules:
    // High energy + neon/glitch aesthetic → neon_tunnel, neon_cityscape, fire_embers
    // Cinematic + low energy → golden_hour, studio_session, aurora_curtains
    // Electronic genre → plasma_fractal, warp_speed, neon_tunnel
    // Concert/excitement → concert_stage, city_nights
    const styleAffinities: Array<{ condition: (i: KeyframeSelectorInput) => boolean; styles: VideoStyle[] }> = [
      { condition: i => i.tone === 'high_energy' && (i.aesthetic === 'neon_glitch' || i.aesthetic === 'futuristic'),
        styles: ['neon_tunnel', 'neon_cityscape', 'fire_embers'] },
      { condition: i => i.tone === 'cinematic' || i.energyAtBeat < 0.4,
        styles: ['golden_hour', 'studio_session', 'aurora_curtains'] },
      { condition: i => ['electronic', 'house', 'techno'].includes(i.genre),
        styles: ['plasma_fractal', 'warp_speed', 'neon_tunnel', 'neon_cityscape'] },
      { condition: i => i.emotionalGoal === 'excitement' || i.emotionalGoal === 'action',
        styles: ['concert_stage', 'city_nights', 'fire_embers'] },
      { condition: i => i.tone === 'lo_fi' || i.genre === 'lo-fi',
        styles: ['studio_session', 'golden_hour', 'aurora_curtains'] },
      { condition: i => i.aesthetic === 'psychedelic',
        styles: ['galaxy_spiral', 'plasma_fractal', 'crystal_facets'] },
      { condition: i => i.aesthetic === 'urban' || i.emotionalGoal === 'connection',
        styles: ['city_nights', 'concert_stage', 'neon_cityscape'] },
    ];

    for (let i = 0; i < count; i++) {
      const inp: KeyframeSelectorInput = {
        platform: platforms[Math.floor(Math.random() * platforms.length)],
        tone: tones[Math.floor(Math.random() * tones.length)],
        genre: genres[Math.floor(Math.random() * genres.length)],
        bpm: 60 + Math.random() * 160,
        energyAtBeat: Math.random(),
        aesthetic: aesthetics[Math.floor(Math.random() * aesthetics.length)],
        emotionalGoal: goals[Math.floor(Math.random() * goals.length)],
        beatIndexNorm: Math.random(),
      };
      inputs.push(extractStyleFeatures(inp));

      const label = new Array(13).fill(0.01);
      let matched = false;
      for (const { condition, styles } of styleAffinities) {
        if (condition(inp)) {
          styles.forEach(s => {
            label[STYLE_IDX[s]] += 0.7 / styles.length;
          });
          matched = true;
          break;
        }
      }
      if (!matched) {
        const randomStyle = Math.floor(Math.random() * 13);
        label[randomStyle] = 0.7;
      }
      const sum = label.reduce((a, b) => a + b, 0);
      labels.push(label.map(v => v / sum));
    }
    return { inputs, labels };
  }
}
