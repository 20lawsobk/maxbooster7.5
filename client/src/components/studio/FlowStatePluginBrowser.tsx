import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Plus,
  Waves,
  Activity,
  Volume2,
  Clock,
  Sparkles,
  Music,
  Zap,
  Wind,
  Piano,
  Drum,
  Guitar,
  Mic2,
  Layers,
  Star,
  Filter,
  Headphones,
  Loader2,
  RefreshCw,
} from 'lucide-react';

export type PluginCategory = 'all' | 'effects' | 'instruments' | 'favorites';

interface BackendPlugin {
  id: string;
  slug: string;
  name: string;
  category: 'effect' | 'instrument';
  type: string;
  version: string;
  description: string;
  author: string;
  parameters?: Array<{
    id: string;
    name: string;
    type: string;
    defaultValue: number | boolean | string;
    minValue?: number;
    maxValue?: number;
    automatable?: boolean;
  }>;
  defaultPreset?: Record<string, number | boolean | string>;
}

interface PluginDefinition {
  id: string;
  name: string;
  type: 'effect' | 'instrument';
  subtype: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  tags: string[];
  isFavorite?: boolean;
}

const TYPE_ICON_MAP: Record<string, React.ReactNode> = {
  // Effects — spatial / time
  'reverb': <Waves className="h-5 w-5" />,
  'plate': <Waves className="h-5 w-5" />,
  'hall': <Waves className="h-5 w-5" />,
  'spring': <Waves className="h-5 w-5" />,
  'shimmer': <Sparkles className="h-5 w-5" />,
  'ambient': <Waves className="h-5 w-5" />,
  'chamber': <Waves className="h-5 w-5" />,
  'delay': <Clock className="h-5 w-5" />,
  // Effects — dynamics
  'compressor': <Volume2 className="h-5 w-5" />,
  'limiter': <Volume2 className="h-5 w-5" />,
  'gate': <Filter className="h-5 w-5" />,
  'expander': <Filter className="h-5 w-5" />,
  'transient-shaper': <Zap className="h-5 w-5" />,
  'de-esser': <Mic2 className="h-5 w-5" />,
  'maximizer': <Volume2 className="h-5 w-5" />,
  'leveler': <Activity className="h-5 w-5" />,
  'ducker': <Volume2 className="h-5 w-5" />,
  // Effects — EQ
  'eq': <Activity className="h-5 w-5" />,
  'mastering': <Star className="h-5 w-5" />,
  // Effects — saturation / distortion
  'distortion': <Sparkles className="h-5 w-5" />,
  'ring-mod': <Zap className="h-5 w-5" />,
  // Effects — modulation
  'chorus': <Music className="h-5 w-5" />,
  'flanger': <Wind className="h-5 w-5" />,
  'phaser': <Wind className="h-5 w-5" />,
  'tremolo': <Activity className="h-5 w-5" />,
  'vibrato': <Activity className="h-5 w-5" />,
  'rotary': <RefreshCw className="h-5 w-5" />,
  'auto-pan': <Layers className="h-5 w-5" />,
  'ensemble': <Music className="h-5 w-5" />,
  'dimension': <Layers className="h-5 w-5" />,
  'modulation': <Music className="h-5 w-5" />,
  'dynamics': <Filter className="h-5 w-5" />,
  // Effects — vocal
  'vocal': <Mic2 className="h-5 w-5" />,
  'auto-tune': <Mic2 className="h-5 w-5" />,
  'harmony': <Mic2 className="h-5 w-5" />,
  'formant': <Mic2 className="h-5 w-5" />,
  'microphone': <Headphones className="h-5 w-5" />,
  // Instruments
  'piano': <Piano className="h-5 w-5" />,
  'strings': <Music className="h-5 w-5" />,
  'drums': <Drum className="h-5 w-5" />,
  'bass': <Guitar className="h-5 w-5" />,
  'pad': <Waves className="h-5 w-5" />,
  'synth': <Waves className="h-5 w-5" />,
  'analog': <Zap className="h-5 w-5" />,
  'fm': <Activity className="h-5 w-5" />,
  'wavetable': <Waves className="h-5 w-5" />,
  'sampler': <Layers className="h-5 w-5" />,
  'effect': <Wind className="h-5 w-5" />,
  'instrument': <Music className="h-5 w-5" />,
};

const TYPE_COLOR_MAP: Record<string, string> = {
  // Spatial
  'reverb': '#8b5cf6',
  'plate': '#7c3aed',
  'hall': '#6d28d9',
  'spring': '#5b21b6',
  'shimmer': '#a78bfa',
  'ambient': '#c4b5fd',
  'chamber': '#8b5cf6',
  'delay': '#06b6d4',
  // Dynamics
  'compressor': '#f59e0b',
  'limiter': '#d97706',
  'gate': '#6366f1',
  'expander': '#4f46e5',
  'transient-shaper': '#f97316',
  'de-esser': '#ec4899',
  'maximizer': '#dc2626',
  'leveler': '#b45309',
  'ducker': '#92400e',
  // EQ
  'eq': '#3b82f6',
  'mastering': '#1d4ed8',
  // Distortion
  'distortion': '#ef4444',
  'ring-mod': '#dc2626',
  // Modulation
  'chorus': '#10b981',
  'flanger': '#059669',
  'phaser': '#047857',
  'tremolo': '#34d399',
  'vibrato': '#6ee7b7',
  'rotary': '#065f46',
  'auto-pan': '#10b981',
  'ensemble': '#14b8a6',
  'dimension': '#0d9488',
  'modulation': '#10b981',
  'dynamics': '#6366f1',
  // Vocal
  'vocal': '#ec4899',
  'auto-tune': '#db2777',
  'harmony': '#be185d',
  'formant': '#9d174d',
  'microphone': '#14b8a6',
  // Instruments
  'piano': '#f59e0b',
  'strings': '#a855f7',
  'drums': '#ef4444',
  'bass': '#3b82f6',
  'pad': '#ec4899',
  'synth': '#8b5cf6',
  'analog': '#7c3aed',
  'fm': '#06b6d4',
  'wavetable': '#10b981',
  'sampler': '#f97316',
};

function transformBackendPlugin(plugin: BackendPlugin): PluginDefinition {
  const pluginType = plugin.type?.toLowerCase() || plugin.category;
  return {
    id: plugin.id,
    name: plugin.name,
    type: plugin.category === 'instrument' ? 'instrument' : 'effect',
    subtype: plugin.type?.charAt(0).toUpperCase() + plugin.type?.slice(1) || plugin.category,
    description: plugin.description,
    icon: TYPE_ICON_MAP[pluginType] || TYPE_ICON_MAP[plugin.category] || <Waves className="h-5 w-5" />,
    color: TYPE_COLOR_MAP[pluginType] || TYPE_COLOR_MAP[plugin.category] || '#8b5cf6',
    tags: [plugin.type, plugin.category, plugin.author].filter(Boolean) as string[],
  };
}

async function fetchPlugins(): Promise<Record<string, BackendPlugin[]>> {
  const response = await fetch('/api/studio/plugins', {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch plugins');
  }
  return response.json();
}

async function instantiatePlugin(
  pluginId: string,
  projectId: string,
  trackId?: string
): Promise<{ success: boolean; instance: any }> {
  const response = await fetch(`/api/studio/plugins/instantiate/${pluginId}?projectId=${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ trackId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add plugin');
  }
  return response.json();
}

interface FlowStatePluginBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPlugin: (pluginId: string, type: 'effect' | 'instrument') => void;
  trackId?: string;
  projectId?: string;
}

export function FlowStatePluginBrowser({
  open,
  onOpenChange,
  onAddPlugin,
  trackId,
  projectId,
}: FlowStatePluginBrowserProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PluginCategory>('all');
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('flowstate-plugin-favorites');
    return saved ? new Set(JSON.parse(saved)) : new Set(['mb-comp-studio', 'mb-reverb-plate', 'mb-piano-grand']);
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pluginsData, isLoading, error, refetch } = useQuery({
    queryKey: ['studio-plugins'],
    queryFn: fetchPlugins,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const instantiateMutation = useMutation({
    mutationFn: ({ pluginId, trackId }: { pluginId: string; trackId?: string }) => {
      if (!projectId) {
        return Promise.reject(new Error('No project selected'));
      }
      return instantiatePlugin(pluginId, projectId, trackId);
    },
    onSuccess: (data, variables) => {
      toast({
        title: 'Plugin Added',
        description: `Successfully added plugin to ${trackId ? 'track' : 'project'}`,
      });
      queryClient.invalidateQueries({ queryKey: ['plugin-instances'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Add Plugin',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    localStorage.setItem('flowstate-plugin-favorites', JSON.stringify([...favorites]));
  }, [favorites]);

  const allPlugins = useMemo(() => {
    if (!pluginsData) return [];
    const plugins: PluginDefinition[] = [];
    for (const [type, typePlugins] of Object.entries(pluginsData)) {
      for (const plugin of typePlugins) {
        plugins.push(transformBackendPlugin(plugin));
      }
    }
    return plugins;
  }, [pluginsData]);

  const filteredPlugins = useMemo(() => {
    let plugins = allPlugins;

    if (category === 'effects') {
      plugins = plugins.filter((p) => p.type === 'effect' || p.type === 'microphone');
    } else if (category === 'instruments') {
      plugins = plugins.filter((p) => p.type === 'instrument');
    } else if (category === 'favorites') {
      plugins = plugins.filter((p) => favorites.has(p.id));
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      plugins = plugins.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.subtype.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    return plugins;
  }, [allPlugins, search, category, favorites]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAdd = (plugin: PluginDefinition) => {
    if (projectId) {
      instantiateMutation.mutate({ pluginId: plugin.id, trackId });
    } else {
      toast({
        title: 'Plugin added to session',
        description: 'No project is open — this plugin is active for the current session but will not be saved.',
      });
    }
    onAddPlugin(plugin.id, plugin.type);
    onOpenChange(false);
  };

  const effectCount = allPlugins.filter((p) => p.type === 'effect').length;
  const instrumentCount = allPlugins.filter((p) => p.type === 'instrument').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-gradient-to-b from-[#1a1a2e] to-[#16162a] border-white/10 p-0 overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <DialogHeader className="px-6 pt-4 pb-2">
          <DialogTitle className="text-white text-lg font-medium flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-400" />
            Plugin Browser
            {allPlugins.length > 0 && (
              <span className="ml-2 text-sm font-normal text-white/50">
                ({allPlugins.length} plugins available)
              </span>
            )}
          </DialogTitle>
          <p className="text-white/50 text-sm">
            Add professional effects and instruments to your track
          </p>
        </DialogHeader>

        <div className="px-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plugins by name, type, or description..."
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading}
            className="bg-white/5 border-white/10 hover:bg-white/10"
          >
            <RefreshCw className={cn("h-4 w-4 text-white/60", isLoading && "animate-spin")} />
          </Button>
        </div>

        <Tabs value={category} onValueChange={(v) => setCategory(v as PluginCategory)} className="px-6 mt-4">
          <TabsList className="bg-white/5 border border-white/10 w-full justify-start">
            <TabsTrigger value="all" className="data-[state=active]:bg-white/10">
              All ({allPlugins.length})
            </TabsTrigger>
            <TabsTrigger value="effects" className="data-[state=active]:bg-white/10">
              Effects ({effectCount})
            </TabsTrigger>
            <TabsTrigger value="instruments" className="data-[state=active]:bg-white/10">
              Instruments ({instrumentCount})
            </TabsTrigger>
            <TabsTrigger value="favorites" className="data-[state=active]:bg-white/10">
              <Star className="h-3.5 w-3.5 mr-1.5" />
              Favorites ({favorites.size})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={category} className="mt-4 pb-6">
            <ScrollArea className="h-[450px]">
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3 p-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2 animate-pulse">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-md bg-white/10" />
                        <div className="flex-1 space-y-1">
                          <div className="h-3 bg-white/10 rounded w-3/4" />
                          <div className="h-2 bg-white/10 rounded w-1/2" />
                        </div>
                      </div>
                      <div className="h-2 bg-white/10 rounded w-full" />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-[350px] text-white/40">
                  <p className="text-red-400 mb-4">Failed to load plugins</p>
                  <Button variant="outline" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              ) : filteredPlugins.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[350px] text-white/40">
                  <Search className="h-12 w-12 mb-4 opacity-50" />
                  <p>No plugins found</p>
                  {search && (
                    <Button
                      variant="ghost"
                      className="mt-2 text-white/60"
                      onClick={() => setSearch('')}
                    >
                      Clear search
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pr-4">
                  {filteredPlugins.map((plugin) => (
                    <motion.div
                      key={plugin.id}
                      className={cn(
                        "relative p-4 rounded-xl border transition-all cursor-pointer group",
                        "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                      )}
                      onClick={() => handleAdd(plugin)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(plugin.id);
                        }}
                        className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4 transition-colors",
                            favorites.has(plugin.id)
                              ? "text-yellow-400 fill-yellow-400"
                              : "text-white/30 hover:text-white/50"
                          )}
                        />
                      </button>

                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${plugin.color}20` }}
                        >
                          <span style={{ color: plugin.color }}>{plugin.icon}</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-white font-medium text-sm truncate">
                              {plugin.name}
                            </h4>
                          </div>
                          <span
                            className={cn(
                              "inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase",
                              plugin.type === 'effect'
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-purple-500/20 text-purple-400"
                            )}
                          >
                            {plugin.subtype}
                          </span>
                          <p className="text-white/50 text-xs mt-1 line-clamp-2">
                            {plugin.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-end">
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-white/10 hover:bg-white/20 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          disabled={instantiateMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdd(plugin);
                          }}
                        >
                          {instantiateMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3 mr-1" />
                          )}
                          Add
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export const BUILT_IN_PLUGINS: PluginDefinition[] = [];
