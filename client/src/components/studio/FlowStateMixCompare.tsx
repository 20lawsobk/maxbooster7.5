import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { GitCompare, Play, Pause, Volume2, VolumeX, RotateCcw, Plus, Trash2, Star, StarOff, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MixVersion {
  id: string;
  name: string;
  timestamp: Date;
  lufs: number;
  peak: number;
  duration: number;
  notes: string;
  isFavorite: boolean;
  waveform: number[];
  isReference?: boolean;
}

interface FlowStateMixCompareProps {
  currentMixName?: string;
  onSelectMix?: (mixId: string) => void;
  className?: string;
}

const generateMockWaveform = (): number[] => {
  const waveform: number[] = [];
  for (let i = 0; i < 150; i++) {
    waveform.push(0.2 + Math.random() * 0.6);
  }
  return waveform;
};

export function FlowStateMixCompare({
  currentMixName = "Current Mix",
  onSelectMix,
  className,
}: FlowStateMixCompareProps) {
  const { toast } = useToast();
  const [mixes, setMixes] = useState<MixVersion[]>([
    {
      id: "current",
      name: currentMixName,
      timestamp: new Date(),
      lufs: -14.2,
      peak: -0.8,
      duration: 210,
      notes: "Current working version",
      isFavorite: false,
      waveform: generateMockWaveform(),
    },
    {
      id: "v3",
      name: "Mix v3 - More Bass",
      timestamp: new Date(Date.now() - 3600000),
      lufs: -13.8,
      peak: -0.5,
      duration: 210,
      notes: "Boosted low end, adjusted kick",
      isFavorite: true,
      waveform: generateMockWaveform(),
    },
    {
      id: "v2",
      name: "Mix v2 - Vocal Focus",
      timestamp: new Date(Date.now() - 7200000),
      lufs: -14.5,
      peak: -1.2,
      duration: 210,
      notes: "Vocals forward, less reverb",
      isFavorite: false,
      waveform: generateMockWaveform(),
    },
    {
      id: "v1",
      name: "Mix v1 - Initial",
      timestamp: new Date(Date.now() - 86400000),
      lufs: -15.0,
      peak: -1.8,
      duration: 210,
      notes: "First rough mix",
      isFavorite: false,
      waveform: generateMockWaveform(),
    },
  ]);

  const [mixA, setMixA] = useState<string>("current");
  const [mixB, setMixB] = useState<string>("v3");
  const [activeMix, setActiveMix] = useState<"A" | "B">("A");
  const [isPlaying, setIsPlaying] = useState(false);
  const [loudnessMatch, setLoudnessMatch] = useState(true);
  const [autoSwitch, setAutoSwitch] = useState(false);
  const [autoSwitchInterval, setAutoSwitchInterval] = useState([4]);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState([0.8]);
  const [muted, setMuted] = useState(false);

  const autoSwitchRef = useRef<NodeJS.Timeout | null>(null);
  const playbackRef = useRef<NodeJS.Timeout | null>(null);

  const mixAData = mixes.find((m) => m.id === mixA);
  const mixBData = mixes.find((m) => m.id === mixB);
  const activeMixData = activeMix === "A" ? mixAData : mixBData;

  useEffect(() => {
    if (isPlaying && autoSwitch) {
      autoSwitchRef.current = setInterval(() => {
        setActiveMix((prev) => (prev === "A" ? "B" : "A"));
      }, autoSwitchInterval[0] * 1000);
    }
    return () => {
      if (autoSwitchRef.current) clearInterval(autoSwitchRef.current);
    };
  }, [isPlaying, autoSwitch, autoSwitchInterval]);

  useEffect(() => {
    if (isPlaying) {
      playbackRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const duration = activeMixData?.duration || 210;
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => {
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, [isPlaying, activeMixData?.duration]);

  const toggleFavorite = (mixId: string) => {
    setMixes((prev) =>
      prev.map((m) =>
        m.id === mixId ? { ...m, isFavorite: !m.isFavorite } : m,
      ),
    );
  };

  const deleteMix = (mixId: string) => {
    if (mixId === "current") {
      toast({ title: "Cannot delete current mix", variant: "destructive" });
      return;
    }
    if (mixA === mixId) setMixA("current");
    if (mixB === mixId) setMixB("current");
    setMixes((prev) => prev.filter((m) => m.id !== mixId));
    toast({ title: "Mix version deleted" });
  };

  const saveMixSnapshot = () => {
    const newMix: MixVersion = {
      id: `v${Date.now()}`,
      name: `Snapshot ${new Date().toLocaleTimeString()}`,
      timestamp: new Date(),
      lufs: mixAData.lufs || -14,
      peak: mixAData.peak || -1,
      duration: mixAData.duration || 210,
      notes: "",
      isFavorite: false,
      waveform: generateMockWaveform(),
    };
    setMixes((prev) => [newMix, ...prev]);
    toast({ title: "Mix snapshot saved" });
  };

  const swapMixes = () => {
    const temp = mixA;
    setMixA(mixB);
    setMixB(temp);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getLoudnessDiff = (): number => {
    if (!mixAData || !mixBData) return 0;
    return mixBData.lufs - mixAData.lufs;
  };

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-lg">
            <GitCompare className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-semibold">Mix Compare</h2>
            <p className="text-xs text-zinc-500">
              A/B comparison with loudness matching
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={saveMixSnapshot}>
            <Plus className="w-4 h-4 mr-1" />
            Save Snapshot
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Mix List */}
        <div className="w-72 border-r border-zinc-800 overflow-auto p-4">
          <h3 className="font-medium mb-3">Mix Versions ({mixes.length})</h3>

          <div className="space-y-2">
            {mixes.map((mix) => (
              <Card
                key={mix.id}
                className={cn(
                  "bg-zinc-900 border-zinc-800 p-3 cursor-pointer transition-all",
                  (mixA === mix.id || mixB === mix.id) && "border-cyan-500/50",
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {mix.name}
                      </span>
                      {mix.isFavorite && (
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {mix.timestamp.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {mixA === mix.id && (
                      <Badge className="bg-cyan-500/20 text-cyan-400 text-xs">
                        A
                      </Badge>
                    )}
                    {mixB === mix.id && (
                      <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                        B
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                  <span>{mix.lufs.toFixed(1)} LUFS</span>
                  <span>•</span>
                  <span>{mix.peak.toFixed(1)} dBTP</span>
                </div>

                {mix.notes && (
                  <p className="text-xs text-zinc-400 mb-2 line-clamp-1">
                    {mix.notes}
                  </p>
                )}

                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={mixA === mix.id ? "default" : "outline"}
                    className="h-6 text-xs flex-1"
                    onClick={() => setMixA(mix.id)}
                  >
                    Set A
                  </Button>
                  <Button
                    size="sm"
                    variant={mixB === mix.id ? "default" : "outline"}
                    className="h-6 text-xs flex-1"
                    onClick={() => setMixB(mix.id)}
                  >
                    Set B
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => toggleFavorite(mix.id)}
                  >
                    {mix.isFavorite ? (
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    ) : (
                      <StarOff className="w-3 h-3" />
                    )}
                  </Button>
                  {mix.id !== "current" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-400"
                      onClick={() => deleteMix(mix.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Main Comparison Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* A/B Selector */}
          <div className="p-4 border-b border-zinc-800">
            <div className="flex items-center justify-center gap-4">
              <motion.button
                className={cn(
                  "flex-1 max-w-xs p-4 rounded-lg border-2 transition-all",
                  activeMix === "A"
                    ? "border-cyan-500 bg-cyan-500/10"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-600",
                )}
                onClick={() => setActiveMix("A")}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge
                    className={cn(
                      "text-lg px-3",
                      activeMix === "A" ? "bg-cyan-500" : "bg-zinc-700",
                    )}
                  >
                    A
                  </Badge>
                  {activeMix === "A" && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-3 h-3 bg-green-500 rounded-full animate-pulse"
                    />
                  )}
                </div>
                <p className="font-medium text-left">{mixAData?.name}</p>
                <p className="text-xs text-zinc-500 text-left mt-1">
                  {mixAData?.lufs.toFixed(1)} LUFS
                </p>
              </motion.button>

              <Button
                size="icon"
                variant="outline"
                className="shrink-0"
                onClick={swapMixes}
              >
                <ArrowLeftRight className="w-4 h-4" />
              </Button>

              <motion.button
                className={cn(
                  "flex-1 max-w-xs p-4 rounded-lg border-2 transition-all",
                  activeMix === "B"
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-600",
                )}
                onClick={() => setActiveMix("B")}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge
                    className={cn(
                      "text-lg px-3",
                      activeMix === "B" ? "bg-orange-500" : "bg-zinc-700",
                    )}
                  >
                    B
                  </Badge>
                  {activeMix === "B" && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-3 h-3 bg-green-500 rounded-full animate-pulse"
                    />
                  )}
                </div>
                <p className="font-medium text-left">{mixBData?.name}</p>
                <p className="text-xs text-zinc-500 text-left mt-1">
                  {mixBData?.lufs.toFixed(1)} LUFS
                  {loudnessMatch && getLoudnessDiff() !== 0 && (
                    <span className="text-yellow-400 ml-1">(matched)</span>
                  )}
                </p>
              </motion.button>
            </div>

            {/* Loudness Difference */}
            {mixAData && mixBData && (
              <div className="mt-4 text-center">
                <p className="text-sm text-zinc-400">
                  Loudness difference:
                  <span
                    className={cn(
                      "font-mono ml-2",
                      Math.abs(getLoudnessDiff()) < 1
                        ? "text-green-400"
                        : "text-yellow-400",
                    )}
                  >
                    {getLoudnessDiff() > 0 ? "+" : ""}
                    {getLoudnessDiff().toFixed(1)} dB
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Waveform Display */}
          <div className="flex-1 p-4">
            <div className="h-full flex flex-col">
              {/* Waveform A */}
              <div className="flex-1 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-400">
                    Mix A: {mixAData?.name}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {mixAData?.lufs.toFixed(1)} LUFS
                  </Badge>
                </div>
                <div
                  className={cn(
                    "h-20 bg-zinc-900 rounded-lg flex items-center px-2 relative",
                    activeMix === "A" && "ring-2 ring-cyan-500",
                  )}
                >
                  {mixAData?.waveform.map((v, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 mx-px rounded-sm transition-colors",
                        activeMix === "A" ? "bg-cyan-500" : "bg-cyan-800",
                      )}
                      style={{ height: `${v * 100}%` }}
                    />
                  ))}
                  {/* Playhead */}
                  {isPlaying && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white"
                      style={{
                        left: `${(currentTime / (activeMixData?.duration || 210)) * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Waveform B */}
              <div className="flex-1 mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-400">
                    Mix B: {mixBData?.name}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {mixBData?.lufs.toFixed(1)} LUFS
                  </Badge>
                </div>
                <div
                  className={cn(
                    "h-20 bg-zinc-900 rounded-lg flex items-center px-2 relative",
                    activeMix === "B" && "ring-2 ring-orange-500",
                  )}
                >
                  {mixBData?.waveform.map((v, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 mx-px rounded-sm transition-colors",
                        activeMix === "B" ? "bg-orange-500" : "bg-orange-800",
                      )}
                      style={{ height: `${v * 100}%` }}
                    />
                  ))}
                  {isPlaying && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white"
                      style={{
                        left: `${(currentTime / (activeMixData?.duration || 210)) * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Transport & Settings */}
          <div className="border-t border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-4">
              {/* Transport */}
              <div className="flex items-center gap-3">
                <Button
                  size="icon"
                  variant={isPlaying ? "default" : "outline"}
                  className={cn(
                    "h-10 w-10",
                    isPlaying && "bg-green-500 hover:bg-green-600",
                  )}
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentTime(0);
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <span className="font-mono text-sm">
                  {formatTime(currentTime)} /{" "}
                  {formatTime(activeMixData?.duration || 210)}
                </span>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setMuted(!muted)}
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </Button>
                <Slider
                  value={volume}
                  onValueChange={setVolume}
                  min={0}
                  max={1}
                  step={0.01}
                  className="w-24"
                  disabled={muted}
                />
              </div>
            </div>

            {/* Settings Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={loudnessMatch}
                    onCheckedChange={setLoudnessMatch}
                  />
                  <Label className="text-sm text-zinc-400">
                    Loudness Match
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={autoSwitch}
                    onCheckedChange={setAutoSwitch}
                  />
                  <Label className="text-sm text-zinc-400">Auto Switch</Label>
                </div>
                {autoSwitch && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-zinc-400">Every</Label>
                    <Input
                      type="number"
                      value={autoSwitchInterval[0]}
                      onChange={(e) =>
                        setAutoSwitchInterval([parseInt(e.target.value) || 4])
                      }
                      className="w-14 h-7 bg-zinc-900 border-zinc-700 text-center"
                    />
                    <Label className="text-sm text-zinc-400">sec</Label>
                  </div>
                )}
              </div>

              <div className="text-sm text-zinc-500">
                Press{" "}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-xs">
                  Space
                </kbd>{" "}
                to play,{" "}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-xs">
                  A
                </kbd>{" "}
                /{" "}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-xs">
                  B
                </kbd>{" "}
                to switch
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowStateMixCompare;
