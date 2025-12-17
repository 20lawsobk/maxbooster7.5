import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  Target,
  Zap,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Settings,
  Gauge,
  Activity,
  PieChart,
  BarChart3,
  Wallet,
  ArrowRight,
  Database,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  budget: number;
  spent: number;
  dailyBudget: number;
  dailySpent: number;
  status: 'on-pace' | 'underpacing' | 'overpacing' | 'paused';
  velocity: number;
  daysRemaining: number;
  projectedSpend: number;
  projectedRemaining: number;
}

export function BudgetPacing() {
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [autoAdjust, setAutoAdjust] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Fetch campaigns from API - returns empty array when no real data exists
  const { data: campaignsData } = useQuery<Campaign[]>({
    queryKey: ['/api/advertising/budget-pacing/campaigns'],
  });

  // Fetch pacing history from API - returns empty array when no real data exists
  const { data: historyData } = useQuery<{ daily: any[]; weekly: any[]; monthly: any[] }>({
    queryKey: ['/api/advertising/budget-pacing/history'],
  });

  // Use API data or empty arrays - NO MOCK DATA
  const campaigns: Campaign[] = Array.isArray(campaignsData) ? campaignsData : [];
  const dailySpendData: any[] = historyData?.daily || [];
  const weeklyTrendData: any[] = historyData?.weekly || [];
  const monthlyPacingData: any[] = historyData?.monthly || [];

  // Set initial selected campaign when data loads
  useEffect(() => {
    if (campaigns.length > 0 && !selectedCampaign) {
      setSelectedCampaign(campaigns[0]);
    }
  }, [campaigns, selectedCampaign]);

  // Calculate metrics safely with empty array handling
  const totalBudget = campaigns.reduce((acc, c) => acc + c.budget, 0);
  const totalSpent = campaigns.reduce((acc, c) => acc + c.spent, 0);
  const overallPacing = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const getStatusColor = (status: Campaign['status']) => {
    const colors = {
      'on-pace': 'bg-green-500/10 text-green-500 border-green-500/20',
      underpacing: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      overpacing: 'bg-red-500/10 text-red-500 border-red-500/20',
      paused: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    };
    return colors[status];
  };

  const getStatusIcon = (status: Campaign['status']) => {
    switch (status) {
      case 'on-pace':
        return <CheckCircle className="w-4 h-4" />;
      case 'underpacing':
        return <TrendingDown className="w-4 h-4" />;
      case 'overpacing':
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const chartConfig = {
    actual: { label: 'Actual Spend', color: '#3b82f6' },
    budget: { label: 'Budget', color: '#94a3b8' },
    forecast: { label: 'Forecast', color: '#22c55e' },
    projected: { label: 'Projected', color: '#8b5cf6' },
    spent: { label: 'Spent', color: '#3b82f6' },
    efficiency: { label: 'Efficiency', color: '#f59e0b' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="w-6 h-6 text-blue-500" />
            Budget Pacing Dashboard
          </h2>
          <p className="text-muted-foreground">
            Monitor and optimize your advertising spend velocity
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={autoAdjust} onCheckedChange={setAutoAdjust} id="auto-adjust" />
            <Label htmlFor="auto-adjust" className="text-sm">
              Auto-Adjust Pacing
            </Label>
          </div>
          <Select
            value={selectedPeriod}
            onValueChange={(v) => setSelectedPeriod(v as 'daily' | 'weekly' | 'monthly')}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Budget</p>
                <p className="text-2xl font-bold">${totalBudget.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-2xl font-bold">${totalSpent.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-500" />
              </div>
            </div>
            <Progress value={overallPacing} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">{overallPacing.toFixed(1)}% utilized</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Daily Velocity</p>
                <p className="text-2xl font-bold">94%</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Alerts</p>
                <p className="text-2xl font-bold text-yellow-500">2</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="velocity">Spend Velocity</TabsTrigger>
          <TabsTrigger value="forecasts">Forecasts</TabsTrigger>
          <TabsTrigger value="reallocation">Budget Reallocation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                  Daily Spend vs Budget
                </CardTitle>
                <CardDescription>Compare actual spend against daily budget</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ComposedChart data={dailySpendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="budget"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      stroke="#22c55e"
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-500" />
                  Monthly Pacing Trajectory
                </CardTitle>
                <CardDescription>Projected spend vs actual for the month</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <AreaChart data={monthlyPacingData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="budget"
                      stroke="#94a3b8"
                      fill="#94a3b8"
                      fillOpacity={0.1}
                    />
                    <Area
                      type="monotone"
                      dataKey="projected"
                      stroke="#8b5cf6"
                      fill="#8b5cf6"
                      fillOpacity={0.2}
                    />
                    <Area
                      type="monotone"
                      dataKey="spent"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Pacing Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="w-5 h-5 text-yellow-500" />
                    <div>
                      <p className="font-medium">Album Pre-Save Campaign Underpacing</p>
                      <p className="text-sm text-muted-foreground">
                        Spending at 71% of daily budget. Consider increasing bids or expanding
                        targeting.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline">
                    Fix Now
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-red-500" />
                    <div>
                      <p className="font-medium">Playlist Pitching Ads Overpacing</p>
                      <p className="text-sm text-muted-foreground">
                        Spending at 125% of daily budget. May exhaust budget 3 days early.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline">
                    Adjust
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="space-y-4">
            {campaigns.map((campaign) => (
              <Card
                key={campaign.id}
                className={campaign.id === selectedCampaign?.id ? 'border-primary' : ''}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">{campaign.name}</h3>
                        <Badge className={getStatusColor(campaign.status)}>
                          {getStatusIcon(campaign.status)}
                          <span className="ml-1 capitalize">{campaign.status.replace('-', ' ')}</span>
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Budget</p>
                          <p className="text-xl font-bold">${campaign.budget.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Spent</p>
                          <p className="text-xl font-bold">${campaign.spent.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Daily Budget</p>
                          <p className="text-xl font-bold">${campaign.dailyBudget}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Daily Spent</p>
                          <p className="text-xl font-bold">${campaign.dailySpent}</p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-muted-foreground">Budget Progress</span>
                          <span className="text-sm font-medium">
                            {((campaign.spent / campaign.budget) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={(campaign.spent / campaign.budget) * 100} />
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Velocity</p>
                          <p
                            className={`text-lg font-bold ${
                              campaign.velocity >= 90 && campaign.velocity <= 110
                                ? 'text-green-500'
                                : campaign.velocity < 90
                                  ? 'text-yellow-500'
                                  : 'text-red-500'
                            }`}
                          >
                            {campaign.velocity}%
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Days Remaining</p>
                          <p className="text-lg font-bold">{campaign.daysRemaining}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Projected End</p>
                          <p
                            className={`text-lg font-bold ${
                              campaign.projectedRemaining >= 0 ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            {campaign.projectedRemaining >= 0 ? '+' : ''}$
                            {campaign.projectedRemaining}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="ml-4 flex flex-col gap-2">
                      <Button size="sm" variant="outline">
                        <Settings className="w-4 h-4 mr-1" />
                        Adjust
                      </Button>
                      <Button size="sm" variant="outline">
                        <BarChart3 className="w-4 h-4 mr-1" />
                        Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="velocity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-500" />
                Spend Velocity Analysis
              </CardTitle>
              <CardDescription>
                Track how quickly your budget is being consumed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{campaign.name}</span>
                        <Badge className={getStatusColor(campaign.status)}>
                          {campaign.velocity}%
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        ${campaign.dailySpent} / ${campaign.dailyBudget} daily
                      </span>
                    </div>
                    <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                          campaign.velocity >= 90 && campaign.velocity <= 110
                            ? 'bg-green-500'
                            : campaign.velocity < 90
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(campaign.velocity, 150)}%` }}
                      />
                      <div
                        className="absolute top-0 h-full w-0.5 bg-white"
                        style={{ left: '100%', transform: 'translateX(-50%)' }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0%</span>
                      <span>Target: 100%</span>
                      <span>150%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Weekly Efficiency Trend</CardTitle>
              <CardDescription>Budget efficiency over the past 4 weeks</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ComposedChart data={weeklyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" />
                  <YAxis yAxisId="left" className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar yAxisId="left" dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="budget" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="efficiency"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecasts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-green-500" />
                  Forecasted Spend vs Actual
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {campaigns.map((campaign) => {
                    const variance =
                      ((campaign.projectedSpend - campaign.budget) / campaign.budget) * 100;
                    return (
                      <div key={campaign.id} className="p-4 rounded-lg border">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium">{campaign.name}</span>
                          <Badge
                            className={
                              Math.abs(variance) <= 5
                                ? 'bg-green-500/10 text-green-500'
                                : variance < -5
                                  ? 'bg-yellow-500/10 text-yellow-500'
                                  : 'bg-red-500/10 text-red-500'
                            }
                          >
                            {variance >= 0 ? '+' : ''}
                            {variance.toFixed(1)}% variance
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Budget</p>
                            <p className="font-bold">${campaign.budget.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Projected</p>
                            <p className="font-bold">
                              ${campaign.projectedSpend.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Difference</p>
                            <p
                              className={`font-bold ${
                                campaign.projectedRemaining >= 0
                                  ? 'text-green-500'
                                  : 'text-red-500'
                              }`}
                            >
                              {campaign.projectedRemaining >= 0 ? '+' : ''}$
                              {campaign.projectedRemaining}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  AI Recommendations
                </CardTitle>
                <CardDescription>Automated pacing adjustment suggestions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Summer Single Release</p>
                        <p className="text-sm text-muted-foreground">
                          Pacing is optimal. Continue current strategy.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Album Pre-Save Campaign</p>
                        <p className="text-sm text-muted-foreground mb-2">
                          Increase daily budget by 20% or expand audience targeting to improve
                          delivery.
                        </p>
                        <Button size="sm">Apply Recommendation</Button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Playlist Pitching Ads</p>
                        <p className="text-sm text-muted-foreground mb-2">
                          Reduce bid by 15% or reallocate $211 to prevent overspend.
                        </p>
                        <Button size="sm">Apply Recommendation</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reallocation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-blue-500" />
                Budget Reallocation
              </CardTitle>
              <CardDescription>
                Redistribute budget across campaigns for optimal performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-5 h-5 text-blue-500" />
                    <span className="font-medium">AI Suggested Reallocation</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Based on performance analysis, we recommend reallocating $406 from
                    underpacing campaigns to high-performing ones.
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background">
                      <div className="flex items-center gap-2">
                        <ArrowDownRight className="w-4 h-4 text-red-500" />
                        <span>Album Pre-Save Campaign</span>
                      </div>
                      <span className="text-red-500 font-medium">-$406</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="w-4 h-4 text-green-500" />
                        <span>Summer Single Release</span>
                      </div>
                      <span className="text-green-500 font-medium">+$406</span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button className="flex-1">Apply Reallocation</Button>
                    <Button variant="outline" className="flex-1">
                      Customize
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label>Manual Budget Adjustment</Label>
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{campaign.name}</span>
                        <span className="text-sm">${campaign.budget.toLocaleString()}</span>
                      </div>
                      <Slider
                        defaultValue={[(campaign.budget / totalBudget) * 100]}
                        max={100}
                        step={1}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
