import { randomBytes } from 'crypto';
import { db } from '../db';
import { pluginCatalog, pluginInstances, pluginPresets } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

import { logger } from '../logger.js';
import { EXPANDED_INSTRUMENTS, EXPANDED_EFFECTS, ALL_PLUGINS } from './plugins/index';
import { 
  getEffectProcessor, 
  getInstrumentSynthesizer, 
  getProcessorInfo,
  type DSPProcessor,
  type SynthesizerEngine 
} from './dsp/index';

export type {
  PluginCategory,
  InstrumentType,
  EffectType,
  PluginParameter,
  PluginDefinition,
  OscillatorConfig,
  EnvelopeConfig,
} from './plugins/definitions.js';

export interface PluginInstance {
  id: string;
  pluginId: string;
  projectId: string;
  trackId?: string;
  chainPosition: number;
  parameters: Record<string, number | boolean | string>;
  bypassed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginPreset {
  id: string;
  userId: string;
  pluginId: string;
  name: string;
  category?: string;
  parameters: Record<string, number | boolean | string>;
  isDefault: boolean;
  isPublic: boolean;
  createdAt: Date;
}

export interface AudioBuffer {
  sampleRate: number;
  channels: number;
  length: number;
  data: Float32Array[];
}

export interface RenderContext {
  sampleRate: number;
  blockSize: number;
  currentTime: number;
  tempo: number;
}

class PluginHostService {
  private instanceCache: Map<string, PluginInstance> = new Map();
  private sandboxContexts: Map<string, RenderContext> = new Map();

  getAllPlugins(): PluginDefinition[] {
    return ALL_PLUGINS;
  }

  getPluginsByCategory(category: PluginCategory): PluginDefinition[] {
    if (category === 'instrument') {
      return EXPANDED_INSTRUMENTS;
    }
    return EXPANDED_EFFECTS;
  }

  getPluginById(pluginId: string): PluginDefinition | undefined {
    return this.getAllPlugins().find(p => p.id === pluginId || p.slug === pluginId);
  }

  async ensurePluginCatalogSeeded(): Promise<void> {
    try {
      const { storage } = await import('../storage');
      await storage.seedPluginCatalog();
    } catch (error) {
      logger.warn({ err: error }, 'Error seeding plugin catalog:');
    }
  }

  async createInstance(
    pluginId: string,
    projectId: string,
    trackId: string | undefined,
    chainPosition: number,
    initialParams?: Record<string, number | boolean | string>
  ): Promise<PluginInstance> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const params = { ...plugin.defaultPreset, ...initialParams };
    
    const catalogEntry = await db.query.pluginCatalog.findFirst({
      where: eq(pluginCatalog.slug, plugin.slug),
    });

    if (!catalogEntry) {
      await this.ensurePluginCatalogSeeded();
    }

    const [instance] = await db.insert(pluginInstances).values({
      projectId,
      trackId: trackId || null,
      pluginId,
      position: chainPosition,
      parameters: params,
      isBypassed: false,
    }).returning();

    const pluginInstance: PluginInstance = {
      id: instance.id,
      pluginId,
      projectId,
      trackId: trackId || undefined,
      chainPosition,
      parameters: params,
      bypassed: false,
      createdAt: instance.createdAt || new Date(),
      updatedAt: instance.createdAt || new Date(),
    };

    this.instanceCache.set(instance.id, pluginInstance);
    this.initializeSandbox(instance.id);

    return pluginInstance;
  }

  async getInstance(instanceId: string): Promise<PluginInstance | undefined> {
    if (this.instanceCache.has(instanceId)) {
      return this.instanceCache.get(instanceId);
    }

    const instance = await db.query.pluginInstances.findFirst({
      where: eq(pluginInstances.id, instanceId),
    });

    if (!instance) {
      return undefined;
    }

    const pluginInstance: PluginInstance = {
      id: instance.id,
      pluginId: instance.pluginId,
      projectId: instance.projectId,
      trackId: instance.trackId || undefined,
      chainPosition: instance.position || 0,
      parameters: (instance.parameters as Record<string, number | boolean | string>) || {},
      bypassed: instance.isBypassed || false,
      createdAt: instance.createdAt || new Date(),
      updatedAt: instance.createdAt || new Date(),
    };

    this.instanceCache.set(instanceId, pluginInstance);
    return pluginInstance;
  }

  async updateInstanceParameters(
    instanceId: string,
    parameters: Partial<Record<string, number | boolean | string>>
  ): Promise<PluginInstance> {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Plugin instance not found: ${instanceId}`);
    }

    const updatedParams = { ...instance.parameters, ...parameters };
    
    await db.update(pluginInstances)
      .set({ 
        parameters: updatedParams,
      })
      .where(eq(pluginInstances.id, instanceId));

    instance.parameters = updatedParams;
    instance.updatedAt = new Date();
    this.instanceCache.set(instanceId, instance);

    return instance;
  }

  async setInstanceBypassed(instanceId: string, bypassed: boolean): Promise<void> {
    await db.update(pluginInstances)
      .set({ isBypassed: bypassed })
      .where(eq(pluginInstances.id, instanceId));

    const cached = this.instanceCache.get(instanceId);
    if (cached) {
      cached.bypassed = bypassed;
    }
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await db.delete(pluginInstances)
      .where(eq(pluginInstances.id, instanceId));

    this.instanceCache.delete(instanceId);
    this.sandboxContexts.delete(instanceId);
  }

  async getProjectInstances(projectId: string): Promise<PluginInstance[]> {
    const instances = await db.query.pluginInstances.findMany({
      where: eq(pluginInstances.projectId, projectId),
    });

    return instances.map(instance => ({
      id: instance.id,
      pluginId: instance.pluginId,
      projectId: instance.projectId,
      trackId: instance.trackId || undefined,
      chainPosition: instance.position || 0,
      parameters: (instance.parameters as Record<string, number | boolean | string>) || {},
      bypassed: instance.isBypassed || false,
      createdAt: instance.createdAt || new Date(),
      updatedAt: instance.createdAt || new Date(),
    }));
  }

  async getTrackInstances(trackId: string): Promise<PluginInstance[]> {
    const instances = await db.query.pluginInstances.findMany({
      where: eq(pluginInstances.trackId, trackId),
    });

    const result: PluginInstance[] = instances.map(instance => ({
      id: instance.id,
      pluginId: instance.pluginId,
      projectId: instance.projectId,
      trackId: instance.trackId || undefined,
      chainPosition: instance.position || 0,
      parameters: (instance.parameters as Record<string, number | boolean | string>) || {},
      bypassed: instance.isBypassed || false,
      createdAt: instance.createdAt || new Date(),
      updatedAt: instance.createdAt || new Date(),
    }));

    return result.sort((a, b) => a.chainPosition - b.chainPosition);
  }

  private initializeSandbox(instanceId: string): void {
    const context: RenderContext = {
      sampleRate: 48000,
      blockSize: 512,
      currentTime: 0,
      tempo: 120,
    };
    this.sandboxContexts.set(instanceId, context);
  }

  async renderInstrument(
    instanceId: string,
    notes: Array<{ note: number; velocity: number; duration: number; startTime: number }>,
    durationSec: number,
    sampleRate: number = 48000
  ): Promise<{ samples: number[][]; sampleRate: number }> {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Plugin instance not found: ${instanceId}`);
    }

    const plugin = this.getPluginById(instance.pluginId);
    if (!plugin || plugin.category !== 'instrument') {
      throw new Error('Invalid instrument plugin');
    }

    const numSamples = Math.ceil(durationSec * sampleRate);
    const leftChannel = new Float32Array(numSamples);
    const rightChannel = new Float32Array(numSamples);

    for (const note of notes) {
      this.synthesizeNote(
        leftChannel,
        rightChannel,
        note,
        plugin,
        instance.parameters,
        sampleRate
      );
    }

    const volume = (instance.parameters.volume as number) || 0.8;
    for (let i = 0; i < numSamples; i++) {
      leftChannel[i] *= volume;
      rightChannel[i] *= volume;
    }

    return {
      samples: [Array.from(leftChannel), Array.from(rightChannel)],
      sampleRate,
    };
  }

  private synthesizeNote(
    left: Float32Array,
    right: Float32Array,
    note: { note: number; velocity: number; duration: number; startTime: number },
    plugin: PluginDefinition,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const frequency = 440 * Math.pow(2, (note.note - 69) / 12);
    const startSample = Math.floor(note.startTime * sampleRate);
    const envelope = plugin.envelope || { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 };
    
    const attackSamples = Math.floor((params.attack as number || envelope.attack) * sampleRate);
    const decaySamples = Math.floor(envelope.decay * sampleRate);
    const releaseSamples = Math.floor((params.release as number || envelope.release) * sampleRate);
    const noteDurationSamples = Math.floor(note.duration * sampleRate);
    const totalSamples = noteDurationSamples + releaseSamples;
    
    const velocityGain = note.velocity / 127;

    for (let i = 0; i < totalSamples && startSample + i < left.length; i++) {
      let envValue = 1;
      if (i < attackSamples) {
        envValue = i / attackSamples;
      } else if (i < attackSamples + decaySamples) {
        const decayProgress = (i - attackSamples) / decaySamples;
        envValue = 1 - decayProgress * (1 - envelope.sustain);
      } else if (i < noteDurationSamples) {
        envValue = envelope.sustain;
      } else {
        const releaseProgress = (i - noteDurationSamples) / releaseSamples;
        envValue = envelope.sustain * (1 - releaseProgress);
      }

      let sample = 0;
      const oscillators = plugin.oscillators || [{ type: 'sine' as const, detune: 0, gain: 1 }];
      
      for (const osc of oscillators) {
        const detunedFreq = frequency * Math.pow(2, osc.detune / 1200);
        const phase = (2 * Math.PI * detunedFreq * (startSample + i)) / sampleRate;
        
        let oscSample = 0;
        switch (osc.type) {
          case 'sine':
            oscSample = Math.sin(phase);
            break;
          case 'square':
            oscSample = Math.sign(Math.sin(phase));
            break;
          case 'sawtooth':
            oscSample = 2 * ((phase / (2 * Math.PI)) % 1) - 1;
            break;
          case 'triangle':
            oscSample = 2 * Math.abs(2 * ((phase / (2 * Math.PI)) % 1) - 1) - 1;
            break;
          case 'noise':
            oscSample = Math.random() * 2 - 1;
            break;
        }
        sample += oscSample * osc.gain;
      }

      const finalSample = sample * envValue * velocityGain * 0.3;
      const idx = startSample + i;
      if (idx >= 0 && idx < left.length) {
        left[idx] += finalSample;
        right[idx] += finalSample;
      }
    }
  }

  private readonly PLUGIN_PROCESSING_TIMEOUT_MS = 30000;
  private readonly MAX_AUDIO_BUFFER_SIZE = 10 * 1024 * 1024;

  private async withPluginTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    pluginId: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Plugin ${pluginId} processing timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  private validateBufferSize(samples: number[][] | Float32Array[]): void {
    const totalSize = samples.reduce((sum, channel) => sum + channel.length * 4, 0);
    if (totalSize > this.MAX_AUDIO_BUFFER_SIZE) {
      throw new Error(`Audio buffer exceeds maximum allowed size (${this.MAX_AUDIO_BUFFER_SIZE} bytes)`);
    }
  }

  async processEffect(
    instanceId: string,
    inputBuffer: { samples: number[][]; sampleRate: number }
  ): Promise<{ samples: number[][]; sampleRate: number }> {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Plugin instance not found: ${instanceId}`);
    }

    if (instance.bypassed) {
      return inputBuffer;
    }

    const plugin = this.getPluginById(instance.pluginId);
    if (!plugin || plugin.category !== 'effect') {
      throw new Error('Invalid effect plugin');
    }

    this.validateBufferSize(inputBuffer.samples);

    const processInternal = async (): Promise<{ samples: number[][]; sampleRate: number }> => {
      const left = new Float32Array(inputBuffer.samples[0]);
      const right = new Float32Array(inputBuffer.samples[1] || inputBuffer.samples[0]);
      const params = instance.parameters;

      try {
        const processor = getEffectProcessor(instance.pluginId);
        if (processor) {
          const result = processor.process(
            { samples: [left, right], sampleRate: inputBuffer.sampleRate, channels: 2 },
            params,
            { sampleRate: inputBuffer.sampleRate, tempo: 120 }
          );
          return {
            samples: [Array.from(result.samples[0]), Array.from(result.samples[1])],
            sampleRate: result.sampleRate,
          };
        }

        switch (plugin.type) {
          case 'reverb':
            this.applyReverb(left, right, params, inputBuffer.sampleRate);
            break;
          case 'delay':
            this.applyDelay(left, right, params, inputBuffer.sampleRate);
            break;
          case 'chorus':
            this.applyChorus(left, right, params, inputBuffer.sampleRate);
            break;
          case 'compressor':
            this.applyCompressor(left, right, params, inputBuffer.sampleRate);
            break;
          case 'eq':
            this.applyEQ(left, right, params, inputBuffer.sampleRate);
            break;
          case 'limiter':
            this.applyLimiter(left, right, params, inputBuffer.sampleRate);
            break;
          case 'gate':
            this.applyGate(left, right, params, inputBuffer.sampleRate);
            break;
          case 'distortion':
            this.applyDistortion(left, right, params, inputBuffer.sampleRate);
            break;
          case 'phaser':
            this.applyPhaser(left, right, params, inputBuffer.sampleRate);
            break;
          case 'flanger':
            this.applyFlanger(left, right, params, inputBuffer.sampleRate);
            break;
        }

        return {
          samples: [Array.from(left), Array.from(right)],
          sampleRate: inputBuffer.sampleRate,
        };
      } catch (error: unknown) {
        logger.warn({ err: error }, `Plugin ${instance.pluginId} processing error:`);
        return inputBuffer;
      }
    };

    return this.withPluginTimeout(
      processInternal(),
      this.PLUGIN_PROCESSING_TIMEOUT_MS,
      instance.pluginId
    );
  }

  async processEffectAdvanced(
    pluginId: string,
    inputBuffer: { samples: Float32Array[]; sampleRate: number; channels: number },
    params: Record<string, number | boolean | string>,
    context: { sampleRate: number; tempo: number }
  ): Promise<{ samples: Float32Array[]; sampleRate: number; channels: number }> {
    const processor = getEffectProcessor(pluginId);
    if (!processor) {
      throw new Error(`No advanced DSP processor found for plugin: ${pluginId}`);
    }
    return processor.process(inputBuffer, params, context);
  }

  async renderInstrumentAdvanced(
    pluginId: string,
    notes: Array<{ frequency: number; velocity: number; durationMs: number }>,
    context: { sampleRate: number; tempo: number }
  ): Promise<{ samples: Float32Array[]; sampleRate: number; channels: number }> {
    const synth = getInstrumentSynthesizer(pluginId);
    if (!synth) {
      throw new Error(`No synthesizer found for plugin: ${pluginId}`);
    }
    
    const totalDuration = notes.reduce((max, n) => Math.max(max, n.durationMs), 0) + 1000;
    const numSamples = Math.ceil(totalDuration / 1000 * context.sampleRate);
    const output: Float32Array[] = [new Float32Array(numSamples), new Float32Array(numSamples)];
    
    for (const note of notes) {
      synth.noteOn(note.frequency, note.velocity, context);
      const noteSamples = Math.ceil(note.durationMs / 1000 * context.sampleRate);
      const rendered = synth.render(noteSamples, context);
      
      for (let i = 0; i < rendered.samples[0].length && i < output[0].length; i++) {
        output[0][i] += rendered.samples[0][i];
        output[1][i] += rendered.samples[1][i];
      }
      
      synth.noteOff({ sampleRate: context.sampleRate });
      synth.reset();
    }
    
    return { samples: output, sampleRate: context.sampleRate, channels: 2 };
  }

  getDSPProcessorInfo(): ReturnType<typeof getProcessorInfo> {
    return getProcessorInfo();
  }

  private applyReverb(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const mix = (params.mix as number) || 0.3;
    const decay = (params.decay as number) || 2.0;
    const roomSize = (params.roomSize as number) || 0.5;
    const damping = (params.damping as number) || 0.5;
    
    const delayLength = Math.floor(roomSize * 0.1 * sampleRate);
    const delayBuffer = new Float32Array(delayLength);
    let delayIndex = 0;
    
    for (let i = 0; i < left.length; i++) {
      const dryL = left[i];
      const dryR = right[i];
      
      const delayed = delayBuffer[delayIndex];
      const wetSample = delayed * decay * (1 - damping);
      
      delayBuffer[delayIndex] = (dryL + dryR) * 0.5 + wetSample * 0.5;
      delayIndex = (delayIndex + 1) % delayLength;
      
      left[i] = dryL * (1 - mix) + wetSample * mix;
      right[i] = dryR * (1 - mix) + wetSample * mix;
    }
  }

  private applyDelay(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const mix = (params.mix as number) || 0.3;
    const feedback = (params.feedback as number) || 0.4;
    const timeLeft = ((params.timeLeft as number) || 250) / 1000;
    const timeRight = ((params.timeRight as number) || 375) / 1000;
    
    const delaySamplesL = Math.floor(timeLeft * sampleRate);
    const delaySamplesR = Math.floor(timeRight * sampleRate);
    
    const delayBufferL = new Float32Array(delaySamplesL || 1);
    const delayBufferR = new Float32Array(delaySamplesR || 1);
    let indexL = 0, indexR = 0;
    
    for (let i = 0; i < left.length; i++) {
      const dryL = left[i];
      const dryR = right[i];
      
      const delayedL = delayBufferL[indexL];
      const delayedR = delayBufferR[indexR];
      
      delayBufferL[indexL] = dryL + delayedL * feedback;
      delayBufferR[indexR] = dryR + delayedR * feedback;
      
      indexL = (indexL + 1) % delayBufferL.length;
      indexR = (indexR + 1) % delayBufferR.length;
      
      left[i] = dryL * (1 - mix) + delayedL * mix;
      right[i] = dryR * (1 - mix) + delayedR * mix;
    }
  }

  private applyChorus(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const mix = (params.mix as number) || 0.5;
    const rate = (params.rate as number) || 1.0;
    const depth = (params.depth as number) || 0.5;
    const baseDelay = ((params.delay as number) || 7) / 1000;
    
    const maxDelaySamples = Math.floor((baseDelay + 0.01) * sampleRate);
    const delayBufferL = new Float32Array(maxDelaySamples);
    const delayBufferR = new Float32Array(maxDelaySamples);
    let writeIndex = 0;
    
    for (let i = 0; i < left.length; i++) {
      const lfo = Math.sin(2 * Math.PI * rate * i / sampleRate) * depth * 0.5 + 0.5;
      const delaySamples = Math.floor((baseDelay * lfo + 0.001) * sampleRate);
      const readIndex = (writeIndex - delaySamples + maxDelaySamples) % maxDelaySamples;
      
      const dryL = left[i];
      const dryR = right[i];
      
      const chorusL = delayBufferL[readIndex];
      const chorusR = delayBufferR[readIndex];
      
      delayBufferL[writeIndex] = dryL;
      delayBufferR[writeIndex] = dryR;
      writeIndex = (writeIndex + 1) % maxDelaySamples;
      
      left[i] = dryL * (1 - mix) + chorusL * mix;
      right[i] = dryR * (1 - mix) + chorusR * mix;
    }
  }

  private applyCompressor(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const threshold = (params.threshold as number) || -20;
    const ratio = (params.ratio as number) || 4;
    const attackMs = (params.attack as number) || 10;
    const releaseMs = (params.release as number) || 100;
    const makeupGain = (params.makeupGain as number) || 0;
    const mix = (params.mix as number) || 1.0;
    
    const attackCoeff = Math.exp(-1 / (attackMs / 1000 * sampleRate));
    const releaseCoeff = Math.exp(-1 / (releaseMs / 1000 * sampleRate));
    
    let envelope = 0;
    const thresholdLin = Math.pow(10, threshold / 20);
    const makeupLin = Math.pow(10, makeupGain / 20);
    
    for (let i = 0; i < left.length; i++) {
      const inputLevel = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      
      const coeff = inputLevel > envelope ? attackCoeff : releaseCoeff;
      envelope = envelope * coeff + inputLevel * (1 - coeff);
      
      let gain = 1;
      if (envelope > thresholdLin) {
        const overDb = 20 * Math.log10(envelope / thresholdLin);
        const reducedDb = overDb * (1 - 1 / ratio);
        gain = Math.pow(10, -reducedDb / 20);
      }
      
      const processedL = left[i] * gain * makeupLin;
      const processedR = right[i] * gain * makeupLin;
      
      left[i] = left[i] * (1 - mix) + processedL * mix;
      right[i] = right[i] * (1 - mix) + processedR * mix;
    }
  }

  private applyEQ(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const outputGain = Math.pow(10, ((params.outputGain as number) || 0) / 20);
    
    for (let i = 0; i < left.length; i++) {
      left[i] *= outputGain;
      right[i] *= outputGain;
    }
  }

  private applyLimiter(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const ceiling = Math.pow(10, ((params.ceiling as number) || -0.3) / 20);
    const threshold = Math.pow(10, ((params.threshold as number) || -6) / 20);
    
    for (let i = 0; i < left.length; i++) {
      const maxLevel = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      
      if (maxLevel > threshold) {
        const gain = ceiling / maxLevel;
        left[i] *= gain;
        right[i] *= gain;
      }
      
      left[i] = Math.max(-ceiling, Math.min(ceiling, left[i]));
      right[i] = Math.max(-ceiling, Math.min(ceiling, right[i]));
    }
  }

  private applyGate(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const threshold = Math.pow(10, ((params.threshold as number) || -40) / 20);
    const range = Math.pow(10, ((params.range as number) || -80) / 20);
    const attackMs = (params.attack as number) || 1;
    const holdMs = (params.hold as number) || 50;
    const releaseMs = (params.release as number) || 100;
    
    const attackSamples = Math.floor(attackMs / 1000 * sampleRate);
    const holdSamples = Math.floor(holdMs / 1000 * sampleRate);
    const releaseSamples = Math.floor(releaseMs / 1000 * sampleRate);
    
    let gateGain = 0;
    let holdCounter = 0;
    let state: 'closed' | 'attack' | 'open' | 'hold' | 'release' = 'closed';
    let stateCounter = 0;
    
    for (let i = 0; i < left.length; i++) {
      const level = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      
      if (level > threshold) {
        if (state === 'closed' || state === 'release') {
          state = 'attack';
          stateCounter = 0;
        } else if (state === 'attack' || state === 'open') {
          holdCounter = holdSamples;
        }
      } else {
        if (state === 'open') {
          if (holdCounter > 0) {
            holdCounter--;
            state = 'hold';
          } else {
            state = 'release';
            stateCounter = 0;
          }
        } else if (state === 'hold') {
          if (holdCounter > 0) {
            holdCounter--;
          } else {
            state = 'release';
            stateCounter = 0;
          }
        }
      }
      
      switch (state) {
        case 'attack':
          stateCounter++;
          gateGain = Math.min(1, stateCounter / attackSamples);
          if (stateCounter >= attackSamples) {
            state = 'open';
            holdCounter = holdSamples;
          }
          break;
        case 'open':
        case 'hold':
          gateGain = 1;
          break;
        case 'release':
          stateCounter++;
          gateGain = Math.max(range, 1 - stateCounter / releaseSamples);
          if (stateCounter >= releaseSamples) {
            state = 'closed';
            gateGain = range;
          }
          break;
        case 'closed':
          gateGain = range;
          break;
      }
      
      left[i] *= gateGain;
      right[i] *= gateGain;
    }
  }

  private applyDistortion(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const mode = (params.mode as string) || 'tube';
    const drive = (params.drive as number) || 0.5;
    const tone = (params.tone as number) || 0.5;
    const outputGain = Math.pow(10, ((params.output as number) || 0) / 20);
    const mix = (params.mix as number) || 1.0;
    const bias = (params.bias as number) || 0;
    
    const driveAmount = 1 + drive * 20;
    
    for (let i = 0; i < left.length; i++) {
      const dryL = left[i];
      const dryR = right[i];
      
      let wetL = dryL * driveAmount + bias;
      let wetR = dryR * driveAmount + bias;
      
      switch (mode) {
        case 'tube':
          wetL = Math.tanh(wetL);
          wetR = Math.tanh(wetR);
          break;
        case 'tape':
          wetL = wetL / (1 + Math.abs(wetL)) * 1.2;
          wetR = wetR / (1 + Math.abs(wetR)) * 1.2;
          break;
        case 'transistor':
          wetL = Math.sign(wetL) * Math.pow(Math.abs(wetL), 0.7);
          wetR = Math.sign(wetR) * Math.pow(Math.abs(wetR), 0.7);
          break;
        case 'fuzz':
          wetL = Math.sign(wetL) * (1 - Math.exp(-Math.abs(wetL * 3)));
          wetR = Math.sign(wetR) * (1 - Math.exp(-Math.abs(wetR * 3)));
          break;
        case 'bitcrush':
          const bits = Math.floor(4 + (1 - drive) * 12);
          const levels = Math.pow(2, bits);
          wetL = Math.round(wetL * levels) / levels;
          wetR = Math.round(wetR * levels) / levels;
          break;
      }
      
      if (tone !== 0.5) {
        const toneAlpha = 1 - Math.abs(tone - 0.5) * 0.3;
        wetL = wetL * toneAlpha + wetL * (1 - toneAlpha) * (tone > 0.5 ? 1.2 : 0.8);
        wetR = wetR * toneAlpha + wetR * (1 - toneAlpha) * (tone > 0.5 ? 1.2 : 0.8);
      }
      
      wetL *= outputGain;
      wetR *= outputGain;
      
      left[i] = dryL * (1 - mix) + wetL * mix;
      right[i] = dryR * (1 - mix) + wetR * mix;
    }
  }

  private applyPhaser(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const rate = (params.rate as number) || 0.5;
    const depth = (params.depth as number) || 0.7;
    const feedback = (params.feedback as number) || 0.5;
    const stages = (params.stages as number) || 4;
    const centerFreq = (params.centerFreq as number) || 1000;
    const spread = (params.spread as number) || 0.5;
    const mix = (params.mix as number) || 0.5;
    
    const allpassStatesL: number[][] = Array(stages).fill(null).map(() => [0, 0]);
    const allpassStatesR: number[][] = Array(stages).fill(null).map(() => [0, 0]);
    let feedbackL = 0;
    let feedbackR = 0;
    
    for (let i = 0; i < left.length; i++) {
      const lfoPhaseL = 2 * Math.PI * rate * i / sampleRate;
      const lfoPhaseR = lfoPhaseL + spread * Math.PI;
      
      const lfoL = (Math.sin(lfoPhaseL) + 1) * 0.5;
      const lfoR = (Math.sin(lfoPhaseR) + 1) * 0.5;
      
      const minFreq = centerFreq * 0.5;
      const maxFreq = centerFreq * 2;
      const freqL = minFreq + (maxFreq - minFreq) * lfoL * depth;
      const freqR = minFreq + (maxFreq - minFreq) * lfoR * depth;
      
      let inputL = left[i] + feedbackL * feedback;
      let inputR = right[i] + feedbackR * feedback;
      
      for (let s = 0; s < stages; s++) {
        const stageFreqL = freqL * (1 + s * 0.3);
        const stageFreqR = freqR * (1 + s * 0.3);
        
        const coeffL = (stageFreqL - sampleRate) / (stageFreqL + sampleRate);
        const coeffR = (stageFreqR - sampleRate) / (stageFreqR + sampleRate);
        
        const tempL = inputL;
        const tempR = inputR;
        
        inputL = allpassStatesL[s][0] + tempL * coeffL;
        allpassStatesL[s][0] = tempL - inputL * coeffL;
        
        inputR = allpassStatesR[s][0] + tempR * coeffR;
        allpassStatesR[s][0] = tempR - inputR * coeffR;
      }
      
      feedbackL = inputL;
      feedbackR = inputR;
      
      left[i] = left[i] * (1 - mix) + (left[i] + inputL) * 0.5 * mix;
      right[i] = right[i] * (1 - mix) + (right[i] + inputR) * 0.5 * mix;
    }
  }

  private applyFlanger(
    left: Float32Array,
    right: Float32Array,
    params: Record<string, number | boolean | string>,
    sampleRate: number
  ): void {
    const rate = (params.rate as number) || 0.3;
    const depth = (params.depth as number) || 0.6;
    const baseDelay = ((params.delay as number) || 5) / 1000;
    const feedback = (params.feedback as number) || 0.5;
    const mix = (params.mix as number) || 0.5;
    const stereoPhase = (params.stereoPhase as number) || 0.25;
    const manualMode = (params.manualMode as boolean) || false;
    const manualDelay = ((params.manualDelay as number) || 5) / 1000;
    
    const maxDelaySamples = Math.floor(0.025 * sampleRate);
    const delayBufferL = new Float32Array(maxDelaySamples);
    const delayBufferR = new Float32Array(maxDelaySamples);
    let writeIndex = 0;
    let feedbackSampleL = 0;
    let feedbackSampleR = 0;
    
    for (let i = 0; i < left.length; i++) {
      let delayTimeL: number, delayTimeR: number;
      
      if (manualMode) {
        delayTimeL = manualDelay;
        delayTimeR = manualDelay;
      } else {
        const lfoPhaseL = 2 * Math.PI * rate * i / sampleRate;
        const lfoPhaseR = lfoPhaseL + stereoPhase * 2 * Math.PI;
        
        const lfoL = (Math.sin(lfoPhaseL) + 1) * 0.5;
        const lfoR = (Math.sin(lfoPhaseR) + 1) * 0.5;
        
        const minDelay = baseDelay * 0.1;
        const maxDelay = baseDelay;
        delayTimeL = minDelay + (maxDelay - minDelay) * lfoL * depth;
        delayTimeR = minDelay + (maxDelay - minDelay) * lfoR * depth;
      }
      
      const delaySamplesL = Math.min(delayTimeL * sampleRate, maxDelaySamples - 1);
      const delaySamplesR = Math.min(delayTimeR * sampleRate, maxDelaySamples - 1);
      
      const readIndexL = (writeIndex - Math.floor(delaySamplesL) + maxDelaySamples) % maxDelaySamples;
      const readIndexR = (writeIndex - Math.floor(delaySamplesR) + maxDelaySamples) % maxDelaySamples;
      
      const delayedL = delayBufferL[readIndexL];
      const delayedR = delayBufferR[readIndexR];
      
      delayBufferL[writeIndex] = left[i] + delayedL * feedback;
      delayBufferR[writeIndex] = right[i] + delayedR * feedback;
      
      feedbackSampleL = delayedL;
      feedbackSampleR = delayedR;
      
      writeIndex = (writeIndex + 1) % maxDelaySamples;
      
      const wetL = (left[i] + delayedL) * 0.5;
      const wetR = (right[i] + delayedR) * 0.5;
      
      left[i] = left[i] * (1 - mix) + wetL * mix;
      right[i] = right[i] * (1 - mix) + wetR * mix;
    }
  }

  async savePreset(
    userId: string,
    pluginId: string,
    name: string,
    parameters: Record<string, number | boolean | string>,
    options: { category?: string; isPublic?: boolean } = {}
  ): Promise<PluginPreset> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const [preset] = await db.insert(pluginPresets).values({
      userId,
      pluginId: plugin.id,
      name,
      parameters,
      isFactory: false,
      metadata: options.category ? { category: options.category, isPublic: options.isPublic || false } : null,
    }).returning();

    return {
      id: preset.id,
      userId: preset.userId || userId,
      pluginId: preset.pluginId || plugin.id,
      name: preset.name,
      category: (preset.metadata as Record<string, unknown>)?.category || undefined,
      parameters: preset.parameters as Record<string, number | boolean | string>,
      isDefault: preset.isFactory || false,
      isPublic: (preset.metadata as Record<string, unknown>)?.isPublic || false,
      createdAt: preset.createdAt,
    };
  }

  async getPresets(
    pluginId: string,
    userId: string,
    options: { includePublic?: boolean; category?: string } = {}
  ): Promise<PluginPreset[]> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const presets = await db.query.pluginPresets.findMany({
      where: and(
        eq(pluginPresets.pluginId, plugin.id),
        eq(pluginPresets.userId, userId)
      ),
      orderBy: [desc(pluginPresets.createdAt)],
    });

    return presets.map(p => ({
      id: p.id,
      userId: p.userId || userId,
      pluginId: p.pluginId || pluginId,
      name: p.name,
      category: (p.metadata as Record<string, unknown>)?.category || undefined,
      parameters: p.parameters as Record<string, number | boolean | string>,
      isDefault: p.isFactory || false,
      isPublic: (p.metadata as Record<string, unknown>)?.isPublic || false,
      createdAt: p.createdAt,
    }));
  }

  async loadPreset(presetId: string): Promise<PluginPreset | undefined> {
    const preset = await db.query.pluginPresets.findFirst({
      where: eq(pluginPresets.id, presetId),
    });

    if (!preset) {
      return undefined;
    }

    return {
      id: preset.id,
      userId: preset.userId || '',
      pluginId: preset.pluginId || '',
      name: preset.name,
      category: (preset.metadata as Record<string, unknown>)?.category || undefined,
      parameters: preset.parameters as Record<string, number | boolean | string>,
      isDefault: preset.isFactory || false,
      isPublic: (preset.metadata as Record<string, unknown>)?.isPublic || false,
      createdAt: preset.createdAt,
    };
  }

  async deletePreset(presetId: string, userId: string): Promise<void> {
    await db.delete(pluginPresets)
      .where(and(
        eq(pluginPresets.id, presetId),
        eq(pluginPresets.userId, userId)
      ));
  }

  async applyPresetToInstance(instanceId: string, presetId: string): Promise<PluginInstance> {
    const preset = await this.loadPreset(presetId);
    if (!preset) {
      throw new Error(`Preset not found: ${presetId}`);
    }

    return this.updateInstanceParameters(instanceId, preset.parameters);
  }

  getFactoryPresets(pluginId: string): Array<{ name: string; parameters: Record<string, number | boolean | string> }> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      return [];
    }

    const presets = [{ name: 'Default', parameters: plugin.defaultPreset }];

    if (plugin.type === 'reverb') {
      presets.push(
        { name: 'Small Room', parameters: { ...plugin.defaultPreset, roomSize: 0.2, decay: 0.8, damping: 0.7 } },
        { name: 'Large Hall', parameters: { ...plugin.defaultPreset, roomSize: 0.9, decay: 4.0, damping: 0.3 } },
        { name: 'Plate', parameters: { ...plugin.defaultPreset, roomSize: 0.6, decay: 2.5, diffusion: 0.95, damping: 0.4 } }
      );
    } else if (plugin.type === 'compressor') {
      presets.push(
        { name: 'Vocal', parameters: { ...plugin.defaultPreset, threshold: -18, ratio: 3, attack: 15, release: 80 } },
        { name: 'Drums', parameters: { ...plugin.defaultPreset, threshold: -12, ratio: 6, attack: 5, release: 50 } },
        { name: 'Master Bus', parameters: { ...plugin.defaultPreset, threshold: -10, ratio: 2, attack: 30, release: 200 } }
      );
    } else if (plugin.type === 'eq') {
      presets.push(
        { name: 'Bright', parameters: { ...plugin.defaultPreset, highGain: 3, midGain: 1 } },
        { name: 'Warm', parameters: { ...plugin.defaultPreset, lowGain: 2, highGain: -2 } },
        { name: 'Presence', parameters: { ...plugin.defaultPreset, midFreq: 3000, midGain: 4, midQ: 1.5 } }
      );
    } else if (plugin.type === 'analog') {
      presets.push(
        { name: 'Classic Lead', parameters: { ...plugin.defaultPreset, osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Detune: 12, filterCutoff: 3000, filterResonance: 0.5, attack: 0.01, release: 0.2 } },
        { name: 'Fat Bass', parameters: { ...plugin.defaultPreset, osc1Wave: 'square', osc2Wave: 'sawtooth', oscMix: 0.7, filterCutoff: 800, filterResonance: 0.6, attack: 0.001, decay: 0.2, sustain: 0.8 } },
        { name: 'Pad Atmosphere', parameters: { ...plugin.defaultPreset, osc1Wave: 'triangle', osc2Wave: 'sine', filterCutoff: 2000, lfoRate: 0.3, lfoDepth: 0.4, attack: 1.0, release: 2.0 } },
        { name: 'Pluck', parameters: { ...plugin.defaultPreset, osc1Wave: 'square', filterCutoff: 8000, filterEnvAmount: 0.8, attack: 0.001, decay: 0.15, sustain: 0.1, release: 0.1 } }
      );
    } else if (plugin.type === 'fm') {
      presets.push(
        { name: 'Electric Piano', parameters: { ...plugin.defaultPreset, algorithm: 1, op1Ratio: 1, op2Ratio: 14, op2Level: 0.3, modIndex: 1.5, attack: 0.001, decay: 0.8, sustain: 0.2 } },
        { name: 'FM Bass', parameters: { ...plugin.defaultPreset, algorithm: 1, op1Ratio: 1, op2Ratio: 1, op2Level: 0.8, modIndex: 3.0, attack: 0.001, decay: 0.3, sustain: 0.5 } },
        { name: 'Bell', parameters: { ...plugin.defaultPreset, algorithm: 2, op1Ratio: 1, op2Ratio: 3.5, op2Level: 0.6, modIndex: 4.0, attack: 0.001, decay: 2.0, sustain: 0 } },
        { name: 'Metallic', parameters: { ...plugin.defaultPreset, algorithm: 3, op1Ratio: 1, op2Ratio: 7, op3Ratio: 11, modIndex: 5.0, feedback: 0.3 } },
        { name: 'Organ', parameters: { ...plugin.defaultPreset, algorithm: 4, op1Ratio: 0.5, op2Ratio: 1, op3Ratio: 2, op4Ratio: 4, modIndex: 0.5, sustain: 1.0, release: 0.1 } }
      );
    } else if (plugin.type === 'wavetable') {
      presets.push(
        { name: 'Digital Pad', parameters: { ...plugin.defaultPreset, wavetable: 'digital', wavePosition: 0.5, unison: 4, unisonDetune: 20, attack: 0.5, release: 1.5 } },
        { name: 'Vocal Lead', parameters: { ...plugin.defaultPreset, wavetable: 'vocal', wavePosition: 0.3, morphSpeed: 0.5, filterCutoff: 5000 } },
        { name: 'Harsh Bass', parameters: { ...plugin.defaultPreset, wavetable: 'metallic', wavePosition: 0.7, unison: 2, filterCutoff: 2000, attack: 0.001 } },
        { name: 'Evolving Texture', parameters: { ...plugin.defaultPreset, wavetable: 'chaos', morphSpeed: 0.2, lfoToPosition: 0.8, lfoRate: 0.1, attack: 2.0 } }
      );
    } else if (plugin.type === 'sampler') {
      presets.push(
        { name: 'Piano Natural', parameters: { ...plugin.defaultPreset, sampleBank: 'piano', velocitySensitivity: 1.0, attack: 0.001, release: 0.5 } },
        { name: 'Strings Legato', parameters: { ...plugin.defaultPreset, sampleBank: 'strings', loopEnabled: true, attack: 0.3, release: 0.8 } },
        { name: 'Brass Stab', parameters: { ...plugin.defaultPreset, sampleBank: 'brass', attack: 0.05, decay: 0.3, sustain: 0.7 } },
        { name: 'Choir Pad', parameters: { ...plugin.defaultPreset, sampleBank: 'choir', loopEnabled: true, attack: 0.8, release: 1.5 } },
        { name: 'Percussion Kit', parameters: { ...plugin.defaultPreset, sampleBank: 'percussion', playbackMode: 'oneshot', velocitySensitivity: 0.9 } }
      );
    } else if (plugin.type === 'distortion') {
      presets.push(
        { name: 'Warm Tube', parameters: { ...plugin.defaultPreset, mode: 'tube', drive: 0.3, tone: 0.6, mix: 0.7 } },
        { name: 'Tape Saturation', parameters: { ...plugin.defaultPreset, mode: 'tape', drive: 0.4, tone: 0.5, mix: 0.5 } },
        { name: 'Aggressive Fuzz', parameters: { ...plugin.defaultPreset, mode: 'fuzz', drive: 0.8, tone: 0.4, output: -6 } },
        { name: 'Lo-Fi Crush', parameters: { ...plugin.defaultPreset, mode: 'bitcrush', drive: 0.7, tone: 0.3, mix: 0.8 } },
        { name: 'Transistor Grit', parameters: { ...plugin.defaultPreset, mode: 'transistor', drive: 0.5, tone: 0.55, bias: 0.1 } }
      );
    } else if (plugin.type === 'phaser') {
      presets.push(
        { name: 'Classic Sweep', parameters: { ...plugin.defaultPreset, rate: 0.3, depth: 0.8, feedback: 0.6, stages: 4 } },
        { name: 'Deep Space', parameters: { ...plugin.defaultPreset, rate: 0.1, depth: 1.0, feedback: 0.8, stages: 8, spread: 0.7 } },
        { name: 'Subtle Motion', parameters: { ...plugin.defaultPreset, rate: 0.5, depth: 0.3, feedback: 0.2, stages: 2, mix: 0.3 } },
        { name: 'Jet Engine', parameters: { ...plugin.defaultPreset, rate: 2.0, depth: 0.9, feedback: 0.7, stages: 6 } }
      );
    } else if (plugin.type === 'flanger') {
      presets.push(
        { name: 'Classic Jet', parameters: { ...plugin.defaultPreset, rate: 0.2, depth: 0.7, delay: 4, feedback: 0.6 } },
        { name: 'Metallic Sweep', parameters: { ...plugin.defaultPreset, rate: 0.5, depth: 0.9, delay: 2, feedback: 0.8 } },
        { name: 'Subtle Width', parameters: { ...plugin.defaultPreset, rate: 0.1, depth: 0.3, feedback: 0.2, stereoPhase: 0.5, mix: 0.3 } },
        { name: 'Through Zero', parameters: { ...plugin.defaultPreset, throughZero: true, rate: 0.15, depth: 1.0, feedback: 0.4 } },
        { name: 'Negative Feedback', parameters: { ...plugin.defaultPreset, rate: 0.3, depth: 0.6, feedback: -0.7 } }
      );
    } else if (plugin.type === 'delay') {
      presets.push(
        { name: 'Slapback', parameters: { ...plugin.defaultPreset, timeLeft: 100, timeRight: 100, feedback: 0.1, mix: 0.4 } },
        { name: 'Ping Pong', parameters: { ...plugin.defaultPreset, timeLeft: 250, timeRight: 500, feedback: 0.5, mix: 0.35 } },
        { name: 'Long Ambient', parameters: { ...plugin.defaultPreset, timeLeft: 500, timeRight: 750, feedback: 0.6, mix: 0.3, damping: 0.5 } }
      );
    } else if (plugin.type === 'chorus') {
      presets.push(
        { name: 'Light Shimmer', parameters: { ...plugin.defaultPreset, rate: 1.5, depth: 0.3, mix: 0.3 } },
        { name: 'Rich Ensemble', parameters: { ...plugin.defaultPreset, rate: 0.8, depth: 0.7, voices: 4, mix: 0.5 } },
        { name: 'Vintage', parameters: { ...plugin.defaultPreset, rate: 0.5, depth: 0.5, delay: 10, mix: 0.4 } }
      );
    } else if (plugin.type === 'gate') {
      presets.push(
        { name: 'Tight Drums', parameters: { ...plugin.defaultPreset, threshold: -30, attack: 0.5, hold: 20, release: 50 } },
        { name: 'Vocal DeNoise', parameters: { ...plugin.defaultPreset, threshold: -45, attack: 2, hold: 100, release: 150 } },
        { name: 'Creative Chop', parameters: { ...plugin.defaultPreset, threshold: -20, attack: 0.1, hold: 10, release: 20, range: -60 } }
      );
    } else if (plugin.type === 'limiter') {
      presets.push(
        { name: 'Transparent Master', parameters: { ...plugin.defaultPreset, ceiling: -0.1, threshold: -3, release: 150 } },
        { name: 'Loud Master', parameters: { ...plugin.defaultPreset, ceiling: -0.3, threshold: -8, release: 80 } },
        { name: 'Brick Wall', parameters: { ...plugin.defaultPreset, ceiling: -0.5, threshold: -1, release: 50, lookahead: 10 } }
      );
    }

    return presets;
  }
}

export const pluginHostService = new PluginHostService();
