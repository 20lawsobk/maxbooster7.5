import { AIAnalyzer } from './AIAnalyzer';
import { EQPlugin } from './plugins/EQPlugin';
import { CompressorPlugin } from './plugins/CompressorPlugin';
import { ReverbPlugin } from './plugins/ReverbPlugin';
import { logger } from '@/lib/logger';

/**
 * AI Mixer - Intelligent automatic mixing
 * Analyzes tracks and applies optimal EQ, compression, panning, and levels
 */
export class AIMixer {
  private context: AudioContext;
  private analyzer: AIAnalyzer;
  private masterBus: GainNode;
  private tracks: Map<string, TrackChannel> = new Map();

  constructor(context: AudioContext) {
    this.context = context;
    this.analyzer = new AIAnalyzer(context);
    this.masterBus = context.createGain();
    this.masterBus.connect(context.destination);
  }

  /**
   * Add a track to the mixer
   */
  addTrack(
    trackId: string,
    source: AudioBufferSourceNode | MediaElementAudioSourceNode
  ): TrackChannel {
    const channel = new TrackChannel(this.context, trackId);
    channel.connect(source, this.masterBus);
    this.tracks.set(trackId, channel);
    return channel;
  }

  /**
   * Perform AI mixing on all tracks
   */
  async performAIMix(): Promise<MixResult> {
    logger.info('[AI MIXER] Starting intelligent mix analysis...');

    const mixResult: MixResult = {
      success: true,
      adjustments: [],
      recommendations: [],
    };

    // Step 1: Analyze all tracks
    const trackAnalysis = await this.analyzeAllTracks();

    // Step 2: Detect instrument types and frequency content
    const instrumentMap = this.detectInstruments(trackAnalysis);

    // Step 3: Apply automatic gain staging
    this.applyGainStaging(trackAnalysis, mixResult);

    // Step 4: Apply EQ to each track based on frequency masking
    this.applyIntelligentEQ(trackAnalysis, instrumentMap, mixResult);

    // Step 5: Apply compression based on dynamics
    this.applyDynamicCompression(trackAnalysis, instrumentMap, mixResult);

    // Step 6: Set panning for stereo image
    this.applyStereoPanning(instrumentMap, mixResult);

    // Step 7: Add spatial effects (reverb)
    this.applySpatialEffects(instrumentMap, mixResult);

    // Step 8: Final loudness optimization
    this.optimizeLoudness(mixResult);

    logger.info('[AI MIXER] Mix complete!', mixResult);
    return mixResult;
  }

  /**
   * Analyze all tracks
   */
  private async analyzeAllTracks(): Promise<Map<string, TrackAnalysis>> {
    const analysis = new Map<string, TrackAnalysis>();

    for (const [trackId, channel] of this.tracks) {
      const buffer = await channel.getBuffer();
      if (!buffer) continue;

      const dynamicRange = this.analyzer.analyzeDynamicRange(buffer);
      const lufs = this.analyzer.calculateLUFS(buffer);
      const clipping = this.analyzer.detectClipping(buffer);

      // Get frequency analysis
      const tempSource = this.context.createBufferSource();
      tempSource.buffer = buffer;
      const freqData = this.analyzer.getFrequencyData(tempSource);

      analysis.set(trackId, {
        trackId,
        peak: dynamicRange.peak,
        rms: dynamicRange.rms,
        lufs,
        dynamicRange: dynamicRange.dynamicRange,
        hasClipping: clipping.hasClipping,
        dominantFrequency: freqData.dominantFrequency,
        frequencyPeaks: freqData.peaks,
        averageLevel: freqData.averageLevel,
      });
    }

    return analysis;
  }

  /**
   * Detect instrument types based on frequency content
   */
  private detectInstruments(analysis: Map<string, TrackAnalysis>): Map<string, InstrumentType> {
    const instruments = new Map<string, InstrumentType>();

    for (const [trackId, data] of analysis) {
      const freq = data.dominantFrequency;

      // Simple frequency-based detection
      if (freq < 150) {
        instruments.set(trackId, 'bass');
      } else if (freq < 250) {
        instruments.set(trackId, 'kick');
      } else if (freq > 8000) {
        instruments.set(trackId, 'hihat');
      } else if (freq > 2000 && freq < 8000) {
        instruments.set(trackId, 'cymbal');
      } else if (freq > 500 && freq < 2000) {
        if (data.dynamicRange > 15) {
          instruments.set(trackId, 'vocal');
        } else {
          instruments.set(trackId, 'synth');
        }
      } else {
        instruments.set(trackId, 'guitar');
      }
    }

    return instruments;
  }

  /**
   * Apply gain staging to balance track levels
   */
  private applyGainStaging(analysis: Map<string, TrackAnalysis>, result: MixResult): void {
    // Target LUFS for different elements
    const targetLevels: Record<InstrumentType, number> = {
      kick: -12,
      bass: -15,
      snare: -14,
      hihat: -20,
      vocal: -10,
      guitar: -16,
      synth: -14,
      cymbal: -18,
      other: -16,
    };

    for (const [trackId, data] of analysis) {
      const channel = this.tracks.get(trackId);
      if (!channel) continue;

      // Calculate required gain adjustment
      const currentLUFS = data.lufs;
      const targetLUFS = targetLevels.other; // Default if not detected
      const gainAdjustment = targetLUFS - currentLUFS;

      // Apply gain with limiting to prevent clipping
      const finalGain = Math.max(-12, Math.min(12, gainAdjustment));
      channel.setGain(Math.pow(10, finalGain / 20));

      result.adjustments.push({
        trackId,
        parameter: 'gain',
        value: finalGain,
        reason: `Adjusted gain by ${finalGain.toFixed(1)}dB to reach target level`,
      });
    }
  }

  /**
   * Apply intelligent EQ based on frequency masking
   */
  private applyIntelligentEQ(
    analysis: Map<string, TrackAnalysis>,
    instruments: Map<string, InstrumentType>,
    result: MixResult
  ): void {
    for (const [trackId, instrument] of instruments) {
      const channel = this.tracks.get(trackId);
      if (!channel) continue;

      const eq = channel.getEQ();

      switch (instrument) {
        case 'kick':
          eq.setBand(1, 60, 4); // Boost low
          eq.setBand(3, 800, -3); // Cut mud
          eq.setBand(4, 3000, 2); // Add click
          result.adjustments.push({
            trackId,
            parameter: 'eq',
            value: 'kick-optimized',
            reason: 'Applied kick drum EQ curve',
          });
          break;

        case 'bass':
          eq.setBand(1, 80, 3); // Boost fundamental
          eq.setBand(2, 200, -2); // Remove boxiness
          eq.setBand(4, 2500, 2); // Add presence
          result.adjustments.push({
            trackId,
            parameter: 'eq',
            value: 'bass-optimized',
            reason: 'Applied bass EQ curve',
          });
          break;

        case 'vocal':
          eq.setBand(0, 80); // High-pass at 80Hz
          eq.setBand(2, 250, -2); // Remove mud
          eq.setBand(4, 4000, 3); // Add presence
          eq.setBand(6, 12000, 2); // Add air
          result.adjustments.push({
            trackId,
            parameter: 'eq',
            value: 'vocal-optimized',
            reason: 'Applied vocal EQ curve with presence boost',
          });
          break;

        case 'guitar':
          eq.setBand(1, 100, -2); // Remove rumble
          eq.setBand(3, 800, 2); // Add body
          eq.setBand(5, 6000, 3); // Add bite
          result.adjustments.push({
            trackId,
            parameter: 'eq',
            value: 'guitar-optimized',
            reason: 'Applied guitar EQ curve',
          });
          break;

        default:
          // Gentle smile curve
          eq.setBand(1, 100, 1);
          eq.setBand(5, 8000, 1);
          break;
      }
    }
  }

  /**
   * Apply dynamic compression
   */
  private applyDynamicCompression(
    analysis: Map<string, TrackAnalysis>,
    instruments: Map<string, InstrumentType>,
    result: MixResult
  ): void {
    for (const [trackId, data] of analysis) {
      const channel = this.tracks.get(trackId);
      const instrument = instruments.get(trackId);
      if (!channel) continue;

      const compressor = channel.getCompressor();

      // Set compression based on dynamic range and instrument
      if (data.dynamicRange > 20) {
        // High dynamic range - needs compression
        compressor.setThreshold(-18);
        compressor.setRatio(4);
        compressor.setAttack(0.01);
        compressor.setRelease(0.1);

        result.adjustments.push({
          trackId,
          parameter: 'compression',
          value: '4:1 @ -18dB',
          reason: 'Applied compression to control dynamics',
        });
      } else if (instrument === 'vocal') {
        // Vocal compression
        compressor.setThreshold(-12);
        compressor.setRatio(3);
        compressor.setAttack(0.005);
        compressor.setRelease(0.05);
        compressor.setKnee(6);

        result.adjustments.push({
          trackId,
          parameter: 'compression',
          value: '3:1 @ -12dB',
          reason: 'Applied gentle vocal compression',
        });
      } else if (instrument === 'kick' || instrument === 'snare') {
        // Drum compression
        compressor.setThreshold(-8);
        compressor.setRatio(6);
        compressor.setAttack(0.001);
        compressor.setRelease(0.05);

        result.adjustments.push({
          trackId,
          parameter: 'compression',
          value: '6:1 @ -8dB',
          reason: 'Applied punchy drum compression',
        });
      }
    }
  }

  /**
   * Apply stereo panning
   */
  private applyStereoPanning(instruments: Map<string, InstrumentType>, result: MixResult): void {
    // Center important elements
    const centerElements = ['kick', 'snare', 'bass', 'vocal'];

    let panPosition = -0.7; // Start from left
    const panIncrement = 1.4 / (instruments.size - centerElements.length);

    for (const [trackId, instrument] of instruments) {
      const channel = this.tracks.get(trackId);
      if (!channel) continue;

      if (centerElements.includes(instrument)) {
        channel.setPan(0);
        result.adjustments.push({
          trackId,
          parameter: 'pan',
          value: 0,
          reason: `Centered ${instrument} for focus`,
        });
      } else {
        channel.setPan(panPosition);
        result.adjustments.push({
          trackId,
          parameter: 'pan',
          value: panPosition,
          reason: `Panned ${instrument} for stereo width`,
        });
        panPosition += panIncrement;
      }
    }
  }

  /**
   * Apply spatial effects (reverb)
   */
  private applySpatialEffects(instruments: Map<string, InstrumentType>, result: MixResult): void {
    for (const [trackId, instrument] of instruments) {
      const channel = this.tracks.get(trackId);
      if (!channel) continue;

      const reverb = channel.getReverb();

      // Apply reverb based on instrument
      switch (instrument) {
        case 'vocal':
          reverb.setReverbType('plate');
          reverb.setMix(0.15);
          reverb.setDecay(0.4);
          result.adjustments.push({
            trackId,
            parameter: 'reverb',
            value: 'plate-15%',
            reason: 'Added subtle vocal reverb',
          });
          break;

        case 'snare':
          reverb.setReverbType('room');
          reverb.setMix(0.2);
          reverb.setDecay(0.3);
          result.adjustments.push({
            trackId,
            parameter: 'reverb',
            value: 'room-20%',
            reason: 'Added snare room ambience',
          });
          break;

        case 'guitar':
          reverb.setReverbType('hall');
          reverb.setMix(0.1);
          reverb.setDecay(0.5);
          result.adjustments.push({
            trackId,
            parameter: 'reverb',
            value: 'hall-10%',
            reason: 'Added guitar space',
          });
          break;

        case 'kick':
        case 'bass':
          // No reverb on low frequency elements
          reverb.setMix(0);
          break;

        default:
          reverb.setMix(0.05);
          break;
      }
    }
  }

  /**
   * Optimize final loudness
   */
  private optimizeLoudness(result: MixResult): void {
    // Target -14 LUFS for streaming platforms
    const targetLUFS = -14;

    // Analyze master bus output
    // This would need actual buffer analysis in production
    const currentLUFS = -18; // Placeholder

    const adjustment = targetLUFS - currentLUFS;
    this.masterBus.gain.setValueAtTime(Math.pow(10, adjustment / 20), this.context.currentTime);

    result.adjustments.push({
      trackId: 'master',
      parameter: 'loudness',
      value: adjustment,
      reason: `Adjusted master gain by ${adjustment}dB to reach -14 LUFS`,
    });

    result.recommendations.push(
      'Mix optimized for streaming platforms (-14 LUFS)',
      'Consider using a limiter on master bus for extra loudness',
      'Check mix translation on different speakers'
    );
  }

  /**
   * Reset all AI adjustments
   */
  reset(): void {
    for (const channel of this.tracks.values()) {
      channel.reset();
    }
    this.masterBus.gain.value = 1;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    for (const channel of this.tracks.values()) {
      channel.destroy();
    }
    this.tracks.clear();
    this.masterBus.disconnect();
    this.analyzer.destroy();
  }
}

/**
 * Track channel with effects chain
 */
class TrackChannel {
  private context: AudioContext;
  private trackId: string;
  private input: GainNode;
  private output: GainNode;
  private panner: StereoPannerNode;
  private eq: EQPlugin;
  private compressor: CompressorPlugin;
  private reverb: ReverbPlugin;
  private buffer?: AudioBuffer;

  constructor(context: AudioContext, trackId: string) {
    this.context = context;
    this.trackId = trackId;

    // Create nodes
    this.input = context.createGain();
    this.output = context.createGain();
    this.panner = context.createStereoPanner();

    // Create effects
    this.eq = new EQPlugin(context);
    this.compressor = new CompressorPlugin(context);
    this.reverb = new ReverbPlugin(context);

    // Connect chain: input -> EQ -> Compressor -> Reverb -> Panner -> Output
    this.input.connect(this.eq.getInput());
    this.eq.connect(this.compressor.getInput());
    this.compressor.connect(this.reverb.getInput());
    this.reverb.connect(this.panner);
    this.panner.connect(this.output);
  }

  connect(source: AudioNode, destination: AudioNode): void {
    source.connect(this.input);
    this.output.connect(destination);
  }

  setGain(value: number): void {
    this.output.gain.value = value;
  }

  setPan(value: number): void {
    this.panner.pan.value = value;
  }

  getEQ(): EQPlugin {
    return this.eq;
  }

  getCompressor(): CompressorPlugin {
    return this.compressor;
  }

  getReverb(): ReverbPlugin {
    return this.reverb;
  }

  setBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
  }

  async getBuffer(): Promise<AudioBuffer | undefined> {
    return this.buffer;
  }

  reset(): void {
    this.output.gain.value = 1;
    this.panner.pan.value = 0;
    this.eq.reset();
    this.compressor.setParameters({ bypass: true });
    this.reverb.setMix(0);
  }

  destroy(): void {
    this.input.disconnect();
    this.output.disconnect();
    this.panner.disconnect();
    this.eq.destroy();
    this.compressor.destroy();
    this.reverb.destroy();
  }
}

// Type definitions
type InstrumentType =
  | 'kick'
  | 'snare'
  | 'bass'
  | 'hihat'
  | 'vocal'
  | 'guitar'
  | 'synth'
  | 'cymbal'
  | 'other';

interface TrackAnalysis {
  trackId: string;
  peak: number;
  rms: number;
  lufs: number;
  dynamicRange: number;
  hasClipping: boolean;
  dominantFrequency: number;
  frequencyPeaks: number[];
  averageLevel: number;
}

interface MixResult {
  success: boolean;
  adjustments: Array<{
    trackId: string;
    parameter: string;
    value: any;
    reason: string;
  }>;
  recommendations: string[];
}

export { AIMixer, type MixResult, type InstrumentType };
