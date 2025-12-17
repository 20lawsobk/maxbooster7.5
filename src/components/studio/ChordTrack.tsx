import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  Music,
  Plus,
  Trash2,
  Edit2,
  ChevronUp,
  ChevronDown,
  Wand2,
  Link,
  Unlink,
  RotateCcw,
  Lightbulb,
  ListMusic,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useStudioStore } from '@/lib/studioStore';

export interface Chord {
  id: string;
  name: string;
  root: string;
  quality: string;
  bass?: string;
  startTime: number;
  duration: number;
  color: string;
}

interface ChordTrackProps {
  duration: number;
  onTimelineClick?: (time: number) => void;
  onChordChange?: (chords: Chord[]) => void;
  initialChords?: Chord[];
}

const CHORD_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_ROOTS_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const CHORD_QUALITIES = [
  { value: '', label: 'Major', suffix: '' },
  { value: 'm', label: 'Minor', suffix: 'm' },
  { value: '7', label: 'Dominant 7', suffix: '7' },
  { value: 'maj7', label: 'Major 7', suffix: 'maj7' },
  { value: 'm7', label: 'Minor 7', suffix: 'm7' },
  { value: 'dim', label: 'Diminished', suffix: 'dim' },
  { value: 'dim7', label: 'Diminished 7', suffix: 'dim7' },
  { value: 'aug', label: 'Augmented', suffix: 'aug' },
  { value: 'sus2', label: 'Suspended 2', suffix: 'sus2' },
  { value: 'sus4', label: 'Suspended 4', suffix: 'sus4' },
  { value: '6', label: 'Major 6', suffix: '6' },
  { value: 'm6', label: 'Minor 6', suffix: 'm6' },
  { value: '9', label: 'Dominant 9', suffix: '9' },
  { value: 'maj9', label: 'Major 9', suffix: 'maj9' },
  { value: 'm9', label: 'Minor 9', suffix: 'm9' },
  { value: 'add9', label: 'Add 9', suffix: 'add9' },
  { value: '11', label: 'Dominant 11', suffix: '11' },
  { value: '13', label: 'Dominant 13', suffix: '13' },
];

const CHORD_COLORS = [
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

const CHORD_PROGRESSIONS = [
  { name: 'I - IV - V - I (Pop/Rock)', chords: ['I', 'IV', 'V', 'I'], key: 'C' },
  { name: 'I - V - vi - IV (Pop)', chords: ['I', 'V', 'vi', 'IV'], key: 'C' },
  { name: 'ii - V - I (Jazz)', chords: ['ii', 'V', 'I'], key: 'C' },
  { name: 'I - vi - IV - V (50s)', chords: ['I', 'vi', 'IV', 'V'], key: 'C' },
  { name: 'vi - IV - I - V (Pop)', chords: ['vi', 'IV', 'I', 'V'], key: 'C' },
  { name: 'I - IV - vi - V (Alternative)', chords: ['I', 'IV', 'vi', 'V'], key: 'C' },
  { name: 'I - bVII - IV - I (Rock)', chords: ['I', 'bVII', 'IV', 'I'], key: 'C' },
  { name: 'i - VI - III - VII (Minor Pop)', chords: ['i', 'VI', 'III', 'VII'], key: 'Am' },
  { name: 'I - II - IV - I (Blues Rock)', chords: ['I', 'II', 'IV', 'I'], key: 'C' },
  { name: 'i - iv - VII - III (Andalusian)', chords: ['i', 'iv', 'VII', 'III'], key: 'Am' },
];

const ROMAN_TO_CHORD: Record<string, { semitones: number; quality: string }> = {
  'I': { semitones: 0, quality: '' },
  'i': { semitones: 0, quality: 'm' },
  'II': { semitones: 2, quality: '' },
  'ii': { semitones: 2, quality: 'm' },
  'bII': { semitones: 1, quality: '' },
  'III': { semitones: 4, quality: '' },
  'iii': { semitones: 4, quality: 'm' },
  'bIII': { semitones: 3, quality: '' },
  'IV': { semitones: 5, quality: '' },
  'iv': { semitones: 5, quality: 'm' },
  'V': { semitones: 7, quality: '' },
  'v': { semitones: 7, quality: 'm' },
  'VI': { semitones: 9, quality: '' },
  'vi': { semitones: 9, quality: 'm' },
  'bVI': { semitones: 8, quality: '' },
  'VII': { semitones: 11, quality: '' },
  'vii': { semitones: 11, quality: 'dim' },
  'bVII': { semitones: 10, quality: '' },
};

const getChordSubstitutions = (chord: Chord): string[] => {
  const substitutions: string[] = [];
  const rootIndex = CHORD_ROOTS.indexOf(chord.root);
  
  if (chord.quality === '' || chord.quality === 'maj7') {
    const relMinorRoot = CHORD_ROOTS[(rootIndex + 9) % 12];
    substitutions.push(`${relMinorRoot}m7`);
    substitutions.push(`${chord.root}6`);
    substitutions.push(`${chord.root}add9`);
  } else if (chord.quality === 'm' || chord.quality === 'm7') {
    const relMajorRoot = CHORD_ROOTS[(rootIndex + 3) % 12];
    substitutions.push(`${relMajorRoot}maj7`);
    substitutions.push(`${chord.root}m9`);
    substitutions.push(`${chord.root}m6`);
  } else if (chord.quality === '7') {
    const tritoneRoot = CHORD_ROOTS[(rootIndex + 6) % 12];
    substitutions.push(`${tritoneRoot}7`);
    substitutions.push(`${chord.root}9`);
    substitutions.push(`${chord.root}13`);
  }
  
  return substitutions;
};

const transposeChord = (chord: Chord, semitones: number): Chord => {
  const rootIndex = CHORD_ROOTS.indexOf(chord.root);
  if (rootIndex === -1) return chord;
  
  const newRootIndex = (rootIndex + semitones + 12) % 12;
  const newRoot = CHORD_ROOTS[newRootIndex];
  const newName = `${newRoot}${chord.quality}${chord.bass ? `/${chord.bass}` : ''}`;
  
  let newBass = chord.bass;
  if (chord.bass) {
    const bassIndex = CHORD_ROOTS.indexOf(chord.bass);
    if (bassIndex !== -1) {
      newBass = CHORD_ROOTS[(bassIndex + semitones + 12) % 12];
    }
  }
  
  return {
    ...chord,
    root: newRoot,
    name: newName,
    bass: newBass,
  };
};

const romanToChord = (roman: string, keyRoot: string): { root: string; quality: string } => {
  const mapping = ROMAN_TO_CHORD[roman];
  if (!mapping) return { root: keyRoot, quality: '' };
  
  const keyIndex = CHORD_ROOTS.indexOf(keyRoot);
  const chordRootIndex = (keyIndex + mapping.semitones) % 12;
  
  return {
    root: CHORD_ROOTS[chordRootIndex],
    quality: mapping.quality,
  };
};

export function ChordTrack({
  duration,
  onTimelineClick,
  onChordChange,
  initialChords = [],
}: ChordTrackProps) {
  const { currentTime, snapEnabled, snapResolution, zoom } = useStudioStore();
  
  const [chords, setChords] = useState<Chord[]>(initialChords);
  const [selectedChordId, setSelectedChordId] = useState<string | null>(null);
  const [editingChordId, setEditingChordId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [followChords, setFollowChords] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showProgressions, setShowProgressions] = useState(false);
  const [showSubstitutions, setShowSubstitutions] = useState(false);
  const [transposeSemitones, setTransposeSemitones] = useState(0);
  
  const [newChordRoot, setNewChordRoot] = useState('C');
  const [newChordQuality, setNewChordQuality] = useState('');
  const [newChordBass, setNewChordBass] = useState('');
  
  const [draggingChord, setDraggingChord] = useState<string | null>(null);
  const [resizingChord, setResizingChord] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [previewPosition, setPreviewPosition] = useState<{ startTime: number; endTime: number } | null>(null);
  
  const timelineRef = useRef<HTMLDivElement>(null);

  const pixelsToTime = useCallback((pixels: number): number => {
    if (!timelineRef.current) return 0;
    const width = timelineRef.current.offsetWidth;
    return (pixels / width) * duration;
  }, [duration]);

  const timeToPixels = useCallback((time: number): number => {
    if (!timelineRef.current) return 0;
    const width = timelineRef.current.offsetWidth;
    return (time / duration) * width;
  }, [duration]);

  const snapToGrid = useCallback((time: number): number => {
    if (!snapEnabled) return time;
    return Math.round(time / snapResolution) * snapResolution;
  }, [snapEnabled, snapResolution]);

  const getChordDisplayName = useCallback((chord: Chord): string => {
    return `${chord.root}${chord.quality}${chord.bass ? `/${chord.bass}` : ''}`;
  }, []);

  const handleAddChord = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAdding || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let clickTime = pixelsToTime(x);
    clickTime = snapToGrid(clickTime);

    const chordName = `${newChordRoot}${newChordQuality}${newChordBass ? `/${newChordBass}` : ''}`;
    
    const newChord: Chord = {
      id: `chord-${Date.now()}`,
      name: chordName,
      root: newChordRoot,
      quality: newChordQuality,
      bass: newChordBass || undefined,
      startTime: Math.max(0, Math.min(clickTime, duration - 1)),
      duration: snapResolution * 4,
      color: CHORD_COLORS[chords.length % CHORD_COLORS.length],
    };

    const newChords = [...chords, newChord].sort((a, b) => a.startTime - b.startTime);
    setChords(newChords);
    setSelectedChordId(newChord.id);
    onChordChange?.(newChords);
    setIsAdding(false);
  }, [isAdding, pixelsToTime, snapToGrid, newChordRoot, newChordQuality, newChordBass, duration, snapResolution, chords, onChordChange]);

  const handleChordClick = useCallback((e: React.MouseEvent, chord: Chord) => {
    e.stopPropagation();
    setSelectedChordId(chord.id);
    if (onTimelineClick) {
      onTimelineClick(chord.startTime);
    }
  }, [onTimelineClick]);

  const deleteChord = useCallback((chordId: string) => {
    const newChords = chords.filter(c => c.id !== chordId);
    setChords(newChords);
    if (selectedChordId === chordId) {
      setSelectedChordId(null);
    }
    onChordChange?.(newChords);
  }, [chords, selectedChordId, onChordChange]);

  const updateChord = useCallback((chordId: string, updates: Partial<Chord>) => {
    const newChords = chords.map(c => 
      c.id === chordId ? { ...c, ...updates } : c
    ).sort((a, b) => a.startTime - b.startTime);
    setChords(newChords);
    onChordChange?.(newChords);
  }, [chords, onChordChange]);

  const handleTransposeAll = useCallback((semitones: number) => {
    const transposedChords = chords.map(chord => transposeChord(chord, semitones));
    setChords(transposedChords);
    setTransposeSemitones(prev => prev + semitones);
    onChordChange?.(transposedChords);
  }, [chords, onChordChange]);

  const handleResetTranspose = useCallback(() => {
    if (transposeSemitones !== 0) {
      handleTransposeAll(-transposeSemitones);
      setTransposeSemitones(0);
    }
  }, [transposeSemitones, handleTransposeAll]);

  const handleDetectChords = useCallback(() => {
    setIsDetecting(true);
    setTimeout(() => {
      setIsDetecting(false);
    }, 2000);
  }, []);

  const handleApplyProgression = useCallback((progression: typeof CHORD_PROGRESSIONS[0]) => {
    const progressionChords: Chord[] = progression.chords.map((roman, index) => {
      const { root, quality } = romanToChord(roman, progression.key === 'Am' ? 'A' : 'C');
      const chordDuration = duration / progression.chords.length;
      
      return {
        id: `chord-${Date.now()}-${index}`,
        name: `${root}${quality}`,
        root,
        quality,
        startTime: index * chordDuration,
        duration: chordDuration,
        color: CHORD_COLORS[index % CHORD_COLORS.length],
      };
    });
    
    setChords(progressionChords);
    onChordChange?.(progressionChords);
    setShowProgressions(false);
  }, [duration, onChordChange]);

  const handleApplySubstitution = useCallback((chordId: string, newName: string) => {
    const parts = newName.match(/^([A-G][#b]?)(.*)$/);
    if (!parts) return;
    
    const [, root, quality] = parts;
    updateChord(chordId, { name: newName, root, quality });
    setShowSubstitutions(false);
  }, [updateChord]);

  const handleDragStart = useCallback((e: React.MouseEvent, chord: Chord) => {
    e.stopPropagation();
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickTime = pixelsToTime(clickX);
    
    setDragOffset(clickTime - chord.startTime);
    setDraggingChord(chord.id);
    setPreviewPosition({ startTime: chord.startTime, endTime: chord.startTime + chord.duration });
  }, [pixelsToTime]);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    if (!draggingChord || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseTime = pixelsToTime(mouseX);

    const chord = chords.find(c => c.id === draggingChord);
    if (!chord) return;

    let newStartTime = mouseTime - dragOffset;
    newStartTime = snapToGrid(newStartTime);
    newStartTime = Math.max(0, Math.min(newStartTime, duration - chord.duration));

    setPreviewPosition({ startTime: newStartTime, endTime: newStartTime + chord.duration });
  }, [draggingChord, chords, pixelsToTime, snapToGrid, dragOffset, duration]);

  const handleDragEnd = useCallback(() => {
    if (!draggingChord || !previewPosition) {
      setDraggingChord(null);
      setPreviewPosition(null);
      return;
    }

    updateChord(draggingChord, { startTime: previewPosition.startTime });
    setDraggingChord(null);
    setPreviewPosition(null);
  }, [draggingChord, previewPosition, updateChord]);

  const handleResizeStart = useCallback((e: React.MouseEvent, chordId: string, edge: 'start' | 'end', chord: Chord) => {
    e.stopPropagation();
    setResizingChord({ id: chordId, edge });
    setPreviewPosition({ startTime: chord.startTime, endTime: chord.startTime + chord.duration });
  }, []);

  const handleResize = useCallback((e: React.MouseEvent) => {
    if (!resizingChord || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let mouseTime = pixelsToTime(mouseX);
    mouseTime = snapToGrid(mouseTime);

    const chord = chords.find(c => c.id === resizingChord.id);
    if (!chord) return;

    let newStartTime = chord.startTime;
    let newEndTime = chord.startTime + chord.duration;

    if (resizingChord.edge === 'start') {
      newStartTime = Math.max(0, Math.min(mouseTime, chord.startTime + chord.duration - 0.25));
    } else {
      newEndTime = Math.max(chord.startTime + 0.25, Math.min(mouseTime, duration));
    }

    setPreviewPosition({ startTime: newStartTime, endTime: newEndTime });
  }, [resizingChord, chords, pixelsToTime, snapToGrid, duration]);

  const handleResizeEnd = useCallback(() => {
    if (!resizingChord || !previewPosition) {
      setResizingChord(null);
      setPreviewPosition(null);
      return;
    }

    const newDuration = previewPosition.endTime - previewPosition.startTime;
    updateChord(resizingChord.id, { 
      startTime: previewPosition.startTime, 
      duration: newDuration 
    });
    
    setResizingChord(null);
    setPreviewPosition(null);
  }, [resizingChord, previewPosition, updateChord]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const mouseEvent = e as unknown as React.MouseEvent;
      if (draggingChord) {
        handleDrag(mouseEvent);
      } else if (resizingChord) {
        handleResize(mouseEvent);
      }
    };

    const handleMouseUp = () => {
      if (draggingChord) {
        handleDragEnd();
      } else if (resizingChord) {
        handleResizeEnd();
      }
    };

    if (draggingChord || resizingChord) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingChord, resizingChord, handleDrag, handleDragEnd, handleResize, handleResizeEnd]);

  const selectedChord = useMemo(() => 
    chords.find(c => c.id === selectedChordId), 
    [chords, selectedChordId]
  );

  const substitutions = useMemo(() => 
    selectedChord ? getChordSubstitutions(selectedChord) : [],
    [selectedChord]
  );

  return (
    <div className="relative">
      <div
        className="h-10 flex items-center justify-between px-3 border-b"
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Music className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--studio-text-muted)' }}>
            CHORDS
          </span>
          {transposeSemitones !== 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
              {transposeSemitones > 0 ? '+' : ''}{transposeSemitones} semitones
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 mr-2">
            <Switch
              id="follow-chords"
              checked={followChords}
              onCheckedChange={setFollowChords}
              className="scale-75"
            />
            <Label htmlFor="follow-chords" className="text-[10px] cursor-pointer" style={{ color: 'var(--studio-text-muted)' }}>
              Follow
            </Label>
            {followChords ? (
              <Link className="h-3 w-3 text-blue-400" />
            ) : (
              <Unlink className="h-3 w-3" style={{ color: 'var(--studio-text-muted)' }} />
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => handleTransposeAll(-1)}
            title="Transpose down 1 semitone"
          >
            <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => handleTransposeAll(1)}
            title="Transpose up 1 semitone"
          >
            <ChevronUp className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
          </Button>
          
          {transposeSemitones !== 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleResetTranspose}
              title="Reset transposition"
            >
              <RotateCcw className="h-3 w-3" style={{ color: 'var(--studio-text)' }} />
            </Button>
          )}

          <Popover open={showProgressions} onOpenChange={setShowProgressions}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                title="Chord progressions"
              >
                <ListMusic className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <div className="text-xs font-semibold mb-2">Common Progressions</div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {CHORD_PROGRESSIONS.map((prog, idx) => (
                  <button
                    key={idx}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors"
                    onClick={() => handleApplyProgression(prog)}
                  >
                    <div className="font-medium">{prog.name}</div>
                    <div className="text-muted-foreground text-[10px]">
                      {prog.chords.join(' → ')}
                    </div>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 gap-1 ${isDetecting ? 'animate-pulse bg-purple-500/20' : ''}`}
            onClick={handleDetectChords}
            disabled={isDetecting}
            title="Detect chords from audio"
          >
            <Wand2 className="h-3.5 w-3.5" style={{ color: isDetecting ? '#a855f7' : 'var(--studio-text)' }} />
            <span className="text-[10px]">{isDetecting ? 'Detecting...' : 'Detect'}</span>
          </Button>

          <Popover open={isAdding} onOpenChange={setIsAdding}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 w-6 p-0 ${isAdding ? 'bg-blue-500/20' : ''}`}
                title="Add chord"
              >
                {isAdding ? (
                  <X className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
                ) : (
                  <Plus className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="space-y-3">
                <div className="text-xs font-semibold">New Chord</div>
                
                <div className="space-y-2">
                  <Label className="text-[10px]">Root</Label>
                  <Select value={newChordRoot} onValueChange={setNewChordRoot}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHORD_ROOTS.map(root => (
                        <SelectItem key={root} value={root} className="text-xs">{root}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px]">Quality</Label>
                  <Select value={newChordQuality} onValueChange={setNewChordQuality}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Major" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHORD_QUALITIES.map(q => (
                        <SelectItem key={q.value} value={q.value} className="text-xs">
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px]">Bass Note (optional)</Label>
                  <Select value={newChordBass} onValueChange={setNewChordBass}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="" className="text-xs">None</SelectItem>
                      {CHORD_ROOTS.map(root => (
                        <SelectItem key={root} value={root} className="text-xs">{root}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-2 border-t text-[10px] text-muted-foreground">
                  Preview: <span className="font-mono font-bold text-foreground">
                    {newChordRoot}{newChordQuality}{newChordBass ? `/${newChordBass}` : ''}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Click on timeline to place chord
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div
        ref={timelineRef}
        className={`h-16 relative border-b ${isAdding ? 'cursor-crosshair' : ''}`}
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
        onClick={handleAddChord}
        data-testid="chord-track-timeline"
      >
        {isAdding && chords.length === 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Click to add chord: {newChordRoot}{newChordQuality}
          </div>
        )}

        {chords.map((chord) => {
          const isSelected = chord.id === selectedChordId;
          const isDragging = chord.id === draggingChord;
          const isResizing = resizingChord?.id === chord.id;
          const showPreview = isDragging || isResizing;

          const displayStartTime = showPreview && previewPosition ? previewPosition.startTime : chord.startTime;
          const displayEndTime = showPreview && previewPosition ? previewPosition.endTime : chord.startTime + chord.duration;
          const displayDuration = displayEndTime - displayStartTime;

          return (
            <ContextMenu key={chord.id}>
              <ContextMenuTrigger>
                <div
                  className={`absolute top-2 bottom-2 rounded-md cursor-move transition-all ${
                    isSelected ? 'ring-2 ring-white z-10' : 'hover:ring-2 hover:ring-white/50'
                  } ${isDragging || isResizing ? 'opacity-70' : ''}`}
                  style={{
                    left: `${(displayStartTime / duration) * 100}%`,
                    width: `${(displayDuration / duration) * 100}%`,
                    backgroundColor: chord.color,
                    minWidth: '40px',
                  }}
                  onClick={(e) => handleChordClick(e, chord)}
                  onMouseDown={(e) => handleDragStart(e, chord)}
                  data-testid={`chord-${chord.id}`}
                >
                  <div className="h-full flex items-center justify-center px-2 relative overflow-hidden">
                    <span className="text-white text-sm font-bold whitespace-nowrap drop-shadow-md">
                      {getChordDisplayName(chord)}
                    </span>
                  </div>

                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 rounded-l"
                    onMouseDown={(e) => handleResizeStart(e, chord.id, 'start', chord)}
                    data-testid={`chord-${chord.id}-resize-start`}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 active:bg-white/50 rounded-r"
                    onMouseDown={(e) => handleResizeStart(e, chord.id, 'end', chord)}
                    data-testid={`chord-${chord.id}-resize-end`}
                  />
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => setEditingChordId(chord.id)}>
                  <Edit2 className="h-3 w-3 mr-2" />
                  Edit Chord
                </ContextMenuItem>
                <ContextMenuItem onClick={() => {
                  setSelectedChordId(chord.id);
                  setShowSubstitutions(true);
                }}>
                  <Lightbulb className="h-3 w-3 mr-2" />
                  Substitutions
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => deleteChord(chord.id)}>
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/30 pointer-events-none z-20"
            style={{
              left: `${(currentTime / duration) * 100}%`,
            }}
          />
        )}
      </div>

      {snapEnabled && (draggingChord || resizingChord) && (
        <div className="absolute bottom-0 right-0 bg-blue-500 text-white text-xs px-2 py-1 rounded-tl z-30">
          Snap: {snapResolution}s
        </div>
      )}

      <Dialog open={editingChordId !== null} onOpenChange={(open) => !open && setEditingChordId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Chord</DialogTitle>
          </DialogHeader>
          {editingChordId && (() => {
            const editingChord = chords.find(c => c.id === editingChordId);
            if (!editingChord) return null;
            
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Root</Label>
                    <Select 
                      value={editingChord.root} 
                      onValueChange={(value) => updateChord(editingChordId, { 
                        root: value, 
                        name: `${value}${editingChord.quality}${editingChord.bass ? `/${editingChord.bass}` : ''}` 
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHORD_ROOTS.map(root => (
                          <SelectItem key={root} value={root}>{root}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Quality</Label>
                    <Select 
                      value={editingChord.quality} 
                      onValueChange={(value) => updateChord(editingChordId, { 
                        quality: value, 
                        name: `${editingChord.root}${value}${editingChord.bass ? `/${editingChord.bass}` : ''}` 
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Major" />
                      </SelectTrigger>
                      <SelectContent>
                        {CHORD_QUALITIES.map(q => (
                          <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Bass Note</Label>
                  <Select 
                    value={editingChord.bass || ''} 
                    onValueChange={(value) => updateChord(editingChordId, { 
                      bass: value || undefined, 
                      name: `${editingChord.root}${editingChord.quality}${value ? `/${value}` : ''}` 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {CHORD_ROOTS.map(root => (
                        <SelectItem key={root} value={root}>{root}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="pt-2 border-t">
                  <div className="text-sm text-muted-foreground">Preview:</div>
                  <div className="text-2xl font-bold">{getChordDisplayName(editingChord)}</div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingChordId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubstitutions} onOpenChange={setShowSubstitutions}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Chord Substitutions
            </DialogTitle>
          </DialogHeader>
          {selectedChord && (
            <div className="space-y-4">
              <div className="text-sm">
                Substitutions for <span className="font-bold">{getChordDisplayName(selectedChord)}</span>:
              </div>
              
              {substitutions.length > 0 ? (
                <div className="space-y-2">
                  {substitutions.map((sub, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left px-3 py-2 rounded-md border hover:bg-accent transition-colors"
                      onClick={() => handleApplySubstitution(selectedChord.id, sub)}
                    >
                      <span className="font-mono font-bold">{sub}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No substitutions available for this chord type.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubstitutions(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
