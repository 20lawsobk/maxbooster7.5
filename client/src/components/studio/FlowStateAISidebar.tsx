import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Sparkles,
  Wand2,
  TrendingUp,
  Music,
  Mic,
  Layers,
  Zap,
  ChevronRight,
  Clock,
  BarChart3,
  Target,
  Lightbulb,
  ArrowRight,
  Play,
  Volume2,
  Sliders,
} from 'lucide-react';

interface Track {
  id: string;
  name: string;
  type: 'audio' | 'midi';
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
}

interface FlowStateAISidebarProps {
  selectedTrackId: string | null;
  selectedClipId: string | null;
  tracks: Track[];
  currentTime: number;
  bpm: number;
}

interface AISuggestion {
  id: string;
  type: 'action' | 'insight' | 'prediction';
  title: string;
  description: string;
  icon: React.ElementType;
  priority: 'high' | 'medium' | 'low';
  action?: string;
}

export function FlowStateAISidebar({
  selectedTrackId,
  selectedClipId,
  tracks,
  currentTime,
  bpm,
}: FlowStateAISidebarProps) {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    setIsThinking(true);
    const timer = setTimeout(() => {
      const newSuggestions = generateSuggestions();
      setSuggestions(newSuggestions);
      setIsThinking(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedTrackId, selectedClipId, tracks]);

  const generateSuggestions = (): AISuggestion[] => {
    const baseSuggestions: AISuggestion[] = [];

    if (selectedTrackId) {
      const track = tracks.find(t => t.id === selectedTrackId);
      if (track) {
        if (track.type === 'audio') {
          baseSuggestions.push({
            id: 'stem-separation',
            type: 'action',
            title: 'Separate Stems',
            description: `Extract drums, bass, vocals, and melody from "${track.name}" using AI`,
            icon: Layers,
            priority: 'high',
            action: 'separate_stems',
          });
        }
        
        baseSuggestions.push({
          id: 'ai-mix',
          type: 'action',
          title: 'AI Mix Suggestion',
          description: `Optimize EQ and compression for "${track.name}" based on genre analysis`,
          icon: Sliders,
          priority: 'medium',
          action: 'ai_mix',
        });
      }
    }

    baseSuggestions.push(
      {
        id: 'arrangement',
        type: 'insight',
        title: 'Arrangement Tip',
        description: 'Consider adding a breakdown at bar 17 to build tension before the drop',
        icon: TrendingUp,
        priority: 'medium',
      },
      {
        id: 'generate-melody',
        type: 'action',
        title: 'Generate Melody',
        description: `Create a catchy lead melody in the key of your track at ${bpm} BPM`,
        icon: Wand2,
        priority: 'high',
        action: 'generate_melody',
      },
      {
        id: 'master-preview',
        type: 'action',
        title: 'Preview Master',
        description: 'Hear how your track will sound with AI mastering applied',
        icon: Volume2,
        priority: 'low',
        action: 'preview_master',
      },
      {
        id: 'viral-potential',
        type: 'prediction',
        title: 'Viral Potential: 78%',
        description: 'Your hook is strong. Consider shortening the intro for social media clips.',
        icon: Target,
        priority: 'medium',
      }
    );

    return baseSuggestions.slice(0, 5);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30';
      case 'medium': return 'text-purple-400 bg-purple-400/10 border-purple-400/30';
      case 'low': return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'action': return 'Quick Action';
      case 'insight': return 'AI Insight';
      case 'prediction': return 'Prediction';
      default: return 'Suggestion';
    }
  };

  return (
    <div className="flow-ai-sidebar h-full flex flex-col">
      {/* Header */}
      <div className="flow-ai-header">
        <div className="flow-ai-avatar">
          <Brain className="w-5 h-5" />
        </div>
        <div>
          <div className="flow-ai-title">FlowState AI</div>
          <div className="flow-ai-status">
            {isThinking ? 'Analyzing...' : 'Ready to assist'}
          </div>
        </div>
      </div>

      {/* Context Summary */}
      <div className="p-4 border-b border-white/5">
        <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Current Context</div>
        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-medium">
            {bpm} BPM
          </span>
          <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">
            {tracks.length} Tracks
          </span>
          {selectedTrackId && (
            <span className="px-2 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-medium">
              {tracks.find(t => t.id === selectedTrackId)?.name}
            </span>
          )}
        </div>
      </div>

      {/* Suggestions */}
      <div className="flow-ai-suggestions flex-1 overflow-y-auto">
        <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">
          AI Suggestions
        </div>
        
        <AnimatePresence mode="popLayout">
          {isThinking ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-8"
            >
              <div className="flex items-center gap-2 text-slate-400">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </motion.div>
          ) : (
            suggestions.map((suggestion, index) => (
              <motion.div
                key={suggestion.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.1 }}
                className="flow-ai-suggestion group"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${getPriorityColor(suggestion.priority)}`}>
                    <suggestion.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
                      {getTypeLabel(suggestion.type)}
                    </div>
                    <div className="flow-ai-suggestion-title">{suggestion.title}</div>
                    <div className="flow-ai-suggestion-desc">{suggestion.description}</div>
                    
                    {suggestion.action && (
                      <div className="flow-ai-suggestion-action group-hover:translate-x-1 transition-transform">
                        <Play className="w-3 h-3" />
                        <span>Apply Now</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Quick Actions Footer */}
      <div className="p-4 border-t border-white/5">
        <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">Quick AI Actions</div>
        <div className="grid grid-cols-2 gap-2">
          <button className="flow-btn text-xs justify-center">
            <Wand2 className="w-3 h-3" />
            Generate
          </button>
          <button className="flow-btn text-xs justify-center">
            <Sparkles className="w-3 h-3" />
            Enhance
          </button>
          <button className="flow-btn text-xs justify-center">
            <Layers className="w-3 h-3" />
            Stems
          </button>
          <button className="flow-btn text-xs justify-center">
            <Volume2 className="w-3 h-3" />
            Master
          </button>
        </div>
      </div>
    </div>
  );
}
