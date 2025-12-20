import { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  TrendingUp,
  Star,
  Users,
  Music,
  Globe,
  Target,
  Award,
  Flame,
  Rocket,
  Filter,
  Search,
  Play,
  ExternalLink,
  ChevronRight,
  ArrowUp,
  Zap,
  BarChart3,
  Heart,
} from 'lucide-react';

interface EmergingArtist {
  id: string;
  name: string;
  genre: string;
  country: string;
  countryCode: string;
  growthScore: number;
  signingPotential: 'high' | 'medium' | 'low';
  monthlyListeners: number;
  monthlyGrowth: number;
  socialFollowing: number;
  recentReleases: number;
  playlistReach: number;
  engagementRate: number;
  imageUrl?: string;
  topTrack?: string;
  trajectory: number[];
}

interface ARDiscoveryProps {
  artists?: EmergingArtist[];
  onArtistSelect?: (artist: EmergingArtist) => void;
}

const defaultArtists: EmergingArtist[] = [
  {
    id: '1',
    name: 'Luna Waves',
    genre: 'Indie Pop',
    country: 'Sweden',
    countryCode: 'SE',
    growthScore: 94,
    signingPotential: 'high',
    monthlyListeners: 285000,
    monthlyGrowth: 156,
    socialFollowing: 125000,
    recentReleases: 3,
    playlistReach: 4500000,
    engagementRate: 8.5,
    topTrack: 'Midnight Dreams',
    trajectory: [45, 58, 72, 85, 94],
  },
  {
    id: '2',
    name: 'Neon Pulse',
    genre: 'Electronic',
    country: 'Germany',
    countryCode: 'DE',
    growthScore: 89,
    signingPotential: 'high',
    monthlyListeners: 420000,
    monthlyGrowth: 89,
    socialFollowing: 95000,
    recentReleases: 5,
    playlistReach: 6200000,
    engagementRate: 7.2,
    topTrack: 'Circuit Break',
    trajectory: [52, 61, 73, 82, 89],
  },
  {
    id: '3',
    name: 'Velvet Echo',
    genre: 'R&B',
    country: 'United States',
    countryCode: 'US',
    growthScore: 85,
    signingPotential: 'high',
    monthlyListeners: 175000,
    monthlyGrowth: 234,
    socialFollowing: 280000,
    recentReleases: 2,
    playlistReach: 3100000,
    engagementRate: 12.3,
    topTrack: 'Silk & Shadows',
    trajectory: [28, 45, 62, 78, 85],
  },
  {
    id: '4',
    name: 'Arctic Bloom',
    genre: 'Alternative',
    country: 'Norway',
    countryCode: 'NO',
    growthScore: 78,
    signingPotential: 'medium',
    monthlyListeners: 98000,
    monthlyGrowth: 67,
    socialFollowing: 45000,
    recentReleases: 4,
    playlistReach: 1800000,
    engagementRate: 9.1,
    topTrack: 'Northern Lights',
    trajectory: [35, 48, 58, 68, 78],
  },
  {
    id: '5',
    name: 'Solar Drift',
    genre: 'Synth Pop',
    country: 'Japan',
    countryCode: 'JP',
    growthScore: 72,
    signingPotential: 'medium',
    monthlyListeners: 156000,
    monthlyGrowth: 45,
    socialFollowing: 82000,
    recentReleases: 6,
    playlistReach: 2400000,
    engagementRate: 6.8,
    topTrack: 'Cosmic Rider',
    trajectory: [40, 52, 60, 66, 72],
  },
  {
    id: '6',
    name: 'Coral Reef',
    genre: 'Indie Folk',
    country: 'Australia',
    countryCode: 'AU',
    growthScore: 65,
    signingPotential: 'low',
    monthlyListeners: 42000,
    monthlyGrowth: 32,
    socialFollowing: 28000,
    recentReleases: 2,
    playlistReach: 890000,
    engagementRate: 5.4,
    topTrack: 'Ocean Breeze',
    trajectory: [38, 45, 52, 58, 65],
  },
];

const getCountryFlag = (countryCode: string) => {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

const GrowthTrajectoryMini = memo(({ trajectory }: { trajectory: number[] }) => {
  const max = Math.max(...trajectory);
  const min = Math.min(...trajectory);
  const range = max - min || 1;
  
  const points = trajectory
    .map((value, i) => {
      const x = (i / (trajectory.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 80 - 10;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" className="w-20 h-10">
      <polyline
        points={points}
        fill="none"
        stroke="#22c55e"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});
GrowthTrajectoryMini.displayName = 'GrowthTrajectoryMini';

const SigningPotentialBadge = memo(({ potential }: { potential: 'high' | 'medium' | 'low' }) => {
  const config = {
    high: { bg: 'bg-green-100 text-green-800 border-green-200', icon: <Flame className="h-3 w-3" /> },
    medium: { bg: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <Zap className="h-3 w-3" /> },
    low: { bg: 'bg-slate-100 text-slate-600 border-slate-200', icon: <Target className="h-3 w-3" /> },
  };
  
  return (
    <Badge variant="outline" className={`${config[potential].bg} gap-1`}>
      {config[potential].icon}
      <span className="capitalize">{potential}</span>
    </Badge>
  );
});
SigningPotentialBadge.displayName = 'SigningPotentialBadge';

const ArtistCard = memo(({ artist, onSelect }: { artist: EmergingArtist; onSelect?: (artist: EmergingArtist) => void }) => {
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-slate-600';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="overflow-hidden hover:shadow-lg transition-all cursor-pointer" onClick={() => onSelect?.(artist)}>
        <div className="relative">
          <div className="h-24 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500" />
          <div className="absolute -bottom-8 left-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white text-2xl font-bold border-4 border-white shadow-lg">
              {artist.name.charAt(0)}
            </div>
          </div>
          <div className="absolute top-2 right-2">
            <SigningPotentialBadge potential={artist.signingPotential} />
          </div>
        </div>
        
        <CardContent className="pt-12 pb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-bold text-lg">{artist.name}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{getCountryFlag(artist.countryCode)}</span>
                <span>{artist.country}</span>
                <span>•</span>
                <Badge variant="secondary" className="text-xs">{artist.genre}</Badge>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-bold ${getScoreColor(artist.growthScore)}`}>
                {artist.growthScore}
              </p>
              <p className="text-xs text-muted-foreground">Growth Score</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <GrowthTrajectoryMini trajectory={artist.trajectory} />
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <ArrowUp className="h-3 w-3" />
              +{artist.monthlyGrowth}% this month
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <p className="text-sm font-bold">{(artist.monthlyListeners / 1000).toFixed(0)}K</p>
              <p className="text-xs text-muted-foreground">Listeners</p>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <p className="text-sm font-bold">{(artist.playlistReach / 1000000).toFixed(1)}M</p>
              <p className="text-xs text-muted-foreground">Reach</p>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg">
              <p className="text-sm font-bold">{artist.engagementRate}%</p>
              <p className="text-xs text-muted-foreground">Engagement</p>
            </div>
          </div>

          {artist.topTrack && (
            <div className="mt-4 flex items-center gap-2 p-2 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-lg">
              <Play className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Top Track:</span>
              <span className="text-sm font-medium">{artist.topTrack}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
});
ArtistCard.displayName = 'ArtistCard';

const GrowthTrajectoryChart = memo(({ artists }: { artists: EmergingArtist[] }) => {
  const topArtists = artists.slice(0, 5);
  const colors = ['#6366f1', '#ec4899', '#22c55e', '#f59e0b', '#06b6d4'];

  return (
    <div className="space-y-4">
      <div className="relative h-64 bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          {topArtists.map((artist, artistIdx) => {
            const trajectory = artist.trajectory;
            const max = 100;
            const min = 0;
            const range = max - min || 1;

            const points = trajectory
              .map((value, i) => {
                const x = (i / (trajectory.length - 1)) * 100;
                const y = 100 - ((value - min) / range) * 80 - 10;
                return `${x},${y}`;
              })
              .join(' ');

            return (
              <polyline
                key={artist.id}
                points={points}
                fill="none"
                stroke={colors[artistIdx]}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        {topArtists.map((artist, idx) => (
          <div key={artist.id} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: colors[idx] }}
            />
            <span className="text-sm">{artist.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
GrowthTrajectoryChart.displayName = 'GrowthTrajectoryChart';

export default function ARDiscoveryPanel({ artists = defaultArtists, onArtistSelect }: ARDiscoveryProps) {
  const [genreFilter, setGenreFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [potentialFilter, setPotentialFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('growthScore');

  const genres = [...new Set(artists.map(a => a.genre))];
  const countries = [...new Set(artists.map(a => a.country))];

  const filteredArtists = artists
    .filter(artist => {
      if (genreFilter !== 'all' && artist.genre !== genreFilter) return false;
      if (countryFilter !== 'all' && artist.country !== countryFilter) return false;
      if (potentialFilter !== 'all' && artist.signingPotential !== potentialFilter) return false;
      if (searchQuery && !artist.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'growthScore': return b.growthScore - a.growthScore;
        case 'monthlyGrowth': return b.monthlyGrowth - a.monthlyGrowth;
        case 'listeners': return b.monthlyListeners - a.monthlyListeners;
        case 'engagement': return b.engagementRate - a.engagementRate;
        default: return 0;
      }
    });

  const stats = {
    totalArtists: artists.length,
    highPotential: artists.filter(a => a.signingPotential === 'high').length,
    avgGrowthScore: Math.round(artists.reduce((sum, a) => sum + a.growthScore, 0) / artists.length),
    totalReach: artists.reduce((sum, a) => sum + a.playlistReach, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-500" />
            A&R Discovery Panel
          </h2>
          <p className="text-muted-foreground mt-1">
            Discover emerging artists with high growth potential
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Artists Tracked</p>
                <p className="text-3xl font-bold">{stats.totalArtists}</p>
              </div>
              <Users className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Potential</p>
                <p className="text-3xl font-bold text-green-600">{stats.highPotential}</p>
              </div>
              <Flame className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Growth Score</p>
                <p className="text-3xl font-bold text-blue-600">{stats.avgGrowthScore}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reach</p>
                <p className="text-3xl font-bold text-orange-600">
                  {(stats.totalReach / 1000000).toFixed(0)}M
                </p>
              </div>
              <Globe className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search artists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={genreFilter} onValueChange={setGenreFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Genre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genres</SelectItem>
                {genres.map(genre => (
                  <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={potentialFilter} onValueChange={setPotentialFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Potential" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Potential</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="growthScore">Growth Score</SelectItem>
                <SelectItem value="monthlyGrowth">Monthly Growth</SelectItem>
                <SelectItem value="listeners">Listeners</SelectItem>
                <SelectItem value="engagement">Engagement</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredArtists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} onSelect={onArtistSelect} />
            ))}
          </div>
          {filteredArtists.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-semibold">No artists found</p>
                <p className="text-muted-foreground">Try adjusting your filters</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                Growth Trajectories
              </CardTitle>
              <CardDescription>Top 5 artists by growth score</CardDescription>
            </CardHeader>
            <CardContent>
              <GrowthTrajectoryChart artists={artists} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                Signing Potential Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                <Flame className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-700">High Potential</p>
                  <p className="text-sm text-green-600">Score 85+, rapid growth, strong engagement</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg">
                <Zap className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-yellow-700">Medium Potential</p>
                  <p className="text-sm text-yellow-600">Score 60-84, steady growth trajectory</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <Target className="h-5 w-5 text-slate-500 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Low Potential</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Score below 60, early stage development</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
