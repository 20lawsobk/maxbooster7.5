import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Eye,
  Play,
  DollarSign,
  ShoppingCart,
  Users,
  Music,
  Target,
  Zap,
  Award,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface AnalyticsData {
  overview: {
    totalViews: number;
    totalPlays: number;
    totalSales: number;
    totalRevenue: number;
    conversionRate: number;
    avgOrderValue: number;
    viewsChange: number;
    playsChange: number;
    salesChange: number;
    revenueChange: number;
  };
  timeline: Array<{
    date: string;
    views: number;
    plays: number;
    sales: number;
    revenue: number;
  }>;
  topBeats: Array<{
    id: string;
    title: string;
    views: number;
    plays: number;
    sales: number;
    revenue: number;
    conversionRate: number;
  }>;
  licenseBreakdown: Array<{
    type: string;
    count: number;
    revenue: number;
    percentage: number;
  }>;
  trafficSources: Array<{
    source: string;
    visits: number;
    conversions: number;
    percentage: number;
  }>;
  geographicData: Array<{
    country: string;
    plays: number;
    sales: number;
  }>;
}

const COLORS = ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#6366F1'];

const mockAnalytics: AnalyticsData = {
  overview: {
    totalViews: 45620,
    totalPlays: 28340,
    totalSales: 847,
    totalRevenue: 34580.50,
    conversionRate: 2.98,
    avgOrderValue: 40.83,
    viewsChange: 12.5,
    playsChange: 8.3,
    salesChange: 15.2,
    revenueChange: 22.8,
  },
  timeline: [
    { date: 'Jan', views: 3200, plays: 1800, sales: 52, revenue: 2100 },
    { date: 'Feb', views: 3800, plays: 2200, sales: 68, revenue: 2750 },
    { date: 'Mar', views: 4100, plays: 2500, sales: 75, revenue: 3050 },
    { date: 'Apr', views: 3600, plays: 2100, sales: 61, revenue: 2480 },
    { date: 'May', views: 4500, plays: 2800, sales: 89, revenue: 3620 },
    { date: 'Jun', views: 5200, plays: 3200, sales: 102, revenue: 4150 },
    { date: 'Jul', views: 4800, plays: 2900, sales: 94, revenue: 3820 },
    { date: 'Aug', views: 5500, plays: 3400, sales: 112, revenue: 4560 },
    { date: 'Sep', views: 4900, plays: 3000, sales: 98, revenue: 3990 },
    { date: 'Oct', views: 5100, plays: 3150, sales: 96, revenue: 4060 },
  ],
  topBeats: [
    { id: '1', title: 'Midnight Dreams', views: 8540, plays: 5200, sales: 156, revenue: 6250, conversionRate: 3.0 },
    { id: '2', title: 'Dark Energy', views: 6820, plays: 4100, sales: 128, revenue: 5120, conversionRate: 3.12 },
    { id: '3', title: 'Summer Vibes', views: 5430, plays: 3200, sales: 98, revenue: 3920, conversionRate: 3.06 },
    { id: '4', title: 'Trap Soul', views: 4890, plays: 2800, sales: 87, revenue: 3480, conversionRate: 3.11 },
    { id: '5', title: 'Wavy Days', views: 4210, plays: 2500, sales: 76, revenue: 3040, conversionRate: 3.04 },
  ],
  licenseBreakdown: [
    { type: 'Basic', count: 420, revenue: 12600, percentage: 49.6 },
    { type: 'Premium', count: 280, revenue: 13960, percentage: 33.1 },
    { type: 'Unlimited', count: 95, revenue: 7600, percentage: 11.2 },
    { type: 'Exclusive', count: 52, revenue: 10400, percentage: 6.1 },
  ],
  trafficSources: [
    { source: 'Direct', visits: 15200, conversions: 450, percentage: 33.3 },
    { source: 'Social Media', visits: 12800, conversions: 320, percentage: 28.1 },
    { source: 'Search', visits: 9500, conversions: 280, percentage: 20.8 },
    { source: 'Referral', visits: 5100, conversions: 140, percentage: 11.2 },
    { source: 'Email', visits: 3020, conversions: 95, percentage: 6.6 },
  ],
  geographicData: [
    { country: 'United States', plays: 12500, sales: 380 },
    { country: 'United Kingdom', plays: 4200, sales: 125 },
    { country: 'Germany', plays: 3100, sales: 92 },
    { country: 'Canada', plays: 2800, sales: 85 },
    { country: 'France', plays: 2200, sales: 65 },
  ],
};

function StatCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  prefix = '', 
  suffix = '' 
}: { 
  title: string; 
  value: number; 
  change: number; 
  icon: React.ElementType; 
  prefix?: string;
  suffix?: string;
}) {
  const isPositive = change >= 0;
  
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Icon className="h-5 w-5 text-purple-400" />
          </div>
          <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {Math.abs(change)}%
          </div>
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold text-white">
            {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
          </p>
          <p className="text-sm text-slate-400">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProducerAnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState('30d');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: analytics = mockAnalytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/marketplace/producer-analytics', timeRange],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/producer-analytics?timeRange=${timeRange}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-purple-400" />
            Producer Analytics
          </h2>
          <p className="text-slate-400 mt-1">Track your beat performance and sales</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Views" 
          value={analytics.overview.totalViews} 
          change={analytics.overview.viewsChange} 
          icon={Eye} 
        />
        <StatCard 
          title="Total Plays" 
          value={analytics.overview.totalPlays} 
          change={analytics.overview.playsChange} 
          icon={Play} 
        />
        <StatCard 
          title="Total Sales" 
          value={analytics.overview.totalSales} 
          change={analytics.overview.salesChange} 
          icon={ShoppingCart} 
        />
        <StatCard 
          title="Total Revenue" 
          value={analytics.overview.totalRevenue} 
          change={analytics.overview.revenueChange} 
          icon={DollarSign}
          prefix="$"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-500/20">
              <Target className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{analytics.overview.conversionRate}%</p>
              <p className="text-sm text-slate-400">Conversion Rate</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-500/20">
              <Zap className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">${analytics.overview.avgOrderValue.toFixed(2)}</p>
              <p className="text-sm text-slate-400">Avg. Order Value</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-500/20">
              <Award className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{analytics.topBeats.length}</p>
              <p className="text-sm text-slate-400">Active Beats</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/50 border-slate-700">
          <TabsTrigger value="overview">Performance</TabsTrigger>
          <TabsTrigger value="beats">Top Beats</TabsTrigger>
          <TabsTrigger value="licenses">License Breakdown</TabsTrigger>
          <TabsTrigger value="traffic">Traffic Sources</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Performance Over Time</CardTitle>
              <CardDescription>Views, plays, sales, and revenue trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#F9FAFB' }}
                    />
                    <Area type="monotone" dataKey="views" stackId="1" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="plays" stackId="2" stroke="#EC4899" fill="#EC4899" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="beats" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Top Performing Beats</CardTitle>
              <CardDescription>Your best selling beats ranked by revenue</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.topBeats.map((beat, index) => (
                  <div key={beat.id} className="flex items-center gap-4 p-4 rounded-lg bg-slate-700/30">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-white">{beat.title}</h4>
                      <div className="flex gap-4 mt-1 text-sm text-slate-400">
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {beat.views.toLocaleString()}</span>
                        <span className="flex items-center gap-1"><Play className="h-3 w-3" /> {beat.plays.toLocaleString()}</span>
                        <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" /> {beat.sales}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-400">${beat.revenue.toLocaleString()}</p>
                      <p className="text-xs text-slate-400">{beat.conversionRate}% conversion</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="licenses" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">License Distribution</CardTitle>
                <CardDescription>Sales breakdown by license type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.licenseBreakdown}
                        dataKey="count"
                        nameKey="type"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ type, percentage }) => `${type}: ${percentage}%`}
                      >
                        {analytics.licenseBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Revenue by License</CardTitle>
                <CardDescription>Total revenue per license tier</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.licenseBreakdown.map((license, index) => (
                    <div key={license.type}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-white">{license.type}</span>
                        <span className="text-sm text-slate-400">${license.revenue.toLocaleString()} ({license.count} sales)</span>
                      </div>
                      <Progress 
                        value={license.percentage} 
                        className="h-2"
                        style={{ '--progress-background': COLORS[index % COLORS.length] } as React.CSSProperties}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="traffic" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Traffic Sources</CardTitle>
              <CardDescription>Where your visitors come from</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.trafficSources} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" stroke="#9CA3AF" />
                    <YAxis dataKey="source" type="category" stroke="#9CA3AF" width={80} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                    />
                    <Bar dataKey="visits" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="conversions" fill="#10B981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
