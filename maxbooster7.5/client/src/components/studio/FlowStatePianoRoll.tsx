import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Play,
  Pause,
  Square,
  Grid,
  Music,
  Pencil,
  Eraser,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Scissors,
  Copy,
  Trash2,
  Undo2,
  Redo2,
  Magnet,
  Piano,
  Drum,
  Activity,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface MIDINote {
  id: string;
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
  selected?: boolean;
}

interface FlowStatePianoRollProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackId: string;
  trackName?: string;
  trackColor?: string;
  notes?: MIDINote[];
  onNotesChange?: (notes: MIDINote[]) => void;
  isPlaying?: boolean;
  currentTime?: number;
  onPlayPause?: () => void;
  onStop?: () => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_HEIGHT = 16;
const BEATS_PER_MEASURE = 4;
const TOTAL_OCTAVES = 8;
const TOTAL_NOTES = TOTAL_OCTAVES * 12;
const VELOCITY_LANE_HEIGHT = 60;
const PIANO_KEY_WIDTH = 48;

type Tool = 'select' | 'pencil' | 'eraser' | 'scissors';

const SNAP_VALUES = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1 Bar' },
  { value: 0.5, label: '1/2' },
  { value: 0.25, label: '1/4' },
  { value: 0.125, label: '1/8' },
  { value: 0.0625, label: '1/16' },
  { value: 0.03125, label: '1/32' },
];

const QUANTIZE_OPTIONS = [
  { value: '1/4', label: '1/4 Note' },
  { value: '1/8', label: '1/8 Note' },
  { value: '1/8T', label: '1/8 Triplet' },
  { value: '1/16', label: '1/16 Note' },
  { value: '1/16T', label: '1/16 Triplet' },
  { value: '1/32', label: '1/32 Note' },
];

export function FlowStatePianoRoll({
  open,
  onOpenChange,
  trackId,
  trackName = 'MIDI Track',
  trackColor = '#8b5cf6',
  notes: initialNotes = [],
  onNotesChange,
  isPlaying = false,
  currentTime = 0,
  onPlayPause,
  onStop,
}: FlowStatePianoRollProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState<MIDINote[]>(initialNotes);
  const [tool, setTool] = useState<Tool>('pencil');
  const [zoom, setZoom] = useState(100);
  const [verticalZoom, setVerticalZoom] = useState(100);
  const [snapValue, setSnapValue] = useState(0.25);
  const [quantizeValue, setQuantizeValue] = useState('1/16');
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(TOTAL_NOTES * NOTE_HEIGHT / 2 - 200);
  const [showVelocity, setShowVelocity] = useState(true);
  const [editingVelocity, setEditingVelocity] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<MIDINote[][]>([]);
  const [redoStack, setRedoStack] = useState<MIDINote[][]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const velocityCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const beatsPerPixel = 0.05 / (zoom / 100);
  const visibleBeats = 32;
  const canvasWidth = Math.max(1600, visibleBeats / beatsPerPixel);
  const noteHeight = NOTE_HEIGHT * (verticalZoom / 100);
  const canvasHeight = TOTAL_NOTES * noteHeight;

  const getNoteName = (midiNumber: number): string => {
    const octave = Math.floor(midiNumber / 12) - 1;
    const note = NOTE_NAMES[midiNumber % 12];
    return `${note}${octave}`;
  };

  const isBlackKey = (midiNumber: number): boolean => {
    return [1, 3, 6, 8, 10].includes(midiNumber % 12);
  };

  const snapToGrid = (time: number): number => {
    if (snapValue === 0) return time;
    return Math.round(time / snapValue) * snapValue;
  };

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-50), JSON.parse(JSON.stringify(notes))]);
    setRedoStack([]);
  }, [notes]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, JSON.parse(JSON.stringify(notes))]);
    setUndoStack(u => u.slice(0, -1));
    setNotes(prev);
    onNotesChange?.(prev);
  }, [undoStack, notes, onNotesChange]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, JSON.parse(JSON.stringify(notes))]);
    setRedoStack(r => r.slice(0, -1));
    setNotes(next);
    onNotesChange?.(next);
  }, [redoStack, notes, onNotesChange]);

  const addNote = useCallback((pitch: number, startTime: number) => {
    pushUndo();
    const newNote: MIDINote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pitch,
      startTime: snapToGrid(startTime),
      duration: snapValue || 0.25,
      velocity: 100,
    };
    const newNotes = [...notes, newNote];
    setNotes(newNotes);
    onNotesChange?.(newNotes);
  }, [notes, snapValue, pushUndo, onNotesChange]);

  const deleteNote = useCallback((noteId: string) => {
    pushUndo();
    const newNotes = notes.filter(n => n.id !== noteId);
    setNotes(newNotes);
    setSelectedNotes(prev => {
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
    onNotesChange?.(newNotes);
  }, [notes, pushUndo, onNotesChange]);

  const updateNote = useCallback((noteId: string, updates: Partial<MIDINote>) => {
    const newNotes = notes.map(n => n.id === noteId ? { ...n, ...updates } : n);
    setNotes(newNotes);
    onNotesChange?.(newNotes);
  }, [notes, onNotesChange]);

  const deleteSelectedNotes = useCallback(() => {
    if (selectedNotes.size === 0) return;
    pushUndo();
    const newNotes = notes.filter(n => !selectedNotes.has(n.id));
    setNotes(newNotes);
    setSelectedNotes(new Set());
    onNotesChange?.(newNotes);
  }, [notes, selectedNotes, pushUndo, onNotesChange]);

  const duplicateSelectedNotes = useCallback(() => {
    if (selectedNotes.size === 0) return;
    pushUndo();
    const selected = notes.filter(n => selectedNotes.has(n.id));
    const maxTime = Math.max(...selected.map(n => n.startTime + n.duration));
    const minTime = Math.min(...selected.map(n => n.startTime));
    const offset = maxTime - minTime + 0.25;
    
    const duplicated = selected.map(n => ({
      ...n,
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: n.startTime + offset,
    }));
    
    const newNotes = [...notes, ...duplicated];
    setNotes(newNotes);
    setSelectedNotes(new Set(duplicated.map(n => n.id)));
    onNotesChange?.(newNotes);
  }, [notes, selectedNotes, pushUndo, onNotesChange]);

  const quantizeNotes = useCallback(() => {
    if (selectedNotes.size === 0) {
      toast({ title: 'Select notes to quantize' });
      return;
    }
    pushUndo();
    
    let gridSize = 0.25;
    switch (quantizeValue) {
      case '1/4': gridSize = 1; break;
      case '1/8': gridSize = 0.5; break;
      case '1/8T': gridSize = 0.333; break;
      case '1/16': gridSize = 0.25; break;
      case '1/16T': gridSize = 0.167; break;
      case '1/32': gridSize = 0.125; break;
    }
    
    const newNotes = notes.map(n => {
      if (!selectedNotes.has(n.id)) return n;
      return {
        ...n,
        startTime: Math.round(n.startTime / gridSize) * gridSize,
      };
    });
    
    setNotes(newNotes);
    onNotesChange?.(newNotes);
    toast({ title: `Quantized ${selectedNotes.size} notes to ${quantizeValue}` });
  }, [notes, selectedNotes, quantizeValue, pushUndo, onNotesChange, toast]);

  const selectAll = useCallback(() => {
    setSelectedNotes(new Set(notes.map(n => n.id)));
  }, [notes]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    const y = e.clientY - rect.top + scrollY;

    const time = x * beatsPerPixel;
    const pitch = TOTAL_NOTES - Math.floor(y / noteHeight) - 1;

    if (tool === 'pencil') {
      const clickedNote = notes.find(note => {
        const noteStartX = note.startTime / beatsPerPixel;
        const noteEndX = (note.startTime + note.duration) / beatsPerPixel;
        const noteY = (TOTAL_NOTES - note.pitch - 1) * noteHeight;
        const actualX = x;
        const actualY = y;
        return actualX >= noteStartX && actualX <= noteEndX && actualY >= noteY && actualY <= noteY + noteHeight;
      });

      if (clickedNote) {
        if (e.shiftKey) {
          setSelectedNotes(prev => {
            const next = new Set(prev);
            if (next.has(clickedNote.id)) {
              next.delete(clickedNote.id);
            } else {
              next.add(clickedNote.id);
            }
            return next;
          });
        } else {
          deleteNote(clickedNote.id);
        }
      } else {
        addNote(pitch, time);
      }
    } else if (tool === 'select') {
      const clickedNote = notes.find(note => {
        const noteStartX = note.startTime / beatsPerPixel;
        const noteEndX = (note.startTime + note.duration) / beatsPerPixel;
        const noteY = (TOTAL_NOTES - note.pitch - 1) * noteHeight;
        return x >= noteStartX && x <= noteEndX && y >= noteY && y <= noteY + noteHeight;
      });

      if (clickedNote) {
        if (e.shiftKey) {
          setSelectedNotes(prev => {
            const next = new Set(prev);
            next.add(clickedNote.id);
            return next;
          });
        } else {
          setSelectedNotes(new Set([clickedNote.id]));
        }
      } else {
        setSelectedNotes(new Set());
      }
    } else if (tool === 'eraser') {
      const clickedNote = notes.find(note => {
        const noteStartX = note.startTime / beatsPerPixel;
        const noteEndX = (note.startTime + note.duration) / beatsPerPixel;
        const noteY = (TOTAL_NOTES - note.pitch - 1) * noteHeight;
        return x >= noteStartX && x <= noteEndX && y >= noteY && y <= noteY + noteHeight;
      });

      if (clickedNote) {
        deleteNote(clickedNote.id);
      }
    }
  }, [notes, tool, beatsPerPixel, noteHeight, scrollX, scrollY, addNote, deleteNote]);

  const handleVelocityClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!velocityCanvasRef.current) return;

    const rect = velocityCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    const y = e.clientY - rect.top;

    const clickedNote = notes.find(note => {
      const noteX = note.startTime / beatsPerPixel;
      const barWidth = Math.max(8, (note.duration / beatsPerPixel) * 0.8);
      return x >= noteX && x <= noteX + barWidth;
    });

    if (clickedNote) {
      const newVelocity = Math.max(1, Math.min(127, Math.round((1 - y / VELOCITY_LANE_HEIGHT) * 127)));
      pushUndo();
      updateNote(clickedNote.id, { velocity: newVelocity });
    }
  }, [notes, beatsPerPixel, scrollX, pushUndo, updateNote]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < TOTAL_NOTES; i++) {
      const y = i * noteHeight - scrollY;
      if (y < -noteHeight || y > canvas.height) continue;
      
      const midiNote = TOTAL_NOTES - i - 1;
      const isBlack = isBlackKey(midiNote);

      if (isBlack) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, y, canvas.width, noteHeight);
      }

      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();

      if (midiNote % 12 === 0) {
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    const gridSpacing = (snapValue || 0.25) / beatsPerPixel;
    for (let x = -scrollX % gridSpacing; x < canvas.width; x += gridSpacing) {
      const beat = (x + scrollX) * beatsPerPixel;
      const isMeasure = Math.abs(beat % BEATS_PER_MEASURE) < 0.001;
      const isBeat = Math.abs(beat % 1) < 0.001;

      ctx.strokeStyle = isMeasure ? '#4a4a4a' : isBeat ? '#353535' : '#252525';
      ctx.lineWidth = isMeasure ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    notes.forEach(note => {
      const x = note.startTime / beatsPerPixel - scrollX;
      const y = (TOTAL_NOTES - note.pitch - 1) * noteHeight - scrollY;
      const width = note.duration / beatsPerPixel;
      const height = noteHeight - 2;

      if (x + width < 0 || x > canvas.width || y + height < 0 || y > canvas.height) return;

      const isSelected = selectedNotes.has(note.id);
      const opacity = note.velocity / 127;

      const gradient = ctx.createLinearGradient(x, y, x, y + height);
      gradient.addColorStop(0, isSelected ? '#60a5fa' : trackColor);
      gradient.addColorStop(1, isSelected ? '#3b82f6' : `${trackColor}cc`);
      
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.5 + opacity * 0.5;
      ctx.beginPath();
      ctx.roundRect(x, y + 1, width - 1, height, 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = isSelected ? '#93c5fd' : `${trackColor}`;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      if (width > 30) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(getNoteName(note.pitch), x + 4, y + 12);
      }
    });

    if (currentTime > 0) {
      const x = currentTime / beatsPerPixel - scrollX;
      if (x >= 0 && x <= canvas.width) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(x - 6, 0);
        ctx.lineTo(x + 6, 0);
        ctx.lineTo(x, 10);
        ctx.closePath();
        ctx.fill();
      }
    }
  }, [notes, beatsPerPixel, noteHeight, selectedNotes, scrollX, scrollY, currentTime, trackColor, snapValue]);

  useEffect(() => {
    if (!showVelocity) return;
    
    const canvas = velocityCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#2a2a2a';
    ctx.setLineDash([2, 2]);
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * VELOCITY_LANE_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    notes.forEach(note => {
      const x = note.startTime / beatsPerPixel - scrollX;
      const barHeight = (note.velocity / 127) * VELOCITY_LANE_HEIGHT;
      const barWidth = Math.max(8, (note.duration / beatsPerPixel) * 0.8);
      const isSelected = selectedNotes.has(note.id);

      if (x + barWidth < 0 || x > canvas.width) return;

      const gradient = ctx.createLinearGradient(x, VELOCITY_LANE_HEIGHT, x, VELOCITY_LANE_HEIGHT - barHeight);
      gradient.addColorStop(0, isSelected ? '#3b82f6' : trackColor);
      gradient.addColorStop(1, isSelected ? '#60a5fa' : `${trackColor}88`);

      ctx.fillStyle = gradient;
      ctx.fillRect(x, VELOCITY_LANE_HEIGHT - barHeight, barWidth, barHeight);

      ctx.strokeStyle = isSelected ? '#93c5fd' : '#ffffff33';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, VELOCITY_LANE_HEIGHT - barHeight, barWidth, barHeight);
    });
  }, [notes, beatsPerPixel, scrollX, selectedNotes, showVelocity, trackColor]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedNotes();
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        selectAll();
      } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        duplicateSelectedNotes();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey && (e.ctrlKey || e.metaKey)) || (e.key === 'y' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'q') {
        quantizeNotes();
      } else if (e.key === '1') setTool('select');
      else if (e.key === '2') setTool('pencil');
      else if (e.key === '3') setTool('eraser');
      else if (e.key === '4') setTool('scissors');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, deleteSelectedNotes, selectAll, duplicateSelectedNotes, undo, redo, quantizeNotes]);

  const renderPianoKeys = useMemo(() => (
    <div className="w-12 flex-shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 border-r border-white/10">
      <div 
        className="relative"
        style={{ 
          height: TOTAL_NOTES * noteHeight,
          transform: `translateY(-${scrollY}px)`,
        }}
      >
        {Array.from({ length: TOTAL_NOTES }).map((_, i) => {
          const midiNote = TOTAL_NOTES - i - 1;
          const isBlack = isBlackKey(midiNote);
          const noteName = getNoteName(midiNote);
          const isC = midiNote % 12 === 0;

          return (
            <div
              key={i}
              className={cn(
                "absolute w-full flex items-center justify-end pr-1 text-[9px] border-b border-white/5",
                isBlack ? "bg-slate-800 text-white/60" : "bg-slate-200 text-slate-700",
                isC && "font-bold"
              )}
              style={{
                top: i * noteHeight,
                height: noteHeight,
              }}
            >
              {isC && noteName}
            </div>
          );
        })}
      </div>
    </div>
  ), [noteHeight, scrollY]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[85vh] p-0 bg-slate-950 border-slate-800">
        <div className="flex flex-col h-full">
          <div className="h-12 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Piano className="h-5 w-5" style={{ color: trackColor }} />
                <span className="font-semibold text-white">{trackName}</span>
                <span className="text-xs text-white/40">MIDI Editor</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onStop} className="h-8 w-8 p-0">
                <Square className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onPlayPause}
                className={cn("h-8 w-8 p-0", isPlaying && "text-green-500")}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            </div>

            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="h-10 px-4 flex items-center gap-4 border-b border-slate-800 bg-slate-900/30">
            <div className="flex items-center gap-1 bg-slate-800 rounded-md p-0.5">
              {[
                { tool: 'select' as Tool, icon: MousePointer2, label: 'Select (1)' },
                { tool: 'pencil' as Tool, icon: Pencil, label: 'Draw (2)' },
                { tool: 'eraser' as Tool, icon: Eraser, label: 'Erase (3)' },
                { tool: 'scissors' as Tool, icon: Scissors, label: 'Split (4)' },
              ].map(({ tool: t, icon: Icon, label }) => (
                <Button
                  key={t}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTool(t)}
                  className={cn(
                    "h-7 w-7 p-0",
                    tool === t && "bg-slate-700 text-white"
                  )}
                  title={label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>

            <div className="w-px h-6 bg-slate-700" />

            <div className="flex items-center gap-2">
              <Magnet className="h-4 w-4 text-white/40" />
              <Select value={snapValue.toString()} onValueChange={(v) => setSnapValue(parseFloat(v))}>
                <SelectTrigger className="w-20 h-7 text-xs bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SNAP_VALUES.map(({ value, label }) => (
                    <SelectItem key={value} value={value.toString()}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Quantize:</span>
              <Select value={quantizeValue} onValueChange={setQuantizeValue}>
                <SelectTrigger className="w-24 h-7 text-xs bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUANTIZE_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={quantizeNotes} className="h-7 text-xs">
                Apply (Q)
              </Button>
            </div>

            <div className="w-px h-6 bg-slate-700" />

            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={undo} 
                disabled={undoStack.length === 0}
                className="h-7 w-7 p-0"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={redo} 
                disabled={redoStack.length === 0}
                className="h-7 w-7 p-0"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="w-px h-6 bg-slate-700" />

            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={duplicateSelectedNotes}
                disabled={selectedNotes.size === 0}
                className="h-7 w-7 p-0"
                title="Duplicate (Ctrl+D)"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={deleteSelectedNotes}
                disabled={selectedNotes.size === 0}
                className="h-7 w-7 p-0 text-red-400"
                title="Delete (Del)"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <ZoomOut className="h-4 w-4 text-white/40" />
              <Slider
                value={[zoom]}
                onValueChange={([v]) => setZoom(v)}
                min={25}
                max={400}
                step={25}
                className="w-24"
              />
              <ZoomIn className="h-4 w-4 text-white/40" />
              <span className="text-xs text-white/60 w-12">{zoom}%</span>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {renderPianoKeys}

            <div 
              ref={containerRef}
              className="flex-1 overflow-auto"
              onScroll={(e) => {
                setScrollX(e.currentTarget.scrollLeft);
                setScrollY(e.currentTarget.scrollTop);
              }}
            >
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                onClick={handleCanvasClick}
                className="cursor-crosshair"
                style={{
                  cursor: tool === 'select' ? 'default' : tool === 'eraser' ? 'not-allowed' : 'crosshair',
                }}
              />
            </div>
          </div>

          {showVelocity && (
            <div className="h-16 border-t border-slate-800 flex">
              <div className="w-12 flex-shrink-0 bg-slate-900 flex items-center justify-center">
                <Activity className="h-4 w-4 text-white/40" />
              </div>
              <div className="flex-1 overflow-hidden">
                <canvas
                  ref={velocityCanvasRef}
                  width={canvasWidth}
                  height={VELOCITY_LANE_HEIGHT}
                  onClick={handleVelocityClick}
                  className="cursor-ns-resize"
                />
              </div>
            </div>
          )}

          <div className="h-8 px-4 flex items-center justify-between border-t border-slate-800 bg-slate-900/30">
            <div className="flex items-center gap-4 text-xs text-white/60">
              <span>{notes.length} notes</span>
              <span>{selectedNotes.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-white/40">Velocity</Label>
              <Switch checked={showVelocity} onCheckedChange={setShowVelocity} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
