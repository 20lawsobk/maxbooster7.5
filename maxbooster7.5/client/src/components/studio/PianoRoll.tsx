import { useState, useRef, useEffect, useCallback } from 'react';
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
import {
  Play,
  Pause,
  Square,
  Grid,
  Music,
  Pencil,
  Eraser,
  ZoomIn,
  ZoomOut,
  Scissors,
  Copy,
  Trash2,
  Activity,
  Waves,
  ArrowUpDown,
  Settings2,
} from 'lucide-react';

interface MPEExpressionPoint {
  time: number;
  value: number;
}

interface MIDINote {
  id: string;
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
  mpeChannel?: number;
  pitchBend?: MPEExpressionPoint[];
  pressure?: MPEExpressionPoint[];
  slide?: MPEExpressionPoint[];
  pitchBendRange?: number;
}

interface MPEZoneConfig {
  enabled: boolean;
  lowerZone: {
    masterChannel: number;
    memberChannels: number;
    pitchBendRange: number;
  };
  upperZone: {
    masterChannel: number;
    memberChannels: number;
    pitchBendRange: number;
  };
}

interface PianoRollProps {
  trackId: string;
  notes: MIDINote[];
  onNotesChange: (notes: MIDINote[]) => void;
  isPlaying?: boolean;
  currentTime?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_HEIGHT = 20;
const BEATS_PER_MEASURE = 4;
const TOTAL_OCTAVES = 10;
const TOTAL_NOTES = TOTAL_OCTAVES * 12;
const EXPRESSION_LANE_HEIGHT = 60;

type ExpressionLaneType = 'pitchBend' | 'pressure' | 'slide';

export function PianoRoll({
  trackId,
  notes,
  onNotesChange,
  isPlaying = false,
  currentTime = 0,
}: PianoRollProps) {
  const [tool, setTool] = useState<'pencil' | 'select' | 'eraser' | 'expression'>('pencil');
  const [zoom, setZoom] = useState(100);
  const [snapValue, setSnapValue] = useState<number>(0.25);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  
  const [mpeEnabled, setMpeEnabled] = useState(true);
  const [mpeZoneConfig, setMpeZoneConfig] = useState<MPEZoneConfig>({
    enabled: true,
    lowerZone: {
      masterChannel: 1,
      memberChannels: 8,
      pitchBendRange: 48,
    },
    upperZone: {
      masterChannel: 16,
      memberChannels: 0,
      pitchBendRange: 48,
    },
  });
  
  const [showExpressionLanes, setShowExpressionLanes] = useState(true);
  const [activeExpressionLane, setActiveExpressionLane] = useState<ExpressionLaneType>('pitchBend');
  const [editingExpressionNote, setEditingExpressionNote] = useState<string | null>(null);
  const [showMPESettings, setShowMPESettings] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const expressionCanvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const beatsPerPixel = 0.1 / (zoom / 100);
  const visibleBeats = 64;
  const canvasWidth = Math.max(1200, visibleBeats / beatsPerPixel);
  const canvasHeight = TOTAL_NOTES * NOTE_HEIGHT;
  const expressionLaneWidth = canvasWidth;
  const totalExpressionHeight = EXPRESSION_LANE_HEIGHT * 3;

  const getNoteName = (midiNumber: number): string => {
    const octave = Math.floor(midiNumber / 12) - 1;
    const note = NOTE_NAMES[midiNumber % 12];
    return `${note}${octave}`;
  };

  const snapToGrid = (time: number): number => {
    if (snapValue === 0) return time;
    return Math.round(time / snapValue) * snapValue;
  };

  const allocateMPEChannel = useCallback((pitch: number): number => {
    if (!mpeEnabled || !mpeZoneConfig.enabled) return 1;
    
    const usedChannels = new Set(
      notes
        .filter(n => n.mpeChannel !== undefined)
        .map(n => n.mpeChannel!)
    );
    
    const { lowerZone } = mpeZoneConfig;
    const startChannel = lowerZone.masterChannel + 1;
    const endChannel = startChannel + lowerZone.memberChannels;
    
    for (let ch = startChannel; ch < endChannel; ch++) {
      if (!usedChannels.has(ch)) {
        return ch;
      }
    }
    
    return startChannel;
  }, [notes, mpeEnabled, mpeZoneConfig]);

  const addNote = useCallback(
    (pitch: number, startTime: number) => {
      const channel = allocateMPEChannel(pitch);
      const newNote: MIDINote = {
        id: `note-${Date.now()}-${Math.random()}`,
        pitch,
        startTime: snapToGrid(startTime),
        duration: snapValue,
        velocity: 100,
        mpeChannel: mpeEnabled ? channel : undefined,
        pitchBend: mpeEnabled ? [{ time: 0, value: 0 }] : undefined,
        pressure: mpeEnabled ? [{ time: 0, value: 0.5 }] : undefined,
        slide: mpeEnabled ? [{ time: 0, value: 0.5 }] : undefined,
        pitchBendRange: mpeZoneConfig.lowerZone.pitchBendRange,
      };
      onNotesChange([...notes, newNote]);
    },
    [notes, onNotesChange, snapValue, mpeEnabled, allocateMPEChannel, mpeZoneConfig]
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      onNotesChange(notes.filter((n) => n.id !== noteId));
      if (editingExpressionNote === noteId) {
        setEditingExpressionNote(null);
      }
    },
    [notes, onNotesChange, editingExpressionNote]
  );

  const updateNote = useCallback(
    (noteId: string, updates: Partial<MIDINote>) => {
      onNotesChange(notes.map((n) => (n.id === noteId ? { ...n, ...updates } : n)));
    },
    [notes, onNotesChange]
  );

  const addExpressionPoint = useCallback(
    (noteId: string, type: ExpressionLaneType, time: number, value: number) => {
      const note = notes.find(n => n.id === noteId);
      if (!note) return;

      const expressionData = note[type] || [];
      const newPoint: MPEExpressionPoint = { time, value: Math.max(0, Math.min(1, value)) };
      
      const existingIndex = expressionData.findIndex(p => Math.abs(p.time - time) < 0.01);
      let updatedData: MPEExpressionPoint[];
      
      if (existingIndex >= 0) {
        updatedData = [...expressionData];
        updatedData[existingIndex] = newPoint;
      } else {
        updatedData = [...expressionData, newPoint].sort((a, b) => a.time - b.time);
      }

      updateNote(noteId, { [type]: updatedData });
    },
    [notes, updateNote]
  );

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = x * beatsPerPixel;
    const pitch = TOTAL_NOTES - Math.floor(y / NOTE_HEIGHT) - 1;

    if (tool === 'pencil') {
      const clickedNote = notes.find((note) => {
        const noteStartX = note.startTime / beatsPerPixel;
        const noteEndX = (note.startTime + note.duration) / beatsPerPixel;
        const noteY = (TOTAL_NOTES - note.pitch - 1) * NOTE_HEIGHT;

        return x >= noteStartX && x <= noteEndX && y >= noteY && y <= noteY + NOTE_HEIGHT;
      });

      if (clickedNote) {
        if (e.shiftKey) {
          const newSelected = new Set(selectedNotes);
          if (newSelected.has(clickedNote.id)) {
            newSelected.delete(clickedNote.id);
          } else {
            newSelected.add(clickedNote.id);
          }
          setSelectedNotes(newSelected);
          setEditingExpressionNote(clickedNote.id);
        } else {
          deleteNote(clickedNote.id);
        }
      } else {
        addNote(pitch, time);
      }
    } else if (tool === 'select') {
      const clickedNote = notes.find((note) => {
        const noteStartX = note.startTime / beatsPerPixel;
        const noteEndX = (note.startTime + note.duration) / beatsPerPixel;
        const noteY = (TOTAL_NOTES - note.pitch - 1) * NOTE_HEIGHT;

        return x >= noteStartX && x <= noteEndX && y >= noteY && y <= noteY + NOTE_HEIGHT;
      });

      if (clickedNote) {
        setEditingExpressionNote(clickedNote.id);
        if (e.shiftKey) {
          const newSelected = new Set(selectedNotes);
          newSelected.add(clickedNote.id);
          setSelectedNotes(newSelected);
        } else {
          setSelectedNotes(new Set([clickedNote.id]));
        }
      } else {
        setSelectedNotes(new Set());
        setEditingExpressionNote(null);
      }
    } else if (tool === 'eraser') {
      const clickedNote = notes.find((note) => {
        const noteStartX = note.startTime / beatsPerPixel;
        const noteEndX = (note.startTime + note.duration) / beatsPerPixel;
        const noteY = (TOTAL_NOTES - note.pitch - 1) * NOTE_HEIGHT;

        return x >= noteStartX && x <= noteEndX && y >= noteY && y <= noteY + NOTE_HEIGHT;
      });

      if (clickedNote) {
        deleteNote(clickedNote.id);
      }
    }
  };

  const handleExpressionCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>, laneType: ExpressionLaneType) => {
    if (!editingExpressionNote || tool !== 'expression') return;

    const canvas = expressionCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const laneIndex = laneType === 'pitchBend' ? 0 : laneType === 'pressure' ? 1 : 2;
    const laneY = e.clientY - rect.top - (laneIndex * EXPRESSION_LANE_HEIGHT);
    
    const note = notes.find(n => n.id === editingExpressionNote);
    if (!note) return;

    const time = x * beatsPerPixel;
    if (time < note.startTime || time > note.startTime + note.duration) return;

    const relativeTime = time - note.startTime;
    let value: number;
    
    if (laneType === 'pitchBend') {
      value = 1 - (laneY / EXPRESSION_LANE_HEIGHT);
      value = (value - 0.5) * 2;
    } else {
      value = 1 - (laneY / EXPRESSION_LANE_HEIGHT);
    }

    addExpressionPoint(editingExpressionNote, laneType, relativeTime, value);
  };

  const getPitchBendOffset = (note: MIDINote, time: number): number => {
    if (!note.pitchBend || note.pitchBend.length === 0) return 0;
    
    const relativeTime = time - note.startTime;
    let currentValue = 0;
    
    for (let i = 0; i < note.pitchBend.length; i++) {
      if (note.pitchBend[i].time <= relativeTime) {
        currentValue = note.pitchBend[i].value;
      } else {
        break;
      }
    }
    
    const pitchBendRange = note.pitchBendRange || 48;
    return currentValue * (pitchBendRange / 12) * NOTE_HEIGHT;
  };

  const getPressureValue = (note: MIDINote, time: number): number => {
    if (!note.pressure || note.pressure.length === 0) return 0.5;
    
    const relativeTime = time - note.startTime;
    let currentValue = 0.5;
    
    for (let i = 0; i < note.pressure.length; i++) {
      if (note.pressure[i].time <= relativeTime) {
        currentValue = note.pressure[i].value;
      } else {
        break;
      }
    }
    
    return currentValue;
  };

  const getSlideValue = (note: MIDINote, time: number): number => {
    if (!note.slide || note.slide.length === 0) return 0.5;
    
    const relativeTime = time - note.startTime;
    let currentValue = 0.5;
    
    for (let i = 0; i < note.slide.length; i++) {
      if (note.slide[i].time <= relativeTime) {
        currentValue = note.slide[i].value;
      } else {
        break;
      }
    }
    
    return currentValue;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i <= TOTAL_NOTES; i++) {
      const y = i * NOTE_HEIGHT;
      const isBlackKey = [1, 3, 6, 8, 10].includes(i % 12);

      if (isBlackKey) {
        ctx.fillStyle = '#151515';
        ctx.fillRect(0, y, canvas.width, NOTE_HEIGHT);
      }

      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();

      if (i % 12 === 0) {
        ctx.strokeStyle = '#404040';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    const gridSpacing = 1 / beatsPerPixel;
    for (let x = 0; x < canvas.width; x += gridSpacing) {
      const beat = x * beatsPerPixel;
      const isMeasure = beat % BEATS_PER_MEASURE === 0;

      ctx.strokeStyle = isMeasure ? '#404040' : '#252525';
      ctx.lineWidth = isMeasure ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    notes.forEach((note) => {
      const baseX = note.startTime / beatsPerPixel;
      const baseY = (TOTAL_NOTES - note.pitch - 1) * NOTE_HEIGHT;
      const width = note.duration / beatsPerPixel;
      const height = NOTE_HEIGHT - 2;

      const isSelected = selectedNotes.has(note.id);
      const isEditing = editingExpressionNote === note.id;

      if (mpeEnabled && note.pitchBend && note.pitchBend.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = isSelected ? 'rgba(96, 165, 250, 0.6)' : 'rgba(74, 222, 128, 0.6)';
        ctx.lineWidth = height;
        ctx.lineCap = 'round';

        const steps = Math.ceil(width / 2);
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * note.duration + note.startTime;
          const x = t / beatsPerPixel;
          const pitchOffset = getPitchBendOffset(note, t);
          const y = baseY + NOTE_HEIGHT / 2 - pitchOffset;
          
          const pressure = getPressureValue(note, t);
          const alpha = 0.3 + pressure * 0.7;
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = isSelected ? '#60a5fa' : '#4ade80';
        ctx.lineWidth = 2;
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * note.duration + note.startTime;
          const x = t / beatsPerPixel;
          const pitchOffset = getPitchBendOffset(note, t);
          const y = baseY + NOTE_HEIGHT / 2 - pitchOffset;
          
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      } else {
        const opacity = note.velocity / 127;
        const pressure = mpeEnabled ? getPressureValue(note, note.startTime) : 1;
        const adjustedOpacity = opacity * (0.5 + pressure * 0.5);
        
        ctx.fillStyle = isSelected
          ? `rgba(96, 165, 250, ${adjustedOpacity})`
          : `rgba(74, 222, 128, ${adjustedOpacity})`;
        ctx.fillRect(baseX, baseY + 1, width, height);

        ctx.strokeStyle = isSelected ? '#60a5fa' : '#4ade80';
        ctx.lineWidth = isEditing ? 3 : 2;
        ctx.strokeRect(baseX, baseY + 1, width, height);
      }

      if (mpeEnabled && note.slide) {
        const slideValue = getSlideValue(note, note.startTime);
        const slideIndicatorHeight = slideValue * (height - 4);
        ctx.fillStyle = 'rgba(255, 200, 100, 0.5)';
        ctx.fillRect(baseX + width - 4, baseY + height - slideIndicatorHeight, 3, slideIndicatorHeight);
      }

      if (width > 30) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        const noteName = getNoteName(note.pitch);
        ctx.fillText(noteName, baseX + 4, baseY + 14);
        
        if (mpeEnabled && note.mpeChannel !== undefined) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = '8px monospace';
          ctx.fillText(`CH${note.mpeChannel}`, baseX + 4, baseY + height - 2);
        }
      }

      if (mpeEnabled && note.pitchBendRange && width > 50) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '7px monospace';
        ctx.fillText(`±${note.pitchBendRange}`, baseX + width - 20, baseY + 12);
      }
    });

    if (isPlaying && currentTime > 0) {
      const x = currentTime / beatsPerPixel;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
  }, [notes, beatsPerPixel, selectedNotes, isPlaying, currentTime, mpeEnabled, editingExpressionNote]);

  useEffect(() => {
    if (!showExpressionLanes || !mpeEnabled) return;
    
    const canvas = expressionCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const laneTypes: ExpressionLaneType[] = ['pitchBend', 'pressure', 'slide'];
    const laneColors = {
      pitchBend: '#60a5fa',
      pressure: '#f472b6',
      slide: '#fbbf24',
    };
    const laneLabels = {
      pitchBend: 'Pitch Bend',
      pressure: 'Pressure',
      slide: 'Slide (CC74)',
    };

    laneTypes.forEach((laneType, laneIndex) => {
      const laneY = laneIndex * EXPRESSION_LANE_HEIGHT;
      
      ctx.fillStyle = laneIndex % 2 === 0 ? '#0d0d0d' : '#111111';
      ctx.fillRect(0, laneY, canvas.width, EXPRESSION_LANE_HEIGHT);

      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, laneY + EXPRESSION_LANE_HEIGHT);
      ctx.lineTo(canvas.width, laneY + EXPRESSION_LANE_HEIGHT);
      ctx.stroke();

      if (laneType === 'pitchBend') {
        ctx.strokeStyle = '#333333';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, laneY + EXPRESSION_LANE_HEIGHT / 2);
        ctx.lineTo(canvas.width, laneY + EXPRESSION_LANE_HEIGHT / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = '#666666';
      ctx.font = '9px monospace';
      ctx.fillText(laneLabels[laneType], 4, laneY + 12);
    });

    const editNote = editingExpressionNote ? notes.find(n => n.id === editingExpressionNote) : null;
    
    if (editNote) {
      const noteStartX = editNote.startTime / beatsPerPixel;
      const noteEndX = (editNote.startTime + editNote.duration) / beatsPerPixel;
      
      ctx.fillStyle = 'rgba(74, 222, 128, 0.1)';
      ctx.fillRect(noteStartX, 0, noteEndX - noteStartX, totalExpressionHeight);

      laneTypes.forEach((laneType, laneIndex) => {
        const laneY = laneIndex * EXPRESSION_LANE_HEIGHT;
        const expressionData = editNote[laneType] as MPEExpressionPoint[] | undefined;
        const color = laneColors[laneType];

        if (expressionData && expressionData.length > 0) {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;

          expressionData.forEach((point, i) => {
            const x = (editNote.startTime + point.time) / beatsPerPixel;
            let y: number;
            
            if (laneType === 'pitchBend') {
              y = laneY + EXPRESSION_LANE_HEIGHT / 2 - (point.value * EXPRESSION_LANE_HEIGHT / 2);
            } else {
              y = laneY + EXPRESSION_LANE_HEIGHT - (point.value * EXPRESSION_LANE_HEIGHT);
            }

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });

          const lastPoint = expressionData[expressionData.length - 1];
          const endX = noteEndX;
          let endY: number;
          if (laneType === 'pitchBend') {
            endY = laneY + EXPRESSION_LANE_HEIGHT / 2 - (lastPoint.value * EXPRESSION_LANE_HEIGHT / 2);
          } else {
            endY = laneY + EXPRESSION_LANE_HEIGHT - (lastPoint.value * EXPRESSION_LANE_HEIGHT);
          }
          ctx.lineTo(endX, endY);
          ctx.stroke();

          expressionData.forEach((point) => {
            const x = (editNote.startTime + point.time) / beatsPerPixel;
            let y: number;
            
            if (laneType === 'pitchBend') {
              y = laneY + EXPRESSION_LANE_HEIGHT / 2 - (point.value * EXPRESSION_LANE_HEIGHT / 2);
            } else {
              y = laneY + EXPRESSION_LANE_HEIGHT - (point.value * EXPRESSION_LANE_HEIGHT);
            }

            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }
      });
    }

    notes.forEach((note) => {
      if (note.id === editingExpressionNote) return;
      
      const noteStartX = note.startTime / beatsPerPixel;
      
      laneTypes.forEach((laneType, laneIndex) => {
        const laneY = laneIndex * EXPRESSION_LANE_HEIGHT;
        const expressionData = note[laneType] as MPEExpressionPoint[] | undefined;
        const color = laneColors[laneType];

        if (expressionData && expressionData.length > 0) {
          ctx.beginPath();
          ctx.strokeStyle = `${color}44`;
          ctx.lineWidth = 1;

          expressionData.forEach((point, i) => {
            const x = (note.startTime + point.time) / beatsPerPixel;
            let y: number;
            
            if (laneType === 'pitchBend') {
              y = laneY + EXPRESSION_LANE_HEIGHT / 2 - (point.value * EXPRESSION_LANE_HEIGHT / 2);
            } else {
              y = laneY + EXPRESSION_LANE_HEIGHT - (point.value * EXPRESSION_LANE_HEIGHT);
            }

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
        }
      });
    });

    if (isPlaying && currentTime > 0) {
      const x = currentTime / beatsPerPixel;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, totalExpressionHeight);
      ctx.stroke();
    }
  }, [notes, beatsPerPixel, showExpressionLanes, mpeEnabled, editingExpressionNote, isPlaying, currentTime, totalExpressionHeight]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNotes.size > 0) {
          onNotesChange(notes.filter((n) => !selectedNotes.has(n.id)));
          setSelectedNotes(new Set());
          setEditingExpressionNote(null);
        }
      } else if (e.key === 'Escape') {
        setSelectedNotes(new Set());
        setEditingExpressionNote(null);
      } else if (e.key === '1') {
        setTool('pencil');
      } else if (e.key === '2') {
        setTool('select');
      } else if (e.key === '3') {
        setTool('eraser');
      } else if (e.key === '4') {
        setTool('expression');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedNotes, notes, onNotesChange]);

  const MPESettingsPanel = () => (
    <div className="absolute top-12 right-4 bg-zinc-900 border border-zinc-700 rounded-lg p-4 shadow-xl z-50 w-80">
      <h3 className="text-sm font-semibold mb-4 text-white">MPE Zone Configuration</h3>
      
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">Lower Zone</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Master Channel</Label>
              <Select 
                value={mpeZoneConfig.lowerZone.masterChannel.toString()}
                onValueChange={(v) => setMpeZoneConfig(prev => ({
                  ...prev,
                  lowerZone: { ...prev.lowerZone, masterChannel: parseInt(v) }
                }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(ch => (
                    <SelectItem key={ch} value={ch.toString()}>{ch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Member Channels</Label>
              <Select 
                value={mpeZoneConfig.lowerZone.memberChannels.toString()}
                onValueChange={(v) => setMpeZoneConfig(prev => ({
                  ...prev,
                  lowerZone: { ...prev.lowerZone, memberChannels: parseInt(v) }
                }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(n => (
                    <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Pitch Bend Range (semitones)</Label>
            <div className="flex items-center gap-2">
              <Slider
                value={[mpeZoneConfig.lowerZone.pitchBendRange]}
                min={1}
                max={96}
                step={1}
                onValueChange={(v) => setMpeZoneConfig(prev => ({
                  ...prev,
                  lowerZone: { ...prev.lowerZone, pitchBendRange: v[0] }
                }))}
                className="flex-1"
              />
              <span className="text-xs w-8 text-center">{mpeZoneConfig.lowerZone.pitchBendRange}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-700 pt-4 space-y-2">
          <Label className="text-xs text-zinc-400">Upper Zone</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Master Channel</Label>
              <Select 
                value={mpeZoneConfig.upperZone.masterChannel.toString()}
                onValueChange={(v) => setMpeZoneConfig(prev => ({
                  ...prev,
                  upperZone: { ...prev.upperZone, masterChannel: parseInt(v) }
                }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[9, 10, 11, 12, 13, 14, 15, 16].map(ch => (
                    <SelectItem key={ch} value={ch.toString()}>{ch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Member Channels</Label>
              <Select 
                value={mpeZoneConfig.upperZone.memberChannels.toString()}
                onValueChange={(v) => setMpeZoneConfig(prev => ({
                  ...prev,
                  upperZone: { ...prev.upperZone, memberChannels: parseInt(v) }
                }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(n => (
                    <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Pitch Bend Range (semitones)</Label>
            <div className="flex items-center gap-2">
              <Slider
                value={[mpeZoneConfig.upperZone.pitchBendRange]}
                min={1}
                max={96}
                step={1}
                onValueChange={(v) => setMpeZoneConfig(prev => ({
                  ...prev,
                  upperZone: { ...prev.upperZone, pitchBendRange: v[0] }
                }))}
                className="flex-1"
              />
              <span className="text-xs w-8 text-center">{mpeZoneConfig.upperZone.pitchBendRange}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-700">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span>Lower Zone: CH {mpeZoneConfig.lowerZone.masterChannel + 1}-{mpeZoneConfig.lowerZone.masterChannel + mpeZoneConfig.lowerZone.memberChannels}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <span>Upper Zone: CH {mpeZoneConfig.upperZone.masterChannel - mpeZoneConfig.upperZone.memberChannels}-{mpeZoneConfig.upperZone.masterChannel}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="h-full flex flex-col relative"
      style={{
        background: 'var(--studio-bg-medium)',
        borderTop: '1px solid var(--studio-border)',
      }}
    >
      <div
        className="h-12 px-4 flex items-center gap-4 border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <div className="flex items-center gap-2">
          <Button
            variant={tool === 'pencil' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTool('pencil')}
            className="h-8"
            title="Pencil Tool (1)"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === 'select' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTool('select')}
            className="h-8"
            title="Select Tool (2)"
          >
            <Scissors className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === 'eraser' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTool('eraser')}
            className="h-8"
            title="Eraser Tool (3)"
          >
            <Eraser className="h-4 w-4" />
          </Button>
          {mpeEnabled && (
            <Button
              variant={tool === 'expression' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTool('expression')}
              className="h-8"
              title="Expression Tool (4)"
            >
              <Activity className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Snap:</span>
          <Select value={snapValue.toString()} onValueChange={(v) => setSnapValue(parseFloat(v))}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Off</SelectItem>
              <SelectItem value="0.0625">1/64</SelectItem>
              <SelectItem value="0.125">1/32</SelectItem>
              <SelectItem value="0.25">1/16</SelectItem>
              <SelectItem value="0.5">1/8</SelectItem>
              <SelectItem value="1">1/4</SelectItem>
              <SelectItem value="2">1/2</SelectItem>
              <SelectItem value="4">Bar</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom(Math.max(25, zoom - 25))}
            className="h-8"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-16 text-center">{zoom}%</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom(Math.min(400, zoom + 25))}
            className="h-8"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="mpe-toggle"
              checked={mpeEnabled}
              onCheckedChange={setMpeEnabled}
            />
            <Label htmlFor="mpe-toggle" className="text-xs cursor-pointer">MPE</Label>
          </div>
          
          {mpeEnabled && (
            <>
              <Button
                variant={showMPESettings ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setShowMPESettings(!showMPESettings)}
                className="h-8"
                title="MPE Zone Settings"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-2">
                <Switch
                  id="expression-lanes-toggle"
                  checked={showExpressionLanes}
                  onCheckedChange={setShowExpressionLanes}
                />
                <Label htmlFor="expression-lanes-toggle" className="text-xs cursor-pointer">Lanes</Label>
              </div>
            </>
          )}
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (selectedNotes.size > 0) {
                onNotesChange(notes.filter((n) => !selectedNotes.has(n.id)));
                setSelectedNotes(new Set());
                setEditingExpressionNote(null);
              }
            }}
            disabled={selectedNotes.size === 0}
            className="h-8"
            title="Delete Selected (Del)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {notes.length} notes {selectedNotes.size > 0 && `(${selectedNotes.size} selected)`}
          </span>
        </div>

        {editingExpressionNote && mpeEnabled && (
          <>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400">Editing Expression</span>
              <Select
                value={notes.find(n => n.id === editingExpressionNote)?.pitchBendRange?.toString() || '48'}
                onValueChange={(v) => {
                  if (editingExpressionNote) {
                    updateNote(editingExpressionNote, { pitchBendRange: parseInt(v) });
                  }
                }}
              >
                <SelectTrigger className="h-7 w-24">
                  <SelectValue placeholder="PB Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">±2 st</SelectItem>
                  <SelectItem value="12">±12 st</SelectItem>
                  <SelectItem value="24">±24 st</SelectItem>
                  <SelectItem value="48">±48 st</SelectItem>
                  <SelectItem value="96">±96 st</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      {showMPESettings && <MPESettingsPanel />}

      <div className="flex-1 flex overflow-hidden">
        <div
          className="w-16 flex-shrink-0 overflow-hidden border-r"
          style={{
            borderColor: 'var(--studio-border)',
            background: 'var(--studio-bg-deep)',
          }}
        >
          <div style={{ height: canvasHeight }}>
            {Array.from({ length: TOTAL_NOTES }).map((_, i) => {
              const pitch = TOTAL_NOTES - i - 1;
              const isBlackKey = [1, 3, 6, 8, 10].includes(pitch % 12);
              const isC = pitch % 12 === 0;

              return (
                <div
                  key={i}
                  className="flex items-center justify-end px-2 border-b"
                  style={{
                    height: `${NOTE_HEIGHT}px`,
                    background: isBlackKey ? '#252525' : '#1a1a1a',
                    borderColor: isC ? '#404040' : '#2a2a2a',
                    borderWidth: isC ? '2px 0' : '1px 0',
                  }}
                >
                  <span
                    className="text-xs font-mono"
                    style={{
                      color: isC ? 'var(--studio-text)' : 'var(--studio-text-muted)',
                      fontWeight: isC ? 600 : 400,
                    }}
                  >
                    {getNoteName(pitch)}
                  </span>
                </div>
              );
            })}
          </div>
          
          {showExpressionLanes && mpeEnabled && (
            <div style={{ height: totalExpressionHeight }} className="border-t border-zinc-700">
              {['Pitch', 'Press', 'Slide'].map((label, i) => (
                <div
                  key={label}
                  className="flex items-center justify-end px-2"
                  style={{
                    height: `${EXPRESSION_LANE_HEIGHT}px`,
                    background: i % 2 === 0 ? '#0d0d0d' : '#111111',
                    borderBottom: '1px solid #333',
                  }}
                >
                  <span className="text-xs font-mono text-zinc-500">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto" ref={gridRef}>
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              onClick={handleCanvasClick}
              className="cursor-crosshair"
              style={{ display: 'block' }}
            />
            
            {showExpressionLanes && mpeEnabled && (
              <canvas
                ref={expressionCanvasRef}
                width={expressionLaneWidth}
                height={totalExpressionHeight}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const laneIndex = Math.floor(y / EXPRESSION_LANE_HEIGHT);
                  const laneTypes: ExpressionLaneType[] = ['pitchBend', 'pressure', 'slide'];
                  if (laneIndex >= 0 && laneIndex < 3) {
                    handleExpressionCanvasClick(e, laneTypes[laneIndex]);
                  }
                }}
                className={tool === 'expression' && editingExpressionNote ? 'cursor-crosshair' : 'cursor-default'}
                style={{ display: 'block', borderTop: '1px solid #333' }}
              />
            )}
          </div>
        </div>
      </div>

      {mpeEnabled && (
        <div 
          className="h-6 px-4 flex items-center gap-4 border-t text-xs"
          style={{ borderColor: 'var(--studio-border)', background: 'var(--studio-bg-deep)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">MPE Zones:</span>
            <span className="text-blue-400">Lower (CH{mpeZoneConfig.lowerZone.masterChannel + 1}-{mpeZoneConfig.lowerZone.masterChannel + mpeZoneConfig.lowerZone.memberChannels})</span>
            {mpeZoneConfig.upperZone.memberChannels > 0 && (
              <span className="text-purple-400">Upper (CH{mpeZoneConfig.upperZone.masterChannel - mpeZoneConfig.upperZone.memberChannels}-{mpeZoneConfig.upperZone.masterChannel})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Active Channels:</span>
            <div className="flex gap-1">
              {Array.from(new Set(notes.filter(n => n.mpeChannel).map(n => n.mpeChannel!))).sort((a, b) => a - b).map(ch => (
                <span key={ch} className="px-1 py-0.5 bg-zinc-800 rounded text-green-400">{ch}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
