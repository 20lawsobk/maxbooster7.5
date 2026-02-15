import { useState, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  GitCompare,
  Activity,
  Users,
  DollarSign,
  Heart,
  Share2,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { DateRangePicker } from '@/components/analytics/DateRangePicker';
import { PlatformFilterChips } from '@/components/analytics/PlatformFilterChips';
import { ChartCardSkeleton, StatCardRowSkeleton } from '@/components/analytics/AnalyticsLoadingSkeletons';
import { cn } from '@/lib/utils';

interface PlatformData {
  platform: string;
  color: string;
  icon: string;
  streams: number;
  streamChange: number;
  followers: number;
  followerChange: number;
  engagement: number;
  engagementChange: number;
  revenue: number;
  revenueChange: number;
  saves: number;
  shares: number;
}

interface GrowthData {
  month: string;
  spotify: number;
  apple: number;
  youtube: number;
  amazon: number;
}

interface EngagementMetric {
  metric: string;
  spotify: number;
  apple: number;
  youtube: number;
  amazon: number;
}

const PLATFORM_INFO: Record<string, { color: string; icon: string }> = {
  spotify: { color: '#1DB954', icon: '🎵' },
  apple: { color: '#FA2D48', icon: '🍎' },
  youtube: { color: '#FF0000', icon: '📺' },
  amazon: { color: '#FF9900', icon: '📦' },
  deezer: { color: '#00C7F2', icon: '🎧' },
  tidal: { color: '#000000', icon: '🌊' },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
        <p className="font-semibold text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-600 dark:text-slate-400">{entry.name}:</span>
            <span className="font-medium">{entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const PlatformComparisonCard = memo(({ platform, maxStreams }: { platform: PlatformData; maxStreams: number }) => {
  const streamPercentage = (platform.streams / maxStreams) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <Card className="overflow-hidden">
        <div className="h-1" style={{ backgroundColor: platform.color }} />
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
              style={{ backgroundColor: `${platform.color}15` }}
            >
              {platform.icon}
            </div>
            <div>
              <h3 className="font-semibold">{platform.platform}</h3>
              <Badge
                variant={platform.streamChange > 0 ? 'default' : 'secondary'}
                className="text-xs"
              >
                {platform.streamChange > 0 ? '+' : ''}{platform.streamChange}%
              </Badge>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Streams</span>
                <span className="font-semibold">{platform.streams.toLocaleString()}</span>
              </div>
              <Progress value={streamPercentage} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                <p className="text-muted-foreground text-xs">Followers</p>
                <div className="flex items-center gap-1">
                  <span className="font-semibold">{(platform.followers / 1000).toFixed(1)}K</span>
                  <span className={cn(
                    "text-xs",
                    platform.followerChange > 0 ? "text-green-500" : "text-red-500"
                  )}>
                    {platform.followerChange > 0 ? '+' : ''}{platform.followerChange}%
                  </span>
                </div>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                <p className="text-muted-foreground text-xs">Engagement</p>
                <div className="flex items-center gap-1">
                  <span className="font-semibold">{platform.engagement}%</span>
                  <span className={cn(
                    "text-xs",
                    platform.engagementChange > 0 ? "text-green-500" : "text-red-500"
                  )}>
                    {platform.engagementChange > 0 ? '+' : ''}{platform.engagementChange}%
                  </span>
                </div>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                <p className="text-muted-foreground text-xs">Revenue</p>
                <div className="flex items-center gap-1">
                  <span className="font-semibold">${platform.revenue.toLocaleString()}</span>
                </div>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                <p className="text-muted-foreground text-xs">Saves + Shares</p>
                <div className="flex items-center gap-1">
                  <span className="font-semibold">{(platform.saves + platform.shares).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});
PlatformComparisonCard.displayName = 'PlatformComparisonCard';

interface CrossPlatformComparisonProps {
  userId?: string;
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
}

export function CrossPlatformComparison({
  userId,
  timeRange = '30d',
  onTimeRangeChange,
}: CrossPlatformComparisonProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/analytics/cross-platform', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics-alerts/cross-platform-comparison`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch cross-platform data');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const platformData = useMemo<PlatformData[]>(() => {
    const defaultData: PlatformData[] = [
      { platform: 'Spotify', color: '#1DB954', icon: '🎵', streams: 892341, streamChange: 15.2, followers: 23400, followerChange: 8.5, engagement: 4.8, engagementChange: 12, revenue: 1250.50, revenueChange: 10, saves: 15600, shares: 4200 },
      { platform: 'Apple Music', color: '#FA2D48', icon: '🍎', streams: 456782, streamChange: 8.7, followers: 12300, followerChange: 5.2, engagement: 5.2, engagementChange: 8, revenue: 890.25, revenueChange: 6, saves: 8900, shares: 2100 },
      { platform: 'YouTube Music', color: '#FF0000', icon: '📺', streams: 234567, streamChange: 22.1, followers: 5600, followerChange: 18.3, engagement: 3.5, engagementChange: 15, revenue: 420.80, revenueChange: 25, saves: 3400, shares: 5600 },
      { platform: 'Amazon Music', color: '#FF9900', icon: '📦', streams: 123456, streamChange: -3.4, followers: 2100, followerChange: 2.1, engagement: 2.8, engagementChange: -5, revenue: 280.45, revenueChange: -2, saves: 1800, shares: 900 },
    ];

    if (!data?.platforms) return defaultData;
    
    return data.platforms.map((p: any) => ({
      platform: p.name || p.platform,
      color: PLATFORM_INFO[p.name?.toLowerCase()]?.color || '#6B7280',
      icon: PLATFORM_INFO[p.name?.toLowerCase()]?.icon || '🎵',
      ...p,
    }));
  }, [data]);

  const maxStreams = Math.max(...platformData.map(p => p.streams));

  const growthData = useMemo<GrowthData[]>(() => [
    { month: 'Sep', spotify: 650000, apple: 320000, youtube: 150000, amazon: 95000 },
    { month: 'Oct', spotify: 720000, apple: 380000, youtube: 180000, amazon: 110000 },
    { month: 'Nov', spotify: 780000, apple: 400000, youtube: 200000, amazon: 105000 },
    { month: 'Dec', spotify: 850000, apple: 430000, youtube: 220000, amazon: 118000 },
    { month: 'Jan', spotify: 892341, apple: 456782, youtube: 234567, amazon: 123456 },
  ], []);

  const engagementData = useMemo<EngagementMetric[]>(() => [
    { metric: 'Save Rate', spotify: 4.2, apple: 5.1, youtube: 3.8, amazon: 2.9 },
    { metric: 'Share Rate', spotify: 1.8, apple: 1.5, youtube: 3.2, amazon: 0.9 },
    { metric: 'Completion', spotify: 78, apple: 82, youtube: 65, amazon: 75 },
    { metric: 'Skip Rate', spotify: 22, apple: 18, youtube: 35, amazon: 25 },
    { metric: 'Replay Rate', spotify: 15, apple: 18, youtube: 12, amazon: 10 },
  ], []);

  const radarData = useMemo(() => [
    { metric: 'Streams', spotify: 100, apple: 51, youtube: 26, amazon: 14 },
    { metric: 'Followers', spotify: 100, apple: 53, youtube: 24, amazon: 9 },
    { metric: 'Engagement', spotify: 92, apple: 100, youtube: 67, amazon: 54 },
    { metric: 'Revenue', spotify: 100, apple: 71, youtube: 34, amazon: 22 },
    { metric: 'Growth', spotify: 69, apple: 39, youtube: 100, amazon: -15 },
  ], []);

  const filteredPlatforms = useMemo(() => {
    if (selectedPlatforms.length === 0) return platformData;
    return platformData.filter(p => 
      selectedPlatforms.includes(p.platform.toLowerCase().replace(' ', '_'))
    );
  }, [platformData, selectedPlatforms]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <StatCardRowSkeleton count={4} />
        <ChartCardSkeleton height={400} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Cross-Platform Comparison
          </h2>
          <p className="text-sm text-muted-foreground">Compare your performance across streaming platforms</p>
        </div>
        <DateRangePicker value={timeRange} onChange={onTimeRangeChange || (() => {})} />
      </div>

      <PlatformFilterChips
        selectedPlatforms={selectedPlatforms}
        onChange={setSelectedPlatforms}
        variant="badges"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredPlatforms.map((platform) => (
          <PlatformComparisonCard
            key={platform.platform}
            platform={platform}
            maxStreams={maxStreams}
          />
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Growth Comparison</TabsTrigger>
          <TabsTrigger value="engagement">Engagement Metrics</TabsTrigger>
          <TabsTrigger value="radar">Performance Radar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform Growth Over Time</CardTitle>
              <CardDescription>Monthly stream comparison across platforms</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={growthData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `${(v / 1000)}K`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="spotify" name="Spotify" fill="#1DB954" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="apple" name="Apple Music" fill="#FA2D48" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="youtube" name="YouTube Music" fill="#FF0000" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="amazon" name="Amazon Music" fill="#FF9900" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagement" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Engagement Metrics Comparison</CardTitle>
              <CardDescription>Key engagement metrics by platform</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={engagementData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis type="category" dataKey="metric" width={100} className="text-xs" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="spotify" name="Spotify" fill="#1DB954" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="apple" name="Apple Music" fill="#FA2D48" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="youtube" name="YouTube Music" fill="#FF0000" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="amazon" name="Amazon Music" fill="#FF9900" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="radar" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Performance Overview</CardTitle>
              <CardDescription>Relative performance across key metrics (normalized to 100)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid className="stroke-slate-200 dark:stroke-slate-700" />
                    <PolarAngleAxis dataKey="metric" className="text-xs" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} className="text-xs" />
                    <Radar
                      name="Spotify"
                      dataKey="spotify"
                      stroke="#1DB954"
                      fill="#1DB954"
                      fillOpacity={0.3}
                    />
                    <Radar
                      name="Apple Music"
                      dataKey="apple"
                      stroke="#FA2D48"
                      fill="#FA2D48"
                      fillOpacity={0.3}
                    />
                    <Radar
                      name="YouTube Music"
                      dataKey="youtube"
                      stroke="#FF0000"
                      fill="#FF0000"
                      fillOpacity={0.3}
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
              <Zap className="h-6 w-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">AI Insight</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Your YouTube Music streams are growing 22% faster than other platforms. Consider creating 
                more video content to capitalize on this trend. YouTube listeners also have the highest 
                share rate at 3.2%.
              </p>
              <Button size="sm" variant="outline">
                View Recommendations
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CrossPlatformComparison;
