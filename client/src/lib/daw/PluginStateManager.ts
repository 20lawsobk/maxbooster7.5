import { logger } from "../logger";
export interface PluginPreset {
  id: string;
  name: string;
  pluginId: string;
  parameters: Record<string, number | boolean | string>;
  isFactory: boolean;
  createdAt: number;
  modifiedAt: number;
}

export interface PluginState {
  id: string;
  instanceId: string;
  pluginId: string;
  trackId: string;
  name: string;
  bypassed: boolean;
  parameters: Record<string, number | boolean | string>;
  currentPresetId: string | null;
  latency: number;
  isLoaded: boolean;
  hasError: boolean;
  errorMessage: string | null;
}

export interface PluginAutomationBinding {
  parameterId: string;
  automationLaneId: string;
  minValue: number;
  maxValue: number;
}

export interface PluginStateManagerState {
  plugins: PluginState[];
  presets: PluginPreset[];
  automationBindings: Map<string, PluginAutomationBinding[]>;
  failedPlugins: string[];
}

type PluginParameterChangeListener = (
  instanceId: string,
  parameterId: string,
  value: Record<string, unknown>,
) => void;

export class PluginStateManager {
  private state: PluginStateManagerState;
  private listeners: Set<() => void> = new Set();
  private parameterListeners: Map<string, Set<PluginParameterChangeListener>> =
    new Map();
  private saveTimer: number | null = null;

  constructor() {
    this.state = {
      plugins: [],
      presets: [],
      automationBindings: new Map(),
      failedPlugins: [],
    };
  }

  getState(): Readonly<PluginStateManagerState> {
    return { ...this.state };
  }

  registerPlugin(
    instanceId: string,
    pluginId: string,
    trackId: string,
    name: string,
    defaultParameters: Record<string, number | boolean | string> = {},
  ): void {
    const existingIndex = this.state.plugins.findIndex(
      (p) => p.instanceId === instanceId,
    );

    const plugin: PluginState = {
      id: pluginId,
      instanceId,
      pluginId,
      trackId,
      name,
      bypassed: false,
      parameters: { ...defaultParameters },
      currentPresetId: null,
      latency: 0,
      isLoaded: true,
      hasError: false,
      errorMessage: null,
    };

    if (existingIndex !== -1) {
      this.state.plugins[existingIndex] = plugin;
    } else {
      this.state.plugins.push(plugin);
    }

    this.notify();
  }

  unregisterPlugin(instanceId: string): void {
    const index = this.state.plugins.findIndex(
      (p) => p.instanceId === instanceId,
    );
    if (index !== -1) {
      this.state.plugins.splice(index, 1);
      this.state.automationBindings.delete(instanceId);
      this.notify();
    }
  }

  setParameter(
    instanceId: string,
    parameterId: string,
    value: number | boolean | string,
  ): void {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) return;

    const oldValue = plugin.parameters[parameterId];
    plugin.parameters[parameterId] = value;
    plugin.currentPresetId = null;

    this.emitParameterChange(instanceId, parameterId, value);
    this.scheduleSave();
    this.notify();
  }

  setParameters(
    instanceId: string,
    parameters: Record<string, number | boolean | string>,
  ): void {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) return;

    for (const [parameterId, value] of Object.entries(parameters)) {
      plugin.parameters[parameterId] = value;
      this.emitParameterChange(instanceId, parameterId, value);
    }

    plugin.currentPresetId = null;
    this.scheduleSave();
    this.notify();
  }

  getParameter(
    instanceId: string,
    parameterId: string,
  ): number | boolean | string | undefined {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    return plugin?.parameters[parameterId];
  }

  getAllParameters(
    instanceId: string,
  ): Record<string, number | boolean | string> | null {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    return plugin ? { ...plugin.parameters } : null;
  }

  setBypass(instanceId: string, bypassed: boolean): void {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (plugin) {
      plugin.bypassed = bypassed;
      this.notify();
    }
  }

  setLatency(instanceId: string, latency: number): void {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (plugin) {
      plugin.latency = latency;
      this.notify();
    }
  }

  reportError(instanceId: string, errorMessage: string): void {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (plugin) {
      plugin.hasError = true;
      plugin.errorMessage = errorMessage;
      if (!this.state.failedPlugins.includes(instanceId)) {
        this.state.failedPlugins.push(instanceId);
      }
      this.notify();
    }
  }

  clearError(instanceId: string): void {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (plugin) {
      plugin.hasError = false;
      plugin.errorMessage = null;
      this.state.failedPlugins = this.state.failedPlugins.filter(
        (id) => id !== instanceId,
      );
      this.notify();
    }
  }

  createPreset(instanceId: string, name: string): string | null {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) return null;

    const id = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const preset: PluginPreset = {
      id,
      name,
      pluginId: plugin.pluginId,
      parameters: { ...plugin.parameters },
      isFactory: false,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };

    this.state.presets.push(preset);
    plugin.currentPresetId = id;
    this.notify();
    return id;
  }

  loadPreset(instanceId: string, presetId: string): boolean {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    const preset = this.state.presets.find((p) => p.id === presetId);

    if (!plugin || !preset) return false;
    if (plugin.pluginId !== preset.pluginId) return false;

    plugin.parameters = { ...preset.parameters };
    plugin.currentPresetId = presetId;

    for (const [parameterId, value] of Object.entries(preset.parameters)) {
      this.emitParameterChange(instanceId, parameterId, value);
    }

    this.notify();
    return true;
  }

  updatePreset(
    presetId: string,
    newParameters?: Record<string, number | boolean | string>,
    newName?: string,
  ): boolean {
    const preset = this.state.presets.find((p) => p.id === presetId);
    if (!preset || preset.isFactory) return false;

    if (newParameters) {
      preset.parameters = { ...newParameters };
    }
    if (newName) {
      preset.name = newName;
    }
    preset.modifiedAt = Date.now();

    this.notify();
    return true;
  }

  deletePreset(presetId: string): boolean {
    const preset = this.state.presets.find((p) => p.id === presetId);
    if (!preset || preset.isFactory) return false;

    const index = this.state.presets.indexOf(preset);
    this.state.presets.splice(index, 1);

    for (const plugin of this.state.plugins) {
      if (plugin.currentPresetId === presetId) {
        plugin.currentPresetId = null;
      }
    }

    this.notify();
    return true;
  }

  getPresetsForPlugin(pluginId: string): PluginPreset[] {
    return this.state.presets.filter((p) => p.pluginId === pluginId);
  }

  importFactoryPresets(
    pluginId: string,
    presets: Array<{
      name: string;
      parameters: Record<string, number | boolean | string>;
    }>,
  ): void {
    for (const preset of presets) {
      const id = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.state.presets.push({
        id,
        name: preset.name,
        pluginId,
        parameters: preset.parameters,
        isFactory: true,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      });
    }
    this.notify();
  }

  bindAutomation(
    instanceId: string,
    parameterId: string,
    automationLaneId: string,
    minValue: number,
    maxValue: number,
  ): void {
    if (!this.state.automationBindings.has(instanceId)) {
      this.state.automationBindings.set(instanceId, []);
    }

    const bindings = this.state.automationBindings.get(instanceId)!;
    const existingIndex = bindings.findIndex(
      (b) => b.parameterId === parameterId,
    );

    const binding: PluginAutomationBinding = {
      parameterId,
      automationLaneId,
      minValue,
      maxValue,
    };

    if (existingIndex !== -1) {
      bindings[existingIndex] = binding;
    } else {
      bindings.push(binding);
    }

    this.notify();
  }

  unbindAutomation(instanceId: string, parameterId: string): void {
    const bindings = this.state.automationBindings.get(instanceId);
    if (bindings) {
      const index = bindings.findIndex((b) => b.parameterId === parameterId);
      if (index !== -1) {
        bindings.splice(index, 1);
        this.notify();
      }
    }
  }

  getAutomationBindings(instanceId: string): PluginAutomationBinding[] {
    return this.state.automationBindings.get(instanceId) || [];
  }

  copyPluginState(instanceId: string): Record<string, any> | null {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) return null;

    return {
      pluginId: plugin.pluginId,
      parameters: { ...plugin.parameters },
      bypassed: plugin.bypassed,
    };
  }

  pastePluginState(instanceId: string, state: Record<string, any>): boolean {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (!plugin) return false;

    if (state.pluginId && state.pluginId !== plugin.pluginId) {
      logger.warn("Cannot paste state from different plugin type");
      return false;
    }

    if (state.parameters) {
      this.setParameters(instanceId, state.parameters);
    }
    if (state.bypassed !== undefined) {
      this.setBypass(instanceId, state.bypassed);
    }

    return true;
  }

  getPluginsForTrack(trackId: string): PluginState[] {
    return this.state.plugins.filter((p) => p.trackId === trackId);
  }

  movePlugin(instanceId: string, newTrackId: string): void {
    const plugin = this.state.plugins.find((p) => p.instanceId === instanceId);
    if (plugin) {
      plugin.trackId = newTrackId;
      this.notify();
    }
  }

  onParameterChange(
    instanceId: string,
    listener: PluginParameterChangeListener,
  ): () => void {
    if (!this.parameterListeners.has(instanceId)) {
      this.parameterListeners.set(instanceId, new Set());
    }
    this.parameterListeners.get(instanceId)!.add(listener);
    return () => this.parameterListeners.get(instanceId)?.delete(listener);
  }

  private emitParameterChange(
    instanceId: string,
    parameterId: string,
    value: Record<string, unknown>,
  ): void {
    this.parameterListeners
      .get(instanceId)
      ?.forEach((l) => l(instanceId, parameterId, value));
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
    }, 1000);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  serialize(): { plugins: PluginState[]; presets: PluginPreset[] } {
    return {
      plugins: structuredClone(this.state.plugins),
      presets: structuredClone(this.state.presets),
    };
  }

  deserialize(data: { plugins: PluginState[]; presets: PluginPreset[] }): void {
    this.state.plugins = structuredClone(data.plugins);
    this.state.presets = structuredClone(data.presets);
    this.notify();
  }
}

export const pluginStateManager = new PluginStateManager();
