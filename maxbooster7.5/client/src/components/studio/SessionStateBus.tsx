import { 
  createContext, 
  useContext, 
  useCallback, 
  useEffect, 
  useRef,
  useState,
  type ReactNode 
} from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  Radio,
  Link,
  Unlink,
  RefreshCw,
  Activity,
  Eye,
  EyeOff,
  Settings,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  Download,
  Upload,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type PluginParameterType = 'number' | 'boolean' | 'string' | 'enum' | 'color';

export interface PluginParameter {
  id: string;
  name: string;
  type: PluginParameterType;
  value: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  unit?: string;
}

export interface PluginState {
  id: string;
  name: string;
  type: string;
  trackId: string;
  enabled: boolean;
  parameters: Record<string, PluginParameter>;
  viewState: {
    expanded: boolean;
    visible: boolean;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  };
  presetName?: string;
  lastModified: number;
}

export interface ParameterLink {
  id: string;
  sourcePluginId: string;
  sourceParameterId: string;
  targetPluginId: string;
  targetParameterId: string;
  scale: number;
  offset: number;
  enabled: boolean;
  bidirectional: boolean;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  timestamp: number;
  plugins: Record<string, PluginState>;
  links: ParameterLink[];
}

interface SessionStateBusState {
  plugins: Record<string, PluginState>;
  links: ParameterLink[];
  snapshots: SessionSnapshot[];
  activeSnapshotId: string | null;
  globalBypass: boolean;
  syncEnabled: boolean;
  
  registerPlugin: (plugin: Omit<PluginState, 'lastModified'>) => void;
  unregisterPlugin: (pluginId: string) => void;
  updatePluginParameter: (pluginId: string, parameterId: string, value: number | boolean | string) => void;
  updatePluginViewState: (pluginId: string, viewState: Partial<PluginState['viewState']>) => void;
  setPluginEnabled: (pluginId: string, enabled: boolean) => void;
  
  createLink: (link: Omit<ParameterLink, 'id'>) => void;
  removeLink: (linkId: string) => void;
  updateLink: (linkId: string, updates: Partial<ParameterLink>) => void;
  
  createSnapshot: (name: string) => void;
  loadSnapshot: (snapshotId: string) => void;
  deleteSnapshot: (snapshotId: string) => void;
  
  setGlobalBypass: (bypass: boolean) => void;
  setSyncEnabled: (enabled: boolean) => void;
  
  getPluginsByTrack: (trackId: string) => PluginState[];
  getLinkedParameters: (pluginId: string, parameterId: string) => ParameterLink[];
}

export const useSessionStateBus = create<SessionStateBusState>()(
  subscribeWithSelector((set, get) => ({
    plugins: {},
    links: [],
    snapshots: [],
    activeSnapshotId: null,
    globalBypass: false,
    syncEnabled: true,

    registerPlugin: (plugin) => {
      set((state) => ({
        plugins: {
          ...state.plugins,
          [plugin.id]: {
            ...plugin,
            lastModified: Date.now(),
          },
        },
      }));
    },

    unregisterPlugin: (pluginId) => {
      set((state) => {
        const { [pluginId]: removed, ...rest } = state.plugins;
        return {
          plugins: rest,
          links: state.links.filter(
            (link) => link.sourcePluginId !== pluginId && link.targetPluginId !== pluginId
          ),
        };
      });
    },

    updatePluginParameter: (pluginId, parameterId, value) => {
      const state = get();
      
      set((state) => ({
        plugins: {
          ...state.plugins,
          [pluginId]: {
            ...state.plugins[pluginId],
            parameters: {
              ...state.plugins[pluginId]?.parameters,
              [parameterId]: {
                ...state.plugins[pluginId]?.parameters[parameterId],
                value,
              },
            },
            lastModified: Date.now(),
          },
        },
      }));

      if (state.syncEnabled) {
        const linkedParams = state.links.filter(
          (link) =>
            link.enabled &&
            ((link.sourcePluginId === pluginId && link.sourceParameterId === parameterId) ||
              (link.bidirectional &&
                link.targetPluginId === pluginId &&
                link.targetParameterId === parameterId))
        );

        linkedParams.forEach((link) => {
          const isSource = link.sourcePluginId === pluginId;
          const targetPluginId = isSource ? link.targetPluginId : link.sourcePluginId;
          const targetParamId = isSource ? link.targetParameterId : link.sourceParameterId;

          if (typeof value === 'number') {
            const scaledValue = isSource 
              ? value * link.scale + link.offset 
              : (value - link.offset) / link.scale;
            
            const targetPlugin = state.plugins[targetPluginId];
            const targetParam = targetPlugin?.parameters[targetParamId];
            
            if (targetParam && typeof targetParam.value === 'number') {
              const clampedValue = Math.max(
                targetParam.min ?? -Infinity,
                Math.min(targetParam.max ?? Infinity, scaledValue)
              );
              
              set((s) => ({
                plugins: {
                  ...s.plugins,
                  [targetPluginId]: {
                    ...s.plugins[targetPluginId],
                    parameters: {
                      ...s.plugins[targetPluginId]?.parameters,
                      [targetParamId]: {
                        ...s.plugins[targetPluginId]?.parameters[targetParamId],
                        value: clampedValue,
                      },
                    },
                    lastModified: Date.now(),
                  },
                },
              }));
            }
          }
        });
      }
    },

    updatePluginViewState: (pluginId, viewState) => {
      set((state) => ({
        plugins: {
          ...state.plugins,
          [pluginId]: {
            ...state.plugins[pluginId],
            viewState: {
              ...state.plugins[pluginId]?.viewState,
              ...viewState,
            },
            lastModified: Date.now(),
          },
        },
      }));
    },

    setPluginEnabled: (pluginId, enabled) => {
      set((state) => ({
        plugins: {
          ...state.plugins,
          [pluginId]: {
            ...state.plugins[pluginId],
            enabled,
            lastModified: Date.now(),
          },
        },
      }));
    },

    createLink: (link) => {
      const newLink: ParameterLink = {
        ...link,
        id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };
      set((state) => ({
        links: [...state.links, newLink],
      }));
    },

    removeLink: (linkId) => {
      set((state) => ({
        links: state.links.filter((link) => link.id !== linkId),
      }));
    },

    updateLink: (linkId, updates) => {
      set((state) => ({
        links: state.links.map((link) =>
          link.id === linkId ? { ...link, ...updates } : link
        ),
      }));
    },

    createSnapshot: (name) => {
      const state = get();
      const snapshot: SessionSnapshot = {
        id: `snapshot-${Date.now()}`,
        name,
        timestamp: Date.now(),
        plugins: JSON.parse(JSON.stringify(state.plugins)),
        links: JSON.parse(JSON.stringify(state.links)),
      };
      set((state) => ({
        snapshots: [...state.snapshots, snapshot],
      }));
    },

    loadSnapshot: (snapshotId) => {
      const state = get();
      const snapshot = state.snapshots.find((s) => s.id === snapshotId);
      if (snapshot) {
        set({
          plugins: JSON.parse(JSON.stringify(snapshot.plugins)),
          links: JSON.parse(JSON.stringify(snapshot.links)),
          activeSnapshotId: snapshotId,
        });
      }
    },

    deleteSnapshot: (snapshotId) => {
      set((state) => ({
        snapshots: state.snapshots.filter((s) => s.id !== snapshotId),
        activeSnapshotId:
          state.activeSnapshotId === snapshotId ? null : state.activeSnapshotId,
      }));
    },

    setGlobalBypass: (bypass) => {
      set({ globalBypass: bypass });
    },

    setSyncEnabled: (enabled) => {
      set({ syncEnabled: enabled });
    },

    getPluginsByTrack: (trackId) => {
      const state = get();
      return Object.values(state.plugins).filter((p) => p.trackId === trackId);
    },

    getLinkedParameters: (pluginId, parameterId) => {
      const state = get();
      return state.links.filter(
        (link) =>
          (link.sourcePluginId === pluginId && link.sourceParameterId === parameterId) ||
          (link.targetPluginId === pluginId && link.targetParameterId === parameterId)
      );
    },
  }))
);

export function usePluginState(pluginId: string) {
  const plugin = useSessionStateBus((state) => state.plugins[pluginId]);
  const updateParameter = useSessionStateBus((state) => state.updatePluginParameter);
  const updateViewState = useSessionStateBus((state) => state.updatePluginViewState);
  const setEnabled = useSessionStateBus((state) => state.setPluginEnabled);

  return {
    plugin,
    updateParameter: useCallback(
      (parameterId: string, value: number | boolean | string) => {
        updateParameter(pluginId, parameterId, value);
      },
      [pluginId, updateParameter]
    ),
    updateViewState: useCallback(
      (viewState: Partial<PluginState['viewState']>) => {
        updateViewState(pluginId, viewState);
      },
      [pluginId, updateViewState]
    ),
    setEnabled: useCallback(
      (enabled: boolean) => {
        setEnabled(pluginId, enabled);
      },
      [pluginId, setEnabled]
    ),
  };
}

export function useParameterSync(
  pluginId: string,
  parameterId: string,
  initialValue: number | boolean | string
) {
  const updateParameter = useSessionStateBus((state) => state.updatePluginParameter);
  const value = useSessionStateBus(
    (state) => state.plugins[pluginId]?.parameters[parameterId]?.value ?? initialValue
  );

  const setValue = useCallback(
    (newValue: number | boolean | string) => {
      updateParameter(pluginId, parameterId, newValue);
    },
    [pluginId, parameterId, updateParameter]
  );

  return [value, setValue] as const;
}

interface SessionStateBusPanelProps {
  className?: string;
}

export function SessionStateBusPanel({ className = '' }: SessionStateBusPanelProps) {
  const plugins = useSessionStateBus((state) => state.plugins);
  const links = useSessionStateBus((state) => state.links);
  const snapshots = useSessionStateBus((state) => state.snapshots);
  const globalBypass = useSessionStateBus((state) => state.globalBypass);
  const syncEnabled = useSessionStateBus((state) => state.syncEnabled);
  const activeSnapshotId = useSessionStateBus((state) => state.activeSnapshotId);

  const createLink = useSessionStateBus((state) => state.createLink);
  const removeLink = useSessionStateBus((state) => state.removeLink);
  const updateLink = useSessionStateBus((state) => state.updateLink);
  const createSnapshot = useSessionStateBus((state) => state.createSnapshot);
  const loadSnapshot = useSessionStateBus((state) => state.loadSnapshot);
  const deleteSnapshot = useSessionStateBus((state) => state.deleteSnapshot);
  const setGlobalBypass = useSessionStateBus((state) => state.setGlobalBypass);
  const setSyncEnabled = useSessionStateBus((state) => state.setSyncEnabled);

  const [expandedSection, setExpandedSection] = useState<'plugins' | 'links' | 'snapshots' | null>('plugins');
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [linkCreationMode, setLinkCreationMode] = useState(false);
  const [selectedSource, setSelectedSource] = useState<{ pluginId: string; paramId: string } | null>(null);

  const pluginList = Object.values(plugins);
  const pluginsByTrack = pluginList.reduce((acc, plugin) => {
    if (!acc[plugin.trackId]) {
      acc[plugin.trackId] = [];
    }
    acc[plugin.trackId].push(plugin);
    return acc;
  }, {} as Record<string, PluginState[]>);

  const handleCreateLink = (targetPluginId: string, targetParamId: string) => {
    if (!selectedSource) return;
    
    createLink({
      sourcePluginId: selectedSource.pluginId,
      sourceParameterId: selectedSource.paramId,
      targetPluginId,
      targetParameterId: targetParamId,
      scale: 1,
      offset: 0,
      enabled: true,
      bidirectional: false,
    });
    
    setSelectedSource(null);
    setLinkCreationMode(false);
  };

  const handleExportState = () => {
    const state = {
      plugins,
      links,
      snapshots,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-state-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{
        background: 'var(--studio-bg-medium)',
        borderColor: 'var(--studio-border)',
      }}
    >
      <div
        className="h-10 px-3 flex items-center justify-between border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-semibold" style={{ color: 'var(--studio-text)' }}>
            Session State Bus
          </span>
          <Badge variant="outline" className="text-[9px]">
            {pluginList.length} plugins
          </Badge>
          {links.length > 0 && (
            <Badge variant="secondary" className="text-[9px]">
              {links.filter((l) => l.enabled).length} links
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Switch
              checked={syncEnabled}
              onCheckedChange={setSyncEnabled}
              className="h-4 w-7"
            />
            <Label className="text-[10px]">Sync</Label>
          </div>
          <div className="flex items-center gap-1">
            <Switch
              checked={!globalBypass}
              onCheckedChange={(checked) => setGlobalBypass(!checked)}
              className="h-4 w-7"
            />
            <Label className="text-[10px]">Active</Label>
          </div>
        </div>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="p-2">
          <div className="mb-2">
            <button
              onClick={() => setExpandedSection(expandedSection === 'plugins' ? null : 'plugins')}
              className="w-full flex items-center justify-between p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-400" />
                <span className="text-xs font-semibold" style={{ color: 'var(--studio-text)' }}>
                  Registered Plugins
                </span>
                <Badge variant="secondary" className="text-[9px]">
                  {pluginList.length}
                </Badge>
              </div>
              {expandedSection === 'plugins' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>

            <AnimatePresence>
              {expandedSection === 'plugins' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-2 space-y-2">
                    {Object.entries(pluginsByTrack).map(([trackId, trackPlugins]) => (
                      <div
                        key={trackId}
                        className="p-2 rounded border"
                        style={{
                          borderColor: 'var(--studio-border)',
                          background: 'var(--studio-bg-deep)',
                        }}
                      >
                        <div className="text-[10px] font-semibold text-gray-400 mb-2">
                          Track: {trackId}
                        </div>
                        <div className="space-y-1">
                          {trackPlugins.map((plugin) => (
                            <div
                              key={plugin.id}
                              className="flex items-center justify-between p-1.5 rounded bg-white/5"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    plugin.enabled ? 'bg-green-400' : 'bg-gray-500'
                                  }`}
                                />
                                <span className="text-xs" style={{ color: 'var(--studio-text)' }}>
                                  {plugin.name}
                                </span>
                                <Badge variant="outline" className="text-[8px]">
                                  {plugin.type}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5"
                                  onClick={() => {
                                    if (linkCreationMode && selectedSource) {
                                      setSelectedSource(null);
                                      setLinkCreationMode(false);
                                    } else {
                                      setLinkCreationMode(true);
                                      const firstParam = Object.keys(plugin.parameters)[0];
                                      if (firstParam) {
                                        setSelectedSource({ pluginId: plugin.id, paramId: firstParam });
                                      }
                                    }
                                  }}
                                >
                                  {linkCreationMode && selectedSource?.pluginId === plugin.id ? (
                                    <Unlink className="h-3 w-3 text-yellow-400" />
                                  ) : (
                                    <Link className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5"
                                >
                                  {plugin.viewState.visible ? (
                                    <Eye className="h-3 w-3" />
                                  ) : (
                                    <EyeOff className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {pluginList.length === 0 && (
                      <div className="text-center py-4 text-xs text-gray-500">
                        No plugins registered yet
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Separator className="my-2" />

          <div className="mb-2">
            <button
              onClick={() => setExpandedSection(expandedSection === 'links' ? null : 'links')}
              className="w-full flex items-center justify-between p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <Link className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold" style={{ color: 'var(--studio-text)' }}>
                  Parameter Links
                </span>
                <Badge variant="secondary" className="text-[9px]">{links.length}</Badge>
              </div>
              {expandedSection === 'links' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>

            <AnimatePresence>
              {expandedSection === 'links' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-2 space-y-2">
                    {links.length === 0 ? (
                      <div className="text-center py-4 text-xs text-gray-500">
                        No parameter links. Click the link icon on a plugin to create one.
                      </div>
                    ) : (
                      links.map((link) => {
                        const sourcePlugin = plugins[link.sourcePluginId];
                        const targetPlugin = plugins[link.targetPluginId];
                        
                        return (
                          <div
                            key={link.id}
                            className="p-2 rounded border"
                            style={{
                              borderColor: link.enabled ? 'var(--studio-accent)' : 'var(--studio-border)',
                              background: 'var(--studio-bg-deep)',
                              opacity: link.enabled ? 1 : 0.6,
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={link.enabled}
                                  onCheckedChange={(checked) =>
                                    updateLink(link.id, { enabled: checked })
                                  }
                                  className="h-4 w-7"
                                />
                                {link.bidirectional && (
                                  <Badge variant="secondary" className="text-[8px]">
                                    Bi-dir
                                  </Badge>
                                )}
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 text-red-400"
                                onClick={() => removeLink(link.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            
                            <div className="flex items-center gap-2 text-[10px]">
                              <div className="flex-1 text-right">
                                <div className="font-semibold">{sourcePlugin?.name}</div>
                                <div className="text-gray-500">{link.sourceParameterId}</div>
                              </div>
                              <div className="flex flex-col items-center">
                                <RefreshCw className="h-3 w-3 text-blue-400" />
                                <span className="text-[8px] text-gray-500">
                                  {link.scale}x + {link.offset}
                                </span>
                              </div>
                              <div className="flex-1">
                                <div className="font-semibold">{targetPlugin?.name}</div>
                                <div className="text-gray-500">{link.targetParameterId}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Separator className="my-2" />

          <div>
            <button
              onClick={() => setExpandedSection(expandedSection === 'snapshots' ? null : 'snapshots')}
              className="w-full flex items-center justify-between p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <Copy className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold" style={{ color: 'var(--studio-text)' }}>
                  Snapshots
                </span>
                <Badge variant="secondary" className="text-[9px]">{snapshots.length}</Badge>
              </div>
              {expandedSection === 'snapshots' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>

            <AnimatePresence>
              {expandedSection === 'snapshots' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-2 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={newSnapshotName}
                        onChange={(e) => setNewSnapshotName(e.target.value)}
                        placeholder="Snapshot name..."
                        className="h-7 text-xs flex-1"
                        style={{
                          background: 'var(--studio-bg-deep)',
                          borderColor: 'var(--studio-border)',
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          if (newSnapshotName.trim()) {
                            createSnapshot(newSnapshotName.trim());
                            setNewSnapshotName('');
                          }
                        }}
                        disabled={!newSnapshotName.trim()}
                      >
                        Save
                      </Button>
                    </div>

                    {snapshots.length === 0 ? (
                      <div className="text-center py-4 text-xs text-gray-500">
                        No snapshots saved yet
                      </div>
                    ) : (
                      snapshots.map((snapshot) => (
                        <div
                          key={snapshot.id}
                          className="flex items-center justify-between p-2 rounded border"
                          style={{
                            borderColor:
                              activeSnapshotId === snapshot.id
                                ? 'var(--studio-accent)'
                                : 'var(--studio-border)',
                            background: 'var(--studio-bg-deep)',
                          }}
                        >
                          <div>
                            <div className="text-xs font-semibold" style={{ color: 'var(--studio-text)' }}>
                              {snapshot.name}
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {new Date(snapshot.timestamp).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2"
                              onClick={() => loadSnapshot(snapshot.id)}
                            >
                              Load
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-red-400"
                              onClick={() => deleteSnapshot(snapshot.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>

      <div
        className="h-10 px-3 flex items-center justify-between border-t"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <div className="text-[10px] text-gray-500">
          Last update: {new Date().toLocaleTimeString()}
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleExportState}
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}
