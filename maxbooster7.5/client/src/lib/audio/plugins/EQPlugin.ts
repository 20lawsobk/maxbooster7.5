import { BasePlugin } from './BasePlugin';

/**
 * Professional Parametric EQ Plugin
 * 8-band equalizer with high-pass, low-pass, and 6 parametric bands
 */
export class EQPlugin extends BasePlugin {
  private filters: BiquadFilterNode[] = [];
  private analyser: AnalyserNode;

  // EQ band types
  private readonly BAND_CONFIG = [
    { type: 'highpass' as BiquadFilterType, frequency: 20, q: 0.7, gain: 0 }, // High-pass
    { type: 'peaking' as BiquadFilterType, frequency: 60, q: 0.7, gain: 0 }, // Low
    { type: 'peaking' as BiquadFilterType, frequency: 200, q: 0.7, gain: 0 }, // Low-mid
    { type: 'peaking' as BiquadFilterType, frequency: 800, q: 0.7, gain: 0 }, // Mid
    { type: 'peaking' as BiquadFilterType, frequency: 3000, q: 0.7, gain: 0 }, // High-mid
    { type: 'peaking' as BiquadFilterType, frequency: 8000, q: 0.7, gain: 0 }, // High
    { type: 'highshelf' as BiquadFilterType, frequency: 12000, q: 0.7, gain: 0 }, // Air
    { type: 'lowpass' as BiquadFilterType, frequency: 20000, q: 0.7, gain: 0 }, // Low-pass
  ];

  constructor(context: AudioContext) {
    super(context);

    // Create analyser for spectrum visualization
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;

    // Create filter chain
    let lastNode: AudioNode = this.input;

    for (const config of this.BAND_CONFIG) {
      const filter = context.createBiquadFilter();
      filter.type = config.type;
      filter.frequency.value = config.frequency;
      filter.Q.value = config.q;
      if (config.type === 'peaking' || config.type === 'highshelf' || config.type === 'lowshelf') {
        filter.gain.value = config.gain;
      }

      lastNode.connect(filter);
      lastNode = filter;
      this.filters.push(filter);
    }

    // Connect to analyser and output
    lastNode.connect(this.analyser);
    this.analyser.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  /**
   * Set band parameters
   * @param bandIndex 0-7 (0=highpass, 1-6=parametric, 7=lowpass)
   * @param frequency Center frequency in Hz
   * @param gain Gain in dB (-24 to +24)
   * @param q Q factor (0.1 to 30)
   */
  setBand(bandIndex: number, frequency?: number, gain?: number, q?: number): void {
    if (bandIndex < 0 || bandIndex >= this.filters.length) return;

    const filter = this.filters[bandIndex];
    const currentTime = this.context.currentTime;

    if (frequency !== undefined) {
      filter.frequency.setValueAtTime(Math.max(20, Math.min(20000, frequency)), currentTime);
    }

    if (
      gain !== undefined &&
      (filter.type === 'peaking' || filter.type === 'highshelf' || filter.type === 'lowshelf')
    ) {
      filter.gain.setValueAtTime(Math.max(-24, Math.min(24, gain)), currentTime);
    }

    if (q !== undefined) {
      filter.Q.setValueAtTime(Math.max(0.1, Math.min(30, q)), currentTime);
    }
  }

  /**
   * Reset all bands to flat response
   */
  reset(): void {
    for (let i = 0; i < this.filters.length; i++) {
      const config = this.BAND_CONFIG[i];
      this.setBand(i, config.frequency, 0, config.q);
    }
  }

  /**
   * Apply preset EQ curves
   */
  applyPreset(preset: 'flat' | 'bright' | 'warm' | 'bass-boost' | 'presence' | 'air'): void {
    switch (preset) {
      case 'flat':
        this.reset();
        break;
      case 'bright':
        this.setBand(1, undefined, -2); // Reduce low
        this.setBand(4, undefined, 3); // Boost high-mid
        this.setBand(5, undefined, 4); // Boost high
        this.setBand(6, undefined, 2); // Add air
        break;
      case 'warm':
        this.setBand(1, undefined, 3); // Boost low
        this.setBand(2, undefined, 2); // Boost low-mid
        this.setBand(5, undefined, -3); // Reduce high
        break;
      case 'bass-boost':
        this.setBand(1, 80, 6); // Strong bass boost
        this.setBand(2, undefined, 2); // Slight low-mid boost
        break;
      case 'presence':
        this.setBand(3, undefined, -2); // Scoop mids
        this.setBand(4, 4000, 4); // Boost presence
        break;
      case 'air':
        this.setBand(6, 15000, 6); // Boost air frequencies
        break;
    }
  }

  /**
   * Get frequency response data for visualization
   */
  getFrequencyResponse(frequencies: Float32Array): Float32Array {
    const magResponse = new Float32Array(frequencies.length);
    const phaseResponse = new Float32Array(frequencies.length);
    const totalResponse = new Float32Array(frequencies.length);
    totalResponse.fill(1);

    for (const filter of this.filters) {
      filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);
      for (let i = 0; i < frequencies.length; i++) {
        totalResponse[i] *= magResponse[i];
      }
    }

    return totalResponse;
  }

  /**
   * Get spectrum analyser data
   */
  getSpectrumData(): Uint8Array {
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  getName(): string {
    return 'Max Booster 8-Band EQ';
  }

  getParameters(): Record<string, any> {
    return {
      bands: this.filters.map((filter, index) => ({
        type: filter.type,
        frequency: filter.frequency.value,
        gain: filter.gain.value,
        q: filter.Q.value,
      })),
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.bands) {
      params.bands.forEach((band: unknown, index: number) => {
        if (index < this.filters.length) {
          this.setBand(index, band.frequency, band.gain, band.q);
        }
      });
    }
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
  }

  destroy(): void {
    super.destroy();
    this.filters.forEach((filter) => filter.disconnect());
    this.analyser.disconnect();
  }
}
