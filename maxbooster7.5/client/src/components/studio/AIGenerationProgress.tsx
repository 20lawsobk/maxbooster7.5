import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wand2,
  Sparkles,
  Music,
  Play,
  Pause,
  Download,
  Plus,
  RefreshCw,
  X,
  Check,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Volume2,
  VolumeX,
  Brain,
  Zap,
  Layers,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface GenerationPhase {
  id: string;
  name: string;
  description: string;
  progress: number;
  status: 'pending' | 'in_progress' | 'complete' | 'error';
}

interface GeneratedAudio {
  id: string;
  url: string;
  waveformData: number[];
  duration: number;
  parameters: {
    genre: string;
    tempo: number;
    key: string;
    mood: string;
  };
}

interface AISuggestion {
  id: string;
  type: 'melody' | 'chord' | 'rhythm' | 'arrangement' | 'mix';
  title: string;
  description: string;
  confidence: number;
  previewUrl?: string;
}

interface StyleTransferResult {
  originalStyle: string;
  targetStyle: string;
  similarity: number;
  audioUrl: string;
}

type GenerationState = 'idle' | 'generating' | 'complete' | 'error' | 'style_transfer';

interface AIGenerationProgressProps {
  isOpen?: boolean;
  state: GenerationState;
  progress?: number;
  phases?: GenerationPhase[];
  generatedAudio?: GeneratedAudio;
  suggestions?: AISuggestion[];
  styleTransfer?: StyleTransferResult;
  error?: string;
  onRetry?: () => void;
  onAddToProject?: (audio: GeneratedAudio) => void;
  onApplySuggestion?: (suggestion: AISuggestion) => void;
  onClose?: () => void;
  className?: string;
}

const DEFAULT_PHASES: GenerationPhase[] = [
  { id: '1', name: 'Analyzing', description: 'Understanding your parameters', progress: 0, status: 'pending' },
  { id: '2', name: 'Composing', description: 'Creating musical elements', progress: 0, status: 'pending' },
  { id: '3', name: 'Arranging', description: 'Structuring the composition', progress: 0, status: 'pending' },
  { id: '4', name: 'Rendering', description: 'Generating audio', progress: 0, status: 'pending' },
];

export function AIGenerationProgress({
  isOpen = true,
  state,
  progress = 0,
  phases = DEFAULT_PHASES,
  generatedAudio,
  suggestions = [],
  styleTransfer,
  error,
  onRetry,
  onAddToProject,
  onApplySuggestion,
  onClose,
  className,
}: AIGenerationProgressProps) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (generatedAudio?.url && !audioRef.current) {
      audioRef.current = new Audio(generatedAudio.url);
      audioRef.current.loop = true;
      
      audioRef.current.addEventListener('timeupdate', () => {
        if (audioRef.current && generatedAudio.duration) {
          setPlaybackProgress((audioRef.current.currentTime / generatedAudio.duration) * 100);
        }
      });
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [generatedAudio]);

  const handlePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleMuteToggle = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleAddToProject = useCallback(() => {
    if (generatedAudio && onAddToProject) {
      onAddToProject(generatedAudio);
      toast({
        title: 'Added to Project',
        description: 'The generated audio has been added to your project',
      });
    }
  }, [generatedAudio, onAddToProject, toast]);

  const getPhaseIcon = (phase: GenerationPhase) => {
    if (phase.status === 'complete') return <Check className="w-4 h-4 text-green-400" />;
    if (phase.status === 'error') return <X className="w-4 h-4 text-red-400" />;
    if (phase.status === 'in_progress') return <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />;
    return <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />;
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        "bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl",
        className
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            state === 'generating' && "bg-gradient-to-br from-purple-500/20 to-pink-500/20",
            state === 'complete' && "bg-gradient-to-br from-green-500/20 to-emerald-500/20",
            state === 'error' && "bg-gradient-to-br from-red-500/20 to-rose-500/20",
            state === 'style_transfer' && "bg-gradient-to-br from-blue-500/20 to-cyan-500/20"
          )}>
            {state === 'generating' && <Wand2 className="w-5 h-5 text-purple-400 animate-pulse" />}
            {state === 'complete' && <Sparkles className="w-5 h-5 text-green-400" />}
            {state === 'error' && <AlertTriangle className="w-5 h-5 text-red-400" />}
            {state === 'style_transfer' && <Layers className="w-5 h-5 text-blue-400" />}
            {state === 'idle' && <Brain className="w-5 h-5 text-zinc-400" />}
          </div>
          <div>
            <h2 className="font-semibold text-white">
              {state === 'generating' && 'Generating Music...'}
              {state === 'complete' && 'Generation Complete'}
              {state === 'error' && 'Generation Failed'}
              {state === 'style_transfer' && 'Style Transfer Applied'}
              {state === 'idle' && 'AI Music Generator'}
            </h2>
            <p className="text-xs text-zinc-500">
              {state === 'generating' && `${progress}% complete`}
              {state === 'complete' && generatedAudio && `${generatedAudio.duration.toFixed(1)}s generated`}
              {state === 'error' && 'An error occurred'}
              {state === 'style_transfer' && styleTransfer && `${styleTransfer.similarity}% similarity`}
            </p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {state === 'generating' && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Overall Progress</span>
                <span className="text-purple-400 font-mono">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="space-y-2">
              {phases.map((phase, i) => (
                <motion.div
                  key={phase.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg transition-colors",
                    phase.status === 'in_progress' && "bg-purple-500/10 border border-purple-500/20",
                    phase.status === 'complete' && "bg-green-500/5",
                    phase.status === 'pending' && "opacity-50"
                  )}
                >
                  {getPhaseIcon(phase)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{phase.name}</span>
                      {phase.status === 'in_progress' && (
                        <span className="text-xs text-purple-400">{phase.progress}%</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">{phase.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="flex items-center justify-center py-4">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-gradient-to-t from-purple-500 to-pink-500 rounded-full"
                    animate={{
                      height: [8, 24, 8],
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.8,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {state === 'complete' && generatedAudio && (
          <>
            <div className="p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg">
              <div className="h-16 flex items-center justify-center gap-px mb-3">
                {generatedAudio.waveformData.slice(0, 60).map((val, i) => {
                  const isPlayed = (i / 60) * 100 < playbackProgress;
                  return (
                    <motion.div
                      key={i}
                      className={cn(
                        "w-1 rounded-full transition-colors",
                        isPlayed ? "bg-green-400" : "bg-green-500/30"
                      )}
                      style={{ height: `${val * 60}px` }}
                      animate={isPlaying ? { scaleY: [1, 1.2, 1] } : {}}
                      transition={{
                        repeat: Infinity,
                        duration: 0.3,
                        delay: i * 0.02,
                      }}
                    />
                  );
                })}
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Button size="icon" onClick={handlePlayPause} className="h-10 w-10 rounded-full">
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={handleMuteToggle} className="h-8 w-8">
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-xs">{generatedAudio.parameters.genre}</Badge>
                  <Badge variant="outline" className="text-xs">{generatedAudio.parameters.tempo} BPM</Badge>
                  <Badge variant="outline" className="text-xs">{generatedAudio.parameters.key}</Badge>
                </div>
              </div>

              <Progress value={playbackProgress} className="h-1" />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAddToProject} className="flex-1 bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 mr-2" />
                Add to Project
              </Button>
              <Button variant="outline" onClick={() => window.open(generatedAudio.url, '_blank')}>
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}

        {state === 'error' && (
          <div className="space-y-4">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-400">Generation Failed</h4>
                  <p className="text-sm text-zinc-400 mt-1">{error || 'An unexpected error occurred'}</p>
                </div>
              </div>
            </div>
            
            {onRetry && (
              <Button onClick={onRetry} className="w-full" variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
          </div>
        )}

        {state === 'style_transfer' && styleTransfer && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-400" />
                  <span className="font-medium">Style Transfer Complete</span>
                </div>
                <Badge className="bg-blue-600">{styleTransfer.similarity}% Match</Badge>
              </div>
              
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-1 text-center p-2 bg-zinc-800 rounded">
                  <span className="text-zinc-500 text-xs">From</span>
                  <p className="font-medium">{styleTransfer.originalStyle}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500" />
                <div className="flex-1 text-center p-2 bg-zinc-800 rounded">
                  <span className="text-zinc-500 text-xs">To</span>
                  <p className="font-medium">{styleTransfer.targetStyle}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (state === 'complete' || state === 'idle') && (
          <div className="border-t border-zinc-800 pt-4 mt-4">
            <button
              onClick={() => setShowSuggestions(!showSuggestions)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium">AI Suggestions</span>
                <Badge variant="secondary" className="text-xs">{suggestions.length}</Badge>
              </div>
              <ChevronRight className={cn(
                "w-4 h-4 text-zinc-500 transition-transform",
                showSuggestions && "rotate-90"
              )} />
            </button>

            <AnimatePresence>
              {showSuggestions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <ScrollArea className="mt-3 h-40">
                    <div className="space-y-2">
                      {suggestions.map(suggestion => (
                        <div
                          key={suggestion.id}
                          className="p-3 bg-zinc-900 rounded-lg border border-zinc-800"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs capitalize">
                                  {suggestion.type}
                                </Badge>
                                <span className="text-sm font-medium">{suggestion.title}</span>
                              </div>
                              <p className="text-xs text-zinc-500 mt-1">{suggestion.description}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onApplySuggestion?.(suggestion)}
                              className="h-7 text-xs"
                            >
                              <Zap className="w-3 h-3 mr-1" />
                              Apply
                            </Button>
                          </div>
                          <div className="mt-2 flex items-center gap-1">
                            <span className="text-xs text-zinc-600">Confidence:</span>
                            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-amber-500"
                                style={{ width: `${suggestion.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-zinc-500">{Math.round(suggestion.confidence * 100)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default AIGenerationProgress;
