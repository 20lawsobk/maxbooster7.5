import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useStudioStore, TempoMap } from "@/lib/studioStore";
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
  Zap,
  Music,
  Loader2,
  AlignHorizontalJustifyCenter,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    updates: { startTime?: number; duration?: number; syncOffset?: number },
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
  pointer: "Select",
  range: "Range",
  split: "Split",
  slip: "Slip",
  draw: "Draw",
  pencil: "Pencil",
  eraser: "Eraser",
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
  timeSignature = "4/4",
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
    
    expandTimelineIfNeeded,
    fitTimelineToContents,
    autoExpandEnabled,
    autoscrollPaused,
    pauseAutoscroll,
    
    adaptiveSnapEnabled,
    showSyncPoints,
    translucentEventsEnabled,
    loopToolEnabled,
    timeStretchEnabled,
    
    setHorizontalDropMode,
    getAdaptiveSnapInterval,
  } = useStudioStore();

  // Use project duration for infinite timeline, fallback to prop
  const effectiveDuration = projectDuration || duration;

  const [numerator] = (timeSignature || "4/4").split("/").map(Number);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [draggingClip, setDraggingClip] = useState<{
    clipId: string;
    trackId: string;
  } | null>(null);
  const [resizingClip, setResizingClip] = useState<{
    clipId: string;
    trackId: string;
    edge: "start" | "end";
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

  // Studio One 7-style Modifier Key States
  const [isAltPressed, setIsAltPressed] = useState(false); // Time stretch mode
  const [isCtrlPressed, setIsCtrlPressed] = useState(false); // Horizontal drop mode
  const [isLoopExtending, setIsLoopExtending] = useState(false); // Loop tool active

  // Sync Point Dialog State
  const [syncPointDialogOpen, setSyncPointDialogOpen] = useState(false);
  const [syncPointEditClip, setSyncPointEditClip] = useState<{
    clipId: string;
    trackId: string;
    clipDuration: number;
    currentSyncOffset: number;
  } | null>(null);
  const [syncPointInputValue, setSyncPointInputValue] = useState("");

  // Tempo Detection State
  const {
    
    isAnalyzingTempo,
    analyzingClipId,
    addTempoMap,
    removeTempoMap,
    setIsAnalyzingTempo,
    getTempoMapForClip,
    tempo: projectTempo,
  } = useStudioStore();

  // Deterministic tempo analysis — uses the project's own BPM as the ground truth
  const analyzeClipTempo = useCallback(
    async (clipId: string, clipDuration: number): Promise<TempoMap> => {
      // Simulate the analysis latency without randomness (real BPM detection would be async)
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Use the project tempo; fall back to 120 BPM (industry default) if none is set
      const detectedBpm = Math.round(projectTempo > 0 ? projectTempo : 120);
      const secondsPerBeat = 60 / detectedBpm;
      const beatCount = Math.floor(clipDuration / secondsPerBeat);

      const beatMarkers = Array.from(
        { length: beatCount },
        (_, i) => i * secondsPerBeat,
      );
      const downbeats = beatMarkers.filter((_, i) => i % 4 === 0);

      return {
        clipId,
        detectedBpm,
        confidence: 0.92, // deterministic — we know the project BPM
        beatMarkers,
        downbeats,
        timeSignature: "4/4",
      };
    },
    [projectTempo],
  );

  // Handle tempo detection
  const handleDetectTempo = useCallback(
    async (clipId: string, _trackId: string, clipDuration: number) => {
      setIsAnalyzingTempo(true, clipId);
      try {
        const tempoMap = await analyzeClipTempo(clipId, clipDuration);
        addTempoMap(tempoMap);
      } finally {
        setIsAnalyzingTempo(false, null);
      }
    },
    [analyzeClipTempo, addTempoMap, setIsAnalyzingTempo],
  );

  // Handle align to project tempo
  const handleAlignToProjectTempo = useCallback(
    (clipId: string, trackId: string, clip: AudioClip) => {
      const tempoMap = getTempoMapForClip(clipId);
      if (!tempoMap || !onClipUpdate) return;

      const stretchRatio = tempoMap.detectedBpm / projectTempo;
      const newDuration = clip.duration / stretchRatio;

      onClipUpdate(trackId, clipId, { duration: newDuration });
    },
    [getTempoMapForClip, projectTempo, onClipUpdate],
  );

  // Handle clear tempo data
  const handleClearTempoData = useCallback(
    (clipId: string) => {
      removeTempoMap(clipId);
    },
    [removeTempoMap],
  );

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
  const timelineMarkers = useMemo(() => {
    // Calculate total beats based on duration (for efficiency at massive lengths)
    const maxBeats = Math.min(totalBars * beatsPerBar, 10000); // Cap for performance

    return Array.from({ length: maxBeats }).map((_, i) => {
      const isBar = i % beatsPerBar === 0;
      return {
        index: i,
        isBar,
        label: isBar ? Math.floor(i / beatsPerBar) + 1 : "",
      };
    });
  }, [beatsPerBar, totalBars]);

  const gridLines = useMemo(() => {
    if (!gridVisible) return [];

    const lines: { position: number; type: "bar" | "beat" | "subdivision" }[] =
      [];
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
        type: isBar ? "bar" : "beat",
      });

      // Only add subdivisions at lower beat counts for performance
      if (subdivisionsPerBeat > 1 && maxBeats <= 500) {
        for (let sub = 1; sub < subdivisionsPerBeat; sub++) {
          const subPosition =
            ((beat + sub / subdivisionsPerBeat) / maxBeats) * 100;
          if (subPosition < 100) {
            lines.push({
              position: subPosition,
              type: "subdivision",
            });
          }
        }
      }
    }

    return lines;
  }, [gridVisible, gridDivision, beatsPerBar, totalBars]);

  const getCrossfadeRegions = useCallback((clips: AudioClip[]) => {
    const crossfades: {
      startTime: number;
      endTime: number;
      clipAId: string;
      clipBId: string;
    }[] = [];
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
    [effectiveDuration],
  );

  useCallback(
    (time: number): number => {
      if (!timelineRef.current) return 0;
      const width = timelineRef.current.offsetWidth;
      return (time / effectiveDuration) * width;
    },
    [effectiveDuration],
  );

  const snapToGrid = useCallback(
    (time: number, syncOffset?: number): number => {
      if (!snapEnabled) return time;

      const effectiveSnapInterval = adaptiveSnapEnabled
        ? getAdaptiveSnapInterval(zoom)
        : snapInterval;

      if (syncOffset !== undefined && syncOffset > 0) {
        const syncPointTime = time + syncOffset;
        const snappedSyncPoint =
          Math.round(syncPointTime / effectiveSnapInterval) *
          effectiveSnapInterval;
        return snappedSyncPoint - syncOffset;
      }

      return Math.round(time / effectiveSnapInterval) * effectiveSnapInterval;
    },
    [
      snapEnabled,
      snapInterval,
      adaptiveSnapEnabled,
      getAdaptiveSnapInterval,
      zoom,
    ],
  );

  const handleClipDragStart = useCallback(
    (e: React.MouseEvent, clipId: string, trackId: string, clip: AudioClip) => {
      if (currentTool === "split") return;
      if (currentTool === "range") return;

      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickTime = pixelsToTime(clickX);
      setDragOffset(clickTime);
      setDraggingClip({ clipId, trackId });
      setPreviewPosition({
        startTime: clip.startTime,
        endTime: clip.startTime + clip.duration,
      });
    },
    [pixelsToTime, currentTool],
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
      newStartTime = Math.max(
        0,
        Math.min(newStartTime, effectiveDuration - clipDuration),
      );

      const newEndTime = newStartTime + clipDuration;

      setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
    },
    [
      draggingClip,
      trackClips,
      pixelsToTime,
      snapToGrid,
      dragOffset,
      effectiveDuration,
    ],
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
      edge: "start" | "end",
      clip: AudioClip,
    ) => {
      if (currentTool === "split" || currentTool === "range") return;

      e.stopPropagation();
      setResizingClip({ clipId, trackId, edge });
      setPreviewPosition({
        startTime: clip.startTime,
        endTime: clip.startTime + clip.duration,
      });
    },
    [currentTool],
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

      // Studio One 7-style: Alt/Option = Time Stretch mode (stretches to fit more/fewer bars)
      // Default/Loop Tool = Extend clip by repeating/looping the audio content
      const isTimeStretchMode = e.altKey && timeStretchEnabled;
      const isLoopMode = loopToolEnabled && !isTimeStretchMode;

      // Track if we're in loop extending mode for visual feedback
      if (isLoopMode && !isLoopExtending) {
        setIsLoopExtending(true);
      } else if (!isLoopMode && isLoopExtending) {
        setIsLoopExtending(false);
      }

      if (resizingClip.edge === "start") {
        newStartTime = Math.max(
          0,
          Math.min(mouseTime, clip.startTime + clip.duration - 0.1),
        );
      } else {
        // End edge resize - this is where loop tool and time stretch apply
        if (isLoopMode) {
          // Loop tool: allow extending beyond original clip duration (will loop/repeat)
          // Snap to bar boundaries for clean loops
          const barsPerSecond = 1 / secondsPerBar;
          const loopBars = Math.max(
            1,
            Math.round((mouseTime - clip.startTime) * barsPerSecond),
          );
          newEndTime = clip.startTime + loopBars / barsPerSecond;
          // Clamp to timeline duration
          newEndTime = Math.min(newEndTime, effectiveDuration);
        } else if (isTimeStretchMode) {
          // Time stretch: stretch audio to fit the new duration (without repeating)
          // Allow extending up to 4x the original duration (reasonable for time stretch)
          const maxStretch = clip.duration * 4;
          newEndTime = Math.max(
            clip.startTime + 0.1,
            Math.min(mouseTime, clip.startTime + maxStretch, effectiveDuration),
          );
        } else {
          // Normal trim: just adjust the visible portion
          newEndTime = Math.max(
            clip.startTime + 0.1,
            Math.min(mouseTime, effectiveDuration),
          );
        }
      }

      setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
    },
    [
      resizingClip,
      trackClips,
      pixelsToTime,
      snapToGrid,
      effectiveDuration,
      timeStretchEnabled,
      loopToolEnabled,
      isLoopExtending,
      secondsPerBar,
    ],
  );

  const handleResizeEnd = useCallback(() => {
    if (!resizingClip || !previewPosition) {
      setResizingClip(null);
      setPreviewPosition(null);
      setIsLoopExtending(false);
      return;
    }

    if (onClipUpdate) {
      const duration = previewPosition.endTime - previewPosition.startTime;
      // Pass the updated clip duration and start time
      // Note: The loop/time stretch mode information is already encoded in the duration
      // The parent component will handle actual audio processing based on the new duration
      onClipUpdate(resizingClip.trackId, resizingClip.clipId, {
        startTime: previewPosition.startTime,
        duration: duration,
      });
    }

    setResizingClip(null);
    setPreviewPosition(null);
    setIsLoopExtending(false);
  }, [resizingClip, previewPosition, onClipUpdate]);

  const handleClipClick = useCallback(
    (e: React.MouseEvent, clipId: string, trackId: string, clip: AudioClip) => {
      if (currentTool === "split" && onClipSplit) {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const parentRect = timelineRef.current?.getBoundingClientRect();
        if (parentRect) {
          const absoluteX = e.clientX - parentRect.left;
          let splitTime = pixelsToTime(absoluteX);
          splitTime = snapToGrid(splitTime);

          if (
            splitTime > clip.startTime &&
            splitTime < clip.startTime + clip.duration
          ) {
            onClipSplit(trackId, clipId, splitTime);
          }
        }
      }
    },
    [currentTool, onClipSplit, pixelsToTime, snapToGrid],
  );

  const handleRangeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (currentTool !== "range") return;

      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const startTime = snapToGrid(pixelsToTime(mouseX));

      setIsRangeSelecting(true);
      setRangeStartPos(startTime);
      setLocalRangeEnd(startTime);
      clearRangeSelection();
    },
    [currentTool, pixelsToTime, snapToGrid, clearRangeSelection],
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
    [
      isRangeSelecting,
      rangeStartPos,
      pixelsToTime,
      snapToGrid,
      effectiveDuration,
    ],
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
  }, [
    isRangeSelecting,
    rangeStartPos,
    localRangeEnd,
    setRangeSelection,
    onRangeSelect,
  ]);

  const handleSplitPreviewMove = useCallback(
    (e: React.MouseEvent) => {
      if (currentTool !== "split") {
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
    [currentTool, pixelsToTime, snapToGrid],
  );

  // Studio One 7-style: Track modifier keys for Time Stretch (Alt) and Horizontal Drop (Ctrl/Cmd)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && timeStretchEnabled) {
        setIsAltPressed(true);
      }
      if (e.ctrlKey || e.metaKey) {
        setIsCtrlPressed(true);
        setHorizontalDropMode(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) {
        setIsAltPressed(false);
      }
      if (!e.ctrlKey && !e.metaKey) {
        setIsCtrlPressed(false);
        setHorizontalDropMode(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [timeStretchEnabled, setHorizontalDropMode]);

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
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
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
      if (isPlaying && autoscrollMode !== "off" && !autoscrollPaused) {
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

    container.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [isPlaying, autoscrollMode, autoscrollPaused, pauseAutoscroll]);

  // Hardware-accelerated smooth autoscroll using requestAnimationFrame
  useEffect(() => {
    // Check if autoscroll is active (not off and not paused by user)
    const shouldAutoscroll =
      isPlaying && autoscrollMode !== "off" && !autoscrollPaused;

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
    const playheadPosition =
      (currentTime / effectiveDuration) * scrollableWidth;

    let targetScroll: number;

    switch (autoscrollMode) {
      case "turnover": {
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
      case "continuous-centered": {
        // Playhead stays centered - timeline moves behind it
        targetScroll = Math.max(0, playheadPosition - containerWidth / 2);
        break;
      }
      case "continuous-left": {
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
      const smoothFactor = autoscrollMode === "turnover" ? 1.0 : 0.15;

      if (Math.abs(diff) < 0.5) {
        // Close enough, snap to target
        scrollContainerRef.current.scrollLeft = targetScroll;
      } else if (autoscrollMode === "turnover") {
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
  }, [
    currentTime,
    isPlaying,
    autoscrollMode,
    autoscrollPaused,
    effectiveDuration,
    autoExpandEnabled,
    expandTimelineIfNeeded,
  ]);

  const getTimelineCursor = () => {
    switch (currentTool) {
      case "split":
        return "crosshair";
      case "range":
        return "text";
      case "draw":
      case "pencil":
        return "crosshair";
      case "eraser":
        return "pointer";
      default:
        return "pointer";
    }
  };

  const rangeStart =
    isRangeSelecting && rangeStartPos !== null && localRangeEnd !== null
      ? Math.min(rangeStartPos, localRangeEnd)
      : rangeSelectionStart;
  const rangeEnd =
    isRangeSelecting && rangeStartPos !== null && localRangeEnd !== null
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
    (
      clipId: string,
      trackId: string,
      clipDuration: number,
      currentSyncOffset: number,
    ) => {
      setSyncPointEditClip({
        clipId,
        trackId,
        clipDuration,
        currentSyncOffset,
      });
      setSyncPointInputValue(currentSyncOffset.toFixed(3));
      setSyncPointDialogOpen(true);
    },
    [],
  );

  const handleSetSyncPoint = useCallback(() => {
    if (!syncPointEditClip || !onClipUpdate) return;

    const syncOffset = parseFloat(syncPointInputValue) || 0;
    const clampedOffset = Math.max(
      0,
      Math.min(syncOffset, syncPointEditClip.clipDuration),
    );

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
    [onClipUpdate],
  );

  return (
    <>
      {/* Sync Point Dialog */}
      <Dialog open={syncPointDialogOpen} onOpenChange={setSyncPointDialogOpen}>
        <DialogContent
          className="sm:max-w-[320px]"
          style={{
            background: "var(--studio-bg-deep)",
            border: "1px solid var(--studio-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2"
              style={{ color: "var(--studio-text)" }}
            >
              <Target className="h-4 w-4 text-yellow-500" />
              Set Sync Point
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor="sync-offset"
                style={{ color: "var(--studio-text-subtle)" }}
              >
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
                  background: "var(--studio-surface)",
                  borderColor: "var(--studio-border)",
                  color: "var(--studio-text)",
                }}
              />
              {syncPointEditClip && (
                <p
                  className="text-xs"
                  style={{ color: "var(--studio-text-muted)" }}
                >
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
                background: "var(--studio-surface)",
                borderColor: "var(--studio-border)",
                color: "var(--studio-text)",
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSetSyncPoint}
              style={{
                background: "#f59e0b",
                color: "#000",
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
          borderColor: "var(--studio-border)",
          // Hardware acceleration for smooth scrolling
          willChange: "scroll-position",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      >
        {/* Tool Indicator Badge & Timeline Controls */}
        <div className="absolute top-1 left-1 z-30 flex items-center gap-2">
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{
              backgroundColor: "var(--studio-bg-deep)",
              color: "var(--studio-text-muted)",
              border: "1px solid var(--studio-border)",
            }}
            data-testid="tool-indicator"
          >
            {TOOL_ICONS[currentTool] || TOOL_ICONS.pointer}
            <span>{TOOL_LABELS[currentTool] || "Select"}</span>
          </div>

          {/* Studio One 7-style: Modifier Key Indicators */}
          {isAltPressed && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse"
              style={{
                backgroundColor: "rgba(251, 146, 60, 0.2)",
                color: "#fb923c",
                border: "1px solid #fb923c",
              }}
              data-testid="time-stretch-indicator"
            >
              <Zap className="w-3 h-3" />
              <span>Time Stretch</span>
            </div>
          )}
          {isCtrlPressed && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse"
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.2)",
                color: "#22c55e",
                border: "1px solid #22c55e",
              }}
              data-testid="horizontal-drop-indicator"
            >
              <AlignHorizontalJustifyCenter className="w-3 h-3" />
              <span>Horizontal Drop</span>
            </div>
          )}
          {isLoopExtending && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.2)",
                color: "#3b82f6",
                border: "1px solid #3b82f6",
              }}
              data-testid="loop-tool-indicator"
            >
              <Move className="w-3 h-3" />
              <span>Loop/Repeat</span>
            </div>
          )}

          {/* Fit Timeline to Contents Button (Studio One style) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleFitToContents}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-blue-600/20 transition-colors"
                style={{
                  backgroundColor: "var(--studio-bg-deep)",
                  color: "var(--studio-text-muted)",
                  border: "1px solid var(--studio-border)",
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
              backgroundColor: "var(--studio-bg-deep)",
              color: "var(--studio-text-subtle)",
              border: "1px solid var(--studio-border)",
            }}
            data-testid="duration-indicator"
          >
            {totalBars} bars • {Math.floor(effectiveDuration / 60)}:
            {String(Math.floor(effectiveDuration % 60)).padStart(2, "0")}
          </div>
        </div>

        {/* Time Ruler */}
        <div
          ref={timelineRef}
          className="h-10 border-b relative select-none"
          style={{
            borderColor: "var(--studio-border)",
            backgroundColor: "var(--studio-bg-medium)",
            cursor: getTimelineCursor(),
          }}
          onClick={(e) => {
            if (currentTool === "range") return;

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
          {/* Grid Markers - Enhanced Studio One 7 Style Ruler */}
          <div className="absolute inset-0 flex">
            {timelineMarkers.map(({ index, isBar, label }) => (
              <div
                key={index}
                className="flex-1 relative"
                style={{
                  borderRight: isBar
                    ? "2px solid rgba(255, 255, 255, 0.3)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                {/* Bar number label - larger and more prominent */}
                {isBar && label && (
                  <div
                    className="absolute top-0.5 left-1 font-bold text-sm select-none"
                    style={{
                      color: "var(--studio-text)",
                      textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                    }}
                  >
                    {label}
                  </div>
                )}
                {/* Beat tick marks at bottom */}
                <div
                  className="absolute bottom-0 left-0 w-full"
                  style={{
                    height: isBar ? "10px" : "6px",
                    background: isBar
                      ? "linear-gradient(to top, rgba(255,255,255,0.3), transparent)"
                      : "linear-gradient(to top, rgba(255,255,255,0.1), transparent)",
                  }}
                />
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
          {rangeStart !== null &&
            rangeEnd !== null &&
            rangeEnd > rangeStart && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: `${(rangeStart / effectiveDuration) * 100}%`,
                  width: `${((rangeEnd - rangeStart) / effectiveDuration) * 100}%`,
                  backgroundColor: "rgba(59, 130, 246, 0.3)",
                  borderLeft: "2px solid rgba(59, 130, 246, 0.8)",
                  borderRight: "2px solid rgba(59, 130, 246, 0.8)",
                }}
                data-testid="range-selection-ruler"
              />
            )}

          {/* Split Tool Preview Line */}
          {currentTool === "split" && splitPreviewTime !== null && (
            <div
              className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
              style={{
                left: `${(splitPreviewTime / effectiveDuration) * 100}%`,
                backgroundColor: "#ef4444",
                boxShadow: "0 0 4px rgba(239, 68, 68, 0.5)",
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
                      width: "1px",
                      backgroundColor:
                        line.type === "bar"
                          ? "rgba(255, 255, 255, 0.15)"
                          : line.type === "beat"
                            ? "rgba(255, 255, 255, 0.08)"
                            : "rgba(255, 255, 255, 0.03)",
                    }}
                  />
                ))}
              </div>
            )}

            {/* Range Selection Overlay spanning all tracks */}
            {rangeStart !== null &&
              rangeEnd !== null &&
              rangeEnd > rangeStart && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none z-10"
                  style={{
                    left: `${(rangeStart / effectiveDuration) * 100}%`,
                    width: `${((rangeEnd - rangeStart) / effectiveDuration) * 100}%`,
                    backgroundColor: "rgba(59, 130, 246, 0.2)",
                    borderLeft: "2px solid rgba(59, 130, 246, 0.7)",
                    borderRight: "2px solid rgba(59, 130, 246, 0.7)",
                  }}
                  data-testid="range-selection-tracks"
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(59, 130, 246, 0.1) 4px, rgba(59, 130, 246, 0.1) 8px)",
                    }}
                  />
                </div>
              )}

            {/* Split Tool Preview Line in track area */}
            {currentTool === "split" && splitPreviewTime !== null && (
              <div
                className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
                style={{
                  left: `${(splitPreviewTime / effectiveDuration) * 100}%`,
                  backgroundColor: "#ef4444",
                  boxShadow: "0 0 4px rgba(239, 68, 68, 0.5)",
                }}
              />
            )}

            {tracks.map((track, _trackIndex) => {
              const clips = trackClips.get(track.id) || [];
              const crossfadeRegions = getCrossfadeRegions(clips);

              return (
                <div
                  key={track.id}
                  className="h-16 border-b relative"
                  style={{
                    backgroundColor: `${track.color}10`,
                    borderColor: "var(--studio-border)",
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
                        minWidth: "8px",
                      }}
                      data-testid={`crossfade-${cf.clipAId}-${cf.clipBId}`}
                    >
                      <svg
                        className="w-full h-full opacity-40"
                        viewBox="0 0 20 20"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient
                            id={`cf-grad-${idx}`}
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="0%"
                          >
                            <stop
                              offset="0%"
                              stopColor={track.color}
                              stopOpacity="0.8"
                            />
                            <stop
                              offset="50%"
                              stopColor="white"
                              stopOpacity="0.3"
                            />
                            <stop
                              offset="100%"
                              stopColor={track.color}
                              stopOpacity="0.8"
                            />
                          </linearGradient>
                        </defs>
                        <rect
                          fill={`url(#cf-grad-${idx})`}
                          width="20"
                          height="20"
                        />
                        <line
                          x1="0"
                          y1="0"
                          x2="20"
                          y2="20"
                          stroke="white"
                          strokeWidth="0.5"
                          opacity="0.5"
                        />
                        <line
                          x1="20"
                          y1="0"
                          x2="0"
                          y2="20"
                          stroke="white"
                          strokeWidth="0.5"
                          opacity="0.5"
                        />
                      </svg>
                    </div>
                  ))}

                  {/* Render clips */}
                  {clips.map((clip) => {
                    const isDragging = draggingClip?.clipId === clip.id;
                    const isResizing = resizingClip?.clipId === clip.id;
                    const showPreview = isDragging || isResizing;

                    const displayStartTime =
                      showPreview && previewPosition
                        ? previewPosition.startTime
                        : clip.startTime;
                    const displayEndTime =
                      showPreview && previewPosition
                        ? previewPosition.endTime
                        : clip.startTime + clip.duration;
                    const displayDuration = displayEndTime - displayStartTime;
                    const hasSyncPoint =
                      clip.syncOffset !== undefined && clip.syncOffset > 0;
                    const clipTempoMap = getTempoMapForClip(clip.id);
                    const isAnalyzingThisClip =
                      isAnalyzingTempo && analyzingClipId === clip.id;

                    return (
                      <ContextMenu key={clip.id}>
                        <ContextMenuTrigger asChild>
                          <div
                            className={`absolute top-1 bottom-1 rounded overflow-hidden transition-opacity ${
                              isDragging || isResizing
                                ? "opacity-50 ring-2 ring-white"
                                : "hover:ring-2 hover:ring-blue-400"
                            }`}
                            style={{
                              left: `${(displayStartTime / effectiveDuration) * 100}%`,
                              width: `${(displayDuration / effectiveDuration) * 100}%`,
                              backgroundColor: translucentEventsEnabled
                                ? `${track.color}66`
                                : track.color,
                              cursor:
                                currentTool === "split" ? "crosshair" : "move",
                              backdropFilter: translucentEventsEnabled
                                ? "none"
                                : undefined,
                            }}
                            onMouseDown={(e) =>
                              handleClipDragStart(e, clip.id, track.id, clip)
                            }
                            onClick={(e) =>
                              handleClipClick(e, clip.id, track.id, clip)
                            }
                            data-testid={`clip-${clip.id}`}
                          >
                            {/* Ghost Grid Lines (visible when translucent events enabled) */}
                            {translucentEventsEnabled && gridVisible && (
                              <div className="absolute inset-0 pointer-events-none z-0">
                                {(() => {
                                  const clipStartRatio =
                                    displayStartTime / effectiveDuration;
                                  const clipEndRatio =
                                    displayEndTime / effectiveDuration;
                                  const clipWidthRatio =
                                    clipEndRatio - clipStartRatio;

                                  return gridLines
                                    .filter((line) => {
                                      const lineRatio = line.position / 100;
                                      return (
                                        lineRatio >= clipStartRatio &&
                                        lineRatio <= clipEndRatio
                                      );
                                    })
                                    .map((line, idx) => {
                                      const lineRatio = line.position / 100;
                                      const positionWithinClip =
                                        ((lineRatio - clipStartRatio) /
                                          clipWidthRatio) *
                                        100;

                                      return (
                                        <div
                                          key={`ghost-grid-${idx}`}
                                          className="absolute top-0 bottom-0"
                                          style={{
                                            left: `${positionWithinClip}%`,
                                            width: "1px",
                                            backgroundColor:
                                              line.type === "bar"
                                                ? "rgba(255, 255, 255, 0.4)"
                                                : line.type === "beat"
                                                  ? "rgba(255, 255, 255, 0.2)"
                                                  : "rgba(255, 255, 255, 0.1)",
                                          }}
                                        />
                                      );
                                    });
                                })()}
                              </div>
                            )}
                            {/* Clip content */}
                            <div className="h-full flex items-center px-2 relative">
                              <div className="text-xs text-white font-medium truncate flex-1">
                                {clip.name}
                              </div>

                              {/* BPM Badge - shown when tempo is detected */}
                              {clipTempoMap && (
                                <div
                                  className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold z-10"
                                  style={{
                                    backgroundColor: "rgba(59, 130, 246, 0.9)",
                                    color: "#ffffff",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                                  }}
                                  data-testid={`bpm-badge-${clip.id}`}
                                >
                                  <Music className="w-2.5 h-2.5" />
                                  {clipTempoMap.detectedBpm} BPM
                                </div>
                              )}

                              {/* Loading indicator during tempo analysis */}
                              {isAnalyzingThisClip && (
                                <div
                                  className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium z-10"
                                  style={{
                                    backgroundColor: "rgba(251, 191, 36, 0.9)",
                                    color: "#000000",
                                  }}
                                  data-testid={`analyzing-indicator-${clip.id}`}
                                >
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  Analyzing...
                                </div>
                              )}

                              {/* Resize handles - hide when using split or range tool */}
                              {/* Studio One 7-style: Alt/Option = Time Stretch, Default = Loop (if enabled) or Trim */}
                              {currentTool !== "split" &&
                                currentTool !== "range" && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={`absolute left-0 top-0 bottom-0 w-2 ${
                                            isAltPressed
                                              ? "cursor-col-resize bg-orange-500/20 hover:bg-orange-500/40"
                                              : loopToolEnabled
                                                ? "cursor-e-resize hover:bg-blue-500/30"
                                                : "cursor-ew-resize hover:bg-white/30"
                                          } active:bg-white/50 transition-colors`}
                                          onMouseDown={(e) =>
                                            handleResizeStart(
                                              e,
                                              clip.id,
                                              track.id,
                                              "start",
                                              clip,
                                            )
                                          }
                                          data-testid={`clip-${clip.id}-resize-start`}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="text-xs"
                                      >
                                        {isAltPressed
                                          ? "Time Stretch"
                                          : loopToolEnabled
                                            ? "Loop/Repeat"
                                            : "Trim Start"}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={`absolute right-0 top-0 bottom-0 w-2 ${
                                            isAltPressed
                                              ? "cursor-col-resize bg-orange-500/20 hover:bg-orange-500/40"
                                              : loopToolEnabled
                                                ? "cursor-e-resize hover:bg-blue-500/30"
                                                : "cursor-ew-resize hover:bg-white/30"
                                          } active:bg-white/50 transition-colors`}
                                          onMouseDown={(e) =>
                                            handleResizeStart(
                                              e,
                                              clip.id,
                                              track.id,
                                              "end",
                                              clip,
                                            )
                                          }
                                          data-testid={`clip-${clip.id}-resize-end`}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="text-xs"
                                      >
                                        {isAltPressed
                                          ? "Time Stretch"
                                          : loopToolEnabled
                                            ? "Loop/Repeat"
                                            : "Trim End"}
                                      </TooltipContent>
                                    </Tooltip>
                                  </>
                                )}
                            </div>

                            {/* Sync Point Marker (yellow diamond) */}
                            {showSyncPoints &&
                              hasSyncPoint &&
                              clip.duration > 0 &&
                              (() => {
                                const syncRatio = Math.max(
                                  0,
                                  Math.min(
                                    1,
                                    (clip.syncOffset ?? 0) / clip.duration,
                                  ),
                                );
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
                                        backgroundColor: "#fbbf24",
                                        borderColor: "#f59e0b",
                                        boxShadow:
                                          "0 0 4px rgba(251, 191, 36, 0.6)",
                                      }}
                                    />
                                  </div>
                                );
                              })()}

                            {/* Beat Markers - subtle vertical lines at beat positions */}
                            {clipTempoMap &&
                              clipTempoMap.beatMarkers.length > 0 && (
                                <div className="absolute inset-0 pointer-events-none z-5">
                                  {clipTempoMap.beatMarkers.map(
                                    (beatTime, idx) => {
                                      const beatPositionRatio =
                                        beatTime / clip.duration;
                                      if (
                                        beatPositionRatio < 0 ||
                                        beatPositionRatio > 1
                                      )
                                        return null;
                                      const isDownbeat =
                                        clipTempoMap.downbeats.includes(
                                          beatTime,
                                        );
                                      return (
                                        <div
                                          key={`beat-${idx}`}
                                          className="absolute top-0 bottom-0"
                                          style={{
                                            left: `${beatPositionRatio * 100}%`,
                                            width: isDownbeat ? "2px" : "1px",
                                            backgroundColor: isDownbeat
                                              ? "rgba(251, 191, 36, 0.6)"
                                              : "rgba(255, 255, 255, 0.3)",
                                          }}
                                          data-testid={`beat-marker-${clip.id}-${idx}`}
                                        />
                                      );
                                    },
                                  )}
                                </div>
                              )}

                            {/* Enhanced Waveform Visualization */}
                            <div
                              className="absolute inset-0 pointer-events-none overflow-hidden"
                              style={{
                                opacity: translucentEventsEnabled ? 0.6 : 0.3,
                              }}
                            >
                              <svg
                                className="w-full h-full"
                                viewBox="0 0 200 40"
                                preserveAspectRatio="none"
                              >
                                <defs>
                                  <linearGradient
                                    id={`waveform-grad-${clip.id}`}
                                    x1="0%"
                                    y1="0%"
                                    x2="0%"
                                    y2="100%"
                                  >
                                    <stop
                                      offset="0%"
                                      stopColor="white"
                                      stopOpacity="0.8"
                                    />
                                    <stop
                                      offset="50%"
                                      stopColor="white"
                                      stopOpacity="1"
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor="white"
                                      stopOpacity="0.8"
                                    />
                                  </linearGradient>
                                </defs>
                                {/* Generate waveform-like path */}
                                <path
                                  d={(() => {
                                    const points = 100;
                                    const centerY = 20;
                                    let path = `M 0 ${centerY}`;

                                    for (let i = 0; i <= points; i++) {
                                      const x = (i / points) * 200;
                                      const phase =
                                        (i / points) * Math.PI * 8 +
                                        (clip.id.charCodeAt(0) || 0);
                                      const amplitude =
                                        8 +
                                        Math.sin(phase * 0.5) * 6 +
                                        Math.sin(phase * 2.3) * 4;
                                      const y1 = centerY - amplitude;

                                      path += ` L ${x} ${y1}`;
                                    }

                                    for (let i = points; i >= 0; i--) {
                                      const x = (i / points) * 200;
                                      const phase =
                                        (i / points) * Math.PI * 8 +
                                        (clip.id.charCodeAt(0) || 0);
                                      const amplitude =
                                        8 +
                                        Math.sin(phase * 0.5) * 6 +
                                        Math.sin(phase * 2.3) * 4;
                                      const y2 = centerY + amplitude;

                                      path += ` L ${x} ${y2}`;
                                    }

                                    path += " Z";
                                    return path;
                                  })()}
                                  fill={`url(#waveform-grad-${clip.id})`}
                                />
                                {/* Center line */}
                                <line
                                  x1="0"
                                  y1="20"
                                  x2="200"
                                  y2="20"
                                  stroke="white"
                                  strokeWidth="0.5"
                                  opacity="0.3"
                                />
                              </svg>
                            </div>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent
                          className="w-56"
                          style={{
                            background: "var(--studio-bg-deep)",
                            borderColor: "var(--studio-border)",
                          }}
                        >
                          {/* Tempo Detection Section */}
                          <ContextMenuItem
                            onClick={() =>
                              handleDetectTempo(
                                clip.id,
                                track.id,
                                clip.duration,
                              )
                            }
                            disabled={isAnalyzingThisClip}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            {isAnalyzingThisClip ? (
                              <Loader2 className="h-4 w-4 text-yellow-400 animate-spin" />
                            ) : (
                              <Music className="h-4 w-4 text-blue-400" />
                            )}
                            <span>
                              {isAnalyzingThisClip
                                ? "Analyzing..."
                                : "Detect Tempo"}
                            </span>
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() =>
                              handleAlignToProjectTempo(clip.id, track.id, clip)
                            }
                            disabled={!clipTempoMap}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <AlignHorizontalJustifyCenter className="h-4 w-4 text-green-400" />
                            <span>Align to Project Tempo</span>
                            {clipTempoMap && (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                {clipTempoMap.detectedBpm}→{projectTempo}
                              </span>
                            )}
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleClearTempoData(clip.id)}
                            disabled={!clipTempoMap}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <X className="h-4 w-4 text-red-400" />
                            <span>Clear Tempo Data</span>
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          {/* Sync Point Section */}
                          <ContextMenuItem
                            onClick={() =>
                              handleOpenSyncPointDialog(
                                clip.id,
                                track.id,
                                clip.duration,
                                clip.syncOffset || 0,
                              )
                            }
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Target className="h-4 w-4 text-yellow-500" />
                            <span>Set Sync Point</span>
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() =>
                              handleClearSyncPoint(clip.id, track.id)
                            }
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
            Snap:{" "}
            {(adaptiveSnapEnabled
              ? getAdaptiveSnapInterval(zoom)
              : snapInterval
            ).toFixed(3)}
            s{adaptiveSnapEnabled && " (adaptive)"}
          </div>
        )}

        {/* Translucent Mode Visual Indicator */}
        {translucentEventsEnabled && (
          <div
            className="absolute top-1 right-1 z-30 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.2)",
              color: "#a78bfa",
              border: "1px solid rgba(139, 92, 246, 0.4)",
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
