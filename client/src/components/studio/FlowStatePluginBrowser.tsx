import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import { ALL_PLUGINS, EFFECT_PLUGINS, INSTRUMENT_PLUGINS, type PluginDefinition as CatalogPluginDef } from '@/lib/pluginCatalog';

export type PluginCategory = 'all' | 'effects' | 'instruments' | 'favorites';

const ICON_MAP: Record<string, React.ReactNode> = {
  'Activity': <Activity className="h-5 w-5" />,
  'Volume2': <Volume2 className="h-5 w-5" />,
  'Waves': <Waves className="h-5 w-5" />,
  'Clock': <Clock className="h-5 w-5" />,
  'Sparkles': <Sparkles className="h-5 w-5" />,
  'Music': <Music className="h-5 w-5" />,
  'Zap': <Zap className="h-5 w-5" />,
  'Wind': <Wind className="h-5 w-5" />,
  'Filter': <Filter className="h-5 w-5" />,
  'Mic2': <Mic2 className="h-5 w-5" />,
  'Headphones': <Headphones className="h-5 w-5" />,
  'Piano': <Piano className="h-5 w-5" />,
  'Drum': <Drum className="h-5 w-5" />,
  'Guitar': <Guitar className="h-5 w-5" />,
  'Layers': <Layers className="h-5 w-5" />,
};

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

const BUILT_IN_PLUGINS: PluginDefinition[] = ALL_PLUGINS.map(p => ({
  ...p,
  icon: ICON_MAP[p.icon] || <Waves className="h-5 w-5" />,
}));

interface FlowStatePluginBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPlugin: (pluginId: string, type: 'effect' | 'instrument') => void;
  trackId?: string;
}

export function FlowStatePluginBrowser({
  open,
  onOpenChange,
  onAddPlugin,
  trackId,
}: FlowStatePluginBrowserProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PluginCategory>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['mb-vca-compressor', 'mb-plate-reverb', 'minimoog', 'grand-piano']));

  const filteredPlugins = useMemo(() => {
    let plugins = BUILT_IN_PLUGINS;

    if (category === 'effects') {
      plugins = plugins.filter((p) => p.type === 'effect');
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
          p.tags.some((t) => t.includes(query))
      );
    }

    return plugins;
  }, [search, category, favorites]);

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
    onAddPlugin(plugin.id, plugin.type);
    onOpenChange(false);
  };

  const effectCount = BUILT_IN_PLUGINS.filter((p) => p.type === 'effect').length;
  const instrumentCount = BUILT_IN_PLUGINS.filter((p) => p.type === 'instrument').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-gradient-to-b from-[#1a1a2e] to-[#16162a] border-white/10 p-0 overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <DialogHeader className="px-6 pt-4 pb-2">
          <DialogTitle className="text-white text-lg font-medium flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-400" />
            Plugin Browser
          </DialogTitle>
          <p className="text-white/50 text-sm">
            Add effects and instruments to your track
          </p>
        </DialogHeader>

        <div className="px-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plugins..."
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
            />
          </div>
        </div>

        <Tabs value={category} onValueChange={(v) => setCategory(v as PluginCategory)} className="px-6 mt-4">
          <TabsList className="bg-white/5 border border-white/10 w-full justify-start">
            <TabsTrigger value="all" className="data-[state=active]:bg-white/10">
              All ({BUILT_IN_PLUGINS.length})
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
            <ScrollArea className="h-[400px]">
              {filteredPlugins.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[300px] text-white/40">
                  <Search className="h-12 w-12 mb-4 opacity-50" />
                  <p>No plugins found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
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
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase",
                                plugin.type === 'effect'
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-purple-500/20 text-purple-400"
                              )}
                            >
                              {plugin.subtype}
                            </span>
                          </div>
                          <p className="text-white/50 text-xs mt-1 line-clamp-2">
                            {plugin.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex gap-1">
                          {plugin.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded bg-white/5 text-white/40 text-[10px]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <Button
                          size="sm"
                          className="h-7 px-3 bg-white/10 hover:bg-white/20 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdd(plugin);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
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

export { BUILT_IN_PLUGINS };
