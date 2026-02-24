import { logger } from '@/lib/logger';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  Star,
  StarOff,
  Filter,
  Clock,
  SortAsc,
  SortDesc,
} from 'lucide-react';

interface BrowserItem {
  id: string;
  name: string;
  type: 'folder' | 'preset' | 'sample' | 'plugin' | 'file';
  children?: BrowserItem[];
  size?: string;
  duration?: string;
  fileUrl?: string;
  sampleRate?: number;
  fileType?: string;
  createdAt?: string;
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
  favorites: Set<string>;
  onToggleFavorite: (itemId: string) => void;
  onHover?: (item: BrowserItem | null) => void;
}

function BrowserTreeItem({ 
  item, 
  level, 
  onSelect, 
  selectedId, 
  onPreview, 
  onStopPreview, 
  previewingId,
  favorites,
  onToggleFavorite,
  onHover,
}: BrowserTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const isFavorite = favorites.has(item.id);

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
        onMouseEnter={() => onHover?.(item)}
        onMouseLeave={() => onHover?.(null)}
        className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-white/5 rounded transition-colors group ${
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

        {item.type !== 'folder' && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-5 w-5 p-0 ${isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(item.id);
            }}
          >
            {isFavorite ? (
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            ) : (
              <StarOff className="h-3 w-3" style={{ color: 'var(--studio-text-muted)' }} />
            )}
          </Button>
        )}

        {(item.type === 'sample' || item.type === 'file') && item.fileUrl && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${previewingId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
              onHover={onHover}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WaveformPreviewPanel({ item, isPlaying }: { item: BrowserItem | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !item) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = 'var(--studio-bg-deep)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = isPlaying ? '#3b82f6' : '#6b7280';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const bars = 60;
    const barWidth = width / bars;
    const seed = item.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    
    for (let i = 0; i < bars; i++) {
      const pseudoRandom = Math.sin(seed * (i + 1) * 0.1) * 0.5 + 0.5;
      const barHeight = pseudoRandom * (height - 10) * 0.8 + 5;
      const x = i * barWidth + barWidth / 2;
      const y = (height - barHeight) / 2;

      ctx.fillStyle = isPlaying ? 'rgba(59, 130, 246, 0.7)' : 'rgba(107, 114, 128, 0.5)';
      ctx.fillRect(x - barWidth / 4, y, barWidth / 2, barHeight);
    }

    ctx.stroke();
  }, [item, isPlaying]);

  if (!item || item.type === 'folder') {
    return (
      <div
        className="h-16 flex items-center justify-center border-t"
        style={{
          background: 'var(--studio-bg-deep)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <p className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
          Select an audio file to preview
        </p>
      </div>
    );
  }

  return (
    <div
      className="border-t"
      style={{
        background: 'var(--studio-bg-deep)',
        borderColor: 'var(--studio-border)',
      }}
    >
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className="text-xs font-medium truncate" style={{ color: 'var(--studio-text)' }}>
          {item.name}
        </span>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--studio-text-muted)' }}>
          {item.duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {item.duration}
            </span>
          )}
          {item.size && <span>{item.size}</span>}
          {item.sampleRate && <span>{item.sampleRate / 1000}kHz</span>}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={300}
        height={50}
        className="w-full"
        style={{ height: '50px' }}
      />
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

  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [typeFilter, setTypeFilter] = useState<'all' | 'audio' | 'midi' | 'preset' | 'plugin'>('all');
  const [hoveredItem, setHoveredItem] = useState<BrowserItem | null>(null);
  const [selectedItemForPreview, setSelectedItemForPreview] = useState<BrowserItem | null>(null);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('studio-favorites');
    if (saved) {
      try {
        setFavorites(new Set(JSON.parse(saved)));
      } catch (e) {
        logger.warn('Failed to load favorites from localStorage');
      }
    }
  }, []);

  useEffect(() => {
    if (favorites.size > 0) {
      localStorage.setItem('studio-favorites', JSON.stringify([...favorites]));
    }
  }, [favorites]);

  const toggleFavorite = useCallback((itemId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

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
      logger.warn('Failed to preview audio file:', fileUrl);
    };
    
    audio.play().catch((err) => {
      logger.warn('Audio preview failed:', err);
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

  const handleSearch = useCallback((query: string) => {
    setLocalSearch(query);
    
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      setBrowserSearchQuery(query);
    }, 150);
  }, [setBrowserSearchQuery]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const { data: userSamples = [], isLoading: samplesLoading } = useQuery<UserAsset[]>({
    queryKey: ['/api/assets', { assetType: 'sample' }],
    queryFn: async () => {
      const response = await fetch('/api/assets?assetType=sample');
      if (!response.ok) throw new Error('Failed to fetch samples');
      const data = await response.json();
      return Array.isArray(data) ? data : (data.assets || []);
    },
    enabled: browserActiveTab === 'samples',
  });

  const { data: userPlugins = [], isLoading: pluginsLoading } = useQuery<UserAsset[]>({
    queryKey: ['/api/assets', { assetType: 'plugin' }],
    queryFn: async () => {
      const response = await fetch('/api/assets?assetType=plugin');
      if (!response.ok) throw new Error('Failed to fetch plugins');
      const data = await response.json();
      return Array.isArray(data) ? data : (data.assets || []);
    },
    enabled: browserActiveTab === 'plugins',
  });

  const { data: nativePlugins = {}, isLoading: nativePluginsLoading } = useQuery<Record<string, Array<{ id: string; name: string; kind: string; category?: string }>>>({
    queryKey: ['/api/studio/plugins'],
    queryFn: async () => {
      const response = await fetch('/api/studio/plugins');
      if (!response.ok) throw new Error('Failed to fetch native plugins');
      return response.json();
    },
    enabled: browserActiveTab === 'plugins',
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

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

  const convertAssetsToBrowserItems = (assets: UserAsset[]): BrowserItem[] => {
    return assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.assetType === 'sample' ? 'sample' : 'plugin',
      size: `${(asset.fileSize / (1024 * 1024)).toFixed(1)} MB`,
      fileUrl: asset.fileUrl,
      fileType: asset.fileType,
      createdAt: asset.createdAt,
    }));
  };

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

    const typeOrder = [
      'piano', 'strings', 'drums', 'bass', 'pad', 'analog', 'fm', 'wavetable', 'sampler',
      'organ', 'lead', 'pluck', 'brass', 'woodwind', 'synth',
      'reverb', 'delay', 'chorus', 'compressor', 'eq', 'limiter', 'gate', 'distortion', 'phaser', 'flanger',
      'modulation', 'saturation', 'filter', 'utility', 'dynamics', 'effect',
    ];
    
    const sortedEntries = Object.entries(pluginsByType).sort((a, b) => {
      const indexA = typeOrder.indexOf(a[0]);
      const indexB = typeOrder.indexOf(b[0]);
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

  const filterItems = useCallback((items: BrowserItem[], query: string): BrowserItem[] => {
    const lowerQuery = query.toLowerCase();
    
    return items.reduce<BrowserItem[]>((acc, item) => {
      const matchesSearch = !query || item.name.toLowerCase().includes(lowerQuery);
      const matchesFavorite = !showFavoritesOnly || favorites.has(item.id) || item.type === 'folder';
      const matchesType = typeFilter === 'all' || 
        (typeFilter === 'audio' && (item.type === 'sample' || item.type === 'file')) ||
        (typeFilter === 'preset' && item.type === 'preset') ||
        (typeFilter === 'plugin' && item.type === 'plugin') ||
        item.type === 'folder';

      if (item.children) {
        const filteredChildren = filterItems(item.children, query);
        if (filteredChildren.length > 0) {
          acc.push({ ...item, children: filteredChildren });
        }
      } else if (matchesSearch && matchesFavorite && matchesType) {
        acc.push(item);
      }
      
      return acc;
    }, []);
  }, [showFavoritesOnly, favorites, typeFilter]);

  const sortItems = useCallback((items: BrowserItem[]): BrowserItem[] => {
    return items.map(item => {
      if (item.children) {
        return { ...item, children: sortItems(item.children) };
      }
      return item;
    }).sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;

      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison = (a.createdAt || '').localeCompare(b.createdAt || '');
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [sortBy, sortOrder]);

  const getContentForTab = useCallback(() => {
    switch (browserActiveTab) {
      case 'pool': {
        const poolItems: BrowserItem[] = [
          { id: 'recordings', name: 'Recordings', type: 'folder', children: [] },
          { id: 'takes', name: 'Takes', type: 'folder', children: [] },
          { id: 'bounces', name: 'Bounces', type: 'folder', children: [] },
          { id: 'imported', name: 'Imported Media', type: 'folder', children: [] },
        ];
        return sortItems(filterItems(poolItems, localSearch));
      }
      case 'presets':
        return sortItems(filterItems(convertPresetsToBrowserItems(), localSearch));
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

        return sortItems(filterItems(allItems, localSearch));
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

        return sortItems(filterItems(allItems, localSearch));
      }
      case 'files':
        return sortItems(filterItems([], localSearch));
      default:
        return [];
    }
  }, [browserActiveTab, localSearch, userSamples, userPlugins, nativePlugins, genrePresets, filterItems, sortItems]);

  const content = useMemo(() => getContentForTab(), [getContentForTab]);
  const showUploadButton = browserActiveTab === 'samples' || browserActiveTab === 'plugins';

  const isLoading =
    (browserActiveTab === 'samples' && samplesLoading) ||
    (browserActiveTab === 'plugins' && (pluginsLoading || nativePluginsLoading)) ||
    (browserActiveTab === 'presets' && presetsLoading);

  const handleItemSelect = useCallback((item: BrowserItem) => {
    setBrowserSelectedItem(item.id);
    if (item.type === 'sample' || item.type === 'file') {
      setSelectedItemForPreview(item);
    }
  }, [setBrowserSelectedItem]);

  const previewItem = hoveredItem?.type !== 'folder' ? hoveredItem : selectedItemForPreview;

  return (
    <div
      className="h-full flex flex-col border-r"
      style={{
        background: 'var(--studio-bg-medium)',
        borderColor: 'var(--studio-border)',
      }}
    >
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

      <div
        className="px-3 py-2 flex items-center gap-2 border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3" style={{ color: 'var(--studio-text-muted)' }} />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="h-7 px-2 text-xs rounded border"
            style={{
              background: 'var(--studio-bg-deep)',
              borderColor: 'var(--studio-border)',
              color: 'var(--studio-text)',
            }}
          >
            <option value="all">All Types</option>
            <option value="audio">Audio</option>
            <option value="midi">MIDI</option>
            <option value="preset">Presets</option>
            <option value="plugin">Plugins</option>
          </select>
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="h-7 px-2 text-xs rounded border"
          style={{
            background: 'var(--studio-bg-deep)',
            borderColor: 'var(--studio-border)',
            color: 'var(--studio-text)',
          }}
        >
          <option value="name">Name</option>
          <option value="date">Date</option>
          <option value="type">Type</option>
        </select>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          title={sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
        >
          {sortOrder === 'asc' ? (
            <SortAsc className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
          ) : (
            <SortDesc className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={`h-7 w-7 p-0 ml-auto ${showFavoritesOnly ? 'bg-yellow-400/20' : ''}`}
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          title={showFavoritesOnly ? 'Show All' : 'Show Favorites Only'}
        >
          {showFavoritesOnly ? (
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
          ) : (
            <Star className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
          )}
        </Button>
      </div>

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
                    {localSearch ? 'No results found' : showFavoritesOnly ? 'No favorites yet' : 'No items available'}
                  </p>
                  {showUploadButton && !localSearch && !showFavoritesOnly && (
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
                    onSelect={handleItemSelect}
                    selectedId={browserSelectedItem}
                    onPreview={handlePreview}
                    onStopPreview={handleStopPreview}
                    previewingId={previewingId}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    onHover={setHoveredItem}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <WaveformPreviewPanel 
        item={previewItem} 
        isPlaying={previewingId === previewItem?.id} 
      />

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
