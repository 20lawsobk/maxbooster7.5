import { useState, useRef, useCallback } from 'react';
import { 
  Search, 
  Folder, 
  FolderOpen, 
  Music, 
  FileAudio, 
  ChevronRight, 
  ChevronDown,
  Play,
  Pause,
  Volume2,
  Filter,
  LayoutGrid,
  List,
  Star,
  Clock,
  Download,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { studioOneTheme } from '@/lib/studioOneTheme';

interface BrowserFile {
  id: string;
  name: string;
  type: 'folder' | 'audio' | 'midi' | 'preset' | 'loop';
  path: string;
  duration?: number;
  bpm?: number;
  key?: string;
  size?: number;
  favorite?: boolean;
  children?: BrowserFile[];
}

interface StudioOneBrowserProps {
  files: BrowserFile[];
  onFileSelect: (file: BrowserFile) => void;
  onFileDragStart: (file: BrowserFile, e: React.DragEvent) => void;
  onFilePreview: (file: BrowserFile) => void;
  onFileAdd: (file: BrowserFile) => void;
  onToggleFavorite: (fileId: string) => void;
  previewingFile?: BrowserFile | null;
  isPreviewPlaying?: boolean;
  previewProgress?: number;
  onPreviewPlayPause?: () => void;
  onPreviewSeek?: (progress: number) => void;
}

function FileTreeItem({
  file,
  depth = 0,
  onSelect,
  onDragStart,
  onPreview,
  onAdd,
  onToggleFavorite,
  selectedId,
}: {
  file: BrowserFile;
  depth?: number;
  onSelect: (file: BrowserFile) => void;
  onDragStart: (file: BrowserFile, e: React.DragEvent) => void;
  onPreview: (file: BrowserFile) => void;
  onAdd: (file: BrowserFile) => void;
  onToggleFavorite: (fileId: string) => void;
  selectedId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isFolder = file.type === 'folder';
  const isSelected = file.id === selectedId;

  const getIcon = () => {
    switch (file.type) {
      case 'folder':
        return expanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />;
      case 'audio':
        return <FileAudio className="h-4 w-4" style={{ color: studioOneTheme.colors.accent.green }} />;
      case 'midi':
        return <Music className="h-4 w-4" style={{ color: studioOneTheme.colors.accent.purple }} />;
      case 'loop':
        return <Music className="h-4 w-4" style={{ color: studioOneTheme.colors.accent.cyan }} />;
      case 'preset':
        return <Filter className="h-4 w-4" style={{ color: studioOneTheme.colors.accent.orange }} />;
      default:
        return <FileAudio className="h-4 w-4" />;
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-white/5 group rounded ${isSelected ? 'bg-white/10' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        draggable={!isFolder}
        onClick={() => {
          if (isFolder) {
            setExpanded(!expanded);
          } else {
            onSelect(file);
          }
        }}
        onDoubleClick={() => !isFolder && onPreview(file)}
        onDragStart={(e) => !isFolder && onDragStart(file, e)}
      >
        {isFolder && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" style={{ color: studioOneTheme.colors.text.muted }} />
            ) : (
              <ChevronRight className="h-3 w-3" style={{ color: studioOneTheme.colors.text.muted }} />
            )}
          </button>
        )}
        {!isFolder && <div className="w-4" />}
        
        {getIcon()}
        
        <span 
          className="text-[11px] truncate flex-1"
          style={{ color: studioOneTheme.colors.text.primary }}
        >
          {file.name}
        </span>

        {file.bpm && (
          <Badge 
            variant="outline" 
            className="text-[8px] px-1 py-0 h-4"
            style={{ borderColor: studioOneTheme.colors.border.subtle }}
          >
            {file.bpm}
          </Badge>
        )}

        {file.key && (
          <Badge 
            variant="outline" 
            className="text-[8px] px-1 py-0 h-4"
            style={{ borderColor: studioOneTheme.colors.border.subtle }}
          >
            {file.key}
          </Badge>
        )}

        {file.favorite && (
          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isFolder && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview(file);
                }}
                className="p-1 hover:bg-white/10 rounded"
              >
                <Play className="h-3 w-3" style={{ color: studioOneTheme.colors.accent.green }} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd(file);
                }}
                className="p-1 hover:bg-white/10 rounded"
              >
                <Plus className="h-3 w-3" style={{ color: studioOneTheme.colors.text.muted }} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(file.id);
                }}
                className="p-1 hover:bg-white/10 rounded"
              >
                <Star className={`h-3 w-3 ${file.favorite ? 'fill-yellow-500 text-yellow-500' : ''}`} style={{ color: file.favorite ? undefined : studioOneTheme.colors.text.muted }} />
              </button>
            </>
          )}
        </div>
      </div>

      {isFolder && expanded && file.children && (
        <div>
          {file.children.map((child) => (
            <FileTreeItem
              key={child.id}
              file={child}
              depth={depth + 1}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onPreview={onPreview}
              onAdd={onAdd}
              onToggleFavorite={onToggleFavorite}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WaveformPreview({ duration = 4, progress = 0 }: { duration?: number; progress?: number }) {
  const bars = 50;
  return (
    <div className="flex items-end gap-px h-10 px-2">
      {Array.from({ length: bars }).map((_, i) => {
        const height = Math.random() * 60 + 20;
        const isPast = (i / bars) < progress;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-colors"
            style={{
              height: `${height}%`,
              background: isPast ? studioOneTheme.colors.accent.blue : studioOneTheme.colors.bg.elevated,
            }}
          />
        );
      })}
    </div>
  );
}

export function StudioOneBrowser({
  files,
  onFileSelect,
  onFileDragStart,
  onFilePreview,
  onFileAdd,
  onToggleFavorite,
  previewingFile,
  isPreviewPlaying = false,
  previewProgress = 0,
  onPreviewPlayPause,
  onPreviewSeek,
}: StudioOneBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'grid'>('tree');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const handleSelect = (file: BrowserFile) => {
    setSelectedFileId(file.id);
    onFileSelect(file);
  };

  const filterFiles = useCallback((files: BrowserFile[], query: string): BrowserFile[] => {
    if (!query) return files;
    return files.filter(file => {
      if (file.name.toLowerCase().includes(query.toLowerCase())) return true;
      if (file.children) {
        const filteredChildren = filterFiles(file.children, query);
        return filteredChildren.length > 0;
      }
      return false;
    }).map(file => {
      if (file.children) {
        return { ...file, children: filterFiles(file.children, query) };
      }
      return file;
    });
  }, []);

  const filteredFiles = filterFiles(files, searchQuery);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="flex flex-col h-full"
      style={{ background: studioOneTheme.colors.bg.panel }}
    >
      {/* Header */}
      <div 
        className="p-2 border-b shrink-0"
        style={{ borderColor: studioOneTheme.colors.border.primary }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span 
            className="text-xs font-semibold"
            style={{ color: studioOneTheme.colors.text.primary }}
          >
            Browser
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setViewMode('tree')}
            className={`p-1 rounded ${viewMode === 'tree' ? 'bg-white/10' : ''}`}
          >
            <List className="h-4 w-4" style={{ color: studioOneTheme.colors.text.muted }} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded ${viewMode === 'grid' ? 'bg-white/10' : ''}`}
          >
            <LayoutGrid className="h-4 w-4" style={{ color: studioOneTheme.colors.text.muted }} />
          </button>
        </div>
        <div className="relative">
          <Search 
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3" 
            style={{ color: studioOneTheme.colors.text.muted }}
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="h-7 text-[11px] pl-7"
            style={{
              background: studioOneTheme.colors.bg.deep,
              borderColor: studioOneTheme.colors.border.subtle,
              color: studioOneTheme.colors.text.primary,
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="files" className="flex-1 flex flex-col overflow-hidden">
        <TabsList 
          className="h-8 w-full justify-start rounded-none border-b shrink-0"
          style={{ 
            background: studioOneTheme.colors.bg.secondary,
            borderColor: studioOneTheme.colors.border.subtle,
          }}
        >
          <TabsTrigger value="files" className="text-[10px] h-6 px-3">Files</TabsTrigger>
          <TabsTrigger value="instruments" className="text-[10px] h-6 px-3">Instruments</TabsTrigger>
          <TabsTrigger value="effects" className="text-[10px] h-6 px-3">Effects</TabsTrigger>
          <TabsTrigger value="loops" className="text-[10px] h-6 px-3">Loops</TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="py-1">
              {filteredFiles.map((file) => (
                <FileTreeItem
                  key={file.id}
                  file={file}
                  onSelect={handleSelect}
                  onDragStart={onFileDragStart}
                  onPreview={onFilePreview}
                  onAdd={onFileAdd}
                  onToggleFavorite={onToggleFavorite}
                  selectedId={selectedFileId || undefined}
                />
              ))}
              {filteredFiles.length === 0 && (
                <div className="p-4 text-center">
                  <span 
                    className="text-[11px]"
                    style={{ color: studioOneTheme.colors.text.muted }}
                  >
                    No files found
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="instruments" className="flex-1 mt-0">
          <div className="p-4 text-center">
            <span 
              className="text-[11px]"
              style={{ color: studioOneTheme.colors.text.muted }}
            >
              Virtual instruments will appear here
            </span>
          </div>
        </TabsContent>

        <TabsContent value="effects" className="flex-1 mt-0">
          <div className="p-4 text-center">
            <span 
              className="text-[11px]"
              style={{ color: studioOneTheme.colors.text.muted }}
            >
              Audio effects will appear here
            </span>
          </div>
        </TabsContent>

        <TabsContent value="loops" className="flex-1 mt-0">
          <div className="p-4 text-center">
            <span 
              className="text-[11px]"
              style={{ color: studioOneTheme.colors.text.muted }}
            >
              Loops and samples will appear here
            </span>
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview Panel */}
      {previewingFile && (
        <div 
          className="border-t p-2 shrink-0"
          style={{ 
            background: studioOneTheme.colors.bg.deep,
            borderColor: studioOneTheme.colors.border.primary,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={onPreviewPlayPause}
              className="p-1.5 rounded hover:bg-white/10"
              style={{ background: studioOneTheme.colors.bg.tertiary }}
            >
              {isPreviewPlaying ? (
                <Pause className="h-4 w-4" style={{ color: studioOneTheme.colors.accent.blue }} />
              ) : (
                <Play className="h-4 w-4" style={{ color: studioOneTheme.colors.accent.green }} />
              )}
            </button>
            <div className="flex-1">
              <div 
                className="text-[10px] font-medium truncate"
                style={{ color: studioOneTheme.colors.text.primary }}
              >
                {previewingFile.name}
              </div>
              <div 
                className="text-[9px]"
                style={{ color: studioOneTheme.colors.text.muted }}
              >
                {previewingFile.duration && formatDuration(previewingFile.duration)}
                {previewingFile.bpm && ` • ${previewingFile.bpm} BPM`}
                {previewingFile.key && ` • ${previewingFile.key}`}
              </div>
            </div>
          </div>
          <WaveformPreview duration={previewingFile.duration} progress={previewProgress} />
          <div className="mt-1">
            <Slider
              value={[previewProgress * 100]}
              onValueChange={([v]) => onPreviewSeek?.(v / 100)}
              max={100}
              step={0.1}
              className="h-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
