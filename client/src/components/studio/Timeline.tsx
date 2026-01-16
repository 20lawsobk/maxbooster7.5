import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useStudioStore } from '@/lib/studioStore';
import { 
  MousePointer2, 
  Maximize2, 
  Scissors, 
  Move, 
  Pencil, 
  PenTool,
  Eraser 
} from 'lucide-react';

interface AudioClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  filePath?: string;
  gain?: number;
  offset?: number;
}

interface Track {
  id: string;
  name: string;
  color: string;
}

interface TimelineProps {
  currentTime: number;
  loopEnabled?: boolean;
  loopStart?: number;
  loopEnd?: number;
  duration?: number;
  timeSignature?: string;
  tracks?: Track[];
  trackClips?: Map<string, AudioClip[]>;
  onTimelineClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClipUpdate?: (
    trackId: string,
    clipId: string,
    updates: { startTime?: number; duration?: number }
  ) => void;
  onClipSplit?: (trackId: string, clipId: string, splitTime: number) => void;
  onRangeSelect?: (start: number, end: number) => void;
  snapEnabled?: boolean;
  snapInterval?: number;
  zoom?: number;
  isPlaying?: boolean;
  selectedTrack?: string | null;
  onTrackSelect?: (trackId: string) => void;
  onTimeChange?: (time: number) => void;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  pointer: <MousePointer2 className="w-3 h-3" />,
  range: <Maximize2 className="w-3 h-3" />,
  split: <Scissors className="w-3 h-3" />,
  slip: <Move className="w-3 h-3" />,
  draw: <Pencil className="w-3 h-3" />,
  pencil: <PenTool className="w-3 h-3" />,
  eraser: <Eraser className="w-3 h-3" />,
};

const TOOL_LABELS: Record<string, string> = {
  pointer: 'Select',
  range: 'Range',
  split: 'Split',
  slip: 'Slip',
  draw: 'Draw',
  pencil: 'Pencil',
  eraser: 'Eraser',
};

/**
 * Timeline component with autoscroll support
 * Modes: turnover (page jump), continuous-centered, continuous-left
 */
export function Timeline({
  currentTime,
  loopEnabled = false,
  loopStart = 0,
  loopEnd = 60,
  duration = 60,
  timeSignature = '4/4',
  tracks = [],
  trackClips = new Map(),
  onTimelineClick,
  onClipUpdate,
  onClipSplit,
  onRangeSelect,
  snapEnabled = true,
  snapInterval = 0.25,
  zoom = 1,
  isPlaying = false,
  selectedTrack = null,
  onTrackSelect,
  onTimeChange,
}: TimelineProps) {
  const { 
    autoscrollMode,
    currentTool,
    gridVisible,
    gridDivision,
    rangeSelectionStart,
    rangeSelectionEnd,
    setRangeSelection,
    clearRangeSelection
  } = useStudioStore();
  
  const [numerator] = (timeSignature || '4/4').split('/').map(Number);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; trackId: string } | null>(
    null
  );
  const [resizingClip, setResizingClip] = useState<{
    clipId: string;
    trackId: string;
    edge: 'start' | 'end';
  } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [previewPosition, setPreviewPosition] = useState<{
    startTime: number;
    endTime: number;
  } | null>(null);

  const [isRangeSelecting, setIsRangeSelecting] = useState(false);
  const [rangeStartPos, setRangeStartPos] = useState<number | null>(null);
  const [localRangeEnd, setLocalRangeEnd] = useState<number | null>(null);

  const [splitPreviewTime, setSplitPreviewTime] = useState<number | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const trackLanesRef = useRef<HTMLDivElement>(null);

  const timelineMarkers = useMemo(
    () =>
      Array.from({ length: 32 }).map((_, i) => {
        const isBar = i % numerator === 0;
        return {
          index: i,
          isBar,
          label: isBar ? Math.floor(i / numerator) + 1 : '',
        };
      }),
    [numerator]
  );

  const gridLines = useMemo(() => {
    if (!gridVisible) return [];
    
    const lines: { position: number; type: 'bar' | 'beat' | 'subdivision' }[] = [];
    const beatsPerBar = numerator;
    const subdivisionsPerBeat = gridDivision;
    const totalBeats = 32;
    
    for (let beat = 0; beat <= totalBeats; beat++) {
      const isBar = beat % beatsPerBar === 0;
      const position = (beat / totalBeats) * 100;
      
      lines.push({
        position,
        type: isBar ? 'bar' : 'beat',
      });
      
      if (subdivisionsPerBeat > 1) {
        for (let sub = 1; sub < subdivisionsPerBeat; sub++) {
          const subPosition = ((beat + sub / subdivisionsPerBeat) / totalBeats) * 100;
          if (subPosition < 100) {
            lines.push({
              position: subPosition,
              type: 'subdivision',
            });
          }
        }
      }
    }
    
    return lines;
  }, [gridVisible, gridDivision, numerator]);

  const getCrossfadeRegions = useCallback((clips: AudioClip[]) => {
    const crossfades: { startTime: number; endTime: number; clipAId: string; clipBId: string }[] = [];
    const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime);
    
    for (let i = 0; i < sortedClips.length - 1; i++) {
      const clipA = sortedClips[i];
      const clipB = sortedClips[i + 1];
      const clipAEnd = clipA.startTime + clipA.duration;
      const gap = clipB.startTime - clipAEnd;
      
      if (gap <= 0.1 && gap >= -0.5) {
        const overlapStart = Math.max(clipA.startTime, clipB.startTime - 0.05);
        const overlapEnd = Math.min(clipAEnd, clipB.startTime + 0.05);
        
        if (overlapEnd > overlapStart) {
          crossfades.push({
            startTime: clipB.startTime - 0.02,
            endTime: clipB.startTime + 0.02,
            clipAId: clipA.id,
            clipBId: clipB.id,
          });
        }
      }
    }
    
    return crossfades;
  }, []);

  const pixelsToTime = useCallback(
    (pixels: number): number => {
      if (!timelineRef.current) return 0;
      const width = timelineRef.current.offsetWidth;
      return (pixels / width) * duration;
    },
    [duration]
  );

  const timeToPixels = useCallback(
    (time: number): number => {
      if (!timelineRef.current) return 0;
      const width = timelineRef.current.offsetWidth;
      return (time / duration) * width;
    },
    [duration]
  );

  const snapToGrid = useCallback(
    (time: number): number => {
      if (!snapEnabled) return time;
      return Math.round(time / snapInterval) * snapInterval;
    },
    [snapEnabled, snapInterval]
  );

  const handleClipDragStart = useCallback(
    (e: React.MouseEvent, clipId: string, trackId: string, clip: AudioClip) => {
      if (currentTool === 'split') return;
      if (currentTool === 'range') return;
      
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickTime = pixelsToTime(clickX);
      setDragOffset(clickTime);
      setDraggingClip({ clipId, trackId });
      setPreviewPosition({ startTime: clip.startTime, endTime: clip.startTime + clip.duration });
    },
    [pixelsToTime, currentTool]
  );

  const handleClipDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingClip || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseTime = pixelsToTime(mouseX);

      const clips = trackClips.get(draggingClip.trackId);
      const clip = clips?.find((c) => c.id === draggingClip.clipId);
      if (!clip) return;

      const clipDuration = clip.duration;
      let newStartTime = mouseTime - dragOffset;

      newStartTime = snapToGrid(newStartTime);
      newStartTime = Math.max(0, Math.min(newStartTime, duration - clipDuration));

      const newEndTime = newStartTime + clipDuration;

      setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
    },
    [draggingClip, trackClips, pixelsToTime, snapToGrid, dragOffset, duration]
  );

  const handleClipDragEnd = useCallback(() => {
    if (!draggingClip || !previewPosition) {
      setDraggingClip(null);
      setPreviewPosition(null);
      return;
    }

    if (onClipUpdate) {
      const duration = previewPosition.endTime - previewPosition.startTime;
      onClipUpdate(draggingClip.trackId, draggingClip.clipId, {
        startTime: previewPosition.startTime,
        duration: duration,
      });
    }

    setDraggingClip(null);
    setPreviewPosition(null);
  }, [draggingClip, previewPosition, onClipUpdate]);

  const handleResizeStart = useCallback(
    (
      e: React.MouseEvent,
      clipId: string,
      trackId: string,
      edge: 'start' | 'end',
      clip: AudioClip
    ) => {
      if (currentTool === 'split' || currentTool === 'range') return;
      
      e.stopPropagation();
      setResizingClip({ clipId, trackId, edge });
      setPreviewPosition({ startTime: clip.startTime, endTime: clip.startTime + clip.duration });
    },
    [currentTool]
  );

  const handleResize = useCallback(
    (e: React.MouseEvent) => {
      if (!resizingClip || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      let mouseTime = pixelsToTime(mouseX);

      mouseTime = snapToGrid(mouseTime);

      const clips = trackClips.get(resizingClip.trackId);
      const clip = clips?.find((c) => c.id === resizingClip.clipId);
      if (!clip) return;

      let newStartTime = clip.startTime;
      let newEndTime = clip.startTime + clip.duration;

      if (resizingClip.edge === 'start') {
        newStartTime = Math.max(0, Math.min(mouseTime, clip.startTime + clip.duration - 0.1));
      } else {
        newEndTime = Math.max(clip.startTime + 0.1, Math.min(mouseTime, duration));
      }

      setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
    },
    [resizingClip, trackClips, pixelsToTime, snapToGrid, duration]
  );

  const handleResizeEnd = useCallback(() => {
    if (!resizingClip || !previewPosition) {
      setResizingClip(null);
      setPreviewPosition(null);
      return;
    }

    if (onClipUpdate) {
      const duration = previewPosition.endTime - previewPosition.startTime;
      onClipUpdate(resizingClip.trackId, resizingClip.clipId, {
        startTime: previewPosition.startTime,
        duration: duration,
      });
    }

    setResizingClip(null);
    setPreviewPosition(null);
  }, [resizingClip, previewPosition, onClipUpdate]);

  const handleClipClick = useCallback(
    (e: React.MouseEvent, clipId: string, trackId: string, clip: AudioClip) => {
      if (currentTool === 'split' && onClipSplit) {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const parentRect = timelineRef.current?.getBoundingClientRect();
        if (parentRect) {
          const absoluteX = e.clientX - parentRect.left;
          let splitTime = pixelsToTime(absoluteX);
          splitTime = snapToGrid(splitTime);
          
          if (splitTime > clip.startTime && splitTime < clip.startTime + clip.duration) {
            onClipSplit(trackId, clipId, splitTime);
          }
        }
      }
    },
    [currentTool, onClipSplit, pixelsToTime, snapToGrid]
  );

  const handleRangeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (currentTool !== 'range') return;
      
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const mouseX = e.clientX - rect.left;
      const startTime = snapToGrid(pixelsToTime(mouseX));
      
      setIsRangeSelecting(true);
      setRangeStartPos(startTime);
      setLocalRangeEnd(startTime);
      clearRangeSelection();
    },
    [currentTool, pixelsToTime, snapToGrid, clearRangeSelection]
  );

  const handleRangeMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isRangeSelecting || rangeStartPos === null) return;
      
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const mouseX = e.clientX - rect.left;
      let endTime = pixelsToTime(mouseX);
      endTime = snapToGrid(endTime);
      endTime = Math.max(0, Math.min(endTime, duration));
      
      setLocalRangeEnd(endTime);
    },
    [isRangeSelecting, rangeStartPos, pixelsToTime, snapToGrid, duration]
  );

  const handleRangeMouseUp = useCallback(() => {
    if (!isRangeSelecting || rangeStartPos === null || localRangeEnd === null) {
      setIsRangeSelecting(false);
      return;
    }
    
    const start = Math.min(rangeStartPos, localRangeEnd);
    const end = Math.max(rangeStartPos, localRangeEnd);
    
    if (end - start > 0.01) {
      setRangeSelection(start, end);
      onRangeSelect?.(start, end);
    }
    
    setIsRangeSelecting(false);
    setRangeStartPos(null);
    setLocalRangeEnd(null);
  }, [isRangeSelecting, rangeStartPos, localRangeEnd, setRangeSelection, onRangeSelect]);

  const handleSplitPreviewMove = useCallback(
    (e: React.MouseEvent) => {
      if (currentTool !== 'split') {
        setSplitPreviewTime(null);
        return;
      }
      
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const mouseX = e.clientX - rect.left;
      let time = pixelsToTime(mouseX);
      time = snapToGrid(time);
      setSplitPreviewTime(time);
    },
    [currentTool, pixelsToTime, snapToGrid]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isRangeSelecting) {
        handleRangeMouseMove(e);
        return;
      }
      
      const mouseEvent = e as unknown as React.MouseEvent;
      if (draggingClip) {
        handleClipDrag(mouseEvent);
      } else if (resizingClip) {
        handleResize(mouseEvent);
      }
    };

    const handleMouseUp = () => {
      if (isRangeSelecting) {
        handleRangeMouseUp();
        return;
      }
      
      if (draggingClip) {
        handleClipDragEnd();
      } else if (resizingClip) {
        handleResizeEnd();
      }
    };

    if (draggingClip || resizingClip || isRangeSelecting) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [
    draggingClip,
    resizingClip,
    isRangeSelecting,
    handleClipDrag,
    handleClipDragEnd,
    handleResize,
    handleResizeEnd,
    handleRangeMouseMove,
    handleRangeMouseUp,
  ]);

  useEffect(() => {
    if (!isPlaying || autoscrollMode === 'off' || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const containerWidth = container.clientWidth;
    const scrollableWidth = container.scrollWidth;
    const playheadPosition = (currentTime / duration) * scrollableWidth;

    switch (autoscrollMode) {
      case 'turnover': {
        const currentScroll = container.scrollLeft;
        const visibleEnd = currentScroll + containerWidth;
        const pageMargin = containerWidth * 0.1;
        if (playheadPosition > visibleEnd - pageMargin) {
          container.scrollTo({ left: playheadPosition - pageMargin, behavior: 'auto' });
        } else if (playheadPosition < currentScroll) {
          container.scrollTo({ left: Math.max(0, playheadPosition - pageMargin), behavior: 'auto' });
        }
        break;
      }
      case 'continuous-centered': {
        const targetScroll = playheadPosition - containerWidth / 2;
        container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'auto' });
        break;
      }
      case 'continuous-left': {
        const leftMargin = containerWidth * 0.1;
        const targetScroll = playheadPosition - leftMargin;
        container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'auto' });
        break;
      }
    }
  }, [currentTime, isPlaying, autoscrollMode, duration]);

  const getTimelineCursor = () => {
    switch (currentTool) {
      case 'split':
        return 'crosshair';
      case 'range':
        return 'text';
      case 'draw':
      case 'pencil':
        return 'crosshair';
      case 'eraser':
        return 'pointer';
      default:
        return 'pointer';
    }
  };

  const rangeStart = isRangeSelecting && rangeStartPos !== null && localRangeEnd !== null
    ? Math.min(rangeStartPos, localRangeEnd)
    : rangeSelectionStart;
  const rangeEnd = isRangeSelecting && rangeStartPos !== null && localRangeEnd !== null
    ? Math.max(rangeStartPos, localRangeEnd)
    : rangeSelectionEnd;

  return (
    <div 
      ref={scrollContainerRef}
      className="border-b overflow-x-auto relative" 
      style={{ borderColor: 'var(--studio-border)' }}
    >
      {/* Tool Indicator Badge */}
      <div
        className="absolute top-1 left-1 z-30 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
        style={{
          backgroundColor: 'var(--studio-bg-deep)',
          color: 'var(--studio-text-muted)',
          border: '1px solid var(--studio-border)',
        }}
        data-testid="tool-indicator"
      >
        {TOOL_ICONS[currentTool] || TOOL_ICONS.pointer}
        <span>{TOOL_LABELS[currentTool] || 'Select'}</span>
      </div>

      {/* Time Ruler */}
      <div
        ref={timelineRef}
        className="h-10 border-b relative select-none"
        style={{
          borderColor: 'var(--studio-border)',
          backgroundColor: 'var(--studio-bg-medium)',
          cursor: getTimelineCursor(),
        }}
        onClick={(e) => {
          if (currentTool === 'range') return;
          
          if (onTimelineClick) {
            onTimelineClick(e);
          }
          if (onTimeChange && timelineRef.current) {
            const rect = timelineRef.current.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickTime = (clickX / rect.width) * duration;
            onTimeChange(Math.max(0, Math.min(duration, clickTime)));
          }
        }}
        onMouseDown={handleRangeMouseDown}
        onMouseMove={handleSplitPreviewMove}
        onMouseLeave={() => setSplitPreviewTime(null)}
        data-testid="timeline-ruler"
      >
        {/* Grid Markers */}
        <div className="absolute inset-0 flex">
          {timelineMarkers.map(({ index, isBar, label }) => (
            <div
              key={index}
              className="flex-1 text-xs pl-1 pt-1"
              style={{
                borderRight: isBar
                  ? '1px solid var(--studio-border)'
                  : '1px solid var(--studio-bg-deep)',
                color: isBar ? 'var(--studio-text)' : 'var(--studio-text-muted)',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Loop Region Visualization */}
        {loopEnabled && (
          <div
            className="absolute top-0 bottom-0 bg-blue-500/20 border-l-2 border-r-2 border-blue-500 pointer-events-none"
            style={{
              left: `${(loopStart / (duration || 60)) * 100}%`,
              width: `${((loopEnd - loopStart) / (duration || 60)) * 100}%`,
            }}
            data-testid="loop-region"
          >
            <div className="absolute top-0 left-0 bg-blue-500 text-white text-[10px] px-1">
              LOOP
            </div>
          </div>
        )}

        {/* Range Selection Overlay on Ruler */}
        {rangeStart !== null && rangeEnd !== null && rangeEnd > rangeStart && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${(rangeStart / duration) * 100}%`,
              width: `${((rangeEnd - rangeStart) / duration) * 100}%`,
              backgroundColor: 'rgba(59, 130, 246, 0.3)',
              borderLeft: '2px solid rgba(59, 130, 246, 0.8)',
              borderRight: '2px solid rgba(59, 130, 246, 0.8)',
            }}
            data-testid="range-selection-ruler"
          />
        )}

        {/* Split Tool Preview Line */}
        {currentTool === 'split' && splitPreviewTime !== null && (
          <div
            className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
            style={{
              left: `${(splitPreviewTime / duration) * 100}%`,
              backgroundColor: '#ef4444',
              boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)',
            }}
            data-testid="split-preview-line"
          />
        )}

        {/* Playhead Position Indicator */}
        {duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-10"
            style={{
              left: `${(currentTime / duration) * 100}%`,
            }}
            data-testid="playhead-indicator"
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-white rotate-45" />
          </div>
        )}
      </div>

      {/* Clips Lane */}
      {tracks.length > 0 && (
        <div 
          ref={trackLanesRef}
          className="relative"
          onMouseDown={handleRangeMouseDown}
          onMouseMove={handleSplitPreviewMove}
          onMouseLeave={() => setSplitPreviewTime(null)}
          style={{ cursor: getTimelineCursor() }}
        >
          {/* Snap Grid Visualization */}
          {gridVisible && (
            <div className="absolute inset-0 pointer-events-none z-0">
              {gridLines.map((line, idx) => (
                <div
                  key={idx}
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${line.position}%`,
                    width: '1px',
                    backgroundColor:
                      line.type === 'bar'
                        ? 'rgba(255, 255, 255, 0.15)'
                        : line.type === 'beat'
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'rgba(255, 255, 255, 0.03)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Range Selection Overlay spanning all tracks */}
          {rangeStart !== null && rangeEnd !== null && rangeEnd > rangeStart && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{
                left: `${(rangeStart / duration) * 100}%`,
                width: `${((rangeEnd - rangeStart) / duration) * 100}%`,
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderLeft: '2px solid rgba(59, 130, 246, 0.7)',
                borderRight: '2px solid rgba(59, 130, 246, 0.7)',
              }}
              data-testid="range-selection-tracks"
            >
              <div 
                className="absolute inset-0"
                style={{
                  background: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(59, 130, 246, 0.1) 4px, rgba(59, 130, 246, 0.1) 8px)',
                }}
              />
            </div>
          )}

          {/* Split Tool Preview Line in track area */}
          {currentTool === 'split' && splitPreviewTime !== null && (
            <div
              className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
              style={{
                left: `${(splitPreviewTime / duration) * 100}%`,
                backgroundColor: '#ef4444',
                boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)',
              }}
            />
          )}

          {tracks.map((track, trackIndex) => {
            const clips = trackClips.get(track.id) || [];
            const crossfadeRegions = getCrossfadeRegions(clips);
            
            return (
              <div
                key={track.id}
                className="h-16 border-b relative"
                style={{
                  backgroundColor: `${track.color}10`,
                  borderColor: 'var(--studio-border)',
                }}
                data-testid={`timeline-track-${track.id}`}
              >
                {/* Crossfade Region Indicators */}
                {crossfadeRegions.map((cf, idx) => (
                  <div
                    key={`crossfade-${idx}`}
                    className="absolute top-1 bottom-1 pointer-events-none z-5"
                    style={{
                      left: `${(cf.startTime / duration) * 100}%`,
                      width: `${((cf.endTime - cf.startTime) / duration) * 100}%`,
                      minWidth: '8px',
                    }}
                    data-testid={`crossfade-${cf.clipAId}-${cf.clipBId}`}
                  >
                    <svg
                      className="w-full h-full opacity-40"
                      viewBox="0 0 20 20"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id={`cf-grad-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor={track.color} stopOpacity="0.8" />
                          <stop offset="50%" stopColor="white" stopOpacity="0.3" />
                          <stop offset="100%" stopColor={track.color} stopOpacity="0.8" />
                        </linearGradient>
                      </defs>
                      <rect fill={`url(#cf-grad-${idx})`} width="20" height="20" />
                      <line x1="0" y1="0" x2="20" y2="20" stroke="white" strokeWidth="0.5" opacity="0.5" />
                      <line x1="20" y1="0" x2="0" y2="20" stroke="white" strokeWidth="0.5" opacity="0.5" />
                    </svg>
                  </div>
                ))}

                {/* Render clips */}
                {clips.map((clip) => {
                  const isDragging = draggingClip?.clipId === clip.id;
                  const isResizing = resizingClip?.clipId === clip.id;
                  const showPreview = isDragging || isResizing;

                  const displayStartTime =
                    showPreview && previewPosition ? previewPosition.startTime : clip.startTime;
                  const displayEndTime =
                    showPreview && previewPosition
                      ? previewPosition.endTime
                      : clip.startTime + clip.duration;
                  const displayDuration = displayEndTime - displayStartTime;

                  return (
                    <div
                      key={clip.id}
                      className={`absolute top-1 bottom-1 rounded overflow-hidden transition-opacity ${
                        isDragging || isResizing
                          ? 'opacity-50 ring-2 ring-white'
                          : 'hover:ring-2 hover:ring-blue-400'
                      }`}
                      style={{
                        left: `${(displayStartTime / duration) * 100}%`,
                        width: `${(displayDuration / duration) * 100}%`,
                        backgroundColor: track.color,
                        cursor: currentTool === 'split' ? 'crosshair' : 'move',
                      }}
                      onMouseDown={(e) => handleClipDragStart(e, clip.id, track.id, clip)}
                      onClick={(e) => handleClipClick(e, clip.id, track.id, clip)}
                      data-testid={`clip-${clip.id}`}
                    >
                      {/* Clip content */}
                      <div className="h-full flex items-center px-2 relative">
                        <div className="text-xs text-white font-medium truncate flex-1">
                          {clip.name}
                        </div>

                        {/* Resize handles - hide when using split or range tool */}
                        {currentTool !== 'split' && currentTool !== 'range' && (
                          <>
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50"
                              onMouseDown={(e) =>
                                handleResizeStart(e, clip.id, track.id, 'start', clip)
                              }
                              data-testid={`clip-${clip.id}-resize-start`}
                            />
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50"
                              onMouseDown={(e) => handleResizeStart(e, clip.id, track.id, 'end', clip)}
                              data-testid={`clip-${clip.id}-resize-end`}
                            />
                          </>
                        )}
                      </div>

                      {/* Waveform placeholder */}
                      <div className="absolute inset-0 opacity-20 pointer-events-none">
                        <div className="h-full flex items-center justify-around px-1">
                          {Array.from({ length: 20 }).map((_, i) => (
                            <div
                              key={i}
                              className="w-0.5 bg-white"
                              style={{ height: `${30 + Math.random() * 70}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Snap indicator */}
      {snapEnabled && (draggingClip || resizingClip) && (
        <div className="absolute bottom-0 right-0 bg-blue-500 text-white text-xs px-2 py-1 rounded-tl z-20">
          Snap: {snapInterval}s
        </div>
      )}
    </div>
  );
}
