import { useEffect, useRef, memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedPlayheadProps {
  position: number;
  pixelsPerSecond: number;
  zoom: number;
  height: number;
  isPlaying: boolean;
  color?: string;
  showGlow?: boolean;
  showTimeIndicator?: boolean;
  timeFormat?: "seconds" | "bars" | "timecode";
  bpm?: number;
  offsetLeft?: number;
}

function formatTime(
  seconds: number,
  format: "seconds" | "bars" | "timecode",
  bpm: number,
): string {
  if (format === "seconds") {
    return seconds.toFixed(2) + "s";
  }

  if (format === "timecode") {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  }

  const beatsPerSecond = bpm / 60;
  const totalBeats = seconds * beatsPerSecond;
  const bars = Math.floor(totalBeats / 4) + 1;
  const beats = Math.floor(totalBeats % 4) + 1;
  const ticks = Math.floor((totalBeats % 1) * 960);
  return `${bars}.${beats}.${ticks.toString().padStart(3, "0")}`;
}

export const AnimatedPlayhead = memo(function AnimatedPlayhead({
  position,
  pixelsPerSecond,
  zoom,
  height,
  isPlaying,
  color = "#ef4444",
  showGlow = true,
  showTimeIndicator = true,
  timeFormat = "bars",
  bpm = 120,
  offsetLeft = 0,
}: AnimatedPlayheadProps) {
  const xPosition = position * pixelsPerSecond * zoom + offsetLeft;

  return (
    <motion.div
      className="absolute top-0 z-50 pointer-events-none"
      style={{
        left: xPosition,
        height: height,
      }}
      animate={{ left: xPosition }}
      transition={{
        type: "tween",
        duration: isPlaying ? 0.016 : 0,
        ease: "linear",
      }}
    >
      {showGlow && isPlaying && (
        <>
          <div
            className="absolute top-0 w-8 -translate-x-1/2"
            style={{
              height: height,
              background: `linear-gradient(90deg, transparent, ${color}20, transparent)`,
              filter: "blur(8px)",
            }}
          />
          <div
            className="absolute top-0 w-4 -translate-x-1/2"
            style={{
              height: height,
              background: `linear-gradient(90deg, transparent, ${color}40, transparent)`,
              filter: "blur(4px)",
            }}
          />
        </>
      )}

      <div
        className="absolute top-0 w-0.5 -translate-x-1/2"
        style={{
          height: height,
          backgroundColor: color,
          boxShadow:
            showGlow && isPlaying
              ? `0 0 10px ${color}, 0 0 20px ${color}50`
              : "none",
        }}
      />

      <div
        className="absolute top-0 w-3 h-3 -translate-x-1/2"
        style={{
          backgroundColor: color,
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
        }}
      />

      {showTimeIndicator && (
        <div
          className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium whitespace-nowrap"
          style={{
            backgroundColor: color,
            color: "white",
          }}
        >
          {formatTime(position, timeFormat, bpm)}
        </div>
      )}
    </motion.div>
  );
});

interface LiveMeterProps {
  level: number;
  peakLevel: number;
  rmsLevel: number;
  width?: number;
  height?: number;
  orientation?: "horizontal" | "vertical";
  showPeakHold?: boolean;
  showScale?: boolean;
  muted?: boolean;
  clipping?: boolean;
}

export const LiveMeter = memo(function LiveMeter({
  level,
  peakLevel,
  rmsLevel,
  width = 12,
  height = 120,
  orientation = "vertical",
  showPeakHold = true,
  showScale = false,
  muted = false,
  clipping = false,
}: LiveMeterProps) {
  const peakHoldRef = useRef(peakLevel);
  const peakDecayRef = useRef<number | null>(null);

  useEffect(() => {
    if (peakLevel > peakHoldRef.current) {
      peakHoldRef.current = peakLevel;

      if (peakDecayRef.current) {
        clearTimeout(peakDecayRef.current);
      }

      peakDecayRef.current = window.setTimeout(() => {
        peakHoldRef.current = peakLevel;
      }, 1500);
    }

    return () => {
      if (peakDecayRef.current) {
        clearTimeout(peakDecayRef.current);
      }
    };
  }, [peakLevel]);

  const dbToPercent = (db: number): number => {
    const minDb = -60;
    const maxDb = 6;
    const clamped = Math.max(minDb, Math.min(maxDb, db));
    return ((clamped - minDb) / (maxDb - minDb)) * 100;
  };

  const levelPercent = dbToPercent(level);
  const rmsPercent = dbToPercent(rmsLevel);
  const peakHoldPercent = dbToPercent(peakHoldRef.current);

  const getGradient = () => {
    if (muted) {
      return "linear-gradient(to top, #4b5563, #6b7280)";
    }
    return "linear-gradient(to top, #22c55e 0%, #22c55e 60%, #eab308 75%, #ef4444 100%)";
  };

  const isVertical = orientation === "vertical";

  return (
    <div
      className={cn(
        "relative bg-black/60 rounded overflow-hidden",
        isVertical ? "flex flex-col justify-end" : "flex flex-row",
      )}
      style={{
        width: isVertical ? width : height,
        height: isVertical ? height : width,
      }}
    >
      <motion.div
        className="absolute"
        style={{
          background: getGradient(),
          ...(isVertical
            ? { bottom: 0, left: 0, right: 0, width: "100%" }
            : { left: 0, top: 0, bottom: 0, height: "100%" }),
        }}
        animate={{
          [isVertical ? "height" : "width"]: `${levelPercent}%`,
        }}
        transition={{ duration: 0.05 }}
      />

      <motion.div
        className="absolute opacity-50"
        style={{
          background: "rgba(34, 197, 94, 0.3)",
          ...(isVertical
            ? { bottom: 0, left: 0, right: 0, width: "100%" }
            : { left: 0, top: 0, bottom: 0, height: "100%" }),
        }}
        animate={{
          [isVertical ? "height" : "width"]: `${rmsPercent}%`,
        }}
        transition={{ duration: 0.1 }}
      />

      {showPeakHold && (
        <motion.div
          className="absolute bg-white"
          style={{
            ...(isVertical
              ? { left: 0, right: 0, height: 2 }
              : { top: 0, bottom: 0, width: 2 }),
          }}
          animate={{
            [isVertical ? "bottom" : "left"]: `${peakHoldPercent}%`,
          }}
          transition={{ duration: 0.05 }}
        />
      )}

      {clipping && (
        <div className="absolute top-0 left-0 right-0 h-2 bg-red-500 animate-pulse" />
      )}

      {showScale && isVertical && (
        <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none">
          {[0, -6, -12, -24, -48].map((db) => (
            <div key={db} className="flex items-center">
              <div className="w-1 h-px bg-white/30" />
              <span className="text-[6px] text-white/40 ml-0.5">{db}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

interface StereoMeterProps {
  leftLevel: number;
  rightLevel: number;
  leftPeak: number;
  rightPeak: number;
  leftRms: number;
  rightRms: number;
  width?: number;
  height?: number;
  muted?: boolean;
  label?: string;
}

export const StereoMeter = memo(function StereoMeter({
  leftLevel,
  rightLevel,
  leftPeak,
  rightPeak,
  leftRms,
  rightRms,
  width = 28,
  height = 120,
  muted = false,
  label,
}: StereoMeterProps) {
  const meterWidth = Math.floor((width - 4) / 2);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-0.5" style={{ width, height }}>
        <LiveMeter
          level={leftLevel}
          peakLevel={leftPeak}
          rmsLevel={leftRms}
          width={meterWidth}
          height={height}
          muted={muted}
          clipping={leftPeak > 0}
        />
        <LiveMeter
          level={rightLevel}
          peakLevel={rightPeak}
          rmsLevel={rightRms}
          width={meterWidth}
          height={height}
          muted={muted}
          clipping={rightPeak > 0}
        />
      </div>
      {label && (
        <span
          className="text-[9px] text-white/50 truncate"
          style={{ maxWidth: width }}
        >
          {label}
        </span>
      )}
    </div>
  );
});
