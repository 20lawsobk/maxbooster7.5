import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Sparkles,
  Wand2,
  Music,
  Mic,
  Sliders,
  Gauge,
  Radio,
  ChevronRight,
  Lightbulb,
  ArrowRight,
  Check,
  X,
  RefreshCw,
  Zap,
  Upload,
  FileAudio,
  Loader2,
  Volume2,
  Settings2,
  Layers,
} from 'lucide-react';
import type { FlowStateMode } from '@/hooks/useFlowStateAdapter';
import { cn } from '@/lib/utils';

interface AISuggestion {
  id: string;
  type: 'harmonic' | 'rhythmic' | 'arrangement' | 'mix' | 'effect' | 'automation';
  title: string;
  description: string;
  confidence: number;
  onApply: () => void;
  onPreview?: () => void;
}

interface FlowStateAIPanelProps {
  suggestions: AISuggestion[];
  mode: FlowStateMode;
  projectId: string | null;
  onAIMix?: () => void;
  onAIMaster?: () => void;
  onAIGenerate?: () => void;
  onGenerateMelody?: () => void;
  onGenerateDrums?: () => void;
  onGeneratePercussion?: () => void;
  onGenerateBass?: () => void;
  onAnalyzeAudio?: () => void;
  isAIMixing?: boolean;
  isAIMastering?: boolean;
}

const MODE_TIPS: Record<FlowStateMode, string[]> = {
  create: [
    'Describe your vision and let AI compose',
    'Use the pattern library for inspiration',
    'Try text-to-music for quick ideas',
  ],
  record: [
    'Enable input monitoring for live effects',
    'AI will suggest optimal take selection',
    'Use punch-in for precise recording',
  ],
  mix: [
    'AI Mix analyzes and balances your tracks',
    'Start with gain staging before processing',
    'Check mix in mono for phase issues',
  ],
  master: [
    'Target -14 LUFS for streaming platforms',
    'AI Master optimizes for your chosen target',
    'Leave headroom for codec conversion',
  ],
  perform: [
    'Map MIDI controllers to parameters',
    'AI suggests optimal cue points',
    'Enable low-latency mode',
  ],
};

const SUGGESTION_COLORS: Record<AISuggestion['type'], string> = {
  harmonic: 'from-purple-500 to-pink-500',
  rhythmic: 'from-orange-500 to-red-500',
  arrangement: 'from-blue-500 to-cyan-500',
  mix: 'from-green-500 to-emerald-500',
  effect: 'from-indigo-500 to-purple-500',
  automation: 'from-amber-500 to-yellow-500',
};

const GENRE_PRESETS = [
  { id: 'hip_hop', name: 'Hip-Hop', icon: '🎤' },
  { id: 'edm', name: 'EDM', icon: '🎧' },
  { id: 'rock', name: 'Rock', icon: '🎸' },
  { id: 'pop', name: 'Pop', icon: '🎵' },
  { id: 'jazz', name: 'Jazz', icon: '🎺' },
  { id: 'rb', name: 'R&B', icon: '🎹' },
];

const MODE_ICONS: Record<FlowStateMode, React.ElementType> = {
  create: Sparkles,
  record: Mic,
  mix: Sliders,
  master: Gauge,
  perform: Radio,
};

export function FlowStateAIPanel({
  suggestions,
  mode,
  projectId,
  onAIMix,
  onAIMaster,
  onAIGenerate,
  onGenerateMelody,
  onGenerateDrums,
  onGeneratePercussion,
  onGenerateBass,
  onAnalyzeAudio,
  isAIMixing = false,
  isAIMastering = false,
}: FlowStateAIPanelProps) {
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'generate' | 'process'>('suggestions');

  const activeSuggestions = suggestions.filter(s => !dismissedSuggestions.has(s.id));
  const tips = MODE_TIPS[mode] || [];
  const ModeIcon = MODE_ICONS[mode];

  const handleDismiss = (id: string) => {
    setDismissedSuggestions(prev => new Set([...prev, id]));
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
            <p className="text-xs text-white/50">Your creative partner</p>
          </div>
          <motion.button
            onClick={handleRefresh}
            className="ml-auto p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </motion.button>
        </div>
      </div>

      <div className="flex border-b border-white/5">
        {[
          { id: 'suggestions', label: 'Ideas', icon: Lightbulb },
          { id: 'generate', label: 'Create', icon: Wand2 },
          { id: 'process', label: 'Process', icon: Zap },
        ].map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-all border-b-2",
              activeTab === tab.id
                ? "border-purple-500 text-white bg-white/5"
                : "border-transparent text-white/50 hover:text-white"
            )}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </motion.button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'suggestions' && (
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
                  <span className="text-xs font-medium text-white/70 capitalize">{mode} Mode</span>
                </div>
                <ul className="space-y-1.5">
                  {tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-white/50">
                      <Lightbulb className="w-3 h-3 mt-0.5 text-amber-400/60 flex-shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="text-xs font-medium text-white/40 uppercase tracking-wider px-1">
                Suggestions ({activeSuggestions.length})
              </div>

              {activeSuggestions.map((suggestion) => {
                const colorClass = SUGGESTION_COLORS[suggestion.type];
                const isExpanded = expandedSuggestion === suggestion.id;

                return (
                  <motion.div
                    key={suggestion.id}
                    layout
                    className={cn(
                      "rounded-xl border overflow-hidden cursor-pointer",
                      isExpanded
                        ? "bg-white/[0.08] border-white/10"
                        : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]"
                    )}
                    onClick={() => setExpandedSuggestion(isExpanded ? null : suggestion.id)}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                          colorClass
                        )}>
                          <Music className="w-4 h-4 text-white" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-white truncate">
                            {suggestion.title}
                          </h3>
                          <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
                            {suggestion.description}
                          </p>
                          <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full bg-gradient-to-r", colorClass)}
                              style={{ width: `${suggestion.confidence * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-white/5 flex gap-2">
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              suggestion.onApply();
                            }}
                            className={cn(
                              "flex-1 py-2 rounded-lg text-xs font-medium text-white bg-gradient-to-r flex items-center justify-center gap-1.5",
                              colorClass
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
                  <p className="text-sm text-white/50">No suggestions right now</p>
                  <p className="text-xs text-white/30 mt-1">Keep creating!</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'generate' && (
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

              <div className="grid grid-cols-3 gap-2">
                {GENRE_PRESETS.map((genre) => (
                  <motion.button
                    key={genre.id}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-center transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="text-xl">{genre.icon}</span>
                    <p className="text-[10px] text-white/70 mt-1">{genre.name}</p>
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
                  onClick={onGenerateMelody}
                  className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-3 text-left"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <FileAudio className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Generate Melody</p>
                    <p className="text-[10px] text-white/50">AI-composed melodic lines</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </motion.button>

                <motion.button
                  onClick={onGenerateBass}
                  className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-3 text-left"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Music className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Generate Bass</p>
                    <p className="text-[10px] text-white/50">Low-end foundation patterns</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </motion.button>

                <motion.button
                  onClick={onGenerateDrums}
                  className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-3 text-left"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Generate Drums</p>
                    <p className="text-[10px] text-white/50">Pattern-based drum grooves</p>
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
                    <p className="text-[10px] text-white/50">Shakers, congas, tambourines</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </motion.button>
              </div>
            </motion.div>
          )}

          {activeTab === 'process' && (
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
                    : "bg-white/5 hover:bg-white/10 border-white/5"
                )}
                whileHover={!isAIMixing ? { scale: 1.01 } : {}}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  isAIMixing ? "bg-blue-500" : "bg-gradient-to-br from-blue-500 to-cyan-500"
                )}>
                  {isAIMixing ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Sliders className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    {isAIMixing ? 'Mixing...' : 'AI Mix'}
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
                    : "bg-white/5 hover:bg-white/10 border-white/5"
                )}
                whileHover={!isAIMastering ? { scale: 1.01 } : {}}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  isAIMastering ? "bg-amber-500" : "bg-gradient-to-br from-amber-500 to-yellow-500"
                )}>
                  {isAIMastering ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Gauge className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    {isAIMastering ? 'Mastering...' : 'AI Master'}
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
                  { value: '-14', label: 'Spotify', platform: 'YouTube' },
                  { value: '-16', label: 'Apple', platform: 'Music' },
                ].map((target) => (
                  <motion.button
                    key={target.value}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-center"
                    whileHover={{ scale: 1.02 }}
                  >
                    <p className="text-lg font-bold text-white">{target.value}</p>
                    <p className="text-[10px] text-white/50">{target.label}</p>
                  </motion.button>
                ))}
              </div>

              <div className="text-xs font-medium text-white/40 uppercase tracking-wider mt-4">
                Track Analysis
              </div>

              <motion.button
                onClick={onAnalyzeAudio}
                className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-3"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Volume2 className="w-4 h-4 text-white/60" />
                <span className="text-sm text-white flex-1 text-left">Analyze Audio</span>
                <span className="text-[10px] text-white/30">BPM, Key, Energy</span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
