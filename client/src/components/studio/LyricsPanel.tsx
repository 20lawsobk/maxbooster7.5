import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Plus, Trash2, GripHorizontal, AlignLeft,
  ChevronsUpDown, ChevronDown, Music2, RefreshCw, X,
  ArrowUpDown, Hash, Type, Clock, ToggleLeft, ToggleRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type SectionType = 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro' | 'custom';

export interface LyricLine {
  id: string;
  text: string;
  timestamp: number;
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

const SECTION_META: Record<SectionType, { color: string; bg: string; label: string }> = {
  intro:        { color: '#818cf8', bg: '#312e81', label: 'Intro' },
  verse:        { color: '#60a5fa', bg: '#1e3a5f', label: 'Verse' },
  'pre-chorus': { color: '#a78bfa', bg: '#2e1065', label: 'Pre-Chorus' },
  chorus:       { color: '#f472b6', bg: '#4a044e', label: 'Chorus' },
  bridge:       { color: '#fbbf24', bg: '#451a03', label: 'Bridge' },
  outro:        { color: '#94a3b8', bg: '#1e293b', label: 'Outro' },
  custom:       { color: '#34d399', bg: '#022c22', label: 'Custom' },
};

const SECTION_ORDER: SectionType[] = [
  'intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'custom'
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function makeDefaultSection(type: SectionType, number: number): LyricSection {
  const meta = SECTION_META[type];
  return {
    id: genId(),
    type,
    label: `${meta.label}${type === 'intro' || type === 'bridge' || type === 'outro' ? '' : ` ${number}`}`,
    number,
    lines: [{ id: genId(), text: '', timestamp: 0 }],
  };
}

export function makeDefaultSections(): LyricSection[] {
  return [
    makeDefaultSection('verse', 1),
    makeDefaultSection('chorus', 1),
  ];
}

const DEFAULT_SECTIONS: LyricSection[] = makeDefaultSections();

export function LyricsPanel({
  isPlaying, playheadPosition, tempo, onSeek, defaultHeight = 280,
  sections, activeSectionId, onSectionsChange, onActiveSectionChange
}: LyricsPanelProps) {
  const [height, setHeight] = useState(defaultHeight);
  const setSections = onSectionsChange;
  const setActiveSectionId = onActiveSectionChange;
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [showAddSection, setShowAddSection] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const dragStartY = useRef<number | null>(null);
  const dragStartH = useRef<number>(defaultHeight);
  const editorRef = useRef<HTMLDivElement>(null);

  const wordCount = sections.reduce((acc, s) =>
    acc + s.lines.reduce((a, l) => a + (l.text.trim() ? l.text.trim().split(/\s+/).length : 0), 0), 0);

  const activeSection = sections.find(s => s.id === activeSectionId) ?? sections[0];

  const allLines = sections.flatMap(s => s.lines.map(l => ({ ...l, sectionId: s.id })));

  useEffect(() => {
    if (!isPlaying || !autoScroll) return;
    const activeLine = allLines.slice().reverse().find(l => l.timestamp > 0 && l.timestamp <= playheadPosition);
    if (activeLine) {
      setActiveLineId(activeLine.id);
      setActiveSectionId(activeLine.sectionId);
    }
  }, [playheadPosition, isPlaying, autoScroll]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartH.current = height;
    const onMove = (ev: MouseEvent) => {
      const delta = dragStartY.current! - ev.clientY;
      setHeight(Math.max(120, Math.min(700, dragStartH.current + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [height]);

  const updateLine = (sectionId: string, lineId: string, text: string) => {
    setSections(sections.map(s =>
      s.id !== sectionId ? s : {
        ...s,
        lines: s.lines.map(l => l.id !== lineId ? l : { ...l, text }),
      }
    ));
  };

  const addLine = (sectionId: string, afterLineId: string) => {
    setSections(sections.map(s => {
      if (s.id !== sectionId) return s;
      const idx = s.lines.findIndex(l => l.id === afterLineId);
      const newLine: LyricLine = { id: genId(), text: '', timestamp: 0 };
      const lines = [...s.lines];
      lines.splice(idx + 1, 0, newLine);
      return { ...s, lines };
    }));
  };

  const deleteLine = (sectionId: string, lineId: string) => {
    setSections(sections.map(s => {
      if (s.id !== sectionId) return s;
      if (s.lines.length <= 1) return { ...s, lines: [{ id: genId(), text: '', timestamp: 0 }] };
      return { ...s, lines: s.lines.filter(l => l.id !== lineId) };
    }));
  };

  const stampLine = (sectionId: string, lineId: string) => {
    setSections(sections.map(s =>
      s.id !== sectionId ? s : {
        ...s,
        lines: s.lines.map(l => l.id !== lineId ? l : { ...l, timestamp: playheadPosition }),
      }
    ));
  };

  const addSection = (type: SectionType) => {
    const count = sections.filter(s => s.type === type).length + 1;
    const sec = makeDefaultSection(type, count);
    setSections([...sections, sec]);
    setActiveSectionId(sec.id);
    setShowAddSection(false);
  };

  const removeSection = (id: string) => {
    if (sections.length <= 1) return;
    const filtered = sections.filter(s => s.id !== id);
    if (activeSectionId === id) setActiveSectionId(filtered[0]?.id ?? '');
    setSections(filtered);
  };

  const fontSizeClass = fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-xl' : 'text-base';

  return (
    <div style={{ height }} className="flex flex-col bg-[#181820] border-t border-[#333] shrink-0 overflow-hidden">
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="h-1.5 w-full cursor-ns-resize bg-[#222] hover:bg-blue-600/40 transition-colors group flex items-center justify-center"
      >
        <GripHorizontal className="h-3 w-3 text-[#555] group-hover:text-blue-400 pointer-events-none" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-[#2a2a2e] bg-[#1c1c24] shrink-0">
        <FileText className="h-3.5 w-3.5 text-emerald-400 mr-1" />
        <span className="text-xs font-semibold text-emerald-400 mr-2">Lyrics</span>

        {/* Section tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
          {sections.map((sec) => {
            const meta = SECTION_META[sec.type];
            const active = sec.id === activeSectionId;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSectionId(sec.id)}
                className={cn(
                  'shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  active
                    ? 'text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                )}
                style={active ? { backgroundColor: meta.bg + 'cc', color: meta.color, boxShadow: `0 0 0 1px ${meta.color}44` } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                {sec.label}
                {sections.length > 1 && active && (
                  <span
                    onClick={(e) => { e.stopPropagation(); removeSection(sec.id); }}
                    className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
                  >
                    ×
                  </span>
                )}
              </button>
            );
          })}

          {/* Add Section */}
          <div className="relative shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowAddSection(!showAddSection)}
              className="h-6 w-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {showAddSection && (
              <div className="absolute top-full left-0 mt-1 bg-[#2a2a2e] border border-[#444] rounded-lg shadow-xl z-50 py-1 min-w-36">
                {SECTION_ORDER.map(type => {
                  const meta = SECTION_META[type];
                  return (
                    <button
                      key={type}
                      onClick={() => addSection(type)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-[#3a3a3e] transition-colors"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="h-4 w-px bg-[#333] mx-1 shrink-0" />

        {/* Font size */}
        <div className="flex items-center gap-0.5 shrink-0">
          {(['sm', 'md', 'lg'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFontSize(s)}
              className={cn(
                'h-5 w-5 flex items-center justify-center rounded text-xs font-bold transition-colors',
                fontSize === s ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              )}
            >
              {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-[#333] mx-1 shrink-0" />

        {/* Timestamps toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowTimestamps(!showTimestamps)}
              className={cn('h-6 px-2 rounded text-xs flex items-center gap-1 transition-colors',
                showTimestamps ? 'text-blue-400 bg-blue-600/10' : 'text-gray-500 hover:text-gray-300')}
            >
              <Clock className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Show Timestamps</TooltipContent>
        </Tooltip>

        {/* Auto-scroll toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={cn('h-6 px-2 rounded text-xs flex items-center gap-1 transition-colors',
                autoScroll ? 'text-emerald-400 bg-emerald-600/10' : 'text-gray-500 hover:text-gray-300')}
            >
              <ArrowUpDown className="h-3 w-3" />
              <span className="text-[10px]">Follow</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Auto-scroll during playback</TooltipContent>
        </Tooltip>

        <div className="h-4 w-px bg-[#333] mx-1 shrink-0" />

        <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">
          {wordCount} words
        </span>
      </div>

      {/* Main lyrics editor */}
      <div ref={editorRef} className="flex-1 overflow-y-auto px-6 py-3 space-y-0.5">
        {activeSection ? (
          <>
            {/* Section header */}
            <div
              className="flex items-center gap-2 mb-3 pb-2 border-b"
              style={{ borderColor: SECTION_META[activeSection.type].color + '33' }}
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
            </div>

            {/* Lyric lines */}
            {activeSection.lines.map((line, idx) => {
              const isActive = line.id === activeLineId;
              return (
                <div
                  key={line.id}
                  className={cn(
                    'group flex items-start gap-2 py-0.5 rounded-md px-2 -mx-2 transition-colors',
                    isActive && isPlaying ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'
                  )}
                >
                  {/* Line number */}
                  <span className="text-[11px] text-gray-600 w-5 text-right shrink-0 mt-1 tabular-nums select-none">
                    {idx + 1}
                  </span>

                  {/* Timestamp stamp button */}
                  {showTimestamps && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => line.timestamp > 0 && onSeek ? onSeek(line.timestamp) : stampLine(activeSection.id, line.id)}
                          className={cn(
                            'text-[10px] shrink-0 w-10 text-right mt-1 tabular-nums transition-colors',
                            line.timestamp > 0 ? 'text-blue-400 hover:text-blue-300' : 'text-gray-700 hover:text-gray-500 opacity-0 group-hover:opacity-100'
                          )}
                        >
                          {line.timestamp > 0 ? formatTime(line.timestamp) : '—'}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {line.timestamp > 0 ? `Jump to ${formatTime(line.timestamp)}` : 'Stamp current playhead position'}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Text input */}
                  <input
                    type="text"
                    value={line.text}
                    placeholder={idx === 0 ? `Start typing ${activeSection.label} lyrics…` : ''}
                    onChange={(e) => updateLine(activeSection.id, line.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addLine(activeSection.id, line.id); }
                      if (e.key === 'Backspace' && line.text === '') { e.preventDefault(); deleteLine(activeSection.id, line.id); }
                    }}
                    className={cn(
                      'flex-1 bg-transparent outline-none border-none text-white placeholder-gray-700 caret-emerald-400',
                      fontSizeClass,
                      isActive && isPlaying ? 'text-emerald-300' : ''
                    )}
                    style={{ fontFamily: 'Georgia, serif' }}
                  />

                  {/* Stamp current position */}
                  {showTimestamps && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => stampLine(activeSection.id, line.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded text-gray-600 hover:text-blue-400 hover:bg-blue-600/10 shrink-0"
                        >
                          <Clock className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Stamp playhead time to this line</TooltipContent>
                    </Tooltip>
                  )}

                  {/* Delete line */}
                  <button
                    onClick={() => deleteLine(activeSection.id, line.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-red-900/20 shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}

            {/* Add line button */}
            <button
              onClick={() => {
                const lastLine = activeSection.lines[activeSection.lines.length - 1];
                addLine(activeSection.id, lastLine.id);
              }}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 mt-3 ml-9 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add line
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
            <FileText className="h-8 w-8" />
            <p className="text-sm">No section selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
