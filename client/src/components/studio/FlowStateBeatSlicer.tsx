// @ts-nocheck
import { useState, useRef, useEffect, useMemo } from "react";
import { Scissors, Play, Pause, Square, RotateCcw, Grid, Wand2, Download, Trash2, Volume2, Lock, Unlock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Slice {
  id: string;
  startTime: number;
  endTime: number;
  isSelected: boolean;
  isLocked: boolean;
  velocity: number;
  pitch: number;
  midiNote: number;
  name: string;
}

interface FlowStateBeatSlicerProps {
  audioUrl?: string;
  duration?: number;
  bpm?: number;
  onExportSlices?: (slices: Slice[]) => void;
  className?: string;
}

const GRID_DIVISIONS = [
  { value: "1", label: "1 Bar" },
  { value: "1/2", label: "1/2" },
  { value: "1/4", label: "1/4" },
  { value: "1/8", label: "1/8" },
  { value: "1/16", label: "1/16" },
  { value: "1/32", label: "1/32" },
];

const generateWaveform = (): number[] => {
  const waveform: number[] = [];
  for (let i = 0; i < 400; i++) {
    const x = i / 400;
    let val = Math.sin(x * Math.PI * 8) * 0.3;
    val += Math.sin(x * Math.PI * 16) * 0.2;
    val += Math.sin(x * Math.PI * 32) * 0.15;

    if (i % 50 < 10) val *= 1.5;

    val += (Math.random() - 0.5) * 0.1;
    waveform.push(Math.abs(val) + 0.1);
  }
  return waveform;
};

export function FlowStateBeatSlicer({
  _audioUrl,
  duration = 4,
  bpm = 120,
  onExportSlices,
  className,
}: FlowStateBeatSlicerProps) {
  const { toast } = useToast();
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const [waveform] = useState(() => generateWaveform());
  const [slices, setSlices] = useState<Slice[]>([]);
  const [selectedSlices, setSelectedSlices] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingSlice, setPlayingSlice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [gridDivision, setGridDivision] = useState("1/8");
  const [sensitivity, setSensitivity] = useState([50]);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showTransients, setShowTransients] = useState(true);
  const [previewVolume, setPreviewVolume] = useState([0.8]);

  const transientPositions = useMemo(() => {
    const positions: number[] = [];
    let lastPeak = 0;

    waveform.forEach((val, idx) => {
      const threshold = 0.3 + (1 - sensitivity[0] / 100) * 0.4;
      if (val > threshold && idx - lastPeak > 20) {
        positions.push(idx / waveform.length);
        lastPeak = idx;
      }
    });

    return positions;
  }, [waveform, sensitivity]);

  const gridLines = useMemo(() => {
    const lines: number[] = [];
    let divisions = 8;

    switch (gridDivision) {
      case "1":
        divisions = 1;
        break;
      case "1/2":
        divisions = 2;
        break;
      case "1/4":
        divisions = 4;
        break;
      case "1/8":
        divisions = 8;
        break;
      case "1/16":
        divisions = 16;
        break;
      case "1/32":
        divisions = 32;
        break;
    }

    for (let i = 0; i <= divisions; i++) {
      lines.push(i / divisions);
    }

    return lines;
  }, [gridDivision]);

  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    gridLines.forEach((pos) => {
      const x = pos * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });

    slices.forEach((slice) => {
      const x1 = (slice.startTime / duration) * width;
      const x2 = (slice.endTime / duration) * width;
      const isSelected = selectedSlices.includes(slice.id);
      const isPlayingNow = playingSlice === slice.id;

      ctx.fillStyle = isPlayingNow
        ? "rgba(34, 197, 94, 0.2)"
        : isSelected
          ? "rgba(168, 85, 247, 0.2)"
          : "rgba(59, 130, 246, 0.1)";
      ctx.fillRect(x1, 0, x2 - x1, height);

      ctx.strokeStyle = isPlayingNow
        ? "#22c55e"
        : isSelected
          ? "#a855f7"
          : "#3b82f6";
      ctx.lineWidth = isSelected || isPlayingNow ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, height);
      ctx.stroke();
    });

    ctx.fillStyle = "#6366f1";
    const centerY = height / 2;
    waveform.forEach((val, idx) => {
      const x = (idx / waveform.length) * width;
      const h = val * height * 0.8;
      ctx.fillRect(x, centerY - h / 2, 1, h);
    });

    if (showTransients) {
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      transientPositions.forEach((pos) => {
        const x = pos * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    const playheadX = (currentTime / duration) * width;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }, [
    waveform,
    slices,
    selectedSlices,
    gridLines,
    currentTime,
    duration,
    transientPositions,
    showTransients,
    playingSlice,
  ]);

  const autoSlice = () => {
    const newSlices: Slice[] = [];
    const positions = [...transientPositions];

    if (positions[0] > 0.01) positions.unshift(0);
    if (positions[positions.length - 1] < 0.99) positions.push(1);

    positions.forEach((pos, idx) => {
      if (idx === positions.length - 1) return;

      let startTime = pos * duration;
      let endTime = positions[idx + 1] * duration;

      if (snapToGrid) {
        const gridSize = duration / (gridLines.length - 1);
        startTime = Math.round(startTime / gridSize) * gridSize;
        endTime = Math.round(endTime / gridSize) * gridSize;
      }

      if (endTime > startTime) {
        newSlices.push({
          id: `s${Date.now()}-${idx}`,
          startTime,
          endTime,
          isSelected: false,
          isLocked: false,
          velocity: 100,
          pitch: 0,
          midiNote: 36 + idx,
          name: `Slice ${idx + 1}`,
        });
      }
    });

    setSlices(newSlices);
    toast({
      title: "Auto-sliced",
      description: `${newSlices.length} slices created`,
    });
  };

  const sliceAtTransients = () => {
    autoSlice();
  };

  const sliceToGrid = () => {
    const newSlices: Slice[] = [];

    for (let i = 0; i < gridLines.length - 1; i++) {
      newSlices.push({
        id: `s${Date.now()}-${i}`,
        startTime: gridLines[i] * duration,
        endTime: gridLines[i + 1] * duration,
        isSelected: false,
        isLocked: false,
        velocity: 100,
        pitch: 0,
        midiNote: 36 + i,
        name: `Slice ${i + 1}`,
      });
    }

    setSlices(newSlices);
    toast({
      title: "Grid sliced",
      description: `${newSlices.length} slices created`,
    });
  };

  const clearSlices = () => {
    setSlices([]);
    setSelectedSlices([]);
    toast({ title: "Slices cleared" });
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = waveformRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / canvas.width) * duration;

    const clickedSlice = slices.find(
      (s) => clickTime >= s.startTime && clickTime < s.endTime,
    );

    if (clickedSlice) {
      if (e.shiftKey) {
        setSelectedSlices((prev) =>
          prev.includes(clickedSlice.id)
            ? prev.filter((id) => id !== clickedSlice.id)
            : [...prev, clickedSlice.id],
        );
      } else {
        setSelectedSlices([clickedSlice.id]);
      }
    } else {
      if (!e.shiftKey) {
        setSelectedSlices([]);
      }
    }
  };

  const handleWaveformDoubleClick = (
    e: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = waveformRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let clickTime = (x / canvas.width) * duration;

    if (snapToGrid) {
      const gridSize = duration / (gridLines.length - 1);
      clickTime = Math.round(clickTime / gridSize) * gridSize;
    }

    const affectedSlice = slices.find(
      (s) => clickTime > s.startTime && clickTime < s.endTime,
    );

    if (affectedSlice && !affectedSlice.isLocked) {
      const newSlice1: Slice = {
        ...affectedSlice,
        endTime: clickTime,
      };
      const newSlice2: Slice = {
        id: `s${Date.now()}`,
        startTime: clickTime,
        endTime: affectedSlice.endTime,
        isSelected: false,
        isLocked: false,
        velocity: 100,
        pitch: 0,
        midiNote: slices.length + 36,
        name: `Slice ${slices.length + 1}`,
      };

      setSlices((prev) =>
        prev
          .map((s) => (s.id === affectedSlice.id ? newSlice1 : s))
          .concat(newSlice2)
          .sort((a, b) => a.startTime - b.startTime),
      );

      toast({ title: "Slice split" });
    }
  };

  const playSlice = (slice: Slice) => {
    setPlayingSlice(slice.id);
    setTimeout(
      () => {
        setPlayingSlice(null);
      },
      (slice.endTime - slice.startTime) * 1000,
    );
  };

  const deleteSelectedSlices = () => {
    const lockedSelected = slices.filter(
      (s) => selectedSlices.includes(s.id) && s.isLocked,
    );

    if (lockedSelected.length > 0) {
      toast({ title: "Cannot delete locked slices", variant: "destructive" });
      return;
    }

    setSlices((prev) => prev.filter((s) => !selectedSlices.includes(s.id)));
    setSelectedSlices([]);
    toast({ title: "Slices deleted" });
  };

  const lockSelectedSlices = () => {
    setSlices((prev) =>
      prev.map((s) =>
        selectedSlices.includes(s.id) ? { ...s, isLocked: !s.isLocked } : s,
      ),
    );
  };

  const exportSlices = () => {
    onExportSlices?.(slices);
    toast({
      title: "Slices exported",
      description: `${slices.length} slices to sampler`,
    });
  };

  const formatTime = (seconds: number): string => {
    const ms = Math.round((seconds % 1) * 1000);
    const secs = Math.floor(seconds);
    return `${secs}.${ms.toString().padStart(3, "0")}`;
  };

  const selectedSliceData = slices.filter((s) => selectedSlices.includes(s.id));

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-lg">
            <Scissors className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="font-semibold">Beat Slicer</h2>
            <p className="text-xs text-zinc-500">
              {slices.length} slices • {bpm} BPM
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearSlices}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Clear
          </Button>
          <Button
            size="sm"
            className="bg-orange-500 hover:bg-orange-600"
            onClick={exportSlices}
          >
            <Download className="w-4 h-4 mr-1" />
            Export to Sampler
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Waveform Area */}
        <div className="flex-1 flex flex-col p-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-4">
            <Button variant="outline" size="sm" onClick={autoSlice}>
              <Wand2 className="w-4 h-4 mr-1" />
              Auto-Slice
            </Button>
            <Button variant="outline" size="sm" onClick={sliceAtTransients}>
              <Zap className="w-4 h-4 mr-1" />
              Transients
            </Button>
            <Button variant="outline" size="sm" onClick={sliceToGrid}>
              <Grid className="w-4 h-4 mr-1" />
              Grid
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-zinc-400">Grid:</Label>
              <Select value={gridDivision} onValueChange={setGridDivision}>
                <SelectTrigger className="w-20 h-8 bg-zinc-900 border-zinc-700 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRID_DIVISIONS.map((div) => (
                    <SelectItem key={div.value} value={div.value}>
                      {div.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Waveform */}
          <div className="flex-1 bg-zinc-900 rounded-lg overflow-hidden relative">
            <canvas
              ref={waveformRef}
              width={800}
              height={200}
              className="w-full h-full cursor-crosshair"
              onClick={handleWaveformClick}
              onDoubleClick={handleWaveformDoubleClick}
            />

            {/* Time labels */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 pb-1 text-[10px] text-zinc-500 pointer-events-none">
              {gridLines.map((pos, idx) => (
                <span key={idx}>{formatTime(pos * duration)}</span>
              ))}
            </div>
          </div>

          {/* Slice Pads */}
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">
              Slice Pads (MIDI Notes)
            </h4>
            <div className="grid grid-cols-8 gap-2">
              {slices.slice(0, 16).map((slice, idx) => (
                <TooltipProvider key={slice.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          "aspect-square rounded-lg flex flex-col items-center justify-center transition-all",
                          selectedSlices.includes(slice.id)
                            ? "bg-purple-500 text-white"
                            : "bg-zinc-800 hover:bg-zinc-700",
                          playingSlice === slice.id && "ring-2 ring-green-500",
                          slice.isLocked && "opacity-50",
                        )}
                        onClick={() => playSlice(slice)}
                      >
                        <span className="text-xs font-bold">{idx + 1}</span>
                        <span className="text-[10px] text-zinc-400">
                          {
                            [
                              "C",
                              "C#",
                              "D",
                              "D#",
                              "E",
                              "F",
                              "F#",
                              "G",
                              "G#",
                              "A",
                              "A#",
                              "B",
                            ][slice.midiNote % 12]
                          }
                          {Math.floor(slice.midiNote / 12) - 1}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{slice.name}</p>
                      <p className="text-xs text-zinc-400">
                        {formatTime(slice.startTime)} -{" "}
                        {formatTime(slice.endTime)}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
              {slices.length < 16 &&
                Array.from({ length: 16 - slices.length }, (_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="aspect-square rounded-lg bg-zinc-900 border border-zinc-800 border-dashed"
                  />
                ))}
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setCurrentTime(0)}
            >
              <Square className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant={isPlaying ? "default" : "outline"}
              className={cn(isPlaying && "bg-green-500 hover:bg-green-600")}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <span className="font-mono text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-64 border-l border-zinc-800 overflow-auto">
          {/* Detection Settings */}
          <div className="p-4 border-b border-zinc-800">
            <h4 className="font-medium mb-3">Detection Settings</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">
                  Sensitivity: {sensitivity[0]}%
                </Label>
                <Slider
                  value={sensitivity}
                  onValueChange={setSensitivity}
                  min={10}
                  max={100}
                  step={5}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm text-zinc-400">Snap to Grid</Label>
                <Switch checked={snapToGrid} onCheckedChange={setSnapToGrid} />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm text-zinc-400">Show Transients</Label>
                <Switch
                  checked={showTransients}
                  onCheckedChange={setShowTransients}
                />
              </div>
            </div>
          </div>

          {/* Selected Slice Settings */}
          {selectedSliceData.length > 0 && (
            <div className="p-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">
                  {selectedSliceData.length === 1
                    ? selectedSliceData[0].name
                    : `${selectedSliceData.length} Selected`}
                </h4>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={lockSelectedSlices}
                  >
                    {selectedSliceData.every((s) => s.isLocked) ? (
                      <Lock className="w-4 h-4" />
                    ) : (
                      <Unlock className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-400"
                    onClick={deleteSelectedSlices}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {selectedSliceData.length === 1 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-zinc-500">Start</span>
                      <p className="font-mono">
                        {formatTime(selectedSliceData[0].startTime)}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500">End</span>
                      <p className="font-mono">
                        {formatTime(selectedSliceData[0].endTime)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400">
                      Velocity: {selectedSliceData[0].velocity}
                    </Label>
                    <Slider
                      value={[selectedSliceData[0].velocity]}
                      onValueChange={([v]) => {
                        setSlices((prev) =>
                          prev.map((s) =>
                            s.id === selectedSliceData[0].id
                              ? { ...s, velocity: v }
                              : s,
                          ),
                        );
                      }}
                      min={1}
                      max={127}
                      step={1}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400">
                      Pitch: {selectedSliceData[0].pitch > 0 ? "+" : ""}
                      {selectedSliceData[0].pitch} st
                    </Label>
                    <Slider
                      value={[selectedSliceData[0].pitch]}
                      onValueChange={([v]) => {
                        setSlices((prev) =>
                          prev.map((s) =>
                            s.id === selectedSliceData[0].id
                              ? { ...s, pitch: v }
                              : s,
                          ),
                        );
                      }}
                      min={-24}
                      max={24}
                      step={1}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview Volume */}
          <div className="p-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-zinc-500" />
              <Slider
                value={previewVolume}
                onValueChange={setPreviewVolume}
                min={0}
                max={1}
                step={0.01}
                className="flex-1"
              />
            </div>
          </div>

          {/* Slice List */}
          <div className="p-4">
            <h4 className="font-medium mb-3">All Slices</h4>
            <div className="space-y-1 max-h-48 overflow-auto">
              {slices.map((slice, idx) => (
                <div
                  key={slice.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded cursor-pointer transition-colors",
                    selectedSlices.includes(slice.id)
                      ? "bg-purple-500/20"
                      : "hover:bg-zinc-800",
                  )}
                  onClick={() => setSelectedSlices([slice.id])}
                >
                  <span className="w-5 text-xs text-zinc-500">{idx + 1}</span>
                  <span className="flex-1 text-sm truncate">{slice.name}</span>
                  <span className="text-xs text-zinc-500 font-mono">
                    {formatTime(slice.endTime - slice.startTime)}
                  </span>
                  {slice.isLocked && <Lock className="w-3 h-3 text-zinc-500" />}
                </div>
              ))}
              {slices.length === 0 && (
                <p className="text-sm text-zinc-500 text-center py-4">
                  No slices yet. Use Auto-Slice or double-click to create.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowStateBeatSlicer;
