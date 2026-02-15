import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Music,
  DollarSign,
  Zap,
  Award,
  Target,
  Crown,
  Flame,
  Star,
  Trophy,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GrowthMetrics {
  weekOverWeek: {
    streams: number;
    followers: number;
    revenue: number;
    engagement: number;
  };
  monthOverMonth: {
    streams: number;
    followers: number;
    revenue: number;
    engagement: number;
  };
  trend: 'rising' | 'stable' | 'declining';
  velocity: number;
}

interface CareerMilestone {
  id: string;
  type: string;
  title: string;
  description: string;
  value: number;
  achievedAt: string;
  icon: string;
}

interface DashboardData {
  careerScore: number;
  currentSnapshot: {
    totalStreams: number;
    totalFollowers: number;
    totalRevenue: number;
    totalReleases: number;
    engagementScore: number;
    growthRate: number;
  };
  previousPeriod: {
    totalStreams: number;
    totalFollowers: number;
    totalRevenue: number;
    engagementScore: number;
  };
  percentileRank: number;
  growthMetrics: GrowthMetrics;
}

interface HistoryDataPoint {
  date: string;
  streams: number;
  followers: number;
  revenue: number;
  engagementScore: number;
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

const formatCurrency = (num: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

const CareerScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const circumference = 2 * Math.PI * 45;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  const getScoreColor = (score: number) => {
    if (score >= 80) return { stroke: '#22c55e', bg: 'from-green-500/20 to-emerald-500/20', text: 'text-green-500' };
    if (score >= 60) return { stroke: '#3b82f6', bg: 'from-blue-500/20 to-cyan-500/20', text: 'text-blue-500' };
    if (score >= 40) return { stroke: '#f59e0b', bg: 'from-yellow-500/20 to-orange-500/20', text: 'text-yellow-500' };
    return { stroke: '#ef4444', bg: 'from-red-500/20 to-pink-500/20', text: 'text-red-500' };
  };

  const colors = getScoreColor(score);

  return (
    <div className={cn(
      "relative flex items-center justify-center p-6 rounded-2xl",
      "bg-gradient-to-br",
      colors.bg
    )}>
      <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={colors.stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          style={{
            filter: `drop-shadow(0 0 8px ${colors.stroke})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-4xl font-bold", colors.text)}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground font-medium">Career Score</span>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  current: number;
  previous: number;
  format?: 'number' | 'currency' | 'percent';
  icon: React.ReactNode;
  gradient: string;
}> = ({ title, current, previous, format = 'number', icon, gradient }) => {
  const percentChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const isPositive = percentChange >= 0;

  const formatValue = (val: number) => {
    switch (format) {
      case 'currency':
        return formatCurrency(val);
      case 'percent':
        return `${val.toFixed(1)}%`;
      default:
        return formatNumber(val);
    }
  };

  return (
    <Card className={cn("overflow-hidden border-0 shadow-lg", gradient)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/10 backdrop-blur-sm">
              {icon}
            </div>
            <div>
              <p className="text-xs text-white/70 font-medium">{title}</p>
              <p className="text-2xl font-bold text-white">{formatValue(current)}</p>
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold",
            isPositive ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
          )}>
            {isPositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {Math.abs(percentChange).toFixed(1)}%
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const GrowthChart: React.FC<{ data: HistoryDataPoint[]; dataKey: keyof HistoryDataPoint; color: string; title: string }> = ({
  data,
  dataKey,
  color,
  title,
}) => {
  return (
    <Card className="col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => formatNumber(value)}
              className="text-muted-foreground"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: number) => [formatNumber(value), title]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${dataKey})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

const MilestoneTimeline: React.FC<{ milestones: CareerMilestone[] }> = ({ milestones }) => {
  const getIconComponent = (icon: string) => {
    switch (icon) {
      case '🎵': return <Music className="w-4 h-4" />;
      case '👥': return <Users className="w-4 h-4" />;
      case '💰': return <DollarSign className="w-4 h-4" />;
      case '💿': return <Award className="w-4 h-4" />;
      case '⚡': return <Zap className="w-4 h-4" />;
      default: return <Star className="w-4 h-4" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Career Milestones
        </CardTitle>
        <CardDescription>Your journey to success</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
          {milestones.map((milestone, index) => (
            <div
              key={milestone.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg transition-all duration-300",
                "bg-gradient-to-r from-primary/5 to-transparent",
                "hover:from-primary/10 hover:to-primary/5",
                "border-l-2 border-primary/50"
              )}
              style={{
                animationDelay: `${index * 100}ms`,
              }}
            >
              <div className="p-2 rounded-full bg-primary/10 text-primary">
                {getIconComponent(milestone.icon)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{milestone.title}</p>
                  <Badge variant="secondary" className="text-xs">
                    {new Date(milestone.achievedAt).toLocaleDateString()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{milestone.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const PercentileCard: React.FC<{ percentile: number }> = ({ percentile }) => {
  const getMessage = (p: number) => {
    if (p <= 5) return { text: "Elite Artist", emoji: "🏆", color: "text-yellow-500" };
    if (p <= 15) return { text: "Rising Star", emoji: "⭐", color: "text-purple-500" };
    if (p <= 30) return { text: "Growing Artist", emoji: "🚀", color: "text-blue-500" };
    return { text: "Emerging Talent", emoji: "🌱", color: "text-green-500" };
  };

  const { text, emoji, color } = getMessage(percentile);

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
      <CardContent className="p-6 text-center">
        <div className="text-4xl mb-2">{emoji}</div>
        <p className={cn("text-3xl font-bold", color)}>Top {percentile}%</p>
        <p className="text-sm text-muted-foreground mt-1">{text}</p>
        <p className="text-xs text-muted-foreground mt-3">
          You're outperforming {100 - percentile}% of artists on the platform!
        </p>
      </CardContent>
    </Card>
  );
};

const GrowthIndicator: React.FC<{ metrics: GrowthMetrics }> = ({ metrics }) => {
  const getTrendIcon = () => {
    switch (metrics.trend) {
      case 'rising':
        return <Flame className="w-5 h-5 text-orange-500" />;
      case 'declining':
        return <TrendingDown className="w-5 h-5 text-red-500" />;
      default:
        return <Target className="w-5 h-5 text-blue-500" />;
    }
  };

  const getTrendColor = () => {
    switch (metrics.trend) {
      case 'rising':
        return 'bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border-orange-500/30';
      case 'declining':
        return 'bg-gradient-to-r from-red-500/20 to-pink-500/20 border-red-500/30';
      default:
        return 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/30';
    }
  };

  return (
    <Card className={cn("border", getTrendColor())}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          {getTrendIcon()}
          Growth Velocity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Week over Week</p>
            <div className="space-y-2">
              {Object.entries(metrics.weekOverWeek).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs capitalize">{key}</span>
                  <span className={cn(
                    "text-xs font-semibold flex items-center gap-1",
                    value >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    {value >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {Math.abs(value).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Month over Month</p>
            <div className="space-y-2">
              {Object.entries(metrics.monthOverMonth).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs capitalize">{key}</span>
                  <span className={cn(
                    "text-xs font-semibold flex items-center gap-1",
                    value >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    {value >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {Math.abs(value).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const ArtistProgressDashboard: React.FC = () => {
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery<{ data: DashboardData }>({
    queryKey: ['/api/artist-progress/dashboard'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ data: HistoryDataPoint[] }>({
    queryKey: ['/api/artist-progress/history'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: milestonesData, isLoading: milestonesLoading } = useQuery<{ data: CareerMilestone[] }>({
    queryKey: ['/api/artist-progress/milestones'],
    staleTime: 5 * 60 * 1000,
  });

  const dashboard = dashboardData?.data;
  const history = historyData?.data || [];
  const milestones = milestonesData?.data || [];

  if (dashboardLoading || historyLoading || milestonesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Crown className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Progress Data Yet</h3>
          <p className="text-muted-foreground">
            Start creating and distributing music to see your career progress!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="w-6 h-6 text-yellow-500" />
            Artist Progress Dashboard
          </h2>
          <p className="text-muted-foreground">Track your career growth and achievements</p>
        </div>
        <Badge variant="outline" className="text-sm">
          Updated {new Date().toLocaleDateString()}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Streams"
          current={dashboard.currentSnapshot.totalStreams}
          previous={dashboard.previousPeriod.totalStreams}
          icon={<Music className="w-5 h-5 text-white" />}
          gradient="bg-gradient-to-br from-purple-600 to-indigo-700"
        />
        <MetricCard
          title="Followers"
          current={dashboard.currentSnapshot.totalFollowers}
          previous={dashboard.previousPeriod.totalFollowers}
          icon={<Users className="w-5 h-5 text-white" />}
          gradient="bg-gradient-to-br from-pink-600 to-rose-700"
        />
        <MetricCard
          title="Revenue"
          current={dashboard.currentSnapshot.totalRevenue}
          previous={dashboard.previousPeriod.totalRevenue}
          format="currency"
          icon={<DollarSign className="w-5 h-5 text-white" />}
          gradient="bg-gradient-to-br from-emerald-600 to-teal-700"
        />
        <MetricCard
          title="Engagement"
          current={dashboard.currentSnapshot.engagementScore}
          previous={dashboard.previousPeriod.engagementScore}
          format="percent"
          icon={<Zap className="w-5 h-5 text-white" />}
          gradient="bg-gradient-to-br from-amber-600 to-orange-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Career Score</CardTitle>
              <CardDescription>Your overall performance rating</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <CareerScoreGauge score={dashboard.careerScore} />
            </CardContent>
          </Card>

          <PercentileCard percentile={dashboard.percentileRank} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <GrowthIndicator metrics={dashboard.growthMetrics} />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performance Trends</CardTitle>
              <CardDescription>30-day growth visualization</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => formatNumber(value)} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="streams" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Streams" />
                  <Line type="monotone" dataKey="followers" stroke="#ec4899" strokeWidth={2} dot={false} name="Followers" />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GrowthChart data={history} dataKey="streams" color="#8b5cf6" title="Streams Over Time" />
        <GrowthChart data={history} dataKey="followers" color="#ec4899" title="Followers Over Time" />
        <GrowthChart data={history} dataKey="revenue" color="#10b981" title="Revenue Over Time" />
      </div>

      <MilestoneTimeline milestones={milestones} />
    </div>
  );
};

export default ArtistProgressDashboard;
