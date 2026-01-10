import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useStudioStore } from '@/lib/studioStore';
import { AssetUploadDialog } from './AssetUploadDialog';
import { FileUploadZone } from './FileUploadZone';
import {
  Search,
  Folder,
  FolderOpen,
  FileAudio,
  Music,
  Box,
  Plug,
  ChevronRight,
  ChevronDown,
  Play,
  Square,
  Upload,
} from 'lucide-react';

interface BrowserItem {
  id: string;
  name: string;
  type: 'folder' | 'preset' | 'sample' | 'plugin' | 'file';
  children?: BrowserItem[];
  size?: string;
  duration?: string;
  fileUrl?: string;
}

interface UserAsset {
  id: string;
  name: string;
  assetType: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  createdAt: string;
}


interface BrowserTreeItemProps {
  item: BrowserItem;
  level: number;
  onSelect: (item: BrowserItem) => void;
  selectedId: string | null;
  onPreview?: (fileUrl: string, itemId: string) => void;
  onStopPreview?: () => void;
  previewingId?: string | null;
}

function BrowserTreeItem({ item, level, onSelect, selectedId, onPreview, onStopPreview, previewingId }: BrowserTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(level === 0);

  const handleDragStart = (e: React.DragEvent) => {
    if (item.type === 'folder') {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        id: item.id,
        name: item.name,
        type: item.type,
        fileUrl: item.fileUrl,
      })
    );
  };

  const getIcon = () => {
    switch (item.type) {
      case 'folder':
        return isExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />;
      case 'preset':
        return <Music className="h-4 w-4" />;
      case 'sample':
        return <FileAudio className="h-4 w-4" />;
      case 'plugin':
        return <Plug className="h-4 w-4" />;
      case 'file':
        return <FileAudio className="h-4 w-4" />;
    }
  };

  return (
    <div>
      <div
        draggable={item.type !== 'folder'}
        onDragStart={handleDragStart}
        className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-white/5 rounded transition-colors ${
          selectedId === item.id ? 'bg-white/10' : ''
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (item.type === 'folder') {
            setIsExpanded(!isExpanded);
          }
          onSelect(item);
        }}
      >
        {item.type === 'folder' && (
          <div className="w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" style={{ color: 'var(--studio-text-muted)' }} />
            ) : (
              <ChevronRight className="h-3 w-3" style={{ color: 'var(--studio-text-muted)' }} />
            )}
          </div>
        )}
        {item.type !== 'folder' && <div className="w-4" />}

        <div style={{ color: 'var(--studio-text-muted)' }}>{getIcon()}</div>

        <span className="flex-1 text-sm truncate" style={{ color: 'var(--studio-text)' }}>
          {item.name}
        </span>

        {item.duration && (
          <span className="text-xs" style={{ color: 'var(--studio-text-subtle)' }}>
            {item.duration}
          </span>
        )}

        {(item.type === 'sample' || item.type === 'file') && item.fileUrl && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${previewingId === item.id ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
            onClick={(e) => {
              e.stopPropagation();
              if (previewingId === item.id) {
                onStopPreview?.();
              } else if (item.fileUrl) {
                onPreview?.(item.fileUrl, item.id);
              }
            }}
          >
            {previewingId === item.id ? (
              <Square className="h-3 w-3 text-red-400" />
            ) : (
              <Play className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>

      {item.children && isExpanded && (
        <div>
          {item.children.map((child) => (
            <BrowserTreeItem
              key={child.id}
              item={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              onPreview={onPreview}
              onStopPreview={onStopPreview}
              previewingId={previewingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface UploadResult {
  track?: {
    id: string;
    name: string;
    trackType: string;
    order: number;
    volume: number;
    pan: number;
    isMuted: boolean;
    isSolo: boolean;
    isArmed: boolean;
    color: string;
  };
  clip?: {
    id: string;
    name: string;
    audioUrl: string;
    startTime: number;
    duration: number | null;
  };
}

interface BrowserPanelProps {
  projectId?: number | null;
  onTrackCreated?: (result: UploadResult) => void;
}

export function BrowserPanel({ projectId = null, onTrackCreated }: BrowserPanelProps) {
  const {
    browserSearchQuery,
    browserActiveTab,
    browserSelectedItem,
    setBrowserSearchQuery,
    setBrowserActiveTab,
    setBrowserSelectedItem,
  } = useStudioStore();

  const [localSearch, setLocalSearch] = useState(browserSearchQuery);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = useCallback((fileUrl: string, itemId: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    
    const audio = new Audio(fileUrl);
    audio.volume = 0.7;
    audioRef.current = audio;
    setPreviewingId(itemId);
    
    audio.onended = () => {
      setPreviewingId(null);
    };
    
    audio.onerror = () => {
      setPreviewingId(null);
      console.warn('Failed to preview audio file:', fileUrl);
    };
    
    audio.play().catch((err) => {
      console.warn('Audio preview failed:', err);
      setPreviewingId(null);
    });
  }, []);

  const handleStopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  const handleSearch = (query: string) => {
    setLocalSearch(query);
    setBrowserSearchQuery(query);
  };

  // Fetch user samples
  const { data: userSamples = [], isLoading: samplesLoading } = useQuery<UserAsset[]>({
    queryKey: ['/api/assets', { assetType: 'sample' }],
    queryFn: async () => {
      const response = await fetch('/api/assets?assetType=sample');
      if (!response.ok) throw new Error('Failed to fetch samples');
      const data = await response.json();
      // API returns { assets: [], type, total } - extract the array
      return Array.isArray(data) ? data : (data.assets || []);
    },
    enabled: browserActiveTab === 'samples',
  });

  // Fetch user plugins
  const { data: userPlugins = [], isLoading: pluginsLoading } = useQuery<UserAsset[]>({
    queryKey: ['/api/assets', { assetType: 'plugin' }],
    queryFn: async () => {
      const response = await fetch('/api/assets?assetType=plugin');
      if (!response.ok) throw new Error('Failed to fetch plugins');
      const data = await response.json();
      // API returns { assets: [], type, total } - extract the array
      return Array.isArray(data) ? data : (data.assets || []);
    },
    enabled: browserActiveTab === 'plugins',
  });

  // Fetch native plugins from catalog (immutable data - cache for 1 hour)
  const { data: nativePlugins = {}, isLoading: nativePluginsLoading } = useQuery<Record<string, Array<{ id: string; name: string; kind: string; category?: string }>>>({
    queryKey: ['/api/studio/plugins'],
    queryFn: async () => {
      const response = await fetch('/api/studio/plugins');
      if (!response.ok) throw new Error('Failed to fetch native plugins');
      return response.json();
    },
    enabled: browserActiveTab === 'plugins',
    staleTime: 60 * 60 * 1000, // 1 hour - plugin catalog is immutable
    gcTime: 24 * 60 * 60 * 1000, // 24 hours - keep in cache longer
  });

  // Fetch genre presets from real AI service
  const { data: genrePresets = [], isLoading: presetsLoading } = useQuery<{ id: string; name: string; icon: string; description: string }[]>({
    queryKey: ['/api/studio/ai-music/presets'],
    queryFn: async () => {
      const response = await fetch('/api/studio/ai-music/presets', { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: browserActiveTab === 'presets',
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  // Convert genre presets to browser items - directly use server-provided data
  const convertPresetsToBrowserItems = (): BrowserItem[] => {
    if (!genrePresets.length) return [];
    
    const electronicGenres = ['edm', 'electronic', 'house', 'techno', 'dubstep', 'ambient', 'trap'];
    const synthPresets: BrowserItem[] = [];
    const instrumentPresets: BrowserItem[] = [];
    
    genrePresets.forEach((preset) => {
      const item: BrowserItem = {
        id: preset.id,
        name: `${preset.icon} ${preset.name}`,
        type: 'preset',
      };
      
      const normalizedId = preset.id.toLowerCase().replace(/_/g, '');
      if (electronicGenres.some(g => normalizedId.includes(g))) {
        synthPresets.push(item);
      } else {
        instrumentPresets.push(item);
      }
    });
    
    const result: BrowserItem[] = [];
    if (synthPresets.length > 0) {
      result.push({ id: 'synth-presets', name: 'Electronic / Synth', type: 'folder', children: synthPresets });
    }
    if (instrumentPresets.length > 0) {
      result.push({ id: 'instrument-presets', name: 'Acoustic / Organic', type: 'folder', children: instrumentPresets });
    }
    return result;
  };

  // Convert user assets to browser items
  const convertAssetsToBrowserItems = (assets: UserAsset[]): BrowserItem[] => {
    return assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.assetType === 'sample' ? 'sample' : 'plugin',
      size: `${(asset.fileSize / (1024 * 1024)).toFixed(1)} MB`,
      fileUrl: asset.fileUrl,
    }));
  };

  // Convert native plugins to browser items (grouped by type from API)
  const convertNativePluginsToBrowserItems = (pluginsByType: Record<string, Array<{ id: string; name: string; type?: string; category?: string }>>): BrowserItem[] => {
    const typeLabels: Record<string, string> = {
      piano: 'Pianos',
      strings: 'Strings',
      brass: 'Brass',
      woodwind: 'Woodwinds',
      synth: 'Synthesizers',
      analog: 'Analog Synths',
      fm: 'FM Synths',
      wavetable: 'Wavetable Synths',
      drums: 'Drums',
      bass: 'Bass',
      organ: 'Organs',
      pad: 'Pads',
      lead: 'Leads',
      pluck: 'Plucks',
      sampler: 'Samplers',
      eq: 'Equalizers',
      dynamics: 'Dynamics',
      compressor: 'Compressors',
      limiter: 'Limiters',
      gate: 'Gates',
      reverb: 'Reverb',
      delay: 'Delay',
      modulation: 'Modulation',
      chorus: 'Chorus',
      flanger: 'Flanger',
      phaser: 'Phaser',
      distortion: 'Distortion',
      saturation: 'Saturation',
      utility: 'Utility',
      filter: 'Filters',
      effect: 'Effects',
      instrument: 'Instruments',
    };

    // Sort types: instruments first, then effects
    const typeOrder = [
      // Instruments
      'piano', 'strings', 'drums', 'bass', 'pad', 'analog', 'fm', 'wavetable', 'sampler',
      'organ', 'lead', 'pluck', 'brass', 'woodwind', 'synth',
      // Effects
      'reverb', 'delay', 'chorus', 'compressor', 'eq', 'limiter', 'gate', 'distortion', 'phaser', 'flanger',
      'modulation', 'saturation', 'filter', 'utility', 'dynamics', 'effect',
    ];
    
    const sortedEntries = Object.entries(pluginsByType).sort((a, b) => {
      const indexA = typeOrder.indexOf(a[0]);
      const indexB = typeOrder.indexOf(b[0]);
      // Unknown types go to the end
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
    
    return sortedEntries.map(([pluginType, plugins]) => ({
      id: `category-${pluginType}`,
      name: typeLabels[pluginType] || pluginType.charAt(0).toUpperCase() + pluginType.slice(1),
      type: 'folder' as const,
      children: plugins.map((plugin) => ({
        id: `native-${plugin.id}`,
        name: plugin.name,
        type: 'plugin' as const,
      })),
    }));
  };

  const filterItems = (items: BrowserItem[], query: string): BrowserItem[] => {
    if (!query) return items;

    const lowerQuery = query.toLowerCase();
    return items.reduce<BrowserItem[]>((acc, item) => {
      if (item.name.toLowerCase().includes(lowerQuery)) {
        acc.push(item);
      } else if (item.children) {
        const filteredChildren = filterItems(item.children, query);
        if (filteredChildren.length > 0) {
          acc.push({ ...item, children: filteredChildren });
        }
      }
      return acc;
    }, []);
  };

  const getContentForTab = () => {
    switch (browserActiveTab) {
      case 'pool': {
        const poolItems: BrowserItem[] = [
          {
            id: 'recordings',
            name: 'Recordings',
            type: 'folder',
            children: [],
          },
          {
            id: 'takes',
            name: 'Takes',
            type: 'folder',
            children: [],
          },
          {
            id: 'bounces',
            name: 'Bounces',
            type: 'folder',
            children: [],
          },
          {
            id: 'imported',
            name: 'Imported Media',
            type: 'folder',
            children: [],
          },
        ];
        return filterItems(poolItems, localSearch);
      }
      case 'presets':
        return filterItems(convertPresetsToBrowserItems(), localSearch);
      case 'samples': {
        const userItems = convertAssetsToBrowserItems(userSamples);
        const allItems: BrowserItem[] = [];

        if (userItems.length > 0) {
          allItems.push({
            id: 'user-samples',
            name: 'My Samples',
            type: 'folder',
            children: userItems,
          });
        }

        return filterItems(allItems, localSearch);
      }
      case 'plugins': {
        const userItems = convertAssetsToBrowserItems(userPlugins);
        const nativeItems = convertNativePluginsToBrowserItems(nativePlugins);
        const allItems: BrowserItem[] = [];

        if (userItems.length > 0) {
          allItems.push({
            id: 'user-plugins',
            name: 'My Plugins',
            type: 'folder',
            children: userItems,
          });
        }

        allItems.push(...nativeItems);

        return filterItems(allItems, localSearch);
      }
      case 'files':
        return filterItems([], localSearch);
      default:
        return [];
    }
  };

  const content = getContentForTab();
  const showUploadButton = browserActiveTab === 'samples' || browserActiveTab === 'plugins';

  const isLoading =
    (browserActiveTab === 'samples' && samplesLoading) ||
    (browserActiveTab === 'plugins' && (pluginsLoading || nativePluginsLoading)) ||
    (browserActiveTab === 'presets' && presetsLoading);

  return (
    <div
      className="h-full flex flex-col border-r"
      style={{
        background: 'var(--studio-bg-medium)',
        borderColor: 'var(--studio-border)',
      }}
    >
      {/* Header */}
      <div
        className="h-12 px-4 flex items-center justify-between border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <h3 className="text-sm font-bold tracking-wide" style={{ color: 'var(--studio-text)' }}>
          BROWSER
        </h3>

        {showUploadButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUploadDialogOpen(true)}
            className="h-8 px-2 gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="text-xs">Upload</span>
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="p-3 border-b" style={{ borderColor: 'var(--studio-border)' }}>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: 'var(--studio-text-muted)' }}
          />
          <Input
            value={localSearch}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search..."
            className="pl-9 h-9 text-sm"
            style={{
              background: 'var(--studio-bg-deep)',
              borderColor: 'var(--studio-border)',
              color: 'var(--studio-text)',
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={browserActiveTab}
        onValueChange={(value) => setBrowserActiveTab(value as any)}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList
          className="w-full h-10 grid grid-cols-5 rounded-none border-b"
          style={{
            background: 'var(--studio-bg-deep)',
            borderColor: 'var(--studio-border)',
          }}
        >
          <TabsTrigger
            value="pool"
            className="text-xs data-[state=active]:bg-white/10"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Pool
          </TabsTrigger>
          <TabsTrigger
            value="presets"
            className="text-xs data-[state=active]:bg-white/10"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Presets
          </TabsTrigger>
          <TabsTrigger
            value="samples"
            className="text-xs data-[state=active]:bg-white/10"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Samples
          </TabsTrigger>
          <TabsTrigger
            value="plugins"
            className="text-xs data-[state=active]:bg-white/10"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Plugins
          </TabsTrigger>
          <TabsTrigger
            value="files"
            className="text-xs data-[state=active]:bg-white/10"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Files
          </TabsTrigger>
        </TabsList>

        <TabsContent value={browserActiveTab} className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2 pb-4">
              {isLoading ? (
                <div
                  className="flex flex-col items-center justify-center h-64 gap-3"
                  style={{ color: 'var(--studio-text-muted)' }}
                >
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current" />
                  <p className="text-sm">Loading...</p>
                </div>
              ) : content.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-64 gap-3"
                  style={{ color: 'var(--studio-text-muted)' }}
                >
                  <Box className="h-12 w-12 opacity-50" />
                  <p className="text-sm">
                    {localSearch ? 'No results found' : 'No items available'}
                  </p>
                  {showUploadButton && !localSearch && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUploadDialogOpen(true)}
                      className="gap-2 mt-2"
                    >
                      <Upload className="h-4 w-4" />
                      Upload {browserActiveTab === 'samples' ? 'Samples' : 'Plugins'}
                    </Button>
                  )}
                </div>
              ) : (
                content.map((item) => (
                  <BrowserTreeItem
                    key={item.id}
                    item={item}
                    level={0}
                    onSelect={(item) => setBrowserSelectedItem(item.id)}
                    selectedId={browserSelectedItem}
                    onPreview={handlePreview}
                    onStopPreview={handleStopPreview}
                    previewingId={previewingId}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {(browserActiveTab === 'pool' || browserActiveTab === 'files') && projectId && (
        <div
          className="p-3 border-t"
          style={{ borderColor: 'var(--studio-border)' }}
        >
          <FileUploadZone projectId={projectId} compact onTrackCreated={onTrackCreated} />
        </div>
      )}

      <AssetUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        assetType={browserActiveTab === 'samples' ? 'sample' : 'plugin'}
      />
    </div>
  );
}
