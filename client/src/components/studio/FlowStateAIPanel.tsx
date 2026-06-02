import { logger } from "@/lib/logger";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Sparkles, Wand2, Music, Mic, Sliders, Gauge, Radio, ChevronRight, Lightbulb, ArrowRight, Check, X, RefreshCw, Zap, FileAudio, Loader2, Volume2, Layers, TrendingUp, Target, GitBranch, Hash, BarChart3, Waves } from "lucide-react";
import type { FlowStateMode } from "@/hooks/useFlowStateAdapter";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AISuggestion {
  id: string;
  type:
    | "harmonic"
    | "rhythmic"
    | "arrangement"
    | "mix"
    | "effect"
    | "automation"
    | "chord"
    | "melody"
    | "structure";
  title: string;
  description: string;
  confidence: number;
  action?: string;
  parameters?: Record<string, any>;
  onApply: () => void;
  onPreview?: () => void;
}

interface AnalysisResult {
  key: string;
  scale: string;
  tempo: number;
  timeSignature: string;
  energy: number;
  danceability: number;
  valence: number;
  chords: { chord: string; time: number }[];
  sections: { type: string; start: number; end: number }[];
}

interface FlowStateAIPanelProps {
  suggestions?: AISuggestion[];
  mode?: FlowStateMode;
  projectId?: string | null;
  tracks?: Array<{ id: string; name: string; type: string }>;
  currentTime?: number;
  tempo?: number;
  musicalKey?: string;
  scale?: string;
  onAIMix?: () => void;
  onAIMaster?: () => void;
  onAIGenerate?: () => void;
  onGenerateMelody?: (params?: {
    key?: string;
    scale?: string;
    tempo?: number;
  }) => void;
  onGenerateDrums?: (params?: { genre?: string; tempo?: number }) => void;
  onGeneratePercussion?: () => void;
  onGenerateBass?: (params?: { key?: string; scale?: string }) => void;
  onGenerateChords?: (params?: { progression?: string; key?: string }) => void;
  onAnalyzeAudio?: () => Promise<AnalysisResult | null>;
  onApplySuggestion?: (suggestion: AISuggestion) => void;
  onAutoArrange?: () => void;
  onDetectKey?: () => void;
  onSuggestChords?: () => void;
  onClose?: () => void;
  isAIMixing?: boolean;
  isAIMastering?: boolean;
}

const MODE_TIPS: Record<FlowStateMode, string[]> = {
  create: [
    "Describe your vision and let AI compose",
    "Use the pattern library for inspiration",
    "Try text-to-music for quick ideas",
    "AI detects key and suggests harmonies",
  ],
  record: [
    "Enable input monitoring for live effects",
    "AI will suggest optimal take selection",
    "Use punch-in for precise recording",
    "Real-time pitch and timing correction available",
  ],
  mix: [
    "AI Mix analyzes and balances your tracks",
    "Start with gain staging before processing",
    "Check mix in mono for phase issues",
    "AI suggests EQ curves based on genre",
  ],
  master: [
    "Target -14 LUFS for streaming platforms",
    "AI Master optimizes for your chosen target",
    "Leave headroom for codec conversion",
    "Compare with reference tracks",
  ],
  perform: [
    "Map MIDI controllers to parameters",
    "AI suggests optimal cue points",
    "Enable low-latency mode",
    "Auto-DJ transitions available",
  ],
};

const SUGGESTION_COLORS: Record<string, string> = {
  harmonic: "from-purple-500 to-pink-500",
  rhythmic: "from-orange-500 to-red-500",
  arrangement: "from-blue-500 to-cyan-500",
  mix: "from-green-500 to-emerald-500",
  effect: "from-indigo-500 to-purple-500",
  automation: "from-amber-500 to-yellow-500",
  chord: "from-violet-500 to-purple-500",
  melody: "from-pink-500 to-rose-500",
  structure: "from-teal-500 to-cyan-500",
};

const SUGGESTION_ICONS: Record<string, React.ElementType> = {
  harmonic: Music,
  rhythmic: Layers,
  arrangement: GitBranch,
  mix: Sliders,
  effect: Waves,
  automation: TrendingUp,
  chord: Hash,
  melody: Music,
  structure: BarChart3,
};

const GENRE_PRESETS = [
  { id: "hip_hop", name: "Hip-Hop", icon: "🎤" },
  { id: "trap", name: "Trap", icon: "🔥" },
  { id: "edm", name: "EDM", icon: "🎧" },
  { id: "rock", name: "Rock", icon: "🎸" },
  { id: "pop", name: "Pop", icon: "🎵" },
  { id: "jazz", name: "Jazz", icon: "🎺" },
  { id: "rb", name: "R&B", icon: "🎹" },
  { id: "lofi", name: "Lo-Fi", icon: "☕" },
];

const CHORD_PROGRESSIONS = [
  { id: "pop", name: "I-V-vi-IV", description: "Classic Pop" },
  { id: "jazz", name: "ii-V-I", description: "Jazz Standard" },
  {
    id: "blues",
    name: "I-I-I-I-IV-IV-I-I-V-IV-I-V",
    description: "12-Bar Blues",
  },
  {
    id: "canon",
    name: "I-V-vi-iii-IV-I-IV-V",
    description: "Pachelbel's Canon",
  },
  { id: "sad", name: "vi-IV-I-V", description: "Emotional/Sad" },
  { id: "rock", name: "I-IV-V", description: "Classic Rock" },
];

const MODE_ICONS: Record<FlowStateMode, React.ElementType> = {
  create: Sparkles,
  record: Mic,
  mix: Sliders,
  master: Gauge,
  perform: Radio,
};

export function FlowStateAIPanel({
  suggestions = [],
  mode = "create",
  projectId,
  tracks = [],
  currentTime = 0,
  tempo = 120,
  musicalKey = "C",
  scale = "minor",
  onAIMix,
  onAIMaster,
  onAIGenerate,
  onGenerateMelody,
  onGenerateDrums,
  onGeneratePercussion,
  onGenerateBass,
  onGenerateChords,
  onAnalyzeAudio,
  onApplySuggestion,
  onAutoArrange,
  onDetectKey,
  onSuggestChords,
  onClose,
  isAIMixing = false,
  isAIMastering = false,
}: FlowStateAIPanelProps) {
  const { toast } = useToast();
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(
    null,
  );
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set(),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "suggestions" | "generate" | "analyze" | "process"
  >("suggestions");
  const [selectedGenre, setSelectedGenre] = useState("hip_hop");
  const [selectedProgression, setSelectedProgression] = useState("pop");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [generatedSuggestions, setGeneratedSuggestions] = useState<
    AISuggestion[]
  >([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);

  const allSuggestions = [...suggestions, ...generatedSuggestions];
  const activeSuggestions = allSuggestions.filter(
    (s) => !dismissedSuggestions.has(s.id),
  );
  const tips = MODE_TIPS[mode] || [];
  const ModeIcon = MODE_ICONS[mode];

  const generateContextSuggestions = useCallback(async () => {
    setIsGeneratingSuggestions(true);
    try {
      const newSuggestions: AISuggestion[] = [];

      if (mode === "create") {
        newSuggestions.push({
          id: `suggest-melody-${Date.now()}`,
          type: "melody",
          title: "Generate Melody in " + musicalKey + " " + scale,
          description: `Create an AI-composed melodic line at ${tempo} BPM that fits your current track.`,
          confidence: 0.92,
          onApply: () => onGenerateMelody?.({ key: musicalKey, scale, tempo }),
        });

        if (tracks.length === 0 || !tracks.some((t) => t.type === "drums")) {
          newSuggestions.push({
            id: `suggest-drums-${Date.now()}`,
            type: "rhythmic",
            title: "Add Drum Pattern",
            description: `Generate a ${selectedGenre} drum pattern to establish the groove.`,
            confidence: 0.88,
            onApply: () => onGenerateDrums?.({ genre: selectedGenre, tempo }),
          });
        }

        newSuggestions.push({
          id: `suggest-chords-${Date.now()}`,
          type: "chord",
          title: "Suggest Chord Progression",
          description:
            "AI will analyze and suggest chord progressions that complement your melody.",
          confidence: 0.85,
          onApply: () => onSuggestChords?.(),
        });
      }

      if (mode === "mix") {
        newSuggestions.push({
          id: `suggest-eq-${Date.now()}`,
          type: "mix",
          title: "Auto-EQ Optimization",
          description:
            "Balance frequency spectrum across all tracks for cleaner separation.",
          confidence: 0.9,
          onApply: () => onAIMix?.(),
        });

        newSuggestions.push({
          id: `suggest-levels-${Date.now()}`,
          type: "mix",
          title: "Auto Level Balancing",
          description:
            "Automatically adjust track volumes for optimal balance.",
          confidence: 0.87,
          onApply: () => onAIMix?.(),
        });
      }

      if (mode === "master") {
        newSuggestions.push({
          id: `suggest-loudness-${Date.now()}`,
          type: "mix",
          title: "Optimize for Streaming",
          description:
            "Apply mastering chain targeting -14 LUFS for Spotify/Apple Music.",
          confidence: 0.93,
          onApply: () => onAIMaster?.(),
        });
      }

      if (mode === "record") {
        newSuggestions.push({
          id: `suggest-pitch-${Date.now()}`,
          type: "effect",
          title: "Enable Pitch Correction",
          description:
            "Real-time pitch correction tuned to " + musicalKey + " " + scale,
          confidence: 0.86,
          onApply: () =>
            toast({
              title: "Pitch correction enabled",
              description: `Tuned to ${musicalKey} ${scale}`,
            }),
        });
      }

      setGeneratedSuggestions(newSuggestions);
    } catch (error) {
      logger.error("Failed to generate suggestions:", error);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  }, [
    mode,
    tracks,
    tempo,
    musicalKey,
    scale,
    selectedGenre,
    onGenerateMelody,
    onGenerateDrums,
    onSuggestChords,
    onAIMix,
    onAIMaster,
    toast,
  ]);

  useEffect(() => {
    generateContextSuggestions();
  }, [mode]);

  const handleDismiss = (id: string) => {
    setDismissedSuggestions((prev) => new Set([...prev, id]));
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setDismissedSuggestions(new Set());
    generateContextSuggestions();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const result = await onAnalyzeAudio?.();
      if (result) {
        setAnalysisResult(result);
        toast({
          title: "Analysis Complete",
          description: `Detected: ${result.key} ${result.scale} at ${result.tempo} BPM`,
        });
      }
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: "Could not analyze audio",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-900/80 to-slate-950/90 backdrop-blur-xl">
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">AI Co-Producer</h2>
            <p className="text-xs text-white/50">Your creative partner</p>
          </div>
          <motion.button
            onClick={handleRefresh}
            className="ml-auto p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <RefreshCw
              className={cn("w-4 h-4", isRefreshing && "animate-spin")}
            />
          </motion.button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-white/5">
        {[
          { id: "suggestions", label: "Ideas", icon: Lightbulb },
          { id: "generate", label: "Create", icon: Wand2 },
          { id: "analyze", label: "Analyze", icon: Target },
          { id: "process", label: "Process", icon: Zap },
        ].map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-all border-b-2",
              activeTab === tab.id
                ? "border-purple-500 text-white bg-white/5"
                : "border-transparent text-white/50 hover:text-white",
            )}
            whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </motion.button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === "suggestions" && (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-3 space-y-3"
            >
              <div className="bg-gradient-to-r from-white/5 to-white/[0.02] rounded-xl p-3 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <ModeIcon className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-medium text-white/70 capitalize">
                    {mode} Mode
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {tips.map((tip, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-white/50"
                    >
                      <Lightbulb className="w-3 h-3 mt-0.5 text-amber-400/60 flex-shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-white/40 uppercase tracking-wider px-1">
                  Suggestions ({activeSuggestions.length})
                </div>
                {isGeneratingSuggestions && (
                  <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                )}
              </div>

              {activeSuggestions.map((suggestion) => {
                const colorClass =
                  SUGGESTION_COLORS[suggestion.type] ||
                  SUGGESTION_COLORS.harmonic;
                const IconComponent =
                  SUGGESTION_ICONS[suggestion.type] || Music;
                const isExpanded = expandedSuggestion === suggestion.id;

                return (
                  <motion.div
                    key={suggestion.id}
                    layout
                    className={cn(
                      "rounded-xl border overflow-hidden cursor-pointer",
                      isExpanded
                        ? "bg-white/[0.08] border-white/10"
                        : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]",
                    )}
                    onClick={() =>
                      setExpandedSuggestion(isExpanded ? null : suggestion.id)
                    }
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                            colorClass,
                          )}
                        >
                          <IconComponent className="w-4 h-4 text-white" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-white truncate">
                            {suggestion.title}
                          </h3>
                          <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
                            {suggestion.description}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full bg-gradient-to-r",
                                  colorClass,
                                )}
                                style={{
                                  width: `${suggestion.confidence * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-white/40">
                              {Math.round(suggestion.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-white/5 flex gap-2">
                          {suggestion.onPreview && (
                            <motion.button
                              onClick={(e) => {
                                e.stopPropagation();
                                suggestion.onPreview?.();
                              }}
                              className="flex-1 py-2 rounded-lg text-xs font-medium text-white/70 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-1.5"
                              whileTap={{ scale: 0.98 }}
                            >
                              <Volume2 className="w-3 h-3" />
                              Preview
                            </motion.button>
                          )}
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              suggestion.onApply();
                              onApplySuggestion?.(suggestion);
                              toast({
                                title: "Applied",
                                description: suggestion.title,
                              });
                            }}
                            className={cn(
                              "flex-1 py-2 rounded-lg text-xs font-medium text-white bg-gradient-to-r flex items-center justify-center gap-1.5",
                              colorClass,
                            )}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Check className="w-3 h-3" />
                            Apply
                          </motion.button>
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDismiss(suggestion.id);
                            }}
                            className="px-3 py-2 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/5"
                            whileTap={{ scale: 0.98 }}
                          >
                            <X className="w-3 h-3" />
                          </motion.button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {activeSuggestions.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-5 h-5 text-white/30" />
                  </div>
                  <p className="text-sm text-white/50">
                    No suggestions right now
                  </p>
                  <p className="text-xs text-white/30 mt-1">Keep creating!</p>
                  <motion.button
                    onClick={handleRefresh}
                    className="mt-3 px-4 py-2 rounded-lg bg-purple-600 text-white text-xs"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Generate New Ideas
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "generate" && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-3 space-y-4"
            >
              <div className="text-xs font-medium text-white/40 uppercase tracking-wider">
                AI Music Generation
              </div>

              <div className="grid grid-cols-4 gap-2">
                {GENRE_PRESETS.map((genre) => (
                  <motion.button
                    key={genre.id}
                    onClick={() => setSelectedGenre(genre.id)}
                    className={cn(
                      "p-3 rounded-xl border text-center transition-all",
                      selectedGenre === genre.id
                        ? "bg-purple-600 border-purple-500"
                        : "bg-white/5 hover:bg-white/10 border-white/5",
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="text-xl">{genre.icon}</span>
                    <p className="text-[10px] text-white/70 mt-1">
                      {genre.name}
                    </p>
                  </motion.button>
                ))}
              </div>

              <motion.button
                onClick={onAIGenerate}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Wand2 className="w-4 h-4" />
                Open AI Generator
                <ArrowRight className="w-4 h-4" />
              </motion.button>

              <div className="text-xs font-medium text-white/40 uppercase tracking-wider mt-4">
                Pattern Generators
              </div>

              <div className="space-y-2">
                <motion.button
                  onClick={() =>
                    onGenerateMelody?.({ key: musicalKey, scale, tempo })
                  }
                  className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-3 text-left"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <FileAudio className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Generate Melody</p>
                    <p className="text-[10px] text-white/50">
                      {musicalKey} {scale} at {tempo} BPM
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </motion.button>

                <motion.button
                  onClick={() => onGenerateBass?.({ key: musicalKey, scale })}
                  className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-3 text-left"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Music className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Generate Bass</p>
                    <p className="text-[10px] text-white/50">
                      Low-end foundation patterns
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </motion.button>

                <motion.button
                  onClick={() =>
                    onGenerateDrums?.({ genre: selectedGenre, tempo })
                  }
                  className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-3 text-left"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Generate Drums</p>
                    <p className="text-[10px] text-white/50">
                      {selectedGenre} style at {tempo} BPM
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </motion.button>

                <motion.button
                  onClick={onGeneratePercussion}
                  className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-3 text-left"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Radio className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Generate Percussion</p>
                    <p className="text-[10px] text-white/50">
                      Shakers, congas, tambourines
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </motion.button>
              </div>

              <div className="text-xs font-medium text-white/40 uppercase tracking-wider mt-4">
                Chord Progressions
              </div>

              <div className="space-y-2">
                {CHORD_PROGRESSIONS.slice(0, 4).map((prog) => (
                  <motion.button
                    key={prog.id}
                    onClick={() => {
                      setSelectedProgression(prog.id);
                      onGenerateChords?.({
                        progression: prog.name,
                        key: musicalKey,
                      });
                    }}
                    className={cn(
                      "w-full p-3 rounded-xl border flex items-center gap-3 text-left transition-all",
                      selectedProgression === prog.id
                        ? "bg-violet-600/20 border-violet-500/50"
                        : "bg-white/5 hover:bg-white/10 border-white/5",
                    )}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                      <Hash className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-white font-mono">
                        {prog.name}
                      </p>
                      <p className="text-[10px] text-white/50">
                        {prog.description}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "analyze" && (
            <motion.div
              key="analyze"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-3 space-y-4"
            >
              <div className="text-xs font-medium text-white/40 uppercase tracking-wider">
                Audio Analysis
              </div>

              <motion.button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full p-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white flex items-center justify-center gap-2"
                whileHover={!isAnalyzing ? { scale: 1.02 } : {}}
                whileTap={!isAnalyzing ? { scale: 0.98 } : {}}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Target className="w-5 h-5" />
                    Analyze Audio
                  </>
                )}
              </motion.button>

              {analysisResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase">Key</p>
                      <p className="text-lg font-bold text-white">
                        {analysisResult.key} {analysisResult.scale}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase">
                        Tempo
                      </p>
                      <p className="text-lg font-bold text-white">
                        {analysisResult.tempo} BPM
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2">
                    <p className="text-[10px] text-white/40 uppercase">
                      Energy Analysis
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">Energy</span>
                        <span className="text-xs text-white">
                          {Math.round(analysisResult.energy * 100)}%
                        </span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500"
                          style={{ width: `${analysisResult.energy * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">
                          Danceability
                        </span>
                        <span className="text-xs text-white">
                          {Math.round(analysisResult.danceability * 100)}%
                        </span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-pink-500"
                          style={{
                            width: `${analysisResult.danceability * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">
                          Valence (Mood)
                        </span>
                        <span className="text-xs text-white">
                          {Math.round(analysisResult.valence * 100)}%
                        </span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${analysisResult.valence * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {analysisResult.chords.length > 0 && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase mb-2">
                        Detected Chords
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {analysisResult.chords.slice(0, 8).map((c, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 text-xs bg-purple-500/20 text-purple-300 rounded"
                          >
                            {c.chord}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="text-xs font-medium text-white/40 uppercase tracking-wider mt-4">
                Quick Tools
              </div>

              <div className="grid grid-cols-2 gap-2">
                <motion.button
                  onClick={onDetectKey}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-center"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Music className="w-5 h-5 mx-auto text-purple-400 mb-1" />
                  <p className="text-xs text-white">Detect Key</p>
                </motion.button>
                <motion.button
                  onClick={onAutoArrange}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-center"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <GitBranch className="w-5 h-5 mx-auto text-cyan-400 mb-1" />
                  <p className="text-xs text-white">Auto Arrange</p>
                </motion.button>
              </div>
            </motion.div>
          )}

          {activeTab === "process" && (
            <motion.div
              key="process"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="p-3 space-y-4"
            >
              <div className="text-xs font-medium text-white/40 uppercase tracking-wider">
                AI Processing
              </div>

              <motion.button
                onClick={onAIMix}
                disabled={isAIMixing || !projectId}
                className={cn(
                  "w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all",
                  isAIMixing
                    ? "bg-blue-500/20 border-blue-500/30"
                    : "bg-white/5 hover:bg-white/10 border-white/5",
                )}
                whileHover={!isAIMixing ? { scale: 1.01 } : {}}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    isAIMixing
                      ? "bg-blue-500"
                      : "bg-gradient-to-br from-blue-500 to-cyan-500",
                  )}
                >
                  {isAIMixing ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Sliders className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    {isAIMixing ? "Mixing..." : "AI Mix"}
                  </p>
                  <p className="text-xs text-white/50">
                    Intelligent track balancing & processing
                  </p>
                </div>
              </motion.button>

              <motion.button
                onClick={onAIMaster}
                disabled={isAIMastering || !projectId}
                className={cn(
                  "w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all",
                  isAIMastering
                    ? "bg-amber-500/20 border-amber-500/30"
                    : "bg-white/5 hover:bg-white/10 border-white/5",
                )}
                whileHover={!isAIMastering ? { scale: 1.01 } : {}}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    isAIMastering
                      ? "bg-amber-500"
                      : "bg-gradient-to-br from-amber-500 to-yellow-500",
                  )}
                >
                  {isAIMastering ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Gauge className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    {isAIMastering ? "Mastering..." : "AI Master"}
                  </p>
                  <p className="text-xs text-white/50">
                    Professional mastering for streaming
                  </p>
                </div>
              </motion.button>

              <div className="text-xs font-medium text-white/40 uppercase tracking-wider mt-4">
                LUFS Target
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "-14", label: "Spotify", platform: "YouTube" },
                  { value: "-16", label: "Apple", platform: "Music" },
                ].map((target) => (
                  <motion.button
                    key={target.value}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-center"
                    whileHover={{ scale: 1.02 }}
                  >
                    <p className="text-lg font-bold text-white">
                      {target.value}
                    </p>
                    <p className="text-[10px] text-white/50">{target.label}</p>
                  </motion.button>
                ))}
              </div>

              <div className="text-xs font-medium text-white/40 uppercase tracking-wider mt-4">
                Track Analysis
              </div>

              <motion.button
                onClick={() => onAnalyzeAudio?.()}
                className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-3"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Volume2 className="w-4 h-4 text-white/60" />
                <span className="text-sm text-white flex-1 text-left">
                  Analyze Audio
                </span>
                <span className="text-[10px] text-white/30">
                  BPM, Key, Energy
                </span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
