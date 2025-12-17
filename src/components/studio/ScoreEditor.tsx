import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ZoomIn,
  ZoomOut,
  Pencil,
  Eraser,
  MousePointer2,
  Printer,
  Download,
  Music,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  FileText,
  Type,
  Volume2,
} from 'lucide-react';
import { useStudioStore } from '@/lib/studioStore';

interface MIDINote {
  id: string;
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
  tieToNext?: boolean;
  slurStart?: boolean;
  slurEnd?: boolean;
  lyric?: string;
  dynamic?: string;
}

interface ScoreEditorProps {
  trackId: string;
  notes: MIDINote[];
  onNotesChange: (notes: MIDINote[]) => void;
  isPlaying?: boolean;
  currentTime?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NATURAL_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const KEY_SIGNATURES: Record<string, { sharps?: string[]; flats?: string[] }> = {
  'C': {},
  'G': { sharps: ['F'] },
  'D': { sharps: ['F', 'C'] },
  'A': { sharps: ['F', 'C', 'G'] },
  'E': { sharps: ['F', 'C', 'G', 'D'] },
  'B': { sharps: ['F', 'C', 'G', 'D', 'A'] },
  'F#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E'] },
  'C#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E', 'B'] },
  'F': { flats: ['B'] },
  'Bb': { flats: ['B', 'E'] },
  'Eb': { flats: ['B', 'E', 'A'] },
  'Ab': { flats: ['B', 'E', 'A', 'D'] },
  'Db': { flats: ['B', 'E', 'A', 'D', 'G'] },
  'Gb': { flats: ['B', 'E', 'A', 'D', 'G', 'C'] },
  'Cb': { flats: ['B', 'E', 'A', 'D', 'G', 'C', 'F'] },
};

const TIME_SIGNATURES = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'];

const DYNAMICS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

const NOTE_DURATIONS = [
  { value: 4, label: 'Whole', symbol: '𝅝' },
  { value: 2, label: 'Half', symbol: '𝅗𝅥' },
  { value: 1, label: 'Quarter', symbol: '♩' },
  { value: 0.5, label: 'Eighth', symbol: '♪' },
  { value: 0.25, label: '16th', symbol: '𝅘𝅥𝅯' },
  { value: 0.125, label: '32nd', symbol: '𝅘𝅥𝅰' },
];

const REST_DURATIONS = [
  { value: 4, label: 'Whole Rest' },
  { value: 2, label: 'Half Rest' },
  { value: 1, label: 'Quarter Rest' },
  { value: 0.5, label: 'Eighth Rest' },
  { value: 0.25, label: '16th Rest' },
];

const STAFF_LINE_SPACING = 10;
const STAFF_HEIGHT = STAFF_LINE_SPACING * 4;
const TREBLE_STAFF_TOP = 60;
const BASS_STAFF_TOP = TREBLE_STAFF_TOP + STAFF_HEIGHT + 50;
const GRAND_STAFF_HEIGHT = BASS_STAFF_TOP + STAFF_HEIGHT + 40;
const MEASURE_WIDTH = 200;
const LEFT_MARGIN = 100;
const CLEF_WIDTH = 40;
const KEY_SIG_WIDTH = 30;
const TIME_SIG_WIDTH = 25;

const midiToStaffPosition = (pitch: number, clef: 'treble' | 'bass'): number => {
  const octave = Math.floor(pitch / 12);
  const noteIndex = pitch % 12;
  const naturalNoteIndex = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][noteIndex];
  
  if (clef === 'treble') {
    const b4Position = 0;
    const stepsFromB4 = (octave - 4) * 7 + naturalNoteIndex - 6;
    return b4Position - stepsFromB4;
  } else {
    const d3Position = 0;
    const stepsFromD3 = (octave - 3) * 7 + naturalNoteIndex - 1;
    return d3Position - stepsFromD3;
  }
};

const staffPositionToY = (position: number, clef: 'treble' | 'bass'): number => {
  const staffTop = clef === 'treble' ? TREBLE_STAFF_TOP : BASS_STAFF_TOP;
  const middleLinePosition = 2;
  return staffTop + (middleLinePosition - position) * (STAFF_LINE_SPACING / 2);
};

const getNoteAccidental = (pitch: number, keySignature: string): 'sharp' | 'flat' | 'natural' | null => {
  const noteIndex = pitch % 12;
  const noteName = NOTE_NAMES[noteIndex];
  const isSharp = noteName.includes('#');
  
  const keySig = KEY_SIGNATURES[keySignature] || {};
  
  if (isSharp) {
    const baseNote = noteName[0];
    if (keySig.sharps?.includes(baseNote)) {
      return null;
    }
    return 'sharp';
  }
  
  if (keySig.flats?.includes(noteName)) {
    return null;
  }
  if (keySig.sharps) {
    return null;
  }
  
  return null;
};

const getClefForPitch = (pitch: number): 'treble' | 'bass' => {
  return pitch >= 60 ? 'treble' : 'bass';
};

const getNoteNameFromPitch = (pitch: number): string => {
  const octave = Math.floor(pitch / 12) - 1;
  const note = NOTE_NAMES[pitch % 12];
  return `${note}${octave}`;
};

export function ScoreEditor({
  trackId,
  notes,
  onNotesChange,
  isPlaying = false,
  currentTime = 0,
}: ScoreEditorProps) {
  const { tempo, timeSignature, snapEnabled, snapResolution } = useStudioStore();
  
  const [tool, setTool] = useState<'select' | 'pencil' | 'eraser'>('pencil');
  const [zoom, setZoom] = useState(100);
  const [scrollX, setScrollX] = useState(0);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [keySignature, setKeySignature] = useState('C');
  const [noteDuration, setNoteDuration] = useState(1);
  const [showLyrics, setShowLyrics] = useState(true);
  const [showDynamics, setShowDynamics] = useState(true);
  const [editingLyric, setEditingLyric] = useState<string | null>(null);
  const [lyricInput, setLyricInput] = useState('');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [numerator, denominator] = useMemo(() => 
    timeSignature.split('/').map(Number), 
    [timeSignature]
  );
  
  const beatsPerMeasure = numerator;
  const beatValue = denominator;
  
  const totalMeasures = useMemo(() => {
    if (notes.length === 0) return 8;
    const maxTime = Math.max(...notes.map(n => n.startTime + n.duration));
    return Math.max(8, Math.ceil(maxTime / beatsPerMeasure) + 2);
  }, [notes, beatsPerMeasure]);
  
  const canvasWidth = useMemo(() => 
    LEFT_MARGIN + CLEF_WIDTH + KEY_SIG_WIDTH + TIME_SIG_WIDTH + (totalMeasures * MEASURE_WIDTH * (zoom / 100)) + 50,
    [totalMeasures, zoom]
  );
  
  const canvasHeight = GRAND_STAFF_HEIGHT;
  
  const snapToGrid = useCallback((time: number): number => {
    if (!snapEnabled) return time;
    return Math.round(time / snapResolution) * snapResolution;
  }, [snapEnabled, snapResolution]);
  
  const timeToX = useCallback((time: number): number => {
    const contentStart = LEFT_MARGIN + CLEF_WIDTH + KEY_SIG_WIDTH + TIME_SIG_WIDTH;
    return contentStart + (time / beatsPerMeasure) * MEASURE_WIDTH * (zoom / 100);
  }, [beatsPerMeasure, zoom]);
  
  const xToTime = useCallback((x: number): number => {
    const contentStart = LEFT_MARGIN + CLEF_WIDTH + KEY_SIG_WIDTH + TIME_SIG_WIDTH;
    return ((x - contentStart) / (MEASURE_WIDTH * (zoom / 100))) * beatsPerMeasure;
  }, [beatsPerMeasure, zoom]);
  
  const yToPitch = useCallback((y: number): { pitch: number; clef: 'treble' | 'bass' } => {
    const trebleMiddleY = TREBLE_STAFF_TOP + STAFF_HEIGHT / 2;
    const bassMiddleY = BASS_STAFF_TOP + STAFF_HEIGHT / 2;
    
    let clef: 'treble' | 'bass';
    let staffY: number;
    
    if (y < (trebleMiddleY + bassMiddleY) / 2) {
      clef = 'treble';
      staffY = TREBLE_STAFF_TOP;
    } else {
      clef = 'bass';
      staffY = BASS_STAFF_TOP;
    }
    
    const position = Math.round((staffY + STAFF_HEIGHT / 2 - y) / (STAFF_LINE_SPACING / 2));
    
    let pitch: number;
    if (clef === 'treble') {
      const b4 = 71;
      pitch = b4 + Math.floor(position * 12 / 7);
    } else {
      const d3 = 50;
      pitch = d3 + Math.floor(position * 12 / 7);
    }
    
    pitch = Math.max(21, Math.min(108, pitch));
    
    return { pitch, clef };
  }, []);
  
  const addNote = useCallback((pitch: number, startTime: number) => {
    const newNote: MIDINote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pitch,
      startTime: snapToGrid(startTime),
      duration: noteDuration,
      velocity: 100,
    };
    onNotesChange([...notes, newNote]);
  }, [notes, onNotesChange, noteDuration, snapToGrid]);
  
  const deleteNote = useCallback((noteId: string) => {
    onNotesChange(notes.filter(n => n.id !== noteId));
    setSelectedNotes(prev => {
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
  }, [notes, onNotesChange]);
  
  const updateNote = useCallback((noteId: string, updates: Partial<MIDINote>) => {
    onNotesChange(notes.map(n => n.id === noteId ? { ...n, ...updates } : n));
  }, [notes, onNotesChange]);
  
  const findNoteAt = useCallback((x: number, y: number): MIDINote | null => {
    const time = xToTime(x);
    const { pitch: targetPitch } = yToPitch(y);
    
    for (const note of notes) {
      if (time >= note.startTime && time < note.startTime + note.duration) {
        if (Math.abs(note.pitch - targetPitch) <= 1) {
          return note;
        }
      }
    }
    return null;
  }, [notes, xToTime, yToPitch]);
  
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    const y = e.clientY - rect.top;
    
    const clickedNote = findNoteAt(x, y);
    
    if (tool === 'pencil') {
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
        const time = xToTime(x);
        if (time >= 0) {
          const { pitch } = yToPitch(y);
          addNote(pitch, time);
        }
      }
    } else if (tool === 'eraser') {
      if (clickedNote) {
        deleteNote(clickedNote.id);
      }
    } else if (tool === 'select') {
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
          setSelectedNotes(new Set([clickedNote.id]));
        }
      } else {
        setSelectedNotes(new Set());
      }
    }
  }, [tool, scrollX, findNoteAt, xToTime, yToPitch, addNote, deleteNote]);
  
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    const y = e.clientY - rect.top;
    
    const clickedNote = findNoteAt(x, y);
    if (clickedNote && showLyrics) {
      setEditingLyric(clickedNote.id);
      setLyricInput(clickedNote.lyric || '');
    }
  }, [scrollX, findNoteAt, showLyrics]);
  
  const handleLyricSubmit = useCallback(() => {
    if (editingLyric) {
      updateNote(editingLyric, { lyric: lyricInput || undefined });
      setEditingLyric(null);
      setLyricInput('');
    }
  }, [editingLyric, lyricInput, updateNote]);
  
  const drawTrebleClef = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.font = '60px serif';
    ctx.fillStyle = 'var(--studio-text)';
    ctx.fillText('𝄞', x, y + 25);
  }, []);
  
  const drawBassClef = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.font = '40px serif';
    ctx.fillStyle = 'var(--studio-text)';
    ctx.fillText('𝄢', x, y + 15);
  }, []);
  
  const drawKeySignature = useCallback((ctx: CanvasRenderingContext2D, x: number, clef: 'treble' | 'bass') => {
    const keySig = KEY_SIGNATURES[keySignature];
    if (!keySig) return;
    
    const staffTop = clef === 'treble' ? TREBLE_STAFF_TOP : BASS_STAFF_TOP;
    ctx.font = '16px serif';
    ctx.fillStyle = '#f0f0f5';
    
    if (keySig.sharps) {
      const sharpPositions = clef === 'treble' 
        ? [-1, 2, -2, 1, 4, 0, 3]
        : [1, 4, 0, 3, 6, 2, 5];
      keySig.sharps.forEach((_, i) => {
        const pos = sharpPositions[i];
        const yPos = staffTop + (4 - pos) * (STAFF_LINE_SPACING / 2);
        ctx.fillText('♯', x + i * 10, yPos);
      });
    }
    
    if (keySig.flats) {
      const flatPositions = clef === 'treble'
        ? [2, -1, 3, 0, 4, 1, 5]
        : [4, 1, 5, 2, 6, 3, 7];
      keySig.flats.forEach((_, i) => {
        const pos = flatPositions[i];
        const yPos = staffTop + (4 - pos) * (STAFF_LINE_SPACING / 2);
        ctx.fillText('♭', x + i * 10, yPos);
      });
    }
  }, [keySignature]);
  
  const drawTimeSignature = useCallback((ctx: CanvasRenderingContext2D, x: number, staffTop: number) => {
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#f0f0f5';
    ctx.textAlign = 'center';
    ctx.fillText(numerator.toString(), x + 10, staffTop + 15);
    ctx.fillText(denominator.toString(), x + 10, staffTop + 35);
    ctx.textAlign = 'left';
  }, [numerator, denominator]);
  
  const drawNote = useCallback((
    ctx: CanvasRenderingContext2D,
    note: MIDINote,
    isSelected: boolean
  ) => {
    const clef = getClefForPitch(note.pitch);
    const x = timeToX(note.startTime);
    const position = midiToStaffPosition(note.pitch, clef);
    const y = staffPositionToY(position, clef);
    
    const noteRadius = 5;
    const duration = note.duration;
    
    const isFilled = duration < 2;
    const hasStem = duration < 4;
    const hasFlag = duration < 1;
    
    ctx.strokeStyle = isSelected ? '#60a5fa' : '#f0f0f5';
    ctx.fillStyle = isSelected ? '#60a5fa' : '#f0f0f5';
    ctx.lineWidth = 1.5;
    
    const staffTop = clef === 'treble' ? TREBLE_STAFF_TOP : BASS_STAFF_TOP;
    const staffBottom = staffTop + STAFF_HEIGHT;
    
    if (y < staffTop - STAFF_LINE_SPACING / 2 || y > staffBottom + STAFF_LINE_SPACING / 2) {
      ctx.strokeStyle = '#6a6a7a';
      ctx.lineWidth = 1;
      
      if (y < staffTop) {
        for (let ly = staffTop - STAFF_LINE_SPACING; ly >= y - STAFF_LINE_SPACING / 2; ly -= STAFF_LINE_SPACING) {
          ctx.beginPath();
          ctx.moveTo(x - noteRadius - 4, ly);
          ctx.lineTo(x + noteRadius + 4, ly);
          ctx.stroke();
        }
      } else if (y > staffBottom) {
        for (let ly = staffBottom + STAFF_LINE_SPACING; ly <= y + STAFF_LINE_SPACING / 2; ly += STAFF_LINE_SPACING) {
          ctx.beginPath();
          ctx.moveTo(x - noteRadius - 4, ly);
          ctx.lineTo(x + noteRadius + 4, ly);
          ctx.stroke();
        }
      }
      
      ctx.strokeStyle = isSelected ? '#60a5fa' : '#f0f0f5';
      ctx.lineWidth = 1.5;
    }
    
    const accidental = getNoteAccidental(note.pitch, keySignature);
    if (accidental) {
      ctx.font = '14px serif';
      const accSymbol = accidental === 'sharp' ? '♯' : accidental === 'flat' ? '♭' : '♮';
      ctx.fillText(accSymbol, x - noteRadius - 12, y + 4);
    }
    
    ctx.beginPath();
    ctx.ellipse(x, y, noteRadius, noteRadius * 0.7, -0.3, 0, Math.PI * 2);
    if (isFilled) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
    
    if (hasStem) {
      const stemUp = position < 0;
      const stemLength = 30;
      const stemX = stemUp ? x + noteRadius - 1 : x - noteRadius + 1;
      
      ctx.beginPath();
      ctx.moveTo(stemX, y);
      ctx.lineTo(stemX, stemUp ? y - stemLength : y + stemLength);
      ctx.stroke();
      
      if (hasFlag) {
        const flagY = stemUp ? y - stemLength : y + stemLength;
        ctx.font = '20px serif';
        
        if (duration === 0.5) {
          ctx.fillText(stemUp ? '𝅘𝅥𝅮' : '𝅘𝅥𝅮', stemX - 2, flagY + (stemUp ? 0 : -15));
        } else if (duration === 0.25) {
          ctx.fillText('𝅘𝅥𝅯', stemX - 2, flagY + (stemUp ? 0 : -15));
        } else if (duration === 0.125) {
          ctx.fillText('𝅘𝅥𝅰', stemX - 2, flagY + (stemUp ? 0 : -15));
        }
      }
    }
    
    if (note.tieToNext) {
      ctx.beginPath();
      ctx.strokeStyle = isSelected ? '#60a5fa' : '#a0a0b0';
      ctx.lineWidth = 1;
      const tieEndX = timeToX(note.startTime + note.duration);
      const tieY = y + (position < 0 ? 15 : -15);
      ctx.moveTo(x + noteRadius, tieY);
      ctx.quadraticCurveTo((x + tieEndX) / 2, tieY + 10, tieEndX - noteRadius, tieY);
      ctx.stroke();
    }
    
    if (showDynamics && note.dynamic) {
      ctx.font = 'italic 12px serif';
      ctx.fillStyle = '#a0a0b0';
      ctx.fillText(note.dynamic, x - 8, clef === 'treble' ? TREBLE_STAFF_TOP - 10 : BASS_STAFF_TOP + STAFF_HEIGHT + 20);
    }
    
    if (showLyrics && note.lyric) {
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#a0a0b0';
      ctx.textAlign = 'center';
      ctx.fillText(note.lyric, x, clef === 'bass' ? BASS_STAFF_TOP + STAFF_HEIGHT + 25 : TREBLE_STAFF_TOP + STAFF_HEIGHT + 65);
      ctx.textAlign = 'left';
    }
  }, [timeToX, keySignature, showDynamics, showLyrics]);
  
  const drawRest = useCallback((ctx: CanvasRenderingContext2D, x: number, duration: number, staffTop: number) => {
    ctx.font = '24px serif';
    ctx.fillStyle = '#f0f0f5';
    
    const centerY = staffTop + STAFF_HEIGHT / 2;
    
    if (duration === 4) {
      ctx.fillRect(x - 8, staffTop + STAFF_LINE_SPACING - 3, 16, 6);
    } else if (duration === 2) {
      ctx.fillRect(x - 8, staffTop + STAFF_LINE_SPACING * 2 - 3, 16, 6);
    } else if (duration === 1) {
      ctx.fillText('𝄽', x - 6, centerY + 8);
    } else if (duration === 0.5) {
      ctx.fillText('𝄾', x - 6, centerY + 8);
    } else if (duration === 0.25) {
      ctx.fillText('𝄿', x - 6, centerY + 8);
    }
  }, []);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(-scrollX, 0);
    
    ctx.strokeStyle = '#f0f0f5';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < 5; i++) {
      const y = TREBLE_STAFF_TOP + i * STAFF_LINE_SPACING;
      ctx.beginPath();
      ctx.moveTo(LEFT_MARGIN, y);
      ctx.lineTo(canvasWidth - 20, y);
      ctx.stroke();
    }
    
    for (let i = 0; i < 5; i++) {
      const y = BASS_STAFF_TOP + i * STAFF_LINE_SPACING;
      ctx.beginPath();
      ctx.moveTo(LEFT_MARGIN, y);
      ctx.lineTo(canvasWidth - 20, y);
      ctx.stroke();
    }
    
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LEFT_MARGIN, TREBLE_STAFF_TOP);
    ctx.lineTo(LEFT_MARGIN, BASS_STAFF_TOP + STAFF_HEIGHT);
    ctx.stroke();
    
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LEFT_MARGIN + 5, TREBLE_STAFF_TOP);
    ctx.lineTo(LEFT_MARGIN + 5, BASS_STAFF_TOP + STAFF_HEIGHT);
    ctx.stroke();
    
    drawTrebleClef(ctx, LEFT_MARGIN + 10, TREBLE_STAFF_TOP);
    drawBassClef(ctx, LEFT_MARGIN + 10, BASS_STAFF_TOP);
    
    const keySigX = LEFT_MARGIN + CLEF_WIDTH + 5;
    drawKeySignature(ctx, keySigX, 'treble');
    drawKeySignature(ctx, keySigX, 'bass');
    
    const timeSigX = LEFT_MARGIN + CLEF_WIDTH + KEY_SIG_WIDTH;
    drawTimeSignature(ctx, timeSigX, TREBLE_STAFF_TOP);
    drawTimeSignature(ctx, timeSigX, BASS_STAFF_TOP);
    
    const contentStart = LEFT_MARGIN + CLEF_WIDTH + KEY_SIG_WIDTH + TIME_SIG_WIDTH;
    ctx.strokeStyle = '#40404a';
    ctx.lineWidth = 1;
    
    for (let m = 0; m <= totalMeasures; m++) {
      const x = contentStart + m * MEASURE_WIDTH * (zoom / 100);
      ctx.beginPath();
      ctx.moveTo(x, TREBLE_STAFF_TOP);
      ctx.lineTo(x, TREBLE_STAFF_TOP + STAFF_HEIGHT);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x, BASS_STAFF_TOP);
      ctx.lineTo(x, BASS_STAFF_TOP + STAFF_HEIGHT);
      ctx.stroke();
      
      if (m < totalMeasures) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#6a6a7a';
        ctx.fillText((m + 1).toString(), x + 5, TREBLE_STAFF_TOP - 10);
      }
    }
    
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(canvasWidth - 25, TREBLE_STAFF_TOP);
    ctx.lineTo(canvasWidth - 25, BASS_STAFF_TOP + STAFF_HEIGHT);
    ctx.stroke();
    
    notes.forEach(note => {
      drawNote(ctx, note, selectedNotes.has(note.id));
    });
    
    if (isPlaying && currentTime >= 0) {
      const playheadX = timeToX(currentTime);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, TREBLE_STAFF_TOP - 20);
      ctx.lineTo(playheadX, BASS_STAFF_TOP + STAFF_HEIGHT + 20);
      ctx.stroke();
      
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, TREBLE_STAFF_TOP - 20);
      ctx.lineTo(playheadX + 6, TREBLE_STAFF_TOP - 20);
      ctx.lineTo(playheadX, TREBLE_STAFF_TOP - 10);
      ctx.closePath();
      ctx.fill();
    }
    
    ctx.restore();
    
  }, [
    notes, 
    selectedNotes, 
    zoom, 
    scrollX, 
    canvasWidth, 
    totalMeasures, 
    isPlaying, 
    currentTime,
    keySignature,
    timeToX,
    drawTrebleClef,
    drawBassClef,
    drawKeySignature,
    drawTimeSignature,
    drawNote,
  ]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingLyric) {
        if (e.key === 'Enter') {
          handleLyricSubmit();
        } else if (e.key === 'Escape') {
          setEditingLyric(null);
          setLyricInput('');
        }
        return;
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNotes.size > 0) {
          onNotesChange(notes.filter(n => !selectedNotes.has(n.id)));
          setSelectedNotes(new Set());
        }
      } else if (e.key === 'Escape') {
        setSelectedNotes(new Set());
      } else if (e.key === '1') {
        setTool('select');
      } else if (e.key === '2') {
        setTool('pencil');
      } else if (e.key === '3') {
        setTool('eraser');
      } else if (e.key === 't' && selectedNotes.size === 1) {
        const noteId = Array.from(selectedNotes)[0];
        const note = notes.find(n => n.id === noteId);
        if (note) {
          updateNote(noteId, { tieToNext: !note.tieToNext });
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNotes, notes, onNotesChange, editingLyric, handleLyricSubmit, updateNote]);
  
  const handleExportPDF = useCallback(() => {
    console.log('Export to PDF - placeholder');
    alert('PDF Export functionality will be available in a future update. The score can be printed using the Print button.');
  }, []);
  
  const handlePrint = useCallback(() => {
    if (!canvasRef.current) return;
    
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>Score - ${trackId}</title></head>
          <body style="margin: 0; display: flex; justify-content: center;">
            <img src="${dataUrl}" style="max-width: 100%; height: auto;" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }, [trackId]);
  
  const setDynamicForSelected = useCallback((dynamic: string) => {
    selectedNotes.forEach(noteId => {
      updateNote(noteId, { dynamic });
    });
  }, [selectedNotes, updateNote]);
  
  return (
    <TooltipProvider>
      <div
        className="h-full flex flex-col"
        style={{
          background: 'var(--studio-bg-medium)',
          borderTop: '1px solid var(--studio-border)',
        }}
      >
        <div
          className="h-12 px-4 flex items-center gap-3 border-b"
          style={{ borderColor: 'var(--studio-border)' }}
        >
          <div className="flex items-center gap-1">
            <Music className="h-4 w-4 mr-1" style={{ color: 'var(--studio-text-muted)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--studio-text-muted)' }}>
              SCORE
            </span>
          </div>
          
          <div className="h-6 w-px" style={{ background: 'var(--studio-border)' }} />
          
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={tool === 'select' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTool('select')}
                  className="h-8 w-8"
                >
                  <MousePointer2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select Tool (1)</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={tool === 'pencil' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTool('pencil')}
                  className="h-8 w-8"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Pencil Tool (2)</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={tool === 'eraser' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTool('eraser')}
                  className="h-8 w-8"
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Eraser Tool (3)</TooltipContent>
            </Tooltip>
          </div>
          
          <div className="h-6 w-px" style={{ background: 'var(--studio-border)' }} />
          
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>Key:</span>
            <Select value={keySignature} onValueChange={setKeySignature}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(KEY_SIGNATURES).map(key => (
                  <SelectItem key={key} value={key}>{key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>Duration:</span>
            <Select value={noteDuration.toString()} onValueChange={v => setNoteDuration(parseFloat(v))}>
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_DURATIONS.map(d => (
                  <SelectItem key={d.value} value={d.value.toString()}>
                    {d.symbol} {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="h-6 w-px" style={{ background: 'var(--studio-border)' }} />
          
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8" disabled={selectedNotes.size === 0}>
                    <Volume2 className="h-4 w-4 mr-1" />
                    <span className="text-xs">Dynamics</span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Add Dynamic Marking</TooltipContent>
            </Tooltip>
            <DropdownMenuContent>
              {DYNAMICS.map(d => (
                <DropdownMenuItem key={d} onClick={() => setDynamicForSelected(d)}>
                  <span className="italic">{d}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDynamicForSelected('')}>
                Clear Dynamic
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showLyrics ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setShowLyrics(!showLyrics)}
                className="h-8"
              >
                <Type className="h-4 w-4 mr-1" />
                <span className="text-xs">Lyrics</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Lyrics (Double-click note to edit)</TooltipContent>
          </Tooltip>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(Math.max(50, zoom - 25))}
                  className="h-8 w-8"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom Out</TooltipContent>
            </Tooltip>
            
            <span className="text-xs w-12 text-center" style={{ color: 'var(--studio-text-muted)' }}>
              {zoom}%
            </span>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(Math.min(200, zoom + 25))}
                  className="h-8 w-8"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom In</TooltipContent>
            </Tooltip>
          </div>
          
          <div className="h-6 w-px" style={{ background: 'var(--studio-border)' }} />
          
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handlePrint} className="h-8">
                  <Printer className="h-4 w-4 mr-1" />
                  <span className="text-xs">Print</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Print Score</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleExportPDF} className="h-8">
                  <Download className="h-4 w-4 mr-1" />
                  <span className="text-xs">PDF</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export to PDF</TooltipContent>
            </Tooltip>
          </div>
          
          <div className="h-6 w-px" style={{ background: 'var(--studio-border)' }} />
          
          <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
            {notes.length} notes
            {selectedNotes.size > 0 && ` (${selectedNotes.size} selected)`}
          </span>
        </div>
        
        <div className="flex-1 overflow-hidden relative" ref={containerRef}>
          <div 
            className="absolute inset-0 overflow-auto"
            onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
          >
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              onClick={handleCanvasClick}
              onDoubleClick={handleDoubleClick}
              className="cursor-crosshair"
              style={{ 
                display: 'block',
                minWidth: '100%',
              }}
            />
          </div>
          
          {editingLyric && (
            <div
              className="absolute bg-gray-900 border border-blue-500 rounded p-2 shadow-lg"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 100,
              }}
            >
              <input
                type="text"
                value={lyricInput}
                onChange={(e) => setLyricInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLyricSubmit();
                  if (e.key === 'Escape') {
                    setEditingLyric(null);
                    setLyricInput('');
                  }
                }}
                placeholder="Enter lyric..."
                className="bg-transparent border-none outline-none text-white text-sm w-32"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={handleLyricSubmit} className="h-6 text-xs">
                  OK
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => { setEditingLyric(null); setLyricInput(''); }}
                  className="h-6 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
        
        <div
          className="h-8 px-4 flex items-center justify-between border-t"
          style={{ 
            borderColor: 'var(--studio-border)',
            background: 'var(--studio-bg-deep)',
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
              Time Signature: {timeSignature}
            </span>
            <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
              Tempo: {tempo} BPM
            </span>
            <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
              Key: {keySignature}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScrollX(Math.max(0, scrollX - 200))}
              className="h-6 w-6 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-48">
              <Slider
                value={[scrollX]}
                onValueChange={([v]) => setScrollX(v)}
                max={Math.max(0, canvasWidth - 800)}
                step={10}
                className="h-4"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScrollX(Math.min(canvasWidth - 800, scrollX + 200))}
              className="h-6 w-6 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
