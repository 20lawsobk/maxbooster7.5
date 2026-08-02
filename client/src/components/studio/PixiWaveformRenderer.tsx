import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as PIXI from "pixi.js";
import { cn } from "@/lib/utils";

export interface WaveformClipData {
  id: string;
  name: string;
  trackId: string;
  startTime: number;
  duration: number;
  color: string;
  waveformData?: Float32Array | number[];
  peaks?: { min: number; max: number }[];
}

export interface PixiWaveformRendererProps {
  clips: WaveformClipData[];
  pixelsPerSecond: number;
  height: number;
  playheadPosition: number;
  loopStart?: number;
  loopEnd?: number;
  loopEnabled?: boolean;
  selectedClipIds?: string[];
  onClipClick?: (clipId: string) => void;
  onClipDrag?: (clipId: string, newStartTime: number) => void;
  backgroundColor?: string;
  waveformColor?: string;
  playheadColor?: string;
  className?: string;
}

export interface PixiWaveformRendererRef {
  redraw: () => void;
  setPlayhead: (position: number) => void;
  zoomTo: (pixelsPerSecond: number) => void;
  destroy: () => void;
}

function hexToPixiColor(hex: string): number {
  const cleanHex = hex.replace("#", "");
  return parseInt(cleanHex, 16);
}

function generatePeaksFromWaveformData(
  waveformData: Float32Array | number[],
  targetSamples: number,
): { min: number; max: number }[] {
  const peaks: { min: number; max: number }[] = [];
  const samplesPerPeak = Math.ceil(waveformData.length / targetSamples);

  for (let i = 0; i < targetSamples; i++) {
    const startIdx = i * samplesPerPeak;
    const endIdx = Math.min(startIdx + samplesPerPeak, waveformData.length);

    let min = 0;
    let max = 0;

    for (let j = startIdx; j < endIdx; j++) {
      const sample = waveformData[j];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    peaks.push({ min, max });
  }

  return peaks;
}

function generatePlaceholderPeaks(
  duration: number,
  samplesPerSecond: number = 100,
): { min: number; max: number }[] {
  const numSamples = Math.ceil(duration * samplesPerSecond);
  const peaks: { min: number; max: number }[] = [];

  for (let i = 0; i < numSamples; i++) {
    const envelope = Math.sin((i / numSamples) * Math.PI);
    const noise = (Math.random() - 0.5) * 0.4;
    const variation = Math.sin(i * 0.3) * 0.2 + Math.sin(i * 0.7) * 0.15;

    const amplitude = Math.max(
      0.1,
      Math.min(1, envelope * 0.6 + variation + noise + 0.3),
    );
    const asymmetry = (Math.random() - 0.5) * 0.2;

    peaks.push({
      min: -amplitude * (1 - asymmetry),
      max: amplitude * (1 + asymmetry),
    });
  }

  return peaks;
}

export const PixiWaveformRenderer = forwardRef<
  PixiWaveformRendererRef,
  PixiWaveformRendererProps
>(function PixiWaveformRenderer(
  {
    clips,
    pixelsPerSecond,
    height,
    playheadPosition,
    loopStart = 0,
    loopEnd = 0,
    loopEnabled = false,
    selectedClipIds = [],
    onClipClick,
    onClipDrag,
    backgroundColor = "#1a1a1a",
    _waveformColor = "#4ade80",
    playheadColor = "#ef4444",
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const clipContainersRef = useRef<Map<string, PIXI.Container>>(new Map());
  const playheadRef = useRef<PIXI.Graphics | null>(null);
  const loopRegionRef = useRef<PIXI.Graphics | null>(null);
  const isInitializedRef = useRef(false);
  const clipDataRef = useRef<Map<string, WaveformClipData>>(new Map());
  const dragStateRef = useRef<
    Map<
      string,
      { isDragging: boolean; dragStartX: number; clipStartTime: number }
    >
  >(new Map());

  const totalDuration = useMemo(() => {
    if (clips.length === 0) return 60;
    return Math.max(
      60,
      ...clips.map((clip) => clip.startTime + clip.duration + 10),
    );
  }, [clips]);

  const totalWidth = useMemo(() => {
    return totalDuration * pixelsPerSecond;
  }, [totalDuration, pixelsPerSecond]);

  const initPixi = useCallback(async () => {
    if (!containerRef.current || isInitializedRef.current) return;

    const app = new PIXI.Application();

    await app.init({
      width: Math.max(totalWidth, containerRef.current.clientWidth),
      height,
      backgroundColor: hexToPixiColor(backgroundColor),
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    containerRef.current.appendChild(app.canvas as HTMLCanvasElement);
    appRef.current = app;
    isInitializedRef.current = true;

    loopRegionRef.current = new PIXI.Graphics();
    app.stage.addChild(loopRegionRef.current);

    playheadRef.current = new PIXI.Graphics();
    app.stage.addChild(playheadRef.current);
  }, [totalWidth, height, backgroundColor]);

  const drawWaveform = useCallback(
    (
      graphics: PIXI.Graphics,
      peaks: { min: number; max: number }[],
      width: number,
      clipHeight: number,
      color: number,
    ) => {
      const centerY = clipHeight / 2;
      const amplitude = (clipHeight / 2) * 0.9;

      graphics.clear();

      graphics.fill({ color, alpha: 0.15 });
      graphics.moveTo(0, centerY);

      for (let i = 0; i < peaks.length; i++) {
        const x = (i / peaks.length) * width;
        const y = centerY - peaks[i].max * amplitude;
        if (i === 0) {
          graphics.moveTo(x, y);
        } else {
          graphics.lineTo(x, y);
        }
      }

      for (let i = peaks.length - 1; i >= 0; i--) {
        const x = (i / peaks.length) * width;
        const y = centerY - peaks[i].min * amplitude;
        graphics.lineTo(x, y);
      }

      graphics.closePath();
      graphics.fill();

      graphics.stroke({ width: 1, color, alpha: 0.8 });
      graphics.moveTo(0, centerY);

      for (let i = 0; i < peaks.length; i++) {
        const x = (i / peaks.length) * width;
        const maxY = centerY - peaks[i].max * amplitude;
        const minY = centerY - peaks[i].min * amplitude;

        graphics.moveTo(x, maxY);
        graphics.lineTo(x, minY);
      }

      graphics.stroke();
    },
    [],
  );

  const drawClips = useCallback(() => {
    if (!appRef.current) return;

    const app = appRef.current;
    const existingIds = new Set(clips.map((c) => c.id));

    clipContainersRef.current.forEach((container, id) => {
      if (!existingIds.has(id)) {
        app.stage.removeChild(container);
        container.destroy({ children: true });
        clipContainersRef.current.delete(id);
      }
    });

    clips.forEach((clip) => {
      clipDataRef.current.set(clip.id, clip);

      let container = clipContainersRef.current.get(clip.id);

      if (!container) {
        container = new PIXI.Container();
        container.eventMode = "static";
        container.cursor = "pointer";

        dragStateRef.current.set(clip.id, {
          isDragging: false,
          dragStartX: 0,
          clipStartTime: 0,
        });

        const clipId = clip.id;

        container.on("pointerdown", (event: PIXI.FederatedPointerEvent) => {
          onClipClick?.(clipId);
          if (onClipDrag) {
            const currentClip = clipDataRef.current.get(clipId);
            const dragState = dragStateRef.current.get(clipId);
            if (currentClip && dragState) {
              dragState.isDragging = true;
              dragState.dragStartX = event.globalX;
              dragState.clipStartTime = currentClip.startTime;
            }
            container!.cursor = "grabbing";
          }
        });

        container.on(
          "globalpointermove",
          (event: PIXI.FederatedPointerEvent) => {
            const dragState = dragStateRef.current.get(clipId);
            if (dragState?.isDragging && onClipDrag) {
              const deltaX = event.globalX - dragState.dragStartX;
              const deltaTime = deltaX / pixelsPerSecond;
              const newStartTime = Math.max(
                0,
                dragState.clipStartTime + deltaTime,
              );
              container!.x = newStartTime * pixelsPerSecond;
            }
          },
        );

        container.on("pointerup", (event: PIXI.FederatedPointerEvent) => {
          const dragState = dragStateRef.current.get(clipId);
          if (dragState?.isDragging && onClipDrag) {
            dragState.isDragging = false;
            const deltaX = event.globalX - dragState.dragStartX;
            const deltaTime = deltaX / pixelsPerSecond;
            const newStartTime = Math.max(
              0,
              dragState.clipStartTime + deltaTime,
            );
            onClipDrag(clipId, newStartTime);
            container!.cursor = "pointer";
          }
        });

        container.on(
          "pointerupoutside",
          (event: PIXI.FederatedPointerEvent) => {
            const dragState = dragStateRef.current.get(clipId);
            if (dragState?.isDragging && onClipDrag) {
              dragState.isDragging = false;
              const deltaX = event.globalX - dragState.dragStartX;
              const deltaTime = deltaX / pixelsPerSecond;
              const newStartTime = Math.max(
                0,
                dragState.clipStartTime + deltaTime,
              );
              onClipDrag(clipId, newStartTime);
              container!.cursor = "pointer";
            }
          },
        );

        app.stage.addChild(container);
        clipContainersRef.current.set(clip.id, container);
      }

      container.x = clip.startTime * pixelsPerSecond;
      container.y = 4;

      while (container.children.length > 0) {
        container.removeChildAt(0);
      }

      const clipWidth = clip.duration * pixelsPerSecond;
      const clipHeight = height - 8;

      const bg = new PIXI.Graphics();
      const bgColor = hexToPixiColor(clip.color);
      const isSelected = selectedClipIds.includes(clip.id);

      bg.roundRect(0, 0, clipWidth, clipHeight, 4);
      bg.fill({ color: bgColor, alpha: 0.3 });

      if (isSelected) {
        bg.roundRect(0, 0, clipWidth, clipHeight, 4);
        bg.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      }

      container.addChild(bg);

      const waveform = new PIXI.Graphics();
      const targetSamples = Math.ceil(clipWidth / 2);
      let peaks: { min: number; max: number }[];

      if (clip.waveformData && clip.waveformData.length > 0) {
        peaks = generatePeaksFromWaveformData(clip.waveformData, targetSamples);
      } else if (clip.peaks && clip.peaks.length > 0) {
        peaks = clip.peaks;
      } else {
        peaks = generatePlaceholderPeaks(clip.duration);
      }

      drawWaveform(waveform, peaks, clipWidth, clipHeight, bgColor);
      container.addChild(waveform);

      const label = new PIXI.Text({
        text: clip.name,
        style: {
          fontFamily: "system-ui, sans-serif",
          fontSize: 11,
          fill: 0xffffff,
          fontWeight: "500",
        },
      });
      label.x = 6;
      label.y = 4;
      container.addChild(label);
    });

    if (playheadRef.current) {
      app.stage.removeChild(playheadRef.current);
      app.stage.addChild(playheadRef.current);
    }
  }, [
    clips,
    pixelsPerSecond,
    height,
    selectedClipIds,
    onClipClick,
    drawWaveform,
  ]);

  const updatePlayhead = useCallback(
    (position: number) => {
      if (!playheadRef.current || !appRef.current) return;

      const x = position * pixelsPerSecond;
      const playhead = playheadRef.current;

      playhead.clear();

      playhead.moveTo(x, 0);
      playhead.lineTo(x, height);
      playhead.stroke({
        width: 2,
        color: hexToPixiColor(playheadColor),
        alpha: 1,
      });

      playhead.beginPath();
      playhead.moveTo(x - 6, 0);
      playhead.lineTo(x + 6, 0);
      playhead.lineTo(x, 10);
      playhead.closePath();
      playhead.fill({ color: hexToPixiColor(playheadColor) });
    },
    [pixelsPerSecond, height, playheadColor],
  );

  const updateLoopRegion = useCallback(() => {
    if (!loopRegionRef.current || !loopEnabled) return;

    const loop = loopRegionRef.current;
    loop.clear();

    if (loopEnabled && loopEnd > loopStart) {
      const startX = loopStart * pixelsPerSecond;
      const endX = loopEnd * pixelsPerSecond;
      const width = endX - startX;

      loop.rect(startX, 0, width, height);
      loop.fill({ color: 0x3b82f6, alpha: 0.15 });

      loop.moveTo(startX, 0);
      loop.lineTo(startX, height);
      loop.stroke({ width: 2, color: 0x3b82f6, alpha: 0.8 });

      loop.moveTo(endX, 0);
      loop.lineTo(endX, height);
      loop.stroke({ width: 2, color: 0x3b82f6, alpha: 0.8 });
    }
  }, [loopEnabled, loopStart, loopEnd, pixelsPerSecond, height]);

  const redraw = useCallback(() => {
    drawClips();
    updatePlayhead(playheadPosition);
    updateLoopRegion();
  }, [drawClips, updatePlayhead, updateLoopRegion, playheadPosition]);

  const destroy = useCallback(() => {
    if (appRef.current) {
      appRef.current.destroy(true, { children: true, texture: true });
      appRef.current = null;
    }
    clipContainersRef.current.clear();
    playheadRef.current = null;
    loopRegionRef.current = null;
    isInitializedRef.current = false;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      redraw,
      setPlayhead: updatePlayhead,
      zoomTo: (newPixelsPerSecond: number) => {
        if (appRef.current) {
          const newWidth = totalDuration * newPixelsPerSecond;
          appRef.current.renderer.resize(newWidth, height);
          redraw();
        }
      },
      destroy,
    }),
    [redraw, updatePlayhead, destroy, totalDuration, height],
  );

  useEffect(() => {
    initPixi();

    return () => {
      destroy();
    };
  }, []);

  useEffect(() => {
    if (isInitializedRef.current) {
      drawClips();
    }
  }, [clips, pixelsPerSecond, height, selectedClipIds, drawClips]);

  useEffect(() => {
    updatePlayhead(playheadPosition);
  }, [playheadPosition, updatePlayhead]);

  useEffect(() => {
    updateLoopRegion();
  }, [loopEnabled, loopStart, loopEnd, updateLoopRegion]);

  useEffect(() => {
    if (appRef.current && containerRef.current) {
      const newWidth = Math.max(totalWidth, containerRef.current.clientWidth);
      if (appRef.current.renderer.width !== newWidth) {
        appRef.current.renderer.resize(newWidth, height);
        redraw();
      }
    }
  }, [totalWidth, height, redraw]);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-x-auto", className)}
      style={{ height }}
    />
  );
});

export default PixiWaveformRenderer;
