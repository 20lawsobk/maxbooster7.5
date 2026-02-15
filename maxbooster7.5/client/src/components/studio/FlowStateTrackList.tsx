import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  Headphones,
  Circle,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Music,
  Mic,
  Piano,
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

interface FlowStateTrackListProps {
  tracks: Track[];
  selectedTrackId: string | null;
  onSelectTrack: (id: string | null) => void;
  onUpdateTrack: (id: string, updates: Partial<Track>) => void;
  currentTime: number;
  zoom: number;
  isPlaying: boolean;
}

export function FlowStateTrackList({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onUpdateTrack,
  currentTime,
  zoom,
  isPlaying,
}: FlowStateTrackListProps) {
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleExpand = (id: string) => {
    setExpandedTracks(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getTrackIcon = (type: string) => {
    switch (type) {
      case 'audio': return Mic;
      case 'midi': return Piano;
      default: return Music;
    }
  };

  const playheadPosition = currentTime * 100 * zoom;

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-auto bg-[var(--flow-bg-space)] relative"
    >
      {/* Playhead */}
      <motion.div
        className="flow-playhead"
        style={{ left: `${200 + playheadPosition}px` }}
        animate={{ left: `${200 + playheadPosition}px` }}
        transition={{ duration: 0.01 }}
      />

      {/* Tracks */}
      <Reorder.Group axis="y" values={tracks} onReorder={() => {}} className="divide-y divide-white/5">
        {tracks.map((track, index) => {
          const isSelected = selectedTrackId === track.id;
          const isExpanded = expandedTracks.has(track.id);
          const TrackIcon = getTrackIcon(track.type);
          
          return (
            <Reorder.Item
              key={track.id}
              value={track}
              className={`flow-track ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectTrack(track.id)}
            >
              {/* Color Bar */}
              <div 
                className="flow-track-color-bar"
                style={{ backgroundColor: track.color }}
              />

              {/* Track Header */}
              <div className="flow-track-header">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(track.id); }}
                    className="p-1 rounded hover:bg-white/5 text-slate-500"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                  
                  <div 
                    className="w-6 h-6 rounded flex items-center justify-center"
                    style={{ backgroundColor: track.color + '20' }}
                  >
                    <TrackIcon className="w-3 h-3" style={{ color: track.color }} />
                  </div>
                  
                  <span className="flow-track-name truncate">{track.name}</span>
                </div>

                {/* Track Controls */}
                <div className="flow-track-controls mt-1">
                  <button
                    className={`flow-track-btn mute ${track.mute ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateTrack(track.id, { mute: !track.mute });
                    }}
                    title="Mute"
                  >
                    M
                  </button>
                  
                  <button
                    className={`flow-track-btn solo ${track.solo ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateTrack(track.id, { solo: !track.solo });
                    }}
                    title="Solo"
                  >
                    S
                  </button>
                  
                  <button
                    className={`flow-track-btn record ${track.armed ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateTrack(track.id, { armed: !track.armed });
                    }}
                    title="Arm for Recording"
                  >
                    R
                  </button>

                  {/* Volume Slider */}
                  <div className="flex items-center gap-1 ml-2">
                    <Volume2 className="w-3 h-3 text-slate-500" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={track.volume}
                      onChange={(e) => {
                        e.stopPropagation();
                        onUpdateTrack(track.id, { volume: parseFloat(e.target.value) });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-16 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-2
                        [&::-webkit-slider-thumb]:h-2
                        [&::-webkit-slider-thumb]:bg-white
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Waveform Area */}
              <div className="flow-waveform">
                {/* Sample Waveform Clip */}
                <motion.div
                  className="flow-waveform-clip"
                  style={{
                    left: `${(index * 50) * zoom}px`,
                    width: `${200 * zoom}px`,
                    backgroundColor: track.color + '15',
                    borderColor: track.color + '40',
                  }}
                  whileHover={{ scale: 1.01 }}
                  transition={{ duration: 0.1 }}
                >
                  {/* Waveform visualization */}
                  <div className="h-full flex items-center px-1">
                    <svg className="w-full h-[80%]" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={`waveGrad-${track.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={track.color} stopOpacity="0.8" />
                          <stop offset="50%" stopColor={track.color} stopOpacity="0.4" />
                          <stop offset="100%" stopColor={track.color} stopOpacity="0.8" />
                        </linearGradient>
                      </defs>
                      <path
                        d={generateWaveformPath(track.id)}
                        fill={`url(#waveGrad-${track.id})`}
                        stroke={track.color}
                        strokeWidth="0.5"
                      />
                    </svg>
                  </div>
                  
                  {/* Clip name */}
                  <div 
                    className="absolute top-1 left-2 text-[10px] font-medium"
                    style={{ color: track.color }}
                  >
                    {track.name} - Clip 1
                  </div>
                </motion.div>

                {/* Second clip for some tracks */}
                {index % 2 === 0 && (
                  <motion.div
                    className="flow-waveform-clip"
                    style={{
                      left: `${(index * 50 + 250) * zoom}px`,
                      width: `${150 * zoom}px`,
                      backgroundColor: track.color + '15',
                      borderColor: track.color + '40',
                    }}
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className="h-full flex items-center px-1">
                      <svg className="w-full h-[80%]" preserveAspectRatio="none">
                        <path
                          d={generateWaveformPath(track.id + '-2')}
                          fill={`url(#waveGrad-${track.id})`}
                          stroke={track.color}
                          strokeWidth="0.5"
                        />
                      </svg>
                    </div>
                    <div 
                      className="absolute top-1 left-2 text-[10px] font-medium"
                      style={{ color: track.color }}
                    >
                      {track.name} - Clip 2
                    </div>
                  </motion.div>
                )}
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      {/* Empty State / Add Track */}
      <motion.button
        className="w-full py-4 border-t border-dashed border-white/10 
          text-slate-500 text-sm hover:text-slate-300 hover:bg-white/5
          flex items-center justify-center gap-2 transition-colors"
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
      >
        <Music className="w-4 h-4" />
        Add New Track
      </motion.button>
    </div>
  );
}

function generateWaveformPath(seed: string): string {
  const hash = seed.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const random = (i: number) => {
    const x = Math.sin(hash + i) * 10000;
    return x - Math.floor(x);
  };

  const points: string[] = [];
  const segments = 80;
  const height = 100;
  const midY = height / 2;

  points.push(`M 0 ${midY}`);
  
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * 100;
    const amplitude = (random(i) * 0.6 + 0.2) * (midY - 5);
    const y = midY - amplitude;
    points.push(`L ${x} ${y}`);
  }

  for (let i = segments; i >= 0; i--) {
    const x = (i / segments) * 100;
    const amplitude = (random(i) * 0.6 + 0.2) * (midY - 5);
    const y = midY + amplitude;
    points.push(`L ${x} ${y}`);
  }

  points.push('Z');
  return points.join(' ');
}
