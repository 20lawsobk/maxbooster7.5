import { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Globe,
  Star,
  Award,
  Crown,
  Target,
  Users,
  Music,
  BarChart3,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';

interface PlatformScore {
  platform: string;
  score: number;
  rank: number;
  trend: 'up' | 'down' | 'stable';
  change: number;
  color: string;
}

interface RankingHistory {
  date: string;
  score: number;
  rank: number;
}

interface SimilarArtist {
  name: string;
  score: number;
  rank: number;
  genre: string;
  monthlyListeners: number;
  comparison: 'ahead' | 'behind' | 'similar';
}

interface GlobalRankingProps {
  maxScore?: number;
  globalRank?: number;
  platformScores?: PlatformScore[];
  rankingHistory?: RankingHistory[];
  similarArtists?: SimilarArtist[];
}

const defaultPlatformScores: PlatformScore[] = [
  { platform: 'Spotify', score: 78, rank: 12453, trend: 'up', change: 5, color: '#1DB954' },
  { platform: 'Apple Music', score: 72, rank: 18234, trend: 'up', change: 3, color: '#FA2D48' },
  { platform: 'YouTube Music', score: 65, rank: 24567, trend: 'stable', change: 0, color: '#FF0000' },
  { platform: 'Amazon Music', score: 58, rank: 32145, trend: 'down', change: -2, color: '#00A8E1' },
  { platform: 'Deezer', score: 52, rank: 41234, trend: 'up', change: 8, color: '#FEAA2D' },
  { platform: 'Tidal', score: 45, rank: 52341, trend: 'stable', change: 0, color: '#000000' },
];

const defaultRankingHistory: RankingHistory[] = [
  { date: '2025-12-15', score: 74, rank: 12453 },
  { date: '2025-12-08', score: 71, rank: 13245 },
  { date: '2025-12-01', score: 68, rank: 14567 },
  { date: '2025-11-24', score: 65, rank: 16234 },
  { date: '2025-11-17', score: 62, rank: 18456 },
  { date: '2025-11-10', score: 58, rank: 21234 },
];

const defaultSimilarArtists: SimilarArtist[] = [
  { name: 'Rising Star', score: 82, rank: 8234, genre: 'Indie Pop', monthlyListeners: 2500000, comparison: 'ahead' },
  { name: 'Groove Master', score: 76, rank: 11234, genre: 'Electronic', monthlyListeners: 1800000, comparison: 'ahead' },
  { name: 'Sunset Vibes', score: 73, rank: 13456, genre: 'Indie Pop', monthlyListeners: 1200000, comparison: 'similar' },
  { name: 'Echo Chamber', score: 68, rank: 16789, genre: 'Alternative', monthlyListeners: 950000, comparison: 'behind' },
  { name: 'Neon Dreams', score: 64, rank: 19234, genre: 'Synth Pop', monthlyListeners: 780000, comparison: 'behind' },
];

const ScoreGauge = memo(({ score, size = 200 }: { score: number; size?: number }) => {
  const radius = (size - 20) / 2;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#3b82f6';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Average';
    return 'Needs Work';
  };

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width={size} height={size / 2 + 20} className="overflow-visible">
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="40%" stopColor="#f59e0b" />
            <stop offset="70%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <path
          d={`M 10 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <motion.path
          d={`M 10 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2}`}
          fill="none"
          stroke={getScoreColor(score)}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute bottom-4 text-center">
        <motion.p
          className="text-5xl font-bold"
          style={{ color: getScoreColor(score) }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
        >
          {score}
        </motion.p>
        <p className="text-sm text-muted-foreground mt-1">{getScoreLabel(score)}</p>
      </div>
    </div>
  );
});
ScoreGauge.displayName = 'ScoreGauge';

const PlatformScoreCard = memo(({ platform }: { platform: PlatformScore }) => {
  const TrendIcon = platform.trend === 'up' ? ArrowUp : platform.trend === 'down' ? ArrowDown : Minus;
  const trendColor = platform.trend === 'up' ? 'text-green-500' : platform.trend === 'down' ? 'text-red-500' : 'text-slate-400';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${platform.color}20` }}
        >
          <Music className="h-5 w-5" style={{ color: platform.color }} />
        </div>
        <div>
          <p className="font-medium">{platform.platform}</p>
          <p className="text-xs text-muted-foreground">Rank #{platform.rank.toLocaleString()}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-xl font-bold">{platform.score}</p>
          <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            <span>{platform.change !== 0 ? `${platform.change > 0 ? '+' : ''}${platform.change}` : 'No change'}</span>
          </div>
        </div>
        <div className="w-24">
          <Progress value={platform.score} className="h-2" />
        </div>
      </div>
    </motion.div>
  );
});
PlatformScoreCard.displayName = 'PlatformScoreCard';

const RankingHistoryChart = memo(({ history }: { history: RankingHistory[] }) => {
  const reversedHistory = [...history].reverse();
  const maxScore = Math.max(...reversedHistory.map(h => h.score));
  const minScore = Math.min(...reversedHistory.map(h => h.score));
  const range = maxScore - minScore || 1;

  const points = reversedHistory
    .map((h, i) => {
      const x = (i / (reversedHistory.length - 1)) * 100;
      const y = 100 - ((h.score - minScore) / range) * 80 - 10;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPath = `M0,100 L0,${100 - ((reversedHistory[0].score - minScore) / range) * 80 - 10} ${reversedHistory
    .map((h, i) => {
      const x = (i / (reversedHistory.length - 1)) * 100;
      const y = 100 - ((h.score - minScore) / range) * 80 - 10;
      return `L${x},${y}`;
    })
    .join(' ')} L100,100 Z`;

  return (
    <div className="space-y-4">
      <div className="relative h-48">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="rankingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#rankingGradient)" />
          <polyline
            points={points}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {reversedHistory.map((h, i) => {
            const x = (i / (reversedHistory.length - 1)) * 100;
            const y = 100 - ((h.score - minScore) / range) * 80 - 10;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3"
                fill="#6366f1"
                className="hover:r-5 transition-all"
              />
            );
          })}
        </svg>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        {reversedHistory.map((h, i) => (
          <span key={i}>{new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        ))}
      </div>
    </div>
  );
});
RankingHistoryChart.displayName = 'RankingHistoryChart';

const SimilarArtistsComparison = memo(({ artists, currentScore }: { artists: SimilarArtist[]; currentScore: number }) => {
  return (
    <div className="space-y-3">
      {artists.map((artist, idx) => {
        const comparisonColor = artist.comparison === 'ahead' 
          ? 'border-red-200 bg-red-50 dark:bg-red-950/20' 
          : artist.comparison === 'behind' 
            ? 'border-green-200 bg-green-50 dark:bg-green-950/20'
            : 'border-blue-200 bg-blue-50 dark:bg-blue-950/20';
        
        return (
          <motion.div
            key={artist.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`flex items-center justify-between p-4 rounded-lg border ${comparisonColor}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
                {artist.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold">{artist.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">{artist.genre}</Badge>
                  <span>{(artist.monthlyListeners / 1000000).toFixed(1)}M listeners</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold">{artist.score}</p>
                <p className="text-xs text-muted-foreground">Rank #{artist.rank.toLocaleString()}</p>
              </div>
              <div className="w-20">
                {artist.comparison === 'ahead' ? (
                  <Badge variant="destructive" className="w-full justify-center">
                    <ArrowUp className="h-3 w-3 mr-1" />
                    +{artist.score - currentScore}
                  </Badge>
                ) : artist.comparison === 'behind' ? (
                  <Badge className="w-full justify-center bg-green-500">
                    <ArrowDown className="h-3 w-3 mr-1" />
                    -{currentScore - artist.score}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="w-full justify-center">
                    <Minus className="h-3 w-3 mr-1" />
                    Similar
                  </Badge>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
});
SimilarArtistsComparison.displayName = 'SimilarArtistsComparison';

export default function GlobalRankingDashboard({
  maxScore = 74,
  globalRank = 12453,
  platformScores = defaultPlatformScores,
  rankingHistory = defaultRankingHistory,
  similarArtists = defaultSimilarArtists,
}: GlobalRankingProps) {
  const [timeRange, setTimeRange] = useState('30d');

  const avgPlatformScore = Math.round(
    platformScores.reduce((sum, p) => sum + p.score, 0) / platformScores.length
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Global Ranking Dashboard
          </h2>
          <p className="text-muted-foreground mt-1">
            Your performance score across all platforms
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Max Score</CardTitle>
            <CardDescription>Your overall performance rating (0-100)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center pt-4">
            <ScoreGauge score={maxScore} />
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">Global Rank</p>
              <p className="text-3xl font-bold">#{globalRank.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-500" />
              Platform-by-Platform Scores
            </CardTitle>
            <CardDescription>Performance breakdown by streaming platform</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {platformScores.map((platform, idx) => (
              <PlatformScoreCard key={platform.platform} platform={platform} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Ranking History
            </CardTitle>
            <CardDescription>Score progression over time</CardDescription>
          </CardHeader>
          <CardContent>
            <RankingHistoryChart history={rankingHistory} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              Similar Artists Comparison
            </CardTitle>
            <CardDescription>How you compare to artists in your genre</CardDescription>
          </CardHeader>
          <CardContent>
            <SimilarArtistsComparison artists={similarArtists} currentScore={maxScore} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
