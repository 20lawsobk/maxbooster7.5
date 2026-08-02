import { useState, useRef, useEffect } from "react";
import { Timer, Trash2, RotateCcw, Play, Pause, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface WarpMarker {
  id: string;
  originalTime: number;
  warpedTime: number;
  isLocked: boolean;
  isTransient: boolean;
}

interface FlowStateAudioWarpProps {
  clipId?: string;
  audioUrl?: string;
  duration?: number;
  originalTempo?: number;
  onApply?: (markers: WarpMarker[], tempo: number) => void;
  className?: string;
}

const WARP_ALGORITHMS = [
  {
    id: "elastique",
    name: "Elastique Pro",
    description: "Best quality for complex material",
  },
  {
    id: "complex",
    name: "Complex",
    description: "Good for polyphonic content",
  },
  {
    id: "texture",
    name: "Texture",
    description: "Best for atmospheric sounds",
  },
  { id: "tones", name: "Tones", description: "Best for melodic content" },
  { id: "beats", name: "Beats", description: "Best for rhythmic content" },
];

export function FlowStateAudioWarp({
  clipId,
  _audioUrl,
  duration = 16,
  originalTempo = 120,
  onApply,
  className,
}: FlowStateAudioWarpProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const waveformRef = useRef<HTMLCanvasElement>(null);

  const defaultMarkers: WarpMarker[] = [
    {
      id: "m1",
      originalTime: 0,
      warpedTime: 0,
      isLocked: true,
      isTransient: true,
    },
    {
      id: "m2",
      originalTime: 4,
      warpedTime: 4,
      isLocked: false,
      isTransient: true,
    },
    {
      id: "m3",
      originalTime: 8,
      warpedTime: 8,
      isLocked: false,
      isTransient: true,
    },
    {
      id: "m4",
      originalTime: 12,
      warpedTime: 12,
      isLocked: false,
      isTransient: true,
    },
    {
      id: "m5",
      originalTime: 16,
      warpedTime: 16,
      isLocked: true,
      isTransient: true,
    },
  ];

  const [markers, setMarkers] = useState<WarpMarker[]>(defaultMarkers);
  const [targetTempo, setTargetTempo] = useState(originalTempo);
  const [preservePitch, setPreservePitch] = useState(true);
  const [pitchShift, setPitchShift] = useState([0]);
  const [algorithm, setAlgorithm] = useState("elastique");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, _setCurrentTime] = useState(0);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [_isDragging, _setIsDragging] = useState(false);
  const [showTransients, setShowTransients] = useState(true);
  const [quantizeStrength, setQuantizeStrength] = useState([0]);

  const {
    data: apiMarkers,
    
    error: markersError,
  } = useQuery({
    queryKey: ["warp-markers", clipId],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/studio/clips/${clipId}/warp/markers`,
      );
      return response.json();
    },
    enabled: !!clipId,
    staleTime: 30000,
  });

  useEffect(() => {
    if (apiMarkers?.markers?.length > 0) {
      const mappedMarkers = apiMarkers.markers.map(
        (m: Record<string, unknown>) => ({
          id: m.id,
          originalTime: m.sourceTime ?? m.originalTime ?? 0,
          warpedTime: m.targetTime ?? m.warpedTime ?? m.sourceTime ?? 0,
          isLocked: m.isLocked ?? false,
          isTransient: m.isTransient ?? false,
        }),
      );
      setMarkers(mappedMarkers);
    }
  }, [apiMarkers]);

  useEffect(() => {
    if (markersError) {
      toast({ title: "Failed to load warp markers", variant: "destructive" });
    }
  }, [markersError, toast]);

  useMutation({
    mutationFn: async () => {
      if (!clipId) throw new Error("No clip selected");
      const response = await apiRequest(
        "GET",
        `/api/studio/clips/${clipId}/warp/transients`,
      );
      return response.json();
    },
    onSuccess: (data) => {
      if (data.transients) {
        const newMarkers = data.transients.map(
          (t: Record<string, unknown>, i: number) => ({
            id: `t${i}`,
            originalTime: t.time ?? t.sourceTime ?? 0,
            warpedTime: t.time ?? t.sourceTime ?? 0,
            isLocked: false,
            isTransient: true,
          }),
        );
        setMarkers((prev) => [
          ...prev.filter((m) => !m.isTransient),
          ...newMarkers,
        ]);
        toast({ title: `Detected ${data.transients.length} transients` });
      }
    },
    onError: () => {
      toast({ title: "Failed to detect transients", variant: "destructive" });
    },
  });

  useMutation({
    mutationFn: async () => {
      if (!clipId) throw new Error("No clip selected");
      const response = await apiRequest(
        "POST",
        `/api/studio/clips/${clipId}/warp/commit`,
        {
          pitchShift: pitchShift[0],
          preserveFormants: preservePitch,
          algorithm: algorithm === "elastique" ? "rubberband" : "phase_vocoder",
          quality: "high",
        },
      );
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Warp applied successfully" });
      queryClient.invalidateQueries({ queryKey: ["warp-markers", clipId] });
      if (onApply) {
        onApply(markers, targetTempo);
      }
    },
    onError: () => {
      toast({ title: "Failed to apply warp", variant: "destructive" });
    },
  });

  const tempoRatio = targetTempo / originalTempo;
  const warpedDuration = duration / tempoRatio;

  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    for (let i = 0; i <= 16; i++) {
      const x = (i / 16) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.fillStyle = "#6366f1";
    const centerY = height / 2;
    for (let x = 0; x < width; x++) {
      const t = x / width;
      let amplitude = 0;
      amplitude += Math.sin(t * Math.PI * 8) * 0.3;
      amplitude += Math.sin(t * Math.PI * 16) * 0.2;
      amplitude += Math.sin(t * Math.PI * 32) * 0.1;
      amplitude += (Math.random() - 0.5) * 0.1;

      const h = Math.abs(amplitude) * height * 0.8;
      ctx.fillRect(x, centerY - h / 2, 1, h);
    }

    if (showTransients) {
      ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
      ctx.lineWidth = 1;
      markers
        .filter((m) => m.isTransient && !m.isLocked)
        .forEach((marker) => {
          const x = (marker.originalTime / duration) * width;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        });
    }
  }, [markers, duration, showTransients]);

  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = waveformRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / canvas.width) * duration;

    const clickedMarker = markers.find((m) => {
      const markerX = (m.originalTime / duration) * canvas.width;
      return Math.abs(x - markerX) < 10;
    });

    if (clickedMarker) {
      setSelectedMarker(clickedMarker.id);
    } else if (e.detail === 2) {
      const newMarker: WarpMarker = {
        id: `m${Date.now()}`,
        originalTime: clickTime,
        warpedTime: clickTime,
        isLocked: false,
        isTransient: false,
      };
      setMarkers((prev) =>
        [...prev, newMarker].sort((a, b) => a.originalTime - b.originalTime),
      );
      setSelectedMarker(newMarker.id);
      toast({ title: "Warp marker added" });
    }
  };

  ((markerId: string, newTime: number) => {
    setMarkers((prev) =>
      prev.map((m) =>
        m.id === markerId && !m.isLocked
          ? { ...m, warpedTime: Math.max(0, Math.min(duration, newTime)) }
          : m,
      ),
    );
  });

  const deleteMarker = (markerId: string) => {
    const marker = markers.find((m) => m.id === markerId);
    if (marker?.isLocked) {
      toast({ title: "Cannot delete locked marker", variant: "destructive" });
      return;
    }
    setMarkers((prev) => prev.filter((m) => m.id !== markerId));
    setSelectedMarker(null);
    toast({ title: "Marker deleted" });
  };

  const toggleMarkerLock = (markerId: string) => {
    setMarkers((prev) =>
      prev.map((m) =>
        m.id === markerId ? { ...m, isLocked: !m.isLocked } : m,
      ),
    );
  };

  const resetAllMarkers = () => {
    setMarkers((prev) =>
      prev.map((m) => ({ ...m, warpedTime: m.originalTime })),
    );
    setTargetTempo(originalTempo);
    setPitchShift([0]);
    toast({ title: "All warping reset" });
  };

  const quantizeMarkers = () => {
    const beatDuration = 60 / targetTempo;
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.isLocked) return m;
        const nearestBeat =
          Math.round(m.warpedTime / beatDuration) * beatDuration;
        const quantized =
          m.warpedTime +
          (nearestBeat - m.warpedTime) * (quantizeStrength[0] / 100);
        return { ...m, warpedTime: quantized };
      }),
    );
    toast({ title: "Markers quantized to grid" });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, "0")}`;
  };

  const selectedMarkerData = markers.find((m) => m.id === selectedMarker);
  const stretchAmount = selectedMarkerData
    ? (
        (selectedMarkerData.warpedTime - selectedMarkerData.originalTime) *
        1000
      ).toFixed(0)
    : 0;

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg">
            <Timer className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold">Audio Warp & Stretch</h2>
            <p className="text-xs text-zinc-500">
              Time-stretch and pitch-shift audio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-amber-400 border-amber-400/30"
          >
            {markers.length} markers
          </Badge>
          <Button variant="outline" size="sm" onClick={resetAllMarkers}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Warp Area */}
        <div className="flex-1 flex flex-col p-4">
          {/* Tempo Controls */}
          <Card className="bg-zinc-900 border-zinc-800 p-4 mb-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Label className="text-sm text-zinc-400">Original:</Label>
                <Badge variant="secondary" className="font-mono">
                  {originalTempo} BPM
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-sm text-zinc-400">Target:</Label>
                <Input
                  type="number"
                  value={targetTempo}
                  onChange={(e) =>
                    setTargetTempo(parseFloat(e.target.value) || originalTempo)
                  }
                  className="w-20 bg-zinc-800 border-zinc-700 h-8 text-center font-mono"
                />
                <span className="text-sm text-zinc-400">BPM</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTargetTempo(originalTempo / 2)}
                >
                  ÷2
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTargetTempo(originalTempo * 2)}
                >
                  ×2
                </Button>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm text-zinc-400">Stretch:</span>
                <Badge
                  className={cn(
                    "font-mono",
                    tempoRatio > 1
                      ? "bg-green-500/20 text-green-400"
                      : tempoRatio < 1
                        ? "bg-red-500/20 text-red-400"
                        : "bg-zinc-700",
                  )}
                >
                  {((1 / tempoRatio) * 100).toFixed(1)}%
                </Badge>
              </div>
            </div>
          </Card>

          {/* Waveform with Markers */}
          <div className="flex-1 bg-zinc-900 rounded-lg overflow-hidden relative">
            {/* Time ruler */}
            <div className="h-6 bg-zinc-800 flex items-end px-2 text-[10px] text-zinc-500">
              {Array.from({ length: 17 }, (_, i) => (
                <div
                  key={i}
                  className="flex-1 text-center border-l border-zinc-700 first:border-l-0"
                >
                  {i}
                </div>
              ))}
            </div>

            {/* Waveform */}
            <div className="relative" style={{ height: 200 }}>
              <canvas
                ref={waveformRef}
                width={800}
                height={200}
                className="w-full h-full cursor-crosshair"
                onClick={handleWaveformClick}
              />

              {/* Warp Markers */}
              {markers.map((marker) => {
                const left = (marker.originalTime / duration) * 100;
                const offset =
                  ((marker.warpedTime - marker.originalTime) / duration) * 100;

                return (
                  <div
                    key={marker.id}
                    className={cn(
                      "absolute top-0 bottom-0 cursor-ew-resize group",
                      selectedMarker === marker.id && "z-10",
                    )}
                    style={{ left: `${left}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarker(marker.id);
                    }}
                  >
                    {/* Connection line */}
                    {offset !== 0 && (
                      <div
                        className={cn(
                          "absolute top-0 h-full border-t-2 border-dashed",
                          offset > 0 ? "border-green-500" : "border-red-500",
                        )}
                        style={{
                          left: 0,
                          width: `${Math.abs(offset)}%`,
                          transform:
                            offset < 0 ? `translateX(${offset}%)` : undefined,
                        }}
                      />
                    )}

                    {/* Marker handle */}
                    <div
                      className={cn(
                        "absolute top-0 bottom-0 w-0.5 transition-colors",
                        marker.isLocked
                          ? "bg-zinc-500"
                          : selectedMarker === marker.id
                            ? "bg-amber-400"
                            : "bg-amber-500/70",
                        "group-hover:bg-amber-400",
                      )}
                    >
                      {/* Top handle */}
                      <div
                        className={cn(
                          "absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2",
                          marker.isLocked
                            ? "bg-zinc-600 border-zinc-500"
                            : selectedMarker === marker.id
                              ? "bg-amber-400 border-amber-300"
                              : "bg-amber-500 border-amber-400",
                        )}
                      >
                        {marker.isLocked && (
                          <Lock className="w-2 h-2 absolute top-0.5 left-0.5 text-zinc-400" />
                        )}
                      </div>

                      {/* Offset indicator */}
                      {offset !== 0 && (
                        <div
                          className={cn(
                            "absolute top-6 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded text-[10px] font-mono whitespace-nowrap",
                            offset > 0
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400",
                          )}
                        >
                          {offset > 0 ? "+" : ""}
                          {(
                            (marker.warpedTime - marker.originalTime) *
                            1000
                          ).toFixed(0)}
                          ms
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            </div>

            {/* Warped view */}
            <div className="h-8 bg-zinc-950 border-t border-zinc-800 flex items-center px-2">
              <span className="text-xs text-zinc-500 mr-2">Warped:</span>
              <div className="flex-1 h-4 bg-zinc-800 rounded relative overflow-hidden">
                {markers.slice(0, -1).map((marker, idx) => {
                  const nextMarker = markers[idx + 1];
                  const left = (marker.warpedTime / warpedDuration) * 100;
                  const width =
                    ((nextMarker.warpedTime - marker.warpedTime) /
                      warpedDuration) *
                    100;
                  const originalWidth =
                    ((nextMarker.originalTime - marker.originalTime) /
                      duration) *
                    100;
                  const isStretched = width > originalWidth;
                  const isCompressed = width < originalWidth;

                  return (
                    <div
                      key={marker.id}
                      className={cn(
                        "absolute top-0 bottom-0",
                        isStretched
                          ? "bg-green-500/30"
                          : isCompressed
                            ? "bg-red-500/30"
                            : "bg-amber-500/30",
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  );
                })}
              </div>
              <span className="text-xs text-zinc-500 ml-2">
                {formatTime(warpedDuration)}
              </span>
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-4 mt-4">
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
          {/* Selected Marker */}
          {selectedMarkerData && (
            <div className="p-4 border-b border-zinc-800">
              <h4 className="font-medium mb-3">Selected Marker</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-xs text-zinc-500">Original</span>
                    <p className="font-mono">
                      {formatTime(selectedMarkerData.originalTime)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500">Warped</span>
                    <p className="font-mono">
                      {formatTime(selectedMarkerData.warpedTime)}
                    </p>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-zinc-500">Offset</span>
                  <p
                    className={cn(
                      "font-mono",
                      Number(stretchAmount) > 0
                        ? "text-green-400"
                        : Number(stretchAmount) < 0
                          ? "text-red-400"
                          : "",
                    )}
                  >
                    {Number(stretchAmount) > 0 ? "+" : ""}
                    {stretchAmount}ms
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => toggleMarkerLock(selectedMarkerData.id)}
                  >
                    {selectedMarkerData.isLocked ? (
                      <>
                        <Unlock className="w-3 h-3 mr-1" /> Unlock
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3 mr-1" /> Lock
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteMarker(selectedMarkerData.id)}
                    disabled={selectedMarkerData.isLocked}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Pitch Settings */}
          <div className="p-4 border-b border-zinc-800">
            <h4 className="font-medium mb-3">Pitch</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-zinc-400">Preserve Pitch</Label>
                <Switch
                  checked={preservePitch}
                  onCheckedChange={setPreservePitch}
                />
              </div>
              {preservePitch && (
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">
                    Pitch Shift: {pitchShift[0] > 0 ? "+" : ""}
                    {pitchShift[0]} semitones
                  </Label>
                  <Slider
                    value={pitchShift}
                    onValueChange={setPitchShift}
                    min={-12}
                    max={12}
                    step={1}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Algorithm */}
          <div className="p-4 border-b border-zinc-800">
            <h4 className="font-medium mb-3">Algorithm</h4>
            <Select value={algorithm} onValueChange={setAlgorithm}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WARP_ALGORITHMS.map((alg) => (
                  <SelectItem key={alg.id} value={alg.id}>
                    <div>
                      <div>{alg.name}</div>
                      <div className="text-xs text-zinc-500">
                        {alg.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantize */}
          <div className="p-4 border-b border-zinc-800">
            <h4 className="font-medium mb-3">Quantize</h4>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">
                  Strength: {quantizeStrength[0]}%
                </Label>
                <Slider
                  value={quantizeStrength}
                  onValueChange={setQuantizeStrength}
                  min={0}
                  max={100}
                  step={5}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={quantizeMarkers}
                disabled={quantizeStrength[0] === 0}
              >
                Quantize to Grid
              </Button>
            </div>
          </div>

          {/* Options */}
          <div className="p-4">
            <h4 className="font-medium mb-3">Options</h4>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-zinc-400">Show Transients</Label>
              <Switch
                checked={showTransients}
                onCheckedChange={setShowTransients}
              />
            </div>
          </div>

          {/* Apply */}
          <div className="p-4 border-t border-zinc-800">
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600"
              onClick={() => {
                onApply?.(markers, targetTempo);
                toast({ title: "Warp applied" });
              }}
            >
              Apply Warp
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowStateAudioWarp;
