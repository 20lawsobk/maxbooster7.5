import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlowStateTimelineProps {
  currentTime: number;
  duration: number;
  tempo: number;
  timeSignature: string;
  isPlaying: boolean;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  zoom: number;
  onTimeChange: (time: number) => void;
  onZoomChange: (zoom: number) => void;
  onLoopChange: (start: number, end: number) => void;
  onLoopToggle: () => void;
}

export function FlowStateTimeline({
  currentTime,
  duration,
  tempo,
  timeSignature,
  isPlaying,
  loopEnabled,
  loopStart,
  loopEnd,
  zoom,
  onTimeChange,
  onZoomChange,
  onLoopChange,
  onLoopToggle,
}: FlowStateTimelineProps) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoopDragging, setIsLoopDragging] = useState<'start' | 'end' | null>(null);

  const beatsPerBar = parseInt(timeSignature.split('/')[0]) || 4;
  const beatsPerSecond = tempo / 60;
  const secondsPerBar = beatsPerBar / beatsPerSecond;
  const secondsPerBeat = 1 / beatsPerSecond;

  const pixelsPerSecond = 50 * zoom;
  const totalWidth = Math.max(duration, 120) * pixelsPerSecond;

  const gridLines = useMemo(() => {
    const lines: { position: number; type: 'bar' | 'beat' | 'sub'; label?: string }[] = [];
    const visibleDuration = Math.max(duration, 120);
    
    for (let bar = 0; bar <= visibleDuration / secondsPerBar; bar++) {
      const barTime = bar * secondsPerBar;
      lines.push({
        position: barTime * pixelsPerSecond,
        type: 'bar',
        label: `${bar + 1}`,
      });
      
      if (zoom >= 0.5) {
        for (let beat = 1; beat < beatsPerBar; beat++) {
          const beatTime = barTime + beat * secondsPerBeat;
          if (beatTime <= visibleDuration) {
            lines.push({
              position: beatTime * pixelsPerSecond,
              type: 'beat',
            });
          }
        }
      }
      
      if (zoom >= 1.5) {
        for (let beat = 0; beat < beatsPerBar; beat++) {
          for (let sub = 1; sub < 4; sub++) {
            const subTime = barTime + (beat + sub / 4) * secondsPerBeat;
            if (subTime <= visibleDuration) {
              lines.push({
                position: subTime * pixelsPerSecond,
                type: 'sub',
              });
            }
          }
        }
      }
    }
    
    return lines;
  }, [duration, secondsPerBar, secondsPerBeat, beatsPerBar, pixelsPerSecond, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!rulerRef.current) return;
    
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + rulerRef.current.scrollLeft;
    const time = x / pixelsPerSecond;
    
    onTimeChange(Math.max(0, time));
    setIsDragging(true);
  }, [pixelsPerSecond, onTimeChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !rulerRef.current) return;
    
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + rulerRef.current.scrollLeft;
    const time = x / pixelsPerSecond;
    
    onTimeChange(Math.max(0, time));
  }, [isDragging, pixelsPerSecond, onTimeChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsLoopDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging || isLoopDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDragging, isLoopDragging, handleMouseUp]);

  const playheadPosition = currentTime * pixelsPerSecond;
  const loopStartPosition = loopStart * pixelsPerSecond;
  const loopEndPosition = loopEnd * pixelsPerSecond;

  return (
    <div className="flex flex-col">
      <div className="h-8 flex items-center gap-2 px-2 bg-black/20 border-b border-white/5">
        <div className="flex items-center gap-1">
          <motion.button
            onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))}
            className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </motion.button>
          
          <div className="w-16 text-center text-xs text-white/60">
            {Math.round(zoom * 100)}%
          </div>
          
          <motion.button
            onClick={() => onZoomChange(Math.min(4, zoom + 0.25))}
            className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </motion.button>
        </div>
        
        <div className="w-px h-4 bg-white/10" />
        
        <motion.button
          onClick={onLoopToggle}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
            loopEnabled
              ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/30"
              : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
          )}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Repeat className="w-3 h-3" />
          Loop
        </motion.button>
        
        <div className="flex-1" />
        
        <div className="text-xs text-white/40">
          {tempo} BPM | {timeSignature}
        </div>
      </div>
      
      <div
        ref={rulerRef}
        className="h-6 relative overflow-x-auto overflow-y-hidden bg-slate-900/50 border-b border-white/5 cursor-pointer select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      >
        <div className="relative h-full" style={{ width: totalWidth }}>
          {gridLines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "absolute top-0 bottom-0",
                line.type === 'bar' && "border-l border-white/20",
                line.type === 'beat' && "border-l border-white/10",
                line.type === 'sub' && "border-l border-white/5"
              )}
              style={{ left: line.position }}
            >
              {line.label && (
                <span className="absolute top-0.5 left-1 text-[10px] text-white/40 font-medium">
                  {line.label}
                </span>
              )}
            </div>
          ))}
          
          {loopEnabled && (
            <div
              className="absolute top-0 bottom-0 bg-cyan-500/10 border-l-2 border-r-2 border-cyan-500/50"
              style={{
                left: loopStartPosition,
                width: loopEndPosition - loopStartPosition,
              }}
            >
              <div className="absolute top-0 left-0 w-2 h-full cursor-ew-resize hover:bg-cyan-500/30" />
              <div className="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-cyan-500/30" />
            </div>
          )}
          
          <motion.div
            className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-rose-500 to-rose-600 z-10"
            style={{ left: playheadPosition }}
            animate={isPlaying ? { opacity: [1, 0.7, 1] } : {}}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            <div className="absolute -top-0 -left-1.5 w-3 h-3 bg-rose-500 rotate-45 transform origin-center" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function FlowStatePlayhead({
  position,
  height,
  isPlaying,
}: {
  position: number;
  height: number;
  isPlaying: boolean;
}) {
  return (
    <motion.div
      className="absolute top-0 w-px bg-gradient-to-b from-rose-500 via-rose-500/80 to-transparent z-20 pointer-events-none"
      style={{ 
        left: position, 
        height,
      }}
      animate={isPlaying ? { 
        boxShadow: ['0 0 8px rgba(244,63,94,0.5)', '0 0 16px rgba(244,63,94,0.8)', '0 0 8px rgba(244,63,94,0.5)']
      } : {}}
      transition={{ duration: 0.8, repeat: Infinity }}
    >
      <div className="absolute -top-1 -left-2 w-4 h-4">
        <div className="w-full h-full bg-rose-500 rounded-sm rotate-45 transform origin-center shadow-lg" />
      </div>
    </motion.div>
  );
}
