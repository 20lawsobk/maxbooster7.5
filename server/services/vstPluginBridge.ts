// @ts-nocheck
import { logger } from "../logger.js";
import { EventEmitter } from "events";
import { repositoryVstInventory, NativeVstHostUnavailable } from "./repositoryVstInventory.js";
import path from "node:path";

export type VSTFormat = "vst2" | "vst3" | "au" | "aax";

export interface VSTPluginInfo {
  id: string;
  name: string;
  vendor: string;
  version: string;
  format: VSTFormat;
  path: string;
  category: "instrument" | "effect";
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
  state: "loading" | "ready" | "processing" | "error" | "suspended";
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
  type:
    | "noteOn"
    | "noteOff"
    | "controlChange"
    | "pitchBend"
    | "programChange"
    | "aftertouch";
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
  scanPaths: [path.resolve(process.cwd(), "VST3")],
  cachePluginList: true,
  sandboxPlugins: true,
  maxInstances: 32,
  processTimeout: 5000,
  enableMidiLearn: true,
  preferredFormat: "vst3",
};

class VSTPluginBridge extends EventEmitter {
  private config: VSTBridgeConfig;
  private scannedPlugins: Map<string, VSTPluginInfo> = new Map();
  private instances: Map<string, VSTInstance> = new Map();
  private isScanning: boolean = false;
  private lastScanTime: Date | null = null;
  private bridgeReady: boolean = false;
  private desktopConnection: Record<string, unknown> | null = null;

  constructor(config: Partial<VSTBridgeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    try {
      logger.info("Initializing VST Plugin Bridge...");
      this.bridgeReady = false;
      await this.scanPlugins();
      logger.info("Repository VST inventory initialized; native processing unavailable");
    } catch (error) {
      logger.warn({ err: error }, "Failed to initialize VST Plugin Bridge:");
      throw error;
    }
  }

  isBridgeReady(): boolean {
    return this.bridgeReady;
  }

  isDesktopConnected(): boolean {
    return this.desktopConnection !== null;
  }

  async connectDesktopApp(connectionInfo: {
    sessionId: string;
    userId: string;
  }): Promise<boolean> {
    throw new NativeVstHostUnavailable();
  }

  disconnectDesktopApp(): void {
    if (this.desktopConnection) {
      this.emit("desktopDisconnected", this.desktopConnection);
      this.desktopConnection = null;
    }
  }

  async scanPlugins(paths?: string[]): Promise<VSTScanResult> {
    if (this.isScanning) {
      throw new Error("Plugin scan already in progress");
    }

    this.scannedPlugins.clear();
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
      logger.info({ paths: scanPaths }, "Starting VST plugin scan...");
      this.emit("scanStart", { paths: scanPaths });

      for (const scanPath of scanPaths) {
        try {
          const plugins = await this.scanDirectory(scanPath);
          result.scanned += plugins?.scanned;
          result.valid += plugins?.valid;
          result.invalid += plugins?.invalid;
          result?.plugins.push(...(plugins?.plugins ?? []));
          result?.errors.push(...(plugins?.errors ?? []));
        } catch (error) {
          result?.errors.push({ path: scanPath, error: (error as Error).message });
        }
      }

      for (const plugin of result?.plugins ?? []) {
        this.scannedPlugins.set(plugin?.id, plugin);
      }

      this.lastScanTime = new Date();
      result.scanTime = Date.now() - startTime;

      logger.info({
        scanned: result.scanned,
        valid: result.valid,
        invalid: result.invalid,
        scanTime: result.scanTime,
      }, "VST plugin scan completed");

      this.emit("scanComplete", result);
      return result;
    } finally {
      this.isScanning = false;
    }
  }

  private async scanDirectory(scanPath: string): Promise<VSTScanResult> {
    if (path.resolve(scanPath) !== path.resolve(process.cwd(), "VST3")) throw new Error("Only repository VST3 inventory is available");
    const inventory = await repositoryVstInventory();
    const plugins = inventory.plugins.map(plugin => ({ ...plugin, path: `repository://VST3/${plugin.bundle}`,
      category: "effect", type: "native", numInputs: 0, numOutputs: 0, numParameters: 0,
      hasEditor: false, isSynth: false, supportsDoublePrecision: false, latency: 0, tailSize: 0, parameters: [], programs: [] }));
    return { scanned: plugins.length + inventory.errors.length, valid: plugins.length, invalid: inventory.errors.length,
      plugins, errors: inventory.errors.map(error => ({ path: "VST3", error })), scanTime: 0 };
  }

  getScannedPlugins(): VSTPluginInfo[] {
    return Array.from(this.scannedPlugins.values());
  }

  getPluginById(pluginId: string): VSTPluginInfo | undefined {
    return this.scannedPlugins.get(pluginId);
  }

  getPluginsByCategory(category: "instrument" | "effect"): VSTPluginInfo[] {
    return this.getScannedPlugins().filter((p) => p?.category === category);
  }

  getPluginsByFormat(format: VSTFormat): VSTPluginInfo[] {
    return this.getScannedPlugins().filter((p) => p?.format === format);
  }

  async createInstance(
    pluginId: string,
    projectId: string,
    trackId?: string,
    chainPosition: number = 0,
    sampleRate: number = 44100,
    blockSize: number = 512,
  ): Promise<VSTInstance> {
    throw new NativeVstHostUnavailable();
  }

  async deleteInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    this.instances.delete(instanceId);
    this.emit("instanceDeleted", { instanceId });
    logger.info({ instanceId }, "VST instance deleted:");
  }

  getInstance(instanceId: string): VSTInstance | undefined {
    return this.instances.get(instanceId);
  }

  getProjectInstances(projectId: string): VSTInstance[] {
    return Array.from(this.instances.values()).filter(
      (i) => i?.projectId === projectId,
    );
  }

  getTrackInstances(trackId: string): VSTInstance[] {
    return Array.from(this.instances.values()).filter(
      (i) => i?.trackId === trackId,
    );
  }

  async updateParameters(
    instanceId: string,
    parameters: Record<string, number>,
  ): Promise<VSTInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    instance.parameters = { ...instance?.parameters, ...parameters };
    instance.updatedAt = new Date();

    this.emit("parametersChanged", { instanceId, parameters });
    return instance;
  }

  async setBypass(instanceId: string, bypassed: boolean): Promise<VSTInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    instance.bypassed = bypassed;
    instance.updatedAt = new Date();

    this.emit("bypassChanged", { instanceId, bypassed });
    return instance;
  }

  async processAudio(request: VSTProcessRequest): Promise<Float32Array[]> {
    const instance = this.instances.get(request?.instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${request?.instanceId}`);
    }

    if (instance?.bypassed) {
      return request?.inputBuffers;
    }

    throw new NativeVstHostUnavailable();
  }

  async loadProgram(instanceId: string, programIndex: number): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const plugin = instance?.pluginInfo;
    if (programIndex < 0 || programIndex >= plugin?.programs.length) {
      throw new Error(`Invalid program index: ${programIndex}`);
    }

    logger.info({
      instanceId,
      program: plugin.programs[programIndex],
    }, "VST program loaded:");
    this.emit({
      instanceId,
      programIndex,
      programName: plugin.programs[programIndex],
    }, "programChanged");
  }

  async openEditor(instanceId: string): Promise<{ windowId: string }> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    instance.editorOpen = true;
    const windowId = `editor-${instanceId}`;

    this.emit("editorOpened", { instanceId, windowId });
    return { windowId };
  }

  async closeEditor(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    instance.editorOpen = false;
    this.emit("editorClosed", { instanceId });
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
      const format = instance?.pluginInfo.format;
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
