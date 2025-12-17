import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Sankey,
  Tooltip,
  ResponsiveContainer,
  Treemap,
  LineChart,
  Line,
  ComposedChart,
  Area,
} from 'recharts';
import {
  GitBranch,
  Target,
  Eye,
  MousePointerClick,
  DollarSign,
  TrendingUp,
  Zap,
  Clock,
  Calendar,
  BarChart3,
  PieChartIcon,
  ArrowRight,
  CheckCircle,
  Users,
  Activity,
  Settings,
  RefreshCw,
  Layers,
  Share2,
  Filter,
  Info,
} from 'lucide-react';

type AttributionModel = 'first-click' | 'last-click' | 'linear' | 'time-decay' | 'position-based';

interface ChannelAttribution {
  channel: string;
  firstClick: number;
  lastClick: number;
  linear: number;
  timeDecay: number;
  positionBased: number;
  conversions: number;
  revenue: number;
  assists: number;
}

interface ConversionPath {
  id: string;
  path: string[];
  conversions: number;
  revenue: number;
  avgDaysToConvert: number;
}

const mockChannelData: ChannelAttribution[] = [
  {
    channel: 'Paid Social',
    firstClick: 32,
    lastClick: 18,
    linear: 25,
    timeDecay: 22,
    positionBased: 27,
    conversions: 245,
    revenue: 12450,
    assists: 189,
  },
  {
    channel: 'Organic Search',
    firstClick: 28,
    lastClick: 35,
    linear: 28,
    timeDecay: 30,
    positionBased: 30,
    conversions: 312,
    revenue: 15890,
    assists: 156,
  },
  {
    channel: 'Email Marketing',
    firstClick: 8,
    lastClick: 22,
    linear: 18,
    timeDecay: 20,
    positionBased: 16,
    conversions: 178,
    revenue: 8920,
    assists: 234,
  },
  {
    channel: 'Direct',
    firstClick: 15,
    lastClick: 12,
    linear: 12,
    timeDecay: 13,
    positionBased: 12,
    conversions: 89,
    revenue: 4560,
    assists: 45,
  },
  {
    channel: 'Referral',
    firstClick: 12,
    lastClick: 8,
    linear: 10,
    timeDecay: 9,
    positionBased: 10,
    conversions: 67,
    revenue: 3450,
    assists: 78,
  },
  {
    channel: 'Display Ads',
    firstClick: 5,
    lastClick: 5,
    linear: 7,
    timeDecay: 6,
    positionBased: 5,
    conversions: 45,
    revenue: 2280,
    assists: 123,
  },
];

const mockConversionPaths: ConversionPath[] = [
  {
    id: '1',
    path: ['Paid Social', 'Email', 'Organic Search', 'Direct'],
    conversions: 156,
    revenue: 7890,
    avgDaysToConvert: 8.5,
  },
  {
    id: '2',
    path: ['Organic Search', 'Direct'],
    conversions: 134,
    revenue: 6780,
    avgDaysToConvert: 3.2,
  },
  {
    id: '3',
    path: ['Paid Social', 'Paid Social', 'Email'],
    conversions: 98,
    revenue: 4950,
    avgDaysToConvert: 5.7,
  },
  {
    id: '4',
    path: ['Display', 'Paid Social', 'Organic Search', 'Email', 'Direct'],
    conversions: 67,
    revenue: 3450,
    avgDaysToConvert: 14.2,
  },
  {
    id: '5',
    path: ['Referral', 'Direct'],
    conversions: 45,
    revenue: 2280,
    avgDaysToConvert: 2.1,
  },
];

const windowComparisonData = [
  { window: '1 day', conversions: 234, value: 11780 },
  { window: '7 days', conversions: 456, value: 23120 },
  { window: '14 days', conversions: 578, value: 29340 },
  { window: '30 days', conversions: 689, value: 35010 },
  { window: '60 days', conversions: 745, value: 37890 },
  { window: '90 days', conversions: 782, value: 39650 },
];

const journeyTimelineData = [
  { touchpoint: 1, paidSocial: 35, organic: 25, email: 10, direct: 15, display: 15 },
  { touchpoint: 2, paidSocial: 28, organic: 30, email: 18, direct: 12, display: 12 },
  { touchpoint: 3, paidSocial: 22, organic: 28, email: 25, direct: 15, display: 10 },
  { touchpoint: 4, paidSocial: 18, organic: 25, email: 28, direct: 20, display: 9 },
  { touchpoint: 5, paidSocial: 15, organic: 20, email: 22, direct: 35, display: 8 },
];

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function AttributionDashboard() {
  const [selectedModel, setSelectedModel] = useState<AttributionModel>('position-based');
  const [attributionWindow, setAttributionWindow] = useState('30');
  const [showAssisted, setShowAssisted] = useState(true);

  const getModelValue = (channel: ChannelAttribution) => {
    switch (selectedModel) {
      case 'first-click':
        return channel.firstClick;
      case 'last-click':
        return channel.lastClick;
      case 'linear':
        return channel.linear;
      case 'time-decay':
        return channel.timeDecay;
      case 'position-based':
        return channel.positionBased;
    }
  };

  const totalConversions = mockChannelData.reduce((acc, c) => acc + c.conversions, 0);
  const totalRevenue = mockChannelData.reduce((acc, c) => acc + c.revenue, 0);
  const totalAssists = mockChannelData.reduce((acc, c) => acc + c.assists, 0);

  const chartData = mockChannelData.map((channel) => ({
    name: channel.channel,
    value: getModelValue(channel),
  }));

  const chartConfig = {
    paidSocial: { label: 'Paid Social', color: '#3b82f6' },
    organic: { label: 'Organic', color: '#22c55e' },
    email: { label: 'Email', color: '#f59e0b' },
    direct: { label: 'Direct', color: '#ef4444' },
    display: { label: 'Display', color: '#8b5cf6' },
    conversions: { label: 'Conversions', color: '#3b82f6' },
    value: { label: 'Value', color: '#22c55e' },
  };

  const modelDescriptions: Record<AttributionModel, string> = {
    'first-click': 'Gives 100% credit to the first touchpoint',
    'last-click': 'Gives 100% credit to the last touchpoint before conversion',
    linear: 'Distributes credit equally across all touchpoints',
    'time-decay': 'Gives more credit to touchpoints closer to conversion',
    'position-based': 'Gives 40% to first, 40% to last, 20% distributed to middle',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-blue-500" />
            Multi-Touch Attribution Dashboard
          </h2>
          <p className="text-muted-foreground">
            Understand the true impact of each marketing channel
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={attributionWindow} onValueChange={setAttributionWindow}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Attribution Window" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Day Window</SelectItem>
              <SelectItem value="14">14 Day Window</SelectItem>
              <SelectItem value="30">30 Day Window</SelectItem>
              <SelectItem value="60">60 Day Window</SelectItem>
              <SelectItem value="90">90 Day Window</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Conversions</p>
                <p className="text-2xl font-bold">{totalConversions.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Assisted Conversions</p>
                <p className="text-2xl font-bold">{totalAssists.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Touchpoints</p>
                <p className="text-2xl font-bold">3.2</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Attribution Model Comparison</CardTitle>
              <CardDescription>
                Compare how different models attribute credit to channels
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={selectedModel}
                onValueChange={(v) => setSelectedModel(v as AttributionModel)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first-click">First-Click</SelectItem>
                  <SelectItem value="last-click">Last-Click</SelectItem>
                  <SelectItem value="linear">Linear</SelectItem>
                  <SelectItem value="time-decay">Time-Decay</SelectItem>
                  <SelectItem value="position-based">Position-Based</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 text-sm">
              <Info className="w-4 h-4 text-blue-500" />
              <span className="font-medium">{selectedModel.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
              <span className="text-muted-foreground">{modelDescriptions[selectedModel]}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={mockChannelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="channel" type="category" className="text-xs" width={100} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey={
                    selectedModel === 'first-click'
                      ? 'firstClick'
                      : selectedModel === 'last-click'
                        ? 'lastClick'
                        : selectedModel === 'linear'
                          ? 'linear'
                          : selectedModel === 'time-decay'
                            ? 'timeDecay'
                            : 'positionBased'
                  }
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>

            <ChartContainer config={chartConfig} className="h-[300px]">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}%`}
                  labelLine
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="channels" className="space-y-4">
        <TabsList>
          <TabsTrigger value="channels">Channel Breakdown</TabsTrigger>
          <TabsTrigger value="paths">Conversion Paths</TabsTrigger>
          <TabsTrigger value="journey">Customer Journey</TabsTrigger>
          <TabsTrigger value="windows">Attribution Windows</TabsTrigger>
          <TabsTrigger value="assisted">Assisted Conversions</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" />
                Channel Contribution by Model
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Channel</th>
                      <th className="text-center py-3 px-4">First-Click</th>
                      <th className="text-center py-3 px-4">Last-Click</th>
                      <th className="text-center py-3 px-4">Linear</th>
                      <th className="text-center py-3 px-4">Time-Decay</th>
                      <th className="text-center py-3 px-4">Position-Based</th>
                      <th className="text-center py-3 px-4">Conversions</th>
                      <th className="text-center py-3 px-4">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockChannelData.map((channel, idx) => (
                      <tr key={channel.channel} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORS[idx] }}
                            />
                            {channel.channel}
                          </div>
                        </td>
                        <td className="text-center py-3 px-4">{channel.firstClick}%</td>
                        <td className="text-center py-3 px-4">{channel.lastClick}%</td>
                        <td className="text-center py-3 px-4">{channel.linear}%</td>
                        <td className="text-center py-3 px-4">{channel.timeDecay}%</td>
                        <td className="text-center py-3 px-4">{channel.positionBased}%</td>
                        <td className="text-center py-3 px-4">{channel.conversions}</td>
                        <td className="text-center py-3 px-4">${channel.revenue.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paths" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-purple-500" />
                Top Conversion Paths
              </CardTitle>
              <CardDescription>
                Most common customer journeys leading to conversion
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockConversionPaths.map((path, idx) => (
                  <div key={path.id} className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          #{idx + 1}
                        </Badge>
                        <span className="font-medium">{path.conversions} conversions</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          <DollarSign className="w-4 h-4 inline mr-1" />
                          ${path.revenue.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">
                          <Clock className="w-4 h-4 inline mr-1" />
                          {path.avgDaysToConvert} days avg
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {path.path.map((step, stepIdx) => (
                        <div key={stepIdx} className="flex items-center gap-2">
                          <Badge
                            className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-blue-500/30"
                          >
                            {step}
                          </Badge>
                          {stepIdx < path.path.length - 1 && (
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Share of conversions</span>
                        <span>{((path.conversions / totalConversions) * 100).toFixed(1)}%</span>
                      </div>
                      <Progress value={(path.conversions / totalConversions) * 100} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journey" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-500" />
                Cross-Channel Journey Visualization
              </CardTitle>
              <CardDescription>
                How channels contribute at each touchpoint in the journey
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px]">
                <ComposedChart data={journeyTimelineData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="touchpoint"
                    className="text-xs"
                    tickFormatter={(v) => `Touch ${v}`}
                  />
                  <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="paidSocial"
                    stackId="1"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                  />
                  <Area
                    type="monotone"
                    dataKey="organic"
                    stackId="1"
                    stroke="#22c55e"
                    fill="#22c55e"
                  />
                  <Area
                    type="monotone"
                    dataKey="email"
                    stackId="1"
                    stroke="#f59e0b"
                    fill="#f59e0b"
                  />
                  <Area
                    type="monotone"
                    dataKey="direct"
                    stackId="1"
                    stroke="#ef4444"
                    fill="#ef4444"
                  />
                  <Area
                    type="monotone"
                    dataKey="display"
                    stackId="1"
                    stroke="#8b5cf6"
                    fill="#8b5cf6"
                  />
                </ComposedChart>
              </ChartContainer>

              <div className="flex justify-center gap-6 mt-4">
                {[
                  { label: 'Paid Social', color: '#3b82f6' },
                  { label: 'Organic', color: '#22c55e' },
                  { label: 'Email', color: '#f59e0b' },
                  { label: 'Direct', color: '#ef4444' },
                  { label: 'Display', color: '#8b5cf6' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm">{item.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-5 h-5 text-blue-500" />
                  <span className="font-medium">Awareness Stage</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Top initiating channels:
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Paid Social</span>
                    <span className="font-bold">35%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Organic Search</span>
                    <span className="font-bold">25%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Display</span>
                    <span className="font-bold">15%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MousePointerClick className="w-5 h-5 text-yellow-500" />
                  <span className="font-medium">Consideration Stage</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Top nurturing channels:
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Email</span>
                    <span className="font-bold">28%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Organic Search</span>
                    <span className="font-bold">25%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Paid Social</span>
                    <span className="font-bold">22%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium">Conversion Stage</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Top closing channels:
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Direct</span>
                    <span className="font-bold">35%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Email</span>
                    <span className="font-bold">28%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Organic Search</span>
                    <span className="font-bold">20%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="windows" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                Attribution Window Comparison
              </CardTitle>
              <CardDescription>
                See how different lookback windows affect attribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ComposedChart data={windowComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="window" className="text-xs" />
                  <YAxis yAxisId="left" className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    yAxisId="left"
                    dataKey="conversions"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="value"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Window Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-blue-500" />
                      <span className="font-medium">Recommended Window: 30 Days</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Captures 88% of conversions while maintaining accuracy
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Short Window (7 days)</span>
                      <Badge variant="outline">58% coverage</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Medium Window (30 days)</span>
                      <Badge className="bg-green-500/10 text-green-500">88% coverage</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Long Window (90 days)</span>
                      <Badge variant="outline">100% coverage</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Average Time to Convert</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockChannelData.slice(0, 4).map((channel, idx) => (
                    <div key={channel.channel} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{channel.channel}</span>
                        <span className="font-medium">{(idx + 2) * 1.5} days</span>
                      </div>
                      <Progress value={((idx + 2) * 1.5 / 15) * 100} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assisted" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Share2 className="w-5 h-5 text-purple-500" />
                    Assisted Conversions Tracking
                  </CardTitle>
                  <CardDescription>
                    Channels that assist in the conversion journey without being the final touchpoint
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={showAssisted} onCheckedChange={setShowAssisted} />
                  <Label className="text-sm">Include Assists</Label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockChannelData.map((channel, idx) => {
                  const assistRatio = channel.assists / channel.conversions;
                  return (
                    <div key={channel.channel} className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[idx] }}
                          />
                          <span className="font-medium">{channel.channel}</span>
                        </div>
                        <Badge
                          className={
                            assistRatio >= 1.5
                              ? 'bg-purple-500/10 text-purple-500'
                              : 'bg-gray-500/10 text-gray-500'
                          }
                        >
                          {assistRatio.toFixed(1)}x assist ratio
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Last-Click Conversions</p>
                          <p className="text-lg font-bold">{channel.conversions}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Assisted Conversions</p>
                          <p className="text-lg font-bold text-purple-500">{channel.assists}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Impact</p>
                          <p className="text-lg font-bold">
                            {channel.conversions + channel.assists}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1">
                          <div className="text-xs text-muted-foreground mb-1">Last-Click</div>
                          <div className="h-2 rounded-full bg-blue-500" style={{
                            width: `${(channel.conversions / (channel.conversions + channel.assists)) * 100}%`
                          }} />
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-muted-foreground mb-1">Assisted</div>
                          <div className="h-2 rounded-full bg-purple-500" style={{
                            width: `${(channel.assists / (channel.conversions + channel.assists)) * 100}%`
                          }} />
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
                Key Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <h4 className="font-medium mb-2">Top Assisting Channel</h4>
                  <p className="text-2xl font-bold text-purple-500">Email Marketing</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    234 assists (1.31x ratio) - Critical for nurturing
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <h4 className="font-medium mb-2">Best Closer</h4>
                  <p className="text-2xl font-bold text-blue-500">Organic Search</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    312 last-click conversions - Strong purchase intent
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <h4 className="font-medium mb-2">Hidden Value</h4>
                  <p className="text-2xl font-bold text-yellow-500">Display Ads</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    2.73x assist ratio - Undervalued by last-click
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <h4 className="font-medium mb-2">Recommendation</h4>
                  <p className="text-2xl font-bold text-green-500">+15% Display</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Increase display budget to boost assisted conversions
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
