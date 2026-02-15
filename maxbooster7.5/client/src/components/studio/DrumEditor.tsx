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
  Play,
  Pause,
  Square,
  Copy,
  ClipboardPaste,
  Trash2,
  Volume2,
  Drum,
  Grid3X3,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Zap,
} from 'lucide-react';

interface DrumHit {
  id: string;
  step: number;
  drumIndex: number;
  velocity: number;
  accent: boolean;
}

interface DrumSound {
  name: string;
  shortName: string;
  midiNote: number;
  color: string;
  category: 'kick' | 'snare' | 'hihat' | 'tom' | 'cymbal' | 'perc';
}

interface DrumKit {
  id: string;
  name: string;
  sounds: DrumSound[];
}

interface DrumPattern {
  id: string;
  name: string;
  hits: DrumHit[];
  bars: number;
  resolution: number;
  swing: number;
}

interface DrumEditorProps {
  trackId: string;
  pattern?: DrumPattern;
  onPatternChange?: (pattern: DrumPattern) => void;
  isPlaying?: boolean;
  currentStep?: number;
  tempo?: number;
  onPlay?: () => void;
  onStop?: () => void;
}

const GM_DRUM_MAP: DrumSound[] = [
  { name: 'Kick Drum', shortName: 'KICK', midiNote: 36, color: '#ef4444', category: 'kick' },
  { name: 'Snare Drum', shortName: 'SNARE', midiNote: 38, color: '#f97316', category: 'snare' },
  { name: 'Closed Hi-Hat', shortName: 'CH', midiNote: 42, color: '#eab308', category: 'hihat' },
  { name: 'Open Hi-Hat', shortName: 'OH', midiNote: 46, color: '#84cc16', category: 'hihat' },
  { name: 'High Tom', shortName: 'HT', midiNote: 50, color: '#22c55e', category: 'tom' },
  { name: 'Mid Tom', shortName: 'MT', midiNote: 47, color: '#14b8a6', category: 'tom' },
  { name: 'Low Tom', shortName: 'LT', midiNote: 45, color: '#06b6d4', category: 'tom' },
  { name: 'Crash Cymbal', shortName: 'CRASH', midiNote: 49, color: '#3b82f6', category: 'cymbal' },
  { name: 'Ride Cymbal', shortName: 'RIDE', midiNote: 51, color: '#6366f1', category: 'cymbal' },
  { name: 'Clap', shortName: 'CLAP', midiNote: 39, color: '#8b5cf6', category: 'perc' },
  { name: 'Rim Shot', shortName: 'RIM', midiNote: 37, color: '#a855f7', category: 'perc' },
  { name: 'Cowbell', shortName: 'COW', midiNote: 56, color: '#d946ef', category: 'perc' },
];

const DRUM_KITS: DrumKit[] = [
  { id: 'standard', name: 'Standard Kit', sounds: GM_DRUM_MAP },
  { id: '808', name: 'TR-808', sounds: GM_DRUM_MAP.map(s => ({ ...s, name: `808 ${s.name}` })) },
  { id: '909', name: 'TR-909', sounds: GM_DRUM_MAP.map(s => ({ ...s, name: `909 ${s.name}` })) },
  { id: 'acoustic', name: 'Acoustic', sounds: GM_DRUM_MAP.map(s => ({ ...s, name: `Acoustic ${s.name}` })) },
  { id: 'electronic', name: 'Electronic', sounds: GM_DRUM_MAP.map(s => ({ ...s, name: `Electronic ${s.name}` })) },
];

const STEP_WIDTH = 32;
const ROW_HEIGHT = 36;
const LABEL_WIDTH = 80;

const createDefaultPattern = (): DrumPattern => ({
  id: `pattern-${Date.now()}`,
  name: 'Pattern 1',
  hits: [],
  bars: 1,
  resolution: 16,
  swing: 0,
});

export function DrumEditor({
  trackId,
  pattern: initialPattern,
  onPatternChange,
  isPlaying = false,
  currentStep = -1,
  tempo = 120,
  onPlay,
  onStop,
}: DrumEditorProps) {
  const [pattern, setPattern] = useState<DrumPattern>(initialPattern || createDefaultPattern());
  const [selectedKit, setSelectedKit] = useState<DrumKit>(DRUM_KITS[0]);
  const [selectedDrumIndex, setSelectedDrumIndex] = useState<number | null>(null);
  const [velocityEditMode, setVelocityEditMode] = useState(false);
  const [showAccents, setShowAccents] = useState(true);
  const [clipboard, setClipboard] = useState<DrumHit[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [editingHit, setEditingHit] = useState<DrumHit | null>(null);
  const [showPadView, setShowPadView] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const totalSteps = useMemo(() => pattern.bars * pattern.resolution, [pattern.bars, pattern.resolution]);
  const gridWidth = totalSteps * STEP_WIDTH;
  const gridHeight = selectedKit.sounds.length * ROW_HEIGHT;

  const updatePattern = useCallback((updates: Partial<DrumPattern>) => {
    const newPattern = { ...pattern, ...updates };
    setPattern(newPattern);
    onPatternChange?.(newPattern);
  }, [pattern, onPatternChange]);

  const getHitAt = useCallback((step: number, drumIndex: number): DrumHit | undefined => {
    return pattern.hits.find(h => h.step === step && h.drumIndex === drumIndex);
  }, [pattern.hits]);

  const addHit = useCallback((step: number, drumIndex: number, velocity: number = 100) => {
    const existingHit = getHitAt(step, drumIndex);
    if (existingHit) return;

    const newHit: DrumHit = {
      id: `hit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      step,
      drumIndex,
      velocity,
      accent: false,
    };
    updatePattern({ hits: [...pattern.hits, newHit] });
  }, [pattern.hits, getHitAt, updatePattern]);

  const removeHit = useCallback((hitId: string) => {
    updatePattern({ hits: pattern.hits.filter(h => h.id !== hitId) });
  }, [pattern.hits, updatePattern]);

  const updateHit = useCallback((hitId: string, updates: Partial<DrumHit>) => {
    updatePattern({
      hits: pattern.hits.map(h => h.id === hitId ? { ...h, ...updates } : h),
    });
  }, [pattern.hits, updatePattern]);

  const toggleHit = useCallback((step: number, drumIndex: number) => {
    const existingHit = getHitAt(step, drumIndex);
    if (existingHit) {
      removeHit(existingHit.id);
    } else {
      addHit(step, drumIndex);
    }
  }, [getHitAt, addHit, removeHit]);

  const handleGridClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const step = Math.floor(x / STEP_WIDTH);
    const drumIndex = Math.floor(y / ROW_HEIGHT);

    if (step >= 0 && step < totalSteps && drumIndex >= 0 && drumIndex < selectedKit.sounds.length) {
      if (velocityEditMode) {
        const hit = getHitAt(step, drumIndex);
        if (hit) {
          setEditingHit(hit);
          setDragStartY(e.clientY);
          setIsDragging(true);
        }
      } else {
        toggleHit(step, drumIndex);
      }
    }
  }, [totalSteps, selectedKit.sounds.length, velocityEditMode, getHitAt, toggleHit]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !editingHit) return;

    const deltaY = dragStartY - e.clientY;
    const velocityChange = Math.round(deltaY / 2);
    const newVelocity = Math.max(1, Math.min(127, editingHit.velocity + velocityChange));

    updateHit(editingHit.id, { velocity: newVelocity });
    setEditingHit({ ...editingHit, velocity: newVelocity });
    setDragStartY(e.clientY);
  }, [isDragging, editingHit, dragStartY, updateHit]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setEditingHit(null);
  }, []);

  const copyPattern = useCallback(() => {
    setClipboard([...pattern.hits]);
  }, [pattern.hits]);

  const pastePattern = useCallback(() => {
    if (!clipboard) return;
    updatePattern({ hits: clipboard.map(h => ({ ...h, id: `hit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` })) });
  }, [clipboard, updatePattern]);

  const clearPattern = useCallback(() => {
    updatePattern({ hits: [] });
  }, [updatePattern]);

  const toggleAccent = useCallback((step: number, drumIndex: number) => {
    const hit = getHitAt(step, drumIndex);
    if (hit) {
      updateHit(hit.id, { accent: !hit.accent });
    }
  }, [getHitAt, updateHit]);

  const applySwing = useCallback((swingAmount: number) => {
    updatePattern({ swing: swingAmount });
  }, [updatePattern]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < selectedKit.sounds.length; row++) {
      const y = row * ROW_HEIGHT;
      const sound = selectedKit.sounds[row];
      const isSelected = selectedDrumIndex === row;

      ctx.fillStyle = isSelected ? '#1a1a2e' : (row % 2 === 0 ? '#0f0f0f' : '#121212');
      ctx.fillRect(0, y, canvas.width, ROW_HEIGHT);

      ctx.strokeStyle = '#252525';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + ROW_HEIGHT);
      ctx.lineTo(canvas.width, y + ROW_HEIGHT);
      ctx.stroke();
    }

    for (let step = 0; step <= totalSteps; step++) {
      const x = step * STEP_WIDTH;
      const isBar = step % pattern.resolution === 0;
      const isBeat = step % (pattern.resolution / 4) === 0;

      ctx.strokeStyle = isBar ? '#404040' : isBeat ? '#303030' : '#1a1a1a';
      ctx.lineWidth = isBar ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    pattern.hits.forEach((hit) => {
      const x = hit.step * STEP_WIDTH;
      const y = hit.drumIndex * ROW_HEIGHT;
      const sound = selectedKit.sounds[hit.drumIndex];

      if (!sound) return;

      const velocityScale = hit.velocity / 127;
      const padding = 4;

      ctx.fillStyle = sound.color;
      ctx.globalAlpha = 0.3 + velocityScale * 0.7;
      ctx.fillRect(x + padding, y + padding, STEP_WIDTH - padding * 2, ROW_HEIGHT - padding * 2);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = sound.color;
      ctx.lineWidth = hit.accent ? 3 : 2;
      ctx.strokeRect(x + padding, y + padding, STEP_WIDTH - padding * 2, ROW_HEIGHT - padding * 2);

      if (hit.accent && showAccents) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(x + STEP_WIDTH - padding - 8, y + padding);
        ctx.lineTo(x + STEP_WIDTH - padding, y + padding);
        ctx.lineTo(x + STEP_WIDTH - padding, y + padding + 8);
        ctx.closePath();
        ctx.fill();
      }

      const barHeight = (hit.velocity / 127) * (ROW_HEIGHT - padding * 2 - 4);
      ctx.fillStyle = sound.color;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(
        x + padding + 2,
        y + ROW_HEIGHT - padding - 2 - barHeight,
        4,
        barHeight
      );
      ctx.globalAlpha = 1;
    });

    if (isPlaying && currentStep >= 0 && currentStep < totalSteps) {
      const x = currentStep * STEP_WIDTH;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x, 0, STEP_WIDTH, canvas.height);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
  }, [pattern, selectedKit, selectedDrumIndex, showAccents, isPlaying, currentStep, totalSteps]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setEditingHit(null);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        copyPattern();
      } else if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        pastePattern();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedDrumIndex !== null) {
          const hitsToRemove = pattern.hits.filter(h => h.drumIndex === selectedDrumIndex);
          updatePattern({ hits: pattern.hits.filter(h => h.drumIndex !== selectedDrumIndex) });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copyPattern, pastePattern, selectedDrumIndex, pattern.hits, updatePattern]);

  const renderDrumPads = () => (
    <div className="grid grid-cols-4 gap-2 p-4" style={{ background: 'var(--studio-bg-deep)' }}>
      {selectedKit.sounds.map((sound, index) => {
        const hasHits = pattern.hits.some(h => h.drumIndex === index);
        return (
          <button
            key={index}
            className="relative h-20 rounded-lg flex flex-col items-center justify-center gap-1 transition-all duration-150 hover:scale-105 active:scale-95"
            style={{
              background: hasHits
                ? `linear-gradient(135deg, ${sound.color}40, ${sound.color}20)`
                : 'var(--studio-bg-medium)',
              border: `2px solid ${hasHits ? sound.color : 'var(--studio-border)'}`,
              boxShadow: hasHits ? `0 0 20px ${sound.color}30` : 'none',
            }}
            onClick={() => setSelectedDrumIndex(index)}
            onDoubleClick={() => {
              const lastStep = pattern.hits
                .filter(h => h.drumIndex === index)
                .reduce((max, h) => Math.max(max, h.step), -1);
              addHit((lastStep + 1) % totalSteps, index);
            }}
          >
            <span className="text-xs font-bold" style={{ color: sound.color }}>
              {sound.shortName}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
              {sound.name}
            </span>
            {hasHits && (
              <div
                className="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse"
                style={{ background: sound.color }}
              />
            )}
          </button>
        );
      })}
    </div>
  );

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
          className="h-12 px-4 flex items-center gap-4 border-b"
          style={{ borderColor: 'var(--studio-border)' }}
        >
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isPlaying ? 'default' : 'ghost'}
                  size="sm"
                  onClick={isPlaying ? onStop : onPlay}
                  className="h-8 w-8"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isPlaying ? 'Stop' : 'Play'}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onStop}
                  className="h-8 w-8"
                >
                  <Square className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop</TooltipContent>
            </Tooltip>
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Kit:</span>
            <Select
              value={selectedKit.id}
              onValueChange={(id) => setSelectedKit(DRUM_KITS.find(k => k.id === id) || DRUM_KITS[0])}
            >
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRUM_KITS.map((kit) => (
                  <SelectItem key={kit.id} value={kit.id}>
                    {kit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Resolution:</span>
            <Select
              value={pattern.resolution.toString()}
              onValueChange={(v) => updatePattern({ resolution: parseInt(v) })}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8">1/8</SelectItem>
                <SelectItem value="16">1/16</SelectItem>
                <SelectItem value="32">1/32</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Bars:</span>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updatePattern({ bars: Math.max(1, pattern.bars - 1) })}
                className="h-8 w-8"
                disabled={pattern.bars <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center text-sm font-mono">{pattern.bars}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updatePattern({ bars: Math.min(4, pattern.bars + 1) })}
                className="h-8 w-8"
                disabled={pattern.bars >= 4}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={velocityEditMode ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setVelocityEditMode(!velocityEditMode)}
                  className="h-8"
                >
                  <Volume2 className="h-4 w-4 mr-1" />
                  <span className="text-xs">Velocity</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle velocity editing mode</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showAccents ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setShowAccents(!showAccents)}
                  className="h-8"
                >
                  <Zap className="h-4 w-4 mr-1" />
                  <span className="text-xs">Accents</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle accent overlay</TooltipContent>
            </Tooltip>
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-2">
            <Shuffle className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Swing:</span>
            <div className="w-24">
              <Slider
                value={[pattern.swing]}
                onValueChange={([v]) => applySwing(v)}
                min={0}
                max={100}
                step={1}
                className="h-6"
              />
            </div>
            <span className="text-xs w-8 text-muted-foreground">{pattern.swing}%</span>
          </div>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyPattern}
                  className="h-8"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy Pattern (Ctrl+C)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={pastePattern}
                  disabled={!clipboard}
                  className="h-8"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Paste Pattern (Ctrl+V)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearPattern}
                  className="h-8"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear Pattern</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPattern(createDefaultPattern())}
                  className="h-8"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset Pattern</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showPadView ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setShowPadView(!showPadView)}
                  className="h-8"
                >
                  <Drum className="h-4 w-4 mr-1" />
                  <span className="text-xs">Pads</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle drum pad view</TooltipContent>
            </Tooltip>

            <span className="text-xs text-muted-foreground">
              {pattern.hits.length} hits
            </span>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div
            className="flex-shrink-0 overflow-y-auto border-r"
            style={{
              width: `${LABEL_WIDTH}px`,
              borderColor: 'var(--studio-border)',
              background: 'var(--studio-bg-deep)',
            }}
          >
            {selectedKit.sounds.map((sound, index) => (
              <div
                key={index}
                className="flex items-center px-2 cursor-pointer transition-colors"
                style={{
                  height: `${ROW_HEIGHT}px`,
                  background: selectedDrumIndex === index
                    ? `${sound.color}20`
                    : 'transparent',
                  borderBottom: '1px solid var(--studio-border)',
                }}
                onClick={() => setSelectedDrumIndex(index)}
                onDoubleClick={() => {
                  toggleAccent(
                    pattern.hits.find(h => h.drumIndex === index)?.step ?? 0,
                    index
                  );
                }}
              >
                <div
                  className="w-3 h-3 rounded-sm mr-2 flex-shrink-0"
                  style={{ background: sound.color }}
                />
                <span
                  className="text-xs font-medium truncate"
                  style={{
                    color: selectedDrumIndex === index
                      ? 'var(--studio-text)'
                      : 'var(--studio-text-muted)',
                  }}
                >
                  {sound.shortName}
                </span>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-auto" ref={gridRef}>
            <div className="relative" style={{ width: gridWidth, height: gridHeight }}>
              <canvas
                ref={canvasRef}
                width={gridWidth}
                height={gridHeight}
                onClick={handleGridClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const step = Math.floor(x / STEP_WIDTH);
                  const drumIndex = Math.floor(y / ROW_HEIGHT);
                  toggleAccent(step, drumIndex);
                }}
                className={velocityEditMode ? 'cursor-ns-resize' : 'cursor-pointer'}
                style={{ display: 'block' }}
              />
            </div>
          </div>

          {showPadView && (
            <div
              className="flex-shrink-0 w-72 border-l overflow-y-auto"
              style={{ borderColor: 'var(--studio-border)' }}
            >
              {renderDrumPads()}
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
            <span className="text-xs text-muted-foreground">
              Step: {currentStep >= 0 ? currentStep + 1 : '-'} / {totalSteps}
            </span>
            <span className="text-xs text-muted-foreground">
              Tempo: {tempo} BPM
            </span>
          </div>

          <div className="flex items-center gap-4">
            {velocityEditMode && editingHit && (
              <span className="text-xs text-muted-foreground">
                Velocity: {editingHit.velocity}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {selectedDrumIndex !== null ? selectedKit.sounds[selectedDrumIndex]?.name : 'Select a drum'}
            </span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
