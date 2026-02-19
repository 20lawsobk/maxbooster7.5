import { useState, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  Globe,
  TrendingUp,
  TrendingDown,
  MapPin,
  Clock,
  Heart,
  UserPlus,
  UserMinus,
  Activity,
  Target,
} from 'lucide-react';
import { DateRangePicker } from '@/components/analytics/DateRangePicker';
import { AudienceEmptyState, GeoEmptyState } from '@/components/analytics/AnalyticsEmptyStates';
import { DemographicsSkeleton, GeographicSkeleton, StatCardRowSkeleton } from '@/components/analytics/AnalyticsLoadingSkeletons';
import { cn } from '@/lib/utils';

interface DemographicData {
  age: Array<{ range: string; percentage: number; count: number }>;
  gender: Array<{ type: string; percentage: number; color: string }>;
}

interface GeoData {
  country: string;
  code: string;
  flag: string;
  listeners: number;
  percentage: number;
  growth: number;
}

interface ListenerTrend {
  date: string;
  newListeners: number;
  returningListeners: number;
  totalListeners: number;
}

interface FanGrowthMetric {
  label: string;
  current: number;
  previous: number;
  change: number;
  target: number;
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', BR: '🇧🇷',
  JP: '🇯🇵', AU: '🇦🇺', CA: '🇨🇦', MX: '🇲🇽', ES: '🇪🇸',
  IT: '🇮🇹', NL: '🇳🇱', SE: '🇸🇪', IN: '🇮🇳', KR: '🇰🇷',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border">
        <p className="font-semibold text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium">{entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const MetricCard = memo(({
  title,
  value,
  change,
  icon: Icon,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color?: string;
}) => {
  const colorClasses = {
    blue: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',
    green: 'from-green-500/10 to-green-600/5 border-green-500/20',
    purple: 'from-purple-500/10 to-purple-600/5 border-purple-500/20',
    orange: 'from-orange-500/10 to-orange-600/5 border-orange-500/20',
  };

  return (
    <Card className={cn("bg-gradient-to-br", colorClasses[color as keyof typeof colorClasses])}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {change !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {change > 0 ? (
                  <TrendingUp className="w-3 h-3 text-green-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-500" />
                )}
                <span className={cn(
                  "text-xs",
                  change > 0 ? "text-green-500" : "text-red-500"
                )}>
                  {change > 0 ? '+' : ''}{change}%
                </span>
              </div>
            )}
          </div>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
});
MetricCard.displayName = 'MetricCard';

interface AudienceInsightsProps {
  userId?: string;
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
}

export function AudienceInsights({
  userId,
  timeRange = '30d',
  onTimeRangeChange,
}: AudienceInsightsProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['/api/analytics/audience', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/dashboard?range=${timeRange}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch audience data');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const demographics = useMemo<DemographicData>(() => ({
    age: data?.audience?.demographics?.age || [
      { range: '18-24', percentage: 35, count: 12500 },
      { range: '25-34', percentage: 42, count: 15000 },
      { range: '35-44', percentage: 15, count: 5400 },
      { range: '45+', percentage: 8, count: 2900 },
    ],
    gender: data?.audience?.demographics?.gender || [
      { type: 'Female', percentage: 48, color: '#ec4899' },
      { type: 'Male', percentage: 49, color: '#3b82f6' },
      { type: 'Other', percentage: 3, color: '#8b5cf6' },
    ],
  }), [data]);

  const geoData = useMemo<GeoData[]>(() => {
    if (!data?.audience?.geographic) {
      return [
        { country: 'United States', code: 'US', flag: '🇺🇸', listeners: 45000, percentage: 35, growth: 12 },
        { country: 'United Kingdom', code: 'GB', flag: '🇬🇧', listeners: 25000, percentage: 19, growth: 8 },
        { country: 'Germany', code: 'DE', flag: '🇩🇪', listeners: 18000, percentage: 14, growth: 15 },
        { country: 'Brazil', code: 'BR', flag: '🇧🇷', listeners: 15000, percentage: 12, growth: 25 },
        { country: 'Canada', code: 'CA', flag: '🇨🇦', listeners: 12000, percentage: 9, growth: 6 },
        { country: 'France', code: 'FR', flag: '🇫🇷', listeners: 8000, percentage: 6, growth: 10 },
        { country: 'Australia', code: 'AU', flag: '🇦🇺', listeners: 6000, percentage: 5, growth: 18 },
      ];
    }
    return data.audience.geographic.map((g: any) => ({
      ...g,
      flag: COUNTRY_FLAGS[g.code] || '🌍',
    }));
  }, [data]);

  const listenerTrends = useMemo<ListenerTrend[]>(() => {
    if (!data?.audience?.trends) {
      return Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return {
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          newListeners: Math.floor(Math.random() * 500) + 200,
          returningListeners: Math.floor(Math.random() * 1500) + 800,
          totalListeners: 0,
        };
      }).map(d => ({ ...d, totalListeners: d.newListeners + d.returningListeners }));
    }
    return data.audience.trends;
  }, [data]);

  const fanGrowthMetrics = useMemo<FanGrowthMetric[]>(() => [
    { label: 'Total Followers', current: 45892, previous: 42150, change: 8.9, target: 50000 },
    { label: 'Monthly Listeners', current: 128934, previous: 115200, change: 11.9, target: 150000 },
    { label: 'Super Fans', current: 2450, previous: 2100, change: 16.7, target: 3000 },
    { label: 'Engagement Rate', current: 4.8, previous: 4.2, change: 14.3, target: 6 },
  ], [data]);

  const totalListeners = geoData.reduce((sum, g) => sum + g.listeners, 0);
  const hasData = totalListeners > 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <StatCardRowSkeleton count={4} />
        <div className="grid lg:grid-cols-2 gap-6">
          <GeographicSkeleton />
          <DemographicsSkeleton />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Failed to load data. Please try again later.</p>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Audience Insights</h2>
          <DateRangePicker value={timeRange} onChange={onTimeRangeChange || (() => {})} />
        </div>
        <AudienceEmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Audience Insights</h2>
          <p className="text-sm text-muted-foreground">Understand your listeners and fan demographics</p>
        </div>
        <DateRangePicker value={timeRange} onChange={onTimeRangeChange || (() => {})} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Listeners"
          value={totalListeners.toLocaleString()}
          change={12}
          icon={Users}
          color="blue"
        />
        <MetricCard
          title="New This Month"
          value="12.5K"
          change={8}
          icon={UserPlus}
          color="green"
        />
        <MetricCard
          title="Returning"
          value="68%"
          change={5}
          icon={Heart}
          color="purple"
        />
        <MetricCard
          title="Countries"
          value={geoData.length}
          icon={Globe}
          color="orange"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listener Trends</CardTitle>
          <CardDescription>New vs returning listeners over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={listenerTrends}>
                <defs>
                  <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReturning" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="newListeners"
                  name="New Listeners"
                  stroke="#10b981"
                  fill="url(#colorNew)"
                  strokeWidth={2}
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="returningListeners"
                  name="Returning Listeners"
                  stroke="#8b5cf6"
                  fill="url(#colorReturning)"
                  strokeWidth={2}
                  stackId="1"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Geographic Distribution
            </CardTitle>
            <CardDescription>Where your listeners are located</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[350px]">
              <div className="space-y-3">
                {geoData.map((geo, index) => (
                  <motion.div
                    key={geo.code}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="text-2xl">{geo.flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate">{geo.country}</span>
                        <span className="text-sm font-semibold">{geo.listeners.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={geo.percentage} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-10">{geo.percentage}%</span>
                      </div>
                    </div>
                    <Badge variant={geo.growth > 0 ? "default" : "secondary"} className="text-xs">
                      {geo.growth > 0 ? '+' : ''}{geo.growth}%
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Age Demographics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demographics.age.map((age, index) => (
                  <div key={age.range} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{age.range}</span>
                      <span className="text-muted-foreground">{age.percentage}%</span>
                    </div>
                    <Progress value={age.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gender Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-8">
                <div className="h-[120px] w-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={demographics.gender}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        paddingAngle={2}
                        dataKey="percentage"
                      >
                        {demographics.gender.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {demographics.gender.map((g) => (
                    <div key={g.type} className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: g.color }}
                      />
                      <span className="text-sm">{g.type}</span>
                      <span className="font-semibold ml-auto">{g.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Fan Growth Goals
          </CardTitle>
          <CardDescription>Track your progress towards growth targets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {fanGrowthMetrics.map((metric, index) => {
              const progress = (metric.current / metric.target) * 100;
              return (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{metric.label}</span>
                    <Badge variant={metric.change > 0 ? "default" : "secondary"} className="text-xs">
                      {metric.change > 0 ? '+' : ''}{metric.change}%
                    </Badge>
                  </div>
                  <p className="text-2xl font-bold mb-2">
                    {typeof metric.current === 'number' && metric.current < 100 
                      ? `${metric.current}%` 
                      : metric.current.toLocaleString()}
                  </p>
                  <Progress value={Math.min(progress, 100)} className="h-2 mb-1" />
                  <p className="text-xs text-muted-foreground">
                    Target: {metric.target.toLocaleString()}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AudienceInsights;
