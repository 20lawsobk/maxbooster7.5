import { useMemo, useState, useCallback, useRef, useEffect } from 'react';

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
  snapEnabled?: boolean;
  snapInterval?: number;
  zoom?: number;
  isPlaying?: boolean;
  selectedTrack?: string | null;
  onTrackSelect?: (trackId: string) => void;
  onTimeChange?: (time: number) => void;
}

/**
 * TODO: Add function documentation
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
  snapEnabled = true,
  snapInterval = 0.25, // Quarter note at 120 BPM ≈ 0.5s, snap to 0.25s grid
  zoom = 1,
  isPlaying = false,
  selectedTrack = null,
  onTrackSelect,
  onTimeChange,
}: TimelineProps) {
  const [numerator] = (timeSignature || '4/4').split('/').map(Number);
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

  const timelineRef = useRef<HTMLDivElement>(null);

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

  // Convert pixel position to time
  const pixelsToTime = useCallback(
    (pixels: number): number => {
      if (!timelineRef.current) return 0;
      const width = timelineRef.current.offsetWidth;
      return (pixels / width) * duration;
    },
    [duration]
  );

  // Convert time to pixel position
  const timeToPixels = useCallback(
    (time: number): number => {
      if (!timelineRef.current) return 0;
      const width = timelineRef.current.offsetWidth;
      return (time / duration) * width;
    },
    [duration]
  );

  // Snap time to grid
  const snapToGrid = useCallback(
    (time: number): number => {
      if (!snapEnabled) return time;
      return Math.round(time / snapInterval) * snapInterval;
    },
    [snapEnabled, snapInterval]
  );

  // Handle clip drag start
  const handleClipDragStart = useCallback(
    (e: React.MouseEvent, clipId: string, trackId: string, clip: AudioClip) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickTime = pixelsToTime(clickX);
      setDragOffset(clickTime);
      setDraggingClip({ clipId, trackId });
      setPreviewPosition({ startTime: clip.startTime, endTime: clip.startTime + clip.duration });
    },
    [pixelsToTime]
  );

  // Handle clip drag
  const handleClipDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingClip || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseTime = pixelsToTime(mouseX);

      // Find the clip being dragged
      const clips = trackClips.get(draggingClip.trackId);
      const clip = clips?.find((c) => c.id === draggingClip.clipId);
      if (!clip) return;

      const clipDuration = clip.duration;
      let newStartTime = mouseTime - dragOffset;

      // Snap to grid
      newStartTime = snapToGrid(newStartTime);

      // Clamp to timeline bounds
      newStartTime = Math.max(0, Math.min(newStartTime, duration - clipDuration));

      const newEndTime = newStartTime + clipDuration;

      setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
    },
    [draggingClip, trackClips, pixelsToTime, snapToGrid, dragOffset, duration]
  );

  // Handle clip drag end
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

  // Handle resize start
  const handleResizeStart = useCallback(
    (
      e: React.MouseEvent,
      clipId: string,
      trackId: string,
      edge: 'start' | 'end',
      clip: AudioClip
    ) => {
      e.stopPropagation();
      setResizingClip({ clipId, trackId, edge });
      setPreviewPosition({ startTime: clip.startTime, endTime: clip.startTime + clip.duration });
    },
    []
  );

  // Handle resize
  const handleResize = useCallback(
    (e: React.MouseEvent) => {
      if (!resizingClip || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      let mouseTime = pixelsToTime(mouseX);

      // Snap to grid
      mouseTime = snapToGrid(mouseTime);

      // Find the clip being resized
      const clips = trackClips.get(resizingClip.trackId);
      const clip = clips?.find((c) => c.id === resizingClip.clipId);
      if (!clip) return;

      let newStartTime = clip.startTime;
      let newEndTime = clip.startTime + clip.duration;

      if (resizingClip.edge === 'start') {
        newStartTime = Math.max(0, Math.min(mouseTime, clip.startTime + clip.duration - 0.1)); // Min 0.1s clip
      } else {
        newEndTime = Math.max(clip.startTime + 0.1, Math.min(mouseTime, duration));
      }

      setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
    },
    [resizingClip, trackClips, pixelsToTime, snapToGrid, duration]
  );

  // Handle resize end
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

  // Global mouse move and up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const mouseEvent = e as unknown as React.MouseEvent;
      if (draggingClip) {
        handleClipDrag(mouseEvent);
      } else if (resizingClip) {
        handleResize(mouseEvent);
      }
    };

    const handleMouseUp = () => {
      if (draggingClip) {
        handleClipDragEnd();
      } else if (resizingClip) {
        handleResizeEnd();
      }
    };

    if (draggingClip || resizingClip) {
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
    handleClipDrag,
    handleClipDragEnd,
    handleResize,
    handleResizeEnd,
  ]);

  return (
    <div className="border-b" style={{ borderColor: 'var(--studio-border)' }}>
      {/* Time Ruler */}
      <div
        ref={timelineRef}
        className="h-10 border-b relative cursor-pointer select-none"
        style={{
          borderColor: 'var(--studio-border)',
          backgroundColor: 'var(--studio-bg-medium)',
        }}
        onClick={(e) => {
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
        <div className="relative">
          {tracks.map((track, trackIndex) => {
            const clips = trackClips.get(track.id) || [];
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
                {/* Render clips */}
                {clips.map((clip) => {
                  const isDragging = draggingClip?.clipId === clip.id;
                  const isResizing = resizingClip?.clipId === clip.id;
                  const showPreview = isDragging || isResizing;

                  // Use preview position if dragging/resizing, otherwise use actual position
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
                      className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-move transition-opacity ${
                        isDragging || isResizing
                          ? 'opacity-50 ring-2 ring-white'
                          : 'hover:ring-2 hover:ring-blue-400'
                      }`}
                      style={{
                        left: `${(displayStartTime / duration) * 100}%`,
                        width: `${(displayDuration / duration) * 100}%`,
                        backgroundColor: track.color,
                      }}
                      onMouseDown={(e) => handleClipDragStart(e, clip.id, track.id, clip)}
                      data-testid={`clip-${clip.id}`}
                    >
                      {/* Clip content */}
                      <div className="h-full flex items-center px-2 relative">
                        <div className="text-xs text-white font-medium truncate flex-1">
                          {clip.name}
                        </div>

                        {/* Resize handles */}
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
