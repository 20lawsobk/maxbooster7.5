import { useState, useMemo, useEffect } from "react";
import { FolderOpen, Search, Play, Pause, Heart, Music, Drum, Piano, Guitar, Volume2, Grid, List, ChevronRight, ChevronDown, Plus, Wand2, Waveform } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Sample {
  id: string;
  name: string;
  path: string;
  category: string;
  subcategory: string;
  duration: number;
  bpm?: number;
  key?: string;
  tags: string[];
  isFavorite: boolean;
  waveform: number[];
  size: number;
}

interface Folder {
  id: string;
  name: string;
  icon: React.ReactNode;
  count: number;
  children?: Folder[];
}

interface FlowStateSampleBrowserProps {
  onInsertSample?: (sample: Sample) => void;
  onPreviewSample?: (sample: Sample) => void;
  className?: string;
}

const generateWaveform = (): number[] => {
  return Array.from({ length: 50 }, () => 0.2 + Math.random() * 0.6);
};

const SAMPLE_LIBRARY: Sample[] = [
  {
    id: "s1",
    name: "Punchy Kick 01",
    path: "/drums/kicks",
    category: "Drums",
    subcategory: "Kicks",
    duration: 0.5,
    tags: ["punchy", "electronic"],
    isFavorite: true,
    waveform: generateWaveform(),
    size: 45000,
  },
  {
    id: "s2",
    name: "Deep Kick 808",
    path: "/drums/kicks",
    category: "Drums",
    subcategory: "Kicks",
    duration: 0.8,
    tags: ["808", "hip-hop", "deep"],
    isFavorite: false,
    waveform: generateWaveform(),
    size: 72000,
  },
  {
    id: "s3",
    name: "Crisp Snare",
    path: "/drums/snares",
    category: "Drums",
    subcategory: "Snares",
    duration: 0.3,
    tags: ["crisp", "pop"],
    isFavorite: true,
    waveform: generateWaveform(),
    size: 38000,
  },
  {
    id: "s4",
    name: "Trap Hi-Hat Loop",
    path: "/drums/hats",
    category: "Drums",
    subcategory: "Hi-Hats",
    duration: 2.0,
    bpm: 140,
    tags: ["trap", "loop"],
    isFavorite: false,
    waveform: generateWaveform(),
    size: 156000,
  },
  {
    id: "s5",
    name: "Rhodes Chord Cm7",
    path: "/keys/rhodes",
    category: "Keys",
    subcategory: "Rhodes",
    duration: 3.0,
    key: "Cm",
    tags: ["chord", "jazzy"],
    isFavorite: true,
    waveform: generateWaveform(),
    size: 234000,
  },
  {
    id: "s6",
    name: "Piano Stab F#",
    path: "/keys/piano",
    category: "Keys",
    subcategory: "Piano",
    duration: 1.5,
    key: "F#",
    tags: ["stab", "house"],
    isFavorite: false,
    waveform: generateWaveform(),
    size: 98000,
  },
  {
    id: "s7",
    name: "Analog Bass G",
    path: "/bass/analog",
    category: "Bass",
    subcategory: "Analog",
    duration: 1.0,
    key: "G",
    tags: ["analog", "warm"],
    isFavorite: false,
    waveform: generateWaveform(),
    size: 67000,
  },
  {
    id: "s8",
    name: "Sub Bass Drop",
    path: "/bass/sub",
    category: "Bass",
    subcategory: "Sub",
    duration: 2.0,
    tags: ["sub", "drop", "dubstep"],
    isFavorite: true,
    waveform: generateWaveform(),
    size: 189000,
  },
  {
    id: "s9",
    name: "Vocal Chop Female",
    path: "/vocals/chops",
    category: "Vocals",
    subcategory: "Chops",
    duration: 0.5,
    key: "A",
    tags: ["female", "chop"],
    isFavorite: false,
    waveform: generateWaveform(),
    size: 42000,
  },
  {
    id: "s10",
    name: "Vocal Ad-lib Yeah",
    path: "/vocals/adlibs",
    category: "Vocals",
    subcategory: "Ad-libs",
    duration: 0.8,
    tags: ["adlib", "hype"],
    isFavorite: false,
    waveform: generateWaveform(),
    size: 56000,
  },
  {
    id: "s11",
    name: "Guitar Riff Am",
    path: "/guitars/electric",
    category: "Guitars",
    subcategory: "Electric",
    duration: 4.0,
    bpm: 120,
    key: "Am",
    tags: ["riff", "rock"],
    isFavorite: true,
    waveform: generateWaveform(),
    size: 312000,
  },
  {
    id: "s12",
    name: "Synth Lead Saw",
    path: "/synths/leads",
    category: "Synths",
    subcategory: "Leads",
    duration: 2.0,
    tags: ["saw", "bright"],
    isFavorite: false,
    waveform: generateWaveform(),
    size: 178000,
  },
  {
    id: "s13",
    name: "Pad Atmospheric",
    path: "/synths/pads",
    category: "Synths",
    subcategory: "Pads",
    duration: 8.0,
    key: "D",
    tags: ["atmospheric", "ambient"],
    isFavorite: true,
    waveform: generateWaveform(),
    size: 567000,
  },
  {
    id: "s14",
    name: "FX Riser White Noise",
    path: "/fx/risers",
    category: "FX",
    subcategory: "Risers",
    duration: 4.0,
    tags: ["riser", "tension"],
    isFavorite: false,
    waveform: generateWaveform(),
    size: 289000,
  },
  {
    id: "s15",
    name: "FX Impact",
    path: "/fx/impacts",
    category: "FX",
    subcategory: "Impacts",
    duration: 1.5,
    tags: ["impact", "cinematic"],
    isFavorite: false,
    waveform: generateWaveform(),
    size: 134000,
  },
];

const FOLDERS: Folder[] = [
  {
    id: "f1",
    name: "Drums",
    icon: Drum,
    count: 4,
    children: [
      { id: "f1a", name: "Kicks", icon: Drum, count: 2 },
      { id: "f1b", name: "Snares", icon: Drum, count: 1 },
      { id: "f1c", name: "Hi-Hats", icon: Drum, count: 1 },
    ],
  },
  {
    id: "f2",
    name: "Keys",
    icon: Piano,
    count: 2,
    children: [
      { id: "f2a", name: "Rhodes", icon: Piano, count: 1 },
      { id: "f2b", name: "Piano", icon: Piano, count: 1 },
    ],
  },
  { id: "f3", name: "Bass", icon: Music, count: 2 },
  { id: "f4", name: "Vocals", icon: Volume2, count: 2 },
  { id: "f5", name: "Guitars", icon: Guitar, count: 1 },
  { id: "f6", name: "Synths", icon: Waveform, count: 2 },
  { id: "f7", name: "FX", icon: Waveform, count: 2 },
];

export function FlowStateSampleBrowser({
  onInsertSample,
  onPreviewSample,
  className,
}: FlowStateSampleBrowserProps) {
  const { toast } = useToast();

  const [localSamples, setLocalSamples] = useState<Sample[]>(SAMPLE_LIBRARY);
  const [_apiDataLoaded, setApiDataLoaded] = useState(false);

  const {
    data: apiSamples,
    
    error: samplesError,
  } = useQuery({
    queryKey: ["studio-samples"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/studio/samples");
      return response.json();
    },
    staleTime: 60000,
  });

  useEffect(() => {
    if (samplesError) {
      toast({
        title: "Failed to load samples, using demo library",
        variant: "destructive",
      });
    }
  }, [samplesError, toast]);

  useEffect(() => {
    if (apiSamples && !samplesError) {
      setApiDataLoaded(true);
      if (apiSamples.samples?.length > 0) {
        const mappedSamples = apiSamples.samples.map(
          (s: Record<string, unknown>) => ({
            id: s.id,
            name: s.name || s.fileName,
            path: s.filePath || s.path,
            category: s.category || "Uncategorized",
            subcategory: s.subcategory || "",
            duration: s.duration || 1,
            bpm: s.bpm,
            key: s.key,
            tags: s.tags || [],
            isFavorite: s.isFavorite || false,
            waveform: s.waveform || generateWaveform(),
            size: s.size || 0,
          }),
        );
        setLocalSamples(mappedSamples);
      } else {
        setLocalSamples([]);
      }
    }
  }, [apiSamples, samplesError]);

  const samples = localSamples;
  const setSamples = setLocalSamples;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    null,
  );
  const [previewingSample, setPreviewingSample] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sortBy, setSortBy] = useState("name");
  const [filterKey, setFilterKey] = useState<string>("all");
  const [expandedFolders, setExpandedFolders] = useState<string[]>(["f1"]);
  const [previewVolume, setPreviewVolume] = useState([0.8]);

  const filteredSamples = useMemo(() => {
    return samples
      .filter((s) => {
        if (
          searchQuery &&
          !s.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !s.tags.some((t) =>
            t.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        ) {
          return false;
        }
        if (selectedCategory && s.category !== selectedCategory) return false;
        if (selectedSubcategory && s.subcategory !== selectedSubcategory)
          return false;
        if (filterKey !== "all" && s.key !== filterKey) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "duration") return a.duration - b.duration;
        if (sortBy === "size") return a.size - b.size;
        if (sortBy === "favorites")
          return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
        return 0;
      });
  }, [
    samples,
    searchQuery,
    selectedCategory,
    selectedSubcategory,
    filterKey,
    sortBy,
  ]);

  const toggleFavorite = (sampleId: string) => {
    setSamples((prev) =>
      prev.map((s) =>
        s.id === sampleId ? { ...s, isFavorite: !s.isFavorite } : s,
      ),
    );
  };

  const previewSample = (sample: Sample) => {
    if (previewingSample === sample.id && isPlaying) {
      setIsPlaying(false);
      setPreviewingSample(null);
    } else {
      setPreviewingSample(sample.id);
      setIsPlaying(true);
      onPreviewSample?.(sample);

      setTimeout(() => {
        if (previewingSample === sample.id) {
          setIsPlaying(false);
          setPreviewingSample(null);
        }
      }, sample.duration * 1000);
    }
  };

  const insertSample = (sample: Sample) => {
    onInsertSample?.(sample);
    toast({ title: "Sample inserted", description: sample.name });
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) =>
      prev.includes(folderId)
        ? prev.filter((id) => id !== folderId)
        : [...prev, folderId],
    );
  };

  const selectFolder = (category: string, subcategory?: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory(subcategory || null);
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    return `${seconds.toFixed(1)}s`;
  };

  ((bytes: number): string => {
    if (bytes < 1000) return `${bytes}B`;
    if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)}KB`;
    return `${(bytes / 1000000).toFixed(1)}MB`;
  });

  const favoriteCount = samples.filter((s) => s.isFavorite).length;

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-teal-500/20 to-cyan-500/20 rounded-lg">
            <FolderOpen className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 className="font-semibold">Sample Browser</h2>
            <p className="text-xs text-zinc-500">
              {samples.length} samples • {favoriteCount} favorites
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant={viewMode === "list" ? "default" : "ghost"}
            className="h-8 w-8"
            onClick={() => setViewMode("list")}
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant={viewMode === "grid" ? "default" : "ghost"}
            className="h-8 w-8"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Folder Tree */}
        <div className="w-56 border-r border-zinc-800 overflow-auto">
          <div className="p-2">
            <Button
              variant={!selectedCategory ? "secondary" : "ghost"}
              className="w-full justify-start mb-1"
              onClick={() => {
                setSelectedCategory(null);
                setSelectedSubcategory(null);
              }}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              All Samples
              <Badge variant="secondary" className="ml-auto text-xs">
                {samples.length}
              </Badge>
            </Button>
            <Button
              variant={selectedCategory === "favorites" ? "secondary" : "ghost"}
              className="w-full justify-start mb-2"
              onClick={() => {
                setSelectedCategory("favorites");
                setSelectedSubcategory(null);
              }}
            >
              <Heart className="w-4 h-4 mr-2 text-red-400" />
              Favorites
              <Badge variant="secondary" className="ml-auto text-xs">
                {favoriteCount}
              </Badge>
            </Button>

            <div className="border-t border-zinc-800 pt-2 space-y-0.5">
              {FOLDERS.map((folder) => (
                <div key={folder.id}>
                  <Button
                    variant={
                      selectedCategory === folder.name && !selectedSubcategory
                        ? "secondary"
                        : "ghost"
                    }
                    className="w-full justify-start"
                    onClick={() => {
                      if (folder.children) {
                        toggleFolder(folder.id);
                      }
                      selectFolder(folder.name);
                    }}
                  >
                    {folder.children &&
                      (expandedFolders.includes(folder.id) ? (
                        <ChevronDown className="w-3 h-3 mr-1" />
                      ) : (
                        <ChevronRight className="w-3 h-3 mr-1" />
                      ))}
                    <folder.icon className="w-4 h-4 mr-2" />
                    {folder.name}
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {folder.count}
                    </Badge>
                  </Button>

                  {folder.children && expandedFolders.includes(folder.id) && (
                    <div className="ml-4 space-y-0.5">
                      {folder.children.map((child) => (
                        <Button
                          key={child.id}
                          variant={
                            selectedSubcategory === child.name
                              ? "secondary"
                              : "ghost"
                          }
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => selectFolder(folder.name, child.name)}
                        >
                          <child.icon className="w-3 h-3 mr-2" />
                          {child.name}
                          <Badge
                            variant="secondary"
                            className="ml-auto text-xs"
                          >
                            {child.count}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search & Filters */}
          <div className="p-3 border-b border-zinc-800 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search samples..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-zinc-900 border-zinc-700"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32 h-8 bg-zinc-900 border-zinc-700 text-xs">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="duration">Duration</SelectItem>
                  <SelectItem value="size">Size</SelectItem>
                  <SelectItem value="favorites">Favorites</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterKey} onValueChange={setFilterKey}>
                <SelectTrigger className="w-24 h-8 bg-zinc-900 border-zinc-700 text-xs">
                  <SelectValue placeholder="Key" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Keys</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                  <SelectItem value="D">D</SelectItem>
                  <SelectItem value="E">E</SelectItem>
                  <SelectItem value="F">F</SelectItem>
                  <SelectItem value="G">G</SelectItem>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-zinc-500 ml-auto">
                {filteredSamples.length} samples
              </span>
            </div>
          </div>

          {/* Sample List */}
          <ScrollArea className="flex-1">
            {filteredSamples.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-zinc-500">
                {samples.length === 0 ? (
                  <>
                    <Wand2 className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm font-medium text-zinc-400">
                      No samples yet
                    </p>
                    <p className="text-xs mt-1">
                      Generate audio in the AI Music Generator to build your
                      library
                    </p>
                  </>
                ) : (
                  <>
                    <Search className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm font-medium text-zinc-400">
                      No results
                    </p>
                    <p className="text-xs mt-1">
                      Try a different search term or filter
                    </p>
                  </>
                )}
              </div>
            )}
            {viewMode === "list" ? (
              <div className="p-2 space-y-1">
                {filteredSamples.map((sample) => (
                  <Card
                    key={sample.id}
                    className={cn(
                      "bg-zinc-900 border-zinc-800 p-2 cursor-pointer hover:bg-zinc-800/50 transition-colors",
                      previewingSample === sample.id &&
                        "border-teal-500/50 bg-teal-500/5",
                    )}
                    onClick={() => previewSample(sample)}
                    onDoubleClick={() => insertSample(sample)}
                  >
                    <div className="flex items-center gap-3">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          previewSample(sample);
                        }}
                      >
                        {previewingSample === sample.id && isPlaying ? (
                          <Pause className="w-4 h-4 text-teal-400" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>

                      {/* Mini Waveform */}
                      <div className="w-20 h-6 bg-zinc-950 rounded flex items-center px-0.5 shrink-0">
                        {sample.waveform.slice(0, 25).map((v, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 mx-px rounded-sm",
                              previewingSample === sample.id
                                ? "bg-teal-400"
                                : "bg-teal-600",
                            )}
                            style={{ height: `${v * 100}%` }}
                          />
                        ))}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {sample.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span>{sample.category}</span>
                          <span>•</span>
                          <span>{formatDuration(sample.duration)}</span>
                          {sample.bpm && (
                            <>
                              <span>•</span>
                              <span>{sample.bpm} BPM</span>
                            </>
                          )}
                          {sample.key && (
                            <>
                              <span>•</span>
                              <span>{sample.key}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {sample.tags.slice(0, 2).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          "h-7 w-7",
                          sample.isFavorite && "text-red-400",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(sample.id);
                        }}
                      >
                        {sample.isFavorite ? (
                          <Heart className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Heart className="w-3.5 h-3.5" />
                        )}
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          insertSample(sample);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="p-3 grid grid-cols-3 gap-2">
                {filteredSamples.map((sample) => (
                  <Card
                    key={sample.id}
                    className={cn(
                      "bg-zinc-900 border-zinc-800 p-3 cursor-pointer hover:bg-zinc-800/50 transition-colors",
                      previewingSample === sample.id &&
                        "border-teal-500/50 bg-teal-500/5",
                    )}
                    onClick={() => previewSample(sample)}
                    onDoubleClick={() => insertSample(sample)}
                  >
                    {/* Waveform */}
                    <div className="h-12 bg-zinc-950 rounded flex items-center px-1 mb-2">
                      {sample.waveform.map((v, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex-1 mx-px rounded-sm",
                            previewingSample === sample.id
                              ? "bg-teal-400"
                              : "bg-teal-600",
                          )}
                          style={{ height: `${v * 100}%` }}
                        />
                      ))}
                    </div>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {sample.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {formatDuration(sample.duration)}
                          {sample.key && ` • ${sample.key}`}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          "h-6 w-6 shrink-0",
                          sample.isFavorite && "text-red-400",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(sample.id);
                        }}
                      >
                        <Heart
                          className={cn(
                            "w-3 h-3",
                            sample.isFavorite && "fill-current",
                          )}
                        />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Preview Controls */}
          <div className="border-t border-zinc-800 p-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-zinc-500" />
                <Slider
                  value={previewVolume}
                  onValueChange={setPreviewVolume}
                  min={0}
                  max={1}
                  step={0.01}
                  className="w-24"
                />
              </div>
              <p className="text-xs text-zinc-500">
                Double-click to insert • Click to preview
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowStateSampleBrowser;
