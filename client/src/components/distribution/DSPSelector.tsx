import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MonitorSpeaker, Search, CheckCircle } from 'lucide-react';
import {
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
  AmazonIcon,
  TidalIcon,
  SoundCloudIcon,
  TikTokIcon,
  InstagramIcon,
  FacebookIcon,
} from '@/components/ui/brand-icons';
import { useQuery } from '@tanstack/react-query';

interface DSP {
  id: string;
  slug: string;
  name: string;
  category: 'streaming' | 'social' | 'store' | 'other';
  region: string;
  processingTime: string;
  iconComponent?: any;
  color?: string;
}

const ICON_MAP: Record<string, any> = {
  spotify: SpotifyIcon,
  'apple-music': AppleMusicIcon,
  'youtube-music': YouTubeIcon,
  'amazon-music': AmazonIcon,
  'amazon-mp3': AmazonIcon,
  tidal: TidalIcon,
  soundcloud: SoundCloudIcon,
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
};

const COLOR_MAP: Record<string, string> = {
  spotify: '#1DB954',
  'apple-music': '#FA243C',
  'youtube-music': '#FF0000',
  'amazon-music': '#FF9900',
  tidal: '#000000',
  deezer: '#FEAA2D',
  pandora: '#005483',
  soundcloud: '#FF3300',
};

interface DSPSelectorProps {
  selectedPlatforms: string[];
  onChange: (platforms: string[]) => void;
}

/**
 * TODO: Add function documentation
 */
export function DSPSelector({ selectedPlatforms, onChange }: DSPSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: platforms = [], isLoading } = useQuery<DSP[]>({
    queryKey: ['/api/distribution/platforms'],
  });

  const enrichedPlatforms = platforms.map((p) => ({
    ...p,
    iconComponent: ICON_MAP[p.slug],
    color: COLOR_MAP[p.slug],
  }));

  const categories = [
    { value: 'all', label: 'All Platforms', count: enrichedPlatforms.length },
    {
      value: 'streaming',
      label: 'Streaming',
      count: enrichedPlatforms.filter((p) => p.category === 'streaming').length,
    },
    {
      value: 'social',
      label: 'Social',
      count: enrichedPlatforms.filter((p) => p.category === 'social').length,
    },
    {
      value: 'store',
      label: 'Store',
      count: enrichedPlatforms.filter((p) => p.category === 'store').length,
    },
  ];

  const filteredPlatforms = enrichedPlatforms.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const togglePlatform = (slug: string) => {
    if (selectedPlatforms.includes(slug)) {
      onChange(selectedPlatforms.filter((s) => s !== slug));
    } else {
      onChange([...selectedPlatforms, slug]);
    }
  };

  const selectAll = () => {
    onChange(filteredPlatforms.map((p) => p.slug));
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectMajorPlatforms = () => {
    const major = ['spotify', 'apple-music', 'youtube-music', 'amazon-music', 'tidal', 'deezer'];
    const majorSlugs = enrichedPlatforms.filter((p) => major.includes(p.slug)).map((p) => p.slug);
    onChange(majorSlugs);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading platforms...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorSpeaker className="h-5 w-5" />
          Select Distribution Platforms
        </CardTitle>
        <CardDescription>
          Choose where your music will be distributed. More platforms = more reach.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <strong>{selectedPlatforms.length}</strong> of{' '}
            <strong>{enrichedPlatforms.length}</strong> platforms selected
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={selectMajorPlatforms}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Major Platforms
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clearAll}>
              Clear All
            </Button>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
              onClick={() => setSelectedCategory(cat.value)}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search platforms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Platform Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredPlatforms.map((platform) => {
            const Icon = platform.iconComponent;
            const isSelected = selectedPlatforms.includes(platform.slug);

            return (
              <div
                key={platform.id}
                className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-primary/50'
                }`}
                onClick={() => togglePlatform(platform.slug)}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => togglePlatform(platform.slug)}
                    className="mt-0.5"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {Icon ? (
                        <Icon className="h-4 w-4 flex-shrink-0" style={{ color: platform.color }} />
                      ) : (
                        <MonitorSpeaker className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-medium truncate">{platform.name}</span>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {platform.category}
                      </Badge>
                      {platform.region !== 'global' && (
                        <Badge variant="outline" className="text-xs">
                          {platform.region}
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">{platform.processingTime}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredPlatforms.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MonitorSpeaker className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No platforms found matching "{searchQuery}"</p>
          </div>
        )}

        {/* Selected Summary */}
        {selectedPlatforms.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <Label>Selected Platforms ({selectedPlatforms.length})</Label>
            <div className="flex flex-wrap gap-2">
              {selectedPlatforms.map((slug) => {
                const platform = enrichedPlatforms.find((p) => p.slug === slug);
                if (!platform) return null;
                const Icon = platform.iconComponent;

                return (
                  <Badge key={slug} variant="secondary" className="gap-1.5 pr-1">
                    {Icon && <Icon className="h-3 w-3" style={{ color: platform.color }} />}
                    {platform.name}
                    <button
                      type="button"
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlatform(slug);
                      }}
                    >
                      ✕
                    </button>
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
