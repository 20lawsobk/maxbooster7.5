import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  Upload,
  Download,
  Maximize2,
  Minimize2,
  Type,
  Gauge,
  GripVertical,
  X,
  ChevronUp,
  ChevronDown,
  Link,
  Unlink,
  Play,
  Pause,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useStudioStore } from '@/lib/studioStore';

export interface LyricWord {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface LyricLine {
  id: string;
  words: LyricWord[];
  startTime: number;
  endTime: number;
}

interface LyricsTrackProps {
  duration: number;
  onTimelineClick?: (time: number) => void;
  onLyricsChange?: (lines: LyricLine[]) => void;
  initialLyrics?: LyricLine[];
}

const LINE_COLORS = [
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

const parseLRC = (content: string): LyricLine[] => {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.+)/g;
  let match;
  let lineIndex = 0;

  while ((match = regex.exec(content)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
    const startTime = minutes * 60 + seconds + milliseconds / 1000;
    const text = match[4].trim();

    if (text) {
      const words = text.split(/\s+/).map((word, wordIndex) => {
        const wordDuration = 0.3;
        const wordStart = startTime + wordIndex * wordDuration;
        return {
          id: `word-${Date.now()}-${lineIndex}-${wordIndex}`,
          text: word,
          startTime: wordStart,
          endTime: wordStart + wordDuration,
        };
      });

      const lineEndTime = words.length > 0 ? words[words.length - 1].endTime : startTime + 2;

      lines.push({
        id: `line-${Date.now()}-${lineIndex}`,
        words,
        startTime,
        endTime: lineEndTime,
      });
      lineIndex++;
    }
  }

  return lines.sort((a, b) => a.startTime - b.startTime);
};

const parseSimpleText = (content: string, startTime: number = 0, lineDuration: number = 4): LyricLine[] => {
  const textLines = content.split('\n').filter(line => line.trim());
  return textLines.map((text, lineIndex) => {
    const lineStartTime = startTime + lineIndex * lineDuration;
    const words = text.trim().split(/\s+/).map((word, wordIndex, arr) => {
      const wordDuration = lineDuration / arr.length;
      const wordStart = lineStartTime + wordIndex * wordDuration;
      return {
        id: `word-${Date.now()}-${lineIndex}-${wordIndex}`,
        text: word,
        startTime: wordStart,
        endTime: wordStart + wordDuration * 0.9,
      };
    });

    return {
      id: `line-${Date.now()}-${lineIndex}`,
      words,
      startTime: lineStartTime,
      endTime: lineStartTime + lineDuration,
    };
  });
};

const exportToLRC = (lines: LyricLine[]): string => {
  return lines
    .sort((a, b) => a.startTime - b.startTime)
    .map(line => {
      const minutes = Math.floor(line.startTime / 60);
      const seconds = Math.floor(line.startTime % 60);
      const centiseconds = Math.floor((line.startTime % 1) * 100);
      const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}]`;
      const text = line.words.map(w => w.text).join(' ');
      return `${timestamp}${text}`;
    })
    .join('\n');
};

export function LyricsTrack({
  duration,
  onTimelineClick,
  onLyricsChange,
  initialLyrics = [],
}: LyricsTrackProps) {
  const { currentTime, snapEnabled, snapResolution, isPlaying, setCurrentTime } = useStudioStore();

  const [lines, setLines] = useState<LyricLine[]>(initialLyrics);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [teleprompterMode, setTeleprompterMode] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);

  const [draggingLine, setDraggingLine] = useState<string | null>(null);
  const [resizingLine, setResizingLine] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [previewPosition, setPreviewPosition] = useState<{ startTime: number; endTime: number } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const teleprompterRef = useRef<HTMLDivElement>(null);

  const pixelsToTime = useCallback((pixels: number): number => {
    if (!timelineRef.current) return 0;
    const width = timelineRef.current.offsetWidth;
    return (pixels / width) * duration;
  }, [duration]);

  const timeToPixels = useCallback((time: number): number => {
    if (!timelineRef.current) return 0;
    const width = timelineRef.current.offsetWidth;
    return (time / duration) * width;
  }, [duration]);

  const snapToGrid = useCallback((time: number): number => {
    if (!snapEnabled) return time;
    return Math.round(time / snapResolution) * snapResolution;
  }, [snapEnabled, snapResolution]);

  const getCurrentLine = useMemo(() => {
    return lines.find(line => currentTime >= line.startTime && currentTime <= line.endTime);
  }, [lines, currentTime]);

  const getCurrentWordIndex = useMemo(() => {
    if (!getCurrentLine) return -1;
    return getCurrentLine.words.findIndex(
      word => currentTime >= word.startTime && currentTime <= word.endTime
    );
  }, [getCurrentLine, currentTime]);

  useEffect(() => {
    if (teleprompterMode && followPlayhead && teleprompterRef.current && getCurrentLine) {
      const lineElement = teleprompterRef.current.querySelector(
        `[data-line-id="${getCurrentLine.id}"]`
      );
      if (lineElement) {
        lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [getCurrentLine, teleprompterMode, followPlayhead]);

  const handleAddLine = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAdding || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let clickTime = pixelsToTime(x);
    clickTime = snapToGrid(clickTime);

    const newLine: LyricLine = {
      id: `line-${Date.now()}`,
      words: [
        {
          id: `word-${Date.now()}-0`,
          text: 'New',
          startTime: clickTime,
          endTime: clickTime + 0.3,
        },
        {
          id: `word-${Date.now()}-1`,
          text: 'lyric',
          startTime: clickTime + 0.3,
          endTime: clickTime + 0.6,
        },
        {
          id: `word-${Date.now()}-2`,
          text: 'line',
          startTime: clickTime + 0.6,
          endTime: clickTime + 0.9,
        },
      ],
      startTime: Math.max(0, Math.min(clickTime, duration - 1)),
      endTime: Math.max(0, Math.min(clickTime + 2, duration)),
    };

    const newLines = [...lines, newLine].sort((a, b) => a.startTime - b.startTime);
    setLines(newLines);
    setSelectedLineId(newLine.id);
    onLyricsChange?.(newLines);
    setIsAdding(false);
    setEditingLineId(newLine.id);
    setEditingText(newLine.words.map(w => w.text).join(' '));
  }, [isAdding, pixelsToTime, snapToGrid, duration, lines, onLyricsChange]);

  const handleLineClick = useCallback((e: React.MouseEvent, line: LyricLine) => {
    e.stopPropagation();
    setSelectedLineId(line.id);
    if (onTimelineClick) {
      onTimelineClick(line.startTime);
    }
  }, [onTimelineClick]);

  const handleWordClick = useCallback((e: React.MouseEvent, word: LyricWord) => {
    e.stopPropagation();
    setCurrentTime(word.startTime);
    if (onTimelineClick) {
      onTimelineClick(word.startTime);
    }
  }, [setCurrentTime, onTimelineClick]);

  const deleteLine = useCallback((lineId: string) => {
    const newLines = lines.filter(l => l.id !== lineId);
    setLines(newLines);
    if (selectedLineId === lineId) {
      setSelectedLineId(null);
    }
    onLyricsChange?.(newLines);
  }, [lines, selectedLineId, onLyricsChange]);

  const updateLine = useCallback((lineId: string, updates: Partial<LyricLine>) => {
    const newLines = lines.map(l =>
      l.id === lineId ? { ...l, ...updates } : l
    ).sort((a, b) => a.startTime - b.startTime);
    setLines(newLines);
    onLyricsChange?.(newLines);
  }, [lines, onLyricsChange]);

  const updateLineText = useCallback((lineId: string, text: string) => {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;

    const wordTexts = text.trim().split(/\s+/);
    const wordDuration = (line.endTime - line.startTime) / wordTexts.length;

    const newWords: LyricWord[] = wordTexts.map((wordText, index) => ({
      id: `word-${Date.now()}-${index}`,
      text: wordText,
      startTime: line.startTime + index * wordDuration,
      endTime: line.startTime + (index + 1) * wordDuration,
    }));

    updateLine(lineId, { words: newWords });
  }, [lines, updateLine]);

  const handleRippleEdit = useCallback((lineId: string, timeDelta: number) => {
    const lineIndex = lines.findIndex(l => l.id === lineId);
    if (lineIndex === -1) return;

    const newLines = lines.map((line, index) => {
      if (index >= lineIndex) {
        const newStartTime = Math.max(0, line.startTime + timeDelta);
        const newEndTime = Math.max(0, line.endTime + timeDelta);
        const newWords = line.words.map(word => ({
          ...word,
          startTime: Math.max(0, word.startTime + timeDelta),
          endTime: Math.max(0, word.endTime + timeDelta),
        }));
        return { ...line, startTime: newStartTime, endTime: newEndTime, words: newWords };
      }
      return line;
    });

    setLines(newLines);
    onLyricsChange?.(newLines);
  }, [lines, onLyricsChange]);

  const handleImport = useCallback(() => {
    let parsedLines: LyricLine[];
    if (importText.includes('[') && importText.includes(']')) {
      parsedLines = parseLRC(importText);
    } else {
      parsedLines = parseSimpleText(importText);
    }

    if (parsedLines.length > 0) {
      setLines(parsedLines);
      onLyricsChange?.(parsedLines);
    }
    setShowImportDialog(false);
    setImportText('');
  }, [importText, onLyricsChange]);

  const handleExport = useCallback(() => {
    const lrcContent = exportToLRC(lines);
    const blob = new Blob([lrcContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lyrics.lrc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [lines]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportText(content);
    };
    reader.readAsText(file);
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent, line: LyricLine) => {
    e.stopPropagation();
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickTime = pixelsToTime(clickX);

    setDragOffset(clickTime - line.startTime);
    setDraggingLine(line.id);
    setPreviewPosition({ startTime: line.startTime, endTime: line.endTime });
  }, [pixelsToTime]);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    if (!draggingLine || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseTime = pixelsToTime(mouseX);

    const line = lines.find(l => l.id === draggingLine);
    if (!line) return;

    let newStartTime = mouseTime - dragOffset;
    newStartTime = snapToGrid(newStartTime);
    const lineDuration = line.endTime - line.startTime;
    newStartTime = Math.max(0, Math.min(newStartTime, duration - lineDuration));

    setPreviewPosition({ startTime: newStartTime, endTime: newStartTime + lineDuration });
  }, [draggingLine, lines, pixelsToTime, snapToGrid, dragOffset, duration]);

  const handleDragEnd = useCallback(() => {
    if (!draggingLine || !previewPosition) {
      setDraggingLine(null);
      setPreviewPosition(null);
      return;
    }

    const line = lines.find(l => l.id === draggingLine);
    if (line) {
      const timeDelta = previewPosition.startTime - line.startTime;
      const lineDuration = line.endTime - line.startTime;

      const newWords = line.words.map(word => ({
        ...word,
        startTime: word.startTime + timeDelta,
        endTime: word.endTime + timeDelta,
      }));

      updateLine(draggingLine, {
        startTime: previewPosition.startTime,
        endTime: previewPosition.startTime + lineDuration,
        words: newWords,
      });
    }

    setDraggingLine(null);
    setPreviewPosition(null);
  }, [draggingLine, previewPosition, lines, updateLine]);

  const handleResizeStart = useCallback((e: React.MouseEvent, lineId: string, edge: 'start' | 'end', line: LyricLine) => {
    e.stopPropagation();
    setResizingLine({ id: lineId, edge });
    setPreviewPosition({ startTime: line.startTime, endTime: line.endTime });
  }, []);

  const handleResize = useCallback((e: React.MouseEvent) => {
    if (!resizingLine || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let mouseTime = pixelsToTime(mouseX);
    mouseTime = snapToGrid(mouseTime);

    const line = lines.find(l => l.id === resizingLine.id);
    if (!line) return;

    let newStartTime = line.startTime;
    let newEndTime = line.endTime;

    if (resizingLine.edge === 'start') {
      newStartTime = Math.max(0, Math.min(mouseTime, line.endTime - 0.5));
    } else {
      newEndTime = Math.max(line.startTime + 0.5, Math.min(mouseTime, duration));
    }

    setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
  }, [resizingLine, lines, pixelsToTime, snapToGrid, duration]);

  const handleResizeEnd = useCallback(() => {
    if (!resizingLine || !previewPosition) {
      setResizingLine(null);
      setPreviewPosition(null);
      return;
    }

    const line = lines.find(l => l.id === resizingLine.id);
    if (line) {
      const newDuration = previewPosition.endTime - previewPosition.startTime;
      const oldDuration = line.endTime - line.startTime;
      const scaleFactor = newDuration / oldDuration;

      const newWords = line.words.map(word => {
        const relativeStart = (word.startTime - line.startTime) * scaleFactor;
        const relativeEnd = (word.endTime - line.startTime) * scaleFactor;
        return {
          ...word,
          startTime: previewPosition.startTime + relativeStart,
          endTime: previewPosition.startTime + relativeEnd,
        };
      });

      updateLine(resizingLine.id, {
        startTime: previewPosition.startTime,
        endTime: previewPosition.endTime,
        words: newWords,
      });
    }

    setResizingLine(null);
    setPreviewPosition(null);
  }, [resizingLine, previewPosition, lines, updateLine]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const mouseEvent = e as unknown as React.MouseEvent;
      if (draggingLine) {
        handleDrag(mouseEvent);
      } else if (resizingLine) {
        handleResize(mouseEvent);
      }
    };

    const handleMouseUp = () => {
      if (draggingLine) {
        handleDragEnd();
      } else if (resizingLine) {
        handleResizeEnd();
      }
    };

    if (draggingLine || resizingLine) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingLine, resizingLine, handleDrag, handleDragEnd, handleResize, handleResizeEnd]);

  const startEdit = useCallback((line: LyricLine) => {
    setEditingLineId(line.id);
    setEditingText(line.words.map(w => w.text).join(' '));
  }, []);

  const saveEdit = useCallback(() => {
    if (editingLineId && editingText.trim()) {
      updateLineText(editingLineId, editingText.trim());
    }
    setEditingLineId(null);
    setEditingText('');
  }, [editingLineId, editingText, updateLineText]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      setEditingLineId(null);
      setEditingText('');
    }
  }, [saveEdit]);

  const selectedLine = useMemo(() =>
    lines.find(l => l.id === selectedLineId),
    [lines, selectedLineId]
  );

  return (
    <div className="relative">
      <div
        className="h-10 flex items-center justify-between px-3 border-b"
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--studio-text-muted)' }}>
            LYRICS
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
            {lines.length} lines
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 mr-2">
            <Switch
              id="follow-lyrics"
              checked={followPlayhead}
              onCheckedChange={setFollowPlayhead}
              className="scale-75"
            />
            <Label htmlFor="follow-lyrics" className="text-[10px] cursor-pointer" style={{ color: 'var(--studio-text-muted)' }}>
              Follow
            </Label>
            {followPlayhead ? (
              <Link className="h-3 w-3 text-blue-400" />
            ) : (
              <Unlink className="h-3 w-3" style={{ color: 'var(--studio-text-muted)' }} />
            )}
          </div>

          <Popover open={showSettingsPopover} onOpenChange={setShowSettingsPopover}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                title="Settings"
              >
                <Type className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="space-y-4">
                <div className="text-xs font-semibold">Display Settings</div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px]">Font Size</Label>
                    <span className="text-[10px] text-muted-foreground">{fontSize}px</span>
                  </div>
                  <Slider
                    value={[fontSize]}
                    onValueChange={([value]) => setFontSize(value)}
                    min={12}
                    max={48}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px]">Scroll Speed</Label>
                    <span className="text-[10px] text-muted-foreground">{scrollSpeed}x</span>
                  </div>
                  <Slider
                    value={[scrollSpeed]}
                    onValueChange={([value]) => setScrollSpeed(value)}
                    min={0.5}
                    max={3}
                    step={0.1}
                    className="w-full"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${teleprompterMode ? 'bg-purple-500/20' : ''}`}
            onClick={() => setTeleprompterMode(!teleprompterMode)}
            title={teleprompterMode ? 'Exit teleprompter mode' : 'Teleprompter mode'}
          >
            {teleprompterMode ? (
              <Minimize2 className="h-3.5 w-3.5 text-purple-400" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setShowImportDialog(true)}
            title="Import lyrics"
          >
            <Upload className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleExport}
            disabled={lines.length === 0}
            title="Export to LRC"
          >
            <Download className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${isAdding ? 'bg-blue-500/20' : ''}`}
            onClick={() => setIsAdding(!isAdding)}
            title={isAdding ? 'Cancel adding' : 'Add lyric line'}
          >
            {isAdding ? (
              <X className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
            ) : (
              <Plus className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
            )}
          </Button>
        </div>
      </div>

      <div
        ref={timelineRef}
        className={`h-20 relative border-b ${isAdding ? 'cursor-crosshair' : ''}`}
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
        onClick={handleAddLine}
        data-testid="lyrics-track-timeline"
      >
        {isAdding && lines.length === 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Click to add lyric line
          </div>
        )}

        {lines.map((line, lineIndex) => {
          const isSelected = line.id === selectedLineId;
          const isDragging = line.id === draggingLine;
          const isResizing = resizingLine?.id === line.id;
          const isCurrentLine = getCurrentLine?.id === line.id;
          const showPreview = isDragging || isResizing;

          const displayStartTime = showPreview && previewPosition ? previewPosition.startTime : line.startTime;
          const displayEndTime = showPreview && previewPosition ? previewPosition.endTime : line.endTime;
          const displayDuration = displayEndTime - displayStartTime;
          const lineColor = LINE_COLORS[lineIndex % LINE_COLORS.length];

          return (
            <ContextMenu key={line.id}>
              <ContextMenuTrigger>
                <div
                  className={`absolute top-2 bottom-2 rounded-md cursor-move transition-all ${
                    isSelected ? 'ring-2 ring-white z-10' : 'hover:ring-2 hover:ring-white/50'
                  } ${isDragging || isResizing ? 'opacity-70' : ''} ${
                    isCurrentLine ? 'ring-2 ring-yellow-400' : ''
                  }`}
                  style={{
                    left: `${(displayStartTime / duration) * 100}%`,
                    width: `${(displayDuration / duration) * 100}%`,
                    backgroundColor: lineColor,
                    minWidth: '60px',
                  }}
                  onClick={(e) => handleLineClick(e, line)}
                  onMouseDown={(e) => handleDragStart(e, line)}
                  data-testid={`lyric-line-${line.id}`}
                >
                  <div className="h-full flex items-center px-2 gap-1 overflow-hidden">
                    {editingLineId === line.id ? (
                      <Input
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={handleKeyDown}
                        className="h-6 text-xs bg-white/10 border-white/20"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      line.words.map((word, wordIndex) => {
                        const isCurrentWord = isCurrentLine && getCurrentWordIndex === wordIndex;
                        const isPastWord = isCurrentLine && wordIndex < getCurrentWordIndex;

                        return (
                          <span
                            key={word.id}
                            className={`text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                              isCurrentWord
                                ? 'text-yellow-300 scale-110 font-bold'
                                : isPastWord
                                ? 'text-white/60'
                                : 'text-white'
                            }`}
                            style={{
                              textShadow: isCurrentWord ? '0 0 8px rgba(253, 224, 71, 0.8)' : 'none',
                            }}
                            onClick={(e) => handleWordClick(e, word)}
                          >
                            {word.text}
                          </span>
                        );
                      })
                    )}
                  </div>

                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 rounded-l"
                    onMouseDown={(e) => handleResizeStart(e, line.id, 'start', line)}
                    data-testid={`lyric-line-${line.id}-resize-start`}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 rounded-r"
                    onMouseDown={(e) => handleResizeStart(e, line.id, 'end', line)}
                    data-testid={`lyric-line-${line.id}-resize-end`}
                  />
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => startEdit(line)}>
                  <Edit2 className="h-3 w-3 mr-2" />
                  Edit Text
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onTimelineClick?.(line.startTime)}>
                  <Play className="h-3 w-3 mr-2" />
                  Jump to Line
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleRippleEdit(line.id, -0.5)}>
                  <ChevronUp className="h-3 w-3 mr-2" />
                  Ripple Earlier (0.5s)
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleRippleEdit(line.id, 0.5)}>
                  <ChevronDown className="h-3 w-3 mr-2" />
                  Ripple Later (0.5s)
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => deleteLine(line.id)} className="text-red-400">
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete Line
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20"
            style={{
              left: `${(currentTime / duration) * 100}%`,
            }}
          />
        )}
      </div>

      {teleprompterMode && (
        <Dialog open={teleprompterMode} onOpenChange={setTeleprompterMode}>
          <DialogContent className="max-w-4xl h-[80vh] flex flex-col bg-black/95 border-gray-800">
            <DialogHeader className="flex-shrink-0">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-white flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Teleprompter Mode
                </DialogTitle>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Type className="h-4 w-4 text-gray-400" />
                    <Slider
                      value={[fontSize]}
                      onValueChange={([value]) => setFontSize(value)}
                      min={24}
                      max={72}
                      step={2}
                      className="w-24"
                    />
                    <span className="text-xs text-gray-400 w-10">{fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-gray-400" />
                    <Slider
                      value={[scrollSpeed]}
                      onValueChange={([value]) => setScrollSpeed(value)}
                      min={0.5}
                      max={3}
                      step={0.1}
                      className="w-24"
                    />
                    <span className="text-xs text-gray-400 w-10">{scrollSpeed}x</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="teleprompter-follow"
                      checked={followPlayhead}
                      onCheckedChange={setFollowPlayhead}
                      className="scale-75"
                    />
                    <Label htmlFor="teleprompter-follow" className="text-xs text-gray-400">
                      Auto-scroll
                    </Label>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div
              ref={teleprompterRef}
              className="flex-1 overflow-y-auto px-8 py-12 scroll-smooth"
              style={{
                scrollBehavior: followPlayhead ? 'smooth' : 'auto',
              }}
            >
              {lines.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-xl">
                  No lyrics to display. Import or add lyrics to get started.
                </div>
              ) : (
                <div className="space-y-8 text-center">
                  {lines.map((line) => {
                    const isCurrentLine = getCurrentLine?.id === line.id;
                    const isPastLine = line.endTime < currentTime;
                    const isFutureLine = line.startTime > currentTime;

                    return (
                      <div
                        key={line.id}
                        data-line-id={line.id}
                        className={`transition-all duration-300 cursor-pointer ${
                          isCurrentLine
                            ? 'scale-105'
                            : isPastLine
                            ? 'opacity-30'
                            : isFutureLine
                            ? 'opacity-60'
                            : ''
                        }`}
                        style={{ fontSize: `${fontSize}px` }}
                        onClick={() => {
                          setCurrentTime(line.startTime);
                          onTimelineClick?.(line.startTime);
                        }}
                      >
                        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
                          {line.words.map((word, wordIndex) => {
                            const isCurrentWord = isCurrentLine && getCurrentWordIndex === wordIndex;
                            const isPastWord = isCurrentLine && wordIndex < getCurrentWordIndex;

                            return (
                              <span
                                key={word.id}
                                className={`font-bold transition-all duration-150 ${
                                  isCurrentWord
                                    ? 'text-yellow-400 scale-110'
                                    : isPastWord
                                    ? 'text-gray-400'
                                    : isCurrentLine
                                    ? 'text-white'
                                    : 'text-gray-300'
                                }`}
                                style={{
                                  textShadow: isCurrentWord
                                    ? '0 0 20px rgba(253, 224, 71, 0.8), 0 0 40px rgba(253, 224, 71, 0.4)'
                                    : 'none',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCurrentTime(word.startTime);
                                  onTimelineClick?.(word.startTime);
                                }}
                              >
                                {word.text}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex-shrink-0 border-t border-gray-800 pt-4 pb-2">
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>
                    {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}
                  </span>
                  <div className="w-64 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                  </div>
                  <span>
                    {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Lyrics
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".lrc,.txt"
                onChange={handleFileImport}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">or paste below</span>
            </div>

            <Textarea
              placeholder="Paste lyrics here...&#10;&#10;Supports:&#10;- Plain text (auto-timed)&#10;- LRC format [mm:ss.xx]lyrics"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
            />

            <div className="text-xs text-muted-foreground">
              <p><strong>LRC Format Example:</strong></p>
              <pre className="bg-muted p-2 rounded mt-1">
{`[00:05.00]First line of lyrics
[00:10.00]Second line of lyrics
[00:15.50]Third line of lyrics`}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!importText.trim()}>
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
