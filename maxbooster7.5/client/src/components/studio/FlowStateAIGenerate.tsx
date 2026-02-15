import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Wand2, 
  X, 
  Music,
  Loader2,
  Sparkles,
  Drum,
  Guitar,
  Mic2,
  Piano,
  Waves,
  Play,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

interface GenerationParams {
  text: string;
  projectId?: string;
  duration?: number;
  bars?: number;
  instrumentType?: string;
  instrumentCategory?: 'melodic' | 'drums' | 'percussion';
  genre?: string;
  tempo?: number;
  key?: string;
  scale?: string;
  complexity?: number;
}

interface GenerationResult {
  success: boolean;
  audioFilePath: string;
  parameters: any;
  duration: number;
  sourceType: string;
  generatedNotes?: any[];
  generatedChords?: any[];
}

const INSTRUMENT_GROUPS = [
  { id: 'drums', name: 'Drums', icon: Drum, color: 'from-amber-500 to-orange-500', category: 'drums' as const },
  { id: 'bass', name: 'Bass', icon: Guitar, color: 'from-purple-500 to-violet-500', category: 'melodic' as const },
  { id: 'keys', name: 'Keys/Piano', icon: Piano, color: 'from-blue-500 to-cyan-500', category: 'melodic' as const },
  { id: 'synth', name: 'Synth', icon: Waves, color: 'from-pink-500 to-rose-500', category: 'melodic' as const },
  { id: 'guitar', name: 'Guitar', icon: Guitar, color: 'from-emerald-500 to-teal-500', category: 'melodic' as const },
  { id: 'strings', name: 'Strings', icon: Music, color: 'from-sky-500 to-indigo-500', category: 'melodic' as const },
  { id: 'brass', name: 'Brass/Wind', icon: Music, color: 'from-orange-500 to-yellow-500', category: 'melodic' as const },
  { id: 'vocal', name: 'Vocals', icon: Mic2, color: 'from-rose-500 to-red-500', category: 'melodic' as const },
  { id: 'mallets', name: 'Mallets', icon: Music, color: 'from-teal-500 to-emerald-500', category: 'melodic' as const },
  { id: 'ethnic', name: 'Ethnic', icon: Music, color: 'from-violet-500 to-purple-500', category: 'melodic' as const },
  { id: 'percussion', name: 'Percussion', icon: Music, color: 'from-yellow-500 to-amber-500', category: 'percussion' as const },
];

const SPECIFIC_INSTRUMENTS: Record<string, Array<{ id: string; name: string }>> = {
  drums: [
    { id: 'acoustic_kit', name: 'Acoustic Kit' },
    { id: 'electronic_kit', name: 'Electronic Kit' },
    { id: '808_kit', name: '808 Kit' },
    { id: '909_kit', name: '909 Kit' },
    { id: 'trap_kit', name: 'Trap Kit' },
    { id: 'jazz_kit', name: 'Jazz Kit' },
    { id: 'rock_kit', name: 'Rock Kit' },
    { id: 'lofi_kit', name: 'Lo-Fi Kit' },
    { id: 'boombap_kit', name: 'Boom Bap Kit' },
    { id: 'drill_kit', name: 'Drill Kit' },
    { id: 'house_kit', name: 'House Kit' },
    { id: 'techno_kit', name: 'Techno Kit' },
    { id: 'dnb_kit', name: 'D&B Kit' },
  ],
  bass: [
    { id: 'bass_electric', name: 'Electric Bass' },
    { id: 'bass_acoustic', name: 'Acoustic Bass' },
    { id: 'bass_synth', name: 'Synth Bass' },
    { id: 'bass_808', name: '808 Bass' },
    { id: 'bass_sub', name: 'Sub Bass' },
  ],
  keys: [
    { id: 'piano', name: 'Piano' },
    { id: 'electric_piano', name: 'Electric Piano' },
    { id: 'organ', name: 'Organ' },
    { id: 'harpsichord', name: 'Harpsichord' },
    { id: 'celesta', name: 'Celesta' },
  ],
  synth: [
    { id: 'synth_lead', name: 'Synth Lead' },
    { id: 'synth_pad', name: 'Synth Pad' },
    { id: 'synth_pluck', name: 'Synth Pluck' },
    { id: 'synth_brass', name: 'Synth Brass' },
  ],
  guitar: [
    { id: 'guitar_acoustic', name: 'Acoustic Guitar' },
    { id: 'guitar_electric', name: 'Electric Guitar' },
    { id: 'guitar_nylon', name: 'Nylon Guitar' },
    { id: 'guitar_jazz', name: 'Jazz Guitar' },
  ],
  strings: [
    { id: 'strings_violin', name: 'Violin' },
    { id: 'strings_viola', name: 'Viola' },
    { id: 'strings_cello', name: 'Cello' },
    { id: 'strings_ensemble', name: 'String Ensemble' },
  ],
  brass: [
    { id: 'brass_trumpet', name: 'Trumpet' },
    { id: 'brass_trombone', name: 'Trombone' },
    { id: 'brass_french_horn', name: 'French Horn' },
    { id: 'woodwind_flute', name: 'Flute' },
    { id: 'woodwind_saxophone', name: 'Saxophone' },
    { id: 'woodwind_clarinet', name: 'Clarinet' },
  ],
  vocal: [
    { id: 'vocal_lead', name: 'Vocal Lead' },
    { id: 'vocal_harmony', name: 'Vocal Harmony' },
    { id: 'vocal_choir', name: 'Choir' },
    { id: 'vocal_whisper', name: 'Vocal Whisper' },
  ],
  mallets: [
    { id: 'vibraphone', name: 'Vibraphone' },
    { id: 'marimba', name: 'Marimba' },
    { id: 'xylophone', name: 'Xylophone' },
    { id: 'bells', name: 'Bells' },
    { id: 'kalimba', name: 'Kalimba' },
  ],
  ethnic: [
    { id: 'ethnic_sitar', name: 'Sitar' },
    { id: 'ethnic_koto', name: 'Koto' },
    { id: 'ethnic_erhu', name: 'Erhu' },
    { id: 'ethnic_oud', name: 'Oud' },
    { id: 'ethnic_pan_flute', name: 'Pan Flute' },
    { id: 'ethnic_didgeridoo', name: 'Didgeridoo' },
  ],
  percussion: [
    { id: 'congas', name: 'Congas' },
    { id: 'bongos', name: 'Bongos' },
    { id: 'djembe', name: 'Djembe' },
    { id: 'tabla', name: 'Tabla' },
    { id: 'cajon', name: 'Cajon' },
    { id: 'shaker', name: 'Shaker' },
    { id: 'tambourine', name: 'Tambourine' },
    { id: 'cowbell', name: 'Cowbell' },
  ],
};

const GENRE_PRESETS = [
  { id: 'trap', name: 'Trap', bpm: 140 },
  { id: 'hip-hop', name: 'Hip Hop', bpm: 90 },
  { id: 'house', name: 'House', bpm: 125 },
  { id: 'techno', name: 'Techno', bpm: 130 },
  { id: 'lofi', name: 'Lo-Fi', bpm: 75 },
  { id: 'rnb', name: 'R&B', bpm: 85 },
  { id: 'pop', name: 'Pop', bpm: 120 },
  { id: 'rock', name: 'Rock', bpm: 110 },
];

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'];

async function generateAudio(params: GenerationParams): Promise<GenerationResult> {
  const response = await fetch('/api/studio/generation/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate audio');
  }
  return response.json();
}

interface FlowStateAIGenerateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerationComplete: (result: GenerationResult) => void;
  projectId?: string;
}

export function FlowStateAIGenerate({
  open,
  onOpenChange,
  onGenerationComplete,
  projectId,
}: FlowStateAIGenerateProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(INSTRUMENT_GROUPS[0]);
  const [selectedSpecific, setSelectedSpecific] = useState('acoustic_kit');
  const [selectedGenre, setSelectedGenre] = useState(GENRE_PRESETS[0]);
  const [tempo, setTempo] = useState(120);
  const [bars, setBars] = useState(4);
  const [key, setKey] = useState('C');
  const [scale, setScale] = useState('minor');
  const [complexity, setComplexity] = useState(0.5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: generateAudio,
    onSuccess: (result) => {
      const specificName = SPECIFIC_INSTRUMENTS[selectedGroup.id]?.find(i => i.id === selectedSpecific)?.name || selectedGroup.name;
      toast({
        title: 'Generation Complete',
        description: `Created ${specificName} in ${selectedGenre.name} style`,
      });
      queryClient.invalidateQueries({ queryKey: ['studio-tracks', projectId] });
      onGenerationComplete(result);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleGenerate = () => {
    const specificName = SPECIFIC_INSTRUMENTS[selectedGroup.id]?.find(i => i.id === selectedSpecific)?.name || selectedGroup.name;
    const fullPrompt = [
      specificName,
      selectedGenre.name,
      prompt.trim(),
    ].filter(Boolean).join(' ');

    generateMutation.mutate({
      text: fullPrompt,
      projectId,
      bars,
      tempo,
      key,
      scale,
      complexity,
      instrumentType: selectedSpecific,
      instrumentCategory: selectedGroup.category,
      genre: selectedGenre.id,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500" />
            
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">AI Music Generator</h2>
                  <p className="text-xs text-white/50">Create music with AI assistance</p>
                </div>
              </div>
              <motion.button
                onClick={() => onOpenChange(false)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-2">Describe what you want (optional)</label>
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., dark and moody, energetic, chill vibes..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  disabled={generateMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-2">Instrument Family</label>
                <div className="flex flex-wrap gap-1.5">
                  {INSTRUMENT_GROUPS.map((inst) => (
                    <button
                      key={inst.id}
                      onClick={() => {
                        setSelectedGroup(inst);
                        const firstSpecific = SPECIFIC_INSTRUMENTS[inst.id]?.[0];
                        if (firstSpecific) setSelectedSpecific(firstSpecific.id);
                      }}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                        selectedGroup.id === inst.id
                          ? `bg-gradient-to-r ${inst.color} border-transparent text-white`
                          : "border-white/10 bg-white/5 hover:bg-white/10 text-white/60"
                      )}
                      disabled={generateMutation.isPending}
                    >
                      {inst.name}
                    </button>
                  ))}
                </div>
              </div>

              {SPECIFIC_INSTRUMENTS[selectedGroup.id] && (
                <div>
                  <label className="block text-xs text-white/60 mb-2">Specific Instrument</label>
                  <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto">
                    {SPECIFIC_INSTRUMENTS[selectedGroup.id].map((inst) => (
                      <button
                        key={inst.id}
                        onClick={() => setSelectedSpecific(inst.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs transition-all border",
                          selectedSpecific === inst.id
                            ? "border-white/30 bg-white/15 text-white"
                            : "border-white/5 bg-white/5 hover:bg-white/10 text-white/50"
                        )}
                        disabled={generateMutation.isPending}
                      >
                        {inst.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-white/60 mb-2">Genre / Style</label>
                <div className="flex flex-wrap gap-2">
                  {GENRE_PRESETS.map((genre) => (
                    <button
                      key={genre.id}
                      onClick={() => {
                        setSelectedGenre(genre);
                        setTempo(genre.bpm);
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs transition-colors",
                        selectedGenre.id === genre.id
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                          : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                      )}
                      disabled={generateMutation.isPending}
                    >
                      {genre.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/60 mb-2">Tempo: {tempo} BPM</label>
                  <Slider
                    value={[tempo]}
                    onValueChange={([v]) => setTempo(v)}
                    min={60}
                    max={200}
                    step={1}
                    disabled={generateMutation.isPending}
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-2">Length: {bars} bars</label>
                  <Slider
                    value={[bars]}
                    onValueChange={([v]) => setBars(v)}
                    min={1}
                    max={16}
                    step={1}
                    disabled={generateMutation.isPending}
                  />
                </div>
              </div>

              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                {showAdvanced ? 'Hide' : 'Show'} Advanced Options
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
                      <div>
                        <label className="block text-xs text-white/60 mb-2">Key</label>
                        <div className="flex flex-wrap gap-1">
                          {KEYS.map((k) => (
                            <button
                              key={k}
                              onClick={() => setKey(k)}
                              className={cn(
                                "w-8 h-8 rounded text-xs transition-colors",
                                key === k
                                  ? "bg-white/20 text-white"
                                  : "bg-white/5 text-white/60 hover:bg-white/10"
                              )}
                              disabled={generateMutation.isPending}
                            >
                              {k}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-white/60 mb-2">Scale</label>
                        <div className="flex flex-wrap gap-1">
                          {SCALES.slice(0, 4).map((s) => (
                            <button
                              key={s}
                              onClick={() => setScale(s)}
                              className={cn(
                                "px-2 py-1 rounded text-xs capitalize transition-colors",
                                scale === s
                                  ? "bg-white/20 text-white"
                                  : "bg-white/5 text-white/60 hover:bg-white/10"
                              )}
                              disabled={generateMutation.isPending}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-2">
                        Complexity: {Math.round(complexity * 100)}%
                      </label>
                      <Slider
                        value={[complexity]}
                        onValueChange={([v]) => setComplexity(v)}
                        min={0}
                        max={1}
                        step={0.1}
                        disabled={generateMutation.isPending}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="p-4 border-t border-white/5">
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 h-12 text-base"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating {selectedInstrument.name}...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    Generate {selectedInstrument.name}
                  </>
                )}
              </Button>
              
              <p className="text-center text-xs text-white/30 mt-3">
                AI will create a {bars}-bar {selectedInstrument.name.toLowerCase()} pattern in {selectedGenre.name} style at {tempo} BPM
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
