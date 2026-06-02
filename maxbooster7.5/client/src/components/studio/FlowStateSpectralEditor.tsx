import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Waves,
  Paintbrush,
  Eraser,
  Scissors,
  Copy,
  Move,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Play,
  Pause,
  Square,
  Settings,
  Sliders,
  MousePointer2,
  Magnet,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

type SpectralTool = "select" | "brush" | "eraser" | "cut" | "clone" | "move";

interface SpectralSelection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  freqStart: number;
  freqEnd: number;
  timeStart: number;
  timeEnd: number;
}

interface FlowStateSpectralEditorProps {
  audioUrl?: string;
  duration?: number;
  onExport?: (processedAudio: Blob) => void;
  className?: string;
}

const TOOLS: {
  id: SpectralTool;
  icon: Record<string, unknown>;
  label: string;
  shortcut: string;
}[] = [
  { id: "select", icon: MousePointer2, label: "Select", shortcut: "V" },
  { id: "brush", icon: Paintbrush, label: "Paint", shortcut: "B" },
  { id: "eraser", icon: Eraser, label: "Erase", shortcut: "E" },
  { id: "cut", icon: Scissors, label: "Cut", shortcut: "X" },
  { id: "clone", icon: Copy, label: "Clone", shortcut: "C" },
  { id: "move", icon: Move, label: "Move", shortcut: "M" },
];

export function FlowStateSpectralEditor({
  audioUrl,
  duration = 30,
  onExport,
  className,
}: FlowStateSpectralEditorProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool] = useState<SpectralTool>("select");
  const [brushSize, setBrushSize] = useState([20]);
  const [brushIntensity, setBrushIntensity] = useState([80]);
  const [zoom, setZoom] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState<SpectralSelection | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showHarmonics, setShowHarmonics] = useState(true);
  const [colorScheme, setColorScheme] = useState("thermal");
  const [fftSize, setFftSize] = useState("2048");
  const [spectralData, setSpectralData] = useState<number[][]>([]);

  const generateSpectralData = useCallback(() => {
    const width = 400;
    const height = 256;
    const data: number[][] = [];

    for (let x = 0; x < width; x++) {
      const column: number[] = [];
      for (let y = 0; y < height; y++) {
        const freq = (height - y) / height;
        const time = x / width;

        let intensity = 0;
        intensity += Math.exp(-Math.pow(freq - 0.1, 2) * 50) * 0.8;
        intensity +=
          Math.exp(-Math.pow(freq - 0.2, 2) * 80) * 0.6 * Math.sin(time * 20);
        intensity +=
          Math.exp(-Math.pow(freq - 0.35, 2) * 100) * 0.5 * Math.cos(time * 15);
        intensity += Math.exp(-Math.pow(freq - 0.5, 2) * 120) * 0.4;
        intensity += Math.random() * 0.05;

        column.push(Math.min(1, Math.max(0, intensity)));
      }
      data.push(column);
    }
    return data;
  }, []);

  useEffect(() => {
    setSpectralData(generateSpectralData());
  }, [generateSpectralData]);

  const getColor = useCallback(
    (intensity: number): string => {
      if (colorScheme === "thermal") {
        if (intensity < 0.25)
          return `rgb(0, 0, ${Math.floor(intensity * 4 * 255)})`;
        if (intensity < 0.5)
          return `rgb(${Math.floor((intensity - 0.25) * 4 * 255)}, 0, 255)`;
        if (intensity < 0.75)
          return `rgb(255, ${Math.floor((intensity - 0.5) * 4 * 255)}, ${255 - Math.floor((intensity - 0.5) * 4 * 255)})`;
        return `rgb(255, 255, ${Math.floor((intensity - 0.75) * 4 * 255)})`;
      } else if (colorScheme === "grayscale") {
        const v = Math.floor(intensity * 255);
        return `rgb(${v}, ${v}, ${v})`;
      } else {
        if (intensity < 0.5)
          return `rgb(0, ${Math.floor(intensity * 2 * 255)}, ${Math.floor((1 - intensity * 2) * 255)})`;
        return `rgb(${Math.floor((intensity - 0.5) * 2 * 255)}, ${255 - Math.floor((intensity - 0.5) * 2 * 255)}, 0)`;
      }
    },
    [colorScheme],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || spectralData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const dataWidth = spectralData.length;
    const dataHeight = spectralData[0]?.length || 0;
    const scaleX = width / dataWidth;
    const scaleY = height / dataHeight;

    for (let x = 0; x < dataWidth; x++) {
      for (let y = 0; y < dataHeight; y++) {
        const intensity = spectralData[x][y];
        ctx.fillStyle = getColor(intensity);
        ctx.fillRect(
          x * scaleX,
          y * scaleY,
          Math.ceil(scaleX),
          Math.ceil(scaleY),
        );
      }
    }

    if (showHarmonics) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.setLineDash([4, 4]);
      const fundamentalFreqs = [0.1, 0.2, 0.35, 0.5];
      fundamentalFreqs.forEach((freq) => {
        for (let harmonic = 2; harmonic <= 5; harmonic++) {
          const y = height - freq * harmonic * height;
          if (y > 0 && y < height) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
          }
        }
      });
      ctx.setLineDash([]);
    }
  }, [spectralData, colorScheme, showHarmonics, getColor]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (selection) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        selection.x1,
        selection.y1,
        selection.x2 - selection.x1,
        selection.y2 - selection.y1,
      );
      ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
      ctx.fillRect(
        selection.x1,
        selection.y1,
        selection.x2 - selection.x1,
        selection.y2 - selection.y1,
      );
      ctx.setLineDash([]);
    }

    const playheadX = (currentTime / duration) * overlay.width;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, overlay.height);
    ctx.stroke();
  }, [selection, currentTime, duration]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === "select") {
      setIsDrawing(true);
      setSelection({
        x1: x,
        y1: y,
        x2: x,
        y2: y,
        freqStart: 0,
        freqEnd: 0,
        timeStart: 0,
        timeEnd: 0,
      });
    } else if (activeTool === "brush" || activeTool === "eraser") {
      setIsDrawing(true);
      applyBrush(x, y);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = overlayRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === "select" && selection) {
      setSelection((prev) => (prev ? { ...prev, x2: x, y2: y } : null));
    } else if (activeTool === "brush" || activeTool === "eraser") {
      applyBrush(x, y);
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDrawing(false);
    if (selection && activeTool === "select") {
      const canvas = overlayRef.current;
      if (canvas) {
        const freqStart = Math.max(
          0,
          (1 - selection.y2 / canvas.height) * 22050,
        );
        const freqEnd = Math.min(
          22050,
          (1 - selection.y1 / canvas.height) * 22050,
        );
        const timeStart = (selection.x1 / canvas.width) * duration;
        const timeEnd = (selection.x2 / canvas.width) * duration;
        setSelection((prev) =>
          prev ? { ...prev, freqStart, freqEnd, timeStart, timeEnd } : null,
        );
      }
    }
  };

  const applyBrush = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const radius = brushSize[0] / 2;
    const intensity = brushIntensity[0] / 100;

    if (activeTool === "eraser") {
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = getColor(intensity);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const formatFrequency = (hz: number): string => {
    if (hz >= 1000) return `${(hz / 1000).toFixed(1)}kHz`;
    return `${Math.round(hz)}Hz`;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, "0")}`;
  };

  const clearSelection = () => setSelection(null);

  const deleteSelection = () => {
    if (!selection) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#000";
    ctx.fillRect(
      selection.x1,
      selection.y1,
      selection.x2 - selection.x1,
      selection.y2 - selection.y1,
    );
    setSelection(null);
    toast({ title: "Selection erased" });
  };

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-lg">
            <Waves className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="font-semibold">Spectral Editor</h2>
            <p className="text-xs text-zinc-500">
              Visual frequency manipulation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-indigo-400 border-indigo-400/30"
          >
            FFT: {fftSize}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSpectralData(generateSpectralData())}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Toolbar */}
        <div className="w-12 border-r border-zinc-800 flex flex-col items-center py-2 gap-1">
          <TooltipProvider>
            {TOOLS.map((tool) => (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={activeTool === tool.id ? "default" : "ghost"}
                    className={cn(
                      "h-9 w-9",
                      activeTool === tool.id && "bg-indigo-500",
                    )}
                    onClick={() => setActiveTool(tool.id)}
                  >
                    <tool.icon className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>
                    {tool.label} ({tool.shortcut})
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>

          <div className="flex-1" />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Zoom In</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Zoom Out</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Frequency axis */}
          <div className="flex">
            <div className="w-12 flex flex-col justify-between text-[10px] text-zinc-500 py-1 pr-1 text-right">
              <span>20kHz</span>
              <span>10kHz</span>
              <span>5kHz</span>
              <span>1kHz</span>
              <span>100Hz</span>
              <span>20Hz</span>
            </div>
            <div className="flex-1 relative bg-black" style={{ height: 300 }}>
              <canvas
                ref={canvasRef}
                width={800}
                height={300}
                className="absolute inset-0 w-full h-full"
              />
              <canvas
                ref={overlayRef}
                width={800}
                height={300}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              />
            </div>
          </div>

          {/* Time axis */}
          <div className="flex">
            <div className="w-12" />
            <div className="flex-1 flex justify-between text-[10px] text-zinc-500 px-1">
              <span>0:00</span>
              <span>{formatTime(duration * 0.25)}</span>
              <span>{formatTime(duration * 0.5)}</span>
              <span>{formatTime(duration * 0.75)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-2 py-3 border-t border-zinc-800">
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
            <span className="font-mono text-sm ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Selection Info */}
          {selection && (
            <Card className="mx-4 mb-4 bg-zinc-900 border-zinc-800 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-xs text-zinc-500">
                      Frequency Range
                    </span>
                    <p className="text-sm font-mono">
                      {formatFrequency(selection.freqStart)} -{" "}
                      {formatFrequency(selection.freqEnd)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500">Time Range</span>
                    <p className="text-sm font-mono">
                      {formatTime(selection.timeStart)} -{" "}
                      {formatTime(selection.timeEnd)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={clearSelection}>
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={deleteSelection}
                  >
                    <Eraser className="w-3 h-3 mr-1" />
                    Erase
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Panel - Settings */}
        <div className="w-56 border-l border-zinc-800 p-4 space-y-4 overflow-auto">
          <div>
            <h4 className="font-medium mb-3">Tool Settings</h4>

            {(activeTool === "brush" || activeTool === "eraser") && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">
                    Brush Size: {brushSize[0]}px
                  </Label>
                  <Slider
                    value={brushSize}
                    onValueChange={setBrushSize}
                    min={5}
                    max={100}
                    step={1}
                  />
                </div>
                {activeTool === "brush" && (
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400">
                      Intensity: {brushIntensity[0]}%
                    </Label>
                    <Slider
                      value={brushIntensity}
                      onValueChange={setBrushIntensity}
                      min={10}
                      max={100}
                      step={5}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <h4 className="font-medium mb-3">Display</h4>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Color Scheme</Label>
                <Select value={colorScheme} onValueChange={setColorScheme}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thermal">Thermal</SelectItem>
                    <SelectItem value="grayscale">Grayscale</SelectItem>
                    <SelectItem value="spectrum">Spectrum</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">FFT Size</Label>
                <Select value={fftSize} onValueChange={setFftSize}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="512">512</SelectItem>
                    <SelectItem value="1024">1024</SelectItem>
                    <SelectItem value="2048">2048</SelectItem>
                    <SelectItem value="4096">4096</SelectItem>
                    <SelectItem value="8192">8192</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-400">Show Harmonics</Label>
                <Switch
                  checked={showHarmonics}
                  onCheckedChange={setShowHarmonics}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <h4 className="font-medium mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
              >
                <Magnet className="w-4 h-4 mr-2" />
                Snap to Harmonics
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
              >
                <Sliders className="w-4 h-4 mr-2" />
                EQ Match Selection
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowStateSpectralEditor;
