import { logger } from "../logger";

export interface WaveformPeakLevel {
  samplesPerPeak: number;
  /** Interleaved [min0, max0, min1, max1, …] */
  peaks: Float32Array;
  count: number;
}

export interface WaveformPeakCache {
  sampleRate: number;
  totalSamples: number;
  levels: WaveformPeakLevel[];
}

export interface AudioEngineConfig {
  sampleRate: number;
  bufferSize: number;
  channels: number;
  latencyHint: "interactive" | "balanced" | "playback";
}

export interface PlaybackState {
  isPlaying: boolean;
  isRecording: boolean;
  currentSample: number;
  currentTime: number;
  loopStart: number;
  loopEnd: number;
  isLooping: boolean;
}

export interface MeteringData {
  trackId: string;
  left: number;
  right: number;
  peakLeft: number;
  peakRight: number;
  rmsLeft: number;
  rmsRight: number;
}

export interface ScheduledClip {
  id: string;
  trackId: string;
  buffer: AudioBuffer;
  startSample: number;
  durationSamples: number;
  offsetSamples: number;
  gain: number;
  fadeInSamples: number;
  fadeOutSamples: number;
}

type AudioEngineEventType =
  | "position-update"
  | "metering-update"
  | "state-change"
  | "buffer-underrun"
  | "latency-change";

interface AudioEngineEvent {
  type: AudioEngineEventType;
  data: unknown;
}

export class AudioWorkletEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterAnalyzer: AnalyserNode | null = null;
  private trackNodes: Map<
    string,
    {
      gain: GainNode;
      panner: StereoPannerNode;
      analyzer: AnalyserNode;
      muted: boolean;
      solo: boolean;
      volume: number;
    }
  > = new Map();

  private scheduledSources: Map<string, AudioBufferSourceNode[]> = new Map();
  private clips: Map<string, ScheduledClip> = new Map();

  private state: PlaybackState = {
    isPlaying: false,
    isRecording: false,
    currentSample: 0,
    currentTime: 0,
    loopStart: 0,
    loopEnd: 0,
    isLooping: false,
  };

  private config: AudioEngineConfig = {
    sampleRate: 48000,
    bufferSize: 256,
    channels: 2,
    latencyHint: "interactive",
  };

  private listeners: Set<(event: AudioEngineEvent) => void> = new Set();
  private animationFrameId: number | null = null;
  private lastScheduleTime: number = 0;
  private scheduleAheadTime: number = 0.5;
  private lookAhead: number = 25;
  private schedulerTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private meteringInterval: number | null = null;
  private meteringData: Map<string, MeteringData> = new Map();
  private workletNode: AudioWorkletNode | null = null;
  private workletReady: boolean = false;

  async initialize(config?: Partial<AudioEngineConfig>): Promise<void> {
    if (config) {
      this.config = { ...this?.config, ...config };
    }

    // Already initialized — just resume if suspended and re-emit state
    if (this.audioContext !== null) {
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume().catch(() => {});
      }
      this?.emit({ type: "state-change", data: { initialized: true } });
      return;
    }

    try {
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
        latencyHint: this.config.latencyHint,
      });

      if (this?.audioContext.state === "suspended") {
        await this?.audioContext.resume();
      }

      this.config.sampleRate = this?.audioContext.sampleRate;

      try {
        await this?.audioContext.audioWorklet?.addModule("/audio-processor.js");
        this.workletNode = new AudioWorkletNode(
          this?.audioContext,
          "daw-audio-processor",
        );
        this.workletReady = true;

        this.workletNode.port.onmessage = (event) => {
          const { type, data } = event?.data ?? {};
          if (type === "metering") {
            this.state.currentSample = data?.position;
            this.state.currentTime = data?.time;

            const peakLeftDb =
              data?.peakLeft > 0 ? 20 * Math.log10(data?.peakLeft) : -Infinity;
            const peakRightDb =
              data?.peakRight > 0 ? 20 * Math.log10(data?.peakRight) : -Infinity;
            const rmsLeftDb =
              data?.rmsLeft > 0 ? 20 * Math.log10(data?.rmsLeft) : -Infinity;
            const rmsRightDb =
              data?.rmsRight > 0 ? 20 * Math.log10(data?.rmsRight) : -Infinity;

            const masterMeteringData: MeteringData = {
              trackId: "master",
              left: peakLeftDb,
              right: peakRightDb,
              peakLeft: data.peakLeft,
              peakRight: data.peakRight,
              rmsLeft: rmsLeftDb,
              rmsRight: rmsRightDb,
            };

            this?.meteringData.set("master", masterMeteringData);

            this?.emit({
              type: "metering-update",
              data: [masterMeteringData],
            });

            this?.emit({
              type: "position-update",
              data: { time: data.time, sample: data.position },
            });
          }
        };

        logger?.info("[AudioWorkletEngine] AudioWorklet processor loaded");
      } catch (workletError) {
        logger?.warn(
          "[AudioWorkletEngine] AudioWorklet not supported, falling back to analyzer-based metering",
        );
        this.workletReady = false;
      }

      this.masterGain = this?.audioContext.createGain();
      this.masterAnalyzer = this?.audioContext.createAnalyser();
      this.masterAnalyzer.fftSize = 2048;
      this.masterAnalyzer.smoothingTimeConstant = 0.8;

      this?.masterGain.connect(this?.masterAnalyzer);

      if (this?.workletNode && this?.workletReady) {
        this?.masterAnalyzer.connect(this?.workletNode);
        this?.workletNode.connect(this?.audioContext.destination);
      } else {
        this?.masterAnalyzer.connect(this?.audioContext.destination);
        this?.startMeteringLoop();
      }

      this?.emit({ type: "state-change", data: { initialized: true } });
    } catch (error) {
      logger?.error("[AudioWorkletEngine] Failed to initialize:", error);
      throw error;
    }
  }

  private startMeteringLoop(): void {
    if (this?.meteringInterval) return;

    const updateMeters = () => {
      if (!this?.audioContext || !this?.state.isPlaying) {
        this.animationFrameId = requestAnimationFrame(updateMeters);
        return;
      }

      const allMeteringData: MeteringData[] = [];

      this?.trackNodes.forEach((nodes, trackId) => {
        const data = this?.getTrackMeteringData(trackId, nodes?.analyzer);
        if (data) {
          this?.meteringData.set(trackId, data);
          allMeteringData?.push(data);
        }
      });

      if (this?.masterAnalyzer) {
        const masterData = this?.getMasterMeteringData();
        if (masterData) {
          this?.meteringData.set("master", masterData);
          allMeteringData?.push(masterData);
        }
      }

      if (allMeteringData?.length > 0) {
        this?.emit({ type: "metering-update", data: allMeteringData });
      }

      this.animationFrameId = requestAnimationFrame(updateMeters);
    };

    this.animationFrameId = requestAnimationFrame(updateMeters);
  }

  private getTrackMeteringData(
    trackId: string,
    analyzer: AnalyserNode,
  ): MeteringData | null {
    const bufferLength = analyzer?.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    analyzer?.getFloatTimeDomainData(dataArray);

    let sumSquares = 0;
    let peak = 0;

    for (let i = 0; i < bufferLength; i++) {
      const value = Math.abs(dataArray[i]);
      sumSquares += dataArray[i] * dataArray[i];
      if (value > peak) peak = value;
    }

    const rms = Math.sqrt(sumSquares / bufferLength);
    const dbPeak = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    const dbRms = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

    return {
      trackId,
      left: dbPeak,
      right: dbPeak,
      peakLeft: peak,
      peakRight: peak,
      rmsLeft: dbRms,
      rmsRight: dbRms,
    };
  }

  private getMasterMeteringData(): MeteringData | null {
    if (!this?.masterAnalyzer) return null;
    return this?.getTrackMeteringData("master", this?.masterAnalyzer);
  }

  createTrack(trackId: string): void {
    if (!this?.audioContext || !this?.masterGain) {
      logger?.warn("[AudioWorkletEngine] Not initialized");
      return;
    }

    if (this?.trackNodes.has(trackId)) return;

    const gain = this?.audioContext.createGain();
    const panner = this?.audioContext.createStereoPanner();
    const analyzer = this?.audioContext.createAnalyser();
    analyzer.fftSize = 1024;
    analyzer.smoothingTimeConstant = 0.85;

    gain?.connect(panner);
    panner?.connect(analyzer);
    analyzer?.connect(this?.masterGain);

    this?.trackNodes.set(trackId, {
      gain,
      panner,
      analyzer,
      muted: false,
      solo: false,
      volume: 1,
    });
  }

  removeTrack(trackId: string): void {
    const nodes = this?.trackNodes.get(trackId);
    if (!nodes) return;

    this?.stopTrackSources(trackId);

    nodes?.analyzer.disconnect();
    nodes?.panner.disconnect();
    nodes?.gain.disconnect();

    this?.trackNodes.delete(trackId);
    this?.meteringData.delete(trackId);
  }

  setTrackVolume(trackId: string, volume: number): void {
    const nodes = this?.trackNodes.get(trackId);
    if (!nodes || !this?.audioContext) return;

    // volume is linear 0.0–1.0 from the store (fader position)
    const clampedVolume = Math.max(0, Math.min(1, volume));
    nodes.volume = clampedVolume;

    const hasSolo = Array.from(this?.trackNodes.values()).some((n) => n?.solo);
    const shouldMute = nodes?.muted || (hasSolo && !nodes?.solo);
    if (!shouldMute) {
      nodes?.gain.gain?.setTargetAtTime(
        clampedVolume,
        this?.audioContext.currentTime,
        0.01,
      );
    }
  }

  setTrackPan(trackId: string, pan: number): void {
    const nodes = this?.trackNodes.get(trackId);
    if (!nodes || !this?.audioContext) return;

    nodes?.panner.pan?.setTargetAtTime(pan, this?.audioContext.currentTime, 0.01);
  }

  setTrackMute(trackId: string, muted: boolean): void {
    const nodes = this?.trackNodes.get(trackId);
    if (!nodes || !this?.audioContext) return;

    nodes.muted = muted;
    this?.updateTrackSoloMute();
  }

  setTrackSolo(trackId: string, solo: boolean): void {
    const nodes = this?.trackNodes.get(trackId);
    if (!nodes) return;

    nodes.solo = solo;
    this?.updateTrackSoloMute();
  }

  private updateTrackSoloMute(): void {
    if (!this?.audioContext) return;

    const hasSolo = Array.from(this?.trackNodes.values()).some((n) => n?.solo);

    this?.trackNodes.forEach((nodes, _trackId) => {
      let shouldMute = nodes?.muted;

      if (hasSolo && !nodes?.solo) {
        shouldMute = true;
      }

      const targetGain = shouldMute ? 0 : nodes?.volume;
      nodes?.gain.gain?.setTargetAtTime(
        targetGain,
        this?.audioContext!.currentTime,
        0.01,
      );
    });
  }

  setMasterVolume(volume: number): void {
    if (!this?.masterGain || !this?.audioContext) return;

    // volume is linear 0.0–1.0 from the store
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this?.masterGain.gain?.setTargetAtTime(
      clampedVolume,
      this?.audioContext.currentTime,
      0.01,
    );
  }

  scheduleClip(clip: ScheduledClip): void {
    this?.clips.set(clip?.id, clip);

    if (this?.state.isPlaying) {
      this?.scheduleClipPlayback(clip);
    }
  }

  removeClip(clipId: string): void {
    this?.clips.delete(clipId);
    this?.stopClipSources(clipId);
  }

  private scheduleClipPlayback(clip: ScheduledClip): void {
    if (!this?.audioContext) return;

    const nodes = this?.trackNodes.get(clip?.trackId);
    if (!nodes) return;

    // Guard: skip clips with no audio data
    if (!clip?.durationSamples || clip?.durationSamples <= 0) return;

    const currentSample = this?.state.currentSample;
    const clipEndSample = clip?.startSample + clip?.durationSamples;

    if (currentSample >= clipEndSample) return;
    if (
      currentSample + this?.config.sampleRate * this?.scheduleAheadTime <
      clip?.startSample
    )
      return;

    const startTimeOffset = Math.max(
      0,
      (clip?.startSample - currentSample) / this?.config.sampleRate,
    );
    const bufferOffset =
      currentSample > clip?.startSample
        ? (currentSample - clip?.startSample + clip?.offsetSamples) /
          this?.config.sampleRate
        : clip?.offsetSamples / this?.config.sampleRate;

    const remainingDuration =
      (clipEndSample - Math.max(currentSample, clip?.startSample)) /
      this?.config.sampleRate;

    if (remainingDuration <= 0) return;

    const source = this?.audioContext.createBufferSource();
    source.buffer = clip?.buffer;

    const clipGain = this?.audioContext.createGain();
    clipGain.gain.value = clip?.gain;

    if (clip?.fadeInSamples > 0 && startTimeOffset === 0) {
      const fadeInDuration = clip?.fadeInSamples / this?.config.sampleRate;
      clipGain?.gain.setValueAtTime(
        0,
        this?.audioContext.currentTime + startTimeOffset,
      );
      clipGain?.gain.linearRampToValueAtTime(
        clip?.gain,
        this?.audioContext.currentTime + startTimeOffset + fadeInDuration,
      );
    }

    if (clip?.fadeOutSamples > 0) {
      const fadeOutStart =
        remainingDuration - clip?.fadeOutSamples / this?.config.sampleRate;
      if (fadeOutStart > 0) {
        clipGain?.gain.setValueAtTime(
          clip?.gain,
          this?.audioContext.currentTime + startTimeOffset + fadeOutStart,
        );
        clipGain?.gain.linearRampToValueAtTime(
          0,
          this?.audioContext.currentTime + startTimeOffset + remainingDuration,
        );
      }
    }

    source?.connect(clipGain);
    clipGain?.connect(nodes?.gain);

    source?.start(
      this?.audioContext.currentTime + startTimeOffset,
      bufferOffset,
      remainingDuration,
    );

    const sources = this?.scheduledSources.get(clip?.id) || [];
    sources?.push(source);
    this?.scheduledSources.set(clip?.id, sources);

    source.onended = () => {
      const currentSources = this?.scheduledSources.get(clip?.id);
      if (currentSources) {
        const index = currentSources?.indexOf(source);
        if (index > -1) {
          currentSources?.splice(index, 1);
        }
      }
    };
  }

  private stopClipSources(clipId: string): void {
    const sources = this?.scheduledSources.get(clipId);
    if (!sources) return;

    sources?.forEach((source) => {
      try {
        source?.stop();
        source?.disconnect();
      } catch (e) {}
    });

    this?.scheduledSources.delete(clipId);
  }

  private stopTrackSources(trackId: string): void {
    this?.clips.forEach((clip, clipId) => {
      if (clip?.trackId === trackId) {
        this?.stopClipSources(clipId);
      }
    });
  }

  private stopAllSources(): void {
    this?.scheduledSources.forEach((sources, _clipId) => {
      sources?.forEach((source) => {
        try {
          source?.stop();
          source?.disconnect();
        } catch (e) {}
      });
    });
    this?.scheduledSources.clear();
  }

  play(): void {
    if (!this?.audioContext) {
      logger?.warn("[AudioWorkletEngine] Not initialized");
      return;
    }

    const doPlay = () => {
      this.state.isPlaying = true;
      this.lastScheduleTime = this?.audioContext!.currentTime;

      if (this?.workletNode && this?.workletReady) {
        this?.workletNode.port?.postMessage({ type: "play" });
      }

      this?.scheduleAllClips();
      this?.startSchedulerLoop();
      this?.emit({ type: "state-change", data: { isPlaying: true } });
    };

    if (this?.audioContext.state === "suspended") {
      this?.audioContext
        .resume()
        .then(doPlay)
        .catch(() => doPlay());
    } else {
      doPlay();
    }
  }

  pause(): void {
    this.state.isPlaying = false;
    this?.stopSchedulerLoop();
    this?.stopAllSources();

    if (this?.workletNode && this?.workletReady) {
      this?.workletNode.port?.postMessage({ type: "pause" });
    }

    this?.emit({ type: "state-change", data: { isPlaying: false } });
  }

  stop(): void {
    this?.pause();
    this.state.currentSample = 0;
    this.state.currentTime = 0;

    if (this?.workletNode && this?.workletReady) {
      this?.workletNode.port?.postMessage({ type: "stop" });
    }

    this?.emit({ type: "position-update", data: { sample: 0, time: 0 } });
  }

  setPosition(sample: number): void {
    const wasPlaying = this?.state.isPlaying;

    if (wasPlaying) {
      this?.stopAllSources();
    }

    this.state.currentSample = Math.max(0, sample);
    this.state.currentTime = this?.state.currentSample / this?.config.sampleRate;

    if (this?.workletNode && this?.workletReady) {
      this?.workletNode.port?.postMessage({
        type: "seek",
        data: { sample: this.state.currentSample },
      });
    }

    if (wasPlaying) {
      this?.scheduleAllClips();
    }

    this?.emit({
      type: "position-update",
      data: {
        sample: this.state.currentSample,
        time: this.state.currentTime,
      },
    });
  }

  setLoop(enabled: boolean, startSample?: number, endSample?: number): void {
    this.state.isLooping = enabled;
    if (startSample !== undefined) this.state.loopStart = startSample;
    if (endSample !== undefined) this.state.loopEnd = endSample;

    if (this?.workletNode && this?.workletReady) {
      this?.workletNode.port?.postMessage({
        type: "setLoop",
        data: {
          enabled,
          start: this.state.loopStart,
          end: this.state.loopEnd,
        },
      });
    }
  }

  private startSchedulerLoop(): void {
    const scheduler = () => {
      if (!this?.state.isPlaying || !this?.audioContext) return;

      if (!this?.workletReady) {
        const now = this?.audioContext.currentTime;
        const elapsed = now - this?.lastScheduleTime;
        this.lastScheduleTime = now;

        const samplesElapsed = Math.round(elapsed * this?.config.sampleRate);
        this.state.currentSample += samplesElapsed;
        this.state.currentTime =
          this?.state.currentSample / this?.config.sampleRate;

        if (
          this?.state.isLooping &&
          this?.state.currentSample >= this?.state.loopEnd
        ) {
          this?.setPosition(this?.state.loopStart);
          return;
        }

        this?.emit({
          type: "position-update",
          data: {
            sample: this.state.currentSample,
            time: this.state.currentTime,
          },
        });
      }

      this?.clips.forEach((clip) => {
        const clipStart = clip?.startSample;
        const lookAheadSamples =
          this?.config.sampleRate * this?.scheduleAheadTime;

        if (
          clipStart >= this?.state.currentSample &&
          clipStart < this?.state.currentSample + lookAheadSamples
        ) {
          if (
            !this?.scheduledSources.has(clip?.id) ||
            this?.scheduledSources.get(clip?.id)!.length === 0
          ) {
            try {
              this?.scheduleClipPlayback(clip);
            } catch (e) {
              logger?.warn(
                `[AudioWorkletEngine] Scheduler failed for clip ${clip?.id}:`,
                e,
              );
            }
          }
        }
      });

      this.schedulerTimeoutId = setTimeout(scheduler, this?.lookAhead);
    };

    scheduler();
  }

  private stopSchedulerLoop(): void {
    if (this?.schedulerTimeoutId) {
      clearTimeout(this?.schedulerTimeoutId);
      this.schedulerTimeoutId = null;
    }
  }

  private scheduleAllClips(): void {
    this?.clips.forEach((clip) => {
      try {
        this?.scheduleClipPlayback(clip);
      } catch (e) {
        logger?.warn(
          `[AudioWorkletEngine] Failed to schedule clip ${clip?.id}:`,
          e,
        );
      }
    });
  }

  getState(): PlaybackState {
    return { ...this?.state };
  }

  getSampleRate(): number {
    return this?.config.sampleRate;
  }

  getLatency(): number {
    if (!this?.audioContext) return 0;
    return (
      this?.audioContext.baseLatency + (this?.audioContext.outputLatency || 0)
    );
  }

  getMeteringData(trackId: string): MeteringData | undefined {
    return this?.meteringData.get(trackId);
  }

  getAllMeteringData(): Map<string, MeteringData> {
    return new Map(this?.meteringData);
  }

  async loadAudioFile(url: string): Promise<AudioBuffer> {
    if (!this?.audioContext) {
      throw new Error("AudioContext not initialized");
    }

    // Normalize the URL to use proper API endpoint for audio files
    let normalizedUrl = url;
    if (!url?.startsWith("http") && !url?.startsWith("/api/")) {
      // Handle relative paths like "uploads/..." or "/uploads/..."
      const cleanPath = url?.replace(/^\//, "");
      normalizedUrl = `/api/marketplace/audio/${cleanPath}`;
    }

    const response = await fetch(normalizedUrl);
    if (!response?.ok) {
      throw new Error(
        `Failed to fetch audio "${normalizedUrl}": HTTP ${response?.status} ${response?.statusText}`,
      );
    }
    const arrayBuffer = await response?.arrayBuffer();
    return await this?.audioContext.decodeAudioData(arrayBuffer);
  }

  async loadAudioBlob(blob: Blob): Promise<AudioBuffer> {
    if (!this?.audioContext) {
      throw new Error("AudioContext not initialized");
    }

    const arrayBuffer = await blob?.arrayBuffer();
    return await this?.audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * Build a multi-resolution min/max peak cache from a decoded AudioBuffer.
   * Each level stores interleaved [min, max] pairs at a different samples-per-peak
   * resolution (64 → 256 → 1024 → 4096).  The canvas renderer picks the level
   * whose samplesPerPeak is closest (but ≥) to the current samples-per-pixel
   * ratio so transients are never discarded.
   */
  static readonly PEAK_RESOLUTIONS = [64, 256, 1024, 4096];

  extractPeakCache(buffer: AudioBuffer): WaveformPeakCache {
    const ch0 = buffer?.getChannelData(0);
    const ch1 = buffer?.numberOfChannels > 1 ? buffer?.getChannelData(1) : null;
    const sampleRate = buffer?.sampleRate;
    const totalSamples = ch0?.length;

    const levels: WaveformPeakLevel[] = AudioWorkletEngine.PEAK_RESOLUTIONS.map(
      (spp) => {
        const count = Math.ceil(totalSamples / spp);
        const peaks = new Float32Array(count * 2);

        for (let i = 0; i < count; i++) {
          const start = i * spp;
          const end = Math.min(start + spp, totalSamples);
          let minVal = 0;
          let maxVal = 0;

          for (let j = start; j < end; j++) {
            const v = ch1 ? (ch0[j] + ch1[j]) * 0.5 : ch0[j];
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
          }

          peaks[i * 2] = minVal;
          peaks[i * 2 + 1] = maxVal;
        }

        return { samplesPerPeak: spp, peaks, count };
      },
    );

    return { sampleRate, totalSamples, levels };
  }

  /** @deprecated Use extractPeakCache for accurate min/max waveform data. */
  extractPeakData(
    buffer: AudioBuffer,
    samplesPerPeak: number = 256,
  ): Float32Array {
    const channelData = buffer?.getChannelData(0);
    const peaks = Math.ceil(channelData?.length / samplesPerPeak);
    const peakData = new Float32Array(peaks);
    for (let i = 0; i < peaks; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, channelData?.length);
      let peak = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > peak) peak = abs;
      }
      peakData[i] = peak;
    }
    return peakData;
  }

  on(listener: (event: AudioEngineEvent) => void): () => void {
    this?.listeners.add(listener);
    return () => this?.listeners.delete(listener);
  }

  private emit(event: AudioEngineEvent): void {
    this?.listeners.forEach((listener) => listener(event));
  }

  dispose(): void {
    this?.stopAllSources();

    if (this?.animationFrameId) {
      cancelAnimationFrame(this?.animationFrameId);
    }

    this?.trackNodes.forEach((nodes, _trackId) => {
      nodes?.analyzer.disconnect();
      nodes?.panner.disconnect();
      nodes?.gain.disconnect();
    });
    this?.trackNodes.clear();

    if (this?.masterAnalyzer) {
      this?.masterAnalyzer.disconnect();
    }
    if (this?.masterGain) {
      this?.masterGain.disconnect();
    }

    if (this?.audioContext) {
      this?.audioContext.close();
    }

    this?.clips.clear();
    this?.scheduledSources.clear();
    this?.meteringData.clear();
    this?.listeners.clear();
  }
}

export const audioWorkletEngine = new AudioWorkletEngine();
