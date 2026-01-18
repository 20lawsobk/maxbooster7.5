import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useStudioStore } from '@/lib/studioStore';
import { 
  MousePointer2, 
  Maximize2, 
  Scissors, 
  Move, 
  Pencil, 
  PenTool,
  Eraser,
  Maximize,
  Target,
  Trash2,
  Zap 
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AudioClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  filePath?: string;
  gain?: number;
  offset?: number;
  syncOffset?: number; // Seconds from clip start where the sync point is
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
    updates: { startTime?: number; duration?: number; syncOffset?: number }
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
    clearRangeSelection,
    projectDuration,
    projectEndMarker,
    expandTimelineIfNeeded,
    fitTimelineToContents,
    autoExpandEnabled,
    autoscrollPaused,
    pauseAutoscroll,
    isAutoscrollActive,
    adaptiveSnapEnabled,
    showSyncPoints,
    translucentEventsEnabled,
    getAdaptiveSnapInterval
  } = useStudioStore();
  
  // Use project duration for infinite timeline, fallback to prop
  const effectiveDuration = projectDuration || duration;
  
  const [numerator] = (timeSignature || '4/4').split('/').map(Number);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Sync Point Dialog State
  const [syncPointDialogOpen, setSyncPointDialogOpen] = useState(false);
  const [syncPointEditClip, setSyncPointEditClip] = useState<{
    clipId: string;
    trackId: string;
    clipDuration: number;
    currentSyncOffset: number;
  } | null>(null);
  const [syncPointInputValue, setSyncPointInputValue] = useState('');

  const timelineRef = useRef<HTMLDivElement>(null);
  const trackLanesRef = useRef<HTMLDivElement>(null);

  // Calculate total bars based on project duration and tempo
  // At 120 BPM with 4/4, one bar = 2 seconds
  const beatsPerBar = numerator;
  const { tempo } = useStudioStore();
  const secondsPerBeat = 60 / tempo;
  const secondsPerBar = secondsPerBeat * beatsPerBar;
  const totalBars = Math.ceil(effectiveDuration / secondsPerBar);
  
  // Virtualized timeline markers - only calculate visible range for efficiency
  const timelineMarkers = useMemo(
    () => {
      // Calculate total beats based on duration (for efficiency at massive lengths)
      const maxBeats = Math.min(totalBars * beatsPerBar, 10000); // Cap for performance
      
      return Array.from({ length: maxBeats }).map((_, i) => {
        const isBar = i % beatsPerBar === 0;
        return {
          index: i,
          isBar,
          label: isBar ? Math.floor(i / beatsPerBar) + 1 : '',
        };
      });
    },
    [beatsPerBar, totalBars]
  );

  const gridLines = useMemo(() => {
    if (!gridVisible) return [];
    
    const lines: { position: number; type: 'bar' | 'beat' | 'subdivision' }[] = [];
    const subdivisionsPerBeat = gridDivision;
    // Use total beats from project duration for infinite timeline support
    const totalBeatsInProject = totalBars * beatsPerBar;
    // Cap at 5000 for performance (still plenty for a multi-hour project)
    const maxBeats = Math.min(totalBeatsInProject, 5000);
    
    for (let beat = 0; beat <= maxBeats; beat++) {
      const isBar = beat % beatsPerBar === 0;
      const position = (beat / maxBeats) * 100;
      
      lines.push({
        position,
        type: isBar ? 'bar' : 'beat',
      });
      
      // Only add subdivisions at lower beat counts for performance
      if (subdivisionsPerBeat > 1 && maxBeats <= 500) {
        for (let sub = 1; sub < subdivisionsPerBeat; sub++) {
          const subPosition = ((beat + sub / subdivisionsPerBeat) / maxBeats) * 100;
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
  }, [gridVisible, gridDivision, beatsPerBar, totalBars]);

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
      return (pixels / width) * effectiveDuration;
    },
    [effectiveDuration]
  );

  const timeToPixels = useCallback(
    (time: number): number => {
      if (!timelineRef.current) return 0;
      const width = timelineRef.current.offsetWidth;
      return (time / effectiveDuration) * width;
    },
    [effectiveDuration]
  );

  const snapToGrid = useCallback(
    (time: number, syncOffset?: number): number => {
      if (!snapEnabled) return time;
      
      const effectiveSnapInterval = adaptiveSnapEnabled 
        ? getAdaptiveSnapInterval(zoom) 
        : snapInterval;
      
      if (syncOffset !== undefined && syncOffset > 0) {
        const syncPointTime = time + syncOffset;
        const snappedSyncPoint = Math.round(syncPointTime / effectiveSnapInterval) * effectiveSnapInterval;
        return snappedSyncPoint - syncOffset;
      }
      
      return Math.round(time / effectiveSnapInterval) * effectiveSnapInterval;
    },
    [snapEnabled, snapInterval, adaptiveSnapEnabled, getAdaptiveSnapInterval, zoom]
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

      newStartTime = snapToGrid(newStartTime, clip.syncOffset);
      newStartTime = Math.max(0, Math.min(newStartTime, effectiveDuration - clipDuration));

      const newEndTime = newStartTime + clipDuration;

      setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
    },
    [draggingClip, trackClips, pixelsToTime, snapToGrid, dragOffset, effectiveDuration]
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
        newEndTime = Math.max(clip.startTime + 0.1, Math.min(mouseTime, effectiveDuration));
      }

      setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
    },
    [resizingClip, trackClips, pixelsToTime, snapToGrid, effectiveDuration]
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
      endTime = Math.max(0, Math.min(endTime, effectiveDuration));
      
      setLocalRangeEnd(endTime);
    },
    [isRangeSelecting, rangeStartPos, pixelsToTime, snapToGrid, effectiveDuration]
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

  // Smart Re-engagement: Detect manual scroll during playback and pause autoscroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = () => {
      // User is manually scrolling during playback - pause autoscroll
      if (isPlaying && autoscrollMode !== 'off' && !autoscrollPaused) {
        isUserScrollingRef.current = true;
        pauseAutoscroll();
        
        // Clear any existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        
        // Reset the user scrolling flag after a short delay
        scrollTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 150);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [isPlaying, autoscrollMode, autoscrollPaused, pauseAutoscroll]);

  // Hardware-accelerated smooth autoscroll using requestAnimationFrame
  useEffect(() => {
    // Check if autoscroll is active (not off and not paused by user)
    const shouldAutoscroll = isPlaying && autoscrollMode !== 'off' && !autoscrollPaused;
    
    if (!shouldAutoscroll || !scrollContainerRef.current) {
      // Cancel any pending animation frame when not playing
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // Check if timeline needs expansion (Studio One style dynamic allocation)
    if (autoExpandEnabled) {
      expandTimelineIfNeeded(currentTime);
    }

    const container = scrollContainerRef.current;
    const containerWidth = container.clientWidth;
    const scrollableWidth = container.scrollWidth;
    const playheadPosition = (currentTime / effectiveDuration) * scrollableWidth;

    let targetScroll: number;

    switch (autoscrollMode) {
      case 'turnover': {
        const currentScroll = container.scrollLeft;
        const visibleEnd = currentScroll + containerWidth;
        const pageMargin = containerWidth * 0.1;
        
        if (playheadPosition > visibleEnd - pageMargin) {
          targetScroll = playheadPosition - pageMargin;
        } else if (playheadPosition < currentScroll) {
          targetScroll = Math.max(0, playheadPosition - pageMargin);
        } else {
          return; // No scroll needed
        }
        break;
      }
      case 'continuous-centered': {
        // Playhead stays centered - timeline moves behind it
        targetScroll = Math.max(0, playheadPosition - containerWidth / 2);
        break;
      }
      case 'continuous-left': {
        // Playhead stays on left side (10% margin) - maximize future visibility
        const leftMargin = containerWidth * 0.1;
        targetScroll = Math.max(0, playheadPosition - leftMargin);
        break;
      }
      default:
        return;
    }

    // Use requestAnimationFrame for hardware-accelerated smooth scrolling
    const smoothScroll = () => {
      if (!scrollContainerRef.current) return;
      
      const currentScroll = scrollContainerRef.current.scrollLeft;
      const diff = targetScroll - currentScroll;
      
      // Smooth interpolation factor (higher = faster, lower = smoother)
      const smoothFactor = autoscrollMode === 'turnover' ? 1.0 : 0.15;
      
      if (Math.abs(diff) < 0.5) {
        // Close enough, snap to target
        scrollContainerRef.current.scrollLeft = targetScroll;
      } else if (autoscrollMode === 'turnover') {
        // Turnover mode: instant page jump
        scrollContainerRef.current.scrollLeft = targetScroll;
      } else {
        // Continuous modes: smooth interpolation for "moving background" effect
        const newScroll = currentScroll + diff * smoothFactor;
        scrollContainerRef.current.scrollLeft = newScroll;
        
        // Continue animation if still far from target
        if (Math.abs(targetScroll - newScroll) > 0.5) {
          animationFrameRef.current = requestAnimationFrame(smoothScroll);
        }
      }
    };

    // Cancel previous animation frame before starting new one
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(smoothScroll);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [currentTime, isPlaying, autoscrollMode, autoscrollPaused, effectiveDuration, autoExpandEnabled, expandTimelineIfNeeded]);

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

  // Handler for Fit Timeline to Contents
  const handleFitToContents = useCallback(() => {
    // Find the furthest content end time from clips
    let maxEndTime = 0;
    trackClips.forEach((clips) => {
      clips.forEach((clip) => {
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd > maxEndTime) maxEndTime = clipEnd;
      });
    });
    
    // Default to current time if no clips, or minimum 60 seconds
    const contentEnd = Math.max(maxEndTime, currentTime, 60);
    fitTimelineToContents(contentEnd);
  }, [trackClips, currentTime, fitTimelineToContents]);

  // Sync Point Context Menu Handlers
  const handleOpenSyncPointDialog = useCallback(
    (clipId: string, trackId: string, clipDuration: number, currentSyncOffset: number) => {
      setSyncPointEditClip({ clipId, trackId, clipDuration, currentSyncOffset });
      setSyncPointInputValue(currentSyncOffset.toFixed(3));
      setSyncPointDialogOpen(true);
    },
    []
  );

  const handleSetSyncPoint = useCallback(() => {
    if (!syncPointEditClip || !onClipUpdate) return;
    
    const syncOffset = parseFloat(syncPointInputValue) || 0;
    const clampedOffset = Math.max(0, Math.min(syncOffset, syncPointEditClip.clipDuration));
    
    onClipUpdate(syncPointEditClip.trackId, syncPointEditClip.clipId, {
      syncOffset: clampedOffset,
    });
    
    setSyncPointDialogOpen(false);
    setSyncPointEditClip(null);
  }, [syncPointEditClip, syncPointInputValue, onClipUpdate]);

  const handleClearSyncPoint = useCallback(
    (clipId: string, trackId: string) => {
      if (!onClipUpdate) return;
      onClipUpdate(trackId, clipId, { syncOffset: 0 });
    },
    [onClipUpdate]
  );

  return (
    <>
    {/* Sync Point Dialog */}
    <Dialog open={syncPointDialogOpen} onOpenChange={setSyncPointDialogOpen}>
      <DialogContent className="sm:max-w-[320px]" style={{ background: 'var(--studio-bg-deep)', border: '1px solid var(--studio-border)' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: 'var(--studio-text)' }}>
            <Target className="h-4 w-4 text-yellow-500" />
            Set Sync Point
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sync-offset" style={{ color: 'var(--studio-text-subtle)' }}>
              Sync Offset (seconds from clip start)
            </Label>
            <Input
              id="sync-offset"
              type="number"
              step="0.001"
              min="0"
              max={syncPointEditClip?.clipDuration || 100}
              value={syncPointInputValue}
              onChange={(e) => setSyncPointInputValue(e.target.value)}
              className="font-mono"
              style={{ 
                background: 'var(--studio-surface)', 
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-text)'
              }}
            />
            {syncPointEditClip && (
              <p className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                Clip duration: {syncPointEditClip.clipDuration.toFixed(3)}s
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setSyncPointDialogOpen(false)}
            style={{ 
              background: 'var(--studio-surface)', 
              borderColor: 'var(--studio-border)',
              color: 'var(--studio-text)'
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSetSyncPoint}
            style={{ 
              background: '#f59e0b', 
              color: '#000'
            }}
          >
            Set Sync Point
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div 
      ref={scrollContainerRef}
      className="border-b overflow-x-auto relative" 
      style={{ 
        borderColor: 'var(--studio-border)',
        // Hardware acceleration for smooth scrolling
        willChange: 'scroll-position',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
    >
      {/* Tool Indicator Badge & Timeline Controls */}
      <div className="absolute top-1 left-1 z-30 flex items-center gap-2">
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
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
        
        {/* Fit Timeline to Contents Button (Studio One style) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleFitToContents}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-blue-600/20 transition-colors"
              style={{
                backgroundColor: 'var(--studio-bg-deep)',
                color: 'var(--studio-text-muted)',
                border: '1px solid var(--studio-border)',
              }}
              data-testid="fit-timeline-button"
            >
              <Maximize className="w-3 h-3" />
              <span>Fit</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Fit Timeline to Contents
          </TooltipContent>
        </Tooltip>
        
        {/* Duration Indicator */}
        <div
          className="px-1.5 py-0.5 rounded text-[10px] font-mono"
          style={{
            backgroundColor: 'var(--studio-bg-deep)',
            color: 'var(--studio-text-subtle)',
            border: '1px solid var(--studio-border)',
          }}
          data-testid="duration-indicator"
        >
          {totalBars} bars • {Math.floor(effectiveDuration / 60)}:{String(Math.floor(effectiveDuration % 60)).padStart(2, '0')}
        </div>
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
            const clickTime = (clickX / rect.width) * effectiveDuration;
            onTimeChange(Math.max(0, Math.min(effectiveDuration, clickTime)));
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
              left: `${(loopStart / effectiveDuration) * 100}%`,
              width: `${((loopEnd - loopStart) / effectiveDuration) * 100}%`,
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
              left: `${(rangeStart / effectiveDuration) * 100}%`,
              width: `${((rangeEnd - rangeStart) / effectiveDuration) * 100}%`,
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
              left: `${(splitPreviewTime / effectiveDuration) * 100}%`,
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
              left: `${(currentTime / effectiveDuration) * 100}%`,
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
                left: `${(rangeStart / effectiveDuration) * 100}%`,
                width: `${((rangeEnd - rangeStart) / effectiveDuration) * 100}%`,
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
                left: `${(splitPreviewTime / effectiveDuration) * 100}%`,
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
                      left: `${(cf.startTime / effectiveDuration) * 100}%`,
                      width: `${((cf.endTime - cf.startTime) / effectiveDuration) * 100}%`,
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
                  const hasSyncPoint = clip.syncOffset !== undefined && clip.syncOffset > 0;

                  return (
                    <ContextMenu key={clip.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={`absolute top-1 bottom-1 rounded overflow-hidden transition-opacity ${
                            isDragging || isResizing
                              ? 'opacity-50 ring-2 ring-white'
                              : 'hover:ring-2 hover:ring-blue-400'
                          }`}
                          style={{
                            left: `${(displayStartTime / effectiveDuration) * 100}%`,
                            width: `${(displayDuration / effectiveDuration) * 100}%`,
                            backgroundColor: translucentEventsEnabled 
                              ? `${track.color}99` 
                              : track.color,
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

                          {/* Sync Point Marker (yellow diamond) */}
                          {showSyncPoints && hasSyncPoint && clip.duration > 0 && (() => {
                            const syncRatio = Math.max(0, Math.min(1, (clip.syncOffset ?? 0) / clip.duration));
                            if (!isFinite(syncRatio)) return null;
                            return (
                              <div
                                className="absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none"
                                style={{
                                  left: `${syncRatio * 100}%`,
                                }}
                                data-testid={`sync-point-${clip.id}`}
                              >
                                <div
                                  className="w-2.5 h-2.5 rotate-45 border-2"
                                  style={{
                                    backgroundColor: '#fbbf24',
                                    borderColor: '#f59e0b',
                                    boxShadow: '0 0 4px rgba(251, 191, 36, 0.6)',
                                  }}
                                />
                              </div>
                            );
                          })()}

                          {/* Waveform placeholder */}
                          <div 
                            className="absolute inset-0 pointer-events-none"
                            style={{ opacity: translucentEventsEnabled ? 0.5 : 0.2 }}
                          >
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
                      </ContextMenuTrigger>
                      <ContextMenuContent 
                        className="w-48"
                        style={{
                          background: 'var(--studio-bg-deep)',
                          borderColor: 'var(--studio-border)',
                        }}
                      >
                        <ContextMenuItem
                          onClick={() => handleOpenSyncPointDialog(clip.id, track.id, clip.duration, clip.syncOffset || 0)}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Target className="h-4 w-4 text-yellow-500" />
                          <span>Set Sync Point</span>
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => handleClearSyncPoint(clip.id, track.id)}
                          disabled={!hasSyncPoint}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                          <span>Clear Sync Point</span>
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          disabled
                          className="flex items-center gap-2 cursor-not-allowed opacity-50"
                        >
                          <Zap className="h-4 w-4 text-blue-400" />
                          <span>Snap to Nearest Transient</span>
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
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
          Snap: {(adaptiveSnapEnabled ? getAdaptiveSnapInterval(zoom) : snapInterval).toFixed(3)}s
          {adaptiveSnapEnabled && ' (adaptive)'}
        </div>
      )}

      {/* Translucent Mode Visual Indicator */}
      {translucentEventsEnabled && (
        <div 
          className="absolute top-1 right-1 z-30 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{
            backgroundColor: 'rgba(139, 92, 246, 0.2)',
            color: '#a78bfa',
            border: '1px solid rgba(139, 92, 246, 0.4)',
          }}
          data-testid="translucent-mode-indicator"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          Translucent
        </div>
      )}
    </div>
    </>
  );
}
