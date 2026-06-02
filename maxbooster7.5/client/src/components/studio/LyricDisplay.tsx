import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlignLeft,
  AlignCenter,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  ChevronUp,
  ChevronDown,
  Music2,
  Mic,
  Clock,
  Type,
  Palette,
  Settings,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LyricLine {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  color?: string;
  type?: "verse" | "chorus" | "bridge" | "outro" | "intro" | "hook" | "adlib";
}

interface LyricDisplayProps {
  lyrics: LyricLine[];
  currentTime: number;
  isPlaying: boolean;
  tempo?: number;
  onLyricsChange?: (lyrics: LyricLine[]) => void;
  onSeek?: (time: number) => void;
  className?: string;
}

const SECTION_COLORS: Record<string, string> = {
  verse: "from-blue-500 to-cyan-500",
  chorus: "from-purple-500 to-pink-500",
  bridge: "from-amber-500 to-orange-500",
  outro: "from-red-500 to-rose-500",
  intro: "from-green-500 to-emerald-500",
  hook: "from-violet-500 to-purple-500",
  adlib: "from-zinc-500 to-slate-500",
};

const SECTION_LABELS: Record<string, string> = {
  verse: "Verse",
  chorus: "Chorus",
  bridge: "Bridge",
  outro: "Outro",
  intro: "Intro",
  hook: "Hook",
  adlib: "Ad-lib",
};

export function LyricDisplay({
  lyrics,
  currentTime,
  isPlaying,
  tempo = 120,
  onLyricsChange,
  onSeek,
  className,
}: LyricDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [displayMode, setDisplayMode] = useState<
    "scroll" | "karaoke" | "teleprompter"
  >("scroll");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">("lg");
  const [alignment, setAlignment] = useState<"left" | "center">("center");
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [countIn, setCountIn] = useState<number | null>(null);

  const currentLineIndex = useMemo(() => {
    return lyrics.findIndex(
      (line) => currentTime >= line.startTime && currentTime < line.endTime,
    );
  }, [lyrics, currentTime]);

  const nextLineIndex = currentLineIndex >= 0 ? currentLineIndex + 1 : 0;

  useEffect(() => {
    if (
      autoScroll &&
      activeLineRef.current &&
      containerRef.current &&
      isPlaying
    ) {
      const container = containerRef.current;
      const activeLine = activeLineRef.current;

      const containerRect = container.getBoundingClientRect();
      const lineRect = activeLine.getBoundingClientRect();

      const scrollTarget =
        activeLine.offsetTop - containerRect.height / 2 + lineRect.height / 2;

      container.scrollTo({
        top: scrollTarget,
        behavior: "smooth",
      });
    }
  }, [currentLineIndex, autoScroll, isPlaying]);

  useEffect(() => {
    if (isPlaying && currentLineIndex >= 0) {
      const currentLine = lyrics[currentLineIndex];
      const timeUntilEnd = currentLine.endTime - currentTime;

      if (timeUntilEnd <= 3 && timeUntilEnd > 0) {
        setCountIn(Math.ceil(timeUntilEnd));
      } else {
        setCountIn(null);
      }
    } else {
      setCountIn(null);
    }
  }, [currentTime, currentLineIndex, isPlaying, lyrics]);

  const handleAddLine = useCallback(() => {
    const newLine: LyricLine = {
      id: `line-${Date.now()}`,
      text: "New lyric line...",
      startTime: currentTime,
      endTime: currentTime + 4,
      type: "verse",
    };

    const updated = [...lyrics, newLine].sort(
      (a, b) => a.startTime - b.startTime,
    );
    onLyricsChange?.(updated);
  }, [lyrics, currentTime, onLyricsChange]);

  const handleDeleteLine = useCallback(
    (id: string) => {
      onLyricsChange?.(lyrics.filter((l) => l.id !== id));
    },
    [lyrics, onLyricsChange],
  );

  const handleEditLine = useCallback((line: LyricLine) => {
    setEditingLineId(line.id);
    setEditText(line.text);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingLineId) {
      const updated = lyrics.map((l) =>
        l.id === editingLineId ? { ...l, text: editText } : l,
      );
      onLyricsChange?.(updated);
      setEditingLineId(null);
      setEditText("");
    }
  }, [editingLineId, editText, lyrics, onLyricsChange]);

  const handleChangeType = useCallback(
    (id: string, type: LyricLine["type"]) => {
      const updated = lyrics.map((l) => (l.id === id ? { ...l, type } : l));
      onLyricsChange?.(updated);
    },
    [lyrics, onLyricsChange],
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const fontSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
    xl: "text-4xl",
  };

  return (
    <div
      className={cn(
        "relative flex flex-col bg-gradient-to-b from-zinc-900 to-black rounded-xl overflow-hidden border border-zinc-800",
        isFullscreen && "fixed inset-0 z-50 rounded-none",
        className,
      )}
    >
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <Mic className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Lyrics</h3>
            <p className="text-[10px] text-zinc-500">Studio One Style</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 mr-2">
            {(["scroll", "karaoke", "teleprompter"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDisplayMode(mode)}
                className={cn(
                  "px-2 py-1 text-[10px] rounded-md transition-all capitalize",
                  displayMode === mode
                    ? "bg-purple-600 text-white"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setAlignment(alignment === "left" ? "center" : "left")
            }
            className="h-7 w-7 text-zinc-400 hover:text-white"
          >
            {alignment === "left" ? (
              <AlignLeft className="w-3.5 h-3.5" />
            ) : (
              <AlignCenter className="w-3.5 h-3.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              "h-7 w-7",
              autoScroll ? "text-purple-400" : "text-zinc-400",
            )}
          >
            {autoScroll ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "h-7 w-7",
              showSettings ? "text-purple-400" : "text-zinc-400",
            )}
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              "h-7 w-7",
              isEditing ? "text-purple-400" : "text-zinc-400",
            )}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-7 w-7 text-zinc-400 hover:text-white"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-zinc-800 bg-zinc-900/50 overflow-hidden"
          >
            <div className="p-3 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-zinc-500" />
                <div className="flex bg-zinc-800 rounded-lg p-0.5">
                  {(["sm", "md", "lg", "xl"] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setFontSize(size)}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded-md transition-all uppercase",
                        fontSize === size
                          ? "bg-zinc-700 text-white"
                          : "text-zinc-500 hover:text-white",
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500" />
                <button
                  onClick={() => setShowTimestamps(!showTimestamps)}
                  className={cn(
                    "px-2 py-1 text-[10px] rounded-md transition-all",
                    showTimestamps
                      ? "bg-zinc-700 text-white"
                      : "bg-zinc-800 text-zinc-500",
                  )}
                >
                  Timestamps
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={containerRef}
        className={cn(
          "flex-1 overflow-y-auto px-6 py-8 scroll-smooth",
          displayMode === "teleprompter" && "flex flex-col justify-center",
        )}
      >
        {lyrics.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto">
                <Music2 className="w-8 h-8 text-zinc-600" />
              </div>
              <div>
                <p className="text-zinc-400">No lyrics yet</p>
                <p className="text-xs text-zinc-600">
                  Add lyrics to get started
                </p>
              </div>
              {isEditing && (
                <Button onClick={handleAddLine} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add First Line
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "space-y-4",
              displayMode === "karaoke" && "space-y-8",
            )}
          >
            {displayMode === "karaoke" && currentLineIndex >= 0 && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentLineIndex}
                  initial={{ opacity: 0, y: 50, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -50, scale: 0.9 }}
                  className="text-center py-16"
                >
                  <div
                    className={cn(
                      "text-5xl font-bold text-white mb-4",
                      lyrics[currentLineIndex]?.type &&
                        `bg-gradient-to-r ${SECTION_COLORS[lyrics[currentLineIndex].type!]} bg-clip-text text-transparent`,
                    )}
                  >
                    {lyrics[currentLineIndex]?.text}
                  </div>
                  {nextLineIndex < lyrics.length && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      className="text-2xl text-zinc-500"
                    >
                      {lyrics[nextLineIndex]?.text}
                    </motion.div>
                  )}
                  {countIn && (
                    <motion.div
                      key={countIn}
                      initial={{ scale: 2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="mt-8 text-6xl font-bold text-purple-400"
                    >
                      {countIn}
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            {displayMode !== "karaoke" &&
              lyrics.map((line, index) => {
                const isActive = index === currentLineIndex;
                const isPast =
                  currentLineIndex >= 0 && index < currentLineIndex;
                const isUpcoming =
                  currentLineIndex >= 0 && index === nextLineIndex;
                const sectionColor = line.type ? SECTION_COLORS[line.type] : "";

                return (
                  <motion.div
                    key={line.id}
                    ref={isActive ? activeLineRef : undefined}
                    layout
                    className={cn(
                      "group relative rounded-lg transition-all duration-300",
                      isActive && "scale-105",
                      alignment === "center" ? "text-center" : "text-left",
                    )}
                    animate={{
                      opacity: isActive ? 1 : isPast ? 0.4 : 0.7,
                    }}
                  >
                    {showTimestamps && (
                      <div className="absolute -left-20 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                        {formatTime(line.startTime)}
                      </div>
                    )}

                    {line.type && (
                      <div
                        className={cn(
                          "inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1",
                          `bg-gradient-to-r ${sectionColor} text-white`,
                        )}
                      >
                        {SECTION_LABELS[line.type]}
                      </div>
                    )}

                    {editingLineId === line.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                          autoFocus
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleSaveEdit()
                          }
                        />
                        <Button
                          size="icon"
                          onClick={handleSaveEdit}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingLineId(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "cursor-pointer transition-all",
                          fontSizeClasses[fontSize],
                          isActive
                            ? sectionColor
                              ? `font-bold bg-gradient-to-r ${sectionColor} bg-clip-text text-transparent`
                              : "font-bold text-white"
                            : isUpcoming
                              ? "text-zinc-400"
                              : isPast
                                ? "text-zinc-600"
                                : "text-zinc-400",
                          displayMode === "teleprompter" &&
                            isActive &&
                            "text-4xl",
                        )}
                        onClick={() => onSeek?.(line.startTime)}
                      >
                        {line.text}

                        {isActive && displayMode === "scroll" && (
                          <motion.div
                            className="absolute -right-8 top-1/2 -translate-y-1/2"
                            animate={{ x: [0, 5, 0] }}
                            transition={{ repeat: Infinity, duration: 0.8 }}
                          >
                            <div className="w-2 h-2 rounded-full bg-purple-500" />
                          </motion.div>
                        )}
                      </div>
                    )}

                    {isEditing && !editingLineId && (
                      <div className="absolute -right-24 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <select
                          value={line.type || "verse"}
                          onChange={(e) =>
                            handleChangeType(
                              line.id,
                              e.target.value as LyricLine["type"],
                            )
                          }
                          className="text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300"
                        >
                          {Object.entries(SECTION_LABELS).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEditLine(line)}
                          className="h-6 w-6 text-zinc-400 hover:text-white"
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteLine(line.id)}
                          className="h-6 w-6 text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
          </div>
        )}
      </div>

      {isEditing && (
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/80">
          <Button onClick={handleAddLine} size="sm" className="w-full gap-2">
            <Plus className="w-4 h-4" />
            Add Lyric Line at {formatTime(currentTime)}
          </Button>
        </div>
      )}

      {displayMode === "teleprompter" && isPlaying && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900/90 backdrop-blur px-4 py-2 rounded-full border border-zinc-700">
          <div className="text-xs text-zinc-500">
            Line {currentLineIndex + 1} of {lyrics.length}
          </div>
          <div className="w-32 h-1 bg-zinc-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-purple-500"
              style={{
                width:
                  currentLineIndex >= 0
                    ? `${((currentTime - lyrics[currentLineIndex]?.startTime) / (lyrics[currentLineIndex]?.endTime - lyrics[currentLineIndex]?.startTime)) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
