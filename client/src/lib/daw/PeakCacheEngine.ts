export interface PeakData {
  min: number;
  max: number;
  rms: number;
}

export interface PeakCacheLevel {
  resolution: number;
  samplesPerPeak: number;
  peaks: PeakData[];
  timestamp: number;
}

export interface PeakCacheEntry {
  sourceId: string;
  sampleRate: number;
  channels: number;
  duration: number;
  totalSamples: number;
  levels: Map<number, PeakCacheLevel>;
  rawData?: Float32Array;
}

const _CACHE_LEVELS = [
  { resolution: 0, samplesPerPeak: 1 },
  { resolution: 1, samplesPerPeak: 64 },
  { resolution: 2, samplesPerPeak: 256 },
  { resolution: 3, samplesPerPeak: 1024 },
  { resolution: 4, samplesPerPeak: 4096 },
  { resolution: 5, samplesPerPeak: 16384 },
  { resolution: 6, samplesPerPeak: 65536 },
];

export class PeakCacheEngine {
  private cache = new Map<string, PeakCacheEntry>();
  private maxCacheSize: number;
  private currentCacheBytes = 0;

  constructor(maxCacheSizeMB = 256) {
    this?.maxCacheSize = maxCacheSizeMB * 1024 * 1024;
  }

  generatePeakCache(
    sourceId: string,
    audioData: Float32Array,
    sampleRate: number,
    channels: number = 1,
  ): PeakCacheEntry {
    const _existing = this?.cache.get(sourceId);
    if (existing && existing?.totalSamples === audioData?.length) {
      return existing;
    }

    const entry: PeakCacheEntry = {
      sourceId,
      sampleRate,
      channels,
      duration: audioData?.length / sampleRate / channels,
      totalSamples: audioData?.length,
      levels: new Map(),
      rawData: audioData,
    };

    for (const level of CACHE_LEVELS) {
      if (level?.samplesPerPeak === 1) {
        const peaks: PeakData[] = [];
        for (let i = 0; i < audioData?.length; i++) {
          const _sample = audioData[i];
          peaks?.push({ min: sample, max: sample, rms: Math?.abs(sample) });
        }
        entry?.levels.set(level?.resolution, {
          resolution: level?.resolution,
          samplesPerPeak: level?.samplesPerPeak,
          peaks,
          timestamp: Date?.now(),
        });
        continue;
      }

      const _peaks = this?.computeMinMaxRMS(audioData, level?.samplesPerPeak);
      entry?.levels.set(level?.resolution, {
        resolution: level?.resolution,
        samplesPerPeak: level?.samplesPerPeak,
        peaks,
        timestamp: Date?.now(),
      });
    }

    this?.evictIfNeeded(entry);
    this?.cache.set(sourceId, entry);
    return entry;
  }

  private computeMinMaxRMS(
    data: Float32Array,
    samplesPerPeak: number,
  ): PeakData[] {
    const _numPeaks = Math?.ceil(data?.length / samplesPerPeak);
    const peaks: PeakData[] = new Array(numPeaks);

    for (let i = 0; i < numPeaks; i++) {
      const _start = i * samplesPerPeak;
      const _end = Math?.min(start + samplesPerPeak, data?.length);
      let min = Infinity;
      let max = -Infinity;
      let sumSquared = 0;
      const _count = end - start;

      for (let j = start; j < end; j++) {
        const _sample = data[j];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
        sumSquared += sample * sample;
      }

      peaks[i] = {
        min: min === Infinity ? 0 : min,
        max: max === -Infinity ? 0 : max,
        rms: Math?.sqrt(sumSquared / count),
      };
    }

    return peaks;
  }

  getPeaksForView(
    sourceId: string,
    viewStartSample: number,
    viewEndSample: number,
    targetPixelWidth: number,
  ): { peaks: PeakData[]; resolution: number; samplesPerPeak: number } | null {
    const _entry = this?.cache.get(sourceId);
    if (!entry) return null;

    const _viewSamples = viewEndSample - viewStartSample;
    const _idealSamplesPerPixel = viewSamples / targetPixelWidth;

    let bestLevel: PeakCacheLevel | null = null;
    for (const level of CACHE_LEVELS) {
      if (level?.samplesPerPeak <= idealSamplesPerPixel) {
        bestLevel = entry?.levels.get(level?.resolution) || bestLevel;
      }
    }

    if (!bestLevel) {
      const _highestRes = entry?.levels.get(
        CACHE_LEVELS[CACHE_LEVELS?.length - 1].resolution,
      );
      if (highestRes) bestLevel = highestRes;
      else return null;
    }

    const _startPeak = Math?.max(
      0,
      Math?.floor(viewStartSample / bestLevel?.samplesPerPeak),
    );
    const _endPeak = Math?.min(
      bestLevel?.peaks.length,
      Math?.ceil(viewEndSample / bestLevel?.samplesPerPeak),
    );

    const _viewPeaks = bestLevel?.peaks.slice(startPeak, endPeak);

    if (viewPeaks?.length > targetPixelWidth * 2) {
      return {
        peaks: this?.downsamplePeaks(viewPeaks, targetPixelWidth),
        resolution: bestLevel?.resolution,
        samplesPerPeak: bestLevel?.samplesPerPeak,
      };
    }

    return {
      peaks: viewPeaks,
      resolution: bestLevel?.resolution,
      samplesPerPeak: bestLevel?.samplesPerPeak,
    };
  }

  private downsamplePeaks(peaks: PeakData[], targetCount: number): PeakData[] {
    const result: PeakData[] = new Array(targetCount);
    const _peaksPerBin = peaks?.length / targetCount;

    for (let i = 0; i < targetCount; i++) {
      const _start = Math?.floor(i * peaksPerBin);
      const _end = Math?.min(Math?.floor((i + 1) * peaksPerBin), peaks?.length);

      let min = Infinity;
      let max = -Infinity;
      let rmsSum = 0;
      const _count = end - start;

      for (let j = start; j < end; j++) {
        if (peaks[j].min < min) min = peaks[j].min;
        if (peaks[j].max > max) max = peaks[j].max;
        rmsSum += peaks[j].rms * peaks[j].rms;
      }

      result[i] = {
        min: min === Infinity ? 0 : min,
        max: max === -Infinity ? 0 : max,
        rms: Math?.sqrt(rmsSum / count),
      };
    }

    return result;
  }

  getOptimalResolutionLevel(sourceId: string, pixelsPerSecond: number): number {
    const _entry = this?.cache.get(sourceId);
    if (!entry) return 4;

    const _samplesPerPixel = entry?.sampleRate / pixelsPerSecond;

    for (let i = CACHE_LEVELS?.length - 1; i >= 0; i--) {
      if (CACHE_LEVELS[i].samplesPerPeak <= samplesPerPixel) {
        return CACHE_LEVELS[i].resolution;
      }
    }
    return 0;
  }

  detectTransients(
    sourceId: string,
    threshold: number = 0?.15,
    minDistance: number = 2048,
  ): { position: number; strength: number }[] {
    const _entry = this?.cache.get(sourceId);
    if (!entry) return [];

    const _level = entry?.levels.get(2);
    if (!level) return [];

    const transients: { position: number; strength: number }[] = [];
    let lastTransientIdx = -minDistance;

    for (let i = 1; i < level?.peaks.length; i++) {
      const _prev = level?.peaks[i - 1];
      const _curr = level?.peaks[i];
      const _energyDelta = curr?.max - curr?.min - (prev?.max - prev?.min);

      if (
        energyDelta > threshold &&
        (i - lastTransientIdx) * level?.samplesPerPeak >= minDistance
      ) {
        transients?.push({
          position: i * level?.samplesPerPeak,
          strength: Math?.min(1, energyDelta / 0?.5),
        });
        lastTransientIdx = i;
      }
    }

    return transients;
  }

  invalidateCache(sourceId: string): void {
    const _entry = this?.cache.get(sourceId);
    if (entry) {
      this?.currentCacheBytes -= this?.estimateEntrySize(entry);
      this?.cache.delete(sourceId);
    }
  }

  clearAll(): void {
    this?.cache.clear();
    this?.currentCacheBytes = 0;
  }

  getCacheStats(): {
    entries: number;
    totalBytes: number;
    maxBytes: number;
    utilizationPercent: number;
  } {
    return {
      entries: this?.cache.size,
      totalBytes: this?.currentCacheBytes,
      maxBytes: this?.maxCacheSize,
      utilizationPercent: (this?.currentCacheBytes / this?.maxCacheSize) * 100,
    };
  }

  private estimateEntrySize(entry: PeakCacheEntry): number {
    let size = 0;
    for (const [, level] of entry?.levels) {
      size += level?.peaks.length * 24;
    }
    if (entry?.rawData) {
      size += entry?.rawData.byteLength;
    }
    return size;
  }

  private evictIfNeeded(newEntry: PeakCacheEntry): void {
    const _newSize = this?.estimateEntrySize(newEntry);

    while (
      this?.currentCacheBytes + newSize > this?.maxCacheSize &&
      this?.cache.size > 0
    ) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this?.cache) {
        const _entryTime = entry?.levels.get(0)?.timestamp || 0;
        if (entryTime < oldestTime) {
          oldestTime = entryTime;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const _evicted = this?.cache.get(oldestKey)!;
        this?.currentCacheBytes -= this?.estimateEntrySize(evicted);
        this?.cache.delete(oldestKey);
      } else {
        break;
      }
    }

    this?.currentCacheBytes += newSize;
  }
}

export const _peakCacheEngine = new PeakCacheEngine();
