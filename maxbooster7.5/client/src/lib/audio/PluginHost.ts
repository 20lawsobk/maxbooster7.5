import { BasePlugin } from './plugins/BasePlugin';
import { CompressorPlugin } from './plugins/CompressorPlugin';
import { EQPlugin } from './plugins/EQPlugin';
import { ReverbPlugin } from './plugins/ReverbPlugin';
import { DelayPlugin } from './plugins/DelayPlugin';
import { DistortionPlugin } from './plugins/DistortionPlugin';
import { ChorusPlugin } from './plugins/ChorusPlugin';
import { FlangerPlugin } from './plugins/FlangerPlugin';
import { PhaserPlugin } from './plugins/PhaserPlugin';
import { DeEsserPlugin } from './plugins/DeEsserPlugin';
import { VocoderPlugin } from './plugins/VocoderPlugin';
import { DynamicEQPlugin } from './plugins/DynamicEQPlugin';

/**
 * Plugin Host - Manages audio plugin chains
 */
export class PluginHost {
  private context: AudioContext;
  private plugins: Map<string, BasePlugin> = new Map();
  private chains: Map<string, PluginChain> = new Map();

  constructor(context: AudioContext) {
    this.context = context;
  }

  /**
   * Available plugin types
   */
  getAvailablePlugins(): PluginInfo[] {
    return [
      { type: 'compressor', name: 'Compressor', category: 'dynamics' },
      { type: 'eq', name: '8-Band EQ', category: 'eq' },
      { type: 'reverb', name: 'Convolution Reverb', category: 'spatial' },
      { type: 'delay', name: 'Stereo Delay', category: 'time' },
      { type: 'distortion', name: 'Distortion', category: 'saturation' },
      { type: 'chorus', name: 'Chorus', category: 'modulation' },
      { type: 'flanger', name: 'Flanger', category: 'modulation' },
      { type: 'phaser', name: 'Phaser', category: 'modulation' },
      { type: 'deesser', name: 'De-Esser', category: 'dynamics' },
      { type: 'vocoder', name: 'Vocoder', category: 'vocal' },
      { type: 'dynamiceq', name: 'Dynamic EQ', category: 'eq' },
    ];
  }

  /**
   * Create a plugin instance
   */
  createPlugin(type: string): BasePlugin | null {
    switch (type) {
      case 'compressor':
        return new CompressorPlugin(this.context);
      case 'eq':
        return new EQPlugin(this.context);
      case 'reverb':
        return new ReverbPlugin(this.context);
      case 'delay':
        return new DelayPlugin(this.context);
      case 'distortion':
        return new DistortionPlugin(this.context);
      case 'chorus':
        return new ChorusPlugin(this.context);
      case 'flanger':
        return new FlangerPlugin(this.context);
      case 'phaser':
        return new PhaserPlugin(this.context);
      case 'deesser':
        return new DeEsserPlugin(this.context);
      case 'vocoder':
        return new VocoderPlugin(this.context);
      case 'dynamiceq':
        return new DynamicEQPlugin(this.context);
      default:
        return null;
    }
  }

  /**
   * Create a plugin chain for a track
   */
  createChain(trackId: string): PluginChain {
    const chain = new PluginChain(this.context, trackId);
    this.chains.set(trackId, chain);
    return chain;
  }

  /**
   * Get chain for track
   */
  getChain(trackId: string): PluginChain | undefined {
    return this.chains.get(trackId);
  }

  /**
   * Add plugin to chain
   */
  addPluginToChain(trackId: string, pluginType: string, position?: number): BasePlugin | null {
    const chain = this.chains.get(trackId);
    if (!chain) return null;

    const plugin = this.createPlugin(pluginType);
    if (!plugin) return null;

    chain.addPlugin(plugin, position);
    return plugin;
  }

  /**
   * Remove all chains and plugins
   */
  destroy(): void {
    for (const chain of this.chains.values()) {
      chain.destroy();
    }
    this.chains.clear();
    this.plugins.clear();
  }
}

/**
 * Plugin chain for a track
 */
export class PluginChain {
  private context: AudioContext;
  private trackId: string;
  private input: GainNode;
  private output: GainNode;
  private plugins: BasePlugin[] = [];

  constructor(context: AudioContext, trackId: string) {
    this.context = context;
    this.trackId = trackId;
    this.input = context.createGain();
    this.output = context.createGain();
    this.input.connect(this.output);
  }

  /**
   * Connect chain between source and destination
   */
  connect(source: AudioNode, destination: AudioNode): void {
    source.connect(this.input);
    this.output.connect(destination);
  }

  /**
   * Add plugin to chain
   */
  addPlugin(plugin: BasePlugin, position?: number): void {
    // Disconnect current chain
    this.reconnectChain();

    // Add plugin at position
    if (position !== undefined && position >= 0 && position < this.plugins.length) {
      this.plugins.splice(position, 0, plugin);
    } else {
      this.plugins.push(plugin);
    }

    // Reconnect with new plugin
    this.reconnectChain();
  }

  /**
   * Remove plugin from chain
   */
  removePlugin(plugin: BasePlugin): void {
    const index = this.plugins.indexOf(plugin);
    if (index >= 0) {
      this.plugins.splice(index, 1);
      plugin.destroy();
      this.reconnectChain();
    }
  }

  /**
   * Move plugin in chain
   */
  movePlugin(plugin: BasePlugin, newPosition: number): void {
    const index = this.plugins.indexOf(plugin);
    if (index >= 0) {
      this.plugins.splice(index, 1);
      this.plugins.splice(newPosition, 0, plugin);
      this.reconnectChain();
    }
  }

  /**
   * Get all plugins in chain
   */
  getPlugins(): BasePlugin[] {
    return [...this.plugins];
  }

  /**
   * Reconnect audio chain with current plugins
   */
  private reconnectChain(): void {
    // Disconnect all
    this.input.disconnect();
    for (const plugin of this.plugins) {
      plugin.disconnect();
    }
    this.output.disconnect();

    // Reconnect chain
    if (this.plugins.length === 0) {
      // Direct connection if no plugins
      this.input.connect(this.output);
    } else {
      // Connect through plugin chain
      let previousNode: AudioNode = this.input;

      for (const plugin of this.plugins) {
        previousNode.connect(plugin.getInput());
        previousNode = plugin.getOutput();
      }

      previousNode.connect(this.output);
    }
  }

  /**
   * Bypass all plugins
   */
  setBypass(bypass: boolean): void {
    for (const plugin of this.plugins) {
      plugin.setBypass(bypass);
    }
  }

  /**
   * Get chain state for saving
   */
  getState(): PluginChainState {
    return {
      trackId: this.trackId,
      plugins: this.plugins.map((plugin) => ({
        name: plugin.getName(),
        parameters: plugin.getParameters(),
      })),
    };
  }

  /**
   * Load chain state
   */
  loadState(state: PluginChainState): void {
    // Clear existing plugins
    for (const plugin of this.plugins) {
      plugin.destroy();
    }
    this.plugins = [];

    // Recreate plugins from state
    // Would need plugin factory here
    this.reconnectChain();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    for (const plugin of this.plugins) {
      plugin.destroy();
    }
    this.plugins = [];
    this.input.disconnect();
    this.output.disconnect();
  }
}

// Type definitions
interface PluginInfo {
  type: string;
  name: string;
  category: string;
}

interface PluginChainState {
  trackId: string;
  plugins: Array<{
    name: string;
    parameters: Record<string, any>;
  }>;
}

export { type PluginInfo, type PluginChainState };
