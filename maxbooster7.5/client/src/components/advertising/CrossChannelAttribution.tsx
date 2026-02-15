import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
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
  LineChart,
  Line,
  ComposedChart,
  Area,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Treemap,
} from 'recharts';
import {
  GitBranch,
  Target,
  Eye,
  MousePointerClick,
  DollarSign,
  TrendingUp,
  TrendingDown,
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
  Globe,
  Smartphone,
  Monitor,
  Mail,
  Search,
  Megaphone,
  Radio,
  Video,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
  Lightbulb,
  AlertCircle,
  Network,
  GitMerge,
  Workflow,
} from 'lucide-react';

type AttributionModel = 'first-touch' | 'last-touch' | 'linear' | 'time-decay' | 'position-based' | 'data-driven';

interface ChannelData {
  channel: string;
  icon: React.ReactNode;
  color: string;
  firstTouch: number;
  lastTouch: number;
  linear: number;
  timeDecay: number;
  positionBased: number;
  dataDriven: number;
  conversions: number;
  revenue: number;
  spend: number;
  roas: number;
  assists: number;
  avgTouchpoints: number;
}

interface ConversionPath {
  id: string;
  path: string[];
  conversions: number;
  revenue: number;
  avgDaysToConvert: number;
  avgTouchpoints: number;
}

interface ChannelComparison {
  channel: string;
  currentModel: number;
  previousModel: number;
  change: number;
  direction: 'up' | 'down' | 'stable';
}


const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const CHANNEL_COLORS: Record<string, string> = {
  'Paid Social': '#3b82f6',
  'Organic Search': '#22c55e',
  'Email Marketing': '#f59e0b',
  'Paid Search': '#8b5cf6',
  'Display Ads': '#06b6d4',
  'Direct': '#ef4444',
  'Referral': '#ec4899',
};

export function CrossChannelAttribution() {
  const [selectedModel, setSelectedModel] = useState<AttributionModel>('data-driven');
  const [comparisonModel, setComparisonModel] = useState<AttributionModel>('last-touch');
  const [attributionWindow, setAttributionWindow] = useState('30');
  const [showAssisted, setShowAssisted] = useState(true);

  const { data: attributionData } = useQuery({
    queryKey: ['/api/advertising/attribution/channels', attributionWindow],
  });

  const { data: pathsData } = useQuery({
    queryKey: ['/api/advertising/attribution/paths', attributionWindow],
  });

  const channelData: ChannelData[] = attributionData?.channels || [];
  const conversionPaths: ConversionPath[] = pathsData?.paths || [];

  const getModelValue = (channel: ChannelData) => {
    switch (selectedModel) {
      case 'first-touch':
        return channel.firstTouch;
      case 'last-touch':
        return channel.lastTouch;
      case 'linear':
        return channel.linear;
      case 'time-decay':
        return channel.timeDecay;
      case 'position-based':
        return channel.positionBased;
      case 'data-driven':
        return channel.dataDriven;
    }
  };

  const getComparisonValue = (channel: ChannelData) => {
    switch (comparisonModel) {
      case 'first-touch':
        return channel.firstTouch;
      case 'last-touch':
        return channel.lastTouch;
      case 'linear':
        return channel.linear;
      case 'time-decay':
        return channel.timeDecay;
      case 'position-based':
        return channel.positionBased;
      case 'data-driven':
        return channel.dataDriven;
    }
  };

  const totalConversions = channelData.reduce((acc, c) => acc + c.conversions, 0);
  const totalRevenue = channelData.reduce((acc, c) => acc + c.revenue, 0);
  const totalSpend = channelData.reduce((acc, c) => acc + c.spend, 0);
  const totalAssists = channelData.reduce((acc, c) => acc + c.assists, 0);
  const overallROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const chartData = channelData.map((channel, index) => ({
    name: channel.channel,
    value: getModelValue(channel) || 0,
    comparison: getComparisonValue(channel) || 0,
    fill: channel.color || CHANNEL_COLORS[channel.channel] || COLORS[index % COLORS.length],
  }));

  const chartConfig = {
    paidSocial: { label: 'Paid Social', color: '#3b82f6' },
    organic: { label: 'Organic', color: '#22c55e' },
    email: { label: 'Email', color: '#f59e0b' },
    paidSearch: { label: 'Paid Search', color: '#8b5cf6' },
    display: { label: 'Display', color: '#06b6d4' },
    direct: { label: 'Direct', color: '#ef4444' },
    value: { label: 'Attribution %', color: '#3b82f6' },
    comparison: { label: 'Comparison', color: '#94a3b8' },
    conversions: { label: 'Conversions', color: '#22c55e' },
    revenue: { label: 'Revenue', color: '#8b5cf6' },
    roas: { label: 'ROAS', color: '#f59e0b' },
    spend: { label: 'Spend', color: '#ef4444' },
  };

  const modelDescriptions: Record<AttributionModel, string> = {
    'first-touch': 'Gives 100% credit to the first channel that introduced the customer',
    'last-touch': 'Gives 100% credit to the last channel before conversion',
    linear: 'Distributes credit equally across all touchpoints in the journey',
    'time-decay': 'Gives more credit to touchpoints closer to conversion time',
    'position-based': 'Gives 40% to first touch, 40% to last, 20% distributed to middle',
    'data-driven': 'Uses machine learning to determine actual impact of each touchpoint',
  };

  if (channelData.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-6 h-6 text-blue-500" />
            Cross-Channel Attribution
          </CardTitle>
          <CardDescription>
            Multi-touch attribution modeling and channel performance comparison
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Attribution Data Available</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Attribution data will appear here once you have tracked conversions across your marketing channels.
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
            <Network className="w-6 h-6 text-blue-500" />
            Cross-Channel Attribution
          </h2>
          <p className="text-muted-foreground">
            Multi-touch attribution modeling and channel performance comparison
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

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <p className="text-2xl font-bold">${(totalRevenue / 1000).toFixed(1)}K</p>
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
                <p className="text-sm text-muted-foreground">Overall ROAS</p>
                <p className="text-2xl font-bold text-green-500">{overallROAS.toFixed(2)}x</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-500" />
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
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-yellow-500" />
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
              <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-cyan-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-purple-500" />
                Attribution Model Comparison
              </CardTitle>
              <CardDescription>
                Compare how different models attribute credit to channels
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Primary Model:</Label>
                <Select
                  value={selectedModel}
                  onValueChange={(v) => setSelectedModel(v as AttributionModel)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first-touch">First-Touch</SelectItem>
                    <SelectItem value="last-touch">Last-Touch</SelectItem>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="time-decay">Time-Decay</SelectItem>
                    <SelectItem value="position-based">Position-Based</SelectItem>
                    <SelectItem value="data-driven">Data-Driven (AI)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Compare to:</Label>
                <Select
                  value={comparisonModel}
                  onValueChange={(v) => setComparisonModel(v as AttributionModel)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first-touch">First-Touch</SelectItem>
                    <SelectItem value="last-touch">Last-Touch</SelectItem>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="time-decay">Time-Decay</SelectItem>
                    <SelectItem value="position-based">Position-Based</SelectItem>
                    <SelectItem value="data-driven">Data-Driven (AI)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="mt-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start gap-2 text-sm">
              <Brain className="w-4 h-4 text-blue-500 mt-0.5" />
              <div>
                <span className="font-medium">{selectedModel.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
                <span className="text-muted-foreground ml-1">{modelDescriptions[selectedModel]}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartContainer config={chartConfig} className="h-[350px]">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name={selectedModel} />
                <Bar dataKey="comparison" fill="#94a3b8" fillOpacity={0.5} radius={[0, 4, 4, 0]} name={comparisonModel} />
              </BarChart>
            </ChartContainer>

            <ChartContainer config={chartConfig} className="h-[350px]">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
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
          <TabsTrigger value="channels">Channel Performance</TabsTrigger>
          <TabsTrigger value="paths">Conversion Paths</TabsTrigger>
          <TabsTrigger value="touchpoints">Touchpoint Analysis</TabsTrigger>
          <TabsTrigger value="trends">Attribution Trends</TabsTrigger>
          <TabsTrigger value="insights">AI Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" />
                Channel Performance Breakdown
              </CardTitle>
              <CardDescription>
                Detailed metrics for each marketing channel
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Channel</th>
                      <th className="text-center py-3 px-4">Attribution %</th>
                      <th className="text-center py-3 px-4">Conversions</th>
                      <th className="text-center py-3 px-4">Revenue</th>
                      <th className="text-center py-3 px-4">Spend</th>
                      <th className="text-center py-3 px-4">ROAS</th>
                      <th className="text-center py-3 px-4">Assists</th>
                      <th className="text-center py-3 px-4">Avg. Touches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelData.map((channel, idx) => (
                      <tr key={channel.channel} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: channel.color }}
                            />
                            <span className="text-muted-foreground">{channel.icon}</span>
                            {channel.channel}
                          </div>
                        </td>
                        <td className="text-center py-3 px-4">
                          <Badge variant="outline" className="font-mono">
                            {getModelValue(channel)}%
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-4 font-medium">{channel.conversions.toLocaleString()}</td>
                        <td className="text-center py-3 px-4 text-green-500">${channel.revenue.toLocaleString()}</td>
                        <td className="text-center py-3 px-4 text-red-500">
                          {channel.spend > 0 ? `$${channel.spend.toLocaleString()}` : '-'}
                        </td>
                        <td className="text-center py-3 px-4">
                          <Badge
                            className={
                              channel.roas === Infinity
                                ? 'bg-green-500/10 text-green-500'
                                : channel.roas >= 3
                                  ? 'bg-green-500/10 text-green-500'
                                  : channel.roas >= 2
                                    ? 'bg-yellow-500/10 text-yellow-500'
                                    : 'bg-red-500/10 text-red-500'
                            }
                          >
                            {channel.roas === Infinity ? '∞' : `${channel.roas.toFixed(2)}x`}
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-4 text-muted-foreground">{channel.assists}</td>
                        <td className="text-center py-3 px-4">{channel.avgTouchpoints.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-500" />
                  ROAS by Channel
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ComposedChart data={roasComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="channel" className="text-xs" />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar yAxisId="left" dataKey="roas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-500" />
                  Weekly Attribution Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ComposedChart data={weeklyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="week" className="text-xs" />
                    <YAxis className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="paidSocial" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="organic" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="email" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="paidSearch" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
                    <Area type="monotone" dataKey="display" stackId="1" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.6} />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="paths" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="w-5 h-5 text-purple-500" />
                Top Conversion Paths
              </CardTitle>
              <CardDescription>
                Most common customer journeys leading to conversion
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {conversionPaths.map((path, idx) => (
                  <div key={path.id} className="p-4 rounded-lg border hover:border-primary/30 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          #{idx + 1}
                        </Badge>
                        <span className="font-medium">{path.conversions} conversions</span>
                        <Badge className="bg-green-500/10 text-green-500">
                          ${path.revenue.toLocaleString()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {path.avgDaysToConvert} days avg
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-4 h-4" />
                          {path.avgTouchpoints} touchpoints
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {path.path.map((step, stepIdx) => {
                        const channelData = channelData.find((c) => c.channel === step);
                        return (
                          <div key={stepIdx} className="flex items-center gap-2">
                            <Badge
                              className="flex items-center gap-1"
                              style={{
                                backgroundColor: `${channelData?.color}20`,
                                borderColor: `${channelData?.color}50`,
                                color: channelData?.color,
                              }}
                            >
                              {channelData?.icon}
                              {step}
                            </Badge>
                            {stepIdx < path.path.length - 1 && (
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        );
                      })}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-blue-500" />
                  Channel Overlap
                </CardTitle>
                <CardDescription>
                  Common channel combinations in conversion paths
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <PieChart>
                    <Pie
                      data={channelOverlapData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, value }) => `${value}`}
                    >
                      {channelOverlapData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
                <div className="mt-4 space-y-2">
                  {channelOverlapData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span>{item.name}</span>
                      </div>
                      <span className="font-medium">{item.value} conversions</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-cyan-500" />
                  Device Distribution
                </CardTitle>
                <CardDescription>
                  Conversions by device type
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {deviceData.map((device, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {device.device === 'Mobile' && <Smartphone className="w-4 h-4 text-blue-500" />}
                          {device.device === 'Desktop' && <Monitor className="w-4 h-4 text-green-500" />}
                          {device.device === 'Tablet' && <Monitor className="w-4 h-4 text-yellow-500" />}
                          {device.device === 'Smart TV' && <Video className="w-4 h-4 text-purple-500" />}
                          <span className="font-medium">{device.device}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{device.conversions}</span>
                          <Badge variant="outline">{device.percentage}%</Badge>
                        </div>
                      </div>
                      <Progress value={device.percentage} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="touchpoints" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-500" />
                  Touchpoint Distribution
                </CardTitle>
                <CardDescription>
                  Number of touchpoints before conversion
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <BarChart data={touchpointDistributionData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="touchpoints" className="text-xs" />
                    <YAxis className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="conversions" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {touchpointDistributionData.map((item, idx) => (
                    <div key={idx} className="text-center p-2 rounded-lg bg-muted/50">
                      <p className="text-lg font-bold">{item.percentage}%</p>
                      <p className="text-xs text-muted-foreground">{item.touchpoints} touch</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-500" />
                  Time to Conversion
                </CardTitle>
                <CardDescription>
                  Days from first touch to conversion
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <BarChart data={timeToConversionData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="conversions" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
                <div className="mt-4 p-4 rounded-lg bg-muted/50">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Average Time to Convert</p>
                      <p className="text-xl font-bold">6.8 days</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Median Time to Convert</p>
                      <p className="text-xl font-bold">4.2 days</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-500" />
                Channel Role by Touchpoint Position
              </CardTitle>
              <CardDescription>
                How channels contribute at different stages of the customer journey
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px]">
                <RadarChart
                  data={channelData.map((c) => ({
                    channel: c.channel,
                    firstTouch: c.firstTouch,
                    middle: c.linear,
                    lastTouch: c.lastTouch,
                    assists: Math.min(c.assists / 10, 50),
                  }))}
                >
                  <PolarGrid />
                  <PolarAngleAxis dataKey="channel" className="text-xs" />
                  <PolarRadiusAxis angle={30} domain={[0, 40]} />
                  <Radar name="First Touch" dataKey="firstTouch" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Radar name="Last Touch" dataKey="lastTouch" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                  <Radar name="Assist Ratio" dataKey="assists" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </RadarChart>
              </ChartContainer>
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm">First Touch</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm">Last Touch</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="text-sm">Assist Ratio</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                Attribution Model Impact Over Time
              </CardTitle>
              <CardDescription>
                How channel attribution changes under different models
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {channelData.slice(0, 5).map((channel, idx) => {
                  const primaryValue = getModelValue(channel);
                  const comparisonValue = getComparisonValue(channel);
                  const change = primaryValue - comparisonValue;

                  return (
                    <div key={channel.channel} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: channel.color }} />
                          {channel.icon}
                          <span className="font-medium">{channel.channel}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-lg font-bold">{primaryValue}%</p>
                            <p className="text-xs text-muted-foreground">{selectedModel}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {change > 0 ? (
                              <ArrowUpRight className="w-4 h-4 text-green-500" />
                            ) : change < 0 ? (
                              <ArrowDownRight className="w-4 h-4 text-red-500" />
                            ) : (
                              <Activity className="w-4 h-4 text-gray-500" />
                            )}
                            <span
                              className={`text-sm font-medium ${
                                change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-gray-500'
                              }`}
                            >
                              {change > 0 ? '+' : ''}{change}%
                            </span>
                          </div>
                          <div className="text-right text-muted-foreground">
                            <p className="text-lg font-medium">{comparisonValue}%</p>
                            <p className="text-xs">{comparisonModel}</p>
                          </div>
                        </div>
                      </div>
                      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full rounded-full transition-all"
                          style={{
                            width: `${primaryValue}%`,
                            backgroundColor: channel.color,
                          }}
                        />
                        <div
                          className="absolute top-0 h-full w-0.5 bg-white/80"
                          style={{ left: `${comparisonValue}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  AI-Powered Insights
                </CardTitle>
                <CardDescription>
                  Machine learning analysis of your attribution data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-600 dark:text-green-400">High-Value Discovery</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Email marketing shows 10.67x ROAS, significantly outperforming paid channels. Consider increasing email frequency for engaged segments.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-start gap-3">
                      <Lightbulb className="w-5 h-5 text-yellow-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-yellow-600 dark:text-yellow-400">Attribution Gap Detected</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Display ads receive only 5% last-touch credit but contribute to 567 assisted conversions. Consider using position-based attribution for budget decisions.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-600 dark:text-blue-400">Cross-Channel Synergy</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          The combination of Paid Social → Email generates 234 conversions. This path has 45% higher conversion rate than single-channel journeys.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-start gap-3">
                      <TrendingUp className="w-5 h-5 text-purple-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-purple-600 dark:text-purple-400">Optimization Opportunity</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Shifting 15% of Display budget to Paid Social could increase overall ROAS by 0.4x based on historical performance data.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-green-500" />
                  Recommended Actions
                </CardTitle>
                <CardDescription>
                  Data-driven recommendations for budget optimization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="w-4 h-4 text-green-500" />
                        <span className="font-medium">Increase Email Budget</span>
                      </div>
                      <Badge className="bg-green-500/10 text-green-500">High Impact</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Recommend +25% budget allocation to email marketing based on superior ROAS performance.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm">Apply Change</Button>
                      <Button size="sm" variant="outline">Learn More</Button>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ArrowDownRight className="w-4 h-4 text-yellow-500" />
                        <span className="font-medium">Optimize Display Strategy</span>
                      </div>
                      <Badge className="bg-yellow-500/10 text-yellow-500">Medium Impact</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Shift Display focus to awareness campaigns and measure with assisted conversions.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm">Apply Change</Button>
                      <Button size="sm" variant="outline">Learn More</Button>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <GitMerge className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">Leverage Cross-Channel Paths</span>
                      </div>
                      <Badge className="bg-blue-500/10 text-blue-500">Strategic</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Create automated sequences that mirror top-performing conversion paths.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm">Apply Change</Button>
                      <Button size="sm" variant="outline">Learn More</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-500" />
                Model Selection Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Brain className="w-6 h-6 text-purple-500" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium mb-1">Data-Driven Attribution Recommended</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Based on your conversion volume (1,395+ monthly) and multi-touch journey complexity (avg 3.2 touchpoints), we recommend using Data-Driven attribution for the most accurate channel impact measurement.
                    </p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Model Accuracy</p>
                        <p className="text-lg font-bold text-green-500">94%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Data Confidence</p>
                        <p className="text-lg font-bold text-blue-500">High</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Sample Size</p>
                        <p className="text-lg font-bold">Sufficient</p>
                      </div>
                    </div>
                  </div>
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    <Settings className="w-4 h-4 mr-2" />
                    Apply Model
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
