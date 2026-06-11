import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Sparkles, Wand2, TrendingUp, Music, Mic, Layers, ChevronRight, BarChart3, Lightbulb, ArrowRight, Play, Sliders, Check, X, RefreshCw, Gauge, Radio } from "lucide-react";
import type { FlowStateMode } from "@/hooks/useFlowStateAdapter";
import { cn } from "@/lib/utils";

interface AISuggestion {
  id: string;
  type:
    | "harmonic"
    | "rhythmic"
    | "arrangement"
    | "mix"
    | "effect"
    | "automation";
  title: string;
  description: string;
  confidence: number;
  onApply: () => void;
  onPreview?: () => void;
}

interface FlowStateAISidebarProps {
  suggestions: AISuggestion[];
  mode: FlowStateMode;
}

const MODE_TIPS: Record<FlowStateMode, string[]> = {
  create: [
    "Try humming a melody and let AI transcribe it",
    "Describe the emotion you want to convey",
    "Use the chord wheel for harmonic exploration",
  ],
  record: [
    "Enable input monitoring to hear effects live",
    "Set up a click track before recording",
    "Use punch-in for precise section recording",
  ],
  mix: [
    "Start with gain staging before adding EQ",
    "Use reference tracks for A/B comparison",
    "Check your mix in mono for phase issues",
  ],
  master: [
    "Target -14 LUFS for streaming platforms",
    "Leave headroom for codec conversion",
    "Check on multiple playback systems",
  ],
  perform: [
    "Map MIDI controllers to key parameters",
    "Set up cue points for seamless transitions",
    "Enable low-latency mode for real-time response",
  ],
};

const SUGGESTION_ICONS: Record<AISuggestion["type"], React.ElementType> = {
  harmonic: Music,
  rhythmic: Layers,
  arrangement: BarChart3,
  mix: Sliders,
  effect: Wand2,
  automation: TrendingUp,
};

const SUGGESTION_COLORS: Record<AISuggestion["type"], string> = {
  harmonic: "from-purple-500 to-pink-500",
  rhythmic: "from-orange-500 to-red-500",
  arrangement: "from-blue-500 to-cyan-500",
  mix: "from-green-500 to-emerald-500",
  effect: "from-indigo-500 to-purple-500",
  automation: "from-amber-500 to-yellow-500",
};

const MODE_ICONS: Record<FlowStateMode, React.ElementType> = {
  create: Sparkles,
  record: Mic,
  mix: Sliders,
  master: Gauge,
  perform: Radio,
};

export function FlowStateAISidebar({
  suggestions,
  mode,
}: FlowStateAISidebarProps) {
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(
    null,
  );
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set(),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeSuggestions = suggestions.filter(
    (s) => !dismissedSuggestions.has(s.id),
  );
  const tips = MODE_TIPS[mode] || [];
  const ModeIcon = MODE_ICONS[mode];

  const handleDismiss = (id: string) => {
    setDismissedSuggestions((prev) => new Set([...prev, id]));
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setDismissedSuggestions(new Set());
    setTimeout(() => setIsRefreshing(false), 1000);
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
            <p className="text-xs text-white/50">Real-time suggestions</p>
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
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="bg-gradient-to-r from-white/5 to-white/[0.02] rounded-xl p-3 border border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <ModeIcon className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-medium text-white/70 capitalize">
              {mode} Mode Tips
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

        <div className="text-xs font-medium text-white/40 uppercase tracking-wider px-1">
          Suggestions ({activeSuggestions.length})
        </div>

        <AnimatePresence mode="popLayout">
          {activeSuggestions.map((suggestion) => {
            const Icon = SUGGESTION_ICONS[suggestion.type];
            const colorClass = SUGGESTION_COLORS[suggestion.type];
            const isExpanded = expandedSuggestion === suggestion.id;

            return (
              <motion.div
                key={suggestion.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 100 }}
                className={cn(
                  "rounded-xl border overflow-hidden transition-all cursor-pointer",
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
                      <Icon className="w-4 h-4 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium text-white truncate">
                          {suggestion.title}
                        </h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[10px] text-white/40">
                            {Math.round(suggestion.confidence * 100)}%
                          </span>
                          <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            className="text-white/40"
                          >
                            <ChevronRight className="w-3 h-3" />
                          </motion.div>
                        </div>
                      </div>

                      <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
                        {suggestion.description}
                      </p>

                      <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          className={cn("h-full bg-gradient-to-r", colorClass)}
                          initial={{ width: 0 }}
                          animate={{ width: `${suggestion.confidence * 100}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-3 pt-3 border-t border-white/5"
                      >
                        <div className="flex gap-2">
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              suggestion.onApply();
                            }}
                            className={cn(
                              "flex-1 py-2 rounded-lg text-xs font-medium text-white",
                              "bg-gradient-to-r flex items-center justify-center gap-1.5",
                              colorClass,
                            )}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Check className="w-3 h-3" />
                            Apply
                          </motion.button>

                          {suggestion.onPreview && (
                            <motion.button
                              onClick={(e) => {
                                e.stopPropagation();
                                suggestion.onPreview?.();
                              }}
                              className="px-3 py-2 rounded-lg text-xs font-medium text-white/70 bg-white/5 hover:bg-white/10"
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Play className="w-3 h-3" />
                            </motion.button>
                          )}

                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDismiss(suggestion.id);
                            }}
                            className="px-3 py-2 rounded-lg text-xs font-medium text-white/50 hover:text-white hover:bg-white/5"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <X className="w-3 h-3" />
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {activeSuggestions.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-5 h-5 text-white/30" />
            </div>
            <p className="text-sm text-white/50">No suggestions right now</p>
            <p className="text-xs text-white/30 mt-1">
              Keep creating and I'll offer ideas
            </p>
          </motion.div>
        )}
      </div>

      <div className="p-3 border-t border-white/5">
        <motion.button
          className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium flex items-center justify-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Wand2 className="w-4 h-4" />
          Generate with AI
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  );
}
