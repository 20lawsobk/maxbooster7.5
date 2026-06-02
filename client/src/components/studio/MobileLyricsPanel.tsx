import { useState, useCallback, useEffect } from "react";
import { X, Plus, Trash2, Clock, AlignLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LyricSection,
  LyricLine,
  SectionType,
  makeDefaultSections,
} from "./LyricsPanel";

const SECTION_COLORS: Record<SectionType, string> = {
  verse: "bg-blue-600 text-white",
  chorus: "bg-pink-600 text-white",
  bridge: "bg-amber-600 text-white",
  intro: "bg-indigo-600 text-white",
  "pre-chorus": "bg-purple-600 text-white",
  outro: "bg-gray-600 text-white",
  custom: "bg-emerald-600 text-white",
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

interface MobileLyricsPanelProps {
  open: boolean;
  onClose: () => void;
  sections: LyricSection[];
  activeSectionId: string;
  onSectionsChange: (s: LyricSection[]) => void;
  onActiveSectionChange: (id: string) => void;
  currentTime?: number;
  onSeek?: (t: number) => void;
  isPlaying?: boolean;
}

export default function MobileLyricsPanel({
  open,
  onClose,
  sections,
  activeSectionId,
  onSectionsChange,
  onActiveSectionChange,
  currentTime = 0,
  onSeek,
  isPlaying = false,
}: MobileLyricsPanelProps) {
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
  const activeSection =
    sections.find((s) => s.id === activeSectionId) ?? sections[0] ?? null;

  useEffect(() => {
    if (open && sections.length === 0) {
      const defaults = makeDefaultSections();
      onSectionsChange(defaults);
      if (defaults[0]) onActiveSectionChange(defaults[0].id);
    }
  }, [open]);

  const updateLine = useCallback(
    (sectionId: string, lineId: string, text: string) => {
      onSectionsChange(
        sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lines: s.lines.map((l) =>
                  l.id === lineId ? { ...l, text } : l,
                ),
              },
        ),
      );
    },
    [sections, onSectionsChange],
  );

  const addLine = useCallback(
    (sectionId: string, afterLineId: string) => {
      onSectionsChange(
        sections.map((s) => {
          if (s.id !== sectionId) return s;
          const idx = s.lines.findIndex((l) => l.id === afterLineId);
          const newLine: LyricLine = { id: genId(), text: "", timestamp: 0 };
          const lines = [...s.lines];
          lines.splice(idx + 1, 0, newLine);
          return { ...s, lines };
        }),
      );
    },
    [sections, onSectionsChange],
  );

  const deleteLine = useCallback(
    (sectionId: string, lineId: string) => {
      onSectionsChange(
        sections.map((s) => {
          if (s.id !== sectionId) return s;
          const lines = s.lines.filter((l) => l.id !== lineId);
          return {
            ...s,
            lines:
              lines.length === 0
                ? [{ id: genId(), text: "", timestamp: 0 }]
                : lines,
          };
        }),
      );
    },
    [sections, onSectionsChange],
  );

  const stampTimestamp = useCallback(
    (sectionId: string, lineId: string) => {
      onSectionsChange(
        sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lines: s.lines.map((l) =>
                  l.id === lineId ? { ...l, timestamp: currentTime } : l,
                ),
              },
        ),
      );
    },
    [sections, currentTime, onSectionsChange],
  );

  const addSection = useCallback(() => {
    const num = sections.filter((s) => s.type === "verse").length + 1;
    const newSection: LyricSection = {
      id: genId(),
      type: "verse",
      label: `Verse ${num}`,
      number: num,
      lines: [{ id: genId(), text: "", timestamp: 0 }],
    };
    onSectionsChange([...sections, newSection]);
    onActiveSectionChange(newSection.id);
  }, [sections, onSectionsChange, onActiveSectionChange]);

  const wordCount = sections.reduce(
    (total, s) =>
      total +
      s.lines.reduce(
        (t, l) => t + (l.text.trim() ? l.text.trim().split(/\s+/).length : 0),
        0,
      ),
    0,
  );

  const fontClass = { sm: "text-sm", base: "text-base", lg: "text-lg" }[
    fontSize
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0d0d14] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#1a1a2e]">
        <div className="flex items-center gap-2">
          <AlignLeft className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-white text-sm">Lyrics</span>
          <span className="text-xs text-white/40 ml-1">{wordCount}w</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/5 rounded-md overflow-hidden">
            {(["sm", "base", "lg"] as const).map((sz) => (
              <button
                key={sz}
                onClick={() => setFontSize(sz)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  fontSize === sz
                    ? "bg-emerald-600 text-white"
                    : "text-white/50 hover:text-white",
                )}
              >
                {sz === "sm" ? "S" : sz === "base" ? "M" : "L"}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5 overflow-x-auto">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => onActiveSectionChange(s.id)}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              activeSectionId === s.id
                ? SECTION_COLORS[s.type]
                : "bg-white/5 text-white/50",
            )}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={addSection}
          className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-full bg-white/5 text-white/50 hover:text-white hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {activeSection ? (
          activeSection.lines.map((line, idx) => (
            <div key={line.id} className="flex items-start gap-2 group">
              <span className="text-xs text-white/25 pt-3 w-5 text-right flex-shrink-0 font-mono">
                {idx + 1}
              </span>
              <textarea
                value={line.text}
                onChange={(e) =>
                  updateLine(activeSection.id, line.id, e.target.value)
                }
                placeholder="Type lyrics…"
                rows={1}
                className={cn(
                  "flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/20 resize-none outline-none focus:border-emerald-500/50 transition-colors min-h-[44px]",
                  fontClass,
                )}
                style={{ lineHeight: 1.5 }}
                onInput={(e) => {
                  const ta = e.currentTarget;
                  ta.style.height = "auto";
                  ta.style.height = ta.scrollHeight + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addLine(activeSection.id, line.id);
                  }
                }}
              />
              <div className="flex flex-col gap-1 pt-1 opacity-0 group-focus-within:opacity-100 transition-opacity">
                <button
                  onClick={() => stampTimestamp(activeSection.id, line.id)}
                  title={
                    line.timestamp > 0 ? fmt(line.timestamp) : "Stamp time"
                  }
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded text-xs transition-colors",
                    line.timestamp > 0
                      ? "bg-emerald-600/20 text-emerald-400"
                      : "bg-white/5 text-white/40 hover:text-white",
                  )}
                >
                  <Clock className="h-3.5 w-3.5" />
                </button>
                {activeSection.lines.length > 1 && (
                  <button
                    onClick={() => deleteLine(activeSection.id, line.id)}
                    className="h-8 w-8 flex items-center justify-center rounded bg-white/5 text-white/40 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-40 text-white/30 text-sm">
            Add a section to start writing lyrics
          </div>
        )}

        {activeSection && (
          <button
            onClick={() => {
              const last = activeSection.lines[activeSection.lines.length - 1];
              if (last) addLine(activeSection.id, last.id);
            }}
            className="flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors py-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Add line
          </button>
        )}
      </div>
    </div>
  );
}
