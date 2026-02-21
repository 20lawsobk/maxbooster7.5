import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  StudioOneWaveformEngine,
  ClipRenderData,
  TimelineRenderConfig,
  EngineStats,
} from '@/lib/daw/StudioOneWaveformEngine';
import { ZoomIn, ZoomOut, Maximize2, Activity, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

export interface StudioOneWaveformProps {
  clips?: ClipRenderData[];
  audioData?: Float32Array | AudioBuffer;
  sourceId?: string;
  isPlaying?: boolean;
  currentTime?: number;
  bpm?: number;
  timeSignature?: [number, number];
  duration?: number;
  sampleRate?: number;
  onSeek?: (time: number) => void;
  onZoomChange?: (zoom: number) => void;
  showControls?: boolean;
  showStats?: boolean;
  height?: number;
  renderConfig?: Partial<TimelineRenderConfig>;
  className?: string;
}

export function StudioOneWaveform({
  clips = [],
  audioData,
  sourceId = 'default',
  isPlaying = false,
  currentTime = 0,
  bpm = 120,
  timeSignature = [4, 4],
  duration = 60,
  sampleRate = 44100,
  onSeek,
  onZoomChange,
  showControls = true,
  showStats = false,
  height = 200,
  renderConfig,
  className,
}: StudioOneWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioOneWaveformEngine | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [verticalScale, setVerticalScale] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    const engine = new StudioOneWaveformEngine({
      sampleRate,
      bpm,
      timeSignature,
      renderConfig,
    });
    engineRef.current = engine;

    if (canvasRef.current) {
      engine.initialize(canvasRef.current);
      engine.setViewDuration(duration);
      engine.start();
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !audioData) return;

    if (audioData instanceof AudioBuffer) {
      engine.loadAudioBuffer(sourceId, audioData);
    } else if (audioData instanceof Float32Array) {
      engine.loadAudio(sourceId, audioData, sampleRate);
    }
  }, [audioData, sourceId, sampleRate]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (clips.length > 0) {
      engine.setClips(clips);
    } else if (audioData) {
      const dur = audioData instanceof AudioBuffer
        ? audioData.duration
        : audioData.length / sampleRate;

      engine.setClips([{
        id: `clip_${sourceId}`,
        sourceId,
        name: 'Audio',
        startTime: 0,
        duration: dur,
        sourceOffset: 0,
        color: renderConfig?.waveformColor || '#4ade80',
        selected: false,
        muted: false,
        gain: 1,
      }]);
    }
  }, [clips, audioData, sourceId, sampleRate, renderConfig?.waveformColor]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.play(currentTime);
    } else {
      engine.pause();
      engine.seek(currentTime);
    }
  }, [isPlaying, currentTime]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setTimeSignature(timeSignature[0], timeSignature[1]);
  }, [timeSignature]);

  useEffect(() => {
    if (!showStats) return;
    const interval = setInterval(() => {
      if (engineRef.current) {
        setStats(engineRef.current.getStats());
      }
    }, 500);
    return () => clearInterval(interval);
  }, [showStats]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const engine = engineRef.current;
    if (!engine) return;

    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const rect = canvasRef.current?.getBoundingClientRect();
      const localX = rect ? e.clientX - rect.left : undefined;
      engine.zoomIn(factor, localX);
      setZoomLevel(prev => Math.max(0.01, Math.min(1000, prev * factor)));
      onZoomChange?.(zoomLevel * factor);
    } else if (e.shiftKey) {
      const newScale = Math.max(0.1, Math.min(10, verticalScale + (e.deltaY < 0 ? 0.1 : -0.1)));
      setVerticalScale(newScale);
      engine.setVerticalScale(newScale);
    } else {
      const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      engine.scrollBy(scrollDelta * 0.01);
    }
  }, [verticalScale, zoomLevel, onZoomChange]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current || !onSeek) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const seekTime = ratio * duration;
    onSeek(seekTime);
  }, [onSeek, duration]);

  const handleZoomIn = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.zoomIn(1.5);
    setZoomLevel(prev => prev * 1.5);
  }, []);

  const handleZoomOut = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.zoomOut(1.5);
    setZoomLevel(prev => prev / 1.5);
  }, []);

  const handleFitToView = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setDataZoom({ horizontalZoom: 1, scrollOffset: 0 });
    setZoomLevel(1);
  }, []);

  const handleVerticalScaleChange = useCallback((value: number[]) => {
    const engine = engineRef.current;
    if (!engine) return;
    const scale = value[0];
    setVerticalScale(scale);
    engine.setVerticalScale(scale);
  }, []);

  const demoData = useMemo(() => {
    if (audioData) return null;
    const len = sampleRate * 10;
    const data = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      data[i] =
        Math.sin(t * 440 * 2 * Math.PI) * 0.3 *
        Math.sin(t * Math.PI * 0.5) +
        Math.sin(t * 880 * 2 * Math.PI) * 0.15 *
        Math.cos(t * Math.PI * 0.3) +
        (Math.random() - 0.5) * 0.05;
    }
    return data;
  }, [audioData, sampleRate]);

  useEffect(() => {
    if (demoData && engineRef.current) {
      engineRef.current.loadAudio('demo', demoData, sampleRate);
      engineRef.current.setClips([{
        id: 'clip_demo',
        sourceId: 'demo',
        name: 'Demo Audio',
        startTime: 0,
        duration: 10,
        sourceOffset: 0,
        color: '#4ade80',
        selected: false,
        muted: false,
        gain: 1,
      }]);
    }
  }, [demoData, sampleRate]);

  return (
    <div className={cn('relative bg-[#1a1a2e] rounded-lg overflow-hidden border border-white/10', className)}>
      {showControls && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/30 border-b border-white/5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            className="h-6 w-6 p-0 text-white/60 hover:text-white"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            className="h-6 w-6 p-0 text-white/60 hover:text-white"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFitToView}
            className="h-6 w-6 p-0 text-white/60 hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>

          <div className="flex items-center gap-1.5 ml-3">
            <Activity className="h-3 w-3 text-white/40" />
            <span className="text-[10px] text-white/40">Height</span>
            <div className="w-20">
              <Slider
                value={[verticalScale]}
                min={0.1}
                max={5}
                step={0.1}
                onValueChange={handleVerticalScaleChange}
                className="h-4"
              />
            </div>
            <span className="text-[10px] text-white/50 w-8 text-right">
              {verticalScale.toFixed(1)}x
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2 text-[10px] text-white/30">
            <span>{bpm} BPM</span>
            <span>{timeSignature[0]}/{timeSignature[1]}</span>
            <span>Zoom: {zoomLevel.toFixed(1)}x</span>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        style={{ height: `${height}px` }}
        className="relative cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {showStats && stats && (
        <div className="flex items-center gap-3 px-3 py-1 bg-black/40 border-t border-white/5">
          <div className="flex items-center gap-1">
            <Gauge className="h-3 w-3 text-green-400" />
            <span className="text-[10px] text-green-400 font-mono">{stats.fps} FPS</span>
          </div>
          <span className="text-[10px] text-white/30 font-mono">
            Cache: {stats.cacheEntries} entries ({(stats.totalCacheBytes / 1024 / 1024).toFixed(1)} MB)
          </span>
          <span className="text-[10px] text-white/30 font-mono">
            {stats.cacheUtilization.toFixed(1)}% utilized
          </span>
          <span className="text-[10px] text-white/30 font-mono">
            Δt: {(stats.deltaTime * 1000).toFixed(1)}ms
          </span>
        </div>
      )}
    </div>
  );
}
