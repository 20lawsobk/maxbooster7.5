import { useState, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Play,
  Square,
  Circle,
  Copy,
  Trash2,
  Plus,
  GripVertical,
  Music,
  ChevronRight,
  SkipForward,
  Repeat,
  ArrowRight,
  Shuffle,
  Clock,
  Layers,
  Volume2,
  Edit3,
} from 'lucide-react';

export interface Pattern {
  id: string;
  name: string;
  trackId: string;
  sceneId: string;
  color: string;
  loopLength: number;
  startTime: number;
  followAction: 'none' | 'next' | 'previous' | 'first' | 'last' | 'any' | 'stop';
  followActionTime: number;
  launchQuantization: '1bar' | '2bars' | '4bars' | '8bars' | 'none' | '1beat' | '1/2beat' | '1/4beat';
  isPlaying: boolean;
  isQueued: boolean;
  isRecording: boolean;
}

export interface Scene {
  id: string;
  name: string;
  index: number;
  color: string;
  tempo?: number;
  timeSignature?: string;
}

interface StudioTrack {
  id: string;
  name: string;
  trackType: 'audio' | 'midi' | 'instrument';
  color: string;
  mute: boolean;
  solo: boolean;
  armed: boolean;
}

interface PatternEditorProps {
  tracks: StudioTrack[];
  patterns: Pattern[];
  scenes: Scene[];
  currentSceneId: string | null;
  playingPatternIds: string[];
  queuedPatternIds: string[];
  onPatternPlay: (patternId: string) => void;
  onPatternStop: (patternId: string) => void;
  onScenePlay: (sceneId: string) => void;
  onSceneStop: (sceneId: string) => void;
  onPatternCreate: (trackId: string, sceneId: string) => void;
  onPatternUpdate: (patternId: string, updates: Partial<Pattern>) => void;
  onPatternDuplicate: (patternId: string) => void;
  onPatternDelete: (patternId: string) => void;
  onPatternMove: (patternId: string, targetTrackId: string, targetSceneId: string) => void;
  onSceneCreate: () => void;
  onSceneUpdate: (sceneId: string, updates: Partial<Scene>) => void;
  onSceneDelete: (sceneId: string) => void;
  onRecordPattern: (trackId: string, sceneId: string) => void;
}

const FOLLOW_ACTIONS = [
  { value: 'none', label: 'None', icon: Square },
  { value: 'next', label: 'Next Scene', icon: SkipForward },
  { value: 'previous', label: 'Previous Scene', icon: ChevronRight },
  { value: 'first', label: 'First Scene', icon: ArrowRight },
  { value: 'last', label: 'Last Scene', icon: ArrowRight },
  { value: 'any', label: 'Random', icon: Shuffle },
  { value: 'stop', label: 'Stop', icon: Square },
] as const;

const QUANTIZATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '1/4beat', label: '1/4 Beat' },
  { value: '1/2beat', label: '1/2 Beat' },
  { value: '1beat', label: '1 Beat' },
  { value: '1bar', label: '1 Bar' },
  { value: '2bars', label: '2 Bars' },
  { value: '4bars', label: '4 Bars' },
  { value: '8bars', label: '8 Bars' },
] as const;

const PATTERN_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
];

interface PatternCellProps {
  pattern: Pattern | null;
  track: StudioTrack;
  scene: Scene;
  isPlaying: boolean;
  isQueued: boolean;
  onPlay: () => void;
  onStop: () => void;
  onCreate: () => void;
  onUpdate: (updates: Partial<Pattern>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRecord: () => void;
  onDragStart: (e: React.DragEvent, pattern: Pattern) => void;
  onDrop: (e: React.DragEvent) => void;
}

const PatternCell = memo(function PatternCell({
  pattern,
  track,
  scene,
  isPlaying,
  isQueued,
  onPlay,
  onStop,
  onCreate,
  onUpdate,
  onDuplicate,
  onDelete,
  onRecord,
  onDragStart,
  onDrop,
}: PatternCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(pattern?.name || '');
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    onDrop(e);
  };

  const handleNameSubmit = () => {
    if (pattern && editName.trim()) {
      onUpdate({ name: editName.trim() });
    }
    setIsEditing(false);
  };

  const cellColor = pattern?.color || track.color;

  if (!pattern) {
    return (
      <ContextMenu>
        <ContextMenuTrigger>
          <motion.div
            className="h-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer group transition-all"
            style={{
              borderColor: isDragOver ? 'var(--studio-accent)' : 'var(--studio-border-subtle)',
              backgroundColor: isDragOver ? 'var(--studio-accent-muted)' : 'transparent',
            }}
            whileHover={{ 
              borderColor: 'var(--studio-border)',
              backgroundColor: 'rgba(255,255,255,0.02)',
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={onCreate}
            data-testid={`pattern-cell-empty-${track.id}-${scene.id}`}
          >
            <Plus 
              className="w-5 h-5 opacity-0 group-hover:opacity-50 transition-opacity"
              style={{ color: 'var(--studio-text-muted)' }}
            />
          </motion.div>
        </ContextMenuTrigger>
        <ContextMenuContent 
          className="w-48"
          style={{ 
            backgroundColor: 'var(--studio-panel)',
            borderColor: 'var(--studio-border)',
          }}
        >
          <ContextMenuItem onClick={onCreate} data-testid="context-create-pattern">
            <Plus className="h-4 w-4 mr-2" />
            Create Pattern
          </ContextMenuItem>
          <ContextMenuItem onClick={onRecord} data-testid="context-record-pattern">
            <Circle className="h-4 w-4 mr-2 text-red-500" />
            Record New Pattern
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <motion.div
          className={`h-16 rounded-lg relative overflow-hidden cursor-pointer group transition-all ${
            isPlaying ? 'ring-2 ring-white shadow-lg' : ''
          } ${isQueued ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}
          style={{
            backgroundColor: `${cellColor}${isPlaying ? 'ee' : 'cc'}`,
            borderColor: isDragOver ? 'var(--studio-accent)' : 'transparent',
            boxShadow: isPlaying 
              ? `0 0 20px ${cellColor}80, inset 0 0 20px rgba(255,255,255,0.1)` 
              : 'var(--studio-shadow-sm)',
          }}
          draggable
          onDragStart={(e) => onDragStart(e, pattern)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => isPlaying ? onStop() : onPlay()}
          data-testid={`pattern-cell-${pattern.id}`}
        >
          <div className="absolute inset-0 p-2 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              {isEditing ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleNameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSubmit();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                  className="h-5 text-xs bg-black/30 border-none px-1"
                  style={{ color: 'white' }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span 
                  className="text-xs font-medium text-white truncate max-w-[80%]"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditName(pattern.name);
                    setIsEditing(true);
                  }}
                >
                  {pattern.name}
                </span>
              )}
              
              <div className="flex items-center gap-1">
                {isPlaying && (
                  <motion.div
                    className="w-2 h-2 rounded-full bg-white"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />
                )}
                {isQueued && (
                  <motion.div
                    className="w-2 h-2 rounded-full bg-yellow-400"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.3, repeat: Infinity }}
                  />
                )}
              </div>
            </div>

            <div className="flex items-end justify-between">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-white/70" />
                <span className="text-[10px] text-white/70">
                  {pattern.loopLength} bars
                </span>
              </div>

              <div className="flex items-center gap-1">
                {pattern.followAction !== 'none' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-4 h-4 rounded bg-black/30 flex items-center justify-center">
                          {pattern.followAction === 'next' && <SkipForward className="w-2.5 h-2.5 text-white/70" />}
                          {pattern.followAction === 'stop' && <Square className="w-2.5 h-2.5 text-white/70" />}
                          {pattern.followAction === 'any' && <Shuffle className="w-2.5 h-2.5 text-white/70" />}
                          {(pattern.followAction === 'first' || pattern.followAction === 'last' || pattern.followAction === 'previous') && 
                            <ArrowRight className="w-2.5 h-2.5 text-white/70" />
                          }
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Follow: {FOLLOW_ACTIONS.find(a => a.value === pattern.followAction)?.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-1 flex gap-px">
              {Array.from({ length: Math.min(pattern.loopLength * 4, 16) }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 bg-white/20"
                  style={{
                    height: `${30 + Math.random() * 70}%`,
                    marginTop: 'auto',
                  }}
                />
              ))}
            </div>
          </div>

          <AnimatePresence>
            {isPlaying && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  style={{
                    animation: 'shimmer 2s infinite linear',
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </ContextMenuTrigger>

      <ContextMenuContent 
        className="w-56"
        style={{ 
          backgroundColor: 'var(--studio-panel)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <ContextMenuItem 
          onClick={() => isPlaying ? onStop() : onPlay()}
          data-testid={`context-${isPlaying ? 'stop' : 'play'}-pattern`}
        >
          {isPlaying ? (
            <>
              <Square className="h-4 w-4 mr-2" />
              Stop Pattern
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Play Pattern
            </>
          )}
        </ContextMenuItem>

        <ContextMenuSeparator style={{ backgroundColor: 'var(--studio-border)' }} />

        <ContextMenuItem 
          onClick={() => {
            setEditName(pattern.name);
            setIsEditing(true);
          }}
          data-testid="context-rename-pattern"
        >
          <Edit3 className="h-4 w-4 mr-2" />
          Rename
        </ContextMenuItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <div className="w-4 h-4 mr-2 rounded" style={{ backgroundColor: pattern.color }} />
            Change Color
          </ContextMenuSubTrigger>
          <ContextMenuSubContent 
            className="grid grid-cols-5 gap-1 p-2"
            style={{ 
              backgroundColor: 'var(--studio-panel)',
              borderColor: 'var(--studio-border)',
            }}
          >
            {PATTERN_COLORS.map((color) => (
              <div
                key={color}
                className="w-6 h-6 rounded cursor-pointer hover:ring-2 hover:ring-white transition-all"
                style={{ backgroundColor: color }}
                onClick={() => onUpdate({ color })}
              />
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Clock className="h-4 w-4 mr-2" />
            Loop Length
          </ContextMenuSubTrigger>
          <ContextMenuSubContent 
            style={{ 
              backgroundColor: 'var(--studio-panel)',
              borderColor: 'var(--studio-border)',
            }}
          >
            {[1, 2, 4, 8, 16, 32].map((bars) => (
              <ContextMenuItem 
                key={bars}
                onClick={() => onUpdate({ loopLength: bars })}
              >
                {bars} {bars === 1 ? 'bar' : 'bars'}
                {pattern.loopLength === bars && ' ✓'}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <SkipForward className="h-4 w-4 mr-2" />
            Follow Action
          </ContextMenuSubTrigger>
          <ContextMenuSubContent 
            style={{ 
              backgroundColor: 'var(--studio-panel)',
              borderColor: 'var(--studio-border)',
            }}
          >
            {FOLLOW_ACTIONS.map(({ value, label, icon: Icon }) => (
              <ContextMenuItem 
                key={value}
                onClick={() => onUpdate({ followAction: value as Pattern['followAction'] })}
              >
                <Icon className="h-4 w-4 mr-2" />
                {label}
                {pattern.followAction === value && ' ✓'}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Repeat className="h-4 w-4 mr-2" />
            Launch Quantization
          </ContextMenuSubTrigger>
          <ContextMenuSubContent 
            style={{ 
              backgroundColor: 'var(--studio-panel)',
              borderColor: 'var(--studio-border)',
            }}
          >
            {QUANTIZATION_OPTIONS.map(({ value, label }) => (
              <ContextMenuItem 
                key={value}
                onClick={() => onUpdate({ launchQuantization: value as Pattern['launchQuantization'] })}
              >
                {label}
                {pattern.launchQuantization === value && ' ✓'}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator style={{ backgroundColor: 'var(--studio-border)' }} />

        <ContextMenuItem onClick={onDuplicate} data-testid="context-duplicate-pattern">
          <Copy className="h-4 w-4 mr-2" />
          Duplicate
        </ContextMenuItem>

        <ContextMenuItem 
          onClick={onDelete} 
          className="text-red-400"
          data-testid="context-delete-pattern"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

interface TrackHeaderProps {
  track: StudioTrack;
}

const TrackHeader = memo(function TrackHeader({ track }: TrackHeaderProps) {
  return (
    <div 
      className="h-16 flex items-center gap-2 px-2 border-b"
      style={{
        background: 'var(--studio-panel)',
        borderColor: 'var(--studio-border)',
      }}
    >
      <div 
        className="w-1 h-10 rounded-full"
        style={{ backgroundColor: track.color }}
      />
      <div className="flex-1 min-w-0">
        <div 
          className="text-sm font-medium truncate"
          style={{ color: 'var(--studio-text)' }}
        >
          {track.name}
        </div>
        <div 
          className="text-xs capitalize"
          style={{ color: 'var(--studio-text-muted)' }}
        >
          {track.trackType}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {track.mute && (
          <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/80 text-white">
            M
          </div>
        )}
        {track.solo && (
          <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/80 text-black">
            S
          </div>
        )}
        {track.armed && (
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>
    </div>
  );
});

interface SceneRowProps {
  scene: Scene;
  isActive: boolean;
  onPlay: () => void;
  onStop: () => void;
  onUpdate: (updates: Partial<Scene>) => void;
  onDelete: () => void;
}

const SceneRow = memo(function SceneRow({
  scene,
  isActive,
  onPlay,
  onStop,
  onUpdate,
  onDelete,
}: SceneRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(scene.name);

  const handleNameSubmit = () => {
    if (editName.trim()) {
      onUpdate({ name: editName.trim() });
    }
    setIsEditing(false);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <motion.div
          className={`h-16 flex items-center gap-2 px-2 border-b cursor-pointer group ${
            isActive ? 'ring-1 ring-inset ring-white/20' : ''
          }`}
          style={{
            background: isActive 
              ? 'linear-gradient(90deg, var(--studio-accent)/20 0%, transparent 100%)'
              : 'var(--studio-bg-medium)',
            borderColor: 'var(--studio-border)',
          }}
          whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
          data-testid={`scene-row-${scene.id}`}
        >
          <motion.button
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
            style={{
              background: isActive 
                ? 'var(--studio-accent)' 
                : 'var(--studio-surface)',
              color: isActive ? 'white' : 'var(--studio-text-muted)',
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              isActive ? onStop() : onPlay();
            }}
            data-testid={`scene-play-${scene.id}`}
          >
            {isActive ? (
              <Square className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3 ml-0.5" />
            )}
          </motion.button>

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSubmit();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                className="h-6 text-sm bg-black/30 border-none"
                style={{ color: 'var(--studio-text)' }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div 
                className="text-sm font-medium truncate"
                style={{ color: 'var(--studio-text)' }}
                onDoubleClick={() => {
                  setEditName(scene.name);
                  setIsEditing(true);
                }}
              >
                {scene.name}
              </div>
            )}
            {scene.tempo && (
              <div 
                className="text-[10px]"
                style={{ color: 'var(--studio-text-muted)' }}
              >
                {scene.tempo} BPM
              </div>
            )}
          </div>

          <div 
            className="text-xs font-mono"
            style={{ color: 'var(--studio-text-subtle)' }}
          >
            {scene.index + 1}
          </div>
        </motion.div>
      </ContextMenuTrigger>

      <ContextMenuContent 
        style={{ 
          backgroundColor: 'var(--studio-panel)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <ContextMenuItem onClick={onPlay} data-testid="context-play-scene">
          <Play className="h-4 w-4 mr-2" />
          Play Scene
        </ContextMenuItem>
        <ContextMenuItem 
          onClick={() => {
            setEditName(scene.name);
            setIsEditing(true);
          }}
          data-testid="context-rename-scene"
        >
          <Edit3 className="h-4 w-4 mr-2" />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator style={{ backgroundColor: 'var(--studio-border)' }} />
        <ContextMenuItem 
          onClick={onDelete} 
          className="text-red-400"
          data-testid="context-delete-scene"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Scene
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

export function PatternEditor({
  tracks,
  patterns,
  scenes,
  currentSceneId,
  playingPatternIds,
  queuedPatternIds,
  onPatternPlay,
  onPatternStop,
  onScenePlay,
  onSceneStop,
  onPatternCreate,
  onPatternUpdate,
  onPatternDuplicate,
  onPatternDelete,
  onPatternMove,
  onSceneCreate,
  onSceneUpdate,
  onSceneDelete,
  onRecordPattern,
}: PatternEditorProps) {
  const [draggedPattern, setDraggedPattern] = useState<Pattern | null>(null);
  const [globalQuantization, setGlobalQuantization] = useState<Pattern['launchQuantization']>('1bar');

  const patternsByCell = useMemo(() => {
    const map = new Map<string, Pattern>();
    patterns.forEach((pattern) => {
      map.set(`${pattern.trackId}-${pattern.sceneId}`, pattern);
    });
    return map;
  }, [patterns]);

  const handleDragStart = useCallback((e: React.DragEvent, pattern: Pattern) => {
    setDraggedPattern(pattern);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'pattern',
      patternId: pattern.id,
    }));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetTrackId: string, targetSceneId: string) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'pattern' && data.patternId && draggedPattern) {
        onPatternMove(data.patternId, targetTrackId, targetSceneId);
      }
    } catch (error) {
    }

    setDraggedPattern(null);
  }, [draggedPattern, onPatternMove]);

  const sortedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => a.index - b.index);
  }, [scenes]);

  return (
    <div 
      className="flex flex-col h-full"
      style={{
        background: 'var(--studio-bg-deep)',
      }}
    >
      <div 
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          background: 'var(--studio-toolbar)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" style={{ color: 'var(--studio-text-muted)' }} />
          <span 
            className="text-sm font-medium"
            style={{ color: 'var(--studio-text)' }}
          >
            Session View
          </span>
          <span 
            className="text-xs px-2 py-0.5 rounded"
            style={{ 
              backgroundColor: 'var(--studio-surface)',
              color: 'var(--studio-text-muted)',
            }}
          >
            {patterns.length} patterns
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span 
              className="text-xs"
              style={{ color: 'var(--studio-text-muted)' }}
            >
              Launch Quantize:
            </span>
            <Select
              value={globalQuantization}
              onValueChange={(value) => setGlobalQuantization(value as Pattern['launchQuantization'])}
            >
              <SelectTrigger 
                className="w-24 h-7 text-xs border-0"
                style={{
                  backgroundColor: 'var(--studio-surface)',
                  color: 'var(--studio-text)',
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                style={{
                  backgroundColor: 'var(--studio-panel)',
                  borderColor: 'var(--studio-border)',
                }}
              >
                {QUANTIZATION_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            style={{
              background: 'var(--studio-surface)',
              color: 'var(--studio-text)',
              borderColor: 'var(--studio-border)',
            }}
            onClick={onSceneCreate}
            data-testid="button-add-scene"
          >
            <Plus className="w-3 h-3" />
            Add Scene
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex">
          <div 
            className="w-36 flex-shrink-0 border-r"
            style={{ borderColor: 'var(--studio-border)' }}
          >
            <div 
              className="h-16 flex items-center justify-center border-b"
              style={{
                background: 'var(--studio-panel)',
                borderColor: 'var(--studio-border)',
              }}
            >
              <span 
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--studio-text-muted)' }}
              >
                Scenes
              </span>
            </div>
            
            {sortedScenes.map((scene) => (
              <SceneRow
                key={scene.id}
                scene={scene}
                isActive={scene.id === currentSceneId}
                onPlay={() => onScenePlay(scene.id)}
                onStop={() => onSceneStop(scene.id)}
                onUpdate={(updates) => onSceneUpdate(scene.id, updates)}
                onDelete={() => onSceneDelete(scene.id)}
              />
            ))}

            {scenes.length === 0 && (
              <div 
                className="h-16 flex items-center justify-center"
                style={{ color: 'var(--studio-text-muted)' }}
              >
                <span className="text-xs">No scenes</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-x-auto">
            <div className="flex" style={{ minWidth: `${tracks.length * 140}px` }}>
              {tracks.map((track) => (
                <div 
                  key={track.id} 
                  className="w-36 flex-shrink-0 border-r"
                  style={{ borderColor: 'var(--studio-border)' }}
                >
                  <TrackHeader track={track} />

                  {sortedScenes.map((scene) => {
                    const pattern = patternsByCell.get(`${track.id}-${scene.id}`);
                    const isPlaying = pattern ? playingPatternIds.includes(pattern.id) : false;
                    const isQueued = pattern ? queuedPatternIds.includes(pattern.id) : false;

                    return (
                      <div 
                        key={scene.id} 
                        className="h-16 p-1 border-b"
                        style={{ borderColor: 'var(--studio-border)' }}
                      >
                        <PatternCell
                          pattern={pattern || null}
                          track={track}
                          scene={scene}
                          isPlaying={isPlaying}
                          isQueued={isQueued}
                          onPlay={() => pattern && onPatternPlay(pattern.id)}
                          onStop={() => pattern && onPatternStop(pattern.id)}
                          onCreate={() => onPatternCreate(track.id, scene.id)}
                          onUpdate={(updates) => pattern && onPatternUpdate(pattern.id, updates)}
                          onDuplicate={() => pattern && onPatternDuplicate(pattern.id)}
                          onDelete={() => pattern && onPatternDelete(pattern.id)}
                          onRecord={() => onRecordPattern(track.id, scene.id)}
                          onDragStart={handleDragStart}
                          onDrop={(e) => handleDrop(e, track.id, scene.id)}
                        />
                      </div>
                    );
                  })}

                  {scenes.length === 0 && (
                    <div 
                      className="h-16 flex items-center justify-center"
                      style={{ color: 'var(--studio-text-subtle)' }}
                    >
                      <span className="text-xs">—</span>
                    </div>
                  )}
                </div>
              ))}

              {tracks.length === 0 && (
                <div 
                  className="w-full h-32 flex items-center justify-center"
                  style={{ color: 'var(--studio-text-muted)' }}
                >
                  <div className="text-center">
                    <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <span className="text-sm">No tracks</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
