import { useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Power,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  Waves,
  Activity,
  Volume2,
  Sparkles,
  Clock,
  Music,
  Zap,
  Wind,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export interface PluginNode {
  id: string;
  type: PluginType;
  name: string;
  bypass: boolean;
  parameters: Record<string, number>;
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
  category: string;
  color: string;
  parameters: { key: string; name: string; min: number; max: number; default: number; unit?: string }[];
}

const PLUGIN_DEFS: PluginDefinition[] = [
  {
    type: 'eq',
    name: 'EQ',
    icon: <Activity className="h-4 w-4" />,
    category: 'EQ',
    color: '#3b82f6',
    parameters: [
      { key: 'low', name: 'Low', min: -12, max: 12, default: 0, unit: 'dB' },
      { key: 'mid', name: 'Mid', min: -12, max: 12, default: 0, unit: 'dB' },
      { key: 'high', name: 'High', min: -12, max: 12, default: 0, unit: 'dB' },
    ],
  },
  {
    type: 'compressor',
    name: 'Comp',
    icon: <Volume2 className="h-4 w-4" />,
    category: 'Dynamics',
    color: '#f59e0b',
    parameters: [
      { key: 'threshold', name: 'Thresh', min: -60, max: 0, default: -20, unit: 'dB' },
      { key: 'ratio', name: 'Ratio', min: 1, max: 20, default: 4 },
      { key: 'attack', name: 'Attack', min: 0.1, max: 100, default: 10, unit: 'ms' },
    ],
  },
  {
    type: 'reverb',
    name: 'Reverb',
    icon: <Waves className="h-4 w-4" />,
    category: 'Space',
    color: '#8b5cf6',
    parameters: [
      { key: 'size', name: 'Size', min: 0, max: 100, default: 50 },
      { key: 'decay', name: 'Decay', min: 0.1, max: 10, default: 2, unit: 's' },
      { key: 'mix', name: 'Mix', min: 0, max: 100, default: 30, unit: '%' },
    ],
  },
  {
    type: 'delay',
    name: 'Delay',
    icon: <Clock className="h-4 w-4" />,
    category: 'Space',
    color: '#06b6d4',
    parameters: [
      { key: 'time', name: 'Time', min: 1, max: 2000, default: 250, unit: 'ms' },
      { key: 'feedback', name: 'Feedback', min: 0, max: 95, default: 40, unit: '%' },
      { key: 'mix', name: 'Mix', min: 0, max: 100, default: 30, unit: '%' },
    ],
  },
  {
    type: 'distortion',
    name: 'Distort',
    icon: <Sparkles className="h-4 w-4" />,
    category: 'Drive',
    color: '#ef4444',
    parameters: [
      { key: 'drive', name: 'Drive', min: 0, max: 100, default: 50 },
      { key: 'tone', name: 'Tone', min: 0, max: 100, default: 50 },
      { key: 'mix', name: 'Mix', min: 0, max: 100, default: 100, unit: '%' },
    ],
  },
  {
    type: 'chorus',
    name: 'Chorus',
    icon: <Music className="h-4 w-4" />,
    category: 'Mod',
    color: '#10b981',
    parameters: [
      { key: 'rate', name: 'Rate', min: 0.1, max: 10, default: 1, unit: 'Hz' },
      { key: 'depth', name: 'Depth', min: 0, max: 100, default: 50 },
      { key: 'mix', name: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
    ],
  },
  {
    type: 'flanger',
    name: 'Flanger',
    icon: <Zap className="h-4 w-4" />,
    category: 'Mod',
    color: '#ec4899',
    parameters: [
      { key: 'rate', name: 'Rate', min: 0.01, max: 10, default: 0.3, unit: 'Hz' },
      { key: 'depth', name: 'Depth', min: 0, max: 100, default: 60 },
      { key: 'feedback', name: 'Feedback', min: -100, max: 100, default: 50 },
    ],
  },
  {
    type: 'phaser',
    name: 'Phaser',
    icon: <Wind className="h-4 w-4" />,
    category: 'Mod',
    color: '#a855f7',
    parameters: [
      { key: 'rate', name: 'Rate', min: 0.01, max: 10, default: 0.5, unit: 'Hz' },
      { key: 'depth', name: 'Depth', min: 0, max: 100, default: 60 },
      { key: 'feedback', name: 'Feedback', min: 0, max: 100, default: 50 },
    ],
  },
  {
    type: 'gate',
    name: 'Gate',
    icon: <Volume2 className="h-4 w-4" />,
    category: 'Dynamics',
    color: '#64748b',
    parameters: [
      { key: 'threshold', name: 'Thresh', min: -80, max: 0, default: -40, unit: 'dB' },
      { key: 'attack', name: 'Attack', min: 0.1, max: 50, default: 1, unit: 'ms' },
      { key: 'release', name: 'Release', min: 10, max: 500, default: 100, unit: 'ms' },
    ],
  },
  {
    type: 'limiter',
    name: 'Limiter',
    icon: <Volume2 className="h-4 w-4" />,
    category: 'Dynamics',
    color: '#dc2626',
    parameters: [
      { key: 'ceiling', name: 'Ceiling', min: -12, max: 0, default: -0.3, unit: 'dB' },
      { key: 'release', name: 'Release', min: 10, max: 1000, default: 100, unit: 'ms' },
    ],
  },
];

const CATEGORIES = ['Dynamics', 'EQ', 'Mod', 'Space', 'Drive'] as const;

interface FlowStatePluginChainProps {
  trackId?: string | null;
  trackName?: string;
  plugins: PluginNode[];
  onPluginsChange: (plugins: PluginNode[]) => void;
  onClose?: () => void;
  maxPlugins?: number;
}

export function FlowStatePluginChain({
  trackId,
  trackName = 'Master',
  plugins,
  onPluginsChange,
  onClose,
  maxPlugins = 8,
}: FlowStatePluginChainProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Dynamics');
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);

  const addPlugin = useCallback((type: PluginType) => {
    if (plugins.length >= maxPlugins) return;
    const def = PLUGIN_DEFS.find(p => p.type === type);
    if (!def) return;

    const params: Record<string, number> = {};
    def.parameters.forEach(p => { params[p.key] = p.default; });

    const newPlugin: PluginNode = {
      id: `plugin-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type,
      name: def.name,
      bypass: false,
      parameters: params,
    };

    onPluginsChange([...plugins, newPlugin]);
    setShowAddMenu(false);
  }, [plugins, maxPlugins, onPluginsChange]);

  const removePlugin = useCallback((id: string) => {
    onPluginsChange(plugins.filter(p => p.id !== id));
  }, [plugins, onPluginsChange]);

  const toggleBypass = useCallback((id: string) => {
    onPluginsChange(plugins.map(p => p.id === id ? { ...p, bypass: !p.bypass } : p));
  }, [plugins, onPluginsChange]);

  const updateParam = useCallback((id: string, key: string, value: number) => {
    onPluginsChange(plugins.map(p => 
      p.id === id ? { ...p, parameters: { ...p.parameters, [key]: value } } : p
    ));
  }, [plugins, onPluginsChange]);

  const handleReorder = useCallback((reordered: PluginNode[]) => {
    onPluginsChange(reordered);
  }, [onPluginsChange]);

  return (
    <div className="flex flex-col h-full bg-slate-900/95 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-medium text-white">{trackName} Effects Chain</span>
          <span className="text-xs text-white/40">{plugins.length}/{maxPlugins}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => setShowAddMenu(!showAddMenu)}
            disabled={plugins.length >= maxPlugins}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Effect
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-white/40 hover:text-white hover:bg-white/10"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAddMenu && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/10 overflow-hidden"
          >
            <div className="p-3 space-y-3">
              <div className="flex gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                      selectedCategory === cat
                        ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                        : "text-white/50 hover:text-white/80 hover:bg-white/5"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {PLUGIN_DEFS.filter(p => p.category === selectedCategory).map(def => (
                  <button
                    key={def.type}
                    onClick={() => addPlugin(def.type)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 
                      border border-white/10 hover:border-white/20 transition-all group"
                    style={{ borderLeftColor: def.color, borderLeftWidth: 3 }}
                  >
                    <span style={{ color: def.color }}>{def.icon}</span>
                    <span className="text-xs font-medium text-white/80 group-hover:text-white">{def.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-3">
        {plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
              <Sparkles className="h-6 w-6 text-white/20" />
            </div>
            <p className="text-sm text-white/40">No effects in chain</p>
            <p className="text-xs text-white/20 mt-1">Click "Add Effect" to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Volume2 className="h-4 w-4 text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-white/60">INPUT</span>
              <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/40 to-transparent" />
            </div>

            <Reorder.Group
              axis="y"
              values={plugins}
              onReorder={handleReorder}
              className="space-y-2"
            >
              <AnimatePresence>
                {plugins.map((plugin, index) => {
                  const def = PLUGIN_DEFS.find(d => d.type === plugin.type);
                  if (!def) return null;
                  const isExpanded = expandedPlugin === plugin.id;

                  return (
                    <Reorder.Item key={plugin.id} value={plugin} className="touch-none">
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={cn(
                          "rounded-lg border transition-all overflow-hidden",
                          plugin.bypass 
                            ? "bg-white/5 border-white/5 opacity-50" 
                            : "bg-white/10 border-white/10"
                        )}
                      >
                        <div 
                          className="flex items-center gap-2 p-2"
                          style={{ borderLeft: `3px solid ${def.color}` }}
                        >
                          <GripVertical className="h-4 w-4 text-white/30 cursor-grab active:cursor-grabbing" />
                          
                          <button
                            onClick={() => toggleBypass(plugin.id)}
                            className={cn(
                              "w-6 h-6 rounded flex items-center justify-center transition-all",
                              plugin.bypass ? "bg-white/5" : "bg-white/10"
                            )}
                          >
                            <Power 
                              className="h-3.5 w-3.5" 
                              style={{ color: plugin.bypass ? '#666' : def.color }}
                            />
                          </button>

                          <div className="flex-1">
                            <span className="text-xs font-medium text-white">{plugin.name}</span>
                          </div>

                          <button
                            onClick={() => setExpandedPlugin(isExpanded ? null : plugin.id)}
                            className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10"
                          >
                            <ChevronDown 
                              className={cn(
                                "h-4 w-4 text-white/40 transition-transform",
                                isExpanded && "rotate-180"
                              )}
                            />
                          </button>

                          <button
                            onClick={() => removePlugin(plugin.id)}
                            className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400/60 hover:text-red-400" />
                          </button>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-3 pt-1 space-y-3 border-t border-white/5">
                                {def.parameters.map(param => (
                                  <div key={param.key} className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] text-white/50">{param.name}</span>
                                      <span className="text-[10px] text-white/70 font-mono">
                                        {(plugin.parameters[param.key] ?? param.default).toFixed(1)}
                                        {param.unit}
                                      </span>
                                    </div>
                                    <Slider
                                      value={[plugin.parameters[param.key] ?? param.default]}
                                      min={param.min}
                                      max={param.max}
                                      step={(param.max - param.min) / 100}
                                      onValueChange={([v]) => updateParam(plugin.id, param.key, v)}
                                      className="w-full"
                                    />
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>

                      {index < plugins.length - 1 && (
                        <div className="flex items-center justify-center py-1">
                          <div className="w-px h-4 bg-gradient-to-b from-white/20 to-white/5" />
                        </div>
                      )}
                    </Reorder.Item>
                  );
                })}
              </AnimatePresence>
            </Reorder.Group>

            <div className="flex items-center gap-2 mt-3">
              <div className="flex-1 h-px bg-gradient-to-l from-violet-500/40 to-transparent" />
              <span className="text-xs font-medium text-white/60">OUTPUT</span>
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Volume2 className="h-4 w-4 text-violet-400" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
