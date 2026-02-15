/**
 * Audio Feature Extractor - In-House Audio Analysis for Reference-Based Generation
 * 
 * Extracts features from reference audio to enable style transfer:
 * - Spectral features (brightness, centroid, rolloff)
 * - Rhythm features (tempo, groove, swing)
 * - Timbral features (harmonic content, noise ratio)
 * - Dynamic features (envelope, transients)
 * 
 * 100% in-house, no external APIs
 */

import FFT from 'fft.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SpectralFeatures {
  spectralCentroid: number;      // Hz - brightness indicator
  spectralSpread: number;        // Hz - frequency distribution width
  spectralRolloff: number;       // Hz - frequency below which 85% energy exists
  spectralFlux: number;          // Rate of spectral change
  spectralFlatness: number;      // 0-1 - noise vs tonal (1 = pure noise)
  brightness: number;            // 0-1 - normalized high-frequency content
  bassPresence: number;          // 0-1 - low frequency content
  midPresence: number;           // 0-1 - mid frequency content
  highPresence: number;          // 0-1 - high frequency content
}

export interface RhythmFeatures {
  tempo: number;                 // BPM
  tempoConfidence: number;       // 0-1
  beatPositions: number[];       // Timestamps in seconds
  onsetStrength: number[];       // Onset detection function
  groove: number;                // 0-1 - swing/groove amount
  rhythmComplexity: number;      // 0-1 - pattern complexity
}

export interface TimbreFeatures {
  harmonicRatio: number;         // 0-1 - tonal vs noise
  attackTime: number;            // seconds - average attack time
  decayTime: number;             // seconds - average decay time
  sustain: number;               // 0-1 - sustain level
  noisiness: number;             // 0-1 - noise content
  roughness: number;             // 0-1 - inharmonicity
}

export interface DynamicFeatures {
  rms: number;                   // Root mean square (loudness)
  peak: number;                  // Peak amplitude
  dynamicRange: number;          // dB - difference between loud and quiet
  crestFactor: number;           // Peak to RMS ratio
  envelope: Float32Array;        // Amplitude envelope over time
  transients: number[];          // Transient positions in seconds
}

export interface AudioFeatures {
  spectral: SpectralFeatures;
  rhythm: RhythmFeatures;
  timbre: TimbreFeatures;
  dynamics: DynamicFeatures;
  duration: number;
  sampleRate: number;
}

export interface StyleProfile {
  brightness: number;
  energy: number;
  complexity: number;
  attack: number;
  decay: number;
  filterCutoff: number;
  filterResonance: number;
  distortion: number;
  tempo: number;
  swing: number;
}

// ============================================================================
// FFT UTILITIES
// ============================================================================

function hannWindow(length: number): Float32Array {
  const window = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
  }
  return window;
}

function applyWindow(signal: Float32Array, window: Float32Array): Float32Array {
  const result = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    result[i] = signal[i] * (window[i] || 0);
  }
  return result;
}

function computeMagnitudeSpectrum(fft: any, realPart: number[], imagPart: number[]): Float32Array {
  const length = realPart.length / 2;
  const magnitudes = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    magnitudes[i] = Math.sqrt(realPart[i] ** 2 + imagPart[i] ** 2);
  }
  return magnitudes;
}

// ============================================================================
// SPECTRAL ANALYSIS
// ============================================================================

export function extractSpectralFeatures(
  audioData: Float32Array,
  sampleRate: number,
  frameSize: number = 2048,
  hopSize: number = 512
): SpectralFeatures {
  const numFrames = Math.floor((audioData.length - frameSize) / hopSize) + 1;
  const window = hannWindow(frameSize);
  const fft = new FFT(frameSize);
  
  const centroids: number[] = [];
  const spreads: number[] = [];
  const rolloffs: number[] = [];
  const flatnesses: number[] = [];
  
  let bassTotal = 0;
  let midTotal = 0;
  let highTotal = 0;
  let prevMagnitudes: Float32Array | null = null;
  let fluxTotal = 0;

  // Frequency bin boundaries
  const bassMax = Math.floor(250 * frameSize / sampleRate);
  const midMin = Math.floor(250 * frameSize / sampleRate);
  const midMax = Math.floor(4000 * frameSize / sampleRate);
  const highMin = Math.floor(4000 * frameSize / sampleRate);

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopSize;
    const segment = audioData.slice(start, start + frameSize);
    const windowed = applyWindow(segment, window);
    
    const complexOut = fft.createComplexArray();
    const complexIn = fft.createComplexArray();
    for (let i = 0; i < frameSize; i++) {
      complexIn[2 * i] = windowed[i];
      complexIn[2 * i + 1] = 0;
    }
    fft.transform(complexOut, complexIn);
    
    // Extract magnitudes
    const magnitudes = new Float32Array(frameSize / 2);
    for (let i = 0; i < frameSize / 2; i++) {
      magnitudes[i] = Math.sqrt(complexOut[2 * i] ** 2 + complexOut[2 * i + 1] ** 2);
    }
    
    // Spectral centroid
    let weightedSum = 0;
    let magSum = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      const freq = i * sampleRate / frameSize;
      weightedSum += freq * magnitudes[i];
      magSum += magnitudes[i];
    }
    const centroid = magSum > 0 ? weightedSum / magSum : 0;
    centroids.push(centroid);
    
    // Spectral spread
    let spreadSum = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      const freq = i * sampleRate / frameSize;
      spreadSum += magnitudes[i] * (freq - centroid) ** 2;
    }
    const spread = magSum > 0 ? Math.sqrt(spreadSum / magSum) : 0;
    spreads.push(spread);
    
    // Spectral rolloff (85%)
    const rolloffThreshold = 0.85 * magSum;
    let cumSum = 0;
    let rolloffBin = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      cumSum += magnitudes[i];
      if (cumSum >= rolloffThreshold) {
        rolloffBin = i;
        break;
      }
    }
    const rolloff = rolloffBin * sampleRate / frameSize;
    rolloffs.push(rolloff);
    
    // Spectral flatness (geometric mean / arithmetic mean)
    let logSum = 0;
    let linSum = 0;
    let validBins = 0;
    for (let i = 1; i < magnitudes.length; i++) {
      if (magnitudes[i] > 1e-10) {
        logSum += Math.log(magnitudes[i]);
        linSum += magnitudes[i];
        validBins++;
      }
    }
    const geometricMean = validBins > 0 ? Math.exp(logSum / validBins) : 0;
    const arithmeticMean = validBins > 0 ? linSum / validBins : 0;
    const flatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
    flatnesses.push(flatness);
    
    // Band energies
    let bassEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    for (let i = 0; i < bassMax && i < magnitudes.length; i++) {
      bassEnergy += magnitudes[i] ** 2;
    }
    for (let i = midMin; i < midMax && i < magnitudes.length; i++) {
      midEnergy += magnitudes[i] ** 2;
    }
    for (let i = highMin; i < magnitudes.length; i++) {
      highEnergy += magnitudes[i] ** 2;
    }
    const totalEnergy = bassEnergy + midEnergy + highEnergy;
    if (totalEnergy > 0) {
      bassTotal += bassEnergy / totalEnergy;
      midTotal += midEnergy / totalEnergy;
      highTotal += highEnergy / totalEnergy;
    }
    
    // Spectral flux
    if (prevMagnitudes) {
      let flux = 0;
      for (let i = 0; i < magnitudes.length; i++) {
        const diff = magnitudes[i] - prevMagnitudes[i];
        if (diff > 0) flux += diff ** 2;
      }
      fluxTotal += Math.sqrt(flux);
    }
    prevMagnitudes = magnitudes;
  }

  const avgCentroid = centroids.reduce((a, b) => a + b, 0) / centroids.length;
  const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const avgRolloff = rolloffs.reduce((a, b) => a + b, 0) / rolloffs.length;
  const avgFlatness = flatnesses.reduce((a, b) => a + b, 0) / flatnesses.length;
  const avgFlux = fluxTotal / (numFrames - 1);

  // Normalize to 0-1 range
  const normalizedBrightness = Math.min(avgCentroid / 8000, 1);

  return {
    spectralCentroid: avgCentroid,
    spectralSpread: avgSpread,
    spectralRolloff: avgRolloff,
    spectralFlux: avgFlux,
    spectralFlatness: avgFlatness,
    brightness: normalizedBrightness,
    bassPresence: bassTotal / numFrames,
    midPresence: midTotal / numFrames,
    highPresence: highTotal / numFrames,
  };
}

// ============================================================================
// RHYTHM ANALYSIS
// ============================================================================

export function extractRhythmFeatures(
  audioData: Float32Array,
  sampleRate: number
): RhythmFeatures {
  // Compute onset detection function using spectral flux
  const frameSize = 1024;
  const hopSize = 256;
  const numFrames = Math.floor((audioData.length - frameSize) / hopSize);
  const window = hannWindow(frameSize);
  const fft = new FFT(frameSize);
  
  const onsetStrength = new Float32Array(numFrames);
  let prevMagnitudes: Float32Array | null = null;

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopSize;
    const segment = audioData.slice(start, start + frameSize);
    const windowed = applyWindow(segment, window);
    
    const complexOut = fft.createComplexArray();
    const complexIn = fft.createComplexArray();
    for (let i = 0; i < frameSize; i++) {
      complexIn[2 * i] = windowed[i];
      complexIn[2 * i + 1] = 0;
    }
    fft.transform(complexOut, complexIn);
    
    const magnitudes = new Float32Array(frameSize / 2);
    for (let i = 0; i < frameSize / 2; i++) {
      magnitudes[i] = Math.sqrt(complexOut[2 * i] ** 2 + complexOut[2 * i + 1] ** 2);
    }
    
    if (prevMagnitudes) {
      let flux = 0;
      for (let i = 0; i < magnitudes.length; i++) {
        const diff = magnitudes[i] - prevMagnitudes[i];
        if (diff > 0) flux += diff;
      }
      onsetStrength[frame] = flux;
    }
    prevMagnitudes = magnitudes;
  }

  // Peak picking for beat positions
  const beatPositions: number[] = [];
  const threshold = 0.3 * Math.max(...Array.from(onsetStrength));
  
  for (let i = 2; i < onsetStrength.length - 2; i++) {
    if (onsetStrength[i] > threshold &&
        onsetStrength[i] > onsetStrength[i - 1] &&
        onsetStrength[i] > onsetStrength[i + 1] &&
        onsetStrength[i] > onsetStrength[i - 2] &&
        onsetStrength[i] > onsetStrength[i + 2]) {
      beatPositions.push(i * hopSize / sampleRate);
    }
  }

  // Estimate tempo from inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < beatPositions.length; i++) {
    intervals.push(beatPositions[i] - beatPositions[i - 1]);
  }

  let tempo = 120; // default
  let confidence = 0.5;
  
  if (intervals.length > 2) {
    // Find most common interval
    const histogram: Record<number, number> = {};
    for (const interval of intervals) {
      // Quantize to 10ms
      const quantized = Math.round(interval * 100) / 100;
      histogram[quantized] = (histogram[quantized] || 0) + 1;
    }
    
    let maxCount = 0;
    let dominantInterval = 0.5;
    for (const [interval, count] of Object.entries(histogram)) {
      if (count > maxCount) {
        maxCount = count;
        dominantInterval = parseFloat(interval);
      }
    }
    
    // Convert interval to BPM
    if (dominantInterval > 0) {
      tempo = 60 / dominantInterval;
      
      // Normalize to reasonable range (60-200 BPM)
      while (tempo < 60) tempo *= 2;
      while (tempo > 200) tempo /= 2;
      
      confidence = Math.min(maxCount / intervals.length, 0.95);
    }
  }

  // Estimate groove/swing
  let groove = 0;
  if (beatPositions.length > 3) {
    // Compare even and odd intervals
    let evenSum = 0, oddSum = 0;
    let evenCount = 0, oddCount = 0;
    
    for (let i = 1; i < intervals.length; i++) {
      if (i % 2 === 0) {
        evenSum += intervals[i];
        evenCount++;
      } else {
        oddSum += intervals[i];
        oddCount++;
      }
    }
    
    if (evenCount > 0 && oddCount > 0) {
      const evenAvg = evenSum / evenCount;
      const oddAvg = oddSum / oddCount;
      groove = Math.abs(evenAvg - oddAvg) / Math.max(evenAvg, oddAvg);
      groove = Math.min(groove, 1);
    }
  }

  // Rhythm complexity based on onset density variation
  let complexity = 0;
  if (onsetStrength.length > 10) {
    const mean = Array.from(onsetStrength).reduce((a, b) => a + b, 0) / onsetStrength.length;
    const variance = Array.from(onsetStrength).reduce((a, b) => a + (b - mean) ** 2, 0) / onsetStrength.length;
    complexity = Math.min(Math.sqrt(variance) / mean, 1) || 0;
  }

  return {
    tempo: Math.round(tempo),
    tempoConfidence: confidence,
    beatPositions,
    onsetStrength: Array.from(onsetStrength),
    groove,
    rhythmComplexity: complexity,
  };
}

// ============================================================================
// TIMBRE ANALYSIS
// ============================================================================

export function extractTimbreFeatures(
  audioData: Float32Array,
  sampleRate: number
): TimbreFeatures {
  // Estimate harmonic ratio using autocorrelation
  const frameSize = 2048;
  const autocorr = new Float32Array(frameSize);
  
  for (let lag = 0; lag < frameSize; lag++) {
    let sum = 0;
    for (let i = 0; i < frameSize && i + lag < audioData.length; i++) {
      sum += audioData[i] * audioData[i + lag];
    }
    autocorr[lag] = sum;
  }
  
  // Find first peak after zero crossing (fundamental period)
  let harmonicRatio = 0.5;
  let foundPeak = false;
  let peakValue = 0;
  
  for (let i = 20; i < autocorr.length - 1; i++) {
    if (autocorr[i] > autocorr[i - 1] && autocorr[i] > autocorr[i + 1]) {
      if (autocorr[i] > peakValue) {
        peakValue = autocorr[i];
        harmonicRatio = autocorr[0] > 0 ? peakValue / autocorr[0] : 0;
        foundPeak = true;
        break;
      }
    }
  }

  // Estimate attack and decay times
  const envelope = computeEnvelope(audioData, sampleRate, 0.01);
  
  // Find peak
  let peakIdx = 0;
  let peakAmp = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > peakAmp) {
      peakAmp = envelope[i];
      peakIdx = i;
    }
  }
  
  // Attack time (time to reach peak)
  const envelopeDuration = audioData.length / sampleRate;
  const attackTime = (peakIdx / envelope.length) * envelopeDuration;
  
  // Decay time (time from peak to 10% of peak)
  let decayIdx = peakIdx;
  const decayThreshold = peakAmp * 0.1;
  for (let i = peakIdx; i < envelope.length; i++) {
    if (envelope[i] < decayThreshold) {
      decayIdx = i;
      break;
    }
  }
  const decayTime = ((decayIdx - peakIdx) / envelope.length) * envelopeDuration;
  
  // Sustain level (average of middle portion)
  let sustainSum = 0;
  const sustainStart = Math.floor(envelope.length * 0.4);
  const sustainEnd = Math.floor(envelope.length * 0.7);
  for (let i = sustainStart; i < sustainEnd; i++) {
    sustainSum += envelope[i];
  }
  const sustain = peakAmp > 0 ? (sustainSum / (sustainEnd - sustainStart)) / peakAmp : 0;

  // Noisiness estimation (spectral flatness proxy)
  const spectral = extractSpectralFeatures(audioData, sampleRate);
  const noisiness = spectral.spectralFlatness;

  // Roughness (inharmonicity) - based on spectral irregularity
  const roughness = 1 - harmonicRatio;

  return {
    harmonicRatio: Math.min(harmonicRatio, 1),
    attackTime,
    decayTime,
    sustain: Math.min(sustain, 1),
    noisiness: Math.min(noisiness, 1),
    roughness: Math.min(roughness, 1),
  };
}

// ============================================================================
// DYNAMIC ANALYSIS
// ============================================================================

function computeEnvelope(
  audioData: Float32Array,
  sampleRate: number,
  windowTime: number = 0.01
): Float32Array {
  const windowSize = Math.floor(sampleRate * windowTime);
  const hopSize = Math.floor(windowSize / 2);
  const numFrames = Math.floor((audioData.length - windowSize) / hopSize);
  const envelope = new Float32Array(numFrames);

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopSize;
    let sum = 0;
    for (let i = 0; i < windowSize && start + i < audioData.length; i++) {
      sum += audioData[start + i] ** 2;
    }
    envelope[frame] = Math.sqrt(sum / windowSize);
  }

  return envelope;
}

export function extractDynamicFeatures(
  audioData: Float32Array,
  sampleRate: number
): DynamicFeatures {
  // RMS
  let sumSquares = 0;
  for (let i = 0; i < audioData.length; i++) {
    sumSquares += audioData[i] ** 2;
  }
  const rms = Math.sqrt(sumSquares / audioData.length);

  // Peak
  let peak = 0;
  for (let i = 0; i < audioData.length; i++) {
    peak = Math.max(peak, Math.abs(audioData[i]));
  }

  // Dynamic range (using percentiles)
  const sorted = Array.from(audioData).map(Math.abs).sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const dynamicRange = p10 > 0 ? 20 * Math.log10(p90 / p10) : 60;

  // Crest factor
  const crestFactor = rms > 0 ? peak / rms : 1;

  // Envelope
  const envelope = computeEnvelope(audioData, sampleRate);

  // Transient detection
  const transients: number[] = [];
  const diffEnvelope = new Float32Array(envelope.length - 1);
  for (let i = 1; i < envelope.length; i++) {
    diffEnvelope[i - 1] = Math.max(0, envelope[i] - envelope[i - 1]);
  }

  const threshold = 0.2 * Math.max(...Array.from(diffEnvelope));
  const hopSize = Math.floor(sampleRate * 0.005);
  
  for (let i = 2; i < diffEnvelope.length - 2; i++) {
    if (diffEnvelope[i] > threshold &&
        diffEnvelope[i] > diffEnvelope[i - 1] &&
        diffEnvelope[i] > diffEnvelope[i + 1]) {
      transients.push(i * hopSize / sampleRate);
    }
  }

  return {
    rms,
    peak,
    dynamicRange,
    crestFactor,
    envelope,
    transients,
  };
}

// ============================================================================
// MAIN FEATURE EXTRACTOR
// ============================================================================

export function extractAllFeatures(
  audioData: Float32Array,
  sampleRate: number
): AudioFeatures {
  const spectral = extractSpectralFeatures(audioData, sampleRate);
  const rhythm = extractRhythmFeatures(audioData, sampleRate);
  const timbre = extractTimbreFeatures(audioData, sampleRate);
  const dynamics = extractDynamicFeatures(audioData, sampleRate);

  return {
    spectral,
    rhythm,
    timbre,
    dynamics,
    duration: audioData.length / sampleRate,
    sampleRate,
  };
}

// ============================================================================
// STYLE PROFILE GENERATOR
// ============================================================================

export function generateStyleProfile(features: AudioFeatures): StyleProfile {
  const { spectral, rhythm, timbre, dynamics } = features;

  return {
    brightness: spectral.brightness,
    energy: Math.min(dynamics.rms * 3, 1),
    complexity: rhythm.rhythmComplexity,
    attack: timbre.attackTime < 0.05 ? 0.1 : Math.min(timbre.attackTime, 1),
    decay: Math.min(timbre.decayTime, 1),
    filterCutoff: spectral.spectralRolloff,
    filterResonance: 2 + spectral.spectralFlatness * 10, // 2-12
    distortion: timbre.roughness * 0.5,
    tempo: rhythm.tempo,
    swing: rhythm.groove,
  };
}

export class AudioFeatureExtractor {
  private sampleRate: number;

  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;
  }

  extract(audioData: Float32Array): AudioFeatures {
    return extractAllFeatures(audioData, this.sampleRate);
  }

  getStyleProfile(audioData: Float32Array): StyleProfile {
    const features = this.extract(audioData);
    return generateStyleProfile(features);
  }

  compareStyles(profile1: StyleProfile, profile2: StyleProfile): number {
    // Calculate similarity between two style profiles (0-1)
    const weights = {
      brightness: 1,
      energy: 1,
      complexity: 0.5,
      attack: 0.5,
      decay: 0.5,
      tempo: 0.8,
    };

    let totalDiff = 0;
    let totalWeight = 0;

    totalDiff += Math.abs(profile1.brightness - profile2.brightness) * weights.brightness;
    totalWeight += weights.brightness;

    totalDiff += Math.abs(profile1.energy - profile2.energy) * weights.energy;
    totalWeight += weights.energy;

    totalDiff += Math.abs(profile1.complexity - profile2.complexity) * weights.complexity;
    totalWeight += weights.complexity;

    totalDiff += Math.abs(profile1.attack - profile2.attack) * weights.attack;
    totalWeight += weights.attack;

    totalDiff += Math.abs(profile1.decay - profile2.decay) * weights.decay;
    totalWeight += weights.decay;

    // Tempo difference normalized
    const tempoDiff = Math.abs(profile1.tempo - profile2.tempo) / 100; // Normalize by 100 BPM
    totalDiff += Math.min(tempoDiff, 1) * weights.tempo;
    totalWeight += weights.tempo;

    return 1 - (totalDiff / totalWeight);
  }
}

export default AudioFeatureExtractor;
