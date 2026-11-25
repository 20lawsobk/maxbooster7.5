// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MixerTrack {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  meterLevel: [number, number];
}

interface FlowStateMixerProps {
  tracks?: MixerTrack[];
  projectId?: string | null;
  onVolumeChange?: (trackId: string, volume: number) => void;
  onPanChange?: (trackId: string, pan: number) => void;
  onMuteToggle?: (trackId: string) => void;
  onSoloToggle?: (trackId: string) => void;
  masterMeterLevel?: [number, number];
}

export function FlowStateMixer({
  tracks = [],
  _projectId,
  onVolumeChange = () => {},
  onPanChange = () => {},
  onMuteToggle = () => {},
  onSoloToggle = () => {},
  masterMeterLevel = [0.6, 0.55],
}: FlowStateMixerProps) {
  return (
    <div className="h-full flex bg-gradient-to-b from-slate-900/90 to-slate-950/90 backdrop-blur-xl">
      <div className="flex overflow-x-auto py-3 px-2 gap-1">
        {(tracks || []).map((track) => (
          <MixerChannel
            key={track.id}
            track={track}
            onVolumeChange={(v) => onVolumeChange(track.id, v)}
            onPanChange={(p) => onPanChange(track.id, p)}
            onMuteToggle={() => onMuteToggle(track.id)}
            onSoloToggle={() => onSoloToggle(track.id)}
          />
        ))}

        <div className="w-20 flex-shrink-0 bg-black/30 rounded-lg border border-white/5 p-2 flex flex-col gap-2 ml-2 border-l-2 border-indigo-500/30">
          <div className="text-[10px] font-bold text-center py-1 bg-indigo-500/20 rounded text-indigo-300">
            MASTER
          </div>

          <div className="flex-1 flex gap-1 items-end">
            <MeterBar level={masterMeterLevel[0]} color="#22c55e" />
            <MeterBar level={masterMeterLevel[1]} color="#22c55e" />
          </div>

          <div className="h-24 relative bg-black/40 rounded flex items-center justify-center">
            <div className="absolute inset-x-2 inset-y-2 bg-gradient-to-t from-slate-800 to-slate-700 rounded" />
            <div className="relative w-full h-1 bg-white/10 rounded mx-2">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-6 bg-gradient-to-b from-slate-300 to-slate-400 rounded-sm shadow-lg" />
            </div>
          </div>

          <div className="text-[10px] text-white/60 text-center">0.0 dB</div>
        </div>
      </div>
    </div>
  );
}

interface MixerChannelProps {
  track: MixerTrack;
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
}

function MixerChannel({
  track,
  onVolumeChange,
  _onPanChange,
  onMuteToggle,
  onSoloToggle,
}: MixerChannelProps) {
  const [isDraggingFader, setIsDraggingFader] = useState(false);
  const faderRef = useRef<HTMLDivElement>(null);

  const handleFaderMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDraggingFader(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isDraggingFader) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!faderRef.current) return;
      const rect = faderRef.current.getBoundingClientRect();
      const y =
        1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      onVolumeChange(y);
    };

    const handleMouseUp = () => setIsDraggingFader(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingFader, onVolumeChange]);

  const dbValue = track.volume > 0 ? 20 * Math.log10(track.volume) : -Infinity;
  const dbDisplay = dbValue === -Infinity ? "-∞" : dbValue.toFixed(1);

  return (
    <div className="w-16 flex-shrink-0 bg-black/30 rounded-lg border border-white/5 p-2 flex flex-col gap-2">
      <div
        className="text-[10px] font-medium text-center py-1 rounded truncate px-1"
        style={{ backgroundColor: `${track.color}30`, color: track.color }}
      >
        {track.name}
      </div>

      <div
        className="w-6 h-6 mx-auto rounded-full border-2 border-white/20 relative cursor-pointer"
        style={{
          background: `conic-gradient(from -135deg, ${track.color} ${(track.pan + 1) * 135}deg, transparent 0)`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-0.5 h-2 bg-white rounded-full"
            style={{ transform: `rotate(${track.pan * 135}deg)` }}
          />
        </div>
      </div>

      <div className="flex gap-1">
        <MeterBar level={track.meterLevel[0]} color={track.color} />
        <MeterBar level={track.meterLevel[1]} color={track.color} />
      </div>

      <div
        ref={faderRef}
        className="h-20 relative bg-black/40 rounded cursor-ns-resize"
        onMouseDown={handleFaderMouseDown}
      >
        <div className="absolute inset-x-1 inset-y-1 bg-gradient-to-t from-slate-800 to-slate-700 rounded overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-full h-px bg-white/10"
              style={{ top: `${(i + 1) * 10}%` }}
            />
          ))}
        </div>

        <motion.div
          className="absolute left-1 right-1 h-3 rounded-sm shadow-lg cursor-grab active:cursor-grabbing"
          style={{
            background: `linear-gradient(to bottom, ${track.color}, ${track.color}aa)`,
            bottom: `${track.volume * 100}%`,
            transform: "translateY(50%)",
          }}
          whileHover={{ scale: 1.05 }}
        />
      </div>

      <div className="text-[10px] text-white/60 text-center font-mono">
        {dbDisplay} dB
      </div>

      <div className="flex gap-1">
        <motion.button
          onClick={onMuteToggle}
          className={cn(
            "flex-1 h-6 rounded text-[10px] font-bold flex items-center justify-center",
            track.mute
              ? "bg-red-500 text-white"
              : "bg-white/10 text-white/60 hover:bg-white/20",
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          M
        </motion.button>

        <motion.button
          onClick={onSoloToggle}
          className={cn(
            "flex-1 h-6 rounded text-[10px] font-bold flex items-center justify-center",
            track.solo
              ? "bg-yellow-500 text-black"
              : "bg-white/10 text-white/60 hover:bg-white/20",
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          S
        </motion.button>
      </div>

      <motion.button
        className={cn(
          "h-5 rounded text-[10px] flex items-center justify-center",
          track.armed
            ? "bg-red-600 text-white animate-pulse"
            : "bg-white/5 text-white/40",
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        REC
      </motion.button>
    </div>
  );
}

function MeterBar({ level, color }: { level: number; color: string }) {
  const segments = 16;
  const activeSegments = Math.floor(level * segments);

  return (
    <div className="flex-1 flex flex-col-reverse gap-px h-16 bg-black/40 rounded p-0.5">
      {Array.from({ length: segments }).map((_, i) => {
        const isActive = i < activeSegments;
        const isPeak = i >= segments - 2;
        const isWarn = i >= segments - 5 && i < segments - 2;

        let segmentColor = color;
        if (isPeak) segmentColor = "#ef4444";
        else if (isWarn) segmentColor = "#eab308";

        return (
          <motion.div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              backgroundColor: isActive
                ? segmentColor
                : "rgba(255,255,255,0.05)",
              opacity: isActive ? 1 : 0.3,
            }}
            initial={false}
            animate={{
              opacity: isActive ? 1 : 0.2,
              scaleY: isActive ? 1 : 0.8,
            }}
            transition={{ duration: 0.05 }}
          />
        );
      })}
    </div>
  );
}
