import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Square, Circle, SkipBack, SkipForward, Repeat,
  Volume2, Undo, Redo, Save, Plus, Settings, Sliders, Piano,
  Layers, Mic, Music, Drum, Guitar, FolderOpen, ChevronDown,
  ChevronRight, MoreHorizontal, Lock, Unlock, Eye, EyeOff,
  Trash2, Copy, Scissors, ZoomIn, ZoomOut, Grid3X3, Wand2,
  PanelBottomOpen, PanelBottomClose, PanelRightOpen, PanelRightClose
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUnifiedStore } from '@/stores/unifiedStoreAdapter';
import { useToast } from '@/hooks/use-toast';
import { useProjectSync } from '@/hooks/useProjectSync';
import { apiRequest } from '@/lib/queryClient';

interface StudioOneDAWProps {
  projectId: string | null;
}

type EditorMode = 'arrange' | 'edit' | 'mixer';

const TRACK_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export function StudioOneDAW({ projectId }: StudioOneDAWProps) {
  const store = useUnifiedStore();
  const { tracks, masterTrack, transport, view, project, canUndo, canRedo } = store;
  const { toast } = useToast();
  const { forceSave, loadProjectData } = useProjectSync(projectId);
  
  const [isLoading, setIsLoading] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const projectLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (projectId && projectId !== projectLoadedRef.current) {
      projectLoadedRef.current = projectId;
      setIsLoading(true);
      loadProjectData().finally(() => setIsLoading(false));
    }
  }, [projectId, loadProjectData]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }, []);

  const formatBars = useCallback((seconds: number) => {
    const beatsPerSecond = transport.tempo / 60;
    const totalBeats = seconds * beatsPerSecond;
    const bars = Math.floor(totalBeats / transport.timeSignature?.numerator || 4) + 1;
    const beats = Math.floor(totalBeats % (transport.timeSignature?.numerator || 4)) + 1;
    const ticks = Math.floor((totalBeats % 1) * 480);
    return `${bars}.${beats}.${ticks.toString().padStart(3, '0')}`;
  }, [transport.tempo, transport.timeSignature]);

  const handlePlay = useCallback(() => store.play(), [store]);
  const handlePause = useCallback(() => store.pause(), [store]);
  const handleStop = useCallback(() => store.stop(), [store]);
  const handleRecord = useCallback(() => store.record(), [store]);
  const handleRewind = useCallback(() => store.setPosition(0), [store]);
  const handleToggleLoop = useCallback(() => store.toggleLoop(), [store]);

  const handleAddTrack = useCallback((type: 'audio' | 'instrument' | 'midi' | 'bus') => {
    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
    store.addTrack(type, `${type.charAt(0).toUpperCase() + type.slice(1)} ${tracks.length + 1}`);
    toast({ title: 'Track Added', description: `New ${type} track created.` });
  }, [store, tracks.length, toast]);

  const handleSave = useCallback(async () => {
    try {
      await forceSave();
      toast({ title: 'Project Saved', description: 'All changes have been saved.' });
    } catch (error: any) {
      toast({ title: 'Save Failed', description: error.message, variant: 'destructive' });
    }
  }, [forceSave, toast]);

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  return (
    <div className="h-full w-full flex flex-col bg-[#1a1a1e] text-white overflow-hidden select-none">
      <TransportBar
        transport={transport}
        project={project}
        canUndo={canUndo}
        canRedo={canRedo}
        formatTime={formatTime}
        formatBars={formatBars}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onRecord={handleRecord}
        onRewind={handleRewind}
        onToggleLoop={handleToggleLoop}
        onUndo={() => store.undo()}
        onRedo={() => store.redo()}
        onSave={handleSave}
        onTempoChange={(tempo) => store.setTempo(tempo)}
      />

      <div className="flex-1 flex overflow-hidden">
        {showInspector && selectedTrack && (
          <TrackInspector
            track={selectedTrack}
            onClose={() => setShowInspector(false)}
            onUpdate={(updates) => store.updateTrack(selectedTrackId!, updates)}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <Toolbar
            zoom={zoom}
            onZoomIn={() => setZoom(z => Math.min(z * 1.25, 4))}
            onZoomOut={() => setZoom(z => Math.max(z / 1.25, 0.25))}
            onAddTrack={handleAddTrack}
            showInspector={showInspector}
            showEditor={showEditor}
            showMixer={showMixer}
            onToggleInspector={() => setShowInspector(!showInspector)}
            onToggleEditor={() => setShowEditor(!showEditor)}
            onToggleMixer={() => setShowMixer(!showMixer)}
          />

          <div className="flex-1 flex flex-col overflow-hidden">
            <TimelineRuler zoom={zoom} scrollX={scrollX} tempo={transport.tempo} />

            <div className="flex-1 overflow-auto" onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
              <ArrangeView
                tracks={tracks}
                selectedTrackId={selectedTrackId}
                zoom={zoom}
                scrollX={scrollX}
                playheadPosition={transport.position}
                isPlaying={transport.isPlaying}
                onSelectTrack={setSelectedTrackId}
                onUpdateTrack={(id, updates) => store.updateTrack(id, updates)}
              />
            </div>
          </div>

          {showEditor && (
            <EditorPanel
              track={selectedTrack}
              onClose={() => setShowEditor(false)}
            />
          )}
        </div>
      </div>

      {showMixer && (
        <MixerPanel
          tracks={tracks}
          masterTrack={masterTrack}
          selectedTrackId={selectedTrackId}
          onSelectTrack={setSelectedTrackId}
          onUpdateTrack={(id, updates) => store.updateTrack(id, updates)}
          onClose={() => setShowMixer(false)}
        />
      )}
    </div>
  );
}

interface TransportBarProps {
  transport: any;
  project: any;
  canUndo: boolean;
  canRedo: boolean;
  formatTime: (s: number) => string;
  formatBars: (s: number) => string;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onRewind: () => void;
  onToggleLoop: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onTempoChange: (tempo: number) => void;
}

function TransportBar({
  transport, project, canUndo, canRedo, formatTime, formatBars,
  onPlay, onPause, onStop, onRecord, onRewind, onToggleLoop,
  onUndo, onRedo, onSave, onTempoChange
}: TransportBarProps) {
  return (
    <div className="h-14 bg-[#252529] border-b border-[#333] flex items-center px-4 gap-4 shrink-0">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo} className="h-8 w-8 p-0">
              <Undo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onRedo} disabled={!canRedo} className="h-8 w-8 p-0">
              <Redo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onSave} className="h-8 w-8 p-0">
              <Save className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save (Ctrl+S)</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onRewind} className="h-8 w-8 p-0">
              <SkipBack className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Return to Start</TooltipContent>
        </Tooltip>

        {transport.isPlaying ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onPause} className="h-8 w-8 p-0">
                <Pause className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pause (Space)</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onPlay} className="h-8 w-8 p-0 text-green-500 hover:text-green-400">
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Play (Space)</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onStop} className="h-8 w-8 p-0">
              <Square className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRecord}
              className={cn("h-8 w-8 p-0", transport.isRecording && "text-red-500")}
            >
              <Circle className={cn("h-4 w-4", transport.isRecording && "fill-red-500")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Record (R)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleLoop}
              className={cn("h-8 w-8 p-0", transport.isLooping && "text-blue-500")}
            >
              <Repeat className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Loop (L)</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase">Time</span>
          <span className="font-mono text-sm text-white">{formatTime(transport.position)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase">Bars</span>
          <span className="font-mono text-sm text-white">{formatBars(transport.position)}</span>
        </div>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">BPM</span>
        <input
          type="number"
          value={transport.tempo}
          onChange={(e) => onTempoChange(Number(e.target.value))}
          className="w-16 h-7 bg-[#1a1a1e] border border-[#444] rounded px-2 text-sm font-mono text-center"
          min={20}
          max={300}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Time Sig</span>
        <span className="font-mono text-sm">{transport.timeSignature?.numerator || 4}/{transport.timeSignature?.denominator || 4}</span>
      </div>

      <div className="flex-1" />

      <div className="text-sm text-gray-400 truncate max-w-48">
        {project.name || 'Untitled Project'}
      </div>
    </div>
  );
}

interface ToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAddTrack: (type: 'audio' | 'instrument' | 'midi' | 'bus') => void;
  showInspector: boolean;
  showEditor: boolean;
  showMixer: boolean;
  onToggleInspector: () => void;
  onToggleEditor: () => void;
  onToggleMixer: () => void;
}

function Toolbar({
  zoom, onZoomIn, onZoomOut, onAddTrack,
  showInspector, showEditor, showMixer,
  onToggleInspector, onToggleEditor, onToggleMixer
}: ToolbarProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <div className="h-10 bg-[#1f1f23] border-b border-[#333] flex items-center px-3 gap-2 shrink-0">
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="h-7 gap-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Track
          <ChevronDown className="h-3 w-3" />
        </Button>

        <AnimatePresence>
          {showAddMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 mt-1 bg-[#2a2a2e] border border-[#444] rounded-lg shadow-xl z-50 py-1 min-w-40"
            >
              {[
                { type: 'audio' as const, icon: Music, label: 'Audio Track' },
                { type: 'instrument' as const, icon: Piano, label: 'Instrument Track' },
                { type: 'midi' as const, icon: Layers, label: 'MIDI Track' },
                { type: 'bus' as const, icon: Sliders, label: 'Bus Track' },
              ].map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => { onAddTrack(type); setShowAddMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#3a3a3e] transition-colors"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-5 w-px bg-[#444]" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onZoomOut} className="h-7 w-7 p-0">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-gray-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={onZoomIn} className="h-7 w-7 p-0">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="h-5 w-px bg-[#444]" />

      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
        <Grid3X3 className="h-3.5 w-3.5" />
        Snap
      </Button>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleInspector}
              className={cn("h-7 w-7 p-0", showInspector && "bg-blue-600/20 text-blue-400")}
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Inspector (I)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleEditor}
              className={cn("h-7 w-7 p-0", showEditor && "bg-blue-600/20 text-blue-400")}
            >
              <PanelBottomOpen className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editor (E)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleMixer}
              className={cn("h-7 w-7 p-0", showMixer && "bg-blue-600/20 text-blue-400")}
            >
              <Sliders className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mixer (M)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

interface TimelineRulerProps {
  zoom: number;
  scrollX: number;
  tempo: number;
}

function TimelineRuler({ zoom, scrollX, tempo }: TimelineRulerProps) {
  const pixelsPerBeat = 40 * zoom;
  const beatsPerBar = 4;
  const pixelsPerBar = pixelsPerBeat * beatsPerBar;
  const visibleBars = Math.ceil(1200 / pixelsPerBar) + 2;
  const startBar = Math.floor(scrollX / pixelsPerBar);

  return (
    <div className="h-6 bg-[#1f1f23] border-b border-[#333] flex items-end overflow-hidden shrink-0 ml-48">
      <div
        className="relative h-full"
        style={{ width: `${Math.max(200, (startBar + visibleBars + 50) * pixelsPerBar)}px` }}
      >
        {Array.from({ length: visibleBars + 50 }).map((_, i) => {
          const bar = startBar + i;
          if (bar < 1) return null;
          return (
            <div
              key={bar}
              className="absolute bottom-0 flex flex-col items-center"
              style={{ left: `${bar * pixelsPerBar}px` }}
            >
              <span className="text-[10px] text-gray-500 mb-0.5">{bar}</span>
              <div className="h-2 w-px bg-[#555]" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ArrangeViewProps {
  tracks: any[];
  selectedTrackId: string | null;
  zoom: number;
  scrollX: number;
  playheadPosition: number;
  isPlaying: boolean;
  onSelectTrack: (id: string) => void;
  onUpdateTrack: (id: string, updates: any) => void;
}

function ArrangeView({
  tracks, selectedTrackId, zoom, scrollX, playheadPosition, isPlaying,
  onSelectTrack, onUpdateTrack
}: ArrangeViewProps) {
  const pixelsPerSecond = 40 * zoom;
  const playheadX = playheadPosition * pixelsPerSecond;

  return (
    <div className="relative min-h-full">
      {tracks.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <Music className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No tracks yet</p>
            <p className="text-xs text-gray-600 mt-1">Click "Add Track" to get started</p>
          </div>
        </div>
      ) : (
        tracks.map((track, index) => (
          <TrackLane
            key={track.id}
            track={track}
            index={index}
            isSelected={track.id === selectedTrackId}
            zoom={zoom}
            onSelect={() => onSelectTrack(track.id)}
            onUpdate={(updates) => onUpdateTrack(track.id, updates)}
          />
        ))
      )}

      <div
        className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
        style={{ left: `${playheadX + 192}px` }}
      >
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45" />
      </div>
    </div>
  );
}

interface TrackLaneProps {
  track: any;
  index: number;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: any) => void;
}

function TrackLane({ track, index, isSelected, zoom, onSelect, onUpdate }: TrackLaneProps) {
  const height = track.collapsed ? 24 : (track.height || 80);

  const trackTypeIcon = {
    audio: Music,
    instrument: Piano,
    midi: Layers,
    bus: Sliders,
    master: Volume2,
    aux: Sliders,
  }[track.type] || Music;

  const Icon = trackTypeIcon;

  return (
    <div
      className={cn(
        "flex border-b border-[#333] transition-colors cursor-pointer",
        isSelected ? "bg-[#2a2a3a]" : "hover:bg-[#232328]"
      )}
      style={{ height }}
      onClick={onSelect}
    >
      <div
        className="w-48 shrink-0 flex items-center gap-2 px-3 border-r border-[#333]"
        style={{ backgroundColor: `${track.color}15` }}
      >
        <div className="w-1 h-full absolute left-0" style={{ backgroundColor: track.color }} />
        
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ collapsed: !track.collapsed }); }}
          className="hover:bg-white/10 rounded p-0.5"
        >
          {track.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <Icon className="h-4 w-4" style={{ color: track.color }} />

        <span className="text-sm truncate flex-1">{track.name}</span>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate({ muted: !track.muted }); }}
            className={cn(
              "h-5 w-5 flex items-center justify-center rounded text-[10px] font-bold",
              track.muted ? "bg-orange-600 text-white" : "bg-[#333] hover:bg-[#444]"
            )}
          >
            M
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate({ solo: !track.solo }); }}
            className={cn(
              "h-5 w-5 flex items-center justify-center rounded text-[10px] font-bold",
              track.solo ? "bg-yellow-600 text-white" : "bg-[#333] hover:bg-[#444]"
            )}
          >
            S
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate({ armed: !track.armed }); }}
            className={cn(
              "h-5 w-5 flex items-center justify-center rounded text-[10px]",
              track.armed ? "bg-red-600 text-white" : "bg-[#333] hover:bg-[#444]"
            )}
          >
            <Circle className="h-2.5 w-2.5" fill={track.armed ? "white" : "none"} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-[#1a1a1e] overflow-hidden">
        {!track.collapsed && track.audioClips?.map((clip: any) => (
          <AudioClipView key={clip.id} clip={clip} zoom={zoom} trackColor={track.color} />
        ))}
        {!track.collapsed && track.midiClips?.map((clip: any) => (
          <MidiClipView key={clip.id} clip={clip} zoom={zoom} trackColor={track.color} />
        ))}
      </div>
    </div>
  );
}

interface AudioClipViewProps {
  clip: any;
  zoom: number;
  trackColor: string;
}

function AudioClipView({ clip, zoom, trackColor }: AudioClipViewProps) {
  const pixelsPerSecond = 40 * zoom;
  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;

  return (
    <div
      className="absolute top-1 bottom-1 rounded overflow-hidden"
      style={{
        left,
        width: Math.max(width, 20),
        backgroundColor: `${trackColor}40`,
        borderLeft: `2px solid ${trackColor}`,
      }}
    >
      <div className="px-1.5 py-0.5 text-[10px] truncate text-white/80">{clip.name}</div>
      <div className="absolute inset-x-0 bottom-0 h-8 flex items-end justify-around px-1">
        {Array.from({ length: Math.min(50, Math.floor(width / 4)) }).map((_, i) => (
          <div
            key={i}
            className="w-px bg-white/30"
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

interface MidiClipViewProps {
  clip: any;
  zoom: number;
  trackColor: string;
}

function MidiClipView({ clip, zoom, trackColor }: MidiClipViewProps) {
  const pixelsPerSecond = 40 * zoom;
  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;

  return (
    <div
      className="absolute top-1 bottom-1 rounded overflow-hidden"
      style={{
        left,
        width: Math.max(width, 20),
        backgroundColor: `${trackColor}40`,
        borderLeft: `2px solid ${trackColor}`,
      }}
    >
      <div className="px-1.5 py-0.5 text-[10px] truncate text-white/80">{clip.name}</div>
      <div className="absolute inset-x-1 bottom-1 top-5 flex flex-col gap-px overflow-hidden">
        {clip.notes?.slice(0, 8).map((note: any, i: number) => (
          <div
            key={i}
            className="h-1.5 rounded-sm"
            style={{
              backgroundColor: trackColor,
              width: `${(note.duration / clip.duration) * 100}%`,
              marginLeft: `${(note.startTime / clip.duration) * 100}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface TrackInspectorProps {
  track: any;
  onClose: () => void;
  onUpdate: (updates: any) => void;
}

function TrackInspector({ track, onClose, onUpdate }: TrackInspectorProps) {
  return (
    <div className="w-64 bg-[#1f1f23] border-r border-[#333] flex flex-col shrink-0 overflow-hidden">
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#333]">
        <span className="text-sm font-medium">Inspector</span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <PanelRightClose className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        <div>
          <label className="text-[10px] text-gray-500 uppercase">Track Name</label>
          <input
            type="text"
            value={track.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full mt-1 h-7 bg-[#2a2a2e] border border-[#444] rounded px-2 text-sm"
          />
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase">Volume</label>
          <div className="flex items-center gap-2 mt-1">
            <Slider
              value={[track.volume * 100]}
              onValueChange={([v]) => onUpdate({ volume: v / 100 })}
              max={100}
              className="flex-1"
            />
            <span className="text-xs w-10 text-right">{Math.round(track.volume * 100)}%</span>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase">Pan</label>
          <div className="flex items-center gap-2 mt-1">
            <Slider
              value={[track.pan * 50 + 50]}
              onValueChange={([v]) => onUpdate({ pan: (v - 50) / 50 })}
              max={100}
              className="flex-1"
            />
            <span className="text-xs w-10 text-right">
              {track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(-track.pan * 100)}`}
            </span>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase">Color</label>
          <div className="flex gap-1 mt-1 flex-wrap">
            {TRACK_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onUpdate({ color })}
                className={cn(
                  "w-6 h-6 rounded",
                  track.color === color && "ring-2 ring-white ring-offset-1 ring-offset-[#1f1f23]"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-[#333]">
          <label className="text-[10px] text-gray-500 uppercase">Plugins ({track.plugins?.length || 0})</label>
          <div className="mt-2 space-y-1">
            {track.plugins?.map((plugin: any) => (
              <div
                key={plugin.id}
                className="flex items-center gap-2 p-2 bg-[#2a2a2e] rounded text-xs"
              >
                <Wand2 className="h-3.5 w-3.5 text-purple-400" />
                <span className="truncate flex-1">{plugin.name}</span>
                <button
                  onClick={() => {}}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    plugin.bypassed ? "bg-gray-600" : "bg-green-600/30 text-green-400"
                  )}
                >
                  {plugin.bypassed ? 'OFF' : 'ON'}
                </button>
              </div>
            ))}
            {(!track.plugins || track.plugins.length === 0) && (
              <p className="text-xs text-gray-500 italic">No plugins</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface EditorPanelProps {
  track: any;
  onClose: () => void;
}

function EditorPanel({ track, onClose }: EditorPanelProps) {
  return (
    <div className="h-48 bg-[#1a1a1e] border-t border-[#333] flex flex-col shrink-0">
      <div className="h-8 flex items-center justify-between px-3 bg-[#1f1f23] border-b border-[#333]">
        <span className="text-sm font-medium">
          {track ? `Editing: ${track.name}` : 'Editor'}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <PanelBottomClose className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-500">
        {track ? (
          <div className="text-center">
            <Piano className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select a clip to edit</p>
          </div>
        ) : (
          <div className="text-center">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select a track first</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface MixerPanelProps {
  tracks: any[];
  masterTrack: any;
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onUpdateTrack: (id: string, updates: any) => void;
  onClose: () => void;
}

function MixerPanel({ tracks, masterTrack, selectedTrackId, onSelectTrack, onUpdateTrack, onClose }: MixerPanelProps) {
  return (
    <div className="h-64 bg-[#1a1a1e] border-t border-[#333] flex flex-col shrink-0">
      <div className="h-8 flex items-center justify-between px-3 bg-[#1f1f23] border-b border-[#333]">
        <span className="text-sm font-medium">Mixer</span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <PanelBottomClose className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 flex overflow-x-auto p-2 gap-1">
        {tracks.map((track) => (
          <ChannelStrip
            key={track.id}
            track={track}
            isSelected={track.id === selectedTrackId}
            onSelect={() => onSelectTrack(track.id)}
            onUpdate={(updates) => onUpdateTrack(track.id, updates)}
          />
        ))}
        {masterTrack && (
          <ChannelStrip
            track={{ ...masterTrack, name: 'Master', type: 'master', color: '#888' }}
            isSelected={false}
            isMaster
            onSelect={() => {}}
            onUpdate={() => {}}
          />
        )}
      </div>
    </div>
  );
}

interface ChannelStripProps {
  track: any;
  isSelected: boolean;
  isMaster?: boolean;
  onSelect: () => void;
  onUpdate: (updates: any) => void;
}

function ChannelStrip({ track, isSelected, isMaster, onSelect, onUpdate }: ChannelStripProps) {
  const meterLevel = track.meterLevel?.left || 0;

  return (
    <div
      className={cn(
        "w-16 shrink-0 flex flex-col rounded overflow-hidden cursor-pointer transition-colors",
        isSelected ? "bg-[#2a2a3a]" : "bg-[#252529] hover:bg-[#2a2a2e]",
        isMaster && "bg-[#2a2a35]"
      )}
      onClick={onSelect}
    >
      <div className="text-[10px] text-center py-1 truncate px-1 border-b border-[#333]" style={{ color: track.color }}>
        {track.name}
      </div>

      <div className="flex-1 flex items-center justify-center py-2">
        <div className="h-full w-3 bg-[#1a1a1e] rounded relative overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 transition-all"
            style={{ height: `${meterLevel * 100}%` }}
          />
        </div>
      </div>

      <div className="px-1.5 pb-1">
        <input
          type="range"
          min={0}
          max={100}
          value={track.volume * 100}
          onChange={(e) => onUpdate({ volume: Number(e.target.value) / 100 })}
          className="w-full h-20 appearance-none bg-transparent cursor-pointer"
          style={{
            writingMode: 'vertical-lr',
            direction: 'rtl',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="flex justify-center gap-0.5 pb-1">
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ muted: !track.muted }); }}
          className={cn(
            "h-4 w-4 flex items-center justify-center rounded text-[8px] font-bold",
            track.muted ? "bg-orange-600" : "bg-[#333]"
          )}
        >
          M
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ solo: !track.solo }); }}
          className={cn(
            "h-4 w-4 flex items-center justify-center rounded text-[8px] font-bold",
            track.solo ? "bg-yellow-600" : "bg-[#333]"
          )}
        >
          S
        </button>
      </div>

      <div className="text-[10px] text-center py-1 text-gray-400">
        {Math.round(track.volume * 100)}%
      </div>
    </div>
  );
}

export default StudioOneDAW;
