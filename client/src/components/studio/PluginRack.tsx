import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Power,
  Settings,
  Trash2,
  GripVertical,
  Plus,
  Waves,
  Activity,
  Volume2,
  Sparkles,
  Clock,
  Music,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { Knob } from './Knob';
import { audioEngine } from '@/lib/audioEngine';

export interface PluginInstance {
  id: string;
  type: PluginType;
  name: string;
  bypass: boolean;
  expanded: boolean;
  parameters: Record<string, number>;
  preset?: string;
}

export type PluginType = 
  | 'eq'
  | 'compressor'
  | 'reverb'
  | 'delay'
  | 'distortion'
  | 'chorus'
  | 'flanger'
  | 'phaser'
  | 'gate'
  | 'limiter';

interface PluginDefinition {
  type: PluginType;
  name: string;
  icon: React.ReactNode;
  category: 'dynamics' | 'eq' | 'modulation' | 'time-based' | 'distortion';
  parameters: {
    name: string;
    key: string;
    min: number;
    max: number;
    default: number;
    unit?: string;
  }[];
  color: string;
}

const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  {
    type: 'eq',
    name: 'Parametric EQ',
    icon: <Activity className="h-3.5 w-3.5" />,
    category: 'eq',
    color: '#3b82f6',
    parameters: [
      { name: 'Low', key: 'low', min: -12, max: 12, default: 0, unit: 'dB' },
      { name: 'Mid', key: 'mid', min: -12, max: 12, default: 0, unit: 'dB' },
      { name: 'High', key: 'high', min: -12, max: 12, default: 0, unit: 'dB' },
      { name: 'Mid Freq', key: 'midFreq', min: 200, max: 8000, default: 1000, unit: 'Hz' },
    ],
  },
  {
    type: 'compressor',
    name: 'Compressor',
    icon: <Volume2 className="h-3.5 w-3.5" />,
    category: 'dynamics',
    color: '#f59e0b',
    parameters: [
      { name: 'Threshold', key: 'threshold', min: -60, max: 0, default: -20, unit: 'dB' },
      { name: 'Ratio', key: 'ratio', min: 1, max: 20, default: 4 },
      { name: 'Attack', key: 'attack', min: 0.1, max: 100, default: 10, unit: 'ms' },
      { name: 'Release', key: 'release', min: 10, max: 1000, default: 100, unit: 'ms' },
      { name: 'Makeup', key: 'makeup', min: 0, max: 24, default: 0, unit: 'dB' },
    ],
  },
  {
    type: 'reverb',
    name: 'Reverb',
    icon: <Waves className="h-3.5 w-3.5" />,
    category: 'time-based',
    color: '#8b5cf6',
    parameters: [
      { name: 'Size', key: 'size', min: 0, max: 100, default: 50 },
      { name: 'Decay', key: 'decay', min: 0.1, max: 10, default: 2, unit: 's' },
      { name: 'Damping', key: 'damping', min: 0, max: 100, default: 50 },
      { name: 'Mix', key: 'mix', min: 0, max: 100, default: 30, unit: '%' },
    ],
  },
  {
    type: 'delay',
    name: 'Delay',
    icon: <Clock className="h-3.5 w-3.5" />,
    category: 'time-based',
    color: '#06b6d4',
    parameters: [
      { name: 'Time', key: 'time', min: 1, max: 2000, default: 250, unit: 'ms' },
      { name: 'Feedback', key: 'feedback', min: 0, max: 95, default: 40, unit: '%' },
      { name: 'Mix', key: 'mix', min: 0, max: 100, default: 30, unit: '%' },
    ],
  },
  {
    type: 'distortion',
    name: 'Distortion',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    category: 'distortion',
    color: '#ef4444',
    parameters: [
      { name: 'Drive', key: 'drive', min: 0, max: 100, default: 50 },
      { name: 'Tone', key: 'tone', min: 0, max: 100, default: 50 },
      { name: 'Mix', key: 'mix', min: 0, max: 100, default: 100, unit: '%' },
    ],
  },
  {
    type: 'chorus',
    name: 'Chorus',
    icon: <Music className="h-3.5 w-3.5" />,
    category: 'modulation',
    color: '#10b981',
    parameters: [
      { name: 'Rate', key: 'rate', min: 0.1, max: 10, default: 1, unit: 'Hz' },
      { name: 'Depth', key: 'depth', min: 0, max: 100, default: 50 },
      { name: 'Mix', key: 'mix', min: 0, max: 100, default: 50, unit: '%' },
    ],
  },
  {
    type: 'gate',
    name: 'Noise Gate',
    icon: <Volume2 className="h-3.5 w-3.5" />,
    category: 'dynamics',
    color: '#64748b',
    parameters: [
      { name: 'Threshold', key: 'threshold', min: -80, max: 0, default: -40, unit: 'dB' },
      { name: 'Attack', key: 'attack', min: 0.1, max: 50, default: 1, unit: 'ms' },
      { name: 'Release', key: 'release', min: 10, max: 500, default: 100, unit: 'ms' },
      { name: 'Range', key: 'range', min: -80, max: 0, default: -80, unit: 'dB' },
    ],
  },
  {
    type: 'limiter',
    name: 'Limiter',
    icon: <Volume2 className="h-3.5 w-3.5" />,
    category: 'dynamics',
    color: '#dc2626',
    parameters: [
      { name: 'Ceiling', key: 'ceiling', min: -12, max: 0, default: -0.3, unit: 'dB' },
      { name: 'Release', key: 'release', min: 10, max: 1000, default: 100, unit: 'ms' },
    ],
  },
];

const PLUGIN_CATEGORIES = [
  { id: 'dynamics', name: 'Dynamics', plugins: ['compressor', 'gate', 'limiter'] },
  { id: 'eq', name: 'EQ & Filters', plugins: ['eq'] },
  { id: 'modulation', name: 'Modulation', plugins: ['chorus', 'flanger', 'phaser'] },
  { id: 'time-based', name: 'Time-Based', plugins: ['reverb', 'delay'] },
  { id: 'distortion', name: 'Distortion', plugins: ['distortion'] },
];

interface PluginRackProps {
  trackId: string;
  plugins: PluginInstance[];
  onPluginsChange: (plugins: PluginInstance[]) => void;
  maxPlugins?: number;
}

export function PluginRack({
  trackId,
  plugins,
  onPluginsChange,
  maxPlugins = 8,
}: PluginRackProps) {
  const [draggedPlugin, setDraggedPlugin] = useState<string | null>(null);

  const addPlugin = useCallback((type: PluginType) => {
    if (plugins.length >= maxPlugins) return;

    const definition = PLUGIN_DEFINITIONS.find((p) => p.type === type);
    if (!definition) return;

    const defaultParams: Record<string, number> = {};
    definition.parameters.forEach((param) => {
      defaultParams[param.key] = param.default;
    });

    const newPlugin: PluginInstance = {
      id: `plugin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      name: definition.name,
      bypass: false,
      expanded: true,
      parameters: defaultParams,
    };

    onPluginsChange([...plugins, newPlugin]);
  }, [plugins, maxPlugins, onPluginsChange]);

  const removePlugin = useCallback((pluginId: string) => {
    onPluginsChange(plugins.filter((p) => p.id !== pluginId));
  }, [plugins, onPluginsChange]);

  const applyPluginToAudioEngine = useCallback((plugin: PluginInstance) => {
    switch (plugin.type) {
      case 'eq':
        audioEngine.updateTrackEQ(trackId, {
          lowGain: plugin.parameters.low ?? 0,
          midGain: plugin.parameters.mid ?? 0,
          highGain: plugin.parameters.high ?? 0,
          midFrequency: plugin.parameters.midFreq ?? 1000,
          bypass: plugin.bypass,
        });
        break;
      case 'compressor':
        audioEngine.updateTrackCompressor(trackId, {
          threshold: plugin.parameters.threshold ?? -20,
          ratio: plugin.parameters.ratio ?? 4,
          attack: plugin.parameters.attack ?? 10,
          release: plugin.parameters.release ?? 100,
          knee: plugin.parameters.knee ?? 6,
          bypass: plugin.bypass,
        });
        break;
      case 'reverb':
        audioEngine.updateTrackReverb(trackId, {
          mix: plugin.parameters.mix ?? 30,
          decay: plugin.parameters.decay ?? 2,
          preDelay: plugin.parameters.preDelay ?? 0,
          bypass: plugin.bypass,
        });
        break;
      default:
        break;
    }
  }, [trackId]);

  const toggleBypass = useCallback((pluginId: string) => {
    const updatedPlugins = plugins.map((p) =>
      p.id === pluginId ? { ...p, bypass: !p.bypass } : p
    );
    onPluginsChange(updatedPlugins);
    
    const plugin = updatedPlugins.find(p => p.id === pluginId);
    if (plugin) {
      applyPluginToAudioEngine(plugin);
    }
  }, [plugins, onPluginsChange, applyPluginToAudioEngine]);

  const toggleExpanded = useCallback((pluginId: string) => {
    onPluginsChange(
      plugins.map((p) =>
        p.id === pluginId ? { ...p, expanded: !p.expanded } : p
      )
    );
  }, [plugins, onPluginsChange]);

  const updateParameter = useCallback((pluginId: string, key: string, value: number) => {
    const updatedPlugins = plugins.map((p) =>
      p.id === pluginId
        ? { ...p, parameters: { ...p.parameters, [key]: value } }
        : p
    );
    onPluginsChange(updatedPlugins);
    
    const plugin = updatedPlugins.find(p => p.id === pluginId);
    if (plugin) {
      applyPluginToAudioEngine(plugin);
    }
  }, [plugins, onPluginsChange, applyPluginToAudioEngine]);

  useEffect(() => {
    plugins.forEach(plugin => {
      applyPluginToAudioEngine(plugin);
    });
  }, [trackId, applyPluginToAudioEngine]);

  const handleReorder = useCallback((reorderedPlugins: PluginInstance[]) => {
    onPluginsChange(reorderedPlugins);
  }, [onPluginsChange]);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: 'var(--studio-bg-deep)',
        border: '1px solid var(--studio-border)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: 'var(--studio-text-muted)' }}
        >
          Insert Effects ({plugins.length}/{maxPlugins})
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              disabled={plugins.length >= maxPlugins}
            >
              <Plus className="h-3 w-3 mr-1" />
              <span className="text-xs">Add</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {PLUGIN_CATEGORIES.map((category) => (
              <DropdownMenuSub key={category.id}>
                <DropdownMenuSubTrigger className="text-xs">
                  {category.name}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {category.plugins.map((pluginType) => {
                    const def = PLUGIN_DEFINITIONS.find((p) => p.type === pluginType);
                    if (!def) return null;
                    return (
                      <DropdownMenuItem
                        key={pluginType}
                        className="text-xs"
                        onClick={() => addPlugin(pluginType as PluginType)}
                      >
                        <span className="mr-2">{def.icon}</span>
                        {def.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-2 space-y-1">
        {plugins.length === 0 ? (
          <div
            className="text-center py-6 text-xs"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            No effects added. Click "Add" to insert an effect.
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={plugins}
            onReorder={handleReorder}
            className="space-y-1"
          >
            <AnimatePresence>
              {plugins.map((plugin) => {
                const definition = PLUGIN_DEFINITIONS.find((d) => d.type === plugin.type);
                if (!definition) return null;

                return (
                  <Reorder.Item
                    key={plugin.id}
                    value={plugin}
                    className="touch-none"
                  >
                    <motion.div
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded overflow-hidden"
                      style={{
                        background: plugin.bypass
                          ? 'var(--studio-surface)'
                          : 'var(--studio-bg-medium)',
                        border: '1px solid var(--studio-border)',
                        opacity: plugin.bypass ? 0.6 : 1,
                      }}
                    >
                      <div
                        className="flex items-center gap-2 px-2 py-1.5"
                        style={{ borderLeft: `3px solid ${definition.color}` }}
                      >
                        <GripVertical
                          className="h-3 w-3 cursor-grab active:cursor-grabbing"
                          style={{ color: 'var(--studio-text-muted)' }}
                        />

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => toggleBypass(plugin.id)}
                          title={plugin.bypass ? 'Enable' : 'Bypass'}
                        >
                          <Power
                            className="h-3 w-3"
                            style={{
                              color: plugin.bypass
                                ? 'var(--studio-text-muted)'
                                : definition.color,
                            }}
                          />
                        </Button>

                        <span
                          className="flex-1 text-xs font-medium truncate"
                          style={{ color: 'var(--studio-text)' }}
                        >
                          {plugin.name}
                        </span>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => toggleExpanded(plugin.id)}
                        >
                          {plugin.expanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 hover:text-red-500"
                          onClick={() => removePlugin(plugin.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      <AnimatePresence>
                        {plugin.expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t"
                            style={{ borderColor: 'var(--studio-border)' }}
                          >
                            <div className="p-3 flex flex-wrap gap-4 justify-center">
                              {definition.parameters.map((param) => (
                                <div key={param.key} className="flex flex-col items-center gap-1">
                                  <Knob
                                    value={plugin.parameters[param.key] ?? param.default}
                                    onChange={(val) => updateParameter(plugin.id, param.key, val)}
                                    min={param.min}
                                    max={param.max}
                                    size={40}
                                    color={definition.color}
                                    disabled={plugin.bypass}
                                  />
                                  <span
                                    className="text-[9px] font-medium uppercase"
                                    style={{ color: 'var(--studio-text-muted)' }}
                                  >
                                    {param.name}
                                  </span>
                                  <span
                                    className="text-[10px] font-mono"
                                    style={{ color: 'var(--studio-text)' }}
                                  >
                                    {(plugin.parameters[param.key] ?? param.default).toFixed(
                                      param.max > 100 ? 0 : 1
                                    )}
                                    {param.unit || ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </Reorder.Item>
                );
              })}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </div>
    </div>
  );
}
