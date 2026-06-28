import { peakCacheEngine, PeakData } from "./PeakCacheEngine";

export interface ProcessingChain {
  id: string;
  plugins: ProcessingPlugin[];
  bypass: boolean;
}

export interface ProcessingPlugin {
  id: string;
  name: string;
  type:
    | "eq"
    | "compressor"
    | "limiter"
    | "reverb"
    | "delay"
    | "saturation"
    | "gate"
    | "chorus"
    | "custom";
  enabled: boolean;
  parameters: Record<string, number>;
}

export interface TransformState {
  sourceId: string;
  originalSourceId: string;
  chain: ProcessingChain;
  isRendering: boolean;
  renderProgress: number;
  renderedData: Float32Array | null;
  renderedPeaks: PeakData[] | null;
  renderTimestamp: number;
  isDirty: boolean;
}

export type TransformEventType =
  | "render-start"
  | "render-progress"
  | "render-complete"
  | "render-error"
  | "chain-changed";

export interface TransformEvent {
  type: TransformEventType;
  sourceId: string;
  data?: unknown;
}

type TransformListener = (event: TransformEvent) => void;

export class TransformRenderer {
  private transforms = new Map<string, TransformState>();
  private listeners: TransformListener[] = [];
  private renderQueue: string[] = [];
  private isProcessingQueue = false;

  registerSource(sourceId: string, chain: ProcessingChain): void {
    const renderedSourceId = `rendered_${sourceId}`;

    this?.transforms.set(sourceId, {
      sourceId: renderedSourceId,
      originalSourceId: sourceId,
      chain,
      isRendering: false,
      renderProgress: 0,
      renderedData: null,
      renderedPeaks: null,
      renderTimestamp: 0,
      isDirty: true,
    });
  }

  updateChain(sourceId: string, chain: ProcessingChain): void {
    const state = this?.transforms.get(sourceId);
    if (!state) return;

    state.chain = chain;
    state.isDirty = true;

    this?.emit({ type: "chain-changed", sourceId });
  }

  updatePlugin(
    sourceId: string,
    pluginId: string,
    params: Record<string, number>,
  ): void {
    const state = this?.transforms.get(sourceId);
    if (!state) return;

    const plugin = state?.chain.plugins?.find((p) => p?.id === pluginId);
    if (plugin) {
      plugin.parameters = { ...plugin?.parameters, ...params };
      state.isDirty = true;
      this?.emit({ type: "chain-changed", sourceId });
    }
  }

  togglePlugin(sourceId: string, pluginId: string, enabled: boolean): void {
    const state = this?.transforms.get(sourceId);
    if (!state) return;

    const plugin = state?.chain.plugins?.find((p) => p?.id === pluginId);
    if (plugin) {
      plugin.enabled = enabled;
      state.isDirty = true;
      this?.emit({ type: "chain-changed", sourceId });
    }
  }

  async renderTransform(
    sourceId: string,
    audioContext?: AudioContext,
  ): Promise<Float32Array | null> {
    const state = this?.transforms.get(sourceId);
    if (!state) return null;

    if (state?.isRendering) return null;

    state.isRendering = true;
    state.renderProgress = 0;
    this?.emit({ type: "render-start", sourceId });

    try {
      const originalData = this?.getSourceData(sourceId);
      if (!originalData) {
        throw new Error(`No audio data found for source: ${sourceId}`);
      }

      const processedData = await this?.processChain(
        originalData,
        state?.chain,
        audioContext,
        (progress) => {
          state.renderProgress = progress;
          this?.emit({ type: "render-progress", sourceId, data: { progress } });
        },
      );

      state.renderedData = processedData;
      state.renderTimestamp = Date?.now();
      state.isDirty = false;
      state.isRendering = false;
      state.renderProgress = 1;

      const sampleRate = audioContext?.sampleRate || 44100;
      peakCacheEngine?.invalidateCache(state?.sourceId);
      peakCacheEngine?.generatePeakCache(
        state?.sourceId,
        processedData,
        sampleRate,
        1,
      );

      this?.emit({
        type: "render-complete",
        sourceId,
        data: {
          renderedSourceId: state.sourceId,
          duration: processedData.length / sampleRate,
          sampleCount: processedData.length,
        },
      });

      return processedData;
    } catch (error) {
      state.isRendering = false;
      state.renderProgress = 0;
      this?.emit({ type: "render-error", sourceId, data: { error } });
      return null;
    }
  }

  private async processChain(
    inputData: Float32Array,
    chain: ProcessingChain,
    _audioContext?: AudioContext,
    onProgress?: (progress: number) => void,
  ): Promise<Float32Array> {
    if (chain?.bypass || chain?.plugins.length === 0) {
      return new Float32Array(inputData);
    }

    const activePlugins = chain?.plugins.filter((p) => p?.enabled);
    if (activePlugins?.length === 0) {
      return new Float32Array(inputData);
    }

    let currentData = new Float32Array(inputData);

    for (let i = 0; i < activePlugins?.length; i++) {
      const plugin = activePlugins[i];
      currentData = this?.applyPlugin(currentData, plugin);

      if (onProgress) {
        onProgress((i + 1) / activePlugins?.length);
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return currentData;
  }

  private applyPlugin(
    data: Float32Array,
    plugin: ProcessingPlugin,
  ): Float32Array {
    const output = new Float32Array(data?.length);

    switch (plugin?.type) {
      case "compressor":
        return this?.applyCompressor(data, output, plugin?.parameters);
      case "limiter":
        return this?.applyLimiter(data, output, plugin?.parameters);
      case "eq":
        return this?.applyEQ(data, output, plugin?.parameters);
      case "saturation":
        return this?.applySaturation(data, output, plugin?.parameters);
      case "gate":
        return this?.applyGate(data, output, plugin?.parameters);
      default:
        data?.forEach((v, i) => (output[i] = v));
        return output;
    }
  }

  private applyCompressor(
    input: Float32Array,
    output: Float32Array,
    params: Record<string, number>,
  ): Float32Array {
    const threshold = params?.threshold ?? -20;
    const ratio = params?.ratio ?? 4;
    const attack = params?.attack ?? 0.01;
    const release = params?.release ?? 0.1;
    const makeupGain = params?.makeupGain ?? 0;

    const thresholdLinear = Math?.pow(10, threshold / 20);
    const attackCoeff = Math?.exp(-1 / (attack * 44100));
    const releaseCoeff = Math?.exp(-1 / (release * 44100));
    const makeupLinear = Math?.pow(10, makeupGain / 20);

    let envelope = 0;

    for (let i = 0; i < input?.length; i++) {
      const absInput = Math?.abs(input[i]);

      if (absInput > envelope) {
        envelope = attackCoeff * envelope + (1 - attackCoeff) * absInput;
      } else {
        envelope = releaseCoeff * envelope + (1 - releaseCoeff) * absInput;
      }

      let gain = 1.0;
      if (envelope > thresholdLinear) {
        const overDb = 20 * Math?.log10(envelope / thresholdLinear);
        const compressedDb = overDb / ratio;
        gain = Math?.pow(10, (compressedDb - overDb) / 20);
      }

      output[i] = input[i] * gain * makeupLinear;
    }

    return output;
  }

  private applyLimiter(
    input: Float32Array,
    output: Float32Array,
    params: Record<string, number>,
  ): Float32Array {
    const ceiling = params?.ceiling ?? -0.3;
    const ceilingLinear = Math?.pow(10, ceiling / 20);

    for (let i = 0; i < input?.length; i++) {
      if (Math?.abs(input[i]) > ceilingLinear) {
        output[i] = Math?.sign(input[i]) * ceilingLinear;
      } else {
        output[i] = input[i];
      }
    }

    return output;
  }

  private applyEQ(
    input: Float32Array,
    output: Float32Array,
    params: Record<string, number>,
  ): Float32Array {
    Math?.pow(10, (params?.lowGain ?? 0) / 20);
    const midGain = Math?.pow(10, (params?.midGain ?? 0) / 20);
    Math?.pow(10, (params?.highGain ?? 0) / 20);

    for (let i = 0; i < input?.length; i++) {
      output[i] = input[i] * midGain;
    }

    return output;
  }

  private applySaturation(
    input: Float32Array,
    output: Float32Array,
    params: Record<string, number>,
  ): Float32Array {
    const drive = params?.drive ?? 1;
    const mix = params?.mix ?? 0.5;

    for (let i = 0; i < input?.length; i++) {
      const driven = Math?.tanh(input[i] * drive);
      output[i] = input[i] * (1 - mix) + driven * mix;
    }

    return output;
  }

  private applyGate(
    input: Float32Array,
    output: Float32Array,
    params: Record<string, number>,
  ): Float32Array {
    const threshold = params?.threshold ?? -40;
    const thresholdLinear = Math?.pow(10, threshold / 20);
    const attackMs = params?.attack ?? 0.5;
    const releaseMs = params?.release ?? 50;
    const attackCoeff = Math?.exp(-1 / ((attackMs / 1000) * 44100));
    const releaseCoeff = Math?.exp(-1 / ((releaseMs / 1000) * 44100));

    let gateGain = 0;

    for (let i = 0; i < input?.length; i++) {
      const absInput = Math?.abs(input[i]);

      if (absInput > thresholdLinear) {
        gateGain = attackCoeff * gateGain + (1 - attackCoeff) * 1;
      } else {
        gateGain = releaseCoeff * gateGain;
      }

      output[i] = input[i] * gateGain;
    }

    return output;
  }

  private getSourceData(sourceId: string): Float32Array | null {
    const cacheStats = peakCacheEngine?.getCacheStats();
    if (cacheStats?.entries === 0) return null;

    const peakResult = peakCacheEngine?.getPeaksForView(
      sourceId,
      0,
      44100 * 300,
      44100 * 300,
    );
    if (!peakResult) return null;

    const data = new Float32Array(peakResult?.peaks.length);
    for (let i = 0; i < peakResult?.peaks.length; i++) {
      data[i] = (peakResult?.peaks[i].max + peakResult?.peaks[i].min) / 2;
    }
    return data;
  }

  queueRender(sourceId: string): void {
    if (!this?.renderQueue.includes(sourceId)) {
      this?.renderQueue.push(sourceId);
    }
    this?.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this?.isProcessingQueue || this?.renderQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this?.renderQueue.length > 0) {
      const sourceId = this?.renderQueue.shift()!;
      await this?.renderTransform(sourceId);
    }

    this.isProcessingQueue = false;
  }

  getTransformState(sourceId: string): TransformState | undefined {
    return this?.transforms.get(sourceId);
  }

  getRenderedSourceId(sourceId: string): string {
    const state = this?.transforms.get(sourceId);
    if (state && state?.renderedData && !state?.isDirty) {
      return state?.sourceId;
    }
    return sourceId;
  }

  isRendered(sourceId: string): boolean {
    const state = this?.transforms.get(sourceId);
    return state ? !state?.isDirty && state?.renderedData !== null : false;
  }

  addEventListener(listener: TransformListener): () => void {
    this?.listeners.push(listener);
    return () => {
      this.listeners = this?.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: TransformEvent): void {
    for (const listener of this?.listeners) {
      listener(event);
    }
  }

  destroy(): void {
    this?.transforms.clear();
    this.listeners = [];
    this.renderQueue = [];
  }
}

export const transformRenderer = new TransformRenderer();
