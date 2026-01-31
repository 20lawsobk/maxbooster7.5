import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenTool,
  Music,
  Sparkles,
  Play,
  Pause,
  RefreshCw,
  Download,
  Copy,
  Wand2,
  ChevronRight,
  Volume2,
  Sliders,
  Heart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface MelodyNote {
  pitch: number;
  noteName: string;
  duration: number;
  syllable: string;
  stress: boolean;
}

interface MelodySuggestion {
  id: string;
  name: string;
  notes: MelodyNote[];
  style: string;
  confidence: number;
  isFavorite: boolean;
}

interface LyricLine {
  text: string;
  syllables: string[];
  stressPattern: boolean[];
}

interface FlowStateLyricsToMelodyProps {
  onExportMelody?: (notes: MelodyNote[]) => void;
  currentKey?: string;
  currentTempo?: number;
  className?: string;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STYLES = ['Pop', 'R&B', 'Hip-Hop', 'Rock', 'Jazz', 'Folk', 'Electronic', 'Gospel'];
const MOODS = ['Happy', 'Sad', 'Energetic', 'Calm', 'Romantic', 'Angry', 'Hopeful', 'Melancholic'];

const syllabify = (word: string): string[] => {
  const vowels = 'aeiouy';
  const syllables: string[] = [];
  let current = '';
  
  for (let i = 0; i < word.length; i++) {
    current += word[i];
    if (vowels.includes(word[i].toLowerCase()) && i < word.length - 1) {
      if (!vowels.includes(word[i + 1].toLowerCase())) {
        syllables.push(current);
        current = '';
      }
    }
  }
  if (current) syllables.push(current);
  return syllables.length > 0 ? syllables : [word];
};

const analyzeLyrics = (text: string): LyricLine[] => {
  return text.split('\n').filter(line => line.trim()).map(line => {
    const words = line.split(/\s+/);
    const allSyllables: string[] = [];
    const stressPattern: boolean[] = [];
    
    words.forEach((word, wordIdx) => {
      const syls = syllabify(word.replace(/[^\w]/g, ''));
      syls.forEach((syl, sylIdx) => {
        allSyllables.push(syl);
        stressPattern.push(sylIdx === 0 && wordIdx % 2 === 0);
      });
    });
    
    return { text: line, syllables: allSyllables, stressPattern };
  });
};

export function FlowStateLyricsToMelody({
  onExportMelody,
  currentKey = 'C',
  currentTempo = 120,
  className
}: FlowStateLyricsToMelodyProps) {
  const { toast } = useToast();
  const [lyrics, setLyrics] = useState('');
  const [selectedKey, setSelectedKey] = useState(currentKey);
  const [selectedStyle, setSelectedStyle] = useState('Pop');
  const [selectedMood, setSelectedMood] = useState('Happy');
  const [melodyRange, setMelodyRange] = useState([60, 72]);
  const [rhythmComplexity, setRhythmComplexity] = useState([50]);
  const [melodicMovement, setMelodicMovement] = useState([50]);
  const [useScaleNotes, setUseScaleNotes] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<MelodySuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);

  const analyzedLyrics = useMemo(() => analyzeLyrics(lyrics), [lyrics]);
  const totalSyllables = useMemo(
    () => analyzedLyrics.reduce((sum, line) => sum + line.syllables.length, 0),
    [analyzedLyrics]
  );

  const generateMelodies = useCallback(() => {
    if (!lyrics.trim()) {
      toast({ title: 'Enter lyrics first', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);

    setTimeout(() => {
      const keyIndex = NOTES.indexOf(selectedKey);
      const scaleNotes = useScaleNotes 
        ? [0, 2, 4, 5, 7, 9, 11].map(i => (keyIndex + i) % 12)
        : Array.from({ length: 12 }, (_, i) => i);

      const newSuggestions: MelodySuggestion[] = Array.from({ length: 4 }, (_, suggIdx) => {
        const notes: MelodyNote[] = [];
        let prevPitch = melodyRange[0] + Math.floor((melodyRange[1] - melodyRange[0]) / 2);

        analyzedLyrics.forEach(line => {
          line.syllables.forEach((syllable, sylIdx) => {
            const isStressed = line.stressPattern[sylIdx];
            
            const maxJump = Math.floor(melodicMovement[0] / 10) + 2;
            let pitchChange = Math.floor(Math.random() * maxJump * 2) - maxJump;
            if (isStressed) pitchChange = Math.abs(pitchChange);
            
            let newPitch = prevPitch + pitchChange;
            newPitch = Math.max(melodyRange[0], Math.min(melodyRange[1], newPitch));
            
            if (useScaleNotes) {
              const noteInOctave = newPitch % 12;
              if (!scaleNotes.includes(noteInOctave)) {
                newPitch = newPitch + (Math.random() > 0.5 ? 1 : -1);
              }
            }

            const baseDuration = 0.5;
            const durationVariation = rhythmComplexity[0] > 50 
              ? [0.25, 0.5, 0.75, 1][Math.floor(Math.random() * 4)]
              : [0.5, 1][Math.floor(Math.random() * 2)];

            notes.push({
              pitch: newPitch,
              noteName: NOTES[newPitch % 12] + Math.floor(newPitch / 12),
              duration: durationVariation,
              syllable,
              stress: isStressed
            });

            prevPitch = newPitch;
          });
        });

        const styleNames = [
          `${selectedStyle} ${selectedMood}`,
          `Classic ${selectedStyle}`,
          `Modern ${selectedMood}`,
          `${selectedMood} Variation`
        ];

        return {
          id: `melody-${Date.now()}-${suggIdx}`,
          name: styleNames[suggIdx],
          notes,
          style: selectedStyle,
          confidence: 0.7 + Math.random() * 0.25,
          isFavorite: false
        };
      });

      setSuggestions(newSuggestions);
      setSelectedSuggestion(newSuggestions[0].id);
      setIsGenerating(false);
      toast({ title: 'Melodies generated', description: `4 suggestions for ${totalSyllables} syllables` });
    }, 1200);
  }, [lyrics, selectedKey, selectedStyle, selectedMood, melodyRange, rhythmComplexity, melodicMovement, useScaleNotes, analyzedLyrics, totalSyllables, toast]);

  const toggleFavorite = (id: string) => {
    setSuggestions(prev => prev.map(s =>
      s.id === id ? { ...s, isFavorite: !s.isFavorite } : s
    ));
  };

  const exportMelody = (suggestion: MelodySuggestion) => {
    onExportMelody?.(suggestion.notes);
    toast({ title: 'Melody exported', description: `${suggestion.notes.length} notes sent to piano roll` });
  };

  const previewMelody = (id: string) => {
    if (previewPlaying === id) {
      setPreviewPlaying(null);
    } else {
      setPreviewPlaying(id);
      setTimeout(() => setPreviewPlaying(null), 3000);
    }
  };

  const selectedMelody = suggestions.find(s => s.id === selectedSuggestion);

  return (
    <div className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-rose-500/20 to-pink-500/20 rounded-lg">
            <PenTool className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h2 className="font-semibold">Lyrics to Melody</h2>
            <p className="text-xs text-zinc-500">AI-powered melody generation from lyrics</p>
          </div>
        </div>
        <Badge variant="outline" className="text-rose-400 border-rose-400/30">
          <Sparkles className="w-3 h-3 mr-1" />
          AI Composer
        </Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Lyrics Input */}
        <div className="w-80 border-r border-zinc-800 flex flex-col">
          {/* Lyrics Textarea */}
          <div className="p-4 flex-1">
            <Label className="text-sm mb-2 block">Enter Your Lyrics</Label>
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Type or paste your lyrics here...

Example:
Walking through the city lights
Dreams are shining so bright
Every step I take tonight
Leads me to where I belong"
              className="h-48 bg-zinc-900 border-zinc-700 resize-none"
            />
            
            {lyrics.trim() && (
              <div className="mt-3 p-3 bg-zinc-900 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400">Analysis</span>
                  <Badge variant="secondary" className="text-xs">
                    {totalSyllables} syllables
                  </Badge>
                </div>
                <div className="text-xs text-zinc-500">
                  {analyzedLyrics.length} lines detected
                </div>
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="p-4 border-t border-zinc-800 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Key</Label>
                <Select value={selectedKey} onValueChange={setSelectedKey}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTES.map(note => (
                      <SelectItem key={note} value={note}>{note}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Style</Label>
                <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STYLES.map(style => (
                      <SelectItem key={style} value={style}>{style}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-zinc-400">Mood</Label>
              <Select value={selectedMood} onValueChange={setSelectedMood}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOODS.map(mood => (
                    <SelectItem key={mood} value={mood}>{mood}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">
                Melody Range: {NOTES[melodyRange[0] % 12]}{Math.floor(melodyRange[0] / 12)} - {NOTES[melodyRange[1] % 12]}{Math.floor(melodyRange[1] / 12)}
              </Label>
              <Slider
                value={melodyRange}
                onValueChange={setMelodyRange}
                min={48}
                max={84}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">
                Rhythm Complexity: {rhythmComplexity[0]}%
              </Label>
              <Slider
                value={rhythmComplexity}
                onValueChange={setRhythmComplexity}
                min={0}
                max={100}
                step={10}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">
                Melodic Movement: {melodicMovement[0]}%
              </Label>
              <Slider
                value={melodicMovement}
                onValueChange={setMelodicMovement}
                min={0}
                max={100}
                step={10}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400">Use Scale Notes Only</Label>
              <Switch checked={useScaleNotes} onCheckedChange={setUseScaleNotes} />
            </div>
          </div>

          {/* Generate Button */}
          <div className="p-4 border-t border-zinc-800">
            <Button
              className="w-full bg-rose-500 hover:bg-rose-600"
              onClick={generateMelodies}
              disabled={isGenerating || !lyrics.trim()}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Melodies
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Panel - Melody Suggestions */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Suggestions List */}
          <div className="flex-1 overflow-auto p-4">
            {suggestions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                <Music className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">No Melodies Yet</p>
                <p className="text-sm mt-1">Enter lyrics and generate melodies</p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="font-medium">Melody Suggestions</h3>

                <AnimatePresence>
                  {suggestions.map((suggestion, idx) => (
                    <motion.div
                      key={suggestion.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card
                        className={cn(
                          "bg-zinc-900 border-zinc-800 p-4 cursor-pointer transition-all",
                          selectedSuggestion === suggestion.id && "border-rose-500/50 bg-rose-500/5"
                        )}
                        onClick={() => setSelectedSuggestion(suggestion.id)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-medium">{suggestion.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {suggestion.style}
                              </Badge>
                              <span className="text-xs text-zinc-500">
                                {suggestion.notes.length} notes
                              </span>
                              <span className="text-xs text-zinc-500">
                                Confidence: {(suggestion.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className={cn("h-8 w-8", suggestion.isFavorite && "text-red-400")}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(suggestion.id);
                              }}
                            >
                              <Heart className={cn("w-4 h-4", suggestion.isFavorite && "fill-current")} />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                previewMelody(suggestion.id);
                              }}
                            >
                              {previewPlaying === suggestion.id ? (
                                <Pause className="w-4 h-4" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Mini melody visualization */}
                        <div className="h-16 bg-zinc-950 rounded relative overflow-hidden">
                          {suggestion.notes.slice(0, 40).map((note, noteIdx) => {
                            const minPitch = Math.min(...suggestion.notes.map(n => n.pitch));
                            const maxPitch = Math.max(...suggestion.notes.map(n => n.pitch));
                            const range = maxPitch - minPitch || 12;
                            const y = ((maxPitch - note.pitch) / range) * 100;
                            const x = (noteIdx / Math.min(suggestion.notes.length, 40)) * 100;
                            
                            return (
                              <motion.div
                                key={noteIdx}
                                className={cn(
                                  "absolute h-2 rounded-sm",
                                  note.stress ? "bg-rose-400" : "bg-rose-600"
                                )}
                                style={{
                                  left: `${x}%`,
                                  top: `${y}%`,
                                  width: `${Math.max(1, note.duration * 3)}%`
                                }}
                                animate={previewPlaying === suggestion.id ? {
                                  opacity: [0.5, 1, 0.5],
                                  transition: { delay: noteIdx * 0.1, duration: 0.2 }
                                } : {}}
                              />
                            );
                          })}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-zinc-800">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(
                                suggestion.notes.map(n => n.noteName).join(' ')
                              );
                              toast({ title: 'Copied to clipboard' });
                            }}
                          >
                            <Copy className="w-3.5 h-3.5 mr-1" />
                            Copy Notes
                          </Button>
                          <Button
                            size="sm"
                            className="bg-rose-500 hover:bg-rose-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              exportMelody(suggestion);
                            }}
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            Export to Piano Roll
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Selected Melody Detail */}
          {selectedMelody && (
            <div className="border-t border-zinc-800 p-4 bg-zinc-900/50">
              <h4 className="font-medium mb-3">Lyrics with Notes - {selectedMelody.name}</h4>
              <div className="max-h-32 overflow-auto">
                <div className="flex flex-wrap gap-1">
                  {selectedMelody.notes.map((note, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "px-2 py-1 rounded text-xs",
                        note.stress ? "bg-rose-500/30" : "bg-zinc-800"
                      )}
                    >
                      <div className="font-mono text-rose-400">{note.noteName}</div>
                      <div className="text-zinc-400">{note.syllable}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowStateLyricsToMelody;
