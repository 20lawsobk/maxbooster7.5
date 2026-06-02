import { useEffect, useRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useStudioStore } from "@/lib/studioStore";
import { Button } from "@/components/ui/button";
import {
  X,
  Settings,
  Maximize2,
  Minimize2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Palette,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useDialogContainer } from "@/components/ui/dialog";

interface LyricsDisplayWindowProps {
  onClose?: () => void;
}

export function LyricsDisplayWindow({ onClose }: LyricsDisplayWindowProps) {
  const {
    lyrics,
    lyricsDisplayVisible,
    lyricsDisplaySettings,
    currentTime,
    isPlaying,
    toggleLyricsDisplay,
    updateLyricsDisplaySettings,
    setCurrentTime,
  } = useStudioStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeLyricRef = useRef<HTMLDivElement>(null);
  const container = useDialogContainer();

  const fontSizeMap = {
    small: "1rem",
    medium: "1.5rem",
    large: "2rem",
    xlarge: "3rem",
  };

  const currentLineIndex = useMemo(() => {
    return lyrics.findIndex(
      (line) => currentTime >= line.startTime && currentTime < line.endTime,
    );
  }, [lyrics, currentTime]);

  const currentWordIndex = useMemo(() => {
    if (currentLineIndex < 0) return -1;
    const line = lyrics[currentLineIndex];
    return line.words.findIndex(
      (word) => currentTime >= word.startTime && currentTime < word.endTime,
    );
  }, [lyrics, currentLineIndex, currentTime]);

  useEffect(() => {
    if (isPlaying && activeLyricRef.current && scrollContainerRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentLineIndex, isPlaying]);

  const handleLineClick = (line: (typeof lyrics)[0]) => {
    setCurrentTime(line.startTime);
  };

  if (!lyricsDisplayVisible) {
    return null;
  }

  const content = (
    <AnimatePresence>
      <motion.div
        className={`fixed z-[9997] flex flex-col rounded-lg shadow-2xl overflow-hidden ${
          isFullscreen
            ? "inset-0 rounded-none"
            : "bottom-4 right-4 w-[400px] max-h-[500px]"
        }`}
        style={{
          backgroundColor: lyricsDisplaySettings.backgroundColor,
        }}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <span
            className="text-sm font-medium"
            style={{ color: lyricsDisplaySettings.textColor }}
          >
            Lyrics Display
          </span>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Settings
                    className="w-4 h-4"
                    style={{ color: lyricsDisplaySettings.textColor }}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Font Size</DropdownMenuLabel>
                {(["small", "medium", "large", "xlarge"] as const).map(
                  (size) => (
                    <DropdownMenuItem
                      key={size}
                      onClick={() =>
                        updateLyricsDisplaySettings({ fontSize: size })
                      }
                    >
                      <Type className="w-4 h-4 mr-2" />
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                      {lyricsDisplaySettings.fontSize === size && " ✓"}
                    </DropdownMenuItem>
                  ),
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Alignment</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() =>
                    updateLyricsDisplaySettings({ textAlign: "left" })
                  }
                >
                  <AlignLeft className="w-4 h-4 mr-2" />
                  Left
                  {lyricsDisplaySettings.textAlign === "left" && " ✓"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    updateLyricsDisplaySettings({ textAlign: "center" })
                  }
                >
                  <AlignCenter className="w-4 h-4 mr-2" />
                  Center
                  {lyricsDisplaySettings.textAlign === "center" && " ✓"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    updateLyricsDisplaySettings({ textAlign: "right" })
                  }
                >
                  <AlignRight className="w-4 h-4 mr-2" />
                  Right
                  {lyricsDisplaySettings.textAlign === "right" && " ✓"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    updateLyricsDisplaySettings({
                      showWordHighlight:
                        !lyricsDisplaySettings.showWordHighlight,
                    })
                  }
                >
                  <Palette className="w-4 h-4 mr-2" />
                  Word Highlight{" "}
                  {lyricsDisplaySettings.showWordHighlight ? "✓" : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? (
                <Minimize2
                  className="w-4 h-4"
                  style={{ color: lyricsDisplaySettings.textColor }}
                />
              ) : (
                <Maximize2
                  className="w-4 h-4"
                  style={{ color: lyricsDisplaySettings.textColor }}
                />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => {
                toggleLyricsDisplay();
                onClose?.();
              }}
            >
              <X
                className="w-4 h-4"
                style={{ color: lyricsDisplaySettings.textColor }}
              />
            </Button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-6"
          style={{
            fontFamily: lyricsDisplaySettings.fontFamily,
            fontSize: fontSizeMap[lyricsDisplaySettings.fontSize],
            lineHeight: lyricsDisplaySettings.lineSpacing,
            textAlign: lyricsDisplaySettings.textAlign,
          }}
        >
          {lyrics.length === 0 ? (
            <div
              className="flex items-center justify-center h-full opacity-50"
              style={{ color: lyricsDisplaySettings.textColor }}
            >
              No lyrics available
            </div>
          ) : (
            <div className="space-y-4">
              {lyrics.map((line, lineIndex) => {
                const isCurrentLine = lineIndex === currentLineIndex;
                const isPastLine = lineIndex < currentLineIndex;

                return (
                  <div
                    key={line.id}
                    ref={isCurrentLine ? activeLyricRef : undefined}
                    className="transition-all duration-300 cursor-pointer hover:opacity-80"
                    style={{
                      color: isCurrentLine
                        ? lyricsDisplaySettings.highlightColor
                        : isPastLine
                          ? `${lyricsDisplaySettings.textColor}80`
                          : lyricsDisplaySettings.textColor,
                      transform: isCurrentLine ? "scale(1.05)" : "scale(1)",
                      opacity: isCurrentLine ? 1 : isPastLine ? 0.5 : 0.8,
                    }}
                    onClick={() => handleLineClick(line)}
                  >
                    {lyricsDisplaySettings.showWordHighlight &&
                    isCurrentLine ? (
                      <span>
                        {line.words.map((word, wordIndex) => {
                          const isCurrentWord = wordIndex === currentWordIndex;
                          const isPastWord = wordIndex < currentWordIndex;
                          return (
                            <span
                              key={word.id}
                              className="transition-all duration-150"
                              style={{
                                color: isCurrentWord
                                  ? lyricsDisplaySettings.highlightColor
                                  : isPastWord
                                    ? lyricsDisplaySettings.highlightColor
                                    : lyricsDisplaySettings.textColor,
                                fontWeight: isCurrentWord ? "bold" : "normal",
                                textShadow: isCurrentWord
                                  ? "0 0 10px currentColor"
                                  : "none",
                              }}
                            >
                              {word.text}{" "}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span>
                        {line.text || line.words.map((w) => w.text).join(" ")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {lyricsDisplaySettings.teleprompterMode && (
          <div
            className="text-xs text-center py-2 border-t"
            style={{
              borderColor: "rgba(255,255,255,0.1)",
              color: lyricsDisplaySettings.textColor,
              opacity: 0.6,
            }}
          >
            Teleprompter Mode
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

  if (container) {
    return createPortal(content, container);
  }

  return content;
}
