import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Filter, X, Users } from 'lucide-react';
import { CollaboratorCard } from './CollaboratorCard';

const GENRES = [
  'Hip Hop',
  'R&B',
  'Pop',
  'Electronic',
  'Rock',
  'Jazz',
  'Classical',
  'Country',
  'Reggae',
  'Latin',
  'Afrobeats',
  'K-Pop',
  'Indie',
  'Metal',
  'Folk',
];

const SKILLS = [
  'Producer',
  'Vocalist',
  'Rapper',
  'Singer',
  'Songwriter',
  'Beatmaker',
  'Mixing Engineer',
  'Mastering Engineer',
  'DJ',
  'Instrumentalist',
];

export function CollaboratorSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedSearch = useCallback((value: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setDebouncedQuery(value);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    debouncedSearch(e.target.value);
  };

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (selectedGenre) params.set('genre', selectedGenre);
    if (selectedLocation) params.set('location', selectedLocation);
    if (selectedSkills.length > 0) params.set('skills', selectedSkills.join(','));
    return params.toString();
  };

  const { data: artists, isLoading } = useQuery({
    queryKey: ['/api/collaborations/search', debouncedQuery, selectedGenre, selectedLocation, selectedSkills],
    queryFn: async () => {
      const queryString = buildQueryString();
      const url = `/api/collaborations/search${queryString ? `?${queryString}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to search artists');
      return res.json();
    },
    enabled: debouncedQuery.length >= 2 || !!selectedGenre || selectedSkills.length > 0,
    staleTime: 30000,
  });

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const clearFilters = () => {
    setSelectedGenre('');
    setSelectedLocation('');
    setSelectedSkills([]);
  };

  const hasActiveFilters = selectedGenre || selectedLocation || selectedSkills.length > 0;

  const renderSkeletons = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Find Collaborators
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search artists by name, username, or bio..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <span className="ml-2 bg-primary-foreground text-primary rounded-full px-2 py-0.5 text-xs">
                {(selectedGenre ? 1 : 0) + (selectedLocation ? 1 : 0) + selectedSkills.length}
              </span>
            )}
          </Button>
        </div>

        {showFilters && (
          <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filter Options</h4>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Genre</label>
                <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENRES.map((genre) => (
                      <SelectItem key={genre} value={genre.toLowerCase()}>
                        {genre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Location</label>
                <Input
                  placeholder="Enter location..."
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Skills</label>
              <div className="flex flex-wrap gap-2">
                {SKILLS.map((skill) => (
                  <Button
                    key={skill}
                    variant={selectedSkills.includes(skill.toLowerCase()) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleSkill(skill.toLowerCase())}
                  >
                    {skill}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="min-h-[200px]">
          {isLoading ? (
            renderSkeletons()
          ) : artists?.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {artists.map((artist: any) => (
                <CollaboratorCard
                  key={artist.id}
                  user={artist}
                  showConnectButton={true}
                />
              ))}
            </div>
          ) : debouncedQuery.length >= 2 || hasActiveFilters ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No artists found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Search for collaborators</p>
              <p className="text-sm">Enter a name or use filters to find artists</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CollaboratorSearch;
