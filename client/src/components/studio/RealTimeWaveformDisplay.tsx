// @ts-nocheck
import { logger } from "@/lib/logger";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, ZoomIn, ZoomOut, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface WaveformData {
  peaks: number[];
  duration: number;
  sampleRate: number;
}

interface Region {
  id: string;
  start: number;
  end: number;
  color: string;
  label?: string;
}

interface RealTimeWaveformDisplayProps {
  audioUrl?: string;
  waveformData?: WaveformData;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  zoom?: number;
  regions?: Region[];
  onSeek?: (time: number) => void;
  onPlayPause?: () => void;
  onZoomChange?: (zoom: number) => void;
  onRegionCreate?: (region: Omit<Region, "id">) => void;
  onRegionUpdate?: (region: Region) => void;
  showControls?: boolean;
  showTimeline?: boolean;
  height?: number;
  color?: string;
  progressColor?: string;
  backgroundColor?: string;
  className?: string;
}

export function RealTimeWaveformDisplay({
  audioUrl,
  waveformData,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  zoom = 1,
  regions = [],
  onSeek,
  onPlayPause,
  onZoomChange,
  onRegionCreate,
  _onRegionUpdate,
  showControls = true,
  showTimeline = true,
  height = 128,
  color = "#22c55e",
  progressColor = "#4ade80",
  backgroundColor = "#1f1f23",
  className,
}: RealTimeWaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useRef<number>();
  useRef<AudioContext | null>(null);
  useRef<AnalyserNode | null>(null);
  const [localWaveformData, setLocalWaveformData] = useState<number[]>([]);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverTime, setHoverTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isCreatingRegion, setIsCreatingRegion] = useState(false);
  const [regionStart, setRegionStart] = useState<number | null>(null);

  const effectiveDuration = duration || waveformData?.duration || 0;

  useEffect(() => {
    if (waveformData?.peaks) {
      setLocalWaveformData(waveformData.peaks);
    } else if (audioUrl) {
      generateWaveformFromUrl(audioUrl);
    }
  }, [audioUrl, waveformData]);

  const generateWaveformFromUrl = async (url: string) => {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const channelData = audioBuffer.getChannelData(0);
      const samples = 200;
      const blockSize = Math.floor(channelData.length / samples);
      const peaks: number[] = [];

      for (let i = 0; i < samples; i++) {
        let max = 0;
        for (let j = 0; j < blockSize; j++) {
          const value = Math.abs(channelData[i * blockSize + j]);
          if (value > max) max = value;
        }
        peaks.push(max);
      }

      setLocalWaveformData(peaks);
    } catch (error) {
      logger.error("Failed to generate waveform:", error);
    }
  };

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr * zoom;
    canvas.height = height * dpr;
    canvas.style.width = `${rect.width * zoom}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, rect.width * zoom, height);

    if (localWaveformData.length === 0) return;

    const barWidth = (rect.width * zoom) / localWaveformData.length;
    const progressX =
      effectiveDuration > 0
        ? (currentTime / effectiveDuration) * (rect.width * zoom)
        : 0;

    regions.forEach((region) => {
      const startX = (region.start / effectiveDuration) * (rect.width * zoom);
      const endX = (region.end / effectiveDuration) * (rect.width * zoom);

      ctx.fillStyle = region.color + "30";
      ctx.fillRect(startX, 0, endX - startX, height);

      ctx.fillStyle = region.color;
      ctx.fillRect(startX, 0, 2, height);
      ctx.fillRect(endX - 2, 0, 2, height);

      if (region.label) {
        ctx.font = "10px sans-serif";
        ctx.fillStyle = region.color;
        ctx.fillText(region.label, startX + 4, 12);
      }
    });

    localWaveformData.forEach((peak, i) => {
      const x = i * barWidth;
      const barHeight = peak * (height * 0.8);
      const y = (height - barHeight) / 2;

      const isPlayedBar = x < progressX;

      ctx.fillStyle = isPlayedBar ? progressColor : color;
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(progressX - 1, 0, 2, height);
  }, [
    localWaveformData,
    currentTime,
    effectiveDuration,
    height,
    zoom,
    color,
    progressColor,
    backgroundColor,
    regions,
  ]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  useEffect(() => {
    const handleResize = () => {
      drawWaveform();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawWaveform]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current || effectiveDuration === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const time = (x / (rect.width * zoom)) * effectiveDuration;

    if (isCreatingRegion && regionStart !== null) {
      const end = time;
      const start = regionStart;

      onRegionCreate?.({
        start: Math.min(start, end),
        end: Math.max(start, end),
        color: "#8b5cf6",
      });

      setIsCreatingRegion(false);
      setRegionStart(null);
    } else {
      onSeek?.(Math.max(0, Math.min(time, effectiveDuration)));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current || effectiveDuration === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const time = (x / (rect.width * zoom)) * effectiveDuration;

    setHoverTime(Math.max(0, Math.min(time, effectiveDuration)));

    if (isDragging) {
      onSeek?.(Math.max(0, Math.min(time, effectiveDuration)));
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  const timeMarkers = useMemo(() => {
    if (effectiveDuration === 0) return [];

    const markers: { time: number; position: number }[] = [];
    const interval =
      effectiveDuration > 60 ? 10 : effectiveDuration > 30 ? 5 : 2;

    for (let t = 0; t <= effectiveDuration; t += interval) {
      markers.push({
        time: t,
        position: (t / effectiveDuration) * 100,
      });
    }

    return markers;
  }, [effectiveDuration]);

  return (
    <div
      className={cn(
        "flex flex-col bg-zinc-950 rounded-lg border border-zinc-800",
        className,
      )}
    >
      {showControls && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onPlayPause}
              className="h-8 w-8 p-0"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </Button>

            <div className="flex items-center gap-1 ml-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsMuted(!isMuted)}
                className="h-7 w-7 p-0"
              >
                {isMuted ? (
                  <VolumeX className="w-3 h-3" />
                ) : (
                  <Volume2 className="w-3 h-3" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                onValueChange={([v]) => {
                  setVolume(v);
                  if (v > 0) setIsMuted(false);
                }}
                max={1}
                step={0.01}
                className="w-16"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(effectiveDuration)}</span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onZoomChange?.(Math.max(0.5, zoom - 0.5))}
              className="h-7 w-7 p-0"
              disabled={zoom <= 0.5}
            >
              <ZoomOut className="w-3 h-3" />
            </Button>
            <span className="text-xs text-zinc-500 w-8 text-center">
              {zoom}x
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onZoomChange?.(Math.min(4, zoom + 0.5))}
              className="h-7 w-7 p-0"
              disabled={zoom >= 4}
            >
              <ZoomIn className="w-3 h-3" />
            </Button>

            <div className="w-px h-4 bg-zinc-700 mx-1" />

            <Button
              size="sm"
              variant={isCreatingRegion ? "default" : "ghost"}
              onClick={() => {
                setIsCreatingRegion(!isCreatingRegion);
                setRegionStart(null);
              }}
              className="h-7 w-7 p-0"
            >
              <Scissors className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {showTimeline && (
        <div className="relative h-5 border-b border-zinc-800 overflow-hidden">
          <div
            className="absolute inset-0 flex"
            style={{ width: `${100 * zoom}%` }}
          >
            {timeMarkers.map(({ time, position }) => (
              <div
                key={time}
                className="absolute flex flex-col items-center"
                style={{ left: `${position}%` }}
              >
                <div className="w-px h-2 bg-zinc-700" />
                <span className="text-[10px] text-zinc-600 -translate-x-1/2">
                  {formatTime(time)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative overflow-x-auto"
        style={{ height }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => {
          setIsHovering(false);
          setIsDragging(false);
        }}
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseDown={(e) => {
            if (isCreatingRegion) {
              const rect = containerRef.current?.getBoundingClientRect();
              if (rect) {
                const x =
                  e.clientX -
                  rect.left +
                  (containerRef.current?.scrollLeft || 0);
                const time = (x / (rect.width * zoom)) * effectiveDuration;
                setRegionStart(time);
              }
            } else {
              setIsDragging(true);
            }
          }}
          onMouseUp={() => setIsDragging(false)}
          className={cn(
            "cursor-pointer transition-opacity",
            isCreatingRegion && "cursor-crosshair",
          )}
          style={{ height }}
        />

        <AnimatePresence>
          {isHovering && !isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-0 pointer-events-none"
              style={{
                left: `${(hoverTime / effectiveDuration) * 100 * zoom}%`,
                height,
              }}
            >
              <div className="w-px h-full bg-white/30" />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-800 rounded text-xs font-mono text-white whitespace-nowrap">
                {formatTime(hoverTime)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {regions.length > 0 && (
        <div className="px-3 py-2 border-t border-zinc-800 flex gap-2 overflow-x-auto">
          {regions.map((region) => (
            <div
              key={region.id}
              className="flex items-center gap-2 px-2 py-1 bg-zinc-900 rounded text-xs"
              style={{ borderLeft: `3px solid ${region.color}` }}
            >
              <span className="text-zinc-400">{region.label || "Region"}</span>
              <span className="text-zinc-600">
                {formatTime(region.start)} - {formatTime(region.end)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RealTimeWaveformDisplay;
