import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Search,
  Filter,
  X,
  Music,
  Zap,
  Hash,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';

const GENRES = [
  'Hip-Hop', 'Trap', 'R&B', 'Pop', 'Rock', 'Electronic', 'Jazz', 'Blues',
  'Country', 'Reggae', 'Folk', 'Alternative', 'Indie', 'Punk', 'Metal',
  'Funk', 'Soul', 'Gospel', 'World', 'Latin', 'Ambient', 'Drill', 'Lo-Fi',
];

const MOODS = [
  'Aggressive', 'Chill', 'Dark', 'Happy', 'Sad', 'Energetic', 'Relaxed',
  'Romantic', 'Mysterious', 'Uplifting', 'Melancholic', 'Confident',
  'Nostalgic', 'Futuristic', 'Vintage', 'Modern', 'Dreamy', 'Intense',
];

const MUSICAL_KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm',
];

const POPULAR_TAGS = [
  'drake type', 'travis scott', 'juice wrld', 'piano', 'guitar', 'hard', 'melodic',
  'bouncy', '808', 'sample', 'vocal', 'dark', 'emotional', 'club', 'radio ready',
];

interface SearchFilters {
  query: string;
  genre: string;
  mood: string;
  key: string;
  bpmMin: number;
  bpmMax: number;
  priceMin: number;
  priceMax: number;
  tags: string[];
  sortBy: string;
}

interface AdvancedBeatSearchProps {
  onSearch: (filters: SearchFilters) => void;
  initialFilters?: Partial<SearchFilters>;
}

export function AdvancedBeatSearch({ onSearch, initialFilters = {} }: AdvancedBeatSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    genre: '',
    mood: '',
    key: '',
    bpmMin: 60,
    bpmMax: 200,
    priceMin: 0,
    priceMax: 1000,
    tags: [],
    sortBy: 'newest',
    ...initialFilters,
  });
  const [tagInput, setTagInput] = useState('');

  const activeFilterCount = [
    filters.genre,
    filters.mood,
    filters.key,
    filters.bpmMin !== 60 || filters.bpmMax !== 200,
    filters.priceMin !== 0 || filters.priceMax !== 1000,
    filters.tags.length > 0,
  ].filter(Boolean).length;

  const handleSearch = () => {
    onSearch(filters);
  };

  const handleReset = () => {
    const resetFilters: SearchFilters = {
      query: '',
      genre: '',
      mood: '',
      key: '',
      bpmMin: 60,
      bpmMax: 200,
      priceMin: 0,
      priceMax: 1000,
      tags: [],
      sortBy: 'newest',
    };
    setFilters(resetFilters);
    onSearch(resetFilters);
  };

  const addTag = (tag: string) => {
    if (tag && !filters.tags.includes(tag)) {
      setFilters(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setFilters(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (filters.query) handleSearch();
    }, 300);
    return () => clearTimeout(debounce);
  }, [filters.query]);

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-purple-400" />
            Find Your Beat
          </CardTitle>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="bg-purple-500/20 text-purple-300">
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search beats, producers, tags..."
              value={filters.query}
              onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
              className="pl-10 bg-slate-700/50 border-slate-600 focus:border-purple-500"
            />
          </div>
          <Select value={filters.sortBy} onValueChange={(v) => setFilters(prev => ({ ...prev, sortBy: v }))}>
            <SelectTrigger className="w-[140px] bg-slate-700/50 border-slate-600">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="popular">Popular</SelectItem>
              <SelectItem value="price_low">Price: Low</SelectItem>
              <SelectItem value="price_high">Price: High</SelectItem>
              <SelectItem value="trending">Trending</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSearch} className="bg-purple-600 hover:bg-purple-700">
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={filters.genre} onValueChange={(v) => setFilters(prev => ({ ...prev, genre: v }))}>
            <SelectTrigger className="w-[130px] bg-slate-700/50 border-slate-600">
              <Music className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Genre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Genres</SelectItem>
              {GENRES.map(genre => (
                <SelectItem key={genre} value={genre}>{genre}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.mood} onValueChange={(v) => setFilters(prev => ({ ...prev, mood: v }))}>
            <SelectTrigger className="w-[130px] bg-slate-700/50 border-slate-600">
              <Sparkles className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Mood" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Moods</SelectItem>
              {MOODS.map(mood => (
                <SelectItem key={mood} value={mood}>{mood}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.key} onValueChange={(v) => setFilters(prev => ({ ...prev, key: v }))}>
            <SelectTrigger className="w-[110px] bg-slate-700/50 border-slate-600">
              <Hash className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Key" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Keys</SelectItem>
              {MUSICAL_KEYS.map(key => (
                <SelectItem key={key} value={key}>{key}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <Filter className="h-4 w-4 mr-2" />
            More Filters
            {isExpanded ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
          </Button>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-400 hover:text-white">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
        </div>

        <Collapsible open={isExpanded}>
          <CollapsibleContent className="space-y-4 pt-4 border-t border-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-slate-300 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  BPM Range: {filters.bpmMin} - {filters.bpmMax}
                </Label>
                <div className="pt-2">
                  <Slider
                    value={[filters.bpmMin, filters.bpmMax]}
                    min={60}
                    max={200}
                    step={5}
                    onValueChange={([min, max]) => setFilters(prev => ({ ...prev, bpmMin: min, bpmMax: max }))}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>60 BPM</span>
                  <span>200 BPM</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-slate-300">
                  Price Range: ${filters.priceMin} - ${filters.priceMax}
                </Label>
                <div className="pt-2">
                  <Slider
                    value={[filters.priceMin, filters.priceMax]}
                    min={0}
                    max={1000}
                    step={10}
                    onValueChange={([min, max]) => setFilters(prev => ({ ...prev, priceMin: min, priceMax: max }))}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>$0</span>
                  <span>$1000+</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-slate-300">Tags</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {filters.tags.map(tag => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-purple-500/20 text-purple-300 cursor-pointer hover:bg-purple-500/30"
                    onClick={() => removeTag(tag)}
                  >
                    {tag}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag(tagInput)}
                  className="bg-slate-700/50 border-slate-600"
                />
                <Button variant="outline" onClick={() => addTag(tagInput)} className="border-slate-600">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 pt-2">
                <span className="text-xs text-slate-500 mr-2">Popular:</span>
                {POPULAR_TAGS.slice(0, 8).map(tag => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className={`text-xs cursor-pointer border-slate-600 ${
                      filters.tags.includes(tag) ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-white'
                    }`}
                    onClick={() => filters.tags.includes(tag) ? removeTag(tag) : addTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
