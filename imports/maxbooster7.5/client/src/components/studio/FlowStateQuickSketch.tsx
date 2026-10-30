import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Mic, Play, Pause, Square, Plus, Trash2, Save, Music, Drum, Piano, Guitar, Volume2, Clock, ArrowRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SketchLayer {
  id: string;
  type: "vocals" | "drums" | "bass" | "keys" | "guitar" | "other";
  name: string;
  color: string;
  audioBlob?: Blob;
  duration: number;
  volume: number;
  muted: boolean;
  waveform: number[];
}

interface QuickSketch {
  id: string;
  name: string;
  createdAt: Date;
  tempo: number;
  key: string;
  layers: SketchLayer[];
  duration: number;
}

interface FlowStateQuickSketchProps {
  onExportToProject?: (sketch: QuickSketch) => void;
  className?: string;
}

const LAYER_TYPES = [
  { type: "vocals", icon: Mic, color: "bg-pink-500", label: "Vocals" },
  { type: "drums", icon: Drum, color: "bg-orange-500", label: "Drums" },
  { type: "bass", icon: Music, color: "bg-purple-500", label: "Bass" },
  { type: "keys", icon: Piano, color: "bg-blue-500", label: "Keys" },
  { type: "guitar", icon: Guitar, color: "bg-amber-500", label: "Guitar" },
  { type: "other", icon: Layers, color: "bg-zinc-500", label: "Other" },
] as const;

const generateMockWaveform = (): number[] => {
  const waveform: number[] = [];
  for (let i = 0; i < 100; i++) {
    waveform.push(0.2 + Math.random() * 0.6);
  }
  return waveform;
};

export function FlowStateQuickSketch({
  onExportToProject,
  className,
}: FlowStateQuickSketchProps) {
  const { toast } = useToast();
  const [sketch, setSketch] = useState<QuickSketch>({
    id: `sketch-${Date.now()}`,
    name: "New Sketch",
    createdAt: new Date(),
    tempo: 120,
    key: "C Major",
    layers: [],
    duration: 0,
  });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingLayer, setRecordingLayer] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [recordDuration, setRecordDuration] = useState(0);
  const [selectedLayerType, setSelectedLayerType] =
    useState<(typeof LAYER_TYPES)[number]["type"]>("vocals");
  const [inputLevel, setInputLevel] = useState(0);
  const [savedSketches, setSavedSketches] = useState<QuickSketch[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>(0);
  const recordStartRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);

  const addLayer = useCallback(() => {
    const layerConfig = LAYER_TYPES.find((l) => l.type === selectedLayerType)!;
    const newLayer: SketchLayer = {
      id: `layer-${Date.now()}`,
      type: selectedLayerType,
      name: `${layerConfig.label} ${sketch.layers.filter((l) => l.type === selectedLayerType).length + 1}`,
      color: layerConfig.color,
      duration: 0,
      volume: 0.8,
      muted: false,
      waveform: [],
    };
    setSketch((prev) => ({ ...prev, layers: [...prev.layers, newLayer] }));
    return newLayer.id;
  }, [selectedLayerType, sketch.layers]);

  const startRecording = async (layerId?: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false },
      });

      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      const targetLayerId = layerId || addLayer();
      setRecordingLayer(targetLayerId);

      mediaRecorderRef.current.start(100);
      recordStartRef.current = Date.now();
      setIsRecording(true);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / (dataArray.length || 1);
        setInputLevel(average / 255);
        setRecordDuration((Date.now() - recordStartRef.current) / 1000);
        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };
      animationFrameRef.current = requestAnimationFrame(updateMeter);

      toast({ title: "Recording started", description: "Capture your idea!" });
    } catch {
      toast({
        title: "Microphone access denied",
        variant: "destructive",
      });
    }
  };

  const stopRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    const duration = recordDuration;
    const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
    const waveform = generateMockWaveform();

    if (recordingLayer) {
      setSketch((prev) => ({
        ...prev,
        layers: prev.layers.map((layer) =>
          layer.id === recordingLayer
            ? { ...layer, audioBlob, duration, waveform }
            : layer,
        ),
        duration: Math.max(prev.duration, duration),
      }));
    }

    setIsRecording(false);
    setRecordingLayer(null);
    setRecordDuration(0);
    setInputLevel(0);

    toast({
      title: "Layer recorded",
      description: `${duration.toFixed(1)}s captured`,
    });
  }, [recordDuration, recordingLayer, toast]);

  const deleteLayer = (layerId: string) => {
    setSketch((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== layerId),
    }));
  };

  const toggleLayerMute = (layerId: string) => {
    setSketch((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === layerId ? { ...l, muted: !l.muted } : l,
      ),
    }));
  };

  const setLayerVolume = (layerId: string, volume: number) => {
    setSketch((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, volume } : l)),
    }));
  };

  const saveSketch = () => {
    setSavedSketches((prev) => [...prev, sketch]);
    toast({ title: "Sketch saved", description: sketch.name });
  };

  const exportToProject = () => {
    onExportToProject?.(sketch);
    toast({
      title: "Exported to project",
      description: `${sketch.layers.length} layers sent to timeline`,
    });
  };

  const newSketch = () => {
    setSketch({
      id: `sketch-${Date.now()}`,
      name: "New Sketch",
      createdAt: new Date(),
      tempo: 120,
      key: "C Major",
      layers: [],
      duration: 0,
    });
    setCurrentTime(0);
    setIsPlaying(false);
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && sketch.duration > 0) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= sketch.duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, sketch.duration]);

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <Input
              value={sketch.name}
              onChange={(e) =>
                setSketch((prev) => ({ ...prev, name: e.target.value }))
              }
              className="bg-transparent border-none p-0 h-auto font-semibold text-lg focus-visible:ring-0"
            />
            <p className="text-xs text-zinc-500">Quick Sketch Mode</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-amber-400 border-amber-400/30"
          >
            <Clock className="w-3 h-3 mr-1" />
            {sketch.duration.toFixed(1)}s
          </Badge>
          <Badge variant="outline" className="text-zinc-400">
            {sketch.tempo} BPM
          </Badge>
          <Badge variant="outline" className="text-zinc-400">
            {sketch.key}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Recording Controls */}
        <div className="w-64 border-r border-zinc-800 p-4 flex flex-col gap-4">
          {/* Layer Type Selector */}
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Layer Type</label>
            <div className="grid grid-cols-3 gap-2">
              {LAYER_TYPES.map((layerType) => {
                const Icon = layerType.icon;
                return (
                  <Button
                    key={layerType.type}
                    variant={
                      selectedLayerType === layerType.type
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    className={cn(
                      "flex flex-col h-14 gap-1",
                      selectedLayerType === layerType.type && layerType.color,
                    )}
                    onClick={() => setSelectedLayerType(layerType.type)}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px]">{layerType.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Record Button */}
          <motion.button
            onClick={isRecording ? stopRecording : () => startRecording()}
            className={cn(
              "relative w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all",
              isRecording
                ? "bg-red-500/20 border-2 border-red-500"
                : "bg-zinc-800 border-2 border-zinc-700 hover:border-amber-500/50",
            )}
            animate={isRecording ? { scale: [1, 1.05, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            {isRecording ? (
              <Square className="w-8 h-8 text-red-400 fill-red-400" />
            ) : (
              <Mic className="w-8 h-8 text-zinc-400" />
            )}
            {isRecording && (
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-red-500/50"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
              />
            )}
          </motion.button>

          {isRecording && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-zinc-500" />
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-green-500 to-amber-500"
                    animate={{ width: `${inputLevel * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-center text-sm text-red-400">
                {recordDuration.toFixed(1)}s
              </p>
            </div>
          )}

          <p className="text-center text-xs text-zinc-500">
            {isRecording ? "Tap to stop" : "Tap to record layer"}
          </p>

          {/* Tempo & Key */}
          <div className="space-y-3 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400">Tempo</label>
              <Input
                type="number"
                value={sketch.tempo}
                onChange={(e) =>
                  setSketch((prev) => ({
                    ...prev,
                    tempo: parseInt(e.target.value) || 120,
                  }))
                }
                className="w-20 h-8 bg-zinc-900 border-zinc-700 text-center"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400">Key</label>
              <Select
                value={sketch.key}
                onValueChange={(v) =>
                  setSketch((prev) => ({ ...prev, key: v }))
                }
              >
                <SelectTrigger className="w-24 h-8 bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["C", "D", "E", "F", "G", "A", "B"].map((note) => (
                    <SelectItem key={`${note}-maj`} value={`${note} Major`}>
                      {note} Major
                    </SelectItem>
                  ))}
                  {["C", "D", "E", "F", "G", "A", "B"].map((note) => (
                    <SelectItem key={`${note}-min`} value={`${note} Minor`}>
                      {note} Minor
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-auto space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={saveSketch}
              disabled={sketch.layers.length === 0}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Sketch
            </Button>
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-black"
              onClick={exportToProject}
              disabled={sketch.layers.length === 0}
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Export to Project
            </Button>
            <Button
              variant="ghost"
              className="w-full text-zinc-400"
              onClick={newSketch}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Sketch
            </Button>
          </div>
        </div>

        {/* Main Area - Layers */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Transport */}
          <div className="border-b border-zinc-800 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant={isPlaying ? "default" : "outline"}
                className={cn(
                  "h-8 w-8",
                  isPlaying && "bg-green-500 hover:bg-green-600",
                )}
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={sketch.duration === 0}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentTime(0);
                }}
              >
                <Square className="w-4 h-4" />
              </Button>
              <span className="font-mono text-sm ml-2">
                {currentTime.toFixed(1)} / {sketch.duration.toFixed(1)}
              </span>
            </div>
            <span className="text-sm text-zinc-500">
              {sketch.layers.length} layers
            </span>
          </div>

          {/* Layers */}
          <div className="flex-1 overflow-auto p-4">
            {sketch.layers.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                <Zap className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Start Your Sketch</p>
                <p className="text-sm mt-1">
                  Select a layer type and hit record
                </p>
                <p className="text-xs mt-4 max-w-xs text-center">
                  Quick Sketch mode lets you rapidly capture ideas without the
                  complexity of a full project
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {sketch.layers.map((layer, idx) => {
                    const layerConfig = LAYER_TYPES.find(
                      (l) => l.type === layer.type,
                    )!;
                    const Icon = layerConfig.icon;
                    const isRecordingThis = recordingLayer === layer.id;

                    return (
                      <motion.div
                        key={layer.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <Card
                          className={cn(
                            "bg-zinc-900 border-zinc-800 p-3",
                            layer.muted && "opacity-50",
                            isRecordingThis && "border-red-500",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {/* Layer Icon */}
                            <div
                              className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center",
                                layer.color,
                              )}
                            >
                              <Icon className="w-5 h-5 text-white" />
                            </div>

                            {/* Layer Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">
                                  {layer.name}
                                </span>
                                {layer.duration > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {layer.duration.toFixed(1)}s
                                  </Badge>
                                )}
                                {isRecordingThis && (
                                  <Badge
                                    variant="destructive"
                                    className="text-xs animate-pulse"
                                  >
                                    Recording
                                  </Badge>
                                )}
                              </div>

                              {/* Waveform */}
                              {layer.waveform.length > 0 && (
                                <div className="h-8 mt-2 bg-zinc-950 rounded flex items-center px-1 relative">
                                  {layer.waveform.map((v, i) => (
                                    <div
                                      key={i}
                                      className={cn(
                                        "flex-1 mx-px rounded-sm",
                                        layer.color,
                                      )}
                                      style={{ height: `${v * 100}%` }}
                                    />
                                  ))}
                                  {/* Playhead */}
                                  {isPlaying && sketch.duration > 0 && (
                                    <div
                                      className="absolute top-0 bottom-0 w-0.5 bg-white"
                                      style={{
                                        left: `${(currentTime / sketch.duration) * 100}%`,
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-2">
                              {/* Volume */}
                              <div className="flex items-center gap-1 w-24">
                                <Volume2 className="w-3 h-3 text-zinc-500" />
                                <Slider
                                  value={[layer.volume]}
                                  onValueChange={([v]) =>
                                    setLayerVolume(layer.id, v)
                                  }
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  className="flex-1"
                                />
                              </div>

                              {/* Mute */}
                              <Button
                                size="icon"
                                variant="ghost"
                                className={cn(
                                  "h-7 w-7",
                                  layer.muted && "text-red-400",
                                )}
                                onClick={() => toggleLayerMute(layer.id)}
                              >
                                {layer.muted ? "M" : "M"}
                              </Button>

                              {/* Re-record */}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => startRecording(layer.id)}
                                disabled={isRecording}
                              >
                                <Mic className="w-3.5 h-3.5" />
                              </Button>

                              {/* Delete */}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-400 hover:text-red-300"
                                onClick={() => deleteLayer(layer.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Saved Sketches */}
          {savedSketches.length > 0 && (
            <div className="border-t border-zinc-800 p-3">
              <h4 className="text-sm font-medium mb-2">Saved Sketches</h4>
              <div className="flex gap-2 overflow-auto">
                {savedSketches.map((s) => (
                  <Badge
                    key={s.id}
                    variant="secondary"
                    className="cursor-pointer hover:bg-zinc-700"
                    onClick={() => setSketch(s)}
                  >
                    {s.name} ({s.layers.length} layers)
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowStateQuickSketch;
