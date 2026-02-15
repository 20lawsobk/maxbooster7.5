import { useState, useRef, useCallback } from 'react';
import { Plus, GripVertical, Trash2, Edit2, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { studioOneTheme } from '@/lib/studioOneTheme';

interface ArrangerSection {
  id: string;
  name: string;
  color: string;
  startBar: number;
  lengthBars: number;
}

interface ArrangerTrackProps {
  sections: ArrangerSection[];
  bpm: number;
  timeSignature: [number, number];
  pixelsPerBar: number;
  scrollOffset: number;
  onSectionAdd: (section: Omit<ArrangerSection, 'id'>) => void;
  onSectionUpdate: (id: string, updates: Partial<ArrangerSection>) => void;
  onSectionDelete: (id: string) => void;
  onSectionDuplicate: (id: string) => void;
  onSectionMove: (id: string, newStartBar: number) => void;
  onSectionResize: (id: string, newLengthBars: number) => void;
  visible?: boolean;
  onToggleVisibility?: () => void;
}

const SECTION_COLORS = [
  '#4ade80', '#60a5fa', '#f87171', '#fbbf24', '#a78bfa',
  '#fb923c', '#ec4899', '#14b8a6', '#8b5cf6', '#06b6d4',
];

const DEFAULT_SECTION_NAMES = [
  'Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 
  'Breakdown', 'Drop', 'Outro', 'Hook', 'Interlude'
];

export function ArrangerTrack({
  sections,
  bpm,
  timeSignature,
  pixelsPerBar,
  scrollOffset,
  onSectionAdd,
  onSectionUpdate,
  onSectionDelete,
  onSectionDuplicate,
  onSectionMove,
  onSectionResize,
  visible = true,
  onToggleVisibility,
}: ArrangerTrackProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollOffset;
    const bar = Math.floor(x / pixelsPerBar);
    
    const usedNames = new Set(sections.map(s => s.name));
    const availableName = DEFAULT_SECTION_NAMES.find(n => !usedNames.has(n)) || `Section ${sections.length + 1}`;
    const color = SECTION_COLORS[sections.length % SECTION_COLORS.length];
    
    onSectionAdd({
      name: availableName,
      color,
      startBar: bar,
      lengthBars: 8,
    });
  };

  const handleDragStart = (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    setDraggingId(sectionId);
  };

  const handleResizeStart = (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    setResizingId(sectionId);
  };

  const handleStartEdit = (section: ArrangerSection) => {
    setEditingId(section.id);
    setEditingName(section.name);
  };

  const handleSaveEdit = () => {
    if (editingId && editingName.trim()) {
      onSectionUpdate(editingId, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName('');
  };

  if (!visible) {
    return (
      <div
        className="h-6 flex items-center px-2 border-b cursor-pointer hover:bg-white/5"
        style={{
          background: studioOneTheme.colors.bg.secondary,
          borderColor: studioOneTheme.colors.border.subtle,
        }}
        onClick={onToggleVisibility}
      >
        <ChevronDown className="h-3 w-3 mr-2" style={{ color: studioOneTheme.colors.text.muted }} />
        <span className="text-[10px] font-medium" style={{ color: studioOneTheme.colors.text.muted }}>
          Arranger Track (click to expand)
        </span>
      </div>
    );
  }

  return (
    <div
      className="border-b"
      style={{
        background: studioOneTheme.colors.bg.secondary,
        borderColor: studioOneTheme.colors.border.primary,
      }}
    >
      {/* Header */}
      <div 
        className="h-6 flex items-center px-2 border-b"
        style={{ borderColor: studioOneTheme.colors.border.subtle }}
      >
        <button
          onClick={onToggleVisibility}
          className="flex items-center gap-1 hover:bg-white/5 rounded px-1"
        >
          <ChevronUp className="h-3 w-3" style={{ color: studioOneTheme.colors.text.muted }} />
          <span className="text-[10px] font-medium" style={{ color: studioOneTheme.colors.text.secondary }}>
            Arranger
          </span>
        </button>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-5 px-1">
              <Plus className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {DEFAULT_SECTION_NAMES.map((name) => (
              <DropdownMenuItem
                key={name}
                onClick={() => {
                  const lastSection = sections[sections.length - 1];
                  const startBar = lastSection ? lastSection.startBar + lastSection.lengthBars : 0;
                  onSectionAdd({
                    name,
                    color: SECTION_COLORS[sections.length % SECTION_COLORS.length],
                    startBar,
                    lengthBars: 8,
                  });
                }}
              >
                {name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Section Lane */}
      <div
        ref={containerRef}
        className="relative h-10 overflow-hidden"
        onDoubleClick={handleDoubleClick}
        style={{
          background: studioOneTheme.colors.bg.deep,
        }}
      >
        {sections.map((section) => (
          <div
            key={section.id}
            className="absolute top-1 bottom-1 rounded flex items-center cursor-move group"
            style={{
              left: section.startBar * pixelsPerBar - scrollOffset,
              width: section.lengthBars * pixelsPerBar - 2,
              background: `linear-gradient(180deg, ${section.color}40 0%, ${section.color}20 100%)`,
              border: `1px solid ${section.color}`,
              boxShadow: studioOneTheme.effects.shadow.sm,
            }}
            onMouseDown={(e) => handleDragStart(e, section.id)}
          >
            {/* Drag handle */}
            <div className="px-1 opacity-50 group-hover:opacity-100">
              <GripVertical className="h-3 w-3" style={{ color: section.color }} />
            </div>

            {/* Section name */}
            {editingId === section.id ? (
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                className="h-5 text-[10px] bg-transparent border-none px-1 w-full"
                autoFocus
              />
            ) : (
              <span
                className="text-[10px] font-semibold truncate flex-1 px-1"
                style={{ color: section.color }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit(section);
                }}
              >
                {section.name}
              </span>
            )}

            {/* Context menu trigger */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ChevronDown className="h-3 w-3" style={{ color: section.color }} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleStartEdit(section)}>
                  <Edit2 className="h-3 w-3 mr-2" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSectionDuplicate(section.id)}>
                  <Copy className="h-3 w-3 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onSectionDelete(section.id)}
                  className="text-red-500"
                >
                  <Trash2 className="h-3 w-3 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Resize handle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
              style={{ background: section.color }}
              onMouseDown={(e) => handleResizeStart(e, section.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
