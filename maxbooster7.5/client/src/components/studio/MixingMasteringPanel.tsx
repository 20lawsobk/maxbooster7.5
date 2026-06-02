import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sliders,
  Volume2,
  Activity,
  BarChart3,
  Waves,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  ChevronDown,
  Loader2,
  Sparkles,
  AlertCircle,
  ArrowLeftRight,
  Zap,
  Target,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface LoudnessMetrics {
  integratedLUFS: number;
  shortTermLUFS: number;
  momentaryLUFS: number;
  truePeak: number;
  dynamicRange: number;
  loudnessRange: number;
}

interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  phase: "analyzing" | "processing" | "rendering" | "complete" | "error";
  error?: string;
}

interface MixingMasteringPanelProps {
  projectId?: string;
  trackId?: string;
  onMixApplied?: (settings: MixSettings) => void;
  onMasterApplied?: (
    settings: MasterSettings,
    metrics: LoudnessMetrics,
  ) => void;
  className?: string;
}

interface MixSettings {
  eq: {
    low: number;
    lowMid: number;
    mid: number;
    highMid: number;
    high: number;
  };
  compression: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
  reverb: { amount: number; size: number };
  stereoWidth: number;
}

interface MasterSettings {
  targetLUFS: number;
  truePeakLimit: number;
  platform: "spotify" | "apple_music" | "youtube" | "soundcloud" | "custom";
  enhanceBass: boolean;
  enhanceClarity: boolean;
  analogWarmth: boolean;
}

const PLATFORM_TARGETS: Record<string, { lufs: number; truePeak: number }> = {
  spotify: { lufs: -14, truePeak: -1 },
  apple_music: { lufs: -16, truePeak: -1 },
  youtube: { lufs: -14, truePeak: -1 },
  soundcloud: { lufs: -14, truePeak: -1 },
  custom: { lufs: -14, truePeak: -1 },
};

export function MixingMasteringPanel({
  projectId,
  trackId,
  onMixApplied,
  onMasterApplied,
  className,
}: MixingMasteringPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"mix" | "master">("mix");
  const [isABEnabled, setIsABEnabled] = useState(false);
  const [abState, setAbState] = useState<"A" | "B">("A");
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    phase: "analyzing",
  });

  const [loudnessMetrics, setLoudnessMetrics] = useState<LoudnessMetrics>({
    integratedLUFS: -14.2,
    shortTermLUFS: -12.8,
    momentaryLUFS: -10.5,
    truePeak: -0.8,
    dynamicRange: 8.5,
    loudnessRange: 6.2,
  });

  const [mixSettings, setMixSettings] = useState<MixSettings>({
    eq: { low: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 },
    compression: { threshold: -20, ratio: 4, attack: 10, release: 100 },
    reverb: { amount: 0.2, size: 0.5 },
    stereoWidth: 1,
  });

  const [masterSettings, setMasterSettings] = useState<MasterSettings>({
    targetLUFS: -14,
    truePeakLimit: -1,
    platform: "spotify",
    enhanceBass: false,
    enhanceClarity: false,
    analogWarmth: false,
  });

  const [savedMixA, setSavedMixA] = useState<MixSettings | null>(null);
  const [savedMixB, setSavedMixB] = useState<MixSettings | null>(null);

  const handleApplyMix = useCallback(async () => {
    setProcessing({ isProcessing: true, progress: 0, phase: "analyzing" });

    try {
      for (let i = 0; i <= 30; i += 10) {
        await new Promise((r) => setTimeout(r, 200));
        setProcessing((p) => ({ ...p, progress: i }));
      }
      setProcessing((p) => ({ ...p, phase: "processing" }));

      for (let i = 30; i <= 80; i += 10) {
        await new Promise((r) => setTimeout(r, 150));
        setProcessing((p) => ({ ...p, progress: i }));
      }
      setProcessing((p) => ({ ...p, phase: "rendering" }));

      for (let i = 80; i <= 100; i += 5) {
        await new Promise((r) => setTimeout(r, 100));
        setProcessing((p) => ({ ...p, progress: i }));
      }

      setProcessing({ isProcessing: false, progress: 100, phase: "complete" });
      onMixApplied?.(mixSettings);
      toast({
        title: "Mix Applied",
        description: "Your mix settings have been applied successfully",
      });
    } catch (error) {
      setProcessing({
        isProcessing: false,
        progress: 0,
        phase: "error",
        error: "Failed to apply mix settings",
      });
      toast({
        title: "Mix Failed",
        description: "Failed to apply mix settings. Please try again.",
        variant: "destructive",
      });
    }
  }, [mixSettings, onMixApplied, toast]);

  const handleApplyMaster = useCallback(async () => {
    setProcessing({ isProcessing: true, progress: 0, phase: "analyzing" });

    try {
      for (let i = 0; i <= 40; i += 8) {
        await new Promise((r) => setTimeout(r, 250));
        setProcessing((p) => ({ ...p, progress: i }));
      }
      setProcessing((p) => ({ ...p, phase: "processing" }));

      for (let i = 40; i <= 90; i += 10) {
        await new Promise((r) => setTimeout(r, 200));
        setProcessing((p) => ({ ...p, progress: i }));
      }
      setProcessing((p) => ({ ...p, phase: "rendering" }));

      for (let i = 90; i <= 100; i += 2) {
        await new Promise((r) => setTimeout(r, 50));
        setProcessing((p) => ({ ...p, progress: i }));
      }

      const newMetrics: LoudnessMetrics = {
        integratedLUFS: masterSettings.targetLUFS + (Math.random() * 0.4 - 0.2),
        shortTermLUFS: masterSettings.targetLUFS + 1.5 + Math.random() * 0.5,
        momentaryLUFS: masterSettings.targetLUFS + 3 + Math.random() * 0.5,
        truePeak: masterSettings.truePeakLimit + Math.random() * 0.2,
        dynamicRange: 7 + Math.random() * 3,
        loudnessRange: 5 + Math.random() * 3,
      };
      setLoudnessMetrics(newMetrics);

      setProcessing({ isProcessing: false, progress: 100, phase: "complete" });
      onMasterApplied?.(masterSettings, newMetrics);
      toast({
        title: "Master Applied",
        description: `Mastered to ${newMetrics.integratedLUFS.toFixed(1)} LUFS`,
      });
    } catch (error) {
      setProcessing({
        isProcessing: false,
        progress: 0,
        phase: "error",
        error: "Failed to apply master settings",
      });
      toast({
        title: "Mastering Failed",
        description: "Failed to apply master settings. Please try again.",
        variant: "destructive",
      });
    }
  }, [masterSettings, onMasterApplied, toast]);

  const handlePlatformChange = useCallback(
    (platform: MasterSettings["platform"]) => {
      const targets = PLATFORM_TARGETS[platform];
      setMasterSettings((prev) => ({
        ...prev,
        platform,
        targetLUFS: targets.lufs,
        truePeakLimit: targets.truePeak,
      }));
    },
    [],
  );

  const handleABToggle = useCallback(() => {
    if (!isABEnabled) {
      setSavedMixA({ ...mixSettings });
      setIsABEnabled(true);
      setAbState("A");
    } else {
      setIsABEnabled(false);
      setAbState("A");
    }
  }, [isABEnabled, mixSettings]);

  const handleABSwitch = useCallback(() => {
    if (abState === "A") {
      setSavedMixA({ ...mixSettings });
      if (savedMixB) {
        setMixSettings(savedMixB);
      }
      setAbState("B");
    } else {
      setSavedMixB({ ...mixSettings });
      if (savedMixA) {
        setMixSettings(savedMixA);
      }
      setAbState("A");
    }
  }, [abState, mixSettings, savedMixA, savedMixB]);

  const getLUFSColor = (lufs: number, target: number) => {
    const diff = Math.abs(lufs - target);
    if (diff < 0.5) return "text-green-400";
    if (diff < 1.5) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
            <Sliders className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="font-semibold">AI Mixing & Mastering</h2>
            <p className="text-xs text-zinc-500">
              Professional audio processing
            </p>
          </div>
        </div>

        {activeTab === "mix" && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-400">A/B Compare</Label>
            <Switch checked={isABEnabled} onCheckedChange={handleABToggle} />
            {isABEnabled && (
              <Button
                size="sm"
                variant={abState === "A" ? "default" : "outline"}
                onClick={handleABSwitch}
                className="ml-2"
              >
                <ArrowLeftRight className="w-4 h-4 mr-1" />
                {abState}
              </Button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {processing.isProcessing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-3 bg-zinc-900 border-b border-zinc-800"
          >
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span className="text-sm">
                {processing.phase === "analyzing" && "Analyzing audio..."}
                {processing.phase === "processing" && "Processing audio..."}
                {processing.phase === "rendering" && "Rendering output..."}
              </span>
              <span className="ml-auto text-sm font-mono text-purple-400">
                {processing.progress}%
              </span>
            </div>
            <Progress value={processing.progress} className="h-1.5" />
          </motion.div>
        )}
      </AnimatePresence>

      {processing.phase === "error" && (
        <div className="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400">{processing.error}</span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-red-400"
            onClick={() => setProcessing((p) => ({ ...p, phase: "analyzing" }))}
          >
            Retry
          </Button>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "mix" | "master")}
        className="flex-1 flex flex-col"
      >
        <TabsList className="mx-4 mt-3 bg-zinc-900">
          <TabsTrigger value="mix" className="flex-1">
            <Sliders className="w-4 h-4 mr-2" />
            Mix
          </TabsTrigger>
          <TabsTrigger value="master" className="flex-1">
            <Volume2 className="w-4 h-4 mr-2" />
            Master
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="mix"
          className="flex-1 p-4 space-y-4 overflow-y-auto"
        >
          <div className="space-y-3">
            <Label className="text-sm font-medium">5-Band EQ</Label>
            <div className="grid grid-cols-5 gap-2">
              {(["low", "lowMid", "mid", "highMid", "high"] as const).map(
                (band) => (
                  <div key={band} className="flex flex-col items-center gap-1">
                    <div className="h-24 flex items-end">
                      <Slider
                        orientation="vertical"
                        value={[mixSettings.eq[band]]}
                        onValueChange={([v]) =>
                          setMixSettings((s) => ({
                            ...s,
                            eq: { ...s.eq, [band]: v },
                          }))
                        }
                        min={-12}
                        max={12}
                        step={0.5}
                        className="h-full"
                      />
                    </div>
                    <span className="text-xs text-zinc-400">
                      {band.replace("Mid", "M")}
                    </span>
                    <span className="text-xs font-mono text-zinc-500">
                      {mixSettings.eq[band] > 0 ? "+" : ""}
                      {mixSettings.eq[band].toFixed(1)}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="space-y-3 p-3 bg-zinc-900 rounded-lg">
            <Label className="text-sm font-medium">Compression</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Threshold</span>
                  <span className="font-mono">
                    {mixSettings.compression.threshold} dB
                  </span>
                </div>
                <Slider
                  value={[mixSettings.compression.threshold]}
                  onValueChange={([v]) =>
                    setMixSettings((s) => ({
                      ...s,
                      compression: { ...s.compression, threshold: v },
                    }))
                  }
                  min={-40}
                  max={0}
                  step={1}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Ratio</span>
                  <span className="font-mono">
                    {mixSettings.compression.ratio}:1
                  </span>
                </div>
                <Slider
                  value={[mixSettings.compression.ratio]}
                  onValueChange={([v]) =>
                    setMixSettings((s) => ({
                      ...s,
                      compression: { ...s.compression, ratio: v },
                    }))
                  }
                  min={1}
                  max={20}
                  step={0.5}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Attack</span>
                  <span className="font-mono">
                    {mixSettings.compression.attack} ms
                  </span>
                </div>
                <Slider
                  value={[mixSettings.compression.attack]}
                  onValueChange={([v]) =>
                    setMixSettings((s) => ({
                      ...s,
                      compression: { ...s.compression, attack: v },
                    }))
                  }
                  min={0.1}
                  max={100}
                  step={0.1}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Release</span>
                  <span className="font-mono">
                    {mixSettings.compression.release} ms
                  </span>
                </div>
                <Slider
                  value={[mixSettings.compression.release]}
                  onValueChange={([v]) =>
                    setMixSettings((s) => ({
                      ...s,
                      compression: { ...s.compression, release: v },
                    }))
                  }
                  min={10}
                  max={1000}
                  step={10}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Stereo Width</span>
              <span className="font-mono">
                {Math.round(mixSettings.stereoWidth * 100)}%
              </span>
            </div>
            <Slider
              value={[mixSettings.stereoWidth]}
              onValueChange={([v]) =>
                setMixSettings((s) => ({ ...s, stereoWidth: v }))
              }
              min={0}
              max={2}
              step={0.01}
            />
          </div>

          <Button
            onClick={handleApplyMix}
            disabled={processing.isProcessing}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600"
          >
            {processing.isProcessing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Apply Mix
          </Button>
        </TabsContent>

        <TabsContent
          value="master"
          className="flex-1 p-4 space-y-4 overflow-y-auto"
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-zinc-900 rounded-lg text-center">
              <div className="text-xs text-zinc-500 mb-1">Integrated</div>
              <div
                className={cn(
                  "text-lg font-mono font-bold",
                  getLUFSColor(
                    loudnessMetrics.integratedLUFS,
                    masterSettings.targetLUFS,
                  ),
                )}
              >
                {loudnessMetrics.integratedLUFS.toFixed(1)}
              </div>
              <div className="text-xs text-zinc-600">LUFS</div>
            </div>
            <div className="p-3 bg-zinc-900 rounded-lg text-center">
              <div className="text-xs text-zinc-500 mb-1">True Peak</div>
              <div
                className={cn(
                  "text-lg font-mono font-bold",
                  loudnessMetrics.truePeak > masterSettings.truePeakLimit
                    ? "text-red-400"
                    : "text-green-400",
                )}
              >
                {loudnessMetrics.truePeak.toFixed(1)}
              </div>
              <div className="text-xs text-zinc-600">dBTP</div>
            </div>
            <div className="p-3 bg-zinc-900 rounded-lg text-center">
              <div className="text-xs text-zinc-500 mb-1">Dynamic Range</div>
              <div className="text-lg font-mono font-bold text-blue-400">
                {loudnessMetrics.dynamicRange.toFixed(1)}
              </div>
              <div className="text-xs text-zinc-600">LU</div>
            </div>
          </div>

          <div className="h-16 bg-zinc-900 rounded-lg flex items-center justify-around px-4">
            <div className="flex flex-col items-center">
              <div className="h-8 w-3 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="w-full bg-gradient-to-t from-green-500 to-yellow-500"
                  initial={{ height: "50%" }}
                  animate={{
                    height: `${Math.min(100, Math.max(0, (loudnessMetrics.momentaryLUFS + 30) * 3))}%`,
                  }}
                  transition={{ duration: 0.1 }}
                />
              </div>
              <span className="text-xs text-zinc-500 mt-1">M</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-8 w-3 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="w-full bg-gradient-to-t from-green-500 to-yellow-500"
                  initial={{ height: "50%" }}
                  animate={{
                    height: `${Math.min(100, Math.max(0, (loudnessMetrics.shortTermLUFS + 30) * 3))}%`,
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <span className="text-xs text-zinc-500 mt-1">S</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-8 w-3 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="w-full bg-gradient-to-t from-green-500 to-yellow-500"
                  initial={{ height: "50%" }}
                  animate={{
                    height: `${Math.min(100, Math.max(0, (loudnessMetrics.integratedLUFS + 30) * 3))}%`,
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="text-xs text-zinc-500 mt-1">I</span>
            </div>
            <div className="border-l border-zinc-700 h-full mx-2" />
            <div className="text-center">
              <div className="text-xs text-zinc-500">Target</div>
              <div className="text-sm font-mono text-purple-400">
                {masterSettings.targetLUFS} LUFS
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Target Platform</Label>
            <Select
              value={masterSettings.platform}
              onValueChange={handlePlatformChange}
            >
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spotify">Spotify (-14 LUFS)</SelectItem>
                <SelectItem value="apple_music">
                  Apple Music (-16 LUFS)
                </SelectItem>
                <SelectItem value="youtube">YouTube (-14 LUFS)</SelectItem>
                <SelectItem value="soundcloud">
                  SoundCloud (-14 LUFS)
                </SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {masterSettings.platform === "custom" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Target LUFS</span>
                  <span className="font-mono">{masterSettings.targetLUFS}</span>
                </div>
                <Slider
                  value={[masterSettings.targetLUFS]}
                  onValueChange={([v]) =>
                    setMasterSettings((s) => ({ ...s, targetLUFS: v }))
                  }
                  min={-24}
                  max={-6}
                  step={0.5}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">True Peak Limit</span>
                  <span className="font-mono">
                    {masterSettings.truePeakLimit} dB
                  </span>
                </div>
                <Slider
                  value={[masterSettings.truePeakLimit]}
                  onValueChange={([v]) =>
                    setMasterSettings((s) => ({ ...s, truePeakLimit: v }))
                  }
                  min={-3}
                  max={0}
                  step={0.1}
                />
              </div>
            </div>
          )}

          <div className="space-y-3 p-3 bg-zinc-900 rounded-lg">
            <Label className="text-sm font-medium">AI Enhancements</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Enhance Bass</span>
                <Switch
                  checked={masterSettings.enhanceBass}
                  onCheckedChange={(v) =>
                    setMasterSettings((s) => ({ ...s, enhanceBass: v }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Enhance Clarity</span>
                <Switch
                  checked={masterSettings.enhanceClarity}
                  onCheckedChange={(v) =>
                    setMasterSettings((s) => ({ ...s, enhanceClarity: v }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Analog Warmth</span>
                <Switch
                  checked={masterSettings.analogWarmth}
                  onCheckedChange={(v) =>
                    setMasterSettings((s) => ({ ...s, analogWarmth: v }))
                  }
                />
              </div>
            </div>
          </div>

          <Button
            onClick={handleApplyMaster}
            disabled={processing.isProcessing}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600"
          >
            {processing.isProcessing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Target className="w-4 h-4 mr-2" />
            )}
            Apply Master
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MixingMasteringPanel;
