import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import { 
  Play, Pause, Square, Circle, Plus, Volume2, Trash2, 
  ZoomIn, ZoomOut, Grip, Settings, ChevronRight 
} from 'lucide-react';

// =============================================================================
// STATE TYPES
// =============================================================================

interface Clip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  color: string;
}

interface Plugin {
  id: string;
  name: string;
  type: 'volume' | 'eq' | 'compressor' | 'reverb' | 'delay';
  enabled: boolean;
  params: Record<string, number>;
}

interface Track {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  clips: Clip[];
  plugins: Plugin[];
  meter: Tone.Meter | null;
  channel: Tone.Channel | null;
}

interface DAWState {
  tracks: Track[];
  selectedTrackId: string | null;
  isPlaying: boolean;
  isRecording: boolean;
  bpm: number;
  currentTime: number;
  pixelsPerSecond: number;
  loopStart: number;
  loopEnd: number;
  loopEnabled: boolean;
}

// =============================================================================
// MASTER CLOCK SYNC HOOK
// =============================================================================

function useMasterClock(callback: (time: number) => void, enabled: boolean = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  useEffect(() => {
    if (!enabled) return;
    
    let animationId: number | null = null;
    let mounted = true;
    
    const tick = () => {
      if (!mounted) return;
      callbackRef.current(Tone.Transport.seconds);
      animationId = requestAnimationFrame(tick);
    };
    
    animationId = requestAnimationFrame(tick);
    
    return () => {
      mounted = false;
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [enabled]);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const formatTimecode = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const TRACK_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', 
  '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

const DEFAULT_PLUGINS: Omit<Plugin, 'id'>[] = [
  { name: 'Volume', type: 'volume', enabled: true, params: { gain: 0 } },
  { name: 'EQ', type: 'eq', enabled: false, params: { low: 0, mid: 0, high: 0 } },
  { name: 'Compressor', type: 'compressor', enabled: false, params: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 } },
];

// =============================================================================
// VU METER COMPONENT
// =============================================================================

interface VUMeterProps {
  meter: Tone.Meter | null;
  height?: number;
}

function VUMeter({ meter, height = 120 }: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!meter || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number | null = null;
    let mounted = true;
    
    const draw = () => {
      if (!mounted) return;
      
      const level = meter.getValue();
      const db = typeof level === 'number' ? level : Array.isArray(level) ? level[0] : -100;
      const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
      
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const barHeight = normalized * canvas.height;
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#10b981');
      gradient.addColorStop(0.6, '#10b981');
      gradient.addColorStop(0.8, '#f59e0b');
      gradient.addColorStop(1, '#ef4444');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(2, canvas.height - barHeight, canvas.width - 4, barHeight);
      
      for (let i = 0; i < 12; i++) {
        const y = (i / 12) * canvas.height;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, y, canvas.width, 1);
      }
      
      animationId = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => {
      mounted = false;
      if (animationId !== null) cancelAnimationFrame(animationId);
    };
  }, [meter]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={24} 
      height={height} 
      className="rounded-sm"
    />
  );
}

// =============================================================================
// TRANSPORT BAR COMPONENT
// =============================================================================

interface TransportBarProps {
  state: DAWState;
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  onBpmChange: (bpm: number) => void;
  masterMeter: Tone.Meter | null;
}

function TransportBar({ state, onPlay, onStop, onRecord, onBpmChange, masterMeter }: TransportBarProps) {
  const [displayTime, setDisplayTime] = useState(0);
  
  useMasterClock(setDisplayTime);
  
  return (
    <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-6">
      <div className="flex items-center gap-2">
        <button
          onClick={onPlay}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
            state.isPlaying 
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {state.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>
        
        <button
          onClick={onStop}
          className="w-10 h-10 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center transition-all"
        >
          <Square className="w-4 h-4" />
        </button>
        
        <button
          onClick={onRecord}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
            state.isRecording 
              ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' 
              : 'bg-slate-800 text-red-400 hover:bg-slate-700'
          }`}
        >
          <Circle className="w-4 h-4 fill-current" />
        </button>
      </div>
      
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-950 rounded-lg border border-slate-800">
        <span className="text-xs text-slate-500 uppercase tracking-wider">Time</span>
        <span className="font-mono text-xl text-emerald-400 tracking-wider min-w-[140px]">
          {formatTimecode(displayTime)}
        </span>
      </div>
      
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-950 rounded-lg border border-slate-800">
        <span className="text-xs text-slate-500 uppercase tracking-wider">BPM</span>
        <input
          type="range"
          min="60"
          max="200"
          value={state.bpm}
          onChange={(e) => onBpmChange(Number(e.target.value))}
          className="w-24 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
        <span className="font-mono text-lg text-emerald-400 w-12">{state.bpm}</span>
      </div>
      
      <div className="ml-auto flex items-center gap-3">
        <div className="flex gap-1">
          <VUMeter meter={masterMeter} height={40} />
          <VUMeter meter={masterMeter} height={40} />
        </div>
        <span className="text-xs text-slate-500 uppercase">Master</span>
      </div>
    </div>
  );
}

// =============================================================================
// CLIP COMPONENT (Draggable)
// =============================================================================

interface ClipProps {
  clip: Clip;
  pixelsPerSecond: number;
  onDragStart: (e: React.DragEvent, clipId: string) => void;
  onDragEnd: () => void;
}

function ClipComponent({ clip, pixelsPerSecond, onDragStart, onDragEnd }: ClipProps) {
  const width = clip.duration * pixelsPerSecond;
  const left = clip.startTime * pixelsPerSecond;
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, clip.id)}
      onDragEnd={onDragEnd}
      className="absolute top-1 bottom-1 rounded cursor-grab active:cursor-grabbing group"
      style={{
        left: `${left}px`,
        width: `${width}px`,
        backgroundColor: clip.color,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded" />
      <div className="px-2 py-1 text-xs text-white font-medium truncate">
        {clip.name}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-4 flex items-center justify-center">
        <div className="w-full h-2 bg-black/30 rounded-sm mx-1 overflow-hidden">
          <div className="h-full bg-white/40" style={{ width: '60%' }} />
        </div>
      </div>
      <Grip className="absolute right-1 top-1 w-3 h-3 text-white/50 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

// =============================================================================
// TRACK ROW COMPONENT
// =============================================================================

interface TrackRowProps {
  track: Track;
  isSelected: boolean;
  pixelsPerSecond: number;
  totalWidth: number;
  onSelect: () => void;
  onMute: () => void;
  onSolo: () => void;
  onVolumeChange: (volume: number) => void;
  onClipDragStart: (e: React.DragEvent, clipId: string) => void;
  onClipDragEnd: () => void;
  onClipDrop: (e: React.DragEvent) => void;
}

function TrackRow({ 
  track, isSelected, pixelsPerSecond, totalWidth, onSelect, 
  onMute, onSolo, onVolumeChange, onClipDragStart, onClipDragEnd, onClipDrop 
}: TrackRowProps) {
  return (
    <div 
      className={`flex border-b border-slate-800/50 ${isSelected ? 'bg-slate-800/30' : ''}`}
      onClick={onSelect}
    >
      <div className="w-48 flex-shrink-0 p-2 bg-slate-900/80 border-r border-slate-800 flex items-center gap-2">
        <div className="w-3 h-8 rounded-sm" style={{ backgroundColor: track.color }} />
        
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-200 truncate">{track.name}</div>
          <div className="flex items-center gap-1 mt-1">
            <button
              onClick={(e) => { e.stopPropagation(); onMute(); }}
              className={`px-1.5 py-0.5 text-[10px] rounded ${
                track.mute ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              M
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSolo(); }}
              className={`px-1.5 py-0.5 text-[10px] rounded ${
                track.solo ? 'bg-yellow-500 text-black' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              S
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <input
            type="range"
            min="-60"
            max="6"
            value={track.volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="w-12 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
            style={{ writingMode: 'bt-lr', transform: 'rotate(-90deg)', height: '50px', width: '12px' }}
          />
          <VUMeter meter={track.meter} height={50} />
        </div>
      </div>
      
      <div 
        className="h-16 relative flex-1 bg-slate-950/50"
        style={{ minWidth: `${totalWidth}px` }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onClipDrop}
      >
        {track.clips.map(clip => (
          <ClipComponent
            key={clip.id}
            clip={clip}
            pixelsPerSecond={pixelsPerSecond}
            onDragStart={onClipDragStart}
            onDragEnd={onClipDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// ARRANGEMENT VIEW COMPONENT
// =============================================================================

interface ArrangementViewProps {
  state: DAWState;
  onSelectTrack: (trackId: string) => void;
  onMuteTrack: (trackId: string) => void;
  onSoloTrack: (trackId: string) => void;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
  onClipMove: (clipId: string, trackId: string, newStartTime: number) => void;
  onZoom: (delta: number) => void;
}

function ArrangementView({ 
  state, onSelectTrack, onMuteTrack, onSoloTrack, 
  onTrackVolumeChange, onClipMove, onZoom 
}: ArrangementViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{ clipId: string; trackId: string } | null>(null);
  
  const totalDuration = 300;
  const totalWidth = totalDuration * state.pixelsPerSecond;
  const TRACK_LABEL_WIDTH = 192;
  
  useMasterClock((time) => {
    if (playheadRef.current) {
      const position = time * state.pixelsPerSecond;
      playheadRef.current.style.transform = `translateX(${position}px)`;
    }
  });
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onZoom(e.deltaY > 0 ? -10 : 10);
    }
  }, [onZoom]);
  
  const handleClipDragStart = useCallback((e: React.DragEvent, clipId: string, trackId: string) => {
    setDragState({ clipId, trackId });
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  
  const handleClipDrop = useCallback((e: React.DragEvent, trackId: string) => {
    if (!dragState || !scrollRef.current) return;
    
    const rect = scrollRef.current.getBoundingClientRect();
    const scrollLeft = scrollRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - TRACK_LABEL_WIDTH;
    const newStartTime = Math.max(0, x / state.pixelsPerSecond);
    
    onClipMove(dragState.clipId, trackId, newStartTime);
    setDragState(null);
  }, [dragState, state.pixelsPerSecond, onClipMove]);
  
  const gridLines = useMemo(() => {
    const lines: number[] = [];
    const beatInterval = 60 / state.bpm;
    const barInterval = beatInterval * 4;
    
    for (let t = 0; t < totalDuration; t += barInterval) {
      lines.push(t * state.pixelsPerSecond);
    }
    return lines;
  }, [state.bpm, state.pixelsPerSecond, totalDuration]);
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
      <div className="h-8 flex border-b border-slate-800 bg-slate-900/50">
        <div className="w-48 flex-shrink-0 flex items-center justify-between px-3 border-r border-slate-800">
          <span className="text-xs text-slate-500 uppercase">Tracks</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onZoom(-10)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-xs text-slate-500 w-8 text-center">
              {Math.round(state.pixelsPerSecond)}px
            </span>
            <button
              onClick={() => onZoom(10)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0 flex items-center" style={{ width: `${totalWidth}px` }}>
            {gridLines.map((pos, i) => (
              <div 
                key={i}
                className="absolute h-full flex flex-col justify-end pb-1"
                style={{ left: `${pos}px` }}
              >
                <span className="text-[10px] text-slate-600 ml-1">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto relative"
        onWheel={handleWheel}
        style={{ '--pixels-per-second': `${state.pixelsPerSecond}px` } as React.CSSProperties}
      >
        <div className="absolute top-0 left-48 bottom-0 w-0.5 bg-emerald-500 z-20 pointer-events-none shadow-[0_0_10px_rgba(16,185,129,0.5)]" ref={playheadRef}>
          <div className="absolute -top-1 -left-1.5 w-4 h-3 bg-emerald-500 rounded-sm" />
        </div>
        
        <div className="absolute inset-0 pointer-events-none">
          {gridLines.map((pos, i) => (
            <div 
              key={i}
              className="absolute top-0 bottom-0 w-px bg-slate-800/50"
              style={{ left: `${pos + TRACK_LABEL_WIDTH}px` }}
            />
          ))}
        </div>
        
        <div className="relative">
          {state.tracks.map(track => (
            <TrackRow
              key={track.id}
              track={track}
              isSelected={state.selectedTrackId === track.id}
              pixelsPerSecond={state.pixelsPerSecond}
              totalWidth={totalWidth}
              onSelect={() => onSelectTrack(track.id)}
              onMute={() => onMuteTrack(track.id)}
              onSolo={() => onSoloTrack(track.id)}
              onVolumeChange={(vol) => onTrackVolumeChange(track.id, vol)}
              onClipDragStart={(e, clipId) => handleClipDragStart(e, clipId, track.id)}
              onClipDragEnd={() => setDragState(null)}
              onClipDrop={(e) => handleClipDrop(e, track.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SIGNAL PATH MIXER COMPONENT
// =============================================================================

interface SignalPathMixerProps {
  selectedTrack: Track | null;
  onTogglePlugin: (pluginId: string) => void;
  onPluginParamChange: (pluginId: string, param: string, value: number) => void;
}

function SignalPathMixer({ selectedTrack, onTogglePlugin, onPluginParamChange }: SignalPathMixerProps) {
  if (!selectedTrack) {
    return (
      <div className="h-28 bg-slate-900 border-t border-slate-800 flex items-center justify-center text-slate-500">
        Select a track to view signal path
      </div>
    );
  }
  
  return (
    <div className="h-28 bg-slate-900 border-t border-slate-800 p-3">
      <div className="flex items-center gap-2 h-full overflow-x-auto">
        <div className="flex-shrink-0 text-xs text-slate-500 uppercase tracking-wider mr-2">
          Signal Path
        </div>
        
        {selectedTrack.plugins.map((plugin, index) => (
          <div key={plugin.id} className="flex items-center gap-2">
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
            )}
            
            <div 
              className={`flex-shrink-0 w-32 h-20 rounded-lg border ${
                plugin.enabled 
                  ? 'bg-slate-800 border-emerald-500/50' 
                  : 'bg-slate-800/50 border-slate-700'
              } p-2 flex flex-col`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${plugin.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {plugin.name}
                </span>
                <button
                  onClick={() => onTogglePlugin(plugin.id)}
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${
                    plugin.enabled ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-slate-400'
                  }`}
                >
                  {plugin.enabled ? '●' : '○'}
                </button>
              </div>
              
              <div className="flex-1 flex items-center gap-1">
                {Object.entries(plugin.params).slice(0, 3).map(([key, value]) => (
                  <div key={key} className="flex-1 flex flex-col items-center">
                    <div 
                      className="w-6 h-6 rounded-full bg-slate-700 border-2 border-slate-600 cursor-pointer"
                      title={`${key}: ${value}`}
                    />
                    <span className="text-[8px] text-slate-500 mt-0.5 capitalize">{key.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        
        <button className="flex-shrink-0 w-20 h-20 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-600 hover:border-emerald-500 hover:text-emerald-500 transition-colors">
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN DAW COMPONENT
// =============================================================================

export function HighPerformanceDAW() {
  const masterMeterRef = useRef<Tone.Meter | null>(null);
  const [state, setState] = useState<DAWState>({
    tracks: [],
    selectedTrackId: null,
    isPlaying: false,
    isRecording: false,
    bpm: 120,
    currentTime: 0,
    pixelsPerSecond: 50,
    loopStart: 0,
    loopEnd: 16,
    loopEnabled: false,
  });
  
  useEffect(() => {
    if (!masterMeterRef.current) {
      masterMeterRef.current = new Tone.Meter({ smoothing: 0.8 });
      Tone.getDestination().connect(masterMeterRef.current);
    }
    
    return () => {
      masterMeterRef.current?.dispose();
      masterMeterRef.current = null;
    };
  }, []);
  
  useEffect(() => {
    Tone.Transport.bpm.value = state.bpm;
  }, [state.bpm]);
  
  const handlePlay = useCallback(async () => {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
    
    if (state.isPlaying) {
      Tone.Transport.pause();
    } else {
      Tone.Transport.start();
    }
    
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, [state.isPlaying]);
  
  const handleStop = useCallback(() => {
    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
    setState(prev => ({ ...prev, isPlaying: false, isRecording: false }));
  }, []);
  
  const handleRecord = useCallback(() => {
    setState(prev => ({ ...prev, isRecording: !prev.isRecording }));
  }, []);
  
  const handleBpmChange = useCallback((bpm: number) => {
    setState(prev => ({ ...prev, bpm }));
  }, []);
  
  const handleAddTrack = useCallback(() => {
    const trackNumber = state.tracks.length + 1;
    const channel = new Tone.Channel().toDestination();
    const meter = new Tone.Meter({ smoothing: 0.8 });
    channel.connect(meter);
    
    const newTrack: Track = {
      id: generateId(),
      name: `Track ${trackNumber}`,
      color: TRACK_COLORS[trackNumber % TRACK_COLORS.length],
      volume: 0,
      pan: 0,
      mute: false,
      solo: false,
      clips: [
        {
          id: generateId(),
          name: `Clip ${trackNumber}`,
          startTime: Math.random() * 8,
          duration: 2 + Math.random() * 4,
          color: TRACK_COLORS[trackNumber % TRACK_COLORS.length],
        }
      ],
      plugins: DEFAULT_PLUGINS.map(p => ({ ...p, id: generateId() })),
      meter,
      channel,
    };
    
    setState(prev => ({ ...prev, tracks: [...prev.tracks, newTrack] }));
  }, [state.tracks.length]);
  
  const handleSelectTrack = useCallback((trackId: string) => {
    setState(prev => ({ ...prev, selectedTrackId: trackId }));
  }, []);
  
  const handleMuteTrack = useCallback((trackId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === trackId) {
          if (t.channel) t.channel.mute = !t.mute;
          return { ...t, mute: !t.mute };
        }
        return t;
      })
    }));
  }, []);
  
  const handleSoloTrack = useCallback((trackId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === trackId) {
          return { ...t, solo: !t.solo };
        }
        return t;
      })
    }));
  }, []);
  
  const handleTrackVolumeChange = useCallback((trackId: string, volume: number) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === trackId) {
          if (t.channel) t.channel.volume.value = volume;
          return { ...t, volume };
        }
        return t;
      })
    }));
  }, []);
  
  const handleClipMove = useCallback((clipId: string, targetTrackId: string, newStartTime: number) => {
    setState(prev => {
      let movedClip: Clip | null = null;
      let sourceTrackId: string | null = null;
      
      for (const track of prev.tracks) {
        const clip = track.clips.find(c => c.id === clipId);
        if (clip) {
          movedClip = { ...clip, startTime: newStartTime };
          sourceTrackId = track.id;
          break;
        }
      }
      
      if (!movedClip || !sourceTrackId) return prev;
      
      return {
        ...prev,
        tracks: prev.tracks.map(t => {
          if (t.id === sourceTrackId) {
            return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
          }
          if (t.id === targetTrackId) {
            return { ...t, clips: [...t.clips, movedClip!] };
          }
          return t;
        })
      };
    });
  }, []);
  
  const handleZoom = useCallback((delta: number) => {
    setState(prev => ({
      ...prev,
      pixelsPerSecond: Math.max(10, Math.min(200, prev.pixelsPerSecond + delta))
    }));
  }, []);
  
  const handleTogglePlugin = useCallback((pluginId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === prev.selectedTrackId) {
          return {
            ...t,
            plugins: t.plugins.map(p => p.id === pluginId ? { ...p, enabled: !p.enabled } : p)
          };
        }
        return t;
      })
    }));
  }, []);
  
  const handlePluginParamChange = useCallback((pluginId: string, param: string, value: number) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === prev.selectedTrackId) {
          return {
            ...t,
            plugins: t.plugins.map(p => 
              p.id === pluginId 
                ? { ...p, params: { ...p.params, [param]: value } }
                : p
            )
          };
        }
        return t;
      })
    }));
  }, []);
  
  const selectedTrack = state.tracks.find(t => t.id === state.selectedTrackId) || null;
  
  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-white overflow-hidden">
      <TransportBar
        state={state}
        onPlay={handlePlay}
        onStop={handleStop}
        onRecord={handleRecord}
        onBpmChange={handleBpmChange}
        masterMeter={masterMeterRef.current}
      />
      
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 border-b border-slate-800">
        <button
          onClick={handleAddTrack}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Track
        </button>
        
        {state.tracks.length > 0 && (
          <span className="text-xs text-slate-500">
            {state.tracks.length} track{state.tracks.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      
      <ArrangementView
        state={state}
        onSelectTrack={handleSelectTrack}
        onMuteTrack={handleMuteTrack}
        onSoloTrack={handleSoloTrack}
        onTrackVolumeChange={handleTrackVolumeChange}
        onClipMove={handleClipMove}
        onZoom={handleZoom}
      />
      
      <SignalPathMixer
        selectedTrack={selectedTrack}
        onTogglePlugin={handleTogglePlugin}
        onPluginParamChange={handlePluginParamChange}
      />
    </div>
  );
}

export default HighPerformanceDAW;
