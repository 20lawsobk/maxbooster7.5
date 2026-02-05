import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music,
  Wand2,
  Play,
  Pause,
  Download,
  Plus,
  Loader2,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Sliders,
  ChevronDown,
  Zap,
  Radio,
  Piano,
  Drum,
  Guitar,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface AIMusicGeneratorProps {
  projectId?: string | null;
  onTrackGenerated?: (trackData: GeneratedTrack) => void;
  onClose?: () => void;
}

interface GeneratedTrack {
  audioFilePath: string;
  parameters: {
    key: string;
    scale: string;
    tempo: number;
    genre: string;
  };
  duration: number;
  generatedNotes?: any[];
  generatedChords?: any[];
}

const GENRES = [
  { id: 'hip_hop', name: 'Hip-Hop', icon: '🎤', color: 'from-purple-500 to-pink-500' },
  { id: 'trap', name: 'Trap', icon: '🔥', color: 'from-red-500 to-orange-500' },
  { id: 'edm', name: 'EDM', icon: '🎧', color: 'from-cyan-500 to-blue-500' },
  { id: 'house', name: 'House', icon: '🏠', color: 'from-green-500 to-emerald-500' },
  { id: 'rock', name: 'Rock', icon: '🎸', color: 'from-orange-500 to-red-500' },
  { id: 'pop', name: 'Pop', icon: '🎵', color: 'from-pink-500 to-rose-500' },
  { id: 'jazz', name: 'Jazz', icon: '🎺', color: 'from-amber-500 to-yellow-500' },
  { id: 'rb', name: 'R&B', icon: '🎹', color: 'from-indigo-500 to-purple-500' },
  { id: 'lofi', name: 'Lo-Fi', icon: '☕', color: 'from-slate-500 to-zinc-500' },
  { id: 'classical', name: 'Classical', icon: '🎻', color: 'from-rose-400 to-pink-400' },
  { id: 'electronic', name: 'Electronic', icon: '⚡', color: 'from-violet-500 to-purple-500' },
  { id: 'ambient', name: 'Ambient', icon: '🌊', color: 'from-teal-500 to-cyan-500' },
];

const INSTRUMENTS = [
  { id: 'synth', name: 'Synthesizer', icon: Piano, category: 'melodic' },
  { id: 'piano', name: 'Piano', icon: Piano, category: 'melodic' },
  { id: 'guitar', name: 'Guitar', icon: Guitar, category: 'melodic' },
  { id: 'bass', name: 'Bass', icon: Music, category: 'melodic' },
  { id: 'strings', name: 'Strings', icon: Music, category: 'melodic' },
  { id: 'drums', name: 'Drums', icon: Drum, category: 'drums' },
  { id: 'percussion', name: 'Percussion', icon: Radio, category: 'percussion' },
  { id: 'pad', name: 'Pad', icon: Music, category: 'melodic' },
];

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Phrygian', 'Lydian'];

export function AIMusicGenerator({ projectId, onTrackGenerated, onClose }: AIMusicGeneratorProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('hip_hop');
  const [selectedInstrument, setSelectedInstrument] = useState('synth');
  const [tempo, setTempo] = useState(120);
  const [key, setKey] = useState('C');
  const [scale, setScale] = useState('Minor');
  const [complexity, setComplexity] = useState(0.5);
  const [bars, setBars] = useState(8);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTrack, setGeneratedTrack] = useState<GeneratedTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const instrument = INSTRUMENTS.find(i => i.id === selectedInstrument);
      
      const response = await apiRequest<GeneratedTrack>('/api/studio/generate/text', {
        method: 'POST',
        body: JSON.stringify({
          text: prompt || `${selectedGenre} ${selectedInstrument}`,
          projectId,
          bars,
          instrumentType: selectedInstrument,
          instrumentCategory: instrument?.category || 'melodic',
          genre: selectedGenre,
          tempo,
          key,
          scale: scale.toLowerCase(),
          complexity,
        }),
      });

      if (response.audioFilePath) {
        setGeneratedTrack(response);
        toast({
          title: 'Music Generated!',
          description: `Created ${bars} bars of ${selectedGenre} ${selectedInstrument} at ${tempo} BPM`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate music',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, selectedGenre, selectedInstrument, projectId, bars, tempo, key, scale, complexity, toast]);

  const handlePlayPause = useCallback(() => {
    if (!generatedTrack) return;
    
    if (audioElement) {
      if (isPlaying) {
        audioElement.pause();
      } else {
        audioElement.play();
      }
      setIsPlaying(!isPlaying);
    } else {
      const audio = new Audio(generatedTrack.audioFilePath);
      audio.loop = true;
      audio.muted = isMuted;
      audio.play();
      setAudioElement(audio);
      setIsPlaying(true);
      
      audio.addEventListener('ended', () => setIsPlaying(false));
    }
  }, [generatedTrack, audioElement, isPlaying, isMuted]);

  const handleMuteToggle = useCallback(() => {
    if (audioElement) {
      audioElement.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  }, [audioElement, isMuted]);

  const handleAddToProject = useCallback(() => {
    if (generatedTrack && onTrackGenerated) {
      onTrackGenerated(generatedTrack);
      toast({
        title: 'Added to Project',
        description: 'The generated track has been added to your project',
      });
    }
  }, [generatedTrack, onTrackGenerated, toast]);

  const selectedGenreData = GENRES.find(g => g.id === selectedGenre);

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-xl overflow-hidden border border-zinc-800">
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">AI Music Generator</h2>
            <p className="text-xs text-zinc-500">Create music with AI</p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-700/30">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-amber-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-amber-400 text-xs">!</span>
            </div>
            <div>
              <p className="text-xs text-amber-300 font-medium">AI Copyright Notice</p>
              <p className="text-xs text-amber-200/70 mt-1">
                AI-generated melodies and patterns are creative starting points. For full copyright protection, 
                add substantial human creative input (arrangement, lyrics, production). Pure AI output alone 
                may not be copyrightable under current law.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Describe your music</label>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Dark trap beat with heavy 808s and atmospheric synths..."
              className="w-full h-24 pl-10 pr-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Genre</label>
          <div className="grid grid-cols-4 gap-2">
            {GENRES.map((genre) => (
              <motion.button
                key={genre.id}
                onClick={() => setSelectedGenre(genre.id)}
                className={cn(
                  'p-3 rounded-xl border text-center transition-all',
                  selectedGenre === genre.id
                    ? `bg-gradient-to-br ${genre.color} border-transparent text-white`
                    : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600 text-zinc-300'
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="text-xl">{genre.icon}</span>
                <p className="text-[10px] mt-1">{genre.name}</p>
              </motion.button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Instrument</label>
          <div className="grid grid-cols-4 gap-2">
            {INSTRUMENTS.map((instrument) => {
              const Icon = instrument.icon;
              return (
                <motion.button
                  key={instrument.id}
                  onClick={() => setSelectedInstrument(instrument.id)}
                  className={cn(
                    'p-3 rounded-xl border text-center transition-all',
                    selectedInstrument === instrument.id
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600 text-zinc-300'
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon className="w-5 h-5 mx-auto" />
                  <p className="text-[10px] mt-1">{instrument.name}</p>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">Tempo: {tempo} BPM</label>
            <Slider
              value={[tempo]}
              onValueChange={([v]) => setTempo(v)}
              min={60}
              max={200}
              step={1}
              className="py-2"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">Bars: {bars}</label>
            <Slider
              value={[bars]}
              onValueChange={([v]) => setBars(v)}
              min={4}
              max={32}
              step={4}
              className="py-2"
            />
          </div>
        </div>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <Sliders className="w-4 h-4" />
          Advanced Settings
          <ChevronDown className={cn('w-4 h-4 transition-transform', showAdvanced && 'rotate-180')} />
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Key</label>
                  <select
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                  >
                    {KEYS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Scale</label>
                  <select
                    value={scale}
                    onChange={(e) => setScale(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                  >
                    {SCALES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Complexity: {Math.round(complexity * 100)}%</label>
                <Slider
                  value={[complexity]}
                  onValueChange={([v]) => setComplexity(v)}
                  min={0}
                  max={1}
                  step={0.1}
                  className="py-2"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {generatedTrack && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-4 rounded-xl bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-500/30"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <motion.div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center',
                      `bg-gradient-to-br ${selectedGenreData?.color || 'from-purple-500 to-pink-500'}`
                    )}
                    animate={isPlaying ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 0.5 }}
                  >
                    <Music className="w-6 h-6 text-white" />
                  </motion.div>
                  <div>
                    <p className="font-medium text-white">Generated Track</p>
                    <p className="text-xs text-zinc-400">
                      {generatedTrack.parameters.key} {generatedTrack.parameters.scale} • {generatedTrack.parameters.tempo} BPM
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleMuteToggle}
                    className="text-zinc-400 hover:text-white"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    onClick={handlePlayPause}
                    className="bg-white text-black hover:bg-zinc-200"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleAddToProject}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Project
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(generatedTrack.audioFilePath, '_blank')}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 border-t border-zinc-800">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={cn(
            'w-full py-6 text-lg font-semibold',
            `bg-gradient-to-r ${selectedGenreData?.color || 'from-purple-600 to-pink-600'}`
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate Music
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
