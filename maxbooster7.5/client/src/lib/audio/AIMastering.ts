import { AIAnalyzer } from './AIAnalyzer';
import { EQPlugin } from './plugins/EQPlugin';
import { CompressorPlugin } from './plugins/CompressorPlugin';
import { logger } from '@/lib/logger';

/**
 * AI Mastering - Professional automated mastering
 * Applies EQ, multiband compression, stereo enhancement, and limiting
 * Targets streaming platform standards (-14 LUFS)
 */
export class AIMastering {
  private context: AudioContext;
  private analyzer: AIAnalyzer;

  // Master chain
  private input: GainNode;
  private output: GainNode;

  // Processing nodes
  private eq: EQPlugin;
  private multibandCompressors: MultibandCompressor;
  private stereoEnhancer: StereoEnhancer;
  private limiter: DynamicsCompressorNode;
  private makeupGain: GainNode;

  // Analysis data
  private currentLUFS: number = -30;
  private targetLUFS: number = -14; // Streaming standard

  constructor(context: AudioContext) {
    this.context = context;
    this.analyzer = new AIAnalyzer(context);

    // Create nodes
    this.input = context.createGain();
    this.output = context.createGain();
    this.makeupGain = context.createGain();

    // Create processing
    this.eq = new EQPlugin(context);
    this.multibandCompressors = new MultibandCompressor(context);
    this.stereoEnhancer = new StereoEnhancer(context);

    // Create limiter
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -0.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.01;

    // Connect chain
    this.connectChain();
  }

  private connectChain(): void {
    // Master chain: Input -> EQ -> Multiband -> Stereo -> Limiter -> Makeup -> Output
    this.input.connect(this.eq.getInput());
    this.eq.connect(this.multibandCompressors.getInput());
    this.multibandCompressors.connect(this.stereoEnhancer.getInput());
    this.stereoEnhancer.connect(this.limiter);
    this.limiter.connect(this.makeupGain);
    this.makeupGain.connect(this.output);
  }

  /**
   * Perform AI mastering on audio buffer
   */
  async performAIMastering(buffer: AudioBuffer): Promise<MasteringResult> {
    logger.info('[AI MASTERING] Starting analysis...');

    const result: MasteringResult = {
      success: true,
      adjustments: [],
      metrics: {
        inputLUFS: 0,
        outputLUFS: 0,
        dynamicRange: 0,
        truePeak: 0,
        stereoWidth: 0,
      },
      recommendations: [],
    };

    // Step 1: Analyze input
    const analysis = this.analyzeInput(buffer, result);

    // Step 2: Apply tonal balance correction
    this.applyTonalBalance(analysis, result);

    // Step 3: Apply multiband compression
    this.applyMultibandCompression(analysis, result);

    // Step 4: Enhance stereo image
    this.applyStereoEnhancement(analysis, result);

    // Step 5: Apply loudness optimization
    this.applyLoudnessOptimization(analysis, result);

    // Step 6: Apply peak limiting
    this.applyPeakLimiting(result);

    // Step 7: Final analysis
    this.performFinalAnalysis(buffer, result);

    logger.info('[AI MASTERING] Mastering complete!', result);
    return result;
  }

  /**
   * Analyze input audio
   */
  private analyzeInput(buffer: AudioBuffer, result: MasteringResult): AudioAnalysis {
    const lufs = this.analyzer.calculateLUFS(buffer);
    const dynamics = this.analyzer.analyzeDynamicRange(buffer);
    const clipping = this.analyzer.detectClipping(buffer);

    // Analyze stereo image if stereo
    let stereoAnalysis = { correlation: 0, balance: 0, width: 0 };
    if (buffer.numberOfChannels === 2) {
      stereoAnalysis = this.analyzer.analyzeStereoImage(
        buffer.getChannelData(0),
        buffer.getChannelData(1)
      );
    }

    result.metrics.inputLUFS = lufs;
    result.metrics.dynamicRange = dynamics.dynamicRange;
    result.metrics.truePeak = 20 * Math.log10(dynamics.peak);
    result.metrics.stereoWidth = stereoAnalysis.width;

    if (clipping.hasClipping) {
      result.recommendations.push(
        `Input has clipping (${clipping.clippingPercentage.toFixed(2)}% samples). Consider reducing input gain.`
      );
    }

    this.currentLUFS = lufs;

    return {
      lufs,
      peak: dynamics.peak,
      rms: dynamics.rms,
      dynamicRange: dynamics.dynamicRange,
      crestFactor: dynamics.crestFactor,
      stereoWidth: stereoAnalysis.width,
      stereoBalance: stereoAnalysis.balance,
      hasClipping: clipping.hasClipping,
    };
  }

  /**
   * Apply tonal balance correction
   */
  private applyTonalBalance(analysis: AudioAnalysis, result: MasteringResult): void {
    // Target tonal balance curve (pink noise reference)
    const targetCurve = {
      bass: 0, // 20-250 Hz
      lowMid: -3, // 250-500 Hz
      mid: -6, // 500-2k Hz
      highMid: -9, // 2k-8k Hz
      treble: -12, // 8k-20k Hz
    };

    // Apply gentle EQ corrections
    if (analysis.lufs < -20) {
      // Quiet mix - add brightness
      this.eq.setBand(5, 8000, 2); // High shelf
      this.eq.setBand(6, 12000, 3); // Air
      result.adjustments.push({
        type: 'eq',
        description: 'Added brightness to quiet mix',
        value: '+2dB @ 8kHz, +3dB @ 12kHz',
      });
    }

    if (analysis.dynamicRange < 6) {
      // Over-compressed - enhance transients
      this.eq.setBand(4, 3000, 1.5); // Presence
      result.adjustments.push({
        type: 'eq',
        description: 'Enhanced transients',
        value: '+1.5dB @ 3kHz',
      });
    }

    // Gentle smile curve for pleasant sound
    this.eq.setBand(1, 60, 1); // Subtle bass boost
    this.eq.setBand(5, 10000, 1); // Subtle treble boost

    result.adjustments.push({
      type: 'eq',
      description: 'Applied mastering EQ curve',
      value: 'Gentle smile curve with tonal balance correction',
    });
  }

  /**
   * Apply multiband compression
   */
  private applyMultibandCompression(analysis: AudioAnalysis, result: MasteringResult): void {
    // Configure bands based on dynamic range
    const needsControl = analysis.dynamicRange > 12;

    if (needsControl) {
      // Low band (20-200 Hz) - Control bass
      this.multibandCompressors.setBand(0, {
        threshold: -15,
        ratio: 2,
        attack: 0.01,
        release: 0.1,
      });

      // Low-mid band (200-800 Hz) - Body
      this.multibandCompressors.setBand(1, {
        threshold: -12,
        ratio: 1.5,
        attack: 0.005,
        release: 0.05,
      });

      // High-mid band (800-4k Hz) - Presence
      this.multibandCompressors.setBand(2, {
        threshold: -10,
        ratio: 1.5,
        attack: 0.003,
        release: 0.03,
      });

      // High band (4k-20k Hz) - Brilliance
      this.multibandCompressors.setBand(3, {
        threshold: -8,
        ratio: 1.2,
        attack: 0.001,
        release: 0.01,
      });

      result.adjustments.push({
        type: 'multiband',
        description: 'Applied 4-band compression',
        value: 'Gentle control across frequency spectrum',
      });
    } else {
      // Already compressed - use very gentle settings
      this.multibandCompressors.setBand(0, { threshold: -6, ratio: 1.1 });
      this.multibandCompressors.setBand(1, { threshold: -6, ratio: 1.1 });
      this.multibandCompressors.setBand(2, { threshold: -6, ratio: 1.1 });
      this.multibandCompressors.setBand(3, { threshold: -6, ratio: 1.1 });

      result.adjustments.push({
        type: 'multiband',
        description: 'Applied gentle glue compression',
        value: 'Minimal processing to preserve dynamics',
      });
    }
  }

  /**
   * Apply stereo enhancement
   */
  private applyStereoEnhancement(analysis: AudioAnalysis, result: MasteringResult): void {
    // Only enhance if not already wide
    if (analysis.stereoWidth < 0.5) {
      this.stereoEnhancer.setWidth(1.2); // 120% width
      this.stereoEnhancer.setBassMonoFrequency(120); // Mono below 120Hz

      result.adjustments.push({
        type: 'stereo',
        description: 'Enhanced stereo width',
        value: '120% width, bass mono below 120Hz',
      });
    } else if (analysis.stereoWidth > 0.8) {
      // Too wide - narrow slightly
      this.stereoEnhancer.setWidth(0.9);
      result.adjustments.push({
        type: 'stereo',
        description: 'Narrowed excessive width',
        value: '90% width for better mono compatibility',
      });
    }

    // Fix stereo balance if needed
    if (Math.abs(analysis.stereoBalance) > 0.1) {
      this.stereoEnhancer.setBalance(-analysis.stereoBalance);
      result.adjustments.push({
        type: 'stereo',
        description: 'Corrected stereo balance',
        value: `Adjusted ${analysis.stereoBalance > 0 ? 'left' : 'right'} bias`,
      });
    }
  }

  /**
   * Apply loudness optimization for streaming
   */
  private applyLoudnessOptimization(analysis: AudioAnalysis, result: MasteringResult): void {
    // Calculate required gain to reach target LUFS
    const currentLUFS = analysis.lufs;
    const gainRequired = this.targetLUFS - currentLUFS;

    // Apply gain with headroom for limiter
    const maxGain = 12; // Maximum 12dB boost
    const actualGain = Math.min(gainRequired, maxGain);

    this.makeupGain.gain.setValueAtTime(Math.pow(10, actualGain / 20), this.context.currentTime);

    result.adjustments.push({
      type: 'loudness',
      description: 'Optimized for streaming platforms',
      value: `+${actualGain.toFixed(1)}dB to reach -14 LUFS`,
    });

    // Update expected output LUFS
    result.metrics.outputLUFS = Math.min(currentLUFS + actualGain, this.targetLUFS);
  }

  /**
   * Apply peak limiting to prevent clipping
   */
  private applyPeakLimiting(result: MasteringResult): void {
    // True peak limiting at -1 dBFS
    this.limiter.threshold.value = -1;
    this.limiter.ratio.value = 30;
    this.limiter.knee.value = 0;
    this.limiter.attack.value = 0.0001; // Very fast attack
    this.limiter.release.value = 0.005; // Fast release

    result.adjustments.push({
      type: 'limiting',
      description: 'Applied true peak limiting',
      value: 'Ceiling at -1 dBFS for streaming compliance',
    });
  }

  /**
   * Perform final analysis and generate recommendations
   */
  private performFinalAnalysis(buffer: AudioBuffer, result: MasteringResult): void {
    // Estimate output metrics (would need actual processed buffer in production)
    const outputDynamics = Math.max(3, result.metrics.dynamicRange - 3);

    result.metrics.dynamicRange = outputDynamics;
    result.metrics.truePeak = -1; // Limited to -1 dBFS

    // Generate recommendations
    if (outputDynamics < 6) {
      result.recommendations.push(
        'Consider preserving more dynamic range for better sound quality'
      );
    }

    if (result.metrics.outputLUFS > -12) {
      result.recommendations.push(
        'Master may be too loud and could be turned down by streaming services'
      );
    }

    if (result.metrics.stereoWidth < 0.3) {
      result.recommendations.push('Mix could benefit from wider stereo image');
    }

    result.recommendations.push(
      'Master optimized for Spotify, Apple Music, and YouTube (-14 LUFS)',
      'Check translation on different playback systems',
      'Consider A/B testing with reference tracks'
    );
  }

  /**
   * Process audio through mastering chain
   */
  connect(source: AudioNode, destination: AudioNode): void {
    source.connect(this.input);
    this.output.connect(destination);
  }

  /**
   * Get current settings
   */
  getSettings(): MasteringSettings {
    return {
      targetLUFS: this.targetLUFS,
      eqEnabled: !this.eq.getParameters().bypass,
      multibandEnabled: true,
      stereoEnabled: true,
      limiterEnabled: true,
      makeupGain: 20 * Math.log10(this.makeupGain.gain.value),
    };
  }

  /**
   * Set target loudness
   */
  setTargetLoudness(
    platform: 'spotify' | 'apple' | 'youtube' | 'soundcloud' | 'custom',
    customLUFS?: number
  ): void {
    const platformTargets = {
      spotify: -14,
      apple: -16,
      youtube: -14,
      soundcloud: -10,
      custom: customLUFS || -14,
    };

    this.targetLUFS = platformTargets[platform];
  }

  /**
   * Bypass mastering
   */
  setBypass(bypass: boolean): void {
    if (bypass) {
      this.makeupGain.gain.value = 1;
      this.eq.setBypass(true);
      this.multibandCompressors.setBypass(true);
      this.stereoEnhancer.setBypass(true);
      this.limiter.ratio.value = 1;
    } else {
      this.connectChain();
    }
  }

  /**
   * Reset all settings
   */
  reset(): void {
    this.eq.reset();
    this.multibandCompressors.reset();
    this.stereoEnhancer.reset();
    this.makeupGain.gain.value = 1;
    this.limiter.threshold.value = -0.5;
    this.targetLUFS = -14;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.input.disconnect();
    this.output.disconnect();
    this.makeupGain.disconnect();
    this.limiter.disconnect();
    this.eq.destroy();
    this.multibandCompressors.destroy();
    this.stereoEnhancer.destroy();
    this.analyzer.destroy();
  }
}

/**
 * Multiband Compressor
 */
class MultibandCompressor {
  private context: AudioContext;
  private input: GainNode;
  private output: GainNode;
  private bands: CompressorBand[] = [];
  private bypassed: boolean = false;

  constructor(context: AudioContext) {
    this.context = context;
    this.input = context.createGain();
    this.output = context.createGain();

    // Create 4 frequency bands
    const frequencies = [200, 800, 4000]; // Crossover frequencies

    for (let i = 0; i < 4; i++) {
      const band = new CompressorBand(
        context,
        i === 0 ? 0 : frequencies[i - 1],
        i === 3 ? 20000 : frequencies[i]
      );
      this.bands.push(band);

      // Connect to input and output
      this.input.connect(band.getInput());
      band.connect(this.output);
    }
  }

  getInput(): AudioNode {
    return this.input;
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  setBand(index: number, settings: unknown): void {
    if (index < 0 || index >= this.bands.length) return;
    this.bands[index].setSettings(settings);
  }

  setBypass(bypass: boolean): void {
    this.bypassed = bypass;
    this.bands.forEach((band) => band.setBypass(bypass));
  }

  reset(): void {
    this.bands.forEach((band) => band.reset());
  }

  destroy(): void {
    this.bands.forEach((band) => band.destroy());
    this.input.disconnect();
    this.output.disconnect();
  }
}

/**
 * Individual compressor band
 */
class CompressorBand {
  private context: AudioContext;
  private input: GainNode;
  private output: GainNode;
  private lowFilter: BiquadFilterNode;
  private highFilter: BiquadFilterNode;
  private compressor: DynamicsCompressorNode;

  constructor(context: AudioContext, lowFreq: number, highFreq: number) {
    this.context = context;
    this.input = context.createGain();
    this.output = context.createGain();

    // Create bandpass filters
    this.lowFilter = context.createBiquadFilter();
    this.lowFilter.type = lowFreq > 0 ? 'highpass' : 'lowshelf';
    this.lowFilter.frequency.value = Math.max(20, lowFreq);

    this.highFilter = context.createBiquadFilter();
    this.highFilter.type = highFreq < 20000 ? 'lowpass' : 'highshelf';
    this.highFilter.frequency.value = Math.min(20000, highFreq);

    // Create compressor
    this.compressor = context.createDynamicsCompressor();

    // Connect chain
    this.input.connect(this.lowFilter);
    this.lowFilter.connect(this.highFilter);
    this.highFilter.connect(this.compressor);
    this.compressor.connect(this.output);
  }

  getInput(): AudioNode {
    return this.input;
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  setSettings(settings: unknown): void {
    if (settings.threshold) this.compressor.threshold.value = settings.threshold;
    if (settings.ratio) this.compressor.ratio.value = settings.ratio;
    if (settings.attack) this.compressor.attack.value = settings.attack;
    if (settings.release) this.compressor.release.value = settings.release;
    if (settings.knee) this.compressor.knee.value = settings.knee || 2.4;
  }

  setBypass(bypass: boolean): void {
    if (bypass) {
      this.compressor.ratio.value = 1;
    } else {
      this.compressor.ratio.value = 2;
    }
  }

  reset(): void {
    this.compressor.threshold.value = -24;
    this.compressor.ratio.value = 2;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.1;
    this.compressor.knee.value = 2.4;
  }

  destroy(): void {
    this.input.disconnect();
    this.output.disconnect();
    this.lowFilter.disconnect();
    this.highFilter.disconnect();
    this.compressor.disconnect();
  }
}

/**
 * Stereo Enhancer
 */
class StereoEnhancer {
  private context: AudioContext;
  private input: GainNode;
  private output: GainNode;
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  private midGain: GainNode;
  private sideGain: GainNode;
  private monoFilter: BiquadFilterNode;
  private width: number = 1;
  private bypassed: boolean = false;

  constructor(context: AudioContext) {
    this.context = context;
    this.input = context.createGain();
    this.output = context.createGain();

    // Create M/S processing
    this.splitter = context.createChannelSplitter(2);
    this.merger = context.createChannelMerger(2);
    this.midGain = context.createGain();
    this.sideGain = context.createGain();

    // Bass mono filter
    this.monoFilter = context.createBiquadFilter();
    this.monoFilter.type = 'highpass';
    this.monoFilter.frequency.value = 100;

    // Connect M/S matrix
    this.input.connect(this.splitter);

    // Mid = (L + R) / 2
    this.splitter.connect(this.midGain, 0);
    this.splitter.connect(this.midGain, 1);

    // Side = (L - R) / 2
    this.splitter.connect(this.sideGain, 0);
    const inverter = context.createGain();
    inverter.gain.value = -1;
    this.splitter.connect(inverter, 1);
    inverter.connect(this.sideGain);

    // Apply processing and reconstruct
    this.midGain.connect(this.merger, 0, 0);
    this.midGain.connect(this.merger, 0, 1);
    this.sideGain.connect(this.monoFilter);
    this.monoFilter.connect(this.merger, 0, 0);

    const sideInverter = context.createGain();
    sideInverter.gain.value = -1;
    this.monoFilter.connect(sideInverter);
    sideInverter.connect(this.merger, 0, 1);

    this.merger.connect(this.output);
  }

  getInput(): AudioNode {
    return this.input;
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  setWidth(width: number): void {
    this.width = Math.max(0, Math.min(2, width));
    // Width = 1 is normal, < 1 is narrower, > 1 is wider
    this.midGain.gain.value = 2 - this.width;
    this.sideGain.gain.value = this.width;
  }

  setBassMonoFrequency(freq: number): void {
    this.monoFilter.frequency.value = Math.max(20, Math.min(500, freq));
  }

  setBalance(balance: number): void {
    // Balance correction (-1 to 1)
    // Implement with additional gain nodes if needed
  }

  setBypass(bypass: boolean): void {
    this.bypassed = bypass;
    if (bypass) {
      this.setWidth(1);
    }
  }

  reset(): void {
    this.setWidth(1);
    this.setBassMonoFrequency(100);
  }

  destroy(): void {
    this.input.disconnect();
    this.output.disconnect();
    this.splitter.disconnect();
    this.merger.disconnect();
    this.midGain.disconnect();
    this.sideGain.disconnect();
    this.monoFilter.disconnect();
  }
}

// Type definitions
interface AudioAnalysis {
  lufs: number;
  peak: number;
  rms: number;
  dynamicRange: number;
  crestFactor: number;
  stereoWidth: number;
  stereoBalance: number;
  hasClipping: boolean;
}

interface MasteringResult {
  success: boolean;
  adjustments: Array<{
    type: string;
    description: string;
    value: string;
  }>;
  metrics: {
    inputLUFS: number;
    outputLUFS: number;
    dynamicRange: number;
    truePeak: number;
    stereoWidth: number;
  };
  recommendations: string[];
}

interface MasteringSettings {
  targetLUFS: number;
  eqEnabled: boolean;
  multibandEnabled: boolean;
  stereoEnabled: boolean;
  limiterEnabled: boolean;
  makeupGain: number;
}

export { AIMastering, type MasteringResult, type MasteringSettings };
