/**
 * BeatSyncAlignmentModel
 *
 * In-house TF.js model that learns the precise beat-locked cut point and
 * transition type for each scene boundary in a music-synced video.
 *
 * This is the core differentiator vs. generic video generators (e.g. Veo):
 * cuts are locked to musical energy peaks and section transitions rather
 * than arbitrary time intervals.
 *
 * Input  (8 features): bpm_norm, section_energy, beat_idx_norm,
 *                       total_beats_norm, energy_variance, is_chorus,
 *                       accumulated_energy_norm, transition_momentum
 * Output  (2 values):  cut_time_delta (-0.5→0.5 relative to beat boundary),
 *                       transition_type (0=cut_on_beat, 0.5=crossfade, 1=dissolve)
 */

import * as tf from "@tensorflow/tfjs";
import { BaseModel } from "./BaseModel.js";

export interface BeatAlignmentInput {
  bpm: number;
  sectionEnergy: number;
  beatIndex: number;
  totalBeats: number;
  energyVariance: number;
  isChorussOrDrop: boolean;
  accumulatedEnergy: number;
  transitionMomentum: number;
}

export interface BeatAlignmentOutput {
  /** Seconds to shift the cut point relative to the beat boundary (-0.5s → +0.5s) */
  cutTimeDelta: number;
  /** Transition type: 'cut_on_beat' | 'crossfade' | 'dissolve' */
  transitionType: "cut_on_beat" | "crossfade" | "dissolve";
  /** Raw transition type score (0–1) */
  transitionScore: number;
}

export function extractAlignmentFeatures(input: BeatAlignmentInput): number[] {
  return [
    Math.max(0, Math.min(1, (input.bpm - 60) / 160)),
    Math.max(0, Math.min(1, input.sectionEnergy)),
    Math.max(0, Math.min(1, input.beatIndex / Math.max(1, input.totalBeats))),
    Math.max(0, Math.min(1, input.totalBeats / 32)),
    Math.max(0, Math.min(1, input.energyVariance)),
    input.isChorussOrDrop ? 1 : 0,
    Math.max(0, Math.min(1, input.accumulatedEnergy)),
    Math.max(0, Math.min(1, input.transitionMomentum)),
  ];
}

export class BeatSyncAlignmentModel extends BaseModel {
  constructor() {
    super({
      name: "BeatSyncAlignmentModel",
      version: "1.0.0",
      type: "regression",
      inputShape: [8],
      outputShape: [2],
    });
  }

  protected buildModel(): tf.LayersModel {
    const input = tf.input({ shape: [8] });
    let x = tf.layers
      .dense({ units: 32, activation: "relu", kernelInitializer: "heNormal" })
      .apply(input) as tf.SymbolicTensor;
    x = tf.layers.batchNormalization().apply(x) as tf.SymbolicTensor;
    x = tf.layers
      .dense({ units: 16, activation: "relu" })
      .apply(x) as tf.SymbolicTensor;
    const output = tf.layers
      .dense({ units: 2, activation: "tanh" })
      .apply(x) as tf.SymbolicTensor;
    const model = tf.model({ inputs: input, outputs: output });
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: "meanSquaredError",
      metrics: ["mae"],
    });
    return model;
  }

  protected preprocessInput(input: number[]): tf.Tensor {
    return tf.tensor2d([input], [1, 8]);
  }

  protected postprocessOutput(output: tf.Tensor): BeatAlignmentOutput {
    const [delta, typeScore] = Array.from(output.dataSync());
    const cutTimeDelta = delta * 0.5;
    const normalizedType = (typeScore + 1) / 2;
    const transitionType: BeatAlignmentOutput["transitionType"] =
      normalizedType < 0.33
        ? "cut_on_beat"
        : normalizedType < 0.67
          ? "crossfade"
          : "dissolve";
    return { cutTimeDelta, transitionType, transitionScore: normalizedType };
  }

  public async alignBeat(
    input: BeatAlignmentInput,
  ): Promise<BeatAlignmentOutput> {
    if (!this.model) await this.initialize();
    const features = extractAlignmentFeatures(input);
    const result = await this.predict(features);
    return result.prediction as BeatAlignmentOutput;
  }

  public static makeSyntheticSamples(count: number): {
    inputs: number[][];
    labels: number[][];
  } {
    const inputs: number[][] = [];
    const labels: number[][] = [];

    for (let i = 0; i < count; i++) {
      const bpm = 60 + Math.random() * 160;
      const sectionEnergy = Math.random();
      const totalBeats = 4 + Math.floor(Math.random() * 28);
      const beatIndex = Math.floor(Math.random() * totalBeats);
      const energyVariance = Math.random();
      const isChorussOrDrop = Math.random() > 0.6;
      const accumulatedEnergy = Math.random();
      const transitionMomentum = Math.random();

      inputs.push(
        extractAlignmentFeatures({
          bpm,
          sectionEnergy,
          beatIndex,
          totalBeats,
          energyVariance,
          isChorussOrDrop,
          accumulatedEnergy,
          transitionMomentum,
        }),
      );

      // High-energy drops → cut_on_beat (tight, tanh near -1)
      // Mid energy → crossfade (tanh near 0)
      // Low energy / outro → dissolve (tanh near +1)
      const deltaLabel = (Math.random() - 0.5) * 0.4;
      const typeLabel = isChorussOrDrop
        ? -0.8 + Math.random() * 0.4
        : sectionEnergy > 0.6
          ? -0.2 + Math.random() * 0.4
          : 0.4 + Math.random() * 0.4;

      labels.push([deltaLabel, typeLabel]);
    }
    return { inputs, labels };
  }
}
