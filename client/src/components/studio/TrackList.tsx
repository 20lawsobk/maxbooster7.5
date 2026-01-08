import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  Volume2,
  GripVertical,
  Headphones,
  Plus,
  Music,
  Copy,
  Trash2,
  Drum,
  Guitar,
  Mic2,
  Piano,
  Radio,
  Cpu,
  Waves,
  Activity,
  ChevronDown,
  ChevronUp,
  CircleIcon,
  Circle,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface StudioTrack {
  id: string;
  name: string;
  trackType: 'audio' | 'midi' | 'instrument';
  trackNumber: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  recordEnabled: boolean;
  inputMonitoring: boolean;
  color: string;
  height: number;
  collapsed: boolean;
  outputBus: string;
  groupId?: string;
  effects?: {
    eq?: {
      lowGain: number;
      midGain: number;
      highGain: number;
      midFrequency: number;
      bypass?: boolean;
    };
    compressor?: {
      threshold: number;
      ratio: number;
      attack: number;
      release: number;
      bypass?: boolean;
    };
    reverb?: { mix: number; irId?: string; bypass?: boolean };
  };
}

interface AudioClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
}

interface MixBus {
  id: string;
  projectId: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

interface TrackListProps {
  tracks: StudioTrack[];
  trackClips?: Map<string, AudioClip[]>;
  mixBusses: MixBus[];
  onTrackNameChange: (trackId: string, name: string) => void;
  onMuteToggle: (trackId: string) => void;
  onSoloToggle: (trackId: string) => void;
  onVolumeChange: (trackId: string, volume: number) => void;
  onTrackUpdate: (trackId: string, updates: Partial<StudioTrack>) => void;
  onDuplicateTrack: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onAddTrack: () => void;
  onReorderTracks?: (oldIndex: number, newIndex: number) => void;
}

const TRACK_COLORS = [
  '#4ade80',
  '#60a5fa',
  '#f87171',
  '#fbbf24',
  '#a78bfa',
  '#fb923c',
  '#ec4899',
  '#14b8a6',
  '#8b5cf6',
  '#06b6d4',
];

// Get instrument icon based on track name or type
const getTrackIcon = (track: StudioTrack) => {
  const name = track.name.toLowerCase();

  // Check for specific instrument types
  if (
    name.includes('drum') ||
    name.includes('kick') ||
    name.includes('snare') ||
    name.includes('hat')
  ) {
    return <Drum className="w-4 h-4" />;
  }
  if (name.includes('bass')) {
    return <Guitar className="w-4 h-4" />;
  }
  if (name.includes('guitar') || name.includes('gtr')) {
    return <Guitar className="w-4 h-4" />;
  }
  if (name.includes('vocal') || name.includes('vox') || name.includes('voice')) {
    return <Mic2 className="w-4 h-4" />;
  }
  if (name.includes('piano') || name.includes('keys')) {
    return <Piano className="w-4 h-4" />;
  }
  if (name.includes('synth') || name.includes('pad') || name.includes('lead')) {
    return <Radio className="w-4 h-4" />;
  }

  // Default icons based on track type
  switch (track.trackType) {
    case 'instrument':
      return <Piano className="w-4 h-4" />;
    case 'midi':
      return <Cpu className="w-4 h-4" />;
    case 'audio':
    default:
      return <Music className="w-4 h-4" />;
  }
};

// LED Monitoring Indicator Component
const MonitoringLED = ({ active, color = '#00ff00' }: { active: boolean; color?: string }) => {
  return (
    <motion.div
      initial={{ scale: 1 }}
      animate={{
        scale: active ? [1, 1.2, 1] : 1,
        opacity: active ? 1 : 0.3,
      }}
      transition={{
        scale: { duration: 0.5, repeat: active ? Infinity : 0 },
      }}
      className="relative"
    >
      <div
        className="w-2 h-2 rounded-full"
        style={{
          background: active ? color : '#333',
          boxShadow: active ? `0 0 8px ${color}` : 'none',
        }}
      />
      {active && (
        <motion.div
          className="absolute inset-0 w-2 h-2 rounded-full"
          style={{ background: color }}
          animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
};

interface SortableTrackRowProps {
  track: StudioTrack;
  clips: AudioClip[];
  mixBusses: MixBus[];
  onTrackNameChange: (trackId: string, name: string) => void;
  onMuteToggle: (trackId: string) => void;
  onSoloToggle: (trackId: string) => void;
  onVolumeChange: (trackId: string, volume: number) => void;
  onTrackUpdate: (trackId: string, updates: Partial<StudioTrack>) => void;
  onDuplicateTrack: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
}

const SortableTrackRow = memo(function SortableTrackRow({
  track,
  clips,
  mixBusses,
  onTrackNameChange,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onTrackUpdate,
  onDuplicateTrack,
  onDeleteTrack,
}: SortableTrackRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isExpanded, setIsExpanded] = useState(true);
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

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));

      // Handle sample drops - create audio clip on timeline
      if (data.type === 'sample') {
        logger.info('Dropped sample onto track:', { trackId: track.id, sample: data });
        // TODO: Create audio clip on this track at current playhead position
        // This would call a callback to add a new clip to the track
      }

      // Handle plugin drops - add to track's effect chain
      if (data.type === 'plugin') {
        logger.info('Dropped plugin onto track:', { trackId: track.id, plugin: data });
        // TODO: Add plugin to track's effect chain
        // This would call a callback to add the plugin to the track
      }
    } catch (error: unknown) {
      logger.error('Error handling drop:', error);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <motion.div
          ref={setNodeRef}
          style={{
            ...style,
            borderColor: 'var(--studio-border)',
          }}
          className="flex border-b transition-all"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}
          data-testid={`track-lane-${track.id}`}
        >
          {/* Professional Track Header with Depth */}
          <motion.div
            className="w-32 sm:w-48 md:w-56 lg:w-64 border-r flex flex-col overflow-hidden shrink-0"
            style={{
              height: isExpanded ? `${track.height || 100}px` : '40px',
              background: isDragOver ? 'var(--studio-accent-muted)' : 'var(--track-header-bg)',
              borderColor: isDragOver ? 'var(--studio-accent)' : 'var(--studio-border)',
              transition:
                'height 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s, border-color 0.2s',
              boxShadow: isDragOver ? '0 0 20px var(--studio-accent)' : 'var(--studio-shadow-md)',
            }}
            whileHover={{
              background: isDragOver ? 'var(--studio-accent-muted)' : 'var(--track-header-hover)',
              boxShadow: isDragOver ? '0 0 20px var(--studio-accent)' : 'var(--studio-shadow-lg)',
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            layout
          >
            {/* Track Color Strip */}
            <motion.div
              className="h-1 w-full"
              style={{ backgroundColor: track.color }}
              whileHover={{ height: '2px' }}
              transition={{ duration: 0.2 }}
            />

            <div className="flex-1 p-2 flex flex-col gap-1.5">
              {/* Track Name & Icons Row */}
              <div className="flex items-center gap-2">
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                  <GripVertical
                    className="h-3 w-3 cursor-grab active:cursor-grabbing"
                    style={{ color: 'var(--studio-text-muted)' }}
                    {...attributes}
                    {...listeners}
                  />
                </motion.div>

                {/* Instrument Icon */}
                <motion.div
                  style={{ color: track.color }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                >
                  {getTrackIcon(track)}
                </motion.div>

                {/* Track Name Input */}
                <Input
                  value={track.name}
                  onChange={(e) => onTrackNameChange(track.id, e.target.value)}
                  className="flex-1 h-6 border-0 text-xs px-2 font-medium"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--studio-text)',
                  }}
                  data-testid={`input-track-name-${track.id}`}
                />

                {/* Monitoring LEDs */}
                <div className="flex items-center gap-1">
                  <MonitoringLED active={track.inputMonitoring} color="#00ff00" />
                  <MonitoringLED active={track.armed} color="#ff0000" />
                </div>

                {/* Expand/Collapse Button */}
                <motion.button
                  onClick={() => setIsExpanded(!isExpanded)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-1"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3" style={{ color: 'var(--studio-text-muted)' }} />
                  ) : (
                    <ChevronDown
                      className="w-3 h-3"
                      style={{ color: 'var(--studio-text-muted)' }}
                    />
                  )}
                </motion.button>
              </div>

              {/* Professional Track Controls with Animations */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-1 mt-1"
                  >
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="sm"
                        variant={track.mute ? 'destructive' : 'ghost'}
                        className={`h-8 w-8 sm:h-6 sm:w-auto sm:px-2 text-xs font-medium transition-all touch-manipulation ${
                          track.mute
                            ? 'bg-red-600/90 hover:bg-red-600 shadow-lg shadow-red-600/20'
                            : 'hover:bg-white/10'
                        }`}
                        onClick={() => onMuteToggle(track.id)}
                        data-testid={`button-mute-${track.id}`}
                        title="Mute track"
                      >
                        M
                      </Button>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="sm"
                        variant={track.solo ? 'default' : 'ghost'}
                        className={`h-8 w-8 sm:h-6 sm:w-auto sm:px-2 text-xs font-medium transition-all touch-manipulation ${
                          track.solo
                            ? 'bg-yellow-500/90 hover:bg-yellow-500 shadow-lg shadow-yellow-500/20'
                            : 'hover:bg-white/10'
                        }`}
                        onClick={() => onSoloToggle(track.id)}
                        data-testid={`button-solo-${track.id}`}
                        title="Solo track"
                      >
                        S
                      </Button>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="sm"
                        variant={track.armed ? 'destructive' : 'ghost'}
                        className={`h-8 w-8 sm:h-6 sm:w-auto sm:px-2 text-xs font-medium transition-all touch-manipulation ${
                          track.armed
                            ? 'bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30 animate-pulse'
                            : 'hover:bg-white/10'
                        }`}
                        onClick={() => onTrackUpdate(track.id, { armed: !track.armed })}
                        data-testid={`button-record-arm-${track.id}`}
                        title="Record arm"
                      >
                        R
                      </Button>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} className="hidden sm:block">
                      <Button
                        size="sm"
                        variant={track.inputMonitoring ? 'default' : 'ghost'}
                        className={`h-6 w-6 p-0 transition-all touch-manipulation ${
                          track.inputMonitoring
                            ? 'bg-blue-500/90 hover:bg-blue-500 shadow-lg shadow-blue-500/20'
                            : 'hover:bg-white/10'
                        }`}
                        onClick={() =>
                          onTrackUpdate(track.id, { inputMonitoring: !track.inputMonitoring })
                        }
                        data-testid={`button-monitor-${track.id}`}
                        title="Input monitoring"
                      >
                        <Headphones className="h-3 w-3" />
                      </Button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Volume/Pan Controls */}
              <div className="flex items-center gap-2 text-xs">
                <Volume2 className="h-3 w-3 text-gray-400" />
                <Slider
                  value={[track.volume * 100]}
                  onValueChange={([val]) => onVolumeChange(track.id, val / 100)}
                  max={100}
                  step={1}
                  className="flex-1"
                  data-testid={`slider-volume-${track.id}`}
                />
                <span className="text-gray-400 w-8">{Math.round(track.volume * 100)}%</span>
              </div>

              {/* Output Routing */}
              <Select
                value={track.outputBus}
                onValueChange={(val) => onTrackUpdate(track.id, { outputBus: val })}
              >
                <SelectTrigger
                  className="h-5 bg-[#1a1a1a] border-gray-700 text-xs"
                  data-testid={`select-bus-${track.id}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#252525] border-gray-700">
                  <SelectItem value="master">Master</SelectItem>
                  {(mixBusses || []).map((bus) => (
                    <SelectItem key={bus.id} value={bus.id}>
                      {bus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </motion.div>

          {/* Track Timeline */}
          <div
            className="flex-1 bg-[#1a1a1a] relative"
            style={{ height: `${track.height || 100}px` }}
          >
            {/* Grid Lines */}
            <div className="absolute inset-0 flex">
              {Array.from({ length: 32 }).map((_, i) => (
                <div key={i} className="flex-1 border-r border-gray-800" />
              ))}
            </div>
            {/* Audio Clips */}
            {(clips || []).map((clip) => {
              const totalBars = 32;
              const leftPercent = (clip.startTime / totalBars) * 100;
              const widthPercent = (clip.duration / totalBars) * 100;

              return (
                <div
                  key={clip.id}
                  className="absolute h-14 top-3 rounded cursor-pointer hover:brightness-110 transition-all group"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                    backgroundColor: track.color,
                    opacity: track.mute ? 0.4 : 0.8,
                  }}
                  data-testid={`clip-${clip.id}`}
                >
                  <div className="p-1 h-full flex flex-col justify-between">
                    <div className="text-xs font-medium text-white truncate">{clip.name}</div>
                    <div className="h-6 flex items-end gap-0.5">
                      {Array.from({ length: 20 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-white/30 rounded-t"
                          style={{
                            height: `${Math.random() * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-[#252525] border-gray-700 text-white">
        <ContextMenuItem
          onClick={() => onDuplicateTrack(track.id)}
          data-testid={`context-duplicate-${track.id}`}
        >
          <Copy className="h-3 w-3 mr-2" />
          Duplicate Track
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const newColor = TRACK_COLORS[Math.floor(Math.random() * TRACK_COLORS.length)];
            onTrackUpdate(track.id, { color: newColor });
          }}
          data-testid={`context-color-${track.id}`}
        >
          <div className="h-3 w-3 rounded mr-2" style={{ backgroundColor: track.color }} />
          Change Color
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => onDeleteTrack(track.id)}
          data-testid={`context-delete-${track.id}`}
          className="text-red-400"
        >
          <Trash2 className="h-3 w-3 mr-2" />
          Delete Track
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

/**
 * TODO: Add function documentation
 */
export function TrackList({
  tracks,
  trackClips = new Map(),
  mixBusses,
  onTrackNameChange,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onTrackUpdate,
  onDuplicateTrack,
  onDeleteTrack,
  onAddTrack,
  onReorderTracks,
}: TrackListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tracks.findIndex((t) => t.id === active.id);
      const newIndex = tracks.findIndex((t) => t.id === over.id);

      if (onReorderTracks) {
        onReorderTracks(oldIndex, newIndex);
      }
    }
  };

  if (tracks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Music className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No tracks yet</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={onAddTrack}
            data-testid="button-add-first-track"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Track
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ScrollArea className="flex-1">
          {tracks.map((track) => (
            <SortableTrackRow
              key={track.id}
              track={track}
              clips={trackClips.get(track.id) || []}
              mixBusses={mixBusses}
              onTrackNameChange={onTrackNameChange}
              onMuteToggle={onMuteToggle}
              onSoloToggle={onSoloToggle}
              onVolumeChange={onVolumeChange}
              onTrackUpdate={onTrackUpdate}
              onDuplicateTrack={onDuplicateTrack}
              onDeleteTrack={onDeleteTrack}
            />
          ))}
        </ScrollArea>
      </SortableContext>
    </DndContext>
  );
}
