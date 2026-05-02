import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plug,
  Settings,
  Save,
  Check,
  X,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Search,
  Star,
  StarOff,
  Trash2,
  Copy,
  RotateCcw,
  Download,
  Plus,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Plugin {
  id: string;
  name: string;
  type: 'effect' | 'instrument' | 'utility';
  category: string;
  manufacturer: string;
  version: string;
  isLoaded: boolean;
  isFavorite: boolean;
  presets: Preset[];
}

interface Preset {
  id: string;
  name: string;
  pluginId: string;
  isFactory: boolean;
  isFavorite: boolean;
  createdAt: Date;
}

interface PluginLoadState {
  pluginId: string;
  state: 'loading' | 'loaded' | 'error';
  progress: number;
  error?: string;
}

interface PluginOutcomesProps {
  plugins: Plugin[];
  onLoadPlugin: (pluginId: string) => Promise<void>;
  onUnloadPlugin: (pluginId: string) => Promise<void>;
  onApplyPreset: (pluginId: string, presetId: string) => Promise<void>;
  onSavePreset: (pluginId: string, name: string) => Promise<Preset>;
  onDeletePreset: (presetId: string) => Promise<void>;
  className?: string;
}

const PLUGIN_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'eq', name: 'EQ' },
  { id: 'compressor', name: 'Compressor' },
  { id: 'reverb', name: 'Reverb' },
  { id: 'delay', name: 'Delay' },
  { id: 'saturation', name: 'Saturation' },
  { id: 'modulation', name: 'Modulation' },
  { id: 'synth', name: 'Synth' },
];

export function PluginOutcomes({
  plugins,
  onLoadPlugin,
  onUnloadPlugin,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  className,
}: PluginOutcomesProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loadingStates, setLoadingStates] = useState<PluginLoadState[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const filteredPlugins = plugins.filter(plugin => {
    const matchesSearch = plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.manufacturer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || plugin.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleLoadPlugin = useCallback(async (plugin: Plugin) => {
    const loadState: PluginLoadState = {
      pluginId: plugin.id,
      state: 'loading',
      progress: 0,
    };
    setLoadingStates(prev => [...prev, loadState]);

    try {
      const progressInterval = setInterval(() => {
        setLoadingStates(prev => prev.map(s => 
          s.pluginId === plugin.id 
            ? { ...s, progress: Math.min(s.progress + 10, 90) }
            : s
        ));
      }, 100);

      await onLoadPlugin(plugin.id);
      
      clearInterval(progressInterval);
      setLoadingStates(prev => prev.map(s => 
        s.pluginId === plugin.id 
          ? { ...s, state: 'loaded', progress: 100 }
          : s
      ));

      toast({
        title: 'Plugin Loaded',
        description: (
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <span>{plugin.name} is ready to use</span>
          </div>
        ),
      });

      setTimeout(() => {
        setLoadingStates(prev => prev.filter(s => s.pluginId !== plugin.id));
      }, 2000);
    } catch (error) {
      setLoadingStates(prev => prev.map(s => 
        s.pluginId === plugin.id 
          ? { ...s, state: 'error', error: error.message || 'Failed to load plugin' }
          : s
      ));

      toast({
        title: 'Plugin Load Failed',
        description: (
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>{plugin.name}: {error.message || 'Unknown error'}</span>
          </div>
        ),
        variant: 'destructive',
      });
    }
  }, [onLoadPlugin, toast]);

  const handleApplyPreset = useCallback(async (plugin: Plugin, preset: Preset) => {
    try {
      await onApplyPreset(plugin.id, preset.id);
      
      toast({
        title: 'Preset Applied',
        description: (
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>"{preset.name}" applied to {plugin.name}</span>
          </div>
        ),
      });
      
      setShowPresetDialog(false);
    } catch (error) {
      toast({
        title: 'Failed to Apply Preset',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  }, [onApplyPreset, toast]);

  const handleSavePreset = useCallback(async () => {
    if (!selectedPlugin || !newPresetName.trim()) return;

    setIsSaving(true);
    try {
      const preset = await onSavePreset(selectedPlugin.id, newPresetName);
      
      toast({
        title: 'Preset Saved',
        description: (
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 text-green-400" />
            <span>"{preset.name}" saved successfully</span>
          </div>
        ),
      });
      
      setShowSavePresetDialog(false);
      setNewPresetName('');
    } catch (error) {
      toast({
        title: 'Failed to Save Preset',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [selectedPlugin, newPresetName, onSavePreset, toast]);

  const getLoadState = (pluginId: string) => {
    return loadingStates.find(s => s.pluginId === pluginId);
  };

  const openPresets = (plugin: Plugin) => {
    setSelectedPlugin(plugin);
    setShowPresetDialog(true);
  };

  const openSavePreset = (plugin: Plugin) => {
    setSelectedPlugin(plugin);
    setShowSavePresetDialog(true);
  };

  return (
    <div className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
            <Plug className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold">Plugins & Effects</h2>
            <p className="text-xs text-zinc-500">{plugins.length} plugins available</p>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-zinc-800 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plugins..."
            className="pl-10 bg-zinc-900 border-zinc-700"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PLUGIN_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors",
                selectedCategory === cat.id
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {filteredPlugins.map(plugin => {
            const loadState = getLoadState(plugin.id);
            
            return (
              <motion.div
                key={plugin.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    plugin.type === 'effect' && "bg-purple-500/20",
                    plugin.type === 'instrument' && "bg-blue-500/20",
                    plugin.type === 'utility' && "bg-zinc-500/20"
                  )}>
                    <Sliders className={cn(
                      "w-5 h-5",
                      plugin.type === 'effect' && "text-purple-400",
                      plugin.type === 'instrument' && "text-blue-400",
                      plugin.type === 'utility' && "text-zinc-400"
                    )} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{plugin.name}</span>
                      {plugin.isFavorite && (
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>{plugin.manufacturer}</span>
                      <span>•</span>
                      <span className="capitalize">{plugin.type}</span>
                      <span>•</span>
                      <span>v{plugin.version}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {loadState ? (
                      loadState.state === 'loading' ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                          <span className="text-xs text-zinc-400">{loadState.progress}%</span>
                        </div>
                      ) : loadState.state === 'loaded' ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => handleLoadPlugin(plugin)}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        </div>
                      )
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => openPresets(plugin)}
                        >
                          Presets
                          <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                        {plugin.isLoaded ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-green-500/30 text-green-400"
                            onClick={() => onUnloadPlugin(plugin.id)}
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Loaded
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                            onClick={() => handleLoadPlugin(plugin)}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Load
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {loadState?.state === 'loading' && (
                  <Progress value={loadState.progress} className="h-1 mt-2" />
                )}

                {loadState?.state === 'error' && (
                  <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
                    {loadState.error}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>

      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-purple-400" />
              {selectedPlugin?.name} Presets
            </DialogTitle>
          </DialogHeader>

          {selectedPlugin && (
            <div className="py-4">
              <Tabs defaultValue="factory">
                <TabsList className="bg-zinc-900 mb-4">
                  <TabsTrigger value="factory" className="flex-1">Factory</TabsTrigger>
                  <TabsTrigger value="user" className="flex-1">User</TabsTrigger>
                </TabsList>

                <TabsContent value="factory">
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {selectedPlugin.presets.filter(p => p.isFactory).map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => handleApplyPreset(selectedPlugin, preset)}
                          className="w-full p-3 bg-zinc-900 rounded-lg text-left hover:bg-zinc-800 transition-colors flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-400" />
                            <span className="text-sm">{preset.name}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-500" />
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="user">
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {selectedPlugin.presets.filter(p => !p.isFactory).length === 0 ? (
                        <div className="text-center py-8 text-zinc-500 text-sm">
                          No user presets yet
                        </div>
                      ) : (
                        selectedPlugin.presets.filter(p => !p.isFactory).map(preset => (
                          <div
                            key={preset.id}
                            className="p-3 bg-zinc-900 rounded-lg flex items-center justify-between"
                          >
                            <button
                              onClick={() => handleApplyPreset(selectedPlugin, preset)}
                              className="flex items-center gap-2 flex-1 text-left"
                            >
                              <Sparkles className="w-4 h-4 text-blue-400" />
                              <span className="text-sm">{preset.name}</span>
                            </button>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => onDeletePreset(preset.id)}
                              >
                                <Trash2 className="w-3 h-3 text-zinc-500" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPresetDialog(false)}>
              Close
            </Button>
            <Button onClick={() => {
              setShowPresetDialog(false);
              openSavePreset(selectedPlugin!);
            }}>
              <Save className="w-4 h-4 mr-2" />
              Save Current
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSavePresetDialog} onOpenChange={setShowSavePresetDialog}>
        <DialogContent className="max-w-sm bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-5 h-5 text-green-400" />
              Save Preset
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Preset Name</Label>
              <Input
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="My Custom Preset"
                className="bg-zinc-900 border-zinc-700"
              />
            </div>
            
            {selectedPlugin && (
              <div className="p-3 bg-zinc-900 rounded-lg text-sm text-zinc-400">
                Saving preset for: <span className="text-white">{selectedPlugin.name}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSavePresetDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePreset}
              disabled={!newPresetName.trim() || isSaving}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PluginOutcomes;
