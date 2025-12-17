import { BasePlugin } from './BasePlugin';

/**
 * Professional Distortion Plugin
 * Implements multiple distortion types: overdrive, fuzz, bitcrusher, and tube saturation
 */
export class DistortionPlugin extends BasePlugin {
  private preGain: GainNode;
  private waveShaper: WaveShaperNode;
  private postGain: GainNode;
  private toneFilter: BiquadFilterNode;
  private cabinetFilter: BiquadFilterNode;

  // Distortion parameters
  private drive: number = 0.5;
  private tone: number = 0.5;
  private level: number = 0.5;
  private distortionType: 'overdrive' | 'fuzz' | 'tube' | 'bitcrusher' = 'overdrive';
  private bitDepth: number = 16;
  private sampleRateReduction: number = 1;

  constructor(context: AudioContext) {
    super(context);

    // Create distortion chain
    this.preGain = context.createGain();
    this.waveShaper = context.createWaveShaper();
    this.postGain = context.createGain();
    this.toneFilter = context.createBiquadFilter();
    this.cabinetFilter = context.createBiquadFilter();

    // Configure filters
    this.toneFilter.type = 'highshelf';
    this.toneFilter.frequency.value = 3000;

    this.cabinetFilter.type = 'bandpass';
    this.cabinetFilter.frequency.value = 800;
    this.cabinetFilter.Q.value = 1.5;

    // Connect signal chain
    this.input.connect(this.preGain);
    this.preGain.connect(this.waveShaper);
    this.waveShaper.connect(this.toneFilter);
    this.toneFilter.connect(this.cabinetFilter);
    this.cabinetFilter.connect(this.postGain);
    this.postGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Set default curve
    this.setDistortionType('overdrive');
    this.setDrive(0.5);
  }

  /**
   * Generate transfer curve for waveshaper
   */
  private generateCurve(type: string, amount: number): Float32Array {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;

    switch (type) {
      case 'overdrive':
        // Soft clipping with smooth saturation
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          const drive = amount * 100;
          curve[i] = ((3 + drive) * x * 20 * deg) / (Math.PI + drive * Math.abs(x));
        }
        break;

      case 'fuzz':
        // Hard clipping with asymmetric distortion
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          const threshold = 1 - amount;
          if (x > threshold) {
            curve[i] = threshold + (x - threshold) * 0.1;
          } else if (x < -threshold * 0.7) {
            curve[i] = -threshold * 0.7 + (x + threshold * 0.7) * 0.1;
          } else {
            curve[i] = x;
          }
          // Add harmonics
          curve[i] += Math.sin(x * Math.PI * 2) * amount * 0.2;
        }
        break;

      case 'tube':
        // Warm tube saturation with even harmonics
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          const drive = amount * 0.7;

          // Tube-like transfer function
          let y = x;
          if (Math.abs(x) < drive) {
            y = x;
          } else if (Math.abs(x) < 1) {
            if (x > 0) {
              y = drive + (x - drive) / (1 + Math.pow((x - drive) / (1 - drive), 2));
            } else {
              y = -(drive + (-x - drive) / (1 + Math.pow((-x - drive) / (1 - drive), 2)));
            }
          } else {
            y = (Math.sign(x) * (drive + 1)) / 2;
          }

          // Add even harmonics for warmth
          y += Math.sin(x * Math.PI) * amount * 0.05;
          y += Math.sin(x * Math.PI * 2) * amount * 0.02;

          curve[i] = y;
        }
        break;

      case 'bitcrusher':
        // Digital distortion with bit reduction
        const bits = Math.max(1, Math.floor(this.bitDepth * (1 - amount * 0.9)));
        const step = 2 / Math.pow(2, bits);

        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          // Quantize signal
          curve[i] = Math.round(x / step) * step;
          // Add aliasing artifacts
          if (this.sampleRateReduction > 1) {
            const reduced = Math.floor(i / this.sampleRateReduction) * this.sampleRateReduction;
            curve[i] = curve[reduced] || 0;
          }
        }
        break;

      default:
        // Linear (no distortion)
        for (let i = 0; i < samples; i++) {
          curve[i] = (i * 2) / samples - 1;
        }
    }

    return curve;
  }

  /**
   * Set distortion type
   */
  setDistortionType(type: 'overdrive' | 'fuzz' | 'tube' | 'bitcrusher'): void {
    this.distortionType = type;
    this.waveShaper.curve = this.generateCurve(type, this.drive);

    // Adjust filters based on type
    switch (type) {
      case 'overdrive':
        this.cabinetFilter.frequency.value = 800;
        this.cabinetFilter.Q.value = 1.5;
        break;
      case 'fuzz':
        this.cabinetFilter.frequency.value = 1200;
        this.cabinetFilter.Q.value = 2;
        break;
      case 'tube':
        this.cabinetFilter.frequency.value = 600;
        this.cabinetFilter.Q.value = 1;
        break;
      case 'bitcrusher':
        this.cabinetFilter.frequency.value = 2000;
        this.cabinetFilter.Q.value = 0.7;
        break;
    }
  }

  /**
   * Set drive amount (0-1)
   */
  setDrive(value: number): void {
    this.drive = Math.max(0, Math.min(1, value));

    // Update pre-gain based on drive
    this.preGain.gain.setValueAtTime(1 + this.drive * 10, this.context.currentTime);

    // Regenerate curve
    this.waveShaper.curve = this.generateCurve(this.distortionType, this.drive);

    // Compensate output level
    this.postGain.gain.setValueAtTime(0.5 / (1 + this.drive * 0.5), this.context.currentTime);
  }

  /**
   * Set tone control (0-1, 0=dark, 1=bright)
   */
  setTone(value: number): void {
    this.tone = Math.max(0, Math.min(1, value));

    // Adjust high frequency content
    this.toneFilter.gain.setValueAtTime(
      (this.tone - 0.5) * 20, // -10 to +10 dB
      this.context.currentTime
    );

    // Adjust filter frequency
    this.toneFilter.frequency.setValueAtTime(
      1000 + this.tone * 4000, // 1kHz to 5kHz
      this.context.currentTime
    );
  }

  /**
   * Set output level (0-1)
   */
  setLevel(value: number): void {
    this.level = Math.max(0, Math.min(1, value));
    this.postGain.gain.setValueAtTime(this.level, this.context.currentTime);
  }

  /**
   * Set bit depth for bitcrusher mode (1-16)
   */
  setBitDepth(value: number): void {
    this.bitDepth = Math.max(1, Math.min(16, value));
    if (this.distortionType === 'bitcrusher') {
      this.waveShaper.curve = this.generateCurve('bitcrusher', this.drive);
    }
  }

  /**
   * Set sample rate reduction for bitcrusher (1-10)
   */
  setSampleRateReduction(value: number): void {
    this.sampleRateReduction = Math.max(1, Math.min(10, value));
    if (this.distortionType === 'bitcrusher') {
      this.waveShaper.curve = this.generateCurve('bitcrusher', this.drive);
    }
  }

  /**
   * Enable/disable cabinet simulation
   */
  setCabinetEnabled(enabled: boolean): void {
    if (enabled) {
      this.cabinetFilter.Q.value = 1.5;
    } else {
      this.cabinetFilter.Q.value = 0.1; // Effectively bypass
    }
  }

  getName(): string {
    return 'Max Booster Distortion';
  }

  getParameters(): Record<string, any> {
    return {
      type: this.distortionType,
      drive: this.drive,
      tone: this.tone,
      level: this.level,
      bitDepth: this.bitDepth,
      sampleRateReduction: this.sampleRateReduction,
      mix: this.mix,
      bypass: this.bypass,
    };
  }

  setParameters(params: Record<string, any>): void {
    if (params.type !== undefined) this.setDistortionType(params.type);
    if (params.drive !== undefined) this.setDrive(params.drive);
    if (params.tone !== undefined) this.setTone(params.tone);
    if (params.level !== undefined) this.setLevel(params.level);
    if (params.bitDepth !== undefined) this.setBitDepth(params.bitDepth);
    if (params.sampleRateReduction !== undefined)
      this.setSampleRateReduction(params.sampleRateReduction);
    if (params.mix !== undefined) this.setMix(params.mix);
    if (params.bypass !== undefined) this.setBypass(params.bypass);
  }

  destroy(): void {
    super.destroy();
    this.preGain.disconnect();
    this.waveShaper.disconnect();
    this.postGain.disconnect();
    this.toneFilter.disconnect();
    this.cabinetFilter.disconnect();
  }
}
