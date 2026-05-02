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
  MessageSquare,
  LayoutGrid,
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
  initialTempo?: number;
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
  generatedNotes?: unknown[];
  generatedChords?: unknown[];
  name?: string;
  type?: 'audio' | 'midi' | 'instrument';
  color?: string;
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

const INSTRUMENT_CATEGORIES = [
  { id: 'keys', name: 'Keys' },
  { id: 'synths', name: 'Synths' },
  { id: 'guitars', name: 'Guitars' },
  { id: 'bass', name: 'Bass' },
  { id: 'strings', name: 'Strings' },
  { id: 'brass', name: 'Brass' },
  { id: 'woodwinds', name: 'Woodwinds' },
  { id: 'vocals', name: 'Vocals' },
  { id: 'mallets', name: 'Mallets' },
  { id: 'ethnic', name: 'Ethnic' },
  { id: 'drums', name: 'Drum Kits' },
  { id: 'percussion', name: 'Percussion' },
];

const INSTRUMENTS: Record<string, Array<{ id: string; name: string; category: 'melodic' | 'drums' | 'percussion' }>> = {
  keys: [
    { id: 'piano', name: 'Piano', category: 'melodic' },
    { id: 'electric_piano', name: 'Electric Piano', category: 'melodic' },
    { id: 'organ', name: 'Organ', category: 'melodic' },
    { id: 'harpsichord', name: 'Harpsichord', category: 'melodic' },
    { id: 'celesta', name: 'Celesta', category: 'melodic' },
    { id: 'music_box', name: 'Music Box', category: 'melodic' },
  ],
  synths: [
    { id: 'synth_lead', name: 'Synth Lead', category: 'melodic' },
    { id: 'synth_pad', name: 'Synth Pad', category: 'melodic' },
    { id: 'synth_pluck', name: 'Synth Pluck', category: 'melodic' },
    { id: 'synth_brass', name: 'Synth Brass', category: 'melodic' },
  ],
  guitars: [
    { id: 'guitar_acoustic', name: 'Acoustic Guitar', category: 'melodic' },
    { id: 'guitar_electric', name: 'Electric Guitar', category: 'melodic' },
    { id: 'guitar_nylon', name: 'Nylon Guitar', category: 'melodic' },
    { id: 'guitar_jazz', name: 'Jazz Guitar', category: 'melodic' },
  ],
  bass: [
    { id: 'bass_electric', name: 'Electric Bass', category: 'melodic' },
    { id: 'bass_acoustic', name: 'Acoustic Bass', category: 'melodic' },
    { id: 'bass_synth', name: 'Synth Bass', category: 'melodic' },
    { id: 'bass_808', name: '808 Bass', category: 'melodic' },
    { id: 'bass_sub', name: 'Sub Bass', category: 'melodic' },
  ],
  strings: [
    { id: 'strings_violin', name: 'Violin', category: 'melodic' },
    { id: 'strings_viola', name: 'Viola', category: 'melodic' },
    { id: 'strings_cello', name: 'Cello', category: 'melodic' },
    { id: 'strings_ensemble', name: 'String Ensemble', category: 'melodic' },
  ],
  brass: [
    { id: 'brass_trumpet', name: 'Trumpet', category: 'melodic' },
    { id: 'brass_trombone', name: 'Trombone', category: 'melodic' },
    { id: 'brass_french_horn', name: 'French Horn', category: 'melodic' },
    { id: 'brass_tuba', name: 'Tuba', category: 'melodic' },
  ],
  woodwinds: [
    { id: 'woodwind_flute', name: 'Flute', category: 'melodic' },
    { id: 'woodwind_clarinet', name: 'Clarinet', category: 'melodic' },
    { id: 'woodwind_oboe', name: 'Oboe', category: 'melodic' },
    { id: 'woodwind_saxophone', name: 'Saxophone', category: 'melodic' },
  ],
  vocals: [
    { id: 'vocal_lead', name: 'Vocal Lead', category: 'melodic' },
    { id: 'vocal_harmony', name: 'Vocal Harmony', category: 'melodic' },
    { id: 'vocal_choir', name: 'Choir', category: 'melodic' },
    { id: 'vocal_whisper', name: 'Vocal Whisper', category: 'melodic' },
  ],
  mallets: [
    { id: 'vibraphone', name: 'Vibraphone', category: 'melodic' },
    { id: 'marimba', name: 'Marimba', category: 'melodic' },
    { id: 'xylophone', name: 'Xylophone', category: 'melodic' },
    { id: 'bells', name: 'Bells', category: 'melodic' },
    { id: 'kalimba', name: 'Kalimba', category: 'melodic' },
  ],
  ethnic: [
    { id: 'ethnic_sitar', name: 'Sitar', category: 'melodic' },
    { id: 'ethnic_koto', name: 'Koto', category: 'melodic' },
    { id: 'ethnic_erhu', name: 'Erhu', category: 'melodic' },
    { id: 'ethnic_oud', name: 'Oud', category: 'melodic' },
    { id: 'ethnic_pan_flute', name: 'Pan Flute', category: 'melodic' },
    { id: 'ethnic_didgeridoo', name: 'Didgeridoo', category: 'melodic' },
    { id: 'ethnic_balalaika', name: 'Balalaika', category: 'melodic' },
  ],
  drums: [
    { id: 'acoustic_kit', name: 'Acoustic Kit', category: 'drums' },
    { id: 'electronic_kit', name: 'Electronic Kit', category: 'drums' },
    { id: '808_kit', name: '808 Kit', category: 'drums' },
    { id: '909_kit', name: '909 Kit', category: 'drums' },
    { id: 'trap_kit', name: 'Trap Kit', category: 'drums' },
    { id: 'jazz_kit', name: 'Jazz Kit', category: 'drums' },
    { id: 'rock_kit', name: 'Rock Kit', category: 'drums' },
    { id: 'metal_kit', name: 'Metal Kit', category: 'drums' },
    { id: 'lofi_kit', name: 'Lo-Fi Kit', category: 'drums' },
    { id: 'boombap_kit', name: 'Boom Bap Kit', category: 'drums' },
    { id: 'drill_kit', name: 'Drill Kit', category: 'drums' },
    { id: 'house_kit', name: 'House Kit', category: 'drums' },
    { id: 'techno_kit', name: 'Techno Kit', category: 'drums' },
    { id: 'dnb_kit', name: 'D&B Kit', category: 'drums' },
    { id: 'uk_garage_kit', name: 'UK Garage Kit', category: 'drums' },
  ],
  percussion: [
    { id: 'congas', name: 'Congas', category: 'percussion' },
    { id: 'bongos', name: 'Bongos', category: 'percussion' },
    { id: 'timbales', name: 'Timbales', category: 'percussion' },
    { id: 'djembe', name: 'Djembe', category: 'percussion' },
    { id: 'cajon', name: 'Cajon', category: 'percussion' },
    { id: 'tabla', name: 'Tabla', category: 'percussion' },
    { id: 'shaker', name: 'Shaker', category: 'percussion' },
    { id: 'tambourine', name: 'Tambourine', category: 'percussion' },
    { id: 'cowbell', name: 'Cowbell', category: 'percussion' },
  ],
};

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Phrygian', 'Lydian'];

export function AIMusicGenerator({ projectId, onTrackGenerated, onClose, initialTempo }: AIMusicGeneratorProps) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('hip_hop');
  const [selectedInstrumentCategory, setSelectedInstrumentCategory] = useState('synths');
  const [selectedInstrument, setSelectedInstrument] = useState('synth_lead');
  const [tempo, setTempo] = useState(initialTempo && initialTempo > 0 ? initialTempo : 120);
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
      const instrumentList = INSTRUMENTS[selectedInstrumentCategory] || [];
      const instrument = instrumentList.find(i => i.id === selectedInstrument);
      const instrumentCategory = instrument?.category || 'melodic';
      const instrumentName = instrument?.name || selectedInstrument.replace(/_/g, ' ');
      
      const res = await apiRequest('POST', '/api/studio/generation/text', {
        text: prompt || `${selectedGenre} ${instrumentName}`,
        projectId,
        bars,
        instrumentType: selectedInstrument,
        instrumentCategory: instrumentCategory,
        genre: selectedGenre,
        tempo,
        key,
        scale: scale.toLowerCase(),
        complexity,
      });
      const response = await res.json() as GeneratedTrack;

      if (response.audioFilePath) {
        setGeneratedTrack(response);
        toast({
          title: 'Music Generated!',
          description: `Created ${bars} bars of ${selectedGenre} ${instrumentName} at ${tempo} BPM`,
        });
      }
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate music',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, selectedGenre, selectedInstrumentCategory, selectedInstrument, projectId, bars, tempo, key, scale, complexity, toast]);

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
    if (!generatedTrack) return;
    if (!onTrackGenerated) {
      toast({
        title: 'No project open',
        description: 'Open a project in the studio to add this track to the timeline.',
        variant: 'destructive',
      });
      return;
    }
    const instrumentName = (INSTRUMENTS[selectedInstrumentCategory] || []).find(i => i.id === selectedInstrument)?.name
      || selectedInstrument.replace(/_/g, ' ');
    onTrackGenerated({
      ...generatedTrack,
      name: `AI ${instrumentName}`,
      type: 'audio',
    });
    toast({
      title: 'Added to Project',
      description: 'The generated track has been added to your project',
    });
  }, [generatedTrack, onTrackGenerated, selectedInstrumentCategory, selectedInstrument, toast]);

  const [isGeneratingArrangement, setIsGeneratingArrangement] = useState(false);

  const handleGenerateArrangement = useCallback(async () => {
    if (!onTrackGenerated) {
      toast({
        title: 'Open a project first',
        description: 'Open a project to add the arrangement to the timeline',
        variant: 'destructive',
      });
      return;
    }
    setIsGeneratingArrangement(true);
    try {
      const res = await apiRequest('POST', '/api/studio/generation/pattern/arrangement', {
        genre: selectedGenre,
        key,
        scale: scale.toLowerCase(),
        tempo,
        complexity,
        bars,
      });
      const data = await res.json() as Record<string, unknown>;
      if (data?.arrangement) {
        const tracks = [
          { key: 'melody', label: 'AI Melody', category: 'melodic' },
          { key: 'bass',   label: 'AI Bass',   category: 'melodic' },
          { key: 'pad',    label: 'AI Pad',     category: 'melodic' },
          { key: 'drums',  label: 'AI Drums',   category: 'drums'   },
        ];
        for (const t of tracks) {
          const track = data.arrangement[t.key];
          if (track) {
            onTrackGenerated({
              audioFilePath: '',
              name: t.label,
              type: t.category === 'drums' ? 'midi' : 'midi',
              parameters: { key, scale: scale.toLowerCase(), tempo, genre: selectedGenre },
              duration: (bars * 4 * 60) / tempo,
              generatedNotes: Array.isArray(track.notes) ? track.notes
                : Array.isArray(track.kick) ? track.kick
                : [],
              generatedChords: track.chords || [],
            });
          }
        }
        toast({
          title: 'Full Arrangement Added',
          description: `${selectedGenre} arrangement — melody, bass, pad, and drums added to timeline`,
        });
      }
    } catch (error) {
      toast({
        title: 'Arrangement Failed',
        description: error.message || 'Failed to generate full arrangement',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingArrangement(false);
    }
  }, [selectedGenre, key, scale, tempo, complexity, bars, onTrackGenerated, toast]);

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
          <label className="text-sm font-medium text-zinc-400">Instrument Category</label>
          <div className="flex flex-wrap gap-1.5">
            {INSTRUMENT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedInstrumentCategory(cat.id);
                  const firstInstrument = INSTRUMENTS[cat.id]?.[0];
                  if (firstInstrument) setSelectedInstrument(firstInstrument.id);
                }}
                className={cn(
                  'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                  selectedInstrumentCategory === cat.id
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600 text-zinc-400'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Instrument</label>
          <div className="grid grid-cols-3 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
            {(INSTRUMENTS[selectedInstrumentCategory] || []).map((instrument) => (
              <motion.button
                key={instrument.id}
                onClick={() => setSelectedInstrument(instrument.id)}
                className={cn(
                  'px-3 py-2 rounded-lg border text-left transition-all',
                  selectedInstrument === instrument.id
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600 text-zinc-300'
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <p className="text-xs font-medium truncate">{instrument.name}</p>
              </motion.button>
            ))}
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

      <div className="p-4 border-t border-zinc-800 flex flex-col gap-2">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || isGeneratingArrangement}
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
        <Button
          onClick={handleGenerateArrangement}
          disabled={isGenerating || isGeneratingArrangement}
          variant="outline"
          className="w-full border-zinc-700 text-zinc-200 hover:bg-zinc-800"
        >
          {isGeneratingArrangement ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Building Arrangement...
            </>
          ) : (
            <>
              <LayoutGrid className="w-4 h-4 mr-2" />
              Generate Full Arrangement
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
