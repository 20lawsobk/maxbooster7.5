import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, Plus, Check, Star, StarOff, Search, Music, Drum, Guitar, Piano, Mic2, Layers, Settings, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TemplateTrack {
  id: string;
  name: string;
  type: "audio" | "midi" | "bus" | "master";
  color: string;
  icon:
    | "vocals"
    | "drums"
    | "bass"
    | "keys"
    | "guitar"
    | "synth"
    | "fx"
    | "bus";
  plugins: string[];
  sends: string[];
}

interface TemplateBus {
  id: string;
  name: string;
  color: string;
  plugins: string[];
}

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  genre: string;
  tempo: number;
  timeSignature: string;
  key: string;
  tracks: TemplateTrack[];
  buses: TemplateBus[];
  masterPlugins: string[];
  thumbnail?: string;
  isBuiltIn: boolean;
  isFavorite: boolean;
  usageCount: number;
  createdAt: Date;
}

interface FlowStateTemplatesProps {
  onApplyTemplate?: (template: ProjectTemplate) => void;
  onSaveAsTemplate?: () => void;
  className?: string;
}

const GENRES = [
  "All",
  "Pop",
  "Hip-Hop",
  "R&B",
  "Electronic",
  "Rock",
  "Jazz",
  "Classical",
  "Podcast",
  "Film Score",
];

const TRACK_ICONS: Record<string, React.ReactNode> = {
  vocals: <Mic2 className="w-4 h-4" />,
  drums: <Drum className="w-4 h-4" />,
  bass: <Music className="w-4 h-4" />,
  keys: <Piano className="w-4 h-4" />,
  guitar: <Guitar className="w-4 h-4" />,
  synth: <Layers className="w-4 h-4" />,
  fx: <Settings className="w-4 h-4" />,
  bus: <Folder className="w-4 h-4" />,
};

const BUILT_IN_TEMPLATES: ProjectTemplate[] = [
  {
    id: "pop-production",
    name: "Pop Production",
    description:
      "Modern pop setup with vocals, drums, bass, and synths. Includes master chain.",
    genre: "Pop",
    tempo: 120,
    timeSignature: "4/4",
    key: "C Major",
    tracks: [
      {
        id: "t1",
        name: "Lead Vocals",
        type: "audio",
        color: "bg-pink-500",
        icon: "vocals",
        plugins: ["EQ", "Compressor", "De-Esser", "Reverb Send"],
        sends: ["Vocal Reverb"],
      },
      {
        id: "t2",
        name: "Backing Vocals",
        type: "audio",
        color: "bg-pink-400",
        icon: "vocals",
        plugins: ["EQ", "Compressor"],
        sends: ["Vocal Reverb"],
      },
      {
        id: "t3",
        name: "Drums",
        type: "midi",
        color: "bg-orange-500",
        icon: "drums",
        plugins: ["Drum Machine", "Transient Shaper"],
        sends: ["Drum Room"],
      },
      {
        id: "t4",
        name: "Bass",
        type: "midi",
        color: "bg-purple-500",
        icon: "bass",
        plugins: ["Bass Synth", "Compressor", "Saturation"],
        sends: [],
      },
      {
        id: "t5",
        name: "Keys",
        type: "midi",
        color: "bg-blue-500",
        icon: "keys",
        plugins: ["Piano", "EQ"],
        sends: ["Main Reverb"],
      },
      {
        id: "t6",
        name: "Synth Lead",
        type: "midi",
        color: "bg-cyan-500",
        icon: "synth",
        plugins: ["Synth", "Delay", "Chorus"],
        sends: ["Main Reverb"],
      },
      {
        id: "t7",
        name: "Synth Pad",
        type: "midi",
        color: "bg-teal-500",
        icon: "synth",
        plugins: ["Pad Synth", "Reverb"],
        sends: [],
      },
    ],
    buses: [
      {
        id: "b1",
        name: "Vocal Reverb",
        color: "bg-pink-600",
        plugins: ["Plate Reverb"],
      },
      {
        id: "b2",
        name: "Drum Room",
        color: "bg-orange-600",
        plugins: ["Room Reverb", "Compressor"],
      },
      {
        id: "b3",
        name: "Main Reverb",
        color: "bg-blue-600",
        plugins: ["Hall Reverb"],
      },
    ],
    masterPlugins: ["EQ", "Multiband Compressor", "Limiter", "Stereo Widener"],
    isBuiltIn: true,
    isFavorite: true,
    usageCount: 1247,
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "hiphop-beats",
    name: "Hip-Hop Beats",
    description:
      "808-heavy trap setup with space for vocals and melodic elements.",
    genre: "Hip-Hop",
    tempo: 140,
    timeSignature: "4/4",
    key: "F Minor",
    tracks: [
      {
        id: "t1",
        name: "Main Vocals",
        type: "audio",
        color: "bg-red-500",
        icon: "vocals",
        plugins: ["EQ", "Compressor", "Auto-Tune"],
        sends: ["Vocal Delay"],
      },
      {
        id: "t2",
        name: "Ad-Libs",
        type: "audio",
        color: "bg-red-400",
        icon: "vocals",
        plugins: ["EQ", "Heavy Compression"],
        sends: ["Vocal Delay"],
      },
      {
        id: "t3",
        name: "Kicks",
        type: "midi",
        color: "bg-orange-500",
        icon: "drums",
        plugins: ["808", "Distortion"],
        sends: [],
      },
      {
        id: "t4",
        name: "Hi-Hats",
        type: "midi",
        color: "bg-yellow-500",
        icon: "drums",
        plugins: ["Sampler", "Transient"],
        sends: [],
      },
      {
        id: "t5",
        name: "Snares",
        type: "midi",
        color: "bg-amber-500",
        icon: "drums",
        plugins: ["Sampler", "Compressor"],
        sends: ["Drum Verb"],
      },
      {
        id: "t6",
        name: "Melody",
        type: "midi",
        color: "bg-purple-500",
        icon: "keys",
        plugins: ["Synth", "Gross Beat"],
        sends: ["Main Reverb"],
      },
      {
        id: "t7",
        name: "Counter Melody",
        type: "midi",
        color: "bg-indigo-500",
        icon: "synth",
        plugins: ["Bell Synth", "Delay"],
        sends: [],
      },
    ],
    buses: [
      {
        id: "b1",
        name: "Vocal Delay",
        color: "bg-red-600",
        plugins: ["Ping-Pong Delay", "Filter"],
      },
      {
        id: "b2",
        name: "Drum Verb",
        color: "bg-orange-600",
        plugins: ["Short Reverb"],
      },
      {
        id: "b3",
        name: "Main Reverb",
        color: "bg-purple-600",
        plugins: ["Hall Reverb"],
      },
    ],
    masterPlugins: ["Soft Clipper", "EQ", "Multiband Compressor", "Limiter"],
    isBuiltIn: true,
    isFavorite: false,
    usageCount: 892,
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "rnb-soul",
    name: "R&B / Soul",
    description: "Warm, soulful setup with lush harmonies and smooth bass.",
    genre: "R&B",
    tempo: 85,
    timeSignature: "4/4",
    key: "Eb Major",
    tracks: [
      {
        id: "t1",
        name: "Lead Vocal",
        type: "audio",
        color: "bg-rose-500",
        icon: "vocals",
        plugins: ["Warm EQ", "Optical Compressor", "Plate Reverb"],
        sends: [],
      },
      {
        id: "t2",
        name: "Harmonies",
        type: "audio",
        color: "bg-rose-400",
        icon: "vocals",
        plugins: ["EQ", "Compressor"],
        sends: ["Harmony Verb"],
      },
      {
        id: "t3",
        name: "Drums",
        type: "midi",
        color: "bg-amber-500",
        icon: "drums",
        plugins: ["Acoustic Kit", "Tape Saturation"],
        sends: ["Drum Room"],
      },
      {
        id: "t4",
        name: "Bass",
        type: "midi",
        color: "bg-orange-600",
        icon: "bass",
        plugins: ["Electric Bass", "Tube Amp"],
        sends: [],
      },
      {
        id: "t5",
        name: "Electric Piano",
        type: "midi",
        color: "bg-cyan-500",
        icon: "keys",
        plugins: ["Rhodes", "Tremolo", "Tape Delay"],
        sends: [],
      },
      {
        id: "t6",
        name: "Strings",
        type: "midi",
        color: "bg-violet-500",
        icon: "synth",
        plugins: ["String Ensemble", "Hall Reverb"],
        sends: [],
      },
      {
        id: "t7",
        name: "Guitar",
        type: "audio",
        color: "bg-yellow-600",
        icon: "guitar",
        plugins: ["Amp Sim", "Chorus"],
        sends: ["Main Reverb"],
      },
    ],
    buses: [
      {
        id: "b1",
        name: "Harmony Verb",
        color: "bg-rose-600",
        plugins: ["Chamber Reverb"],
      },
      {
        id: "b2",
        name: "Drum Room",
        color: "bg-amber-600",
        plugins: ["Room Reverb"],
      },
      {
        id: "b3",
        name: "Main Reverb",
        color: "bg-violet-600",
        plugins: ["Plate Reverb"],
      },
    ],
    masterPlugins: [
      "Analog EQ",
      "Bus Compressor",
      "Tape Saturation",
      "Limiter",
    ],
    isBuiltIn: true,
    isFavorite: false,
    usageCount: 634,
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "electronic-edm",
    name: "Electronic / EDM",
    description: "High-energy electronic production with drops and builds.",
    genre: "Electronic",
    tempo: 128,
    timeSignature: "4/4",
    key: "A Minor",
    tracks: [
      {
        id: "t1",
        name: "Vocals",
        type: "audio",
        color: "bg-pink-500",
        icon: "vocals",
        plugins: ["Vocoder", "Sidechain", "Delay"],
        sends: ["Vocal FX"],
      },
      {
        id: "t2",
        name: "Kick",
        type: "midi",
        color: "bg-red-500",
        icon: "drums",
        plugins: ["Kick Synth", "Transient"],
        sends: [],
      },
      {
        id: "t3",
        name: "Claps & Snares",
        type: "midi",
        color: "bg-orange-500",
        icon: "drums",
        plugins: ["Sampler", "Reverb"],
        sends: [],
      },
      {
        id: "t4",
        name: "Hi-Hats",
        type: "midi",
        color: "bg-yellow-500",
        icon: "drums",
        plugins: ["Sampler"],
        sends: [],
      },
      {
        id: "t5",
        name: "Bass",
        type: "midi",
        color: "bg-purple-500",
        icon: "bass",
        plugins: ["Serum", "OTT", "Sausage Fattener"],
        sends: [],
      },
      {
        id: "t6",
        name: "Lead",
        type: "midi",
        color: "bg-cyan-500",
        icon: "synth",
        plugins: ["Sylenth", "Delay", "Reverb"],
        sends: ["Main Verb"],
      },
      {
        id: "t7",
        name: "Pads",
        type: "midi",
        color: "bg-blue-500",
        icon: "synth",
        plugins: ["Pad Synth", "Filter", "Reverb"],
        sends: [],
      },
      {
        id: "t8",
        name: "FX",
        type: "audio",
        color: "bg-green-500",
        icon: "fx",
        plugins: ["Risers", "Impacts", "Sweeps"],
        sends: [],
      },
    ],
    buses: [
      {
        id: "b1",
        name: "Vocal FX",
        color: "bg-pink-600",
        plugins: ["Delay", "Reverb", "Filter"],
      },
      {
        id: "b2",
        name: "Main Verb",
        color: "bg-cyan-600",
        plugins: ["Big Reverb"],
      },
      {
        id: "b3",
        name: "Sidechain Bus",
        color: "bg-red-600",
        plugins: ["Compressor"],
      },
    ],
    masterPlugins: [
      "OTT",
      "EQ",
      "Multiband Compressor",
      "Limiter",
      "Stereo Widener",
    ],
    isBuiltIn: true,
    isFavorite: false,
    usageCount: 1089,
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "podcast-interview",
    name: "Podcast / Interview",
    description: "Clean voice recording setup for podcasts and interviews.",
    genre: "Podcast",
    tempo: 120,
    timeSignature: "4/4",
    key: "C Major",
    tracks: [
      {
        id: "t1",
        name: "Host",
        type: "audio",
        color: "bg-blue-500",
        icon: "vocals",
        plugins: ["Gate", "EQ", "Compressor", "De-Esser"],
        sends: [],
      },
      {
        id: "t2",
        name: "Guest 1",
        type: "audio",
        color: "bg-green-500",
        icon: "vocals",
        plugins: ["Gate", "EQ", "Compressor", "De-Esser"],
        sends: [],
      },
      {
        id: "t3",
        name: "Guest 2",
        type: "audio",
        color: "bg-purple-500",
        icon: "vocals",
        plugins: ["Gate", "EQ", "Compressor", "De-Esser"],
        sends: [],
      },
      {
        id: "t4",
        name: "Music Bed",
        type: "audio",
        color: "bg-amber-500",
        icon: "synth",
        plugins: ["EQ", "Compressor"],
        sends: [],
      },
      {
        id: "t5",
        name: "SFX",
        type: "audio",
        color: "bg-cyan-500",
        icon: "fx",
        plugins: [],
        sends: [],
      },
    ],
    buses: [],
    masterPlugins: ["EQ", "Compressor", "Limiter", "Loudness Meter"],
    isBuiltIn: true,
    isFavorite: false,
    usageCount: 445,
    createdAt: new Date("2024-01-01"),
  },
];

export function FlowStateTemplates({
  onApplyTemplate,
  onSaveAsTemplate,
  className,
}: FlowStateTemplatesProps) {
  const { toast } = useToast();
  const [templates, setTemplates] =
    useState<ProjectTemplate[]>(BUILT_IN_TEMPLATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [_activeTab, _setActiveTab] = useState("browse");

  const filteredTemplates = useMemo(() => {
    return templates
      .filter((t) => {
        const matchesSearch =
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesGenre =
          selectedGenre === "All" || t.genre === selectedGenre;
        return matchesSearch && matchesGenre;
      })
      .sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return b.usageCount - a.usageCount;
      });
  }, [templates, searchQuery, selectedGenre]);

  const toggleFavorite = (templateId: string) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === templateId ? { ...t, isFavorite: !t.isFavorite } : t,
      ),
    );
  };

  const applyTemplate = (template: ProjectTemplate) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === template.id ? { ...t, usageCount: t.usageCount + 1 } : t,
      ),
    );
    onApplyTemplate?.(template);
    toast({
      title: "Template applied",
      description: `"${template.name}" loaded with ${template.tracks.length} tracks`,
    });
  };

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate);

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-lg">
            <Folder className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-semibold">Project Templates</h2>
            <p className="text-xs text-zinc-500">
              Genre-specific setups with routing
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={onSaveAsTemplate}>
          <Plus className="w-4 h-4 mr-2" />
          Save Current as Template
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Template List */}
        <div className="w-80 border-r border-zinc-800 flex flex-col">
          {/* Search & Filter */}
          <div className="p-3 border-b border-zinc-800 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-zinc-900 border-zinc-700"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {GENRES.map((genre) => (
                <Badge
                  key={genre}
                  variant={selectedGenre === genre ? "default" : "secondary"}
                  className="cursor-pointer"
                  onClick={() => setSelectedGenre(genre)}
                >
                  {genre}
                </Badge>
              ))}
            </div>
          </div>

          {/* Template List */}
          <div className="flex-1 overflow-auto p-2">
            <AnimatePresence>
              {filteredTemplates.map((template, idx) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <Card
                    className={cn(
                      "mb-2 p-3 cursor-pointer transition-all bg-zinc-900 border-zinc-800",
                      selectedTemplate === template.id &&
                        "border-emerald-500/50 bg-emerald-500/5",
                    )}
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium truncate">
                            {template.name}
                          </h3>
                          {template.isFavorite && (
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {template.genre}
                          </Badge>
                          <span className="text-xs text-zinc-500">
                            {template.tempo} BPM
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className={cn(
                          "w-4 h-4 text-zinc-500 transition-transform shrink-0",
                          selectedTemplate === template.id && "rotate-90",
                        )}
                      />
                    </div>
                    <p className="text-xs text-zinc-500 mt-2 line-clamp-2">
                      {template.description}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800">
                      <span className="text-xs text-zinc-600">
                        {template.tracks.length} tracks •{" "}
                        {template.buses.length} buses
                      </span>
                      <span className="text-xs text-zinc-600">
                        Used {template.usageCount}x
                      </span>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Panel - Template Details */}
        <div className="flex-1 overflow-auto">
          {selectedTemplateData ? (
            <div className="p-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold">
                    {selectedTemplateData.name}
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    {selectedTemplateData.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleFavorite(selectedTemplateData.id)}
                  >
                    {selectedTemplateData.isFavorite ? (
                      <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    ) : (
                      <StarOff className="w-5 h-5" />
                    )}
                  </Button>
                  <Button
                    className="bg-emerald-500 hover:bg-emerald-600"
                    onClick={() => applyTemplate(selectedTemplateData)}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Use Template
                  </Button>
                </div>
              </div>

              {/* Template Info */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <Card className="bg-zinc-900 border-zinc-800 p-3">
                  <span className="text-xs text-zinc-500">Tempo</span>
                  <p className="font-mono text-lg">
                    {selectedTemplateData.tempo} BPM
                  </p>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800 p-3">
                  <span className="text-xs text-zinc-500">Key</span>
                  <p className="font-mono text-lg">
                    {selectedTemplateData.key}
                  </p>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800 p-3">
                  <span className="text-xs text-zinc-500">Time Sig</span>
                  <p className="font-mono text-lg">
                    {selectedTemplateData.timeSignature}
                  </p>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800 p-3">
                  <span className="text-xs text-zinc-500">Genre</span>
                  <p className="font-mono text-lg">
                    {selectedTemplateData.genre}
                  </p>
                </Card>
              </div>

              {/* Tracks */}
              <div className="mb-6">
                <h4 className="font-medium mb-3">
                  Tracks ({selectedTemplateData.tracks.length})
                </h4>
                <div className="space-y-2">
                  {selectedTemplateData.tracks.map((track) => (
                    <Card
                      key={track.id}
                      className="bg-zinc-900 border-zinc-800 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-8 h-8 rounded flex items-center justify-center",
                            track.color,
                          )}
                        >
                          {TRACK_ICONS[track.icon]}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{track.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {track.type}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {track.plugins.map((plugin, idx) => (
                              <span key={idx} className="text-xs text-zinc-500">
                                {plugin}
                                {idx < track.plugins.length - 1 ? " → " : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                        {track.sends.length > 0 && (
                          <div className="text-xs text-zinc-500">
                            → {track.sends.join(", ")}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Buses */}
              {selectedTemplateData.buses.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium mb-3">
                    Buses ({selectedTemplateData.buses.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedTemplateData.buses.map((bus) => (
                      <Card
                        key={bus.id}
                        className="bg-zinc-900 border-zinc-800 p-3"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className={cn("w-3 h-3 rounded-full", bus.color)}
                          />
                          <span className="font-medium text-sm">
                            {bus.name}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500">
                          {bus.plugins.join(" → ")}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Master Chain */}
              <div>
                <h4 className="font-medium mb-3">Master Chain</h4>
                <Card className="bg-zinc-900 border-zinc-800 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedTemplateData.masterPlugins.map((plugin, idx) => (
                      <span key={idx} className="flex items-center gap-2">
                        <Badge variant="secondary">{plugin}</Badge>
                        {idx <
                          selectedTemplateData.masterPlugins.length - 1 && (
                          <ChevronRight className="w-3 h-3 text-zinc-500" />
                        )}
                      </span>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <Folder className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">Select a Template</p>
              <p className="text-sm mt-1">
                Choose from {templates.length} project templates
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowStateTemplates;
