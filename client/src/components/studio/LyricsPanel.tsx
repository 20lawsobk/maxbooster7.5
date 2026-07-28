import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { FileText, Plus, GripHorizontal, X, Clock, ArrowUpDown, Mic, Download, Upload, Music2, LayoutList, Layers, Edit3, Check, Hash } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type SectionType =
  | "intro"
  | "verse"
  | "pre-chorus"
  | "chorus"
  | "bridge"
  | "outro"
  | "custom";

export interface LyricLine {
  id: string;
  text: string;
  timestamp: number;
  chords?: string;
  performer?: string;
}

export interface LyricSection {
  id: string;
  type: SectionType;
  label: string;
  lines: LyricLine[];
  number: number;
}

interface LyricsPanelProps {
  isPlaying: boolean;
  playheadPosition: number;
  tempo: number;
  onSeek?: (seconds: number) => void;
  defaultHeight?: number;
  sections: LyricSection[];
  activeSectionId: string;
  onSectionsChange: (sections: LyricSection[]) => void;
  onActiveSectionChange: (id: string) => void;
}

export const SECTION_META: Record<
  SectionType,
  { color: string; bg: string; label: string; accent: string }
> = {
  intro: { color: "#818cf8", bg: "#1e1b4b", label: "Intro", accent: "#4f46e5" },
  verse: { color: "#60a5fa", bg: "#0c1a2e", label: "Verse", accent: "#2563eb" },
  "pre-chorus": {
    color: "#a78bfa",
    bg: "#1e0a3c",
    label: "Pre-Chorus",
    accent: "#7c3aed",
  },
  chorus: {
    color: "#f472b6",
    bg: "#2d0a1e",
    label: "Chorus",
    accent: "#db2777",
  },
  bridge: {
    color: "#fbbf24",
    bg: "#1c0a00",
    label: "Bridge",
    accent: "#d97706",
  },
  outro: { color: "#94a3b8", bg: "#0f172a", label: "Outro", accent: "#475569" },
  custom: {
    color: "#34d399",
    bg: "#022c22",
    label: "Custom",
    accent: "#059669",
  },
};

const SECTION_ORDER: SectionType[] = [
  "intro",
  "verse",
  "pre-chorus",
  "chorus",
  "bridge",
  "outro",
  "custom",
];

let _idCounter = 0;
function genId() {
  return `lyr_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;
}

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function makeSection(type: SectionType, number: number): LyricSection {
  const meta = SECTION_META[type];
  return {
    id: genId(),
    type,
    label: `${meta.label}${["intro", "bridge", "outro"].includes(type) ? "" : ` ${number}`}`,
    number,
    lines: [{ id: genId(), text: "", timestamp: 0 }],
  };
}

export function makeDefaultSections(): LyricSection[] {
  return [makeSection("verse", 1), makeSection("chorus", 1)];
}

function exportPlainText(sections: LyricSection[]): string {
  return sections
    .map(
      (s) =>
        `[${s.label}]\n${s.lines
          .map((l) => {
            const parts: string[] = [];
            if (l.chords?.trim()) parts.push(`  {${l.chords.trim()}}`);
            if (l.performer?.trim()) parts.push(`[${l.performer.trim()}]`);
            if (l.text.trim()) parts.push(l.text);
            return parts.join(" ").trim();
          })
          .join("\n")}`,
    )
    .join("\n\n");
}

function importPlainText(text: string): LyricSection[] {
  const result: LyricSection[] = [];
  const blocks = text.split(/\n{2,}/);
  const counters: Partial<Record<SectionType, number>> = {};

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (!lines.length) continue;

    let sectionLabel = "";
    let contentLines = lines;

    const headerMatch = lines[0].match(/^\[([^\]]+)\]/);
    if (headerMatch) {
      sectionLabel = headerMatch[1];
      contentLines = lines.slice(1);
    } else {
      sectionLabel = "Verse";
    }

    const lbl = sectionLabel.toLowerCase();
    let type: SectionType = "custom";
    for (const t of SECTION_ORDER) {
      if (lbl.startsWith(t.replace("-", " ").replace("-", " "))) {
        type = t;
        break;
      }
    }

    counters[type] = (counters[type] ?? 0) + 1;
    const num = counters[type]!;

    const sec: LyricSection = {
      id: genId(),
      type,
      label: sectionLabel || `${SECTION_META[type].label} ${num}`,
      number: num,
      lines: contentLines
        .filter((l) => l.trim())
        .map((l) => {
          const chordsMatch = l.match(/\{([^}]+)\}/);
          const performerMatch = l.match(/\[([^\]]+)\]/);
          let text = l
            .replace(/\{[^}]+\}/g, "")
            .replace(/\[[^\]]+\]/g, "")
            .trim();
          return {
            id: genId(),
            text,
            timestamp: 0,
            chords: chordsMatch[1],
            performer: performerMatch[1],
          };
        }),
    };

    if (sec.lines.length === 0)
      sec.lines = [{ id: genId(), text: "", timestamp: 0 }];
    result.push(sec);
  }

  return result.length ? result : makeDefaultSections();
}

interface LyricLineRowProps {
  line: LyricLine;
  idx: number;
  isActive: boolean;
  isPlaying: boolean;
  showTimestamps: boolean;
  showChords: boolean;
  showPerformer: boolean;
  tapMode: boolean;
  sectionColor: string;
  sectionBg: string;
  fontSizeClass: string;
  onUpdate: (lineId: string, field: keyof LyricLine, value: string) => void;
  onDelete: (lineId: string) => void;
  onAddAfter: (lineId: string) => void;
  onStamp: (lineId: string) => void;
  onSeek?: (t: number) => void;
}

const LyricLineRow = memo(function LyricLineRow({
  line,
  idx,
  isActive,
  isPlaying,
  showTimestamps,
  showChords,
  showPerformer,
  tapMode,
  sectionColor,
  sectionBg,
  fontSizeClass,
  onUpdate,
  onDelete,
  onAddAfter,
  onStamp,
  onSeek,
}: LyricLineRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive && isPlaying && inputRef.current) {
      inputRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive, isPlaying]);

  return (
    <div
      className={cn(
        "group flex flex-col rounded-md transition-all duration-150 px-2 -mx-2",
        isActive && isPlaying ? "py-1" : "py-0.5",
      )}
      style={
        isActive && isPlaying
          ? { backgroundColor: sectionBg + "cc" }
          : undefined
      }
    >
      {showChords && (
        <div className="flex items-center gap-2 pl-10 mb-0.5">
          <input
            type="text"
            value={line.chords ?? ""}
            onChange={(e) => onUpdate(line.id, "chords", e.target.value)}
            placeholder="Chords…"
            className="flex-1 bg-transparent text-xs text-amber-300 placeholder-amber-900 outline-none border-none font-mono"
            style={{ fontFamily: "monospace" }}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-600 w-5 text-right shrink-0 tabular-nums select-none">
          {idx + 1}
        </span>

        {showTimestamps && (
          <button
            onClick={() =>
              line.timestamp > 0 && onSeek
                ? onSeek(line.timestamp)
                : onStamp(line.id)
            }
            className={cn(
              "text-[10px] shrink-0 w-11 text-right tabular-nums transition-colors font-mono",
              line.timestamp > 0
                ? "hover:text-blue-200"
                : "text-gray-700 hover:text-gray-500 opacity-0 group-hover:opacity-100",
            )}
            style={line.timestamp > 0 ? { color: sectionColor } : undefined}
          >
            {line.timestamp > 0 ? formatTime(line.timestamp) : "0:00"}
          </button>
        )}

        {showPerformer && (
          <input
            type="text"
            value={line.performer ?? ""}
            onChange={(e) => onUpdate(line.id, "performer", e.target.value)}
            placeholder="Voice"
            className="w-14 bg-white/5 text-[10px] text-gray-400 placeholder-gray-700 rounded px-1 py-0.5 outline-none border border-transparent focus:border-white/10 shrink-0"
          />
        )}

        <input
          ref={inputRef}
          type="text"
          value={line.text}
          onChange={(e) => onUpdate(line.id, "text", e.target.value)}
          placeholder={idx === 0 ? "Start typing lyrics…" : ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddAfter(line.id);
            }
            if (e.key === "Backspace" && line.text === "") {
              e.preventDefault();
              onDelete(line.id);
            }
          }}
          className={cn(
            "flex-1 bg-transparent outline-none border-none placeholder-gray-700 caret-emerald-400 transition-colors",
            fontSizeClass,
            isActive && isPlaying ? "font-medium" : "text-white",
          )}
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: isActive && isPlaying ? sectionColor : undefined,
          }}
        />

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {showTimestamps && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onStamp(line.id)}
                  className="h-5 w-5 flex items-center justify-center rounded text-gray-600 hover:text-blue-400 hover:bg-blue-600/10"
                >
                  <Clock className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Stamp playhead time</TooltipContent>
            </Tooltip>
          )}
          <button
            onClick={() => onDelete(line.id)}
            className="h-5 w-5 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-red-900/20"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
});

interface SectionViewProps {
  section: LyricSection;
  isActive: boolean;
  activeLineId: string | null;
  isPlaying: boolean;
  showTimestamps: boolean;
  showChords: boolean;
  showPerformer: boolean;
  tapMode: boolean;
  fontSizeClass: string;
  songView: boolean;
  onUpdateLine: (
    sId: string,
    lId: string,
    field: keyof LyricLine,
    val: string,
  ) => void;
  onDeleteLine: (sId: string, lId: string) => void;
  onAddLine: (sId: string, afterId: string) => void;
  onStamp: (sId: string, lId: string) => void;
  onSeek?: (t: number) => void;
}

const SectionView = memo(function SectionView({
  section,
  isActive,
  activeLineId,
  isPlaying,
  showTimestamps,
  showChords,
  showPerformer,
  tapMode,
  fontSizeClass,
  songView,
  onUpdateLine,
  onDeleteLine,
  onAddLine,
  onStamp,
  onSeek,
}: SectionViewProps) {
  const meta = SECTION_META[section.type];
  return (
    <div className={cn("mb-4", songView && !isActive && "opacity-60")}>
      {songView && (
        <div className="flex items-center gap-2 mb-2">
          <div
            className="h-px flex-1"
            style={{ backgroundColor: meta.color + "33" }}
          />
          <span
            className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded shrink-0"
            style={{ color: meta.color, backgroundColor: meta.bg }}
          >
            {section.label}
          </span>
          <div
            className="h-px flex-1"
            style={{ backgroundColor: meta.color + "33" }}
          />
        </div>
      )}

      {section.lines.map((line, idx) => (
        <LyricLineRow
          key={line.id}
          line={line}
          idx={idx}
          isActive={line.id === activeLineId}
          isPlaying={isPlaying}
          showTimestamps={showTimestamps}
          showChords={showChords}
          showPerformer={showPerformer}
          tapMode={tapMode}
          sectionColor={meta.color}
          sectionBg={meta.bg}
          fontSizeClass={fontSizeClass}
          onUpdate={(lId, field, val) =>
            onUpdateLine(section.id, lId, field, val)
          }
          onDelete={(lId) => onDeleteLine(section.id, lId)}
          onAddAfter={(lId) => onAddLine(section.id, lId)}
          onStamp={(lId) => onStamp(section.id, lId)}
          onSeek={onSeek}
        />
      ))}

      <button
        onClick={() => {
          const last = section.lines[section.lines.length - 1];
          if (last) onAddLine(section.id, last.id);
        }}
        className="flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-500 mt-1.5 ml-7 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Add line
      </button>
    </div>
  );
});

export function LyricsPanel({
  isPlaying,
  playheadPosition,
  tempo,
  onSeek,
  defaultHeight = 300,
  sections,
  activeSectionId,
  onSectionsChange,
  onActiveSectionChange,
}: LyricsPanelProps) {
  const [height, setHeight] = useState(defaultHeight);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");
  const [showAddSection, setShowAddSection] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [showChords, setShowChords] = useState(false);
  const [showPerformer, setShowPerformer] = useState(false);
  const [tapMode, setTapMode] = useState(false);
  const [songView, setSongView] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelText, setEditingLabelText] = useState("");
  const [showImportBox, setShowImportBox] = useState(false);
  const [importText, setImportText] = useState("");

  const dragStartY = useRef<number | null>(null);
  const dragStartH = useRef<number>(defaultHeight);
  const editorRef = useRef<HTMLDivElement>(null);
  const tapLineIdxRef = useRef(0);
  const addSectionRef = useRef<HTMLDivElement>(null);

  const activeSection =
    sections.find((s) => s.id === activeSectionId) ?? sections[0];

  const allLines = useMemo(
    () =>
      sections.flatMap((s) => s.lines.map((l) => ({ ...l, sectionId: s.id }))),
    [sections],
  );

  const wordCount = useMemo(
    () =>
      sections.reduce(
        (acc, s) =>
          acc +
          s.lines.reduce(
            (a, l) =>
              a + (l.text.trim() ? l.text.trim().split(/\s+/).length : 0),
            0,
          ),
        0,
      ),
    [sections],
  );

  useEffect(() => {
    if (!isPlaying || !autoScroll) return;
    const activeLine = allLines
      .slice()
      .reverse()
      .find((l) => l.timestamp > 0 && l.timestamp <= playheadPosition);
    if (activeLine) {
      setActiveLineId(activeLine.id);
      if (!songView) onActiveSectionChange(activeLine.sectionId);
    }
  }, [playheadPosition, isPlaying, autoScroll, songView]);

  useEffect(() => {
    if (!isPlaying) {
      tapLineIdxRef.current = 0;
    }
  }, [isPlaying]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartH.current = height;
      const onMove = (ev: MouseEvent) => {
        const delta = dragStartY.current! - ev.clientY;
        setHeight(Math.max(120, Math.min(700, dragStartH.current + delta)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [height],
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        addSectionRef.current &&
        !addSectionRef.current.contains(e.target as Node)
      ) {
        setShowAddSection(false);
      }
    };
    if (showAddSection) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAddSection]);

  const updateLine = useCallback(
    (
      sectionId: string,
      lineId: string,
      field: keyof LyricLine,
      value: string,
    ) => {
      onSectionsChange(
        sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lines: s.lines.map((l) =>
                  l.id !== lineId ? l : { ...l, [field]: value },
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
          if (tapMode && isPlaying) newLine.timestamp = playheadPosition;
          const lines = [...s.lines];
          lines.splice(idx + 1, 0, newLine);
          return { ...s, lines };
        }),
      );
    },
    [sections, onSectionsChange, tapMode, isPlaying, playheadPosition],
  );

  const deleteLine = useCallback(
    (sectionId: string, lineId: string) => {
      onSectionsChange(
        sections.map((s) => {
          if (s.id !== sectionId) return s;
          if (s.lines.length <= 1)
            return { ...s, lines: [{ id: genId(), text: "", timestamp: 0 }] };
          return { ...s, lines: s.lines.filter((l) => l.id !== lineId) };
        }),
      );
    },
    [sections, onSectionsChange],
  );

  const stampLine = useCallback(
    (sectionId: string, lineId: string) => {
      onSectionsChange(
        sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lines: s.lines.map((l) =>
                  l.id !== lineId ? l : { ...l, timestamp: playheadPosition },
                ),
              },
        ),
      );
    },
    [sections, playheadPosition, onSectionsChange],
  );

  const addSection = useCallback(
    (type: SectionType) => {
      const count = sections.filter((s) => s.type === type).length + 1;
      const sec = makeSection(type, count);
      onSectionsChange([...sections, sec]);
      onActiveSectionChange(sec.id);
      setShowAddSection(false);
    },
    [sections, onSectionsChange, onActiveSectionChange],
  );

  const removeSection = useCallback(
    (id: string) => {
      if (sections.length <= 1) return;
      const filtered = sections.filter((s) => s.id !== id);
      if (activeSectionId === id) onActiveSectionChange(filtered[0]?.id ?? "");
      onSectionsChange(filtered);
    },
    [sections, activeSectionId, onActiveSectionChange, onSectionsChange],
  );

  const handleExport = useCallback(() => {
    const text = exportPlainText(sections);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lyrics.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [sections]);

  const handleImport = useCallback(() => {
    if (!importText.trim()) return;
    const imported = importPlainText(importText);
    onSectionsChange(imported);
    if (imported[0]) onActiveSectionChange(imported[0].id);
    setShowImportBox(false);
    setImportText("");
  }, [importText, onSectionsChange, onActiveSectionChange]);

  const handleLabelEdit = useCallback((sec: LyricSection) => {
    setEditingLabelId(sec.id);
    setEditingLabelText(sec.label);
  }, []);

  const commitLabelEdit = useCallback(() => {
    if (!editingLabelId) return;
    onSectionsChange(
      sections.map((s) =>
        s.id !== editingLabelId
          ? s
          : { ...s, label: editingLabelText.trim() || s.label },
      ),
    );
    setEditingLabelId(null);
  }, [editingLabelId, editingLabelText, sections, onSectionsChange]);

  const fontSizeClass =
    fontSize === "sm" ? "text-sm" : fontSize === "lg" ? "text-lg" : "text-base";

  const visibleSections = songView
    ? sections
    : activeSection
      ? [activeSection]
      : [];

  return (
    <div
      style={{ height }}
      className="flex flex-col bg-[#141418] border-t border-[#2a2a30] shrink-0 overflow-hidden"
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="h-1.5 w-full cursor-ns-resize bg-[#1e1e24] hover:bg-blue-600/30 transition-colors group flex items-center justify-center shrink-0"
      >
        <GripHorizontal className="h-3 w-3 text-[#444] group-hover:text-blue-400 pointer-events-none" />
      </div>

      {/* Mini Timeline Strip */}
      <div className="h-5 bg-[#0d0d12] border-b border-[#222] shrink-0 relative overflow-hidden">
        <div className="flex h-full">
          {sections.map((sec, _i) => {
            const meta = SECTION_META[sec.type];
            return (
              <button
                key={sec.id}
                onClick={() => {
                  onActiveSectionChange(sec.id);
                  if (songView) setSongView(false);
                }}
                title={sec.label}
                className="flex-1 min-w-0 flex items-center justify-center overflow-hidden transition-opacity hover:opacity-90 border-r border-black/30 last:border-r-0"
                style={{
                  backgroundColor: meta.accent + "55",
                  borderColor: meta.color + "22",
                }}
              >
                <span
                  className="text-[9px] font-bold truncate px-1 leading-none"
                  style={{ color: meta.color }}
                >
                  {sec.label}
                </span>
              </button>
            );
          })}
        </div>
        {/* Playhead needle */}
        {sections.length > 0 &&
          (() => {
            const totalTs = Math.max(
              ...allLines
                .filter((l) => l.timestamp > 0)
                .map((l) => l.timestamp),
              60,
            );
            const pct = Math.min(100, (playheadPosition / totalTs) * 100);
            return (
              <div
                className="absolute top-0 bottom-0 w-px bg-white/70 pointer-events-none"
                style={{ left: `${pct}%` }}
              />
            );
          })()}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[#222] bg-[#18181e] shrink-0 overflow-x-auto">
        <FileText className="h-3.5 w-3.5 text-emerald-400 shrink-0 mr-1" />
        <span className="text-xs font-semibold text-emerald-400 mr-1.5 shrink-0">
          Lyrics
        </span>

        {/* Section tabs (hidden in song view) */}
        {!songView && (
          <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
            {sections.map((sec) => {
              const meta = SECTION_META[sec.type];
              const active = sec.id === activeSectionId;
              return (
                <div
                  key={sec.id}
                  className="flex items-center shrink-0 group/tab"
                >
                  {editingLabelId === sec.id ? (
                    <input
                      autoFocus
                      value={editingLabelText}
                      onChange={(e) => setEditingLabelText(e.target.value)}
                      onBlur={commitLabelEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitLabelEdit();
                        if (e.key === "Escape") setEditingLabelId(null);
                      }}
                      className="px-2 py-0.5 text-xs bg-black/40 text-white outline-none border border-white/20 rounded w-20"
                    />
                  ) : (
                    <button
                      onClick={() => onActiveSectionChange(sec.id)}
                      onDoubleClick={() => handleLabelEdit(sec)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all",
                        active
                          ? "text-white"
                          : "text-gray-500 hover:text-gray-300 hover:bg-white/5",
                      )}
                      style={
                        active
                          ? {
                              backgroundColor: meta.bg + "dd",
                              color: meta.color,
                              boxShadow: `0 0 0 1px ${meta.color}33`,
                            }
                          : {}
                      }
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: meta.color }}
                      />
                      {sec.label}
                    </button>
                  )}
                  {active &&
                    sections.length > 1 &&
                    editingLabelId !== sec.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSection(sec.id);
                        }}
                        className="opacity-0 group-hover/tab:opacity-60 hover:!opacity-100 text-gray-500 hover:text-red-400 ml-0.5 text-[10px] leading-none"
                      >
                        ×
                      </button>
                    )}
                </div>
              );
            })}

            <div className="relative shrink-0" ref={addSectionRef}>
              <button
                onClick={() => setShowAddSection(!showAddSection)}
                className="h-6 w-6 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-white/5"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              {showAddSection && (
                <div className="absolute top-full left-0 mt-1 bg-[#262630] border border-[#444] rounded-lg shadow-2xl z-[60] py-1 min-w-36">
                  {SECTION_ORDER.map((type) => {
                    const meta = SECTION_META[type];
                    return (
                      <button
                        key={type}
                        onClick={() => addSection(type)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span style={{ color: meta.color }}>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {songView && <div className="flex-1 min-w-0" />}

        <div className="h-4 w-px bg-[#333] mx-1 shrink-0" />

        {/* TAP mode */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setTapMode(!tapMode)}
              className={cn(
                "h-6 px-2 rounded text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors border",
                tapMode
                  ? "bg-red-600/20 text-red-400 border-red-600/30"
                  : "text-gray-600 hover:text-gray-300 border-transparent hover:bg-white/5",
              )}
            >
              <Mic className="h-2.5 w-2.5" />
              TAP
            </button>
          </TooltipTrigger>
          <TooltipContent>
            TAP mode — Enter stamps timestamp while playing
          </TooltipContent>
        </Tooltip>

        {/* Auto-scroll */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={cn(
                "h-6 px-1.5 rounded text-[10px] flex items-center gap-1 shrink-0 transition-colors",
                autoScroll
                  ? "text-emerald-400 bg-emerald-600/10"
                  : "text-gray-600 hover:text-gray-300 hover:bg-white/5",
              )}
            >
              <ArrowUpDown className="h-2.5 w-2.5" />
              <span>Follow</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Auto-scroll during playback</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-[#333] mx-1 shrink-0" />

        {/* Chords toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowChords(!showChords)}
              className={cn(
                "h-6 px-1.5 rounded text-[10px] flex items-center gap-1 shrink-0 transition-colors",
                showChords
                  ? "text-amber-400 bg-amber-600/10"
                  : "text-gray-600 hover:text-gray-300 hover:bg-white/5",
              )}
            >
              <Hash className="h-2.5 w-2.5" />
              <span>Chords</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Show chord entry above each line</TooltipContent>
        </Tooltip>

        {/* Performer toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowPerformer(!showPerformer)}
              className={cn(
                "h-6 px-1.5 rounded text-[10px] flex items-center gap-1 shrink-0 transition-colors",
                showPerformer
                  ? "text-purple-400 bg-purple-600/10"
                  : "text-gray-600 hover:text-gray-300 hover:bg-white/5",
              )}
            >
              <Mic className="h-2.5 w-2.5" />
              <span>Voice</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Show performer/voice label per line</TooltipContent>
        </Tooltip>

        {/* Timestamps toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowTimestamps(!showTimestamps)}
              className={cn(
                "h-6 px-1.5 rounded text-[10px] flex items-center gap-1 shrink-0 transition-colors",
                showTimestamps
                  ? "text-blue-400 bg-blue-600/10"
                  : "text-gray-600 hover:text-gray-300 hover:bg-white/5",
              )}
            >
              <Clock className="h-2.5 w-2.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Show timestamps</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-[#333] mx-1 shrink-0" />

        {/* Song view / Section view */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setSongView(!songView)}
              className={cn(
                "h-6 px-1.5 rounded text-[10px] flex items-center gap-1 shrink-0 transition-colors",
                songView
                  ? "text-indigo-400 bg-indigo-600/10"
                  : "text-gray-600 hover:text-gray-300 hover:bg-white/5",
              )}
            >
              {songView ? (
                <Layers className="h-2.5 w-2.5" />
              ) : (
                <LayoutList className="h-2.5 w-2.5" />
              )}
              <span>{songView ? "Song" : "Section"}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {songView
              ? "All sections stacked (Song View)"
              : "One section at a time (Section View)"}
          </TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-[#333] mx-1 shrink-0" />

        {/* Font size */}
        <div className="flex items-center gap-0 shrink-0 rounded overflow-hidden border border-[#333]">
          {(["sm", "md", "lg"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFontSize(s)}
              className={cn(
                "h-5 w-5 flex items-center justify-center text-[10px] font-bold transition-colors",
                fontSize === s
                  ? "bg-white/15 text-white"
                  : "text-gray-600 hover:text-gray-300",
              )}
            >
              {s === "sm" ? "S" : s === "md" ? "M" : "L"}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-[#333] mx-1 shrink-0" />

        {/* Import / Export */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowImportBox(!showImportBox)}
              className="h-6 px-1.5 rounded text-[10px] flex items-center gap-1 shrink-0 text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
            >
              <Upload className="h-2.5 w-2.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Import lyrics (plain text)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleExport}
              className="h-6 px-1.5 rounded text-[10px] flex items-center gap-1 shrink-0 text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
            >
              <Download className="h-2.5 w-2.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Export lyrics as text file</TooltipContent>
        </Tooltip>

        <div className="ml-auto shrink-0 text-[10px] text-gray-600 tabular-nums pl-2">
          {wordCount}w
        </div>
      </div>

      {/* Import box */}
      {showImportBox && (
        <div className="bg-[#1a1a22] border-b border-[#333] px-4 py-2 shrink-0 flex gap-2">
          <textarea
            className="flex-1 bg-black/40 text-xs text-white placeholder-gray-600 rounded border border-[#444] p-2 resize-none outline-none focus:border-blue-600/50 h-20 font-mono"
            placeholder={
              "Paste lyrics here...\n\n[Verse 1]\nLine one\nLine two\n\n[Chorus]\nLine one"
            }
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={handleImport}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded transition-colors"
            >
              Import
            </button>
            <button
              onClick={() => {
                setShowImportBox(false);
                setImportText("");
              }}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 text-xs rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tap mode banner */}
      {tapMode && (
        <div className="bg-red-900/30 border-b border-red-600/30 px-4 py-1 flex items-center gap-2 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-400">
            TAP mode — press{" "}
            <kbd className="bg-black/30 px-1 rounded text-[10px] border border-red-600/30">
              Enter
            </kbd>{" "}
            on a line while playing to stamp its timestamp
          </span>
        </div>
      )}

      {/* Main lyrics content */}
      <div ref={editorRef} className="flex-1 overflow-y-auto px-6 py-3">
        {visibleSections.length > 0 ? (
          <>
            {!songView && activeSection && (
              <div
                className="flex items-center gap-2 mb-3 pb-2"
                style={{
                  borderBottom: `1px solid ${SECTION_META[activeSection.type].color}22`,
                }}
              >
                {editingLabelId === activeSection.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={editingLabelText}
                      onChange={(e) => setEditingLabelText(e.target.value)}
                      onBlur={commitLabelEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitLabelEdit();
                        if (e.key === "Escape") setEditingLabelId(null);
                      }}
                      className="px-2 py-0.5 text-xs bg-black/40 text-white outline-none border border-white/20 rounded"
                    />
                    <button
                      onClick={commitLabelEdit}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleLabelEdit(activeSection)}
                    className="flex items-center gap-1.5 group/label"
                  >
                    <span
                      className="text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded"
                      style={{
                        color: SECTION_META[activeSection.type].color,
                        backgroundColor: SECTION_META[activeSection.type].bg,
                      }}
                    >
                      {activeSection.label}
                    </span>
                    <Edit3 className="h-3 w-3 text-gray-700 opacity-0 group-hover/label:opacity-100 transition-opacity" />
                  </button>
                )}
                <span className="text-[10px] text-gray-700">
                  {activeSection.lines.length}{" "}
                  {activeSection.lines.length === 1 ? "line" : "lines"}
                </span>
              </div>
            )}

            {visibleSections.map((sec) => (
              <SectionView
                key={sec.id}
                section={sec}
                isActive={sec.id === activeSectionId}
                activeLineId={activeLineId}
                isPlaying={isPlaying}
                showTimestamps={showTimestamps}
                showChords={showChords}
                showPerformer={showPerformer}
                tapMode={tapMode}
                fontSizeClass={fontSizeClass}
                songView={songView}
                onUpdateLine={updateLine}
                onDeleteLine={deleteLine}
                onAddLine={addLine}
                onStamp={stampLine}
                onSeek={onSeek}
              />
            ))}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
            <Music2 className="h-8 w-8" />
            <p className="text-sm">No lyrics yet — add a section to begin</p>
            <button
              onClick={() => addSection("verse")}
              className="px-3 py-1.5 text-xs bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-colors"
            >
              Start with Verse 1
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
