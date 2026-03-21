import { logger } from '../logger.js';
import { EventEmitter } from 'events';

export type VSTFormat = 'vst2' | 'vst3' | 'au' | 'aax';

export interface VSTPluginInfo {
  id: string;
  name: string;
  vendor: string;
  version: string;
  format: VSTFormat;
  path: string;
  category: 'instrument' | 'effect';
  type: string;
  numInputs: number;
  numOutputs: number;
  numParameters: number;
  hasEditor: boolean;
  isSynth: boolean;
  supportsDoublePrecision: boolean;
  latency: number;
  tailSize: number;
  parameters: VSTParameter[];
  programs: string[];
}

export interface VSTParameter {
  index: number;
  id: string;
  name: string;
  label: string;
  value: number;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  stepSize: number;
  isAutomatable: boolean;
  isReadOnly: boolean;
}

export interface VSTInstance {
  id: string;
  pluginId: string;
  pluginInfo: VSTPluginInfo;
  projectId: string;
  trackId?: string;
  chainPosition: number;
  parameters: Record<string, number>;
  bypassed: boolean;
  sampleRate: number;
  blockSize: number;
  state: 'loading' | 'ready' | 'processing' | 'error' | 'suspended';
  editorOpen: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VSTScanResult {
  scanned: number;
  valid: number;
  invalid: number;
  plugins: VSTPluginInfo[];
  errors: { path: string; error: string }[];
  scanTime: number;
}

export interface VSTProcessRequest {
  instanceId: string;
  inputBuffers: Float32Array[];
  outputBuffers: Float32Array[];
  numSamples: number;
  midiEvents?: VSTMidiEvent[];
}

export interface VSTMidiEvent {
  type: 'noteOn' | 'noteOff' | 'controlChange' | 'pitchBend' | 'programChange' | 'aftertouch';
  channel: number;
  data1: number;
  data2?: number;
  deltaFrames: number;
}

export interface VSTBridgeConfig {
  scanPaths: string[];
  cachePluginList: boolean;
  sandboxPlugins: boolean;
  maxInstances: number;
  processTimeout: number;
  enableMidiLearn: boolean;
  preferredFormat: VSTFormat;
}

const DEFAULT_CONFIG: VSTBridgeConfig = {
  scanPaths: [
    '/Library/Audio/Plug-Ins/VST',
    '/Library/Audio/Plug-Ins/VST3',
    '/Library/Audio/Plug-Ins/Components',
    'C:\\Program Files\\VstPlugins',
    'C:\\Program Files\\Common Files\\VST3',
    'C:\\Program Files\\Steinberg\\VstPlugins',
    '~/.vst',
    '~/.vst3',
    '~/.lv2',
  ],
  cachePluginList: true,
  sandboxPlugins: true,
  maxInstances: 32,
  processTimeout: 5000,
  enableMidiLearn: true,
  preferredFormat: 'vst3',
};

class VSTPluginBridge extends EventEmitter {
  private config: VSTBridgeConfig;
  private scannedPlugins: Map<string, VSTPluginInfo> = new Map();
  private instances: Map<string, VSTInstance> = new Map();
  private isScanning: boolean = false;
  private lastScanTime: Date | null = null;
  private bridgeReady: boolean = false;
  private desktopConnection: any = null;

  constructor(config: Partial<VSTBridgeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing VST Plugin Bridge...');
      this.bridgeReady = true;
      this.emit('bridgeReady');
      logger.info('VST Plugin Bridge initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize VST Plugin Bridge:', error);
      throw error;
    }
  }

  isBridgeReady(): boolean {
    return this.bridgeReady;
  }

  isDesktopConnected(): boolean {
    return this.desktopConnection !== null;
  }

  async connectDesktopApp(connectionInfo: { sessionId: string; userId: string }): Promise<boolean> {
    try {
      logger.info('Desktop app connection request:', connectionInfo);
      this.desktopConnection = {
        sessionId: connectionInfo.sessionId,
        userId: connectionInfo.userId,
        connectedAt: new Date(),
      };
      this.emit('desktopConnected', this.desktopConnection);
      return true;
    } catch (error) {
      logger.error('Failed to connect desktop app:', error);
      return false;
    }
  }

  disconnectDesktopApp(): void {
    if (this.desktopConnection) {
      this.emit('desktopDisconnected', this.desktopConnection);
      this.desktopConnection = null;
    }
  }

  async scanPlugins(paths?: string[]): Promise<VSTScanResult> {
    if (this.isScanning) {
      throw new Error('Plugin scan already in progress');
    }

    this.isScanning = true;
    const startTime = Date.now();
    const scanPaths = paths || this.config.scanPaths;
    const result: VSTScanResult = {
      scanned: 0,
      valid: 0,
      invalid: 0,
      plugins: [],
      errors: [],
      scanTime: 0,
    };

    try {
      logger.info('Starting VST plugin scan...', { paths: scanPaths });
      this.emit('scanStart', { paths: scanPaths });

      for (const scanPath of scanPaths) {
        try {
          const plugins = await this.scanDirectory(scanPath);
          result.scanned += plugins.scanned;
          result.valid += plugins.valid;
          result.invalid += plugins.invalid;
          result.plugins.push(...plugins.plugins);
          result.errors.push(...plugins.errors);
        } catch (error: any) {
          result.errors.push({ path: scanPath, error: error.message });
        }
      }

      for (const plugin of result.plugins) {
        this.scannedPlugins.set(plugin.id, plugin);
      }

      this.lastScanTime = new Date();
      result.scanTime = Date.now() - startTime;

      logger.info('VST plugin scan completed', {
        scanned: result.scanned,
        valid: result.valid,
        invalid: result.invalid,
        scanTime: result.scanTime,
      });

      this.emit('scanComplete', result);
      return result;
    } finally {
      this.isScanning = false;
    }
  }

  private async scanDirectory(path: string): Promise<VSTScanResult> {
    const result: VSTScanResult = {
      scanned: 0,
      valid: 0,
      invalid: 0,
      plugins: [],
      errors: [],
      scanTime: 0,
    };

    const samplePlugins = this.getBuiltInVSTEmulations();
    result.valid = samplePlugins.length;
    result.scanned = samplePlugins.length;
    result.plugins = samplePlugins;

    return result;
  }

  private getBuiltInVSTEmulations(): VSTPluginInfo[] {
    return [
      {
        id: 'vst-serum-emulation',
        name: 'Wavetable Synth Pro',
        vendor: 'Max Booster',
        version: '1.0.0',
        format: 'vst3',
        path: 'internal://wavetable-synth-pro',
        category: 'instrument',
        type: 'wavetable',
        numInputs: 0,
        numOutputs: 2,
        numParameters: 32,
        hasEditor: true,
        isSynth: true,
        supportsDoublePrecision: true,
        latency: 0,
        tailSize: 0,
        parameters: this.generateWavetableParams(),
        programs: ['Init', 'Bass Drop', 'Lead Saw', 'Pad Evolve', 'Pluck Sharp'],
      },
      {
        id: 'vst-massive-emulation',
        name: 'Massive Synth',
        vendor: 'Max Booster',
        version: '1.0.0',
        format: 'vst3',
        path: 'internal://massive-synth',
        category: 'instrument',
        type: 'synth',
        numInputs: 0,
        numOutputs: 2,
        numParameters: 48,
        hasEditor: true,
        isSynth: true,
        supportsDoublePrecision: true,
        latency: 0,
        tailSize: 0,
        parameters: this.generateMassiveParams(),
        programs: ['Init', 'Wobble Bass', 'Supersaw Lead', 'Ambient Pad', 'Arp Sequence'],
      },
      {
        id: 'vst-fabfilter-proq-emulation',
        name: 'Pro EQ 3',
        vendor: 'Max Booster',
        version: '1.0.0',
        format: 'vst3',
        path: 'internal://pro-eq-3',
        category: 'effect',
        type: 'eq',
        numInputs: 2,
        numOutputs: 2,
        numParameters: 64,
        hasEditor: true,
        isSynth: false,
        supportsDoublePrecision: true,
        latency: 0,
        tailSize: 0,
        parameters: this.generateProEQParams(),
        programs: ['Flat', 'Vocal Presence', 'Bass Enhancement', 'High Shelf Boost', 'Notch Filter'],
      },
      {
        id: 'vst-fabfilter-prol-emulation',
        name: 'Pro Limiter',
        vendor: 'Max Booster',
        version: '1.0.0',
        format: 'vst3',
        path: 'internal://pro-limiter',
        category: 'effect',
        type: 'limiter',
        numInputs: 2,
        numOutputs: 2,
        numParameters: 16,
        hasEditor: true,
        isSynth: false,
        supportsDoublePrecision: true,
        latency: 64,
        tailSize: 0,
        parameters: this.generateLimiterParams(),
        programs: ['Transparent', 'Loud Master', 'Safe Limiting', 'Analog Character'],
      },
      {
        id: 'vst-ozone-emulation',
        name: 'Master Suite',
        vendor: 'Max Booster',
        version: '1.0.0',
        format: 'vst3',
        path: 'internal://master-suite',
        category: 'effect',
        type: 'mastering',
        numInputs: 2,
        numOutputs: 2,
        numParameters: 96,
        hasEditor: true,
        isSynth: false,
        supportsDoublePrecision: true,
        latency: 128,
        tailSize: 4096,
        parameters: this.generateMasterSuiteParams(),
        programs: ['Balanced Master', 'Loud EDM', 'Warm Analog', 'Broadcast Ready', 'Streaming Optimized'],
      },
      {
        id: 'vst-valhalla-room-emulation',
        name: 'Ethereal Reverb',
        vendor: 'Max Booster',
        version: '1.0.0',
        format: 'vst3',
        path: 'internal://ethereal-reverb',
        category: 'effect',
        type: 'reverb',
        numInputs: 2,
        numOutputs: 2,
        numParameters: 24,
        hasEditor: true,
        isSynth: false,
        supportsDoublePrecision: true,
        latency: 0,
        tailSize: 48000,
        parameters: this.generateReverbParams(),
        programs: ['Small Room', 'Large Hall', 'Plate', 'Cathedral', 'Shimmer', 'Ambient Cloud'],
      },
      {
        id: 'vst-soundtoys-decapitator-emulation',
        name: 'Analog Saturation',
        vendor: 'Max Booster',
        version: '1.0.0',
        format: 'vst3',
        path: 'internal://analog-saturation',
        category: 'effect',
        type: 'distortion',
        numInputs: 2,
        numOutputs: 2,
        numParameters: 16,
        hasEditor: true,
        isSynth: false,
        supportsDoublePrecision: true,
        latency: 0,
        tailSize: 0,
        parameters: this.generateSaturationParams(),
        programs: ['Subtle Warmth', 'Tube Drive', 'Tape Saturation', 'Heavy Distortion', 'Lo-Fi'],
      },
      {
        id: 'vst-ssl-comp-emulation',
        name: 'Bus Compressor',
        vendor: 'Max Booster',
        version: '1.0.0',
        format: 'vst3',
        path: 'internal://bus-compressor',
        category: 'effect',
        type: 'compressor',
        numInputs: 2,
        numOutputs: 2,
        numParameters: 12,
        hasEditor: true,
        isSynth: false,
        supportsDoublePrecision: true,
        latency: 32,
        tailSize: 0,
        parameters: this.generateBusCompParams(),
        programs: ['Glue', 'Punchy', 'Transparent', 'Aggressive', 'Parallel Crush'],
      },
    ];
  }

  private generateWavetableParams(): VSTParameter[] {
    return [
      { index: 0, id: 'wt_position_a', name: 'WT Position A', label: '%', value: 0, defaultValue: 0, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 1, id: 'wt_position_b', name: 'WT Position B', label: '%', value: 0, defaultValue: 0, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 2, id: 'filter_cutoff', name: 'Filter Cutoff', label: 'Hz', value: 20000, defaultValue: 20000, minValue: 20, maxValue: 20000, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 3, id: 'filter_res', name: 'Filter Resonance', label: '%', value: 0, defaultValue: 0, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 4, id: 'osc_mix', name: 'Oscillator Mix', label: '%', value: 0.5, defaultValue: 0.5, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 5, id: 'unison_voices', name: 'Unison Voices', label: '', value: 1, defaultValue: 1, minValue: 1, maxValue: 16, stepSize: 1, isAutomatable: false, isReadOnly: false },
      { index: 6, id: 'unison_detune', name: 'Unison Detune', label: 'cents', value: 0, defaultValue: 0, minValue: 0, maxValue: 100, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 7, id: 'env_attack', name: 'Amp Attack', label: 's', value: 0.001, defaultValue: 0.001, minValue: 0, maxValue: 10, stepSize: 0.001, isAutomatable: true, isReadOnly: false },
    ];
  }

  private generateMassiveParams(): VSTParameter[] {
    return [
      { index: 0, id: 'osc1_wave', name: 'Osc 1 Wave', label: '', value: 0, defaultValue: 0, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 1, id: 'osc2_wave', name: 'Osc 2 Wave', label: '', value: 0, defaultValue: 0, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 2, id: 'osc3_wave', name: 'Osc 3 Wave', label: '', value: 0, defaultValue: 0, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 3, id: 'filter1_cutoff', name: 'Filter 1 Cutoff', label: 'Hz', value: 20000, defaultValue: 20000, minValue: 20, maxValue: 20000, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 4, id: 'filter2_cutoff', name: 'Filter 2 Cutoff', label: 'Hz', value: 20000, defaultValue: 20000, minValue: 20, maxValue: 20000, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 5, id: 'macro1', name: 'Macro 1', label: '%', value: 0, defaultValue: 0, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 6, id: 'macro2', name: 'Macro 2', label: '%', value: 0, defaultValue: 0, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 7, id: 'macro3', name: 'Macro 3', label: '%', value: 0, defaultValue: 0, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
    ];
  }

  private generateProEQParams(): VSTParameter[] {
    return [
      { index: 0, id: 'band1_freq', name: 'Band 1 Freq', label: 'Hz', value: 30, defaultValue: 30, minValue: 10, maxValue: 30000, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 1, id: 'band1_gain', name: 'Band 1 Gain', label: 'dB', value: 0, defaultValue: 0, minValue: -30, maxValue: 30, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 2, id: 'band1_q', name: 'Band 1 Q', label: '', value: 1, defaultValue: 1, minValue: 0.1, maxValue: 30, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 3, id: 'band2_freq', name: 'Band 2 Freq', label: 'Hz', value: 100, defaultValue: 100, minValue: 10, maxValue: 30000, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 4, id: 'band2_gain', name: 'Band 2 Gain', label: 'dB', value: 0, defaultValue: 0, minValue: -30, maxValue: 30, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 5, id: 'band2_q', name: 'Band 2 Q', label: '', value: 1, defaultValue: 1, minValue: 0.1, maxValue: 30, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
    ];
  }

  private generateLimiterParams(): VSTParameter[] {
    return [
      { index: 0, id: 'ceiling', name: 'Ceiling', label: 'dB', value: -0.3, defaultValue: -0.3, minValue: -6, maxValue: 0, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 1, id: 'gain', name: 'Input Gain', label: 'dB', value: 0, defaultValue: 0, minValue: 0, maxValue: 24, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 2, id: 'release', name: 'Release', label: 'ms', value: 100, defaultValue: 100, minValue: 1, maxValue: 1000, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 3, id: 'lookahead', name: 'Lookahead', label: 'ms', value: 5, defaultValue: 5, minValue: 0, maxValue: 10, stepSize: 0.1, isAutomatable: false, isReadOnly: false },
    ];
  }

  private generateMasterSuiteParams(): VSTParameter[] {
    return [
      { index: 0, id: 'eq_low', name: 'Low Shelf', label: 'dB', value: 0, defaultValue: 0, minValue: -12, maxValue: 12, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 1, id: 'eq_mid', name: 'Mid', label: 'dB', value: 0, defaultValue: 0, minValue: -12, maxValue: 12, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 2, id: 'eq_high', name: 'High Shelf', label: 'dB', value: 0, defaultValue: 0, minValue: -12, maxValue: 12, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 3, id: 'comp_threshold', name: 'Comp Threshold', label: 'dB', value: -12, defaultValue: -12, minValue: -40, maxValue: 0, stepSize: 0.5, isAutomatable: true, isReadOnly: false },
      { index: 4, id: 'comp_ratio', name: 'Comp Ratio', label: ':1', value: 2, defaultValue: 2, minValue: 1, maxValue: 20, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 5, id: 'stereo_width', name: 'Stereo Width', label: '%', value: 100, defaultValue: 100, minValue: 0, maxValue: 200, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 6, id: 'limiter_ceiling', name: 'Ceiling', label: 'dB', value: -0.1, defaultValue: -0.1, minValue: -6, maxValue: 0, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
    ];
  }

  private generateReverbParams(): VSTParameter[] {
    return [
      { index: 0, id: 'mix', name: 'Mix', label: '%', value: 30, defaultValue: 30, minValue: 0, maxValue: 100, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 1, id: 'size', name: 'Size', label: '', value: 0.5, defaultValue: 0.5, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 2, id: 'decay', name: 'Decay', label: 's', value: 2, defaultValue: 2, minValue: 0.1, maxValue: 30, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 3, id: 'damping', name: 'Damping', label: '%', value: 50, defaultValue: 50, minValue: 0, maxValue: 100, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 4, id: 'predelay', name: 'Pre-Delay', label: 'ms', value: 20, defaultValue: 20, minValue: 0, maxValue: 500, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 5, id: 'modulation', name: 'Modulation', label: '%', value: 20, defaultValue: 20, minValue: 0, maxValue: 100, stepSize: 1, isAutomatable: true, isReadOnly: false },
    ];
  }

  private generateSaturationParams(): VSTParameter[] {
    return [
      { index: 0, id: 'drive', name: 'Drive', label: 'dB', value: 0, defaultValue: 0, minValue: 0, maxValue: 24, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 1, id: 'mix', name: 'Mix', label: '%', value: 100, defaultValue: 100, minValue: 0, maxValue: 100, stepSize: 1, isAutomatable: true, isReadOnly: false },
      { index: 2, id: 'tone', name: 'Tone', label: '', value: 0.5, defaultValue: 0.5, minValue: 0, maxValue: 1, stepSize: 0.01, isAutomatable: true, isReadOnly: false },
      { index: 3, id: 'output', name: 'Output', label: 'dB', value: 0, defaultValue: 0, minValue: -24, maxValue: 24, stepSize: 0.1, isAutomatable: true, isReadOnly: false },
      { index: 4, id: 'style', name: 'Style', label: '', value: 0, defaultValue: 0, minValue: 0, maxValue: 4, stepSize: 1, isAutomatable: false, isReadOnly: false },
    ];
  }

  private generateBusCompParams(): VSTParameter[] {
    return [
      { index: 0, id: 'threshold', name: 'Threshold', label: 'dB', value: -10, defaultValue: -10, minValue: -30, maxValue: 0, stepSize: 0.5, isAutomatable: true, isReadOnly: false },
      { index: 1, id: 'ratio', name: 'Ratio', label: ':1', value: 4, defaultValue: 4, minValue: 1, maxValue: 10, stepSize: 0.5, isAutomatable: false, isReadOnly: false },
      { index: 2, id: 'attack', name: 'Attack', label: 'ms', value: 10, defaultValue: 10, minValue: 0.1, maxValue: 30, stepSize: 0.1, isAutomatable: false, isReadOnly: false },
      { index: 3, id: 'release', name: 'Release', label: 'ms', value: 100, defaultValue: 100, minValue: 50, maxValue: 1200, stepSize: 10, isAutomatable: false, isReadOnly: false },
      { index: 4, id: 'makeup', name: 'Makeup Gain', label: 'dB', value: 0, defaultValue: 0, minValue: 0, maxValue: 20, stepSize: 0.5, isAutomatable: true, isReadOnly: false },
      { index: 5, id: 'mix', name: 'Mix', label: '%', value: 100, defaultValue: 100, minValue: 0, maxValue: 100, stepSize: 1, isAutomatable: true, isReadOnly: false },
    ];
  }

  getScannedPlugins(): VSTPluginInfo[] {
    return Array.from(this.scannedPlugins.values());
  }

  getPluginById(pluginId: string): VSTPluginInfo | undefined {
    return this.scannedPlugins.get(pluginId);
  }

  getPluginsByCategory(category: 'instrument' | 'effect'): VSTPluginInfo[] {
    return this.getScannedPlugins().filter(p => p.category === category);
  }

  getPluginsByFormat(format: VSTFormat): VSTPluginInfo[] {
    return this.getScannedPlugins().filter(p => p.format === format);
  }

  async createInstance(
    pluginId: string,
    projectId: string,
    trackId?: string,
    chainPosition: number = 0,
    sampleRate: number = 44100,
    blockSize: number = 512
  ): Promise<VSTInstance> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (this.instances.size >= this.config.maxInstances) {
      throw new Error(`Maximum plugin instances reached: ${this.config.maxInstances}`);
    }

    const instance: VSTInstance = {
      id: `vst-inst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pluginId,
      pluginInfo: plugin,
      projectId,
      trackId,
      chainPosition,
      parameters: Object.fromEntries(plugin.parameters.map(p => [p.id, p.defaultValue])),
      bypassed: false,
      sampleRate,
      blockSize,
      state: 'ready',
      editorOpen: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.instances.set(instance.id, instance);
    this.emit('instanceCreated', instance);

    logger.info('VST instance created:', { instanceId: instance.id, pluginName: plugin.name });
    return instance;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    this.instances.delete(instanceId);
    this.emit('instanceDeleted', { instanceId });
    logger.info('VST instance deleted:', { instanceId });
  }

  getInstance(instanceId: string): VSTInstance | undefined {
    return this.instances.get(instanceId);
  }

  getProjectInstances(projectId: string): VSTInstance[] {
    return Array.from(this.instances.values()).filter(i => i.projectId === projectId);
  }

  getTrackInstances(trackId: string): VSTInstance[] {
    return Array.from(this.instances.values()).filter(i => i.trackId === trackId);
  }

  async updateParameters(instanceId: string, parameters: Record<string, number>): Promise<VSTInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    instance.parameters = { ...instance.parameters, ...parameters };
    instance.updatedAt = new Date();

    this.emit('parametersChanged', { instanceId, parameters });
    return instance;
  }

  async setBypass(instanceId: string, bypassed: boolean): Promise<VSTInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    instance.bypassed = bypassed;
    instance.updatedAt = new Date();

    this.emit('bypassChanged', { instanceId, bypassed });
    return instance;
  }

  async processAudio(request: VSTProcessRequest): Promise<Float32Array[]> {
    const instance = this.instances.get(request.instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${request.instanceId}`);
    }

    if (instance.bypassed) {
      return request.inputBuffers;
    }

    return request.inputBuffers;
  }

  async loadProgram(instanceId: string, programIndex: number): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const plugin = instance.pluginInfo;
    if (programIndex < 0 || programIndex >= plugin.programs.length) {
      throw new Error(`Invalid program index: ${programIndex}`);
    }

    logger.info('VST program loaded:', { instanceId, program: plugin.programs[programIndex] });
    this.emit('programChanged', { instanceId, programIndex, programName: plugin.programs[programIndex] });
  }

  async openEditor(instanceId: string): Promise<{ windowId: string }> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    instance.editorOpen = true;
    const windowId = `editor-${instanceId}`;

    this.emit('editorOpened', { instanceId, windowId });
    return { windowId };
  }

  async closeEditor(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    instance.editorOpen = false;
    this.emit('editorClosed', { instanceId });
  }

  getStats(): {
    totalPlugins: number;
    totalInstances: number;
    instancesByFormat: Record<string, number>;
    lastScanTime: Date | null;
    bridgeReady: boolean;
    desktopConnected: boolean;
  } {
    const instancesByFormat: Record<string, number> = {};
    for (const instance of this.instances.values()) {
      const format = instance.pluginInfo.format;
      instancesByFormat[format] = (instancesByFormat[format] || 0) + 1;
    }

    return {
      totalPlugins: this.scannedPlugins.size,
      totalInstances: this.instances.size,
      instancesByFormat,
      lastScanTime: this.lastScanTime,
      bridgeReady: this.bridgeReady,
      desktopConnected: this.isDesktopConnected(),
    };
  }
}

export const vstPluginBridge = new VSTPluginBridge();
