import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music,
  Sparkles,
  Play,
  Pause,
  Plus,
  Check,
  RefreshCw,
  ChevronRight,
  Wand2,
  Lightbulb,
  Heart,
  Copy,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MelodyNote {
  pitch: number;
  time: number;
  duration: number;
}

interface Chord {
  root: string;
  type: string;
  name: string;
  notes: string[];
  midiNotes: number[];
  romanNumeral: string;
  function: "tonic" | "subdominant" | "dominant" | "secondary";
  tension: number;
  color: string;
}

interface ChordProgression {
  id: string;
  name: string;
  chords: Chord[];
  key: string;
  style: string;
  confidence: number;
  isFavorite: boolean;
}

interface FlowStateChordSuggestionsProps {
  melodyNotes?: MelodyNote[];
  currentKey?: string;
  onSelectProgression?: (chords: Chord[]) => void;
  onApplyChord?: (chord: Chord, position: number) => void;
  className?: string;
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHORD_TYPES = [
  "maj",
  "min",
  "7",
  "maj7",
  "min7",
  "dim",
  "aug",
  "sus2",
  "sus4",
  "9",
  "add9",
];

const STYLES = [
  "Pop",
  "Jazz",
  "Rock",
  "R&B",
  "Electronic",
  "Classical",
  "Hip-Hop",
  "Gospel",
  "Folk",
  "Latin",
];

const FUNCTION_COLORS: Record<string, string> = {
  tonic: "bg-blue-500",
  subdominant: "bg-green-500",
  dominant: "bg-red-500",
  secondary: "bg-purple-500",
};

const generateChordFromRoot = (
  root: string,
  type: string,
  func: Chord["function"],
): Chord => {
  const rootIndex = NOTES.indexOf(root);
  let intervals: number[] = [];
  let typeName = "";

  switch (type) {
    case "maj":
      intervals = [0, 4, 7];
      typeName = "";
      break;
    case "min":
      intervals = [0, 3, 7];
      typeName = "m";
      break;
    case "7":
      intervals = [0, 4, 7, 10];
      typeName = "7";
      break;
    case "maj7":
      intervals = [0, 4, 7, 11];
      typeName = "maj7";
      break;
    case "min7":
      intervals = [0, 3, 7, 10];
      typeName = "m7";
      break;
    case "dim":
      intervals = [0, 3, 6];
      typeName = "dim";
      break;
    case "aug":
      intervals = [0, 4, 8];
      typeName = "aug";
      break;
    case "sus2":
      intervals = [0, 2, 7];
      typeName = "sus2";
      break;
    case "sus4":
      intervals = [0, 5, 7];
      typeName = "sus4";
      break;
    default:
      intervals = [0, 4, 7];
      typeName = "";
  }

  const midiNotes = intervals.map((i) => 60 + rootIndex + i);
  const notes = intervals.map((i) => NOTES[(rootIndex + i) % 12]);

  return {
    root,
    type,
    name: `${root}${typeName}`,
    notes,
    midiNotes,
    romanNumeral: "I",
    function: func,
    tension: type.includes("7") ? 0.6 : type === "dim" ? 0.8 : 0.3,
    color: FUNCTION_COLORS[func],
  };
};

export function FlowStateChordSuggestions({
  melodyNotes = [],
  currentKey = "C Major",
  onSelectProgression,
  onApplyChord,
  className,
}: FlowStateChordSuggestionsProps) {
  const { toast } = useToast();
  const [selectedKey, setSelectedKey] = useState(currentKey.split(" ")[0]);
  const [selectedScale, setSelectedScale] = useState(
    currentKey.includes("Minor") ? "minor" : "major",
  );
  const [selectedStyle, setSelectedStyle] = useState("Pop");
  const [complexity, setComplexity] = useState([50]);
  const [jazziness, setJazziness] = useState([30]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressions, setProgressions] = useState<ChordProgression[]>([]);
  const [selectedProgression, setSelectedProgression] = useState<string | null>(
    null,
  );
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useSecondaryDominants, setUseSecondaryDominants] = useState(true);
  const [useBorrowedChords, setUseBorrowedChords] = useState(false);

  const scaleChords = useMemo(() => {
    const majorChords = [
      { numeral: "I", type: "maj", func: "tonic" as const },
      { numeral: "ii", type: "min", func: "subdominant" as const },
      { numeral: "iii", type: "min", func: "tonic" as const },
      { numeral: "IV", type: "maj", func: "subdominant" as const },
      { numeral: "V", type: "maj", func: "dominant" as const },
      { numeral: "vi", type: "min", func: "tonic" as const },
      { numeral: "vii°", type: "dim", func: "dominant" as const },
    ];

    const minorChords = [
      { numeral: "i", type: "min", func: "tonic" as const },
      { numeral: "ii°", type: "dim", func: "subdominant" as const },
      { numeral: "III", type: "maj", func: "tonic" as const },
      { numeral: "iv", type: "min", func: "subdominant" as const },
      { numeral: "V", type: "maj", func: "dominant" as const },
      { numeral: "VI", type: "maj", func: "subdominant" as const },
      { numeral: "VII", type: "maj", func: "dominant" as const },
    ];

    const chordDefs = selectedScale === "major" ? majorChords : minorChords;
    const keyIndex = NOTES.indexOf(selectedKey);
    const scaleIntervals =
      selectedScale === "major"
        ? [0, 2, 4, 5, 7, 9, 11]
        : [0, 2, 3, 5, 7, 8, 10];

    return chordDefs.map((def, idx) => {
      const root = NOTES[(keyIndex + scaleIntervals[idx]) % 12];
      const chord = generateChordFromRoot(root, def.type, def.func);
      return { ...chord, romanNumeral: def.numeral };
    });
  }, [selectedKey, selectedScale]);

  const generateProgressions = useCallback(() => {
    setIsGenerating(true);

    setTimeout(() => {
      const commonProgressions = [
        { name: "Pop Standard", pattern: [0, 4, 5, 3], style: "Pop" },
        { name: "Classic Rock", pattern: [0, 3, 4, 4], style: "Rock" },
        { name: "Sensitive", pattern: [5, 3, 0, 4], style: "Pop" },
        { name: "Jazz ii-V-I", pattern: [1, 4, 0], style: "Jazz" },
        { name: "Andalusian Cadence", pattern: [5, 4, 3, 2], style: "Latin" },
        { name: "Gospel Turn", pattern: [3, 4, 0, 0], style: "Gospel" },
        { name: "R&B Smooth", pattern: [1, 4, 0, 5], style: "R&B" },
        {
          name: "Electronic Build",
          pattern: [0, 0, 5, 4],
          style: "Electronic",
        },
      ];

      const newProgressions: ChordProgression[] = commonProgressions
        .filter((p) => p.style === selectedStyle || selectedStyle === "Pop")
        .slice(0, 6)
        .map((prog, idx) => {
          let chords = prog.pattern.map((i) => ({ ...scaleChords[i] }));

          if (jazziness[0] > 50) {
            chords = chords.map((chord) => {
              if (Math.random() < jazziness[0] / 100) {
                return generateChordFromRoot(
                  chord.root,
                  "maj7",
                  chord.function,
                );
              }
              return chord;
            });
          }

          if (
            useSecondaryDominants &&
            complexity[0] > 60 &&
            chords.length > 2
          ) {
            const insertIdx =
              Math.floor(Math.random() * (chords.length - 1)) + 1;
            const nextChord = chords[insertIdx];
            const secondaryDom = generateChordFromRoot(
              NOTES[(NOTES.indexOf(nextChord.root) + 7) % 12],
              "7",
              "secondary",
            );
            secondaryDom.romanNumeral = `V/${nextChord.romanNumeral}`;
          }

          return {
            id: `prog-${Date.now()}-${idx}`,
            name: prog.name,
            chords,
            key: `${selectedKey} ${selectedScale}`,
            style: prog.style,
            confidence: 0.7 + Math.random() * 0.25,
            isFavorite: false,
          };
        });

      setProgressions(newProgressions);
      setIsGenerating(false);
      toast({
        title: "Suggestions generated",
        description: `${newProgressions.length} chord progressions in ${selectedKey} ${selectedScale}`,
      });
    }, 800);
  }, [
    scaleChords,
    selectedKey,
    selectedScale,
    selectedStyle,
    complexity,
    jazziness,
    useSecondaryDominants,
    toast,
  ]);

  const toggleFavorite = (progId: string) => {
    setProgressions((prev) =>
      prev.map((p) =>
        p.id === progId ? { ...p, isFavorite: !p.isFavorite } : p,
      ),
    );
  };

  const selectProgression = (prog: ChordProgression) => {
    setSelectedProgression(prog.id);
    onSelectProgression?.(prog.chords);
    toast({ title: "Progression selected", description: prog.name });
  };

  const previewProgression = (progId: string) => {
    if (previewPlaying === progId) {
      setPreviewPlaying(null);
    } else {
      setPreviewPlaying(progId);
      setTimeout(() => setPreviewPlaying(null), 4000);
    }
  };

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-lg">
            <Music className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="font-semibold">Chord Suggestions</h2>
            <p className="text-xs text-zinc-500">
              AI-powered harmony assistant
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-indigo-400 border-indigo-400/30"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          AI Powered
        </Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-72 border-r border-zinc-800 p-4 flex flex-col gap-4 overflow-auto">
          {/* Key Selection */}
          <div className="space-y-2">
            <Label className="text-sm">Key & Scale</Label>
            <div className="flex gap-2">
              <Select value={selectedKey} onValueChange={setSelectedKey}>
                <SelectTrigger className="flex-1 bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTES.map((note) => (
                    <SelectItem key={note} value={note}>
                      {note}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedScale} onValueChange={setSelectedScale}>
                <SelectTrigger className="flex-1 bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Style */}
          <div className="space-y-2">
            <Label className="text-sm">Style</Label>
            <Select value={selectedStyle} onValueChange={setSelectedStyle}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Complexity */}
          <div className="space-y-2">
            <Label className="text-sm">Complexity: {complexity[0]}%</Label>
            <Slider
              value={complexity}
              onValueChange={setComplexity}
              min={0}
              max={100}
              step={10}
            />
            <p className="text-xs text-zinc-500">
              {complexity[0] < 30
                ? "Simple triads"
                : complexity[0] < 60
                  ? "Added 7ths"
                  : "Extended chords & substitutions"}
            </p>
          </div>

          {/* Jazziness */}
          <div className="space-y-2">
            <Label className="text-sm">Jazziness: {jazziness[0]}%</Label>
            <Slider
              value={jazziness}
              onValueChange={setJazziness}
              min={0}
              max={100}
              step={10}
            />
          </div>

          {/* Advanced Options */}
          <div className="pt-2 border-t border-zinc-800">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              Advanced Options
              <ChevronRight
                className={cn(
                  "w-4 h-4 transition-transform",
                  showAdvanced && "rotate-90",
                )}
              />
            </Button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-3 pt-3"
                >
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-zinc-400">
                      Secondary Dominants
                    </Label>
                    <Switch
                      checked={useSecondaryDominants}
                      onCheckedChange={setUseSecondaryDominants}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-zinc-400">
                      Borrowed Chords
                    </Label>
                    <Switch
                      checked={useBorrowedChords}
                      onCheckedChange={setUseBorrowedChords}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Generate Button */}
          <Button
            className="mt-auto bg-indigo-500 hover:bg-indigo-600"
            onClick={generateProgressions}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Suggestions
              </>
            )}
          </Button>

          {/* Scale Chords Reference */}
          <Card className="bg-zinc-900 border-zinc-800 p-3">
            <h4 className="text-xs font-medium text-zinc-400 mb-2">
              Scale Chords
            </h4>
            <div className="flex flex-wrap gap-1">
              {scaleChords.map((chord, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className={cn(
                    "cursor-pointer hover:opacity-80",
                    chord.color.replace("bg-", "bg-") + "/30",
                  )}
                  onClick={() => onApplyChord?.(chord, 0)}
                >
                  <span className="text-[10px] mr-1 opacity-60">
                    {chord.romanNumeral}
                  </span>
                  {chord.name}
                </Badge>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Panel - Suggestions */}
        <div className="flex-1 overflow-auto p-4">
          {progressions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <Lightbulb className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">No Suggestions Yet</p>
              <p className="text-sm mt-1">
                Configure settings and generate chord progressions
              </p>
              <Button
                className="mt-4 bg-indigo-500 hover:bg-indigo-600"
                onClick={generateProgressions}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Now
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Suggested Progressions</h3>
                <span className="text-sm text-zinc-500">
                  {progressions.length} suggestions
                </span>
              </div>

              <AnimatePresence>
                {progressions.map((prog, idx) => (
                  <motion.div
                    key={prog.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card
                      className={cn(
                        "bg-zinc-900 border-zinc-800 p-4 cursor-pointer transition-all",
                        selectedProgression === prog.id &&
                          "border-indigo-500/50 bg-indigo-500/5",
                      )}
                      onClick={() => selectProgression(prog)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-medium flex items-center gap-2">
                            {prog.name}
                            {selectedProgression === prog.id && (
                              <Check className="w-4 h-4 text-green-400" />
                            )}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {prog.style}
                            </Badge>
                            <span className="text-xs text-zinc-500">
                              {prog.key}
                            </span>
                            <span className="text-xs text-zinc-500">
                              Confidence: {(prog.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                              "h-8 w-8",
                              prog.isFavorite && "text-red-400",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(prog.id);
                            }}
                          >
                            <Heart
                              className={cn(
                                "w-4 h-4",
                                prog.isFavorite && "fill-current",
                              )}
                            />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              previewProgression(prog.id);
                            }}
                          >
                            {previewPlaying === prog.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Chord Display */}
                      <div className="flex gap-2">
                        {prog.chords.map((chord, chordIdx) => (
                          <motion.div
                            key={chordIdx}
                            className={cn(
                              "flex-1 rounded-lg p-3 text-center relative overflow-hidden",
                              chord.color + "/20",
                              "border border-transparent hover:border-white/20",
                            )}
                            animate={
                              previewPlaying === prog.id
                                ? {
                                    scale: [1, 1.05, 1],
                                    transition: {
                                      delay: chordIdx * 1,
                                      duration: 0.3,
                                    },
                                  }
                                : {}
                            }
                          >
                            <div
                              className={cn(
                                "absolute top-0 left-0 right-0 h-1",
                                chord.color,
                              )}
                            />
                            <div className="text-lg font-bold">
                              {chord.name}
                            </div>
                            <div className="text-xs text-zinc-400 mt-1">
                              {chord.romanNumeral}
                            </div>
                            <div className="text-[10px] text-zinc-500 mt-1">
                              {chord.notes.join(" ")}
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-zinc-800">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(
                              prog.chords.map((c) => c.name).join(" - "),
                            );
                            toast({ title: "Copied to clipboard" });
                          }}
                        >
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          className="bg-indigo-500 hover:bg-indigo-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectProgression(prog);
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Use This
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowStateChordSuggestions;
