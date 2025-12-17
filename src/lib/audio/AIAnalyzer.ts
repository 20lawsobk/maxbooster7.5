/**
 * AI Audio Analyzer
 * Performs FFT analysis, loudness detection, and frequency spectrum analysis
 * Used by AI Mixer and AI Mastering services
 */
export class AIAnalyzer {
  private context: AudioContext;
  private analyser: AnalyserNode;
  private fftSize: number = 2048;
  private smoothingTimeConstant: number = 0.8;

  constructor(context: AudioContext) {
    this.context = context;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
  }

  /**
   * Analyze audio and return frequency data
   */
  getFrequencyData(source: AudioNode): {
    frequencies: Uint8Array;
    peaks: number[];
    averageLevel: number;
    dominantFrequency: number;
  } {
    // Connect source to analyser
    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    // Find peaks
    const peaks = this.findPeaks(dataArray);

    // Calculate average level
    const averageLevel = dataArray.reduce((sum, val) => sum + val, 0) / bufferLength;

    // Find dominant frequency
    const dominantFrequency = this.findDominantFrequency(dataArray);

    // Disconnect to avoid memory leaks
    source.disconnect(this.analyser);

    return {
      frequencies: dataArray,
      peaks,
      averageLevel,
      dominantFrequency,
    };
  }

  /**
   * Calculate LUFS (Loudness Units relative to Full Scale)
   */
  calculateLUFS(buffer: AudioBuffer): number {
    const sampleRate = buffer.sampleRate;
    const channelData = [];

    // Get all channel data
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      channelData.push(buffer.getChannelData(channel));
    }

    // K-weighting filter coefficients (ITU-R BS.1770)
    const preFilter = this.createKWeightingPreFilter(sampleRate);
    const highShelf = this.createKWeightingHighShelf(sampleRate);

    let totalPower = 0;
    const blockSize = Math.floor(sampleRate * 0.4); // 400ms blocks
    let blockCount = 0;

    for (let start = 0; start < channelData[0].length - blockSize; start += blockSize / 2) {
      let blockPower = 0;

      for (let channel = 0; channel < channelData.length; channel++) {
        const block = channelData[channel].slice(start, start + blockSize);

        // Apply K-weighting
        const filtered = this.applyKWeighting(block, preFilter, highShelf);

        // Calculate mean square
        const meanSquare =
          filtered.reduce((sum, sample) => {
            return sum + sample * sample;
          }, 0) / block.length;

        // Channel weighting (L, R = 1.0, C = 1.0, Ls, Rs = 1.41)
        const channelWeight = channel < 2 ? 1.0 : 1.41;
        blockPower += meanSquare * channelWeight;
      }

      totalPower += blockPower;
      blockCount++;
    }

    // Calculate LUFS
    const meanPower = totalPower / blockCount;
    const lufs = -0.691 + 10 * Math.log10(meanPower);

    return isFinite(lufs) ? lufs : -70; // Return -70 LUFS for silence
  }

  /**
   * Find frequency peaks for EQ analysis
   */
  private findPeaks(data: Uint8Array): number[] {
    const peaks = [];
    const threshold = 200; // Minimum level to be considered a peak
    const minDistance = 10; // Minimum distance between peaks

    for (let i = 1; i < data.length - 1; i++) {
      if (data[i] > threshold && data[i] > data[i - 1] && data[i] > data[i + 1]) {
        // Check minimum distance from last peak
        if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
          peaks.push(i);
        }
      }
    }

    return peaks;
  }

  /**
   * Find the dominant frequency in the spectrum
   */
  private findDominantFrequency(data: Uint8Array): number {
    let maxValue = 0;
    let maxIndex = 0;

    for (let i = 0; i < data.length; i++) {
      if (data[i] > maxValue) {
        maxValue = data[i];
        maxIndex = i;
      }
    }

    // Convert bin index to frequency
    const nyquist = this.context.sampleRate / 2;
    const frequency = (maxIndex * nyquist) / data.length;

    return frequency;
  }

  /**
   * Create K-weighting pre-filter
   */
  private createKWeightingPreFilter(sampleRate: number): { b: number[]; a: number[] } {
    // High-pass filter at 100 Hz
    const fc = 100 / sampleRate;
    const K = Math.tan(Math.PI * fc);
    const norm = 1 / (1 + K / 1.41421356 + K * K);

    return {
      b: [norm, -2 * norm, norm],
      a: [1, 2 * (K * K - 1) * norm, (1 - K / 1.41421356 + K * K) * norm],
    };
  }

  /**
   * Create K-weighting high shelf filter
   */
  private createKWeightingHighShelf(sampleRate: number): { b: number[]; a: number[] } {
    // High shelf at 2 kHz, +4 dB
    const fc = 2000 / sampleRate;
    const V0 = Math.pow(10, 4 / 20);
    const K = Math.tan(Math.PI * fc);
    const norm = 1 / (1 + Math.sqrt(2) * K + K * K);

    return {
      b: [
        (V0 + Math.sqrt(2 * V0) * K + K * K) * norm,
        2 * (K * K - V0) * norm,
        (V0 - Math.sqrt(2 * V0) * K + K * K) * norm,
      ],
      a: [1, 2 * (K * K - 1) * norm, (1 - Math.sqrt(2) * K + K * K) * norm],
    };
  }

  /**
   * Apply K-weighting filters to audio block
   */
  private applyKWeighting(
    block: Float32Array,
    preFilter: { b: number[]; a: number[] },
    highShelf: { b: number[]; a: number[] }
  ): Float32Array {
    const filtered = new Float32Array(block.length);

    // Apply pre-filter
    for (let i = 0; i < block.length; i++) {
      filtered[i] = preFilter.b[0] * block[i];

      if (i >= 1) {
        filtered[i] += preFilter.b[1] * block[i - 1] - preFilter.a[1] * filtered[i - 1];
      }
      if (i >= 2) {
        filtered[i] += preFilter.b[2] * block[i - 2] - preFilter.a[2] * filtered[i - 2];
      }
    }

    // Apply high shelf
    const output = new Float32Array(block.length);
    for (let i = 0; i < filtered.length; i++) {
      output[i] = highShelf.b[0] * filtered[i];

      if (i >= 1) {
        output[i] += highShelf.b[1] * filtered[i - 1] - highShelf.a[1] * output[i - 1];
      }
      if (i >= 2) {
        output[i] += highShelf.b[2] * filtered[i - 2] - highShelf.a[2] * output[i - 2];
      }
    }

    return output;
  }

  /**
   * Analyze stereo image
   */
  analyzeStereoImage(
    leftChannel: Float32Array,
    rightChannel: Float32Array
  ): {
    correlation: number;
    balance: number;
    width: number;
  } {
    // Calculate correlation
    let correlation = 0;
    let leftPower = 0;
    let rightPower = 0;

    for (let i = 0; i < leftChannel.length; i++) {
      correlation += leftChannel[i] * rightChannel[i];
      leftPower += leftChannel[i] * leftChannel[i];
      rightPower += rightChannel[i] * rightChannel[i];
    }

    correlation = correlation / Math.sqrt(leftPower * rightPower);

    // Calculate balance
    const balance = (rightPower - leftPower) / (rightPower + leftPower);

    // Calculate width (0 = mono, 1 = wide stereo)
    const width = 1 - Math.abs(correlation);

    return {
      correlation: isFinite(correlation) ? correlation : 0,
      balance: isFinite(balance) ? balance : 0,
      width: isFinite(width) ? width : 0,
    };
  }

  /**
   * Detect clipping in audio buffer
   */
  detectClipping(
    buffer: AudioBuffer,
    threshold: number = 0.99
  ): {
    hasClipping: boolean;
    clippedSamples: number;
    clippingPercentage: number;
  } {
    let clippedSamples = 0;
    const totalSamples = buffer.length * buffer.numberOfChannels;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const channelData = buffer.getChannelData(channel);

      for (let i = 0; i < channelData.length; i++) {
        if (Math.abs(channelData[i]) >= threshold) {
          clippedSamples++;
        }
      }
    }

    const clippingPercentage = (clippedSamples / totalSamples) * 100;

    return {
      hasClipping: clippedSamples > 0,
      clippedSamples,
      clippingPercentage,
    };
  }

  /**
   * Analyze dynamic range
   */
  analyzeDynamicRange(buffer: AudioBuffer): {
    peak: number;
    rms: number;
    dynamicRange: number;
    crestFactor: number;
  } {
    let peak = 0;
    let sumOfSquares = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const channelData = buffer.getChannelData(channel);

      for (let i = 0; i < channelData.length; i++) {
        const sample = Math.abs(channelData[i]);
        peak = Math.max(peak, sample);
        sumOfSquares += channelData[i] * channelData[i];
        sampleCount++;
      }
    }

    const rms = Math.sqrt(sumOfSquares / sampleCount);
    const dynamicRange = 20 * Math.log10(peak / rms);
    const crestFactor = peak / rms;

    return {
      peak,
      rms,
      dynamicRange: isFinite(dynamicRange) ? dynamicRange : 0,
      crestFactor: isFinite(crestFactor) ? crestFactor : 0,
    };
  }

  /**
   * Get frequency bands for EQ visualization
   */
  getFrequencyBands(): {
    bass: { min: number; max: number; label: string };
    lowMid: { min: number; max: number; label: string };
    mid: { min: number; max: number; label: string };
    highMid: { min: number; max: number; label: string };
    treble: { min: number; max: number; label: string };
  } {
    return {
      bass: { min: 20, max: 250, label: 'Bass' },
      lowMid: { min: 250, max: 500, label: 'Low-Mid' },
      mid: { min: 500, max: 2000, label: 'Mid' },
      highMid: { min: 2000, max: 8000, label: 'High-Mid' },
      treble: { min: 8000, max: 20000, label: 'Treble' },
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.analyser.disconnect();
  }
}
