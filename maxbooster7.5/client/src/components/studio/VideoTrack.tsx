import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  Video,
  Upload,
  Scissors,
  Copy,
  Clipboard,
  Flag,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  X,
  Film,
  FileVideo,
  Music,
  ChevronDown,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStudioStore } from '@/lib/studioStore';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export interface VideoClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  filePath: string;
  thumbnails: string[];
  format: 'mp4' | 'mov' | 'webm' | 'avi' | 'mkv';
  width: number;
  height: number;
  frameRate: number;
  hasAudio: boolean;
  offset?: number;
  trimStart?: number;
  trimEnd?: number;
}

export interface VideoMarker {
  id: string;
  time: number;
  type: 'cut' | 'copy' | 'paste' | 'general';
  label?: string;
}

interface VideoTrackProps {
  duration: number;
  onTimelineClick?: (time: number) => void;
  onVideoImport?: (file: File) => void;
  onAudioExtract?: (clipId: string) => void;
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void;
  onClipDelete?: (clipId: string) => void;
  initialClips?: VideoClip[];
  isPlaying?: boolean;
  onPlayPause?: () => void;
}

const SUPPORTED_FORMATS = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
const FORMAT_COLORS: Record<string, string> = {
  mp4: '#22c55e',
  mov: '#3b82f6',
  webm: '#f97316',
  avi: '#8b5cf6',
  mkv: '#ec4899',
};

const THUMBNAIL_WIDTH = 80;
const THUMBNAIL_HEIGHT = 45;

export function VideoTrack({
  duration,
  onTimelineClick,
  onVideoImport,
  onAudioExtract,
  onClipUpdate,
  onClipDelete,
  initialClips = [],
  isPlaying = false,
  onPlayPause,
}: VideoTrackProps) {
  const { zoom, snapEnabled, snapResolution, currentTime, setCurrentTime } = useStudioStore();

  const [clips, setClips] = useState<VideoClip[]>(initialClips);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [markers, setMarkers] = useState<VideoMarker[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingClip, setIsDraggingClip] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewClip, setPreviewClip] = useState<VideoClip | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedMarkerTime, setCopiedMarkerTime] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailCanvasRef = useRef<HTMLCanvasElement>(null);

  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId),
    [clips, selectedClipId]
  );

  const timeToPixels = useCallback(
    (time: number): number => {
      if (!timelineRef.current) return 0;
      const width = timelineRef.current.offsetWidth;
      return (time / duration) * width * zoom;
    },
    [duration, zoom]
  );

  const pixelsToTime = useCallback(
    (pixels: number): number => {
      if (!timelineRef.current) return 0;
      const width = timelineRef.current.offsetWidth;
      return (pixels / (width * zoom)) * duration;
    },
    [duration, zoom]
  );

  const snapToGrid = useCallback(
    (time: number): number => {
      if (!snapEnabled) return time;
      return Math.round(time / snapResolution) * snapResolution;
    },
    [snapEnabled, snapResolution]
  );

  const generateThumbnails = useCallback(
    async (videoFile: File, clipDuration: number): Promise<string[]> => {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const thumbnails: string[] = [];

        canvas.width = THUMBNAIL_WIDTH;
        canvas.height = THUMBNAIL_HEIGHT;

        video.src = URL.createObjectURL(videoFile);
        video.muted = true;

        const thumbnailCount = Math.max(1, Math.ceil((clipDuration / duration) * 20));
        const interval = clipDuration / thumbnailCount;
        let currentIndex = 0;

        video.onloadedmetadata = () => {
          const captureFrame = () => {
            if (currentIndex >= thumbnailCount) {
              URL.revokeObjectURL(video.src);
              resolve(thumbnails);
              return;
            }

            video.currentTime = currentIndex * interval;
          };

          video.onseeked = () => {
            if (ctx) {
              ctx.drawImage(video, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
              thumbnails.push(canvas.toDataURL('image/jpeg', 0.6));
            }
            currentIndex++;
            captureFrame();
          };

          captureFrame();
        };

        video.onerror = () => {
          resolve([]);
        };
      });
    },
    [duration]
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!SUPPORTED_FORMATS.some((format) => file.type.includes(format) || file.name.toLowerCase().endsWith(`.${format}`))) {
        console.error('Unsupported video format');
        return;
      }

      setIsImporting(true);
      setImportProgress(0);

      try {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);

        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('Failed to load video'));
        });

        setImportProgress(30);

        const videoDuration = video.duration;
        const format = file.name.split('.').pop()?.toLowerCase() as VideoClip['format'];

        setImportProgress(50);

        const thumbnails = await generateThumbnails(file, videoDuration);

        setImportProgress(80);

        const videoStream = (video as any).captureStream?.() || null;
        const hasAudio = videoStream?.getAudioTracks?.()?.length > 0;

        const newClip: VideoClip = {
          id: `video-${Date.now()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          startTime: currentTime,
          duration: Math.min(videoDuration, duration - currentTime),
          filePath: URL.createObjectURL(file),
          thumbnails,
          format: format || 'mp4',
          width: video.videoWidth,
          height: video.videoHeight,
          frameRate: 30,
          hasAudio: hasAudio ?? true,
        };

        setClips((prev) => [...prev, newClip]);
        setSelectedClipId(newClip.id);
        setImportProgress(100);

        onVideoImport?.(file);

        setTimeout(() => {
          setIsImporting(false);
          setImportProgress(0);
        }, 500);
      } catch (error) {
        console.error('Failed to import video:', error);
        setIsImporting(false);
        setImportProgress(0);
      }
    },
    [currentTime, duration, generateThumbnails, onVideoImport]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const videoFile = files.find((file) =>
        SUPPORTED_FORMATS.some((format) => file.type.includes(format) || file.name.toLowerCase().endsWith(`.${format}`))
      );

      if (videoFile) {
        handleFileSelect(videoFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isDraggingClip || isResizing) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = snapToGrid(pixelsToTime(x));

      setCurrentTime(Math.max(0, Math.min(time, duration)));
      onTimelineClick?.(time);
    },
    [isDraggingClip, isResizing, pixelsToTime, snapToGrid, setCurrentTime, duration, onTimelineClick]
  );

  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent, clip: VideoClip) => {
      e.stopPropagation();
      setSelectedClipId(clip.id);

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickTime = pixelsToTime(clickX);
      setDragOffset(clickTime);
      setIsDraggingClip(true);
    },
    [pixelsToTime]
  );

  const handleClipDrag = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingClip || !selectedClipId || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseTime = pixelsToTime(mouseX);

      const clip = clips.find((c) => c.id === selectedClipId);
      if (!clip) return;

      let newStartTime = mouseTime - dragOffset;
      newStartTime = snapToGrid(newStartTime);
      newStartTime = Math.max(0, Math.min(newStartTime, duration - clip.duration));

      setClips((prev) =>
        prev.map((c) => (c.id === selectedClipId ? { ...c, startTime: newStartTime } : c))
      );
    },
    [isDraggingClip, selectedClipId, clips, pixelsToTime, snapToGrid, dragOffset, duration]
  );

  const handleClipDragEnd = useCallback(() => {
    if (isDraggingClip && selectedClipId) {
      const clip = clips.find((c) => c.id === selectedClipId);
      if (clip) {
        onClipUpdate?.(selectedClipId, { startTime: clip.startTime });
      }
    }
    setIsDraggingClip(false);
  }, [isDraggingClip, selectedClipId, clips, onClipUpdate]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, clipId: string, edge: 'start' | 'end') => {
      e.stopPropagation();
      setSelectedClipId(clipId);
      setIsResizing(edge);
    },
    []
  );

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !selectedClipId || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      let mouseTime = snapToGrid(pixelsToTime(mouseX));

      const clip = clips.find((c) => c.id === selectedClipId);
      if (!clip) return;

      if (isResizing === 'start') {
        const maxStart = clip.startTime + clip.duration - 0.1;
        const newStartTime = Math.max(0, Math.min(mouseTime, maxStart));
        const durationDelta = clip.startTime - newStartTime;

        setClips((prev) =>
          prev.map((c) =>
            c.id === selectedClipId
              ? {
                  ...c,
                  startTime: newStartTime,
                  duration: c.duration + durationDelta,
                  trimStart: (c.trimStart || 0) - durationDelta,
                }
              : c
          )
        );
      } else {
        const minEnd = clip.startTime + 0.1;
        const newEndTime = Math.max(minEnd, Math.min(mouseTime, duration));
        const newDuration = newEndTime - clip.startTime;

        setClips((prev) =>
          prev.map((c) =>
            c.id === selectedClipId
              ? {
                  ...c,
                  duration: newDuration,
                  trimEnd: (c.trimEnd || 0) + (c.duration - newDuration),
                }
              : c
          )
        );
      }
    },
    [isResizing, selectedClipId, clips, pixelsToTime, snapToGrid, duration]
  );

  const handleResizeEnd = useCallback(() => {
    if (isResizing && selectedClipId) {
      const clip = clips.find((c) => c.id === selectedClipId);
      if (clip) {
        onClipUpdate?.(selectedClipId, {
          startTime: clip.startTime,
          duration: clip.duration,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd,
        });
      }
    }
    setIsResizing(null);
  }, [isResizing, selectedClipId, clips, onClipUpdate]);

  useEffect(() => {
    if (isDraggingClip) {
      document.addEventListener('mousemove', handleClipDrag);
      document.addEventListener('mouseup', handleClipDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleClipDrag);
        document.removeEventListener('mouseup', handleClipDragEnd);
      };
    }
  }, [isDraggingClip, handleClipDrag, handleClipDragEnd]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResize, handleResizeEnd]);

  const addMarker = useCallback(
    (type: VideoMarker['type']) => {
      const newMarker: VideoMarker = {
        id: `marker-${Date.now()}`,
        time: currentTime,
        type,
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} Marker`,
      };
      setMarkers((prev) => [...prev, newMarker].sort((a, b) => a.time - b.time));

      if (type === 'copy' && selectedClipId) {
        setCopiedMarkerTime(currentTime);
      }
    },
    [currentTime, selectedClipId]
  );

  const deleteMarker = useCallback((markerId: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== markerId));
  }, []);

  const handleCut = useCallback(() => {
    if (!selectedClipId) return;

    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;

    const cutTime = currentTime;
    if (cutTime <= clip.startTime || cutTime >= clip.startTime + clip.duration) return;

    const firstDuration = cutTime - clip.startTime;
    const secondDuration = clip.duration - firstDuration;

    const firstClip: VideoClip = {
      ...clip,
      duration: firstDuration,
      trimEnd: (clip.trimEnd || 0) + secondDuration,
    };

    const secondClip: VideoClip = {
      ...clip,
      id: `video-${Date.now()}`,
      startTime: cutTime,
      duration: secondDuration,
      trimStart: (clip.trimStart || 0) + firstDuration,
    };

    setClips((prev) => prev.map((c) => (c.id === clip.id ? firstClip : c)).concat(secondClip));

    addMarker('cut');
  }, [selectedClipId, clips, currentTime, addMarker]);

  const handleCopy = useCallback(() => {
    if (!selectedClipId) return;
    setCopiedMarkerTime(currentTime);
    addMarker('copy');
  }, [selectedClipId, currentTime, addMarker]);

  const handlePaste = useCallback(() => {
    if (!selectedClipId || copiedMarkerTime === null) return;

    const sourceClip = clips.find((c) => c.id === selectedClipId);
    if (!sourceClip) return;

    const newClip: VideoClip = {
      ...sourceClip,
      id: `video-${Date.now()}`,
      startTime: currentTime,
    };

    setClips((prev) => [...prev, newClip]);
    addMarker('paste');
  }, [selectedClipId, copiedMarkerTime, clips, currentTime, addMarker]);

  const handleExtractAudio = useCallback(() => {
    if (!selectedClipId) return;
    onAudioExtract?.(selectedClipId);
  }, [selectedClipId, onAudioExtract]);

  const handleDeleteClip = useCallback(() => {
    if (!selectedClipId) return;
    setClips((prev) => prev.filter((c) => c.id !== selectedClipId));
    onClipDelete?.(selectedClipId);
    setSelectedClipId(null);
  }, [selectedClipId, onClipDelete]);

  const openPreview = useCallback((clip: VideoClip) => {
    setPreviewClip(clip);
    setPreviewTime(0);
    setShowPreview(true);
  }, []);

  useEffect(() => {
    if (videoPreviewRef.current && previewClip) {
      const video = videoPreviewRef.current;
      video.currentTime = (currentTime - previewClip.startTime) + (previewClip.trimStart || 0);
    }
  }, [currentTime, previewClip]);

  useEffect(() => {
    if (videoPreviewRef.current) {
      if (isPlaying && showPreview) {
        videoPreviewRef.current.play();
      } else {
        videoPreviewRef.current.pause();
      }
    }
  }, [isPlaying, showPreview]);

  const getFormatBadgeColor = (format: string) => {
    return FORMAT_COLORS[format] || '#6b7280';
  };

  const renderThumbnailStrip = useCallback(
    (clip: VideoClip) => {
      const clipWidth = timeToPixels(clip.duration);
      const thumbnailCount = Math.max(1, Math.floor(clipWidth / (THUMBNAIL_WIDTH * 0.8)));
      const displayThumbnails = clip.thumbnails.slice(0, thumbnailCount);

      return (
        <div className="absolute inset-0 flex overflow-hidden opacity-60">
          {displayThumbnails.map((thumb, index) => (
            <div
              key={index}
              className="flex-shrink-0 h-full bg-cover bg-center"
              style={{
                backgroundImage: `url(${thumb})`,
                width: `${100 / displayThumbnails.length}%`,
              }}
            />
          ))}
          {displayThumbnails.length === 0 && (
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              <Video className="h-6 w-6 text-slate-500" />
            </div>
          )}
        </div>
      );
    },
    [timeToPixels]
  );

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ background: 'var(--studio-bg-deep)' }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,.webm,.avi,.mkv,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
      />

      <div
        className="h-8 flex items-center justify-between px-3 border-b"
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
              style={{ color: 'var(--studio-text)' }}
            />
          </Button>
          <Film className="h-3.5 w-3.5" style={{ color: '#8b5cf6' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--studio-text-muted)' }}>
            VIDEO TRACK
          </span>
          {clips.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {clips.length} clip{clips.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <Upload className="h-3 w-3 mr-1" />
            Import
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCut} disabled={!selectedClipId}>
                <Scissors className="h-3.5 w-3.5 mr-2" />
                Cut at Playhead
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopy} disabled={!selectedClipId}>
                <Copy className="h-3.5 w-3.5 mr-2" />
                Copy
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePaste} disabled={!copiedMarkerTime}>
                <Clipboard className="h-3.5 w-3.5 mr-2" />
                Paste
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleExtractAudio}
                disabled={!selectedClip?.hasAudio}
              >
                <Music className="h-3.5 w-3.5 mr-2" />
                Extract Audio
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDeleteClip} disabled={!selectedClipId}>
                <Trash2 className="h-3.5 w-3.5 mr-2 text-red-500" />
                Delete Clip
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isExpanded && (
        <>
          {isImporting && (
            <div
              className="h-6 flex items-center px-3 gap-2 border-b"
              style={{
                background: 'var(--studio-bg-medium)',
                borderColor: 'var(--studio-border)',
              }}
            >
              <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
              <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                Importing video...
              </span>
              <Progress value={importProgress} className="flex-1 h-1.5" />
              <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                {importProgress}%
              </span>
            </div>
          )}

          <div
            ref={timelineRef}
            className={`relative h-20 border-b cursor-pointer transition-colors ${
              isDragOver ? 'bg-blue-500/10 border-blue-500' : ''
            }`}
            style={{
              borderColor: isDragOver ? '#3b82f6' : 'var(--studio-border)',
              background: isDragOver ? 'rgba(59, 130, 246, 0.1)' : 'var(--studio-bg-deep)',
            }}
            onClick={handleTimelineClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            data-testid="video-track-timeline"
          >
            {clips.length === 0 && !isDragOver && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                style={{ color: 'var(--studio-text-muted)' }}
              >
                <FileVideo className="h-8 w-8 mb-2 opacity-30" />
                <span className="text-xs">Drop video or click Import</span>
              </div>
            )}

            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-500/10 border-2 border-dashed border-blue-500 rounded">
                <div className="text-center">
                  <Upload className="h-8 w-8 mb-2 mx-auto text-blue-500" />
                  <span className="text-sm text-blue-500 font-medium">Drop video here</span>
                </div>
              </div>
            )}

            {clips.map((clip) => {
              const isSelected = clip.id === selectedClipId;
              const left = timeToPixels(clip.startTime);
              const width = timeToPixels(clip.duration);

              return (
                <ContextMenu key={clip.id}>
                  <ContextMenuTrigger>
                    <div
                      className={`absolute top-1 h-[calc(100%-8px)] rounded overflow-hidden cursor-move transition-all ${
                        isSelected ? 'ring-2 ring-purple-500 z-10' : 'hover:ring-1 hover:ring-white/30'
                      } ${isDraggingClip && isSelected ? 'opacity-70' : ''}`}
                      style={{
                        left: `${left}px`,
                        width: `${Math.max(width, 20)}px`,
                        background: 'linear-gradient(to bottom, #4c1d95, #312e81)',
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip)}
                      onDoubleClick={() => openPreview(clip)}
                      data-testid={`video-clip-${clip.id}`}
                    >
                      {renderThumbnailStrip(clip)}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

                      <div className="absolute top-1 left-1 right-1 flex items-center justify-between z-10">
                        <span className="text-[10px] text-white font-medium truncate flex-1 px-1">
                          {clip.name}
                        </span>
                        <Badge
                          className="text-[8px] h-3 px-1"
                          style={{ backgroundColor: getFormatBadgeColor(clip.format) }}
                        >
                          {clip.format.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 z-10">
                        <span className="text-[9px] text-white/70">
                          {clip.width}x{clip.height}
                        </span>
                        {clip.hasAudio && (
                          <Volume2 className="h-2.5 w-2.5 text-white/70" />
                        )}
                        <span className="text-[9px] text-white/70 ml-auto">
                          {clip.duration.toFixed(1)}s
                        </span>
                      </div>

                      <div
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 z-20"
                        onMouseDown={(e) => handleResizeStart(e, clip.id, 'start')}
                      />
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 z-20"
                        onMouseDown={(e) => handleResizeStart(e, clip.id, 'end')}
                      />
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => openPreview(clip)}>
                      <Play className="h-3.5 w-3.5 mr-2" />
                      Preview
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={handleCut}>
                      <Scissors className="h-3.5 w-3.5 mr-2" />
                      Cut at Playhead
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleCopy}>
                      <Copy className="h-3.5 w-3.5 mr-2" />
                      Copy
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handlePaste} disabled={!copiedMarkerTime}>
                      <Clipboard className="h-3.5 w-3.5 mr-2" />
                      Paste
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => addMarker('general')}>
                      <Flag className="h-3.5 w-3.5 mr-2" />
                      Add Marker
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {clip.hasAudio && (
                      <ContextMenuItem onClick={handleExtractAudio}>
                        <Music className="h-3.5 w-3.5 mr-2" />
                        Extract Audio
                      </ContextMenuItem>
                    )}
                    <ContextMenuItem onClick={handleDeleteClip} className="text-red-500">
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {markers.map((marker) => {
              const markerLeft = timeToPixels(marker.time);
              const markerColor =
                marker.type === 'cut'
                  ? '#ef4444'
                  : marker.type === 'copy'
                  ? '#3b82f6'
                  : marker.type === 'paste'
                  ? '#22c55e'
                  : '#f97316';

              return (
                <div
                  key={marker.id}
                  className="absolute top-0 bottom-0 w-0.5 cursor-pointer z-20 hover:w-1 transition-all"
                  style={{
                    left: `${markerLeft}px`,
                    backgroundColor: markerColor,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentTime(marker.time);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    deleteMarker(marker.id);
                  }}
                  title={`${marker.label} (double-click to delete)`}
                >
                  <div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
                    style={{ backgroundColor: markerColor }}
                  />
                </div>
              );
            })}

            {duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-30"
                style={{
                  left: `${timeToPixels(currentTime)}px`,
                }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45" />
              </div>
            )}
          </div>

          <div
            className="h-6 flex items-center justify-between px-3 border-b"
            style={{
              background: 'var(--studio-bg-medium)',
              borderColor: 'var(--studio-border)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
                Supported:
              </span>
              {SUPPORTED_FORMATS.map((format) => (
                <Badge
                  key={format}
                  variant="outline"
                  className="text-[8px] h-3.5 px-1"
                  style={{ borderColor: getFormatBadgeColor(format), color: getFormatBadgeColor(format) }}
                >
                  {format.toUpperCase()}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => {}}
                title="Zoom Out"
              >
                <ZoomOut className="h-3 w-3" style={{ color: 'var(--studio-text-muted)' }} />
              </Button>
              <span className="text-[10px] w-8 text-center" style={{ color: 'var(--studio-text-muted)' }}>
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => {}}
                title="Zoom In"
              >
                <ZoomIn className="h-3 w-3" style={{ color: 'var(--studio-text-muted)' }} />
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Video className="h-5 w-5 text-purple-500" />
              {previewClip?.name || 'Video Preview'}
              {previewClip && (
                <Badge
                  className="ml-2"
                  style={{ backgroundColor: getFormatBadgeColor(previewClip.format) }}
                >
                  {previewClip.format.toUpperCase()}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {previewClip && (
                <>
                  {previewClip.width}x{previewClip.height} • {previewClip.frameRate}fps •{' '}
                  {previewClip.duration.toFixed(2)}s
                  {previewClip.hasAudio && ' • Audio'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            {previewClip && (
              <video
                ref={videoPreviewRef}
                src={previewClip.filePath}
                className="w-full h-full object-contain"
                muted={isMuted}
                onTimeUpdate={(e) => setPreviewTime(e.currentTarget.currentTime)}
              />
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-white hover:bg-white/20"
                  onClick={onPlayPause}
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>

                <div className="flex-1">
                  <Slider
                    value={[previewTime]}
                    max={previewClip?.duration || 100}
                    step={0.01}
                    onValueChange={([value]) => {
                      setPreviewTime(value);
                      if (videoPreviewRef.current) {
                        videoPreviewRef.current.currentTime = value;
                      }
                    }}
                    className="cursor-pointer"
                  />
                </div>

                <span className="text-xs text-white tabular-nums min-w-[80px] text-center">
                  {formatTime(previewTime)} / {formatTime(previewClip?.duration || 0)}
                </span>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-white hover:bg-white/20"
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-white hover:bg-white/20"
                  onClick={() => videoPreviewRef.current?.requestFullscreen()}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close
            </Button>
            {previewClip?.hasAudio && (
              <Button
                variant="secondary"
                onClick={() => {
                  handleExtractAudio();
                  setShowPreview(false);
                }}
              >
                <Music className="h-4 w-4 mr-2" />
                Extract Audio
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <canvas ref={thumbnailCanvasRef} className="hidden" width={THUMBNAIL_WIDTH} height={THUMBNAIL_HEIGHT} />
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export default VideoTrack;
