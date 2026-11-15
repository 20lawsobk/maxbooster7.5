// @ts-nocheck
import { useRef, useState, useCallback } from "react";
import { useStudioStore, LyricLine } from "@/lib/studioStore";
import { Plus, Trash2, Music2, GripVertical, Maximize2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GlobalLyricsTrackProps {
  duration: number;
  zoom: number;
  onTimeChange?: (time: number) => void;
  onOpenFullscreen?: () => void;
  onOpenLyricsPanel?: () => void;
}

export function GlobalLyricsTrack({
  duration,
  _zoom,
  onTimeChange,
  onOpenFullscreen,
  onOpenLyricsPanel,
}: GlobalLyricsTrackProps) {
  const {
    lyrics,
    lyricsTrackVisible,
    selectedLyricId,
    addLyric,
    updateLyric,
    deleteLyric,
    selectLyric,
    currentTime,
  } = useStudioStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const trackRef = useRef<HTMLDivElement>(null);

  const timeToPosition = useCallback(
    (time: number) => (time / duration) * 100,
    [duration],
  );

  const positionToTime = useCallback(
    (position: number, containerWidth: number) =>
      (position / containerWidth) * duration,
    [duration],
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || editingId) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const time = positionToTime(clickX, rect.width);

      const clickedLyric = lyrics.find(
        (l) => time >= l.startTime && time < l.endTime,
      );

      if (clickedLyric) {
        selectLyric(clickedLyric.id);
        if (onTimeChange) onTimeChange(clickedLyric.startTime);
      }
    },
    [lyrics, positionToTime, selectLyric, editingId, onTimeChange],
  );

  const handleAddLyric = useCallback(() => {
    const newLyric: LyricLine = {
      id: `lyric-${Date.now()}`,
      text: "New lyric",
      words: [
        {
          id: `word-${Date.now()}-0`,
          text: "New",
          startTime: currentTime,
          endTime: currentTime + 1,
        },
        {
          id: `word-${Date.now()}-1`,
          text: "lyric",
          startTime: currentTime + 1,
          endTime: currentTime + 2,
        },
      ],
      startTime: currentTime,
      endTime: currentTime + 4,
    };
    addLyric(newLyric);
    selectLyric(newLyric.id);
  }, [addLyric, selectLyric, currentTime]);

  const handleDoubleClick = useCallback((lyric: LyricLine) => {
    setEditingId(lyric.id);
    setEditText(lyric.text || lyric.words.map((w) => w.text).join(" "));
  }, []);

  const handleEditSubmit = useCallback(() => {
    if (editingId && editText.trim()) {
      const words = editText.trim().split(/\s+/);
      const lyric = lyrics.find((l) => l.id === editingId);
      if (lyric) {
        const wordDuration =
          (lyric.endTime - lyric.startTime) / (Math.max(words.length, 1) || 1);
        updateLyric(editingId, {
          text: editText.trim(),
          words: words.map((word, i) => ({
            id: `word-${Date.now()}-${i}`,
            text: word,
            startTime: lyric.startTime + i * wordDuration,
            endTime: lyric.startTime + (i + 1) * wordDuration,
          })),
        });
      }
    }
    setEditingId(null);
    setEditText("");
  }, [editingId, editText, lyrics, updateLyric]);

  const handleDeleteLyric = useCallback(
    (id: string) => {
      deleteLyric(id);
      if (selectedLyricId === id) selectLyric(null);
    },
    [deleteLyric, selectedLyricId, selectLyric],
  );

  return lyricsTrackVisible ? (
    <div
      className="h-12 border-b relative select-none"
      style={{
        borderColor: "var(--studio-border)",
        backgroundColor: "var(--studio-bg-deep)",
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-48 flex items-center gap-1 px-3 border-r z-10"
        style={{
          borderColor: "var(--studio-border)",
          backgroundColor: "var(--studio-bg-medium)",
        }}
      >
        <Music2 className="w-4 h-4" style={{ color: "var(--studio-accent)" }} />
        <span
          className="text-xs font-medium"
          style={{ color: "var(--studio-text)" }}
        >
          Lyrics
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleAddLyric}
            title="Add lyric"
          >
            <Plus className="w-3 h-3" />
          </Button>
          {onOpenLyricsPanel && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onOpenLyricsPanel}
              title="Edit lyrics"
            >
              <FileText className="w-3 h-3" />
            </Button>
          )}
          {onOpenFullscreen && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onOpenFullscreen}
              title="Fullscreen"
            >
              <Maximize2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        className="absolute left-48 right-0 top-0 bottom-0 overflow-hidden cursor-pointer"
        onClick={handleTrackClick}
        style={{ backgroundColor: "var(--studio-bg-deep)" }}
      >
        {lyrics.map((lyric) => {
          const left = timeToPosition(lyric.startTime);
          const width = timeToPosition(lyric.endTime - lyric.startTime);
          const isSelected = selectedLyricId === lyric.id;
          const isCurrent =
            currentTime >= lyric.startTime && currentTime < lyric.endTime;

          return (
            <div
              key={lyric.id}
              className="absolute top-1 bottom-1 rounded px-2 flex items-center gap-1 cursor-move transition-all"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 2)}%`,
                minWidth: "60px",
                backgroundColor: isCurrent
                  ? "var(--studio-accent)"
                  : isSelected
                    ? "rgba(251, 191, 36, 0.3)"
                    : "var(--studio-surface)",
                border: isSelected
                  ? "2px solid var(--studio-accent)"
                  : "1px solid var(--studio-border)",
                color: isCurrent ? "#000" : "var(--studio-text)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                selectLyric(lyric.id);
                if (onTimeChange) onTimeChange(lyric.startTime);
              }}
              onDoubleClick={() => handleDoubleClick(lyric)}
            >
              <GripVertical className="w-3 h-3 opacity-50 flex-shrink-0" />
              {editingId === lyric.id ? (
                <Input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={handleEditSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEditSubmit();
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditText("");
                    }
                  }}
                  className="h-6 text-xs px-1"
                  autoFocus
                />
              ) : (
                <span className="text-xs truncate flex-1">
                  {lyric.text || lyric.words.map((w) => w.text).join(" ")}
                </span>
              )}
              {isSelected && !editingId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteLyric(lyric.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          );
        })}

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-20"
          style={{ left: `${timeToPosition(currentTime)}%` }}
        />
      </div>
    </div>
  ) : null;
}
