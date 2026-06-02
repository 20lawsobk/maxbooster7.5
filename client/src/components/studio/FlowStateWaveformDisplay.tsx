import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Waves } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  offset: number;
  color: string;
  waveformData?: number[];
  audioUrl?: string;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  selected?: boolean;
}

interface FlowStateWaveformDisplayProps {
  clips: AudioClip[];
  trackId: string;
  trackColor?: string;
  duration: number;
  currentTime?: number;
  zoom?: number;
  isPlaying?: boolean;
  onClipSelect?: (clipId: string) => void;
  onClipMove?: (clipId: string, newStartTime: number) => void;
  onClipResize?: (
    clipId: string,
    newDuration: number,
    edge: "left" | "right",
  ) => void;
  onClipSplit?: (clipId: string, splitTime: number) => void;
  selectedClipId?: string;
  height?: number;
}

const WAVEFORM_SAMPLES = 200;

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function FlowStateWaveformDisplay({
  clips,
  trackId,
  trackColor = "#3b82f6",
  duration,
  currentTime = 0,
  zoom = 100,
  isPlaying = false,
  onClipSelect,
  onClipMove,
  onClipResize,
  onClipSplit,
  selectedClipId,
  height = 80,
}: FlowStateWaveformDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragClipId, setDragClipId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const [resizeEdge, setResizeEdge] = useState<"left" | "right" | null>(null);
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);

  const beatsPerPixel = 0.05 / (zoom / 100);
  const containerWidth = Math.max(800, duration / beatsPerPixel);

  const waveformCache = useRef<Map<string, number[]>>(new Map());

  const generateMockWaveform = useCallback(
    (clipId: string, clipDuration: number): number[] => {
      const cacheKey = `${clipId}-${clipDuration.toFixed(2)}`;
      if (waveformCache.current.has(cacheKey)) {
        return waveformCache.current.get(cacheKey)!;
      }

      const seed = hashString(clipId);
      const random = seededRandom(seed);
      const samples: number[] = [];
      const numSamples = Math.floor(clipDuration * WAVEFORM_SAMPLES);

      for (let i = 0; i < numSamples; i++) {
        const t = i / numSamples;
        const base = Math.sin(t * Math.PI * 8) * 0.3;
        const noise = (random() - 0.5) * 0.4;
        const envelope = Math.sin(t * Math.PI) * 0.3;
        samples.push(Math.abs(base + noise + envelope));
      }

      waveformCache.current.set(cacheKey, samples);
      return samples;
    },
    [],
  );

  const renderWaveform = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      clip: AudioClip,
      width: number,
      clipHeight: number,
    ) => {
      const waveformData =
        clip.waveformData || generateMockWaveform(clip.id, clip.duration);
      const centerY = clipHeight / 2;
      const maxAmplitude = clipHeight * 0.4;

      ctx.beginPath();
      ctx.moveTo(0, centerY);

      const samplesPerPixel = waveformData.length / width;

      for (let x = 0; x < width; x++) {
        const sampleIndex = Math.floor(x * samplesPerPixel);
        const sample = waveformData[sampleIndex] || 0;
        const amplitude = sample * maxAmplitude * clip.gain;

        let fadeMultiplier = 1;
        const xTime = (x / width) * clip.duration;
        if (xTime < clip.fadeIn) {
          fadeMultiplier = xTime / clip.fadeIn;
        } else if (xTime > clip.duration - clip.fadeOut) {
          fadeMultiplier = (clip.duration - xTime) / clip.fadeOut;
        }

        const y = centerY - amplitude * fadeMultiplier;
        ctx.lineTo(x, y);
      }

      for (let x = width - 1; x >= 0; x--) {
        const sampleIndex = Math.floor(x * samplesPerPixel);
        const sample = waveformData[sampleIndex] || 0;
        const amplitude = sample * maxAmplitude * clip.gain;

        let fadeMultiplier = 1;
        const xTime = (x / width) * clip.duration;
        if (xTime < clip.fadeIn) {
          fadeMultiplier = xTime / clip.fadeIn;
        } else if (xTime > clip.duration - clip.fadeOut) {
          fadeMultiplier = (clip.duration - xTime) / clip.fadeOut;
        }

        const y = centerY + amplitude * fadeMultiplier;
        ctx.lineTo(x, y);
      }

      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, 0, clipHeight);
      const baseColor = clip.color || trackColor;
      gradient.addColorStop(0, `${baseColor}88`);
      gradient.addColorStop(0.5, `${baseColor}cc`);
      gradient.addColorStop(1, `${baseColor}88`);

      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);

      for (let x = 0; x < width; x++) {
        const sampleIndex = Math.floor(x * samplesPerPixel);
        const sample = waveformData[sampleIndex] || 0;
        const amplitude = sample * maxAmplitude * clip.gain;

        let fadeMultiplier = 1;
        const xTime = (x / width) * clip.duration;
        if (xTime < clip.fadeIn) {
          fadeMultiplier = xTime / clip.fadeIn;
        } else if (xTime > clip.duration - clip.fadeOut) {
          fadeMultiplier = (clip.duration - xTime) / clip.fadeOut;
        }

        ctx.lineTo(x, centerY - amplitude * fadeMultiplier);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, centerY);
      for (let x = 0; x < width; x++) {
        const sampleIndex = Math.floor(x * samplesPerPixel);
        const sample = waveformData[sampleIndex] || 0;
        const amplitude = sample * maxAmplitude * clip.gain;

        let fadeMultiplier = 1;
        const xTime = (x / width) * clip.duration;
        if (xTime < clip.fadeIn) {
          fadeMultiplier = xTime / clip.fadeIn;
        } else if (xTime > clip.duration - clip.fadeOut) {
          fadeMultiplier = (clip.duration - xTime) / clip.fadeOut;
        }

        ctx.lineTo(x, centerY + amplitude * fadeMultiplier);
      }
      ctx.stroke();

      if (clip.fadeIn > 0) {
        const fadeInWidth = (clip.fadeIn / clip.duration) * width;
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(fadeInWidth, 0);
        ctx.lineTo(0, clipHeight);
        ctx.closePath();
        ctx.fill();
      }

      if (clip.fadeOut > 0) {
        const fadeOutWidth = (clip.fadeOut / clip.duration) * width;
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.moveTo(width, 0);
        ctx.lineTo(width - fadeOutWidth, 0);
        ctx.lineTo(width, clipHeight);
        ctx.closePath();
        ctx.fill();
      }
    },
    [generateMockWaveform, trackColor],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, clipId: string) => {
      e.stopPropagation();
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return;

      onClipSelect?.(clipId);

      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clipWidth = clip.duration / beatsPerPixel;

      if (x < 8) {
        setResizeEdge("left");
      } else if (x > clipWidth - 8) {
        setResizeEdge("right");
      } else {
        setResizeEdge(null);
      }

      setIsDragging(true);
      setDragClipId(clipId);
      setDragStartX(e.clientX);
      setDragStartTime(clip.startTime);
    },
    [clips, beatsPerPixel, onClipSelect],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragClipId) return;

      const deltaX = e.clientX - dragStartX;
      const deltaTime = deltaX * beatsPerPixel;

      if (resizeEdge) {
        const clip = clips.find((c) => c.id === dragClipId);
        if (!clip) return;

        if (resizeEdge === "right") {
          const newDuration = Math.max(0.25, clip.duration + deltaTime);
          onClipResize?.(dragClipId, newDuration, "right");
        } else if (resizeEdge === "left") {
          const newStartTime = Math.max(0, dragStartTime + deltaTime);
          const newDuration = clip.duration - deltaTime;
          if (newDuration > 0.25) {
            onClipMove?.(dragClipId, newStartTime);
            onClipResize?.(dragClipId, newDuration, "left");
          }
        }
      } else {
        const newStartTime = Math.max(0, dragStartTime + deltaTime);
        onClipMove?.(dragClipId, newStartTime);
      }
    },
    [
      isDragging,
      dragClipId,
      dragStartX,
      dragStartTime,
      beatsPerPixel,
      resizeEdge,
      clips,
      onClipMove,
      onClipResize,
    ],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragClipId(null);
    setResizeEdge(null);
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, clipId: string) => {
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return;

      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const splitTime = clip.startTime + x * beatsPerPixel;

      onClipSplit?.(clipId, splitTime);
    },
    [clips, beatsPerPixel, onClipSplit],
  );

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mouseup", handleMouseUp);
      return () => window.removeEventListener("mouseup", handleMouseUp);
    }
  }, [isDragging, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className="relative h-full"
      style={{ width: containerWidth }}
      onMouseMove={handleMouseMove}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(
            90deg,
            transparent,
            transparent ${1 / beatsPerPixel - 1}px,
            rgba(255,255,255,0.03) ${1 / beatsPerPixel - 1}px,
            rgba(255,255,255,0.03) ${1 / beatsPerPixel}px
          )`,
        }}
      />

      {clips.map((clip) => {
        const clipX = clip.startTime / beatsPerPixel;
        const clipWidth = clip.duration / beatsPerPixel;
        const isSelected = clip.id === selectedClipId;
        const isHovered = clip.id === hoveredClipId;

        return (
          <motion.div
            key={clip.id}
            className={cn(
              "absolute top-1 bottom-1 rounded-md overflow-hidden cursor-move",
              "border transition-all",
              isSelected
                ? "border-white ring-2 ring-white/30"
                : isHovered
                  ? "border-white/40"
                  : "border-white/20",
            )}
            style={{
              left: clipX,
              width: clipWidth,
              backgroundColor: `${clip.color || trackColor}22`,
            }}
            onMouseDown={(e) => handleMouseDown(e, clip.id)}
            onDoubleClick={(e) => handleDoubleClick(e, clip.id)}
            onMouseEnter={() => setHoveredClipId(clip.id)}
            onMouseLeave={() => setHoveredClipId(null)}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-10" />

            <div className="absolute top-0 left-0 right-0 h-5 px-2 flex items-center bg-gradient-to-b from-black/40 to-transparent">
              <Waves
                className="h-3 w-3 mr-1"
                style={{ color: clip.color || trackColor }}
              />
              <span className="text-[10px] text-white truncate">
                {clip.name}
              </span>
            </div>

            <canvas
              className="absolute inset-0 pointer-events-none"
              width={clipWidth}
              height={height - 8}
              ref={(canvas) => {
                if (canvas) {
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    ctx.clearRect(0, 0, clipWidth, height - 8);
                    renderWaveform(ctx, clip, clipWidth, height - 8);
                  }
                }
              }}
            />

            {clip.fadeIn > 0 && (
              <div
                className="absolute top-5 left-0 w-3 h-3 rounded-full bg-white/60 cursor-pointer z-20"
                style={{ left: (clip.fadeIn / clip.duration) * clipWidth - 6 }}
              />
            )}
            {clip.fadeOut > 0 && (
              <div
                className="absolute top-5 right-0 w-3 h-3 rounded-full bg-white/60 cursor-pointer z-20"
                style={{
                  right: (clip.fadeOut / clip.duration) * clipWidth - 6,
                }}
              />
            )}
          </motion.div>
        );
      })}

      {currentTime > 0 && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-30"
          style={{ left: currentTime / beatsPerPixel }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-6 border-transparent border-t-red-500" />
        </div>
      )}
    </div>
  );
}
