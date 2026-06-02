import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Save,
  Bookmark,
  Music,
  Zap,
  Hash,
  DollarSign,
  Sparkles,
  Check,
  Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const GENRES = [
  "Hip-Hop",
  "Trap",
  "R&B",
  "Pop",
  "Rock",
  "Electronic",
  "Jazz",
  "Blues",
  "Country",
  "Reggae",
  "Lo-Fi",
  "Drill",
  "Ambient",
  "Indie",
  "Punk",
  "Metal",
  "Funk",
  "Soul",
  "Gospel",
  "World",
  "Latin",
  "Afrobeats",
  "House",
  "Techno",
];

const MOODS = [
  "Aggressive",
  "Chill",
  "Dark",
  "Happy",
  "Sad",
  "Energetic",
  "Relaxed",
  "Romantic",
  "Mysterious",
  "Uplifting",
  "Melancholic",
  "Confident",
  "Nostalgic",
  "Futuristic",
  "Vintage",
  "Modern",
  "Dreamy",
  "Intense",
];

const MUSICAL_KEYS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
  "Cm",
  "C#m",
  "Dm",
  "D#m",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "A#m",
  "Bm",
];

const SORT_OPTIONS = [
  { value: "relevance", label: "Most Relevant" },
  { value: "newest", label: "Newest First" },
  { value: "popular", label: "Most Popular" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "price_high", label: "Price: High to Low" },
];

interface SearchFilters {
  genre?: string;
  mood?: string;
  key?: string;
  bpm_min?: number;
  bpm_max?: number;
  price_min?: number;
  price_max?: number;
  sort?: string;
  hasStems?: boolean;
  exclusive_only?: boolean;
}

interface FilterPreset {
  id: string;
  name: string;
  filters: SearchFilters;
  isDefault?: boolean;
}

interface SearchFiltersProps {
  filters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
  onApply?: () => void;
  onReset?: () => void;
  showPresets?: boolean;
  compact?: boolean;
  className?: string;
}

export function SearchFilters({
  filters,
  onFilterChange,
  onApply,
  onReset,
  showPresets = true,
  compact = false,
  className,
}: SearchFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: presetsData } = useQuery({
    queryKey: ["/api/search/filter-presets"],
    queryFn: async () => {
      const res = await fetch("/api/search/filter-presets", {
        credentials: "include",
      });
      if (!res.ok) return { presets: [] };
      return res.json();
    },
    enabled: showPresets,
  });

  const savePresetMutation = useMutation({
    mutationFn: async (preset: { name: string; filters: SearchFilters }) => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/search/filter-presets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(preset),
      });
      if (!res.ok) throw new Error("Failed to save preset");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/search/filter-presets"],
      });
      setShowSaveDialog(false);
      setPresetName("");
      toast({
        title: "Preset Saved",
        description: "Your filter preset has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save filter preset.",
        variant: "destructive",
      });
    },
  });

  const updateFilter = (
    key: keyof SearchFilters,
    value: Record<string, unknown>,
  ) => {
    const newFilters = { ...filters, [key]: value };
    onFilterChange(newFilters);
  };

  const handleReset = () => {
    onFilterChange({});
    onReset?.();
    toast({
      title: "Filters Reset",
      description: "All filters have been cleared.",
    });
  };

  const applyPreset = (preset: FilterPreset) => {
    onFilterChange(preset.filters);
    toast({
      title: "Preset Applied",
      description: `"${preset.name}" filters applied.`,
    });
  };

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== undefined && value !== "" && value !== false,
  ).length;

  const presets: FilterPreset[] = presetsData?.presets || [];

  const hasConflict = (
    key: string,
    value: Record<string, unknown>,
  ): string | null => {
    if (key === "exclusive_only" && value && filters.hasStems) {
      return "Exclusive beats may not include stems";
    }
    if (key === "bpm_min" && filters.bpm_max && value > filters.bpm_max) {
      return "Min BPM cannot exceed max BPM";
    }
    if (key === "price_min" && filters.price_max && value > filters.price_max) {
      return "Min price cannot exceed max price";
    }
    return null;
  };

  return (
    <Card className={cn("bg-slate-800/50 border-slate-700", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5 text-purple-400" />
            Filters
            {activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="bg-purple-500/20 text-purple-300 ml-2"
              >
                {activeFilterCount} active
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-slate-400 hover:text-white"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
            {compact && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8 w-8"
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <Collapsible open={isExpanded}>
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            {showPresets && presets.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-slate-300 flex items-center gap-2">
                  <Bookmark className="h-4 w-4" />
                  Quick Presets
                </Label>
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <Button
                      key={preset.id}
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(preset)}
                      className={cn(
                        "border-slate-600 text-slate-300 hover:bg-slate-700",
                        preset.isDefault && "border-purple-500/50",
                      )}
                    >
                      {preset.isDefault && (
                        <Star className="h-3 w-3 mr-1 text-yellow-400" />
                      )}
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm text-slate-300 flex items-center gap-2">
                <Music className="h-4 w-4" />
                Genre
              </Label>
              <Select
                value={filters.genre || "_all"}
                onValueChange={(v) =>
                  updateFilter("genre", v === "_all" ? undefined : v)
                }
              >
                <SelectTrigger className="bg-slate-700/50 border-slate-600">
                  <SelectValue placeholder="All Genres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Genres</SelectItem>
                  {GENRES.map((genre) => (
                    <SelectItem key={genre} value={genre}>
                      {genre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-slate-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Mood
              </Label>
              <Select
                value={filters.mood || "_all"}
                onValueChange={(v) =>
                  updateFilter("mood", v === "_all" ? undefined : v)
                }
              >
                <SelectTrigger className="bg-slate-700/50 border-slate-600">
                  <SelectValue placeholder="All Moods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Moods</SelectItem>
                  {MOODS.map((mood) => (
                    <SelectItem key={mood} value={mood}>
                      {mood}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-slate-300 flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Key
              </Label>
              <Select
                value={filters.key || "_all"}
                onValueChange={(v) =>
                  updateFilter("key", v === "_all" ? undefined : v)
                }
              >
                <SelectTrigger className="bg-slate-700/50 border-slate-600">
                  <SelectValue placeholder="All Keys" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Keys</SelectItem>
                  {MUSICAL_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-slate-300 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                BPM Range: {filters.bpm_min || 60} - {filters.bpm_max || 200}
              </Label>
              <Slider
                value={[filters.bpm_min || 60, filters.bpm_max || 200]}
                min={60}
                max={200}
                step={5}
                onValueChange={([min, max]) => {
                  updateFilter("bpm_min", min === 60 ? undefined : min);
                  updateFilter("bpm_max", max === 200 ? undefined : max);
                }}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>60 BPM</span>
                <span>200 BPM</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-slate-300 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Price Range: ${filters.price_min || 0} - $
                {filters.price_max || 1000}+
              </Label>
              <Slider
                value={[filters.price_min || 0, filters.price_max || 1000]}
                min={0}
                max={1000}
                step={10}
                onValueChange={([min, max]) => {
                  updateFilter("price_min", min === 0 ? undefined : min);
                  updateFilter("price_max", max === 1000 ? undefined : max);
                }}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>$0</span>
                <span>$1000+</span>
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-700">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-300">Include Stems</Label>
                <Switch
                  checked={filters.hasStems || false}
                  onCheckedChange={(checked) =>
                    updateFilter("hasStems", checked || undefined)
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-300">Exclusive Only</Label>
                <Switch
                  checked={filters.exclusive_only || false}
                  onCheckedChange={(checked) =>
                    updateFilter("exclusive_only", checked || undefined)
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-slate-300">Sort By</Label>
              <Select
                value={filters.sort || "relevance"}
                onValueChange={(v) => updateFilter("sort", v)}
              >
                <SelectTrigger className="bg-slate-700/50 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeFilterCount > 0 && (
              <div className="pt-2 border-t border-slate-700">
                <Label className="text-sm text-slate-300 mb-2 block">
                  Active Filters
                </Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(filters)
                    .filter(
                      ([_, v]) => v !== undefined && v !== "" && v !== false,
                    )
                    .map(([key, value]) => (
                      <Badge
                        key={key}
                        variant="secondary"
                        className="bg-purple-500/20 text-purple-300 cursor-pointer hover:bg-purple-500/30"
                        onClick={() =>
                          updateFilter(key as keyof SearchFilters, undefined)
                        }
                      >
                        {key}: {String(value)}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {onApply && (
                <Button
                  onClick={onApply}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Apply Filters
                </Button>
              )}
              {activeFilterCount > 0 && showPresets && (
                <Button
                  variant="outline"
                  onClick={() => setShowSaveDialog(true)}
                  className="border-slate-600"
                >
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle>Save Filter Preset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Preset Name</Label>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g., My Trap Search"
                className="bg-slate-800 border-slate-600"
              />
            </div>
            <div className="text-sm text-slate-400">
              This will save your current {activeFilterCount} filter
              {activeFilterCount !== 1 ? "s" : ""}.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                savePresetMutation.mutate({ name: presetName, filters })
              }
              disabled={!presetName.trim() || savePresetMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function ActiveFiltersBar({
  filters,
  onFilterChange,
  onReset,
}: {
  filters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
  onReset: () => void;
}) {
  const activeFilters = Object.entries(filters).filter(
    ([_, v]) => v !== undefined && v !== "" && v !== false,
  );

  if (activeFilters.length === 0) return null;

  const removeFilter = (key: string) => {
    const newFilters = { ...filters };
    delete newFilters[key as keyof SearchFilters];
    onFilterChange(newFilters);
  };

  const formatValue = (key: string, value: Record<string, unknown>): string => {
    if (key.includes("price")) return `$${value}`;
    if (key.includes("bpm")) return `${value} BPM`;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };

  const formatLabel = (key: string): string => {
    return key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap py-2">
      <span className="text-sm text-slate-400 mr-2">Active filters:</span>
      {activeFilters.map(([key, value]) => (
        <Badge
          key={key}
          variant="secondary"
          className="bg-purple-500/20 text-purple-300 cursor-pointer hover:bg-red-500/20 hover:text-red-300 transition-colors"
          onClick={() => removeFilter(key)}
        >
          {formatLabel(key)}: {formatValue(key, value)}
          <X className="h-3 w-3 ml-1" />
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        className="text-slate-400 hover:text-white h-6"
      >
        Clear all
      </Button>
    </div>
  );
}

export default SearchFilters;
