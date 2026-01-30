import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  Headphones,
  MoreVertical,
} from 'lucide-react';

interface Track {
  id: string;
  name: string;
  type: 'audio' | 'midi';
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
}

interface FlowStateMixerProps {
  tracks: Track[];
  onUpdateTrack: (id: string, updates: Partial<Track>) => void;
}

export function FlowStateMixer({ tracks, onUpdateTrack }: FlowStateMixerProps) {
  return (
    <div className="h-full flex bg-[var(--flow-bg-nebula)]">
      {/* Track Channels */}
      <div className="flex overflow-x-auto py-4 px-2 gap-1">
        {tracks.map((track) => (
          <MixerChannel
            key={track.id}
            track={track}
            onUpdate={(updates) => onUpdateTrack(track.id, updates)}
          />
        ))}
        
        {/* Master Channel */}
        <div className="flow-channel border-l-2 border-indigo-500/30 ml-2 pl-2">
          <div className="flow-channel-name bg-indigo-500/20 text-indigo-300">
            MASTER
          </div>
          
          <div className="flow-fader-container">
            <div className="flex gap-1">
              <MeterBar level={0.7} color="#22c55e" />
              <MeterBar level={0.65} color="#22c55e" />
            </div>
            
            <div className="flow-fader">
              <div className="flow-fader-fill" style={{ height: '80%' }} />
              <div 
                className="flow-fader-handle"
                style={{ bottom: 'calc(80% - 12px)' }}
              />
            </div>
            
            <div className="text-xs text-slate-400 font-mono">0.0</div>
          </div>
          
          <PanKnob value={0} onChange={() => {}} />
        </div>
      </div>
    </div>
  );
}

function MixerChannel({ 
  track, 
  onUpdate 
}: { 
  track: Track; 
  onUpdate: (updates: Partial<Track>) => void;
}) {
  const [meterLevel, setMeterLevel] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const faderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (track.mute) {
      setMeterLevel(0);
      return;
    }

    const interval = setInterval(() => {
      const base = track.volume * 0.7;
      const variance = Math.random() * 0.3;
      setMeterLevel(Math.min(1, base + variance));
    }, 50);

    return () => clearInterval(interval);
  }, [track.volume, track.mute]);

  const handleFaderDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!faderRef.current) return;
    
    const rect = faderRef.current.getBoundingClientRect();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const percentage = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onUpdate({ volume: percentage });
  };

  const volumeDb = track.volume > 0 
    ? (20 * Math.log10(track.volume)).toFixed(1)
    : '-∞';

  return (
    <motion.div 
      className="flow-channel"
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
    >
      {/* Track Name */}
      <div 
        className="flow-channel-name truncate"
        style={{ backgroundColor: track.color + '20', color: track.color }}
      >
        {track.name}
      </div>

      {/* Mute/Solo Buttons */}
      <div className="flex gap-1 mb-2">
        <button
          className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors
            ${track.mute 
              ? 'bg-amber-500 text-black' 
              : 'bg-[var(--flow-bg-floating)] text-slate-500 hover:text-slate-300'
            }`}
          onClick={() => onUpdate({ mute: !track.mute })}
        >
          M
        </button>
        <button
          className={`flex-1 py-1 rounded text-[10px] font-bold transition-colors
            ${track.solo 
              ? 'bg-cyan-500 text-black' 
              : 'bg-[var(--flow-bg-floating)] text-slate-500 hover:text-slate-300'
            }`}
          onClick={() => onUpdate({ solo: !track.solo })}
        >
          S
        </button>
      </div>

      {/* Fader & Meter */}
      <div className="flow-fader-container flex-1">
        <div className="flex gap-1">
          <MeterBar level={meterLevel} color={track.color} />
        </div>
        
        <div 
          ref={faderRef}
          className="flow-fader"
          onMouseDown={(e) => {
            setIsDragging(true);
            handleFaderDrag(e);
          }}
          onMouseMove={(e) => isDragging && handleFaderDrag(e)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          <motion.div 
            className="flow-fader-fill" 
            style={{ backgroundColor: track.color }}
            animate={{ height: `${track.volume * 100}%` }}
            transition={{ duration: 0.05 }}
          />
          <motion.div 
            className="flow-fader-handle"
            animate={{ bottom: `calc(${track.volume * 100}% - 12px)` }}
            transition={{ duration: 0.05 }}
          />
        </div>
        
        <div className="text-xs text-slate-400 font-mono">{volumeDb}</div>
      </div>

      {/* Pan Knob */}
      <PanKnob 
        value={track.pan} 
        onChange={(pan) => onUpdate({ pan })} 
        color={track.color}
      />
    </motion.div>
  );
}

function MeterBar({ level, color }: { level: number; color: string }) {
  const segments = 20;
  
  return (
    <div className="flow-meter">
      {Array.from({ length: segments }, (_, i) => {
        const segmentLevel = (segments - i) / segments;
        const isActive = level >= segmentLevel;
        
        let segmentColor = color;
        if (segmentLevel > 0.85) segmentColor = '#ef4444';
        else if (segmentLevel > 0.7) segmentColor = '#f59e0b';
        
        return (
          <div
            key={i}
            className={`flow-meter-segment ${isActive ? 'active' : 'inactive'}`}
            style={{ backgroundColor: isActive ? segmentColor : segmentColor + '30' }}
          />
        );
      })}
    </div>
  );
}

function PanKnob({ 
  value, 
  onChange, 
  color = '#6366f1' 
}: { 
  value: number; 
  onChange: (value: number) => void;
  color?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
    
    const handleMouseMove = (e: MouseEvent) => {
      const delta = (startY.current - e.clientY) / 100;
      const newValue = Math.max(-1, Math.min(1, startValue.current + delta));
      onChange(newValue);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const rotation = value * 135;
  const displayValue = value === 0 ? 'C' : value > 0 ? `R${Math.round(value * 50)}` : `L${Math.round(-value * 50)}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div 
        className="flow-knob"
        onMouseDown={handleMouseDown}
        style={{ 
          '--knob-rotation': `${rotation}deg`,
          '--knob-value': `${((value + 1) / 2) * 270}deg`,
        } as React.CSSProperties}
      >
        <div className="flow-knob-track" />
        <div className="flow-knob-fill" style={{ background: `conic-gradient(from 225deg, ${color} ${((value + 1) / 2) * 270}deg, transparent ${((value + 1) / 2) * 270}deg)` }} />
        <div className="flow-knob-indicator" />
      </div>
      <div className="text-[10px] text-slate-500 font-mono">{displayValue}</div>
    </div>
  );
}
