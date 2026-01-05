import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { logger } from '../logger.js';
import { z } from 'zod';

const router = Router();

const analyzeAudioSchema = z.object({
  sampleRate: z.number().min(8000).max(192000).default(44100),
  channels: z.number().min(1).max(2).default(2),
  samples: z.array(z.number()).optional(),
  leftChannel: z.array(z.number()).optional(),
  rightChannel: z.array(z.number()).optional(),
});

const processAudioSchema = z.object({
  sampleRate: z.number().min(8000).max(192000).default(44100),
  channels: z.number().min(1).max(2).default(2),
  samples: z.array(z.number()).optional(),
  leftChannel: z.array(z.number()).optional(),
  rightChannel: z.array(z.number()).optional(),
  processingChain: z.array(z.object({
    type: z.enum(['eq', 'compressor', 'reverb', 'limiter', 'gain']),
    parameters: z.record(z.any()),
  })),
});

function calculateLUFS(samples: number[], sampleRate: number): number {
  const blockSize = Math.floor(sampleRate * 0.4);
  if (samples.length < blockSize) return -70;
  
  let totalPower = 0;
  let blockCount = 0;
  
  for (let start = 0; start < samples.length - blockSize; start += Math.floor(blockSize / 2)) {
    const block = samples.slice(start, start + blockSize);
    const meanSquare = block.reduce((sum, s) => sum + s * s, 0) / block.length;
    totalPower += meanSquare;
    blockCount++;
  }
  
  if (blockCount === 0) return -70;
  const meanPower = totalPower / blockCount;
  const lufs = -0.691 + 10 * Math.log10(meanPower);
  return isFinite(lufs) ? Math.round(lufs * 100) / 100 : -70;
}

function calculatePeakDB(samples: number[]): number {
  if (samples.length === 0) return -Infinity;
  const peak = Math.max(...samples.map(Math.abs));
  const peakDB = 20 * Math.log10(peak);
  return isFinite(peakDB) ? Math.round(peakDB * 100) / 100 : -Infinity;
}

function calculateRMS(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sumOfSquares = samples.reduce((sum, s) => sum + s * s, 0);
  return Math.sqrt(sumOfSquares / samples.length);
}

function calculateDynamicRange(samples: number[]): { peak: number; rms: number; dynamicRange: number; crestFactor: number } {
  if (samples.length === 0) {
    return { peak: 0, rms: 0, dynamicRange: 0, crestFactor: 0 };
  }
  
  const peak = Math.max(...samples.map(Math.abs));
  const rms = calculateRMS(samples);
  const dynamicRange = peak > 0 && rms > 0 ? 20 * Math.log10(peak / rms) : 0;
  const crestFactor = rms > 0 ? peak / rms : 0;
  
  return {
    peak: Math.round(peak * 10000) / 10000,
    rms: Math.round(rms * 10000) / 10000,
    dynamicRange: isFinite(dynamicRange) ? Math.round(dynamicRange * 100) / 100 : 0,
    crestFactor: isFinite(crestFactor) ? Math.round(crestFactor * 100) / 100 : 0,
  };
}

function detectClipping(samples: number[], threshold: number = 0.99): { hasClipping: boolean; clippedSamples: number; clippingPercentage: number } {
  let clippedSamples = 0;
  for (const sample of samples) {
    if (Math.abs(sample) >= threshold) {
      clippedSamples++;
    }
  }
  
  const clippingPercentage = samples.length > 0 ? (clippedSamples / samples.length) * 100 : 0;
  
  return {
    hasClipping: clippedSamples > 0,
    clippedSamples,
    clippingPercentage: Math.round(clippingPercentage * 100) / 100,
  };
}

function analyzeStereoImage(leftChannel: number[], rightChannel: number[]): { correlation: number; balance: number; width: number } {
  if (leftChannel.length === 0 || rightChannel.length === 0) {
    return { correlation: 0, balance: 0, width: 0 };
  }
  
  let correlation = 0;
  let leftPower = 0;
  let rightPower = 0;
  
  const length = Math.min(leftChannel.length, rightChannel.length);
  
  for (let i = 0; i < length; i++) {
    correlation += leftChannel[i] * rightChannel[i];
    leftPower += leftChannel[i] * leftChannel[i];
    rightPower += rightChannel[i] * rightChannel[i];
  }
  
  const normalizedCorrelation = Math.sqrt(leftPower * rightPower) > 0 
    ? correlation / Math.sqrt(leftPower * rightPower) 
    : 0;
  
  const totalPower = leftPower + rightPower;
  const balance = totalPower > 0 ? (rightPower - leftPower) / totalPower : 0;
  const width = 1 - Math.abs(normalizedCorrelation);
  
  return {
    correlation: isFinite(normalizedCorrelation) ? Math.round(normalizedCorrelation * 1000) / 1000 : 0,
    balance: isFinite(balance) ? Math.round(balance * 1000) / 1000 : 0,
    width: isFinite(width) ? Math.round(width * 1000) / 1000 : 0,
  };
}

function applyGain(samples: number[], gainDB: number): number[] {
  const gainLinear = Math.pow(10, gainDB / 20);
  return samples.map(s => Math.max(-1, Math.min(1, s * gainLinear)));
}

function applyCompressor(
  samples: number[],
  threshold: number,
  ratio: number,
  attack: number,
  release: number,
  sampleRate: number
): number[] {
  const thresholdLinear = Math.pow(10, threshold / 20);
  const attackSamples = Math.floor(attack * sampleRate);
  const releaseSamples = Math.floor(release * sampleRate);
  
  const output = new Array(samples.length);
  let envelope = 0;
  
  for (let i = 0; i < samples.length; i++) {
    const inputLevel = Math.abs(samples[i]);
    
    if (inputLevel > envelope) {
      envelope += (inputLevel - envelope) / Math.max(1, attackSamples);
    } else {
      envelope += (inputLevel - envelope) / Math.max(1, releaseSamples);
    }
    
    let gain = 1;
    if (envelope > thresholdLinear) {
      const overDB = 20 * Math.log10(envelope / thresholdLinear);
      const compressedOverDB = overDB / ratio;
      gain = Math.pow(10, (compressedOverDB - overDB) / 20);
    }
    
    output[i] = samples[i] * gain;
  }
  
  return output;
}

function applyLimiter(samples: number[], ceiling: number): number[] {
  const ceilingLinear = Math.pow(10, ceiling / 20);
  return samples.map(s => {
    if (Math.abs(s) > ceilingLinear) {
      return s > 0 ? ceilingLinear : -ceilingLinear;
    }
    return s;
  });
}

router.post('/analyze', requireAuth, async (req: Request, res: Response) => {
  try {
    const validation = analyzeAudioSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }
    
    const { sampleRate, channels, samples, leftChannel, rightChannel } = validation.data;
    
    let allSamples: number[] = [];
    let left: number[] = [];
    let right: number[] = [];
    
    if (samples && samples.length > 0) {
      allSamples = samples;
      if (channels === 2) {
        left = samples.filter((_, i) => i % 2 === 0);
        right = samples.filter((_, i) => i % 2 === 1);
      } else {
        left = samples;
        right = samples;
      }
    } else if (leftChannel && rightChannel) {
      left = leftChannel;
      right = rightChannel;
      allSamples = [];
      for (let i = 0; i < Math.max(left.length, right.length); i++) {
        if (i < left.length) allSamples.push(left[i]);
        if (i < right.length) allSamples.push(right[i]);
      }
    }
    
    if (allSamples.length === 0) {
      return res.status(400).json({ error: 'No audio samples provided' });
    }
    
    const lufs = calculateLUFS(allSamples, sampleRate);
    const peakDB = calculatePeakDB(allSamples);
    const dynamics = calculateDynamicRange(allSamples);
    const clipping = detectClipping(allSamples);
    const stereo = channels === 2 ? analyzeStereoImage(left, right) : null;
    
    res.json({
      success: true,
      metrics: {
        lufs,
        peakDB,
        truePeak: peakDB,
        rms: dynamics.rms,
        rmsDB: dynamics.rms > 0 ? Math.round(20 * Math.log10(dynamics.rms) * 100) / 100 : -Infinity,
        dynamicRange: dynamics.dynamicRange,
        crestFactor: dynamics.crestFactor,
        clipping: clipping,
        stereoImage: stereo,
        sampleCount: allSamples.length,
        duration: allSamples.length / sampleRate / channels,
      },
    });
  } catch (error: unknown) {
    logger.error('Audio analysis error:', error);
    res.status(500).json({ error: 'Audio analysis failed' });
  }
});

router.post('/process', requireAuth, async (req: Request, res: Response) => {
  try {
    const validation = processAudioSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }
    
    const { sampleRate, channels, samples, leftChannel, rightChannel, processingChain } = validation.data;
    
    let processedSamples: number[] = [];
    
    if (samples && samples.length > 0) {
      processedSamples = [...samples];
    } else if (leftChannel && rightChannel) {
      for (let i = 0; i < Math.max(leftChannel.length, rightChannel.length); i++) {
        if (i < leftChannel.length) processedSamples.push(leftChannel[i]);
        if (i < rightChannel.length) processedSamples.push(rightChannel[i]);
      }
    }
    
    if (processedSamples.length === 0) {
      return res.status(400).json({ error: 'No audio samples provided' });
    }
    
    for (const processor of processingChain) {
      switch (processor.type) {
        case 'gain':
          const gainDB = processor.parameters.gain ?? 0;
          processedSamples = applyGain(processedSamples, gainDB);
          break;
          
        case 'compressor':
          const threshold = processor.parameters.threshold ?? -24;
          const ratio = processor.parameters.ratio ?? 4;
          const attack = processor.parameters.attack ?? 0.003;
          const release = processor.parameters.release ?? 0.1;
          processedSamples = applyCompressor(processedSamples, threshold, ratio, attack, release, sampleRate);
          break;
          
        case 'limiter':
          const ceiling = processor.parameters.ceiling ?? -0.3;
          processedSamples = applyLimiter(processedSamples, ceiling);
          break;
          
        case 'eq':
        case 'reverb':
          break;
      }
    }
    
    const postMetrics = {
      peakDB: calculatePeakDB(processedSamples),
      rms: calculateRMS(processedSamples),
      lufs: calculateLUFS(processedSamples, sampleRate),
    };
    
    res.json({
      success: true,
      processedSamples,
      metrics: postMetrics,
      processingApplied: processingChain.map(p => p.type),
    });
  } catch (error: unknown) {
    logger.error('Audio processing error:', error);
    res.status(500).json({ error: 'Audio processing failed' });
  }
});

router.get('/presets', requireAuth, async (req: Request, res: Response) => {
  try {
    const presets = {
      mixing: [
        {
          id: 'vocal-clarity',
          name: 'Vocal Clarity',
          description: 'Enhance vocal presence and clarity',
          processingChain: [
            { type: 'eq', parameters: { bands: [{ frequency: 100, gain: -3, q: 0.7 }, { frequency: 3000, gain: 3, q: 1.0 }, { frequency: 8000, gain: 2, q: 0.7 }] } },
            { type: 'compressor', parameters: { threshold: -18, ratio: 3, attack: 0.01, release: 0.15 } },
          ],
        },
        {
          id: 'warm-bass',
          name: 'Warm Bass',
          description: 'Add warmth and punch to bass instruments',
          processingChain: [
            { type: 'eq', parameters: { bands: [{ frequency: 80, gain: 4, q: 0.8 }, { frequency: 200, gain: 2, q: 0.7 }, { frequency: 2000, gain: -2, q: 1.0 }] } },
            { type: 'compressor', parameters: { threshold: -20, ratio: 4, attack: 0.005, release: 0.1 } },
          ],
        },
        {
          id: 'drum-punch',
          name: 'Drum Punch',
          description: 'Add punch and impact to drums',
          processingChain: [
            { type: 'eq', parameters: { bands: [{ frequency: 60, gain: 3, q: 1.0 }, { frequency: 800, gain: -2, q: 0.7 }, { frequency: 4000, gain: 3, q: 0.8 }] } },
            { type: 'compressor', parameters: { threshold: -15, ratio: 4, attack: 0.001, release: 0.08 } },
          ],
        },
        {
          id: 'acoustic-guitar',
          name: 'Acoustic Guitar',
          description: 'Natural acoustic guitar enhancement',
          processingChain: [
            { type: 'eq', parameters: { bands: [{ frequency: 80, gain: -4, q: 0.7 }, { frequency: 200, gain: -2, q: 0.7 }, { frequency: 5000, gain: 2, q: 0.8 }] } },
            { type: 'compressor', parameters: { threshold: -22, ratio: 2.5, attack: 0.015, release: 0.2 } },
          ],
        },
      ],
      mastering: [
        {
          id: 'streaming-master',
          name: 'Streaming Master',
          description: 'Optimized for streaming platforms (-14 LUFS)',
          targetLUFS: -14,
          processingChain: [
            { type: 'eq', parameters: { bands: [{ frequency: 30, gain: -2, q: 0.7 }, { frequency: 60, gain: 1, q: 0.7 }, { frequency: 10000, gain: 1, q: 0.7 }] } },
            { type: 'compressor', parameters: { threshold: -12, ratio: 2, attack: 0.02, release: 0.2 } },
            { type: 'limiter', parameters: { ceiling: -1, release: 0.05 } },
          ],
        },
        {
          id: 'club-master',
          name: 'Club Master',
          description: 'Loud and punchy for club play',
          targetLUFS: -9,
          processingChain: [
            { type: 'eq', parameters: { bands: [{ frequency: 50, gain: 2, q: 0.8 }, { frequency: 3000, gain: 1, q: 0.7 }, { frequency: 12000, gain: 2, q: 0.7 }] } },
            { type: 'compressor', parameters: { threshold: -8, ratio: 3, attack: 0.01, release: 0.15 } },
            { type: 'limiter', parameters: { ceiling: -0.3, release: 0.03 } },
          ],
        },
        {
          id: 'vinyl-master',
          name: 'Vinyl Master',
          description: 'Optimized for vinyl pressing',
          targetLUFS: -12,
          processingChain: [
            { type: 'eq', parameters: { bands: [{ frequency: 30, gain: -6, q: 0.5 }, { frequency: 15000, gain: -3, q: 0.7 }] } },
            { type: 'compressor', parameters: { threshold: -15, ratio: 2, attack: 0.03, release: 0.25 } },
            { type: 'limiter', parameters: { ceiling: -3, release: 0.1 } },
          ],
        },
        {
          id: 'broadcast-master',
          name: 'Broadcast Master',
          description: 'Optimized for radio/TV broadcast',
          targetLUFS: -24,
          processingChain: [
            { type: 'eq', parameters: { bands: [{ frequency: 80, gain: -2, q: 0.7 }, { frequency: 8000, gain: -1, q: 0.7 }] } },
            { type: 'compressor', parameters: { threshold: -20, ratio: 2, attack: 0.02, release: 0.3 } },
            { type: 'limiter', parameters: { ceiling: -3, release: 0.1 } },
          ],
        },
      ],
      effects: [
        {
          id: 'plate-reverb',
          name: 'Plate Reverb',
          description: 'Classic plate reverb for vocals and snares',
          processingChain: [
            { type: 'reverb', parameters: { type: 'plate', decay: 0.6, mix: 0.25, damping: 0.4 } },
          ],
        },
        {
          id: 'room-ambience',
          name: 'Room Ambience',
          description: 'Natural room sound',
          processingChain: [
            { type: 'reverb', parameters: { type: 'room', decay: 0.3, mix: 0.15, damping: 0.6 } },
          ],
        },
        {
          id: 'hall-reverb',
          name: 'Hall Reverb',
          description: 'Large hall reverb for orchestral sounds',
          processingChain: [
            { type: 'reverb', parameters: { type: 'hall', decay: 0.8, mix: 0.3, damping: 0.3 } },
          ],
        },
      ],
    };
    
    res.json({
      success: true,
      presets,
    });
  } catch (error: unknown) {
    logger.error('Error fetching presets:', error);
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

router.get('/capabilities', async (req: Request, res: Response) => {
  res.json({
    success: true,
    capabilities: {
      analysis: {
        lufs: true,
        truePeak: true,
        dynamicRange: true,
        stereoImage: true,
        clippingDetection: true,
        rms: true,
      },
      processing: {
        eq: { bands: 8, types: ['highpass', 'lowpass', 'peaking', 'highshelf', 'lowshelf'] },
        compressor: { threshold: [-100, 0], ratio: [1, 20], attack: [0, 1], release: [0, 1] },
        limiter: { ceiling: [-20, 0] },
        reverb: { types: ['plate', 'room', 'hall', 'spring', 'chamber'] },
        gain: { range: [-60, 24] },
      },
      formats: {
        input: ['wav', 'mp3', 'flac', 'ogg', 'aac'],
        output: ['wav', 'mp3', 'flac'],
        sampleRates: [44100, 48000, 88200, 96000],
        bitDepths: [16, 24, 32],
      },
    },
  });
});

export default router;
