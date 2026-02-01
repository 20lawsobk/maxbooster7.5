import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import { 
  Play, Pause, Square, Circle, Plus, Volume2, Trash2, 
  ZoomIn, ZoomOut, Grip, Settings, ChevronRight, Repeat,
  SkipBack, SkipForward, Mic, Headphones, Music, Waves,
  Sliders, Activity, X, Copy, Scissors, MoreVertical, Library
} from 'lucide-react';
import { PluginDialog, type PluginDefinition, type PluginParameter } from './PluginDialog';
import { PluginBrowser } from './PluginBrowser';

// =============================================================================
// STATE TYPES
// =============================================================================

interface Clip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  color: string;
  waveformData?: number[];
}

interface Plugin {
  id: string;
  instanceId: string;
  pluginDef: PluginDefinition | null;
  name: string;
  type: string;
  enabled: boolean;
  params: Record<string, number | boolean | string>;
}

interface Track {
  id: string;
  name: string;
  type: 'audio' | 'instrument' | 'bus' | 'master';
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  clips: Clip[];
  plugins: Plugin[];
  meter: Tone.Meter | null;
  channel: Tone.Channel | null;
}

interface DAWState {
  tracks: Track[];
  selectedTrackId: string | null;
  selectedClipId: string | null;
  isPlaying: boolean;
  isRecording: boolean;
  bpm: number;
  timeSignature: [number, number];
  currentTime: number;
  pixelsPerSecond: number;
  loopStart: number;
  loopEnd: number;
  loopEnabled: boolean;
  snapEnabled: boolean;
  snapValue: number;
  masterVolume: number;
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
// KEYBOARD SHORTCUTS HOOK
// =============================================================================

function useKeyboardShortcuts(handlers: Record<string, () => void>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const key = e.code;
      if (handlers[key]) {
        e.preventDefault();
        handlers[key]();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const formatTimecode = (seconds: number, bpm: number = 120): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const formatBarsBeats = (seconds: number, bpm: number, timeSig: [number, number]): string => {
  const beatsPerSecond = bpm / 60;
  const totalBeats = seconds * beatsPerSecond;
  const beatsPerBar = timeSig[0];
  const bars = Math.floor(totalBeats / beatsPerBar) + 1;
  const beats = Math.floor(totalBeats % beatsPerBar) + 1;
  const ticks = Math.floor((totalBeats % 1) * 960);
  return `${bars}.${beats}.${ticks.toString().padStart(3, '0')}`;
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const generateWaveformData = (length: number = 50): number[] => {
  const data: number[] = [];
  for (let i = 0; i < length; i++) {
    data.push(0.2 + Math.random() * 0.6);
  }
  return data;
};

const TRACK_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', 
  '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

const TRACK_TYPES: { value: Track['type']; label: string; icon: typeof Music }[] = [
  { value: 'audio', label: 'Audio', icon: Waves },
  { value: 'instrument', label: 'Instrument', icon: Music },
  { value: 'bus', label: 'Bus', icon: Sliders },
];

const DEFAULT_PLUGINS: Omit<Plugin, 'id'>[] = [
  { name: 'Volume', type: 'volume', enabled: true, params: { gain: 0 } },
  { name: 'EQ', type: 'eq', enabled: false, params: { low: 0, mid: 0, high: 0 } },
  { name: 'Compressor', type: 'compressor', enabled: false, params: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 } },
  { name: 'Reverb', type: 'reverb', enabled: false, params: { decay: 2.5, wet: 0.3 } },
];

// =============================================================================
// VU METER COMPONENT
// =============================================================================

interface VUMeterProps {
  meter: Tone.Meter | null;
  height?: number;
  width?: number;
  stereo?: boolean;
}

function VUMeter({ meter, height = 120, width = 12, stereo = false }: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!meter || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number | null = null;
    let mounted = true;
    let peakL = -100;
    let peakR = -100;
    let peakHoldL = 0;
    let peakHoldR = 0;
    
    const draw = () => {
      if (!mounted) return;
      
      const level = meter.getValue();
      const dbL = typeof level === 'number' ? level : Array.isArray(level) ? level[0] : -100;
      const dbR = stereo && Array.isArray(level) ? level[1] || level[0] : dbL;
      
      const normalizedL = Math.max(0, Math.min(1, (dbL + 60) / 60));
      const normalizedR = Math.max(0, Math.min(1, (dbR + 60) / 60));
      
      if (normalizedL > peakL) { peakL = normalizedL; peakHoldL = 30; }
      if (normalizedR > peakR) { peakR = normalizedR; peakHoldR = 30; }
      
      if (peakHoldL > 0) peakHoldL--;
      else peakL = Math.max(normalizedL, peakL - 0.02);
      if (peakHoldR > 0) peakHoldR--;
      else peakR = Math.max(normalizedR, peakR - 0.02);
      
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const meterWidth = stereo ? (canvas.width - 2) / 2 : canvas.width - 4;
      
      const drawMeter = (x: number, normalized: number, peak: number) => {
        const barHeight = normalized * canvas.height;
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#10b981');
        gradient.addColorStop(0.6, '#10b981');
        gradient.addColorStop(0.8, '#f59e0b');
        gradient.addColorStop(0.95, '#ef4444');
        gradient.addColorStop(1, '#ff0000');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, meterWidth, barHeight);
        
        const peakY = canvas.height - (peak * canvas.height);
        ctx.fillStyle = peak > 0.95 ? '#ff0000' : '#ffffff';
        ctx.fillRect(x, peakY, meterWidth, 2);
      };
      
      if (stereo) {
        drawMeter(1, normalizedL, peakL);
        drawMeter(canvas.width / 2 + 1, normalizedR, peakR);
      } else {
        drawMeter(2, normalizedL, peakL);
      }
      
      for (let i = 0; i < 20; i++) {
        const y = (i / 20) * canvas.height;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
        ctx.fillRect(0, y, canvas.width, 1);
      }
      
      animationId = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => {
      mounted = false;
      if (animationId !== null) cancelAnimationFrame(animationId);
    };
  }, [meter, stereo]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={stereo ? width * 2 : width} 
      height={height} 
      className="rounded-sm"
    />
  );
}

// =============================================================================
// WAVEFORM CLIP COMPONENT
// =============================================================================

interface WaveformClipProps {
  clip: Clip;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function WaveformClip({ clip, pixelsPerSecond, isSelected, onSelect, onDragStart, onDragEnd }: WaveformClipProps) {
  const width = clip.duration * pixelsPerSecond;
  const left = clip.startTime * pixelsPerSecond;
  const waveform = clip.waveformData || generateWaveformData();
  
  return (
    <div
      draggable
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`absolute top-1 bottom-1 rounded cursor-grab active:cursor-grabbing group transition-all ${
        isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900' : ''
      }`}
      style={{
        left: `${left}px`,
        width: `${Math.max(width, 20)}px`,
        backgroundColor: clip.color,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded" />
      <div className="px-2 py-0.5 text-[10px] text-white font-medium truncate border-b border-black/20">
        {clip.name}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-8 flex items-end justify-center px-0.5 pb-0.5 overflow-hidden">
        <svg viewBox={`0 0 ${waveform.length} 1`} className="w-full h-full" preserveAspectRatio="none">
          {waveform.map((v, i) => (
            <rect
              key={i}
              x={i}
              y={1 - v}
              width={0.8}
              height={v}
              fill="rgba(255,255,255,0.6)"
            />
          ))}
        </svg>
      </div>
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/30 cursor-ew-resize opacity-0 group-hover:opacity-100" />
      <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/30 cursor-ew-resize opacity-0 group-hover:opacity-100" />
    </div>
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
  onTimeSignatureChange: (ts: [number, number]) => void;
  onLoopToggle: () => void;
  onSnapToggle: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  masterMeter: Tone.Meter | null;
  onMasterVolumeChange: (vol: number) => void;
}

function TransportBar({ 
  state, onPlay, onStop, onRecord, onBpmChange, onTimeSignatureChange,
  onLoopToggle, onSnapToggle, onSkipBack, onSkipForward, masterMeter, onMasterVolumeChange
}: TransportBarProps) {
  const [displayTime, setDisplayTime] = useState(0);
  const [showBarsBeats, setShowBarsBeats] = useState(true);
  
  useMasterClock(setDisplayTime);
  
  return (
    <div className="h-16 bg-gradient-to-b from-slate-800 to-slate-900 border-b border-slate-700 flex items-center px-4 gap-4">
      <div className="flex items-center gap-1">
        <button
          onClick={onSkipBack}
          className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
          title="Return to Start (Home)"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        
        <button
          onClick={onStop}
          className="w-9 h-9 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 flex items-center justify-center transition-all"
          title="Stop (0)"
        >
          <Square className="w-4 h-4" />
        </button>
        
        <button
          onClick={onPlay}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
            state.isPlaying 
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
          title="Play/Pause (Space)"
        >
          {state.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>
        
        <button
          onClick={onRecord}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            state.isRecording 
              ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' 
              : 'bg-slate-700 text-red-400 hover:bg-slate-600'
          }`}
          title="Record (R)"
        >
          <Circle className="w-4 h-4 fill-current" />
        </button>
        
        <button
          onClick={onSkipForward}
          className="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
          title="Skip Forward (End)"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>
      
      <div className="h-8 w-px bg-slate-700" />
      
      <button
        onClick={onLoopToggle}
        className={`w-8 h-8 rounded flex items-center justify-center transition-all ${
          state.loopEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
        }`}
        title="Loop (L)"
      >
        <Repeat className="w-4 h-4" />
      </button>
      
      <div 
        onClick={() => setShowBarsBeats(!showBarsBeats)}
        className="flex flex-col items-center px-4 py-1 bg-slate-950 rounded-lg border border-slate-700 cursor-pointer hover:border-slate-600 min-w-[160px]"
      >
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          {showBarsBeats ? 'Bars.Beats' : 'Time'}
        </span>
        <span className="font-mono text-xl text-emerald-400 tracking-wider">
          {showBarsBeats 
            ? formatBarsBeats(displayTime, state.bpm, state.timeSignature)
            : formatTimecode(displayTime, state.bpm)
          }
        </span>
      </div>
      
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 rounded-lg border border-slate-700">
        <span className="text-[10px] text-slate-500 uppercase">BPM</span>
        <input
          type="number"
          min="20"
          max="300"
          value={state.bpm}
          onChange={(e) => onBpmChange(Math.max(20, Math.min(300, Number(e.target.value))))}
          className="w-14 bg-transparent text-lg font-mono text-emerald-400 text-center outline-none"
        />
      </div>
      
      <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-950 rounded-lg border border-slate-700">
        <span className="text-[10px] text-slate-500 uppercase mr-1">Time Sig</span>
        <select
          value={`${state.timeSignature[0]}/${state.timeSignature[1]}`}
          onChange={(e) => {
            const [n, d] = e.target.value.split('/').map(Number);
            onTimeSignatureChange([n, d]);
          }}
          className="bg-transparent text-emerald-400 font-mono outline-none cursor-pointer"
        >
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
          <option value="2/4">2/4</option>
        </select>
      </div>
      
      <button
        onClick={onSnapToggle}
        className={`px-2 py-1 rounded text-xs font-medium transition-all ${
          state.snapEnabled 
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
            : 'bg-slate-800 text-slate-500 border border-slate-700'
        }`}
        title="Snap to Grid (S)"
      >
        Snap
      </button>
      
      <div className="flex-1" />
      
      <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-950 rounded-lg border border-slate-700">
        <Headphones className="w-4 h-4 text-slate-500" />
        <input
          type="range"
          min="-60"
          max="6"
          value={state.masterVolume}
          onChange={(e) => onMasterVolumeChange(Number(e.target.value))}
          className="w-20 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
        />
        <span className="text-xs text-slate-400 w-10 text-right font-mono">
          {state.masterVolume > -60 ? `${state.masterVolume}dB` : '-∞'}
        </span>
        <div className="flex gap-0.5">
          <VUMeter meter={masterMeter} height={32} width={8} stereo />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TRACK ROW COMPONENT
// =============================================================================

interface TrackRowProps {
  track: Track;
  isSelected: boolean;
  selectedClipId: string | null;
  pixelsPerSecond: number;
  totalWidth: number;
  loopStart: number;
  loopEnd: number;
  loopEnabled: boolean;
  onSelect: () => void;
  onMute: () => void;
  onSolo: () => void;
  onArm: () => void;
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
  onDelete: () => void;
  onClipSelect: (clipId: string) => void;
  onClipDragStart: (e: React.DragEvent, clipId: string) => void;
  onClipDragEnd: () => void;
  onClipDrop: (e: React.DragEvent) => void;
  onRename: (name: string) => void;
}

function TrackRow({ 
  track, isSelected, selectedClipId, pixelsPerSecond, totalWidth, 
  loopStart, loopEnd, loopEnabled,
  onSelect, onMute, onSolo, onArm, onVolumeChange, onPanChange, onDelete,
  onClipSelect, onClipDragStart, onClipDragEnd, onClipDrop, onRename
}: TrackRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(track.name);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  const handleNameSubmit = () => {
    if (editName.trim()) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };
  
  return (
    <div 
      className={`flex border-b border-slate-800/50 ${isSelected ? 'bg-slate-800/40' : 'hover:bg-slate-800/20'}`}
      onClick={onSelect}
    >
      <div className="w-52 flex-shrink-0 p-2 bg-slate-900/80 border-r border-slate-700 flex items-center gap-2">
        <div className="w-1 h-12 rounded-full" style={{ backgroundColor: track.color }} />
        
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {isEditing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSubmit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              className="text-sm bg-slate-800 px-1 rounded text-white outline-none ring-1 ring-emerald-500"
            />
          ) : (
            <div 
              className="text-sm text-slate-200 truncate cursor-text hover:text-white"
              onDoubleClick={() => setIsEditing(true)}
            >
              {track.name}
            </div>
          )}
          
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onMute(); }}
              className={`w-6 h-5 text-[10px] font-bold rounded transition-all ${
                track.mute ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              M
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSolo(); }}
              className={`w-6 h-5 text-[10px] font-bold rounded transition-all ${
                track.solo ? 'bg-yellow-400 text-black' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              S
            </button>
            {track.type === 'audio' && (
              <button
                onClick={(e) => { e.stopPropagation(); onArm(); }}
                className={`w-6 h-5 text-[10px] font-bold rounded transition-all ${
                  track.armed ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                R
              </button>
            )}
          </div>
        </div>
        
        <div className="flex flex-col items-center gap-1">
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={track.pan}
            onChange={(e) => onPanChange(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); onPanChange(0); }}
            className="w-12 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
            title={`Pan: ${track.pan > 0 ? `R${Math.round(track.pan * 100)}` : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : 'C'}`}
          />
          <span className="text-[9px] text-slate-500 font-mono">
            {track.pan > 0 ? `R${Math.round(track.pan * 100)}` : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : 'C'}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <VUMeter meter={track.meter} height={44} width={6} />
          <input
            type="range"
            min="-60"
            max="6"
            value={track.volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="w-1 h-11 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
            style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
          />
        </div>
        
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
          title="Delete Track"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      
      <div 
        className="h-14 relative flex-1 bg-slate-950/50"
        style={{ minWidth: `${totalWidth}px` }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onClipDrop}
      >
        {loopEnabled && (
          <div 
            className="absolute top-0 bottom-0 bg-emerald-500/10 border-l border-r border-emerald-500/30"
            style={{
              left: `${loopStart * pixelsPerSecond}px`,
              width: `${(loopEnd - loopStart) * pixelsPerSecond}px`,
            }}
          />
        )}
        
        {track.clips.map(clip => (
          <WaveformClip
            key={clip.id}
            clip={clip}
            pixelsPerSecond={pixelsPerSecond}
            isSelected={selectedClipId === clip.id}
            onSelect={() => onClipSelect(clip.id)}
            onDragStart={(e) => onClipDragStart(e, clip.id)}
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
  onSelectClip: (clipId: string | null) => void;
  onMuteTrack: (trackId: string) => void;
  onSoloTrack: (trackId: string) => void;
  onArmTrack: (trackId: string) => void;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
  onTrackPanChange: (trackId: string, pan: number) => void;
  onDeleteTrack: (trackId: string) => void;
  onRenameTrack: (trackId: string, name: string) => void;
  onClipMove: (clipId: string, trackId: string, newStartTime: number) => void;
  onZoom: (delta: number) => void;
  onSeek: (time: number) => void;
}

function ArrangementView({ 
  state, onSelectTrack, onSelectClip, onMuteTrack, onSoloTrack, onArmTrack,
  onTrackVolumeChange, onTrackPanChange, onDeleteTrack, onRenameTrack, 
  onClipMove, onZoom, onSeek
}: ArrangementViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{ clipId: string; trackId: string } | null>(null);
  
  const totalDuration = 300;
  const totalWidth = totalDuration * state.pixelsPerSecond;
  const TRACK_LABEL_WIDTH = 208;
  
  useMasterClock((time) => {
    if (playheadRef.current) {
      const position = time * state.pixelsPerSecond;
      playheadRef.current.style.transform = `translateX(${position}px)`;
    }
  });
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onZoom(e.deltaY > 0 ? -5 : 5);
    }
  }, [onZoom]);
  
  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, x / state.pixelsPerSecond);
    onSeek(time);
  }, [state.pixelsPerSecond, onSeek]);
  
  const handleClipDragStart = useCallback((e: React.DragEvent, clipId: string, trackId: string) => {
    setDragState({ clipId, trackId });
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  
  const handleClipDrop = useCallback((e: React.DragEvent, trackId: string) => {
    if (!dragState || !scrollRef.current) return;
    
    const rect = scrollRef.current.getBoundingClientRect();
    const scrollLeft = scrollRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft - TRACK_LABEL_WIDTH;
    let newStartTime = Math.max(0, x / state.pixelsPerSecond);
    
    if (state.snapEnabled) {
      const beatInterval = 60 / state.bpm;
      newStartTime = Math.round(newStartTime / (beatInterval * state.snapValue)) * (beatInterval * state.snapValue);
    }
    
    onClipMove(dragState.clipId, trackId, newStartTime);
    setDragState(null);
  }, [dragState, state.pixelsPerSecond, state.snapEnabled, state.bpm, state.snapValue, onClipMove]);
  
  const gridLines = useMemo(() => {
    const lines: { pos: number; isBar: boolean }[] = [];
    const beatInterval = 60 / state.bpm;
    const barInterval = beatInterval * state.timeSignature[0];
    
    for (let t = 0; t < totalDuration; t += beatInterval) {
      const isBar = Math.round(t / barInterval) === t / barInterval;
      lines.push({ pos: t * state.pixelsPerSecond, isBar });
    }
    return lines;
  }, [state.bpm, state.timeSignature, state.pixelsPerSecond, totalDuration]);
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
      <div className="h-7 flex border-b border-slate-700 bg-slate-900/80">
        <div className="w-52 flex-shrink-0 flex items-center justify-between px-3 border-r border-slate-700">
          <span className="text-[10px] text-slate-500 uppercase font-medium">Tracks ({state.tracks.length})</span>
          <div className="flex items-center gap-0.5">
            <button onClick={() => onZoom(-5)} className="p-0.5 rounded hover:bg-slate-700 text-slate-400">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-slate-500 w-7 text-center font-mono">{Math.round(state.pixelsPerSecond)}</span>
            <button onClick={() => onZoom(5)} className="p-0.5 rounded hover:bg-slate-700 text-slate-400">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        
        <div 
          className="flex-1 relative overflow-hidden cursor-pointer"
          onClick={handleRulerClick}
          style={{ minWidth: `${totalWidth}px` }}
        >
          {gridLines.filter(g => g.isBar).map((line, i) => (
            <div 
              key={i}
              className="absolute h-full flex items-end pb-1"
              style={{ left: `${line.pos}px` }}
            >
              <span className="text-[10px] text-slate-500 ml-1 font-mono">{i + 1}</span>
            </div>
          ))}
          
          {state.loopEnabled && (
            <div 
              className="absolute top-0 h-full bg-emerald-500/20"
              style={{
                left: `${state.loopStart * state.pixelsPerSecond}px`,
                width: `${(state.loopEnd - state.loopStart) * state.pixelsPerSecond}px`,
              }}
            >
              <div className="absolute left-0 top-0 w-2 h-full bg-emerald-500 cursor-ew-resize" />
              <div className="absolute right-0 top-0 w-2 h-full bg-emerald-500 cursor-ew-resize" />
            </div>
          )}
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto relative"
        onWheel={handleWheel}
        onClick={() => onSelectClip(null)}
      >
        <div 
          className="absolute top-0 left-52 bottom-0 w-0.5 bg-emerald-400 z-20 pointer-events-none" 
          ref={playheadRef}
          style={{ boxShadow: '0 0 8px rgba(16,185,129,0.6), 0 0 16px rgba(16,185,129,0.3)' }}
        >
          <div className="absolute -top-0 -left-2 w-5 h-3 bg-emerald-400 rounded-b-sm" 
               style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
        </div>
        
        <div className="absolute inset-0 pointer-events-none" style={{ left: `${TRACK_LABEL_WIDTH}px` }}>
          {gridLines.map((line, i) => (
            <div 
              key={i}
              className={`absolute top-0 bottom-0 ${line.isBar ? 'w-px bg-slate-700/70' : 'w-px bg-slate-800/40'}`}
              style={{ left: `${line.pos}px` }}
            />
          ))}
        </div>
        
        <div className="relative">
          {state.tracks.map(track => (
            <TrackRow
              key={track.id}
              track={track}
              isSelected={state.selectedTrackId === track.id}
              selectedClipId={state.selectedClipId}
              pixelsPerSecond={state.pixelsPerSecond}
              totalWidth={totalWidth}
              loopStart={state.loopStart}
              loopEnd={state.loopEnd}
              loopEnabled={state.loopEnabled}
              onSelect={() => onSelectTrack(track.id)}
              onMute={() => onMuteTrack(track.id)}
              onSolo={() => onSoloTrack(track.id)}
              onArm={() => onArmTrack(track.id)}
              onVolumeChange={(vol) => onTrackVolumeChange(track.id, vol)}
              onPanChange={(pan) => onTrackPanChange(track.id, pan)}
              onDelete={() => onDeleteTrack(track.id)}
              onClipSelect={(clipId) => onSelectClip(clipId)}
              onClipDragStart={(e, clipId) => handleClipDragStart(e, clipId, track.id)}
              onClipDragEnd={() => setDragState(null)}
              onClipDrop={(e) => handleClipDrop(e, track.id)}
              onRename={(name) => onRenameTrack(track.id, name)}
            />
          ))}
          
          {state.tracks.length === 0 && (
            <div className="flex items-center justify-center h-32 text-slate-500">
              <p>No tracks yet. Click "Add Track" to get started.</p>
            </div>
          )}
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
  onAddPlugin: (plugin: PluginDefinition) => void;
  onRemovePlugin: (pluginId: string) => void;
  onOpenPlugin: (plugin: Plugin) => void;
  onOpenBrowser: () => void;
}

function SignalPathMixer({ selectedTrack, onTogglePlugin, onAddPlugin, onRemovePlugin, onOpenPlugin, onOpenBrowser }: SignalPathMixerProps) {
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      reverb: '#8b5cf6', delay: '#3b82f6', chorus: '#06b6d4', flanger: '#06b6d4',
      phaser: '#f59e0b', compressor: '#10b981', eq: '#3b82f6', limiter: '#ef4444',
      gate: '#6366f1', distortion: '#ef4444', piano: '#1e1e1e', strings: '#8b5cf6',
      drums: '#ef4444', bass: '#f97316', pad: '#a855f7', synth: '#f59e0b',
      analog: '#f59e0b', fm: '#3b82f6', wavetable: '#8b5cf6', sampler: '#06b6d4',
    };
    return colors[type] || '#64748b';
  };
  
  if (!selectedTrack) {
    return (
      <div className="h-28 bg-gradient-to-t from-slate-900 to-slate-800 border-t border-slate-700 flex items-center justify-center text-slate-500">
        <Sliders className="w-5 h-5 mr-2 opacity-50" />
        Select a track to view signal path
      </div>
    );
  }
  
  return (
    <div className="h-28 bg-gradient-to-t from-slate-900 to-slate-800 border-t border-slate-700 p-3">
      <div className="flex items-center gap-2 h-full overflow-x-auto">
        <div className="flex-shrink-0 flex flex-col items-center justify-center w-16 text-center">
          <div className="w-3 h-3 rounded-full mb-1" style={{ backgroundColor: selectedTrack.color }} />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider truncate w-full">
            {selectedTrack.name}
          </span>
          <span className="text-[9px] text-slate-600">Signal Path</span>
        </div>
        
        <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
        
        {selectedTrack.plugins.map((plugin, index) => (
          <div key={plugin.id} className="flex items-center gap-2">
            <button 
              onClick={() => onOpenPlugin(plugin)}
              className={`flex-shrink-0 w-28 h-20 rounded-lg border transition-all cursor-pointer hover:scale-105 ${
                plugin.enabled 
                  ? 'bg-slate-800 border-emerald-500/50 shadow-lg shadow-emerald-500/10' 
                  : 'bg-slate-800/50 border-slate-700'
              }`}
              style={{ borderLeftColor: getTypeColor(plugin.type), borderLeftWidth: 3 }}
            >
              <div className="flex items-center justify-between px-2 py-1 border-b border-slate-700/50">
                <span className={`text-[10px] font-medium truncate ${plugin.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {plugin.name}
                </span>
                <div className="flex items-center gap-1">
                  <span
                    onClick={(e) => { e.stopPropagation(); onTogglePlugin(plugin.id); }}
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] transition-all ${
                      plugin.enabled ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-slate-400'
                    }`}
                  >
                    {plugin.enabled ? '●' : '○'}
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); onRemovePlugin(plugin.id); }}
                    className="text-slate-500 hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </div>
              </div>
              
              <div className="p-1.5 flex items-center justify-center gap-1">
                {Object.entries(plugin.params).slice(0, 3).map(([key]) => (
                  <div key={key} className="flex flex-col items-center">
                    <div 
                      className={`w-6 h-6 rounded-full border-2 transition-colors ${
                        plugin.enabled 
                          ? 'bg-slate-700 border-emerald-500/30' 
                          : 'bg-slate-800 border-slate-600'
                      }`}
                    />
                    <span className="text-[7px] text-slate-500 mt-0.5 capitalize">{String(key).slice(0, 4)}</span>
                  </div>
                ))}
              </div>
            </button>
            
            {index < selectedTrack.plugins.length - 1 && (
              <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
            )}
          </div>
        ))}
        
        <button 
          onClick={onOpenBrowser}
          className="flex-shrink-0 w-20 h-20 rounded-lg border border-dashed border-slate-600 flex flex-col items-center justify-center text-slate-500 hover:border-emerald-500 hover:text-emerald-400 transition-colors"
        >
          <Library className="w-5 h-5" />
          <span className="text-[9px] mt-1">Browse 219+</span>
        </button>
        
        <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
        
        <div className="flex-shrink-0 w-16 h-20 rounded-lg bg-slate-800 border border-slate-600 flex flex-col items-center justify-center">
          <Activity className="w-4 h-4 text-emerald-400 mb-1" />
          <span className="text-[9px] text-slate-400">Output</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ADD TRACK DIALOG COMPONENT
// =============================================================================

interface AddTrackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, type: Track['type'], color: string) => void;
}

function AddTrackDialog({ isOpen, onClose, onAdd }: AddTrackDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Track['type']>('audio');
  const [color, setColor] = useState(TRACK_COLORS[0]);
  
  if (!isOpen) return null;
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${Date.now() % 1000}`, type, color);
    setName('');
    onClose();
  };
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-slate-800 rounded-xl border border-slate-700 p-5 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-4">Add Track</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Track Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter track name..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 outline-none focus:border-emerald-500"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">Track Type</label>
            <div className="flex gap-2">
              {TRACK_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border transition-all ${
                    type === value 
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                      : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">Color</label>
            <div className="flex gap-1.5 flex-wrap">
              {TRACK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-400"
            >
              Add Track
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN DAW COMPONENT
// =============================================================================

export function HighPerformanceDAW() {
  const masterMeterRef = useRef<Tone.Meter | null>(null);
  const masterChannelRef = useRef<Tone.Channel | null>(null);
  const [showAddTrackDialog, setShowAddTrackDialog] = useState(false);
  const [showPluginBrowser, setShowPluginBrowser] = useState(false);
  const [activePlugin, setActivePlugin] = useState<Plugin | null>(null);
  
  const [state, setState] = useState<DAWState>({
    tracks: [],
    selectedTrackId: null,
    selectedClipId: null,
    isPlaying: false,
    isRecording: false,
    bpm: 120,
    timeSignature: [4, 4],
    currentTime: 0,
    pixelsPerSecond: 50,
    loopStart: 0,
    loopEnd: 8,
    loopEnabled: false,
    snapEnabled: true,
    snapValue: 1,
    masterVolume: 0,
  });
  
  useEffect(() => {
    if (!masterMeterRef.current) {
      masterMeterRef.current = new Tone.Meter({ smoothing: 0.8, channels: 2 });
      masterChannelRef.current = new Tone.Channel().toDestination();
      masterChannelRef.current.connect(masterMeterRef.current);
      Tone.getDestination().connect(masterMeterRef.current);
    }
    
    return () => {
      masterMeterRef.current?.dispose();
      masterChannelRef.current?.dispose();
      masterMeterRef.current = null;
      masterChannelRef.current = null;
    };
  }, []);
  
  useEffect(() => {
    Tone.Transport.bpm.value = state.bpm;
  }, [state.bpm]);
  
  useEffect(() => {
    Tone.Transport.timeSignature = state.timeSignature;
  }, [state.timeSignature]);
  
  useEffect(() => {
    if (masterChannelRef.current) {
      masterChannelRef.current.volume.value = state.masterVolume;
    }
    Tone.getDestination().volume.value = state.masterVolume;
  }, [state.masterVolume]);
  
  useEffect(() => {
    Tone.Transport.loop = state.loopEnabled;
    if (state.loopEnabled) {
      Tone.Transport.loopStart = state.loopStart;
      Tone.Transport.loopEnd = state.loopEnd;
    }
  }, [state.loopEnabled, state.loopStart, state.loopEnd]);
  
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
  
  const handleRecord = useCallback(async () => {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
    setState(prev => ({ ...prev, isRecording: !prev.isRecording }));
  }, []);
  
  const handleBpmChange = useCallback((bpm: number) => {
    setState(prev => ({ ...prev, bpm }));
  }, []);
  
  const handleTimeSignatureChange = useCallback((ts: [number, number]) => {
    setState(prev => ({ ...prev, timeSignature: ts }));
  }, []);
  
  const handleLoopToggle = useCallback(() => {
    setState(prev => ({ ...prev, loopEnabled: !prev.loopEnabled }));
  }, []);
  
  const handleSnapToggle = useCallback(() => {
    setState(prev => ({ ...prev, snapEnabled: !prev.snapEnabled }));
  }, []);
  
  const handleSkipBack = useCallback(() => {
    Tone.Transport.seconds = 0;
  }, []);
  
  const handleSkipForward = useCallback(() => {
    const lastClipEnd = state.tracks.reduce((max, track) => {
      return track.clips.reduce((m, clip) => Math.max(m, clip.startTime + clip.duration), max);
    }, 0);
    Tone.Transport.seconds = lastClipEnd;
  }, [state.tracks]);
  
  const handleSeek = useCallback((time: number) => {
    Tone.Transport.seconds = time;
  }, []);
  
  const handleMasterVolumeChange = useCallback((vol: number) => {
    setState(prev => ({ ...prev, masterVolume: vol }));
  }, []);
  
  const handleAddTrack = useCallback((name: string, type: Track['type'], color: string) => {
    const channel = new Tone.Channel().toDestination();
    const meter = new Tone.Meter({ smoothing: 0.8 });
    channel.connect(meter);
    
    const newTrack: Track = {
      id: generateId(),
      name,
      type,
      color,
      volume: 0,
      pan: 0,
      mute: false,
      solo: false,
      armed: false,
      clips: [
        {
          id: generateId(),
          name: `${name} - Clip 1`,
          startTime: Math.random() * 4,
          duration: 2 + Math.random() * 4,
          color,
          waveformData: generateWaveformData(),
        }
      ],
      plugins: DEFAULT_PLUGINS.map(p => ({ ...p, id: generateId() })),
      meter,
      channel,
    };
    
    setState(prev => ({ 
      ...prev, 
      tracks: [...prev.tracks, newTrack],
      selectedTrackId: newTrack.id,
    }));
  }, []);
  
  const handleSelectTrack = useCallback((trackId: string) => {
    setState(prev => ({ ...prev, selectedTrackId: trackId }));
  }, []);
  
  const handleSelectClip = useCallback((clipId: string | null) => {
    setState(prev => ({ ...prev, selectedClipId: clipId }));
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
  
  const handleArmTrack = useCallback((trackId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === trackId) {
          return { ...t, armed: !t.armed };
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
  
  const handleTrackPanChange = useCallback((trackId: string, pan: number) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === trackId) {
          if (t.channel) t.channel.pan.value = pan;
          return { ...t, pan };
        }
        return t;
      })
    }));
  }, []);
  
  const handleDeleteTrack = useCallback((trackId: string) => {
    setState(prev => {
      const track = prev.tracks.find(t => t.id === trackId);
      if (track) {
        track.channel?.dispose();
        track.meter?.dispose();
      }
      return {
        ...prev,
        tracks: prev.tracks.filter(t => t.id !== trackId),
        selectedTrackId: prev.selectedTrackId === trackId ? null : prev.selectedTrackId,
      };
    });
  }, []);
  
  const handleRenameTrack = useCallback((trackId: string, name: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => t.id === trackId ? { ...t, name } : t)
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
  
  const handleTogglePlugin = useCallback((instanceId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === prev.selectedTrackId) {
          return {
            ...t,
            plugins: t.plugins.map(p => p.instanceId === instanceId ? { ...p, enabled: !p.enabled } : p)
          };
        }
        return t;
      })
    }));
  }, []);
  
  const handleAddPlugin = useCallback((pluginDef: PluginDefinition) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === prev.selectedTrackId) {
          const instanceId = generateId();
          const params: Record<string, number | boolean | string> = {};
          pluginDef.parameters.forEach(p => {
            params[p.id] = p.defaultValue;
          });
          const newPlugin: Plugin = {
            id: pluginDef.id,
            instanceId,
            pluginDef,
            name: pluginDef.name,
            type: pluginDef.type,
            enabled: true,
            params,
          };
          return { ...t, plugins: [...t.plugins, newPlugin] };
        }
        return t;
      })
    }));
    setShowPluginBrowser(false);
  }, []);
  
  const handlePluginParameterChange = useCallback((pluginInstanceId: string, paramId: string, value: number | boolean | string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => ({
        ...t,
        plugins: t.plugins.map(p => 
          p.instanceId === pluginInstanceId 
            ? { ...p, params: { ...p.params, [paramId]: value } }
            : p
        )
      }))
    }));
  }, []);
  
  const handlePluginBypassToggle = useCallback((pluginInstanceId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => ({
        ...t,
        plugins: t.plugins.map(p => 
          p.instanceId === pluginInstanceId ? { ...p, enabled: !p.enabled } : p
        )
      }))
    }));
  }, []);
  
  const handlePluginReset = useCallback((pluginInstanceId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => ({
        ...t,
        plugins: t.plugins.map(p => {
          if (p.instanceId === pluginInstanceId && p.pluginDef) {
            const params: Record<string, number | boolean | string> = {};
            p.pluginDef.parameters.forEach(param => {
              params[param.id] = param.defaultValue;
            });
            return { ...p, params };
          }
          return p;
        })
      }))
    }));
  }, []);
  
  const handleRemovePlugin = useCallback((instanceId: string) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        if (t.id === prev.selectedTrackId) {
          return { ...t, plugins: t.plugins.filter(p => p.instanceId !== instanceId) };
        }
        return t;
      })
    }));
    if (activePlugin?.instanceId === instanceId) {
      setActivePlugin(null);
    }
  }, [activePlugin]);
  
  const selectedTrack = state.tracks.find(t => t.id === state.selectedTrackId) || null;
  
  const keyboardHandlers = useMemo(() => ({
    Space: handlePlay,
    Numpad0: handleStop,
    Digit0: handleStop,
    KeyR: handleRecord,
    KeyL: handleLoopToggle,
    KeyS: handleSnapToggle,
    Home: handleSkipBack,
    End: handleSkipForward,
    KeyN: () => setShowAddTrackDialog(true),
    Delete: () => {
      if (state.selectedClipId) {
        setState(prev => ({
          ...prev,
          tracks: prev.tracks.map(t => ({
            ...t,
            clips: t.clips.filter(c => c.id !== state.selectedClipId)
          })),
          selectedClipId: null,
        }));
      }
    },
    Equal: () => handleZoom(10),
    Minus: () => handleZoom(-10),
  }), [handlePlay, handleStop, handleRecord, handleLoopToggle, handleSnapToggle, handleSkipBack, handleSkipForward, handleZoom, state.selectedClipId]);
  
  useKeyboardShortcuts(keyboardHandlers);
  
  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-white overflow-hidden select-none">
      <TransportBar
        state={state}
        onPlay={handlePlay}
        onStop={handleStop}
        onRecord={handleRecord}
        onBpmChange={handleBpmChange}
        onTimeSignatureChange={handleTimeSignatureChange}
        onLoopToggle={handleLoopToggle}
        onSnapToggle={handleSnapToggle}
        onSkipBack={handleSkipBack}
        onSkipForward={handleSkipForward}
        masterMeter={masterMeterRef.current}
        onMasterVolumeChange={handleMasterVolumeChange}
      />
      
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 border-b border-slate-800">
        <button
          onClick={() => setShowAddTrackDialog(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Track
        </button>
        
        <div className="h-5 w-px bg-slate-700" />
        
        <span className="text-xs text-slate-500">
          {state.tracks.length} track{state.tracks.length !== 1 ? 's' : ''}
        </span>
        
        <div className="flex-1" />
        
        <div className="text-[10px] text-slate-600 space-x-3">
          <span>Space: Play</span>
          <span>R: Record</span>
          <span>L: Loop</span>
          <span>N: New Track</span>
          <span>+/-: Zoom</span>
        </div>
      </div>
      
      <ArrangementView
        state={state}
        onSelectTrack={handleSelectTrack}
        onSelectClip={handleSelectClip}
        onMuteTrack={handleMuteTrack}
        onSoloTrack={handleSoloTrack}
        onArmTrack={handleArmTrack}
        onTrackVolumeChange={handleTrackVolumeChange}
        onTrackPanChange={handleTrackPanChange}
        onDeleteTrack={handleDeleteTrack}
        onRenameTrack={handleRenameTrack}
        onClipMove={handleClipMove}
        onZoom={handleZoom}
        onSeek={handleSeek}
      />
      
      <SignalPathMixer
        selectedTrack={selectedTrack}
        onTogglePlugin={(id) => handleTogglePlugin(id)}
        onAddPlugin={handleAddPlugin}
        onRemovePlugin={(id) => handleRemovePlugin(id)}
        onOpenPlugin={(plugin) => setActivePlugin(plugin)}
        onOpenBrowser={() => setShowPluginBrowser(true)}
      />
      
      <AddTrackDialog
        isOpen={showAddTrackDialog}
        onClose={() => setShowAddTrackDialog(false)}
        onAdd={handleAddTrack}
      />
      
      <PluginBrowser
        isOpen={showPluginBrowser}
        onClose={() => setShowPluginBrowser(false)}
        onSelect={handleAddPlugin}
      />
      
      {activePlugin && activePlugin.pluginDef && (
        <PluginDialog
          plugin={activePlugin.pluginDef}
          instanceId={activePlugin.instanceId}
          values={activePlugin.params}
          bypassed={!activePlugin.enabled}
          onClose={() => setActivePlugin(null)}
          onParameterChange={(paramId, value) => handlePluginParameterChange(activePlugin.instanceId, paramId, value)}
          onBypassToggle={() => handlePluginBypassToggle(activePlugin.instanceId)}
          onReset={() => handlePluginReset(activePlugin.instanceId)}
        />
      )}
    </div>
  );
}

export default HighPerformanceDAW;
