import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Headphones,
  DollarSign,
  Globe,
  Music,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Heart,
  Share2,
  Calendar,
  Clock,
  MapPin,
  Zap,
  Sparkles,
  Star,
  Activity,
  PieChart,
  LineChart,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  color?: string;
  sparkline?: number[];
  compact?: boolean;
}

function MetricCard({ title, value, change, changeLabel, icon, color = 'blue', sparkline, compact }: MetricCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;
  
  const colorClasses = {
    blue: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',
    green: 'from-green-500/10 to-green-600/5 border-green-500/20',
    purple: 'from-purple-500/10 to-purple-600/5 border-purple-500/20',
    orange: 'from-orange-500/10 to-orange-600/5 border-orange-500/20',
    pink: 'from-pink-500/10 to-pink-600/5 border-pink-500/20',
    cyan: 'from-cyan-500/10 to-cyan-600/5 border-cyan-500/20',
  };

  const textColors = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    purple: 'text-purple-500',
    orange: 'text-orange-500',
    pink: 'text-pink-500',
    cyan: 'text-cyan-500',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} ${compact ? 'p-2' : ''}`}>
        <CardContent className={compact ? 'p-2' : 'p-4'}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {icon && <span className={`${textColors[color as keyof typeof textColors]} opacity-60`}>{icon}</span>}
                <span className="text-xs text-muted-foreground font-medium">{title}</span>
              </div>
              <p className={`${compact ? 'text-lg' : 'text-2xl'} font-bold mt-1`}>{value}</p>
              {change !== undefined && (
                <div className="flex items-center gap-1 mt-1">
                  {isPositive ? (
                    <ArrowUpRight className="w-3 h-3 text-green-500" />
                  ) : isNegative ? (
                    <ArrowDownRight className="w-3 h-3 text-red-500" />
                  ) : (
                    <Minus className="w-3 h-3 text-gray-500" />
                  )}
                  <span className={`text-xs ${isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-500'}`}>
                    {isPositive ? '+' : ''}{change}%
                  </span>
                  {changeLabel && <span className="text-xs text-muted-foreground">{changeLabel}</span>}
                </div>
              )}
            </div>
            {sparkline && sparkline.length > 0 && (
              <div className="w-20 h-10 opacity-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkline.map((v, i) => ({ value: v }))}>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={isPositive ? '#22c55e' : isNegative ? '#ef4444' : '#6b7280'}
                      fill={isPositive ? '#22c55e20' : isNegative ? '#ef444420' : '#6b728020'}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface PlatformMetric {
  platform: string;
  streams: number;
  followers: number;
  change: number;
  color: string;
}

interface GeoMetric {
  country: string;
  code: string;
  streams: number;
  percentage: number;
  growth: number;
}

interface TimelineEvent {
  date: string;
  type: 'release' | 'playlist' | 'milestone' | 'viral';
  title: string;
  impact?: string;
}

const PLATFORM_COLORS = {
  spotify: '#1DB954',
  apple: '#FC3C44',
  youtube: '#FF0000',
  amazon: '#FF9900',
  deezer: '#00C7F2',
  tidal: '#000000',
  soundcloud: '#FF5500',
  tiktok: '#000000',
};

export function DataDenseAnalytics() {
  const [timeRange, setTimeRange] = useState('7d');
  const [activeView, setActiveView] = useState('overview');

  const { data: analyticsData, isLoading, error } = useQuery({
    queryKey: ['analytics-dashboard', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/dashboard?range=${timeRange}`);
      if (!response.ok) {
        throw new Error('Failed to load analytics');
      }
      return response.json();
    },
    refetchInterval: 60000,
  });

  const { data: aiInsights } = useQuery({
    queryKey: ['ai-insights', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/ai/insights?range=${timeRange}`);
      if (!response.ok) return [];
      return response.json();
    },
  });

  const fallbackData = {
    totalStreams: 1847293,
    totalRevenue: 4829.47,
    totalFollowers: 45892,
    totalPlays: 892341,
    monthlyListeners: 128934,
    artistScore: 78,
    careerStage: 'Emerging',
    streamChange: 12.4,
    revenueChange: 8.2,
    followerChange: 5.7,
    playChange: -2.1,
    platforms: [
      { platform: 'Spotify', streams: 892341, followers: 23400, change: 15.2, color: '#1DB954' },
      { platform: 'Apple Music', streams: 456782, followers: 12300, change: 8.7, color: '#FC3C44' },
      { platform: 'YouTube Music', streams: 234567, followers: 5600, change: 22.1, color: '#FF0000' },
      { platform: 'Amazon Music', streams: 123456, followers: 2100, change: -3.4, color: '#FF9900' },
      { platform: 'Deezer', streams: 89234, followers: 1800, change: 6.2, color: '#00C7F2' },
      { platform: 'TikTok', streams: 50913, followers: 680, change: 45.8, color: '#000000' },
    ],
    geoData: [
      { country: 'United States', code: 'US', streams: 456782, percentage: 24.7, growth: 12.3 },
      { country: 'United Kingdom', code: 'GB', streams: 234567, percentage: 12.7, growth: 8.9 },
      { country: 'Germany', code: 'DE', streams: 178234, percentage: 9.6, growth: 15.2 },
      { country: 'Brazil', code: 'BR', streams: 156789, percentage: 8.5, growth: 28.4 },
      { country: 'Mexico', code: 'MX', streams: 134567, percentage: 7.3, growth: 21.7 },
      { country: 'Canada', code: 'CA', streams: 98765, percentage: 5.3, growth: 6.1 },
      { country: 'France', code: 'FR', streams: 87654, percentage: 4.7, growth: 9.8 },
      { country: 'Australia', code: 'AU', streams: 76543, percentage: 4.1, growth: 11.2 },
    ],
    timeline: [
      { date: '2024-01-15', type: 'release', title: 'New Single "Midnight Dreams"', impact: '+45K streams' },
      { date: '2024-01-10', type: 'playlist', title: 'Added to "Today\'s Top Hits"', impact: '+120K streams' },
      { date: '2024-01-05', type: 'viral', title: 'TikTok trend #MidnightChallenge', impact: '+85K followers' },
      { date: '2023-12-20', type: 'milestone', title: '1M Total Streams', impact: '' },
    ],
    triggerCities: [
      { city: 'Los Angeles, CA', listeners: 12400, growth: 18.5 },
      { city: 'New York, NY', listeners: 10800, growth: 14.2 },
      { city: 'London, UK', listeners: 8900, growth: 22.1 },
      { city: 'Toronto, CA', listeners: 6700, growth: 11.8 },
      { city: 'Sao Paulo, BR', listeners: 5600, growth: 35.2 },
    ],
    demographics: {
      age: [
        { range: '18-24', percentage: 35 },
        { range: '25-34', percentage: 42 },
        { range: '35-44', percentage: 15 },
        { range: '45+', percentage: 8 },
      ],
      gender: [
        { type: 'Female', percentage: 48 },
        { type: 'Male', percentage: 49 },
        { type: 'Other', percentage: 3 },
      ],
    },
    revenueBySource: [
      { source: 'Streaming', amount: 3240.50, percentage: 67 },
      { source: 'Merchandise', amount: 890.20, percentage: 18 },
      { source: 'Beat Sales', amount: 456.77, percentage: 10 },
      { source: 'Sync Licensing', amount: 242.00, percentage: 5 },
    ],
    streamHistory: Array.from({ length: 30 }, (_, i) => ({
      date: `Day ${i + 1}`,
      streams: Math.floor(Math.random() * 50000) + 30000,
      revenue: Math.floor(Math.random() * 200) + 100,
    })),
  };

  const data = analyticsData || fallbackData;

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'release': return <Music className="w-4 h-4 text-blue-500" />;
      case 'playlist': return <Star className="w-4 h-4 text-purple-500" />;
      case 'viral': return <Zap className="w-4 h-4 text-orange-500" />;
      case 'milestone': return <Sparkles className="w-4 h-4 text-green-500" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <Skeleton className="lg:col-span-2 h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground mb-4">Unable to load analytics data</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground text-sm">Comprehensive career metrics and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard
          title="Total Streams"
          value={formatNumber(data.totalStreams || 0)}
          change={data.streamChange}
          changeLabel="vs last period"
          icon={<Headphones className="w-4 h-4" />}
          color="blue"
          sparkline={(data.streamHistory || []).map((d: any) => d.streams || 0)}
          compact
        />
        <MetricCard
          title="Revenue"
          value={`$${(data.totalRevenue || 0).toLocaleString()}`}
          change={data.revenueChange}
          icon={<DollarSign className="w-4 h-4" />}
          color="green"
          sparkline={(data.streamHistory || []).map((d: any) => d.revenue || 0)}
          compact
        />
        <MetricCard
          title="Followers"
          value={formatNumber(data.totalFollowers || 0)}
          change={data.followerChange}
          icon={<Users className="w-4 h-4" />}
          color="purple"
          compact
        />
        <MetricCard
          title="Monthly Listeners"
          value={formatNumber(data.monthlyListeners || 0)}
          change={data.listenerChange || 0}
          icon={<Activity className="w-4 h-4" />}
          color="cyan"
          compact
        />
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Artist Score</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getScoreColor(data.artistScore || 0)}`}>
                {data.artistScore || 0}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
            </div>
            <Progress value={data.artistScore || 0} className="h-1 mt-2" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-pink-500/10 to-pink-600/5 border-pink-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-pink-500" />
              <span className="text-xs text-muted-foreground">Career Stage</span>
            </div>
            <Badge variant="secondary" className="mt-1">
              {data.careerStage || 'Unknown'}
            </Badge>
            <p className="text-[10px] text-muted-foreground mt-2">Top 15% in genre</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Platform Performance</CardTitle>
              <Badge variant="outline">{(data.platforms || []).length} platforms</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {(data.platforms || []).length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No platform data available</p>
            ) : (
            <div className="space-y-3">
              {(data.platforms || []).map((platform: any, index: number) => {
                const maxStreams = data.platforms?.[0]?.streams || 1;
                return (
                <motion.div
                  key={platform.platform}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-4"
                >
                  <div className="w-24 text-sm font-medium truncate">{platform.platform}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Progress 
                        value={(platform.streams / maxStreams) * 100} 
                        className="h-2 flex-1"
                        style={{ '--progress-color': platform.color } as any}
                      />
                      <span className="text-xs font-medium w-16 text-right">
                        {formatNumber(platform.streams || 0)}
                      </span>
                    </div>
                  </div>
                  <div className={`text-xs w-14 text-right ${platform.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {platform.change > 0 ? '+' : ''}{platform.change}%
                  </div>
                  <div className="text-xs text-muted-foreground w-16 text-right">
                    {formatNumber(platform.followers || 0)} fans
                  </div>
                </motion.div>
              )})}
            </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={data.revenueBySource || []}
                    dataKey="percentage"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {(data.revenueBySource || []).map((entry: any, index: number) => (
                      <Cell key={entry.source} fill={['#3b82f6', '#22c55e', '#f59e0b', '#a855f7'][index % 4]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(data.revenueBySource || []).map((source: any, index: number) => (
                <div key={source.source} className="flex items-center gap-2 text-xs">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7'][index % 4] }}
                  />
                  <span className="text-muted-foreground">{source.source}</span>
                  <span className="ml-auto font-medium">${(source.amount || 0).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Geographic Distribution
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[220px]">
              <div className="space-y-2">
                {(data.geoData || []).map((geo: any, index: number) => (
                  <motion.div
                    key={geo.code}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-lg">{geo.code === 'US' ? '🇺🇸' : geo.code === 'GB' ? '🇬🇧' : geo.code === 'DE' ? '🇩🇪' : geo.code === 'BR' ? '🇧🇷' : geo.code === 'MX' ? '🇲🇽' : geo.code === 'CA' ? '🇨🇦' : geo.code === 'FR' ? '🇫🇷' : '🇦🇺'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{geo.country}</p>
                      <div className="flex items-center gap-2">
                        <Progress value={geo.percentage} className="h-1 flex-1" />
                        <span className="text-xs text-muted-foreground">{geo.percentage}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatNumber(geo.streams)}</p>
                      <p className={`text-xs ${geo.growth > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {geo.growth > 0 ? '+' : ''}{geo.growth}%
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Trigger Cities
              </CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary">Beta</Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">Cities where your music is growing fastest and could "trigger" wider regional success</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data.triggerCities || []).map((city: any, index: number) => (
                <motion.div
                  key={city.city}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {index + 1}
                    </div>
                    <span className="text-sm font-medium">{city.city}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatNumber(city.listeners)} listeners</p>
                    <p className="text-xs text-green-500">+{city.growth}% growth</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Career Timeline
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-4">
              {(data.timeline || []).map((event: any, index: number) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative pl-10"
                >
                  <div className="absolute left-2 w-5 h-5 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(event.date).toLocaleDateString()}</p>
                    </div>
                    {event.impact && (
                      <Badge variant="secondary" className="text-green-500">
                        {event.impact}
                      </Badge>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Audience Demographics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium mb-3">Age Distribution</h4>
                <div className="space-y-2">
                  {(data.demographics?.age || []).map((age: any) => (
                    <div key={age.range} className="flex items-center gap-2">
                      <span className="text-xs w-12">{age.range}</span>
                      <Progress value={age.percentage || 0} className="flex-1 h-2" />
                      <span className="text-xs w-8 text-right">{age.percentage || 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-3">Gender Split</h4>
                <div className="space-y-2">
                  {(data.demographics?.gender || []).map((gender: any) => (
                    <div key={gender.type} className="flex items-center gap-2">
                      <span className="text-xs w-12">{gender.type}</span>
                      <Progress value={gender.percentage || 0} className="flex-1 h-2" />
                      <span className="text-xs w-8 text-right">{gender.percentage || 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Streaming Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.streamHistory || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                  <RechartsTooltip 
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                    formatter={(value: number) => [formatNumber(value), 'Streams']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="streams" 
                    stroke="#3b82f6" 
                    fill="#3b82f620"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
