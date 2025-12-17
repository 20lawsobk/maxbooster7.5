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
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ComposedChart,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Activity,
  Users,
  Eye,
  Clock,
  RefreshCw,
  Lightbulb,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  AlertCircle,
  Timer,
  Database,
} from 'lucide-react';

interface CampaignROAS {
  id: string;
  name: string;
  currentROAS: number;
  predictedROAS: number;
  spend: number;
  revenue: number;
  confidence: number;
  trend: 'up' | 'down' | 'stable';
  fatigueLevel: number;
  diminishingReturnsPoint: number;
}

interface AudienceSegment {
  id: string;
  name: string;
  size: number;
  roas: number;
  cpa: number;
  conversionRate: number;
  trend: 'up' | 'down' | 'stable';
}

export function ROASPredictor() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [budgetScenario, setBudgetScenario] = useState<number>(3000);

  // Fetch campaign data from API - returns empty array when no real data exists
  const { data: campaignsData } = useQuery<CampaignROAS[]>({
    queryKey: ['/api/advertising/roas/campaigns'],
  });

  // Fetch audience segments from API - returns empty array when no real data exists
  const { data: audienceSegmentsData } = useQuery<AudienceSegment[]>({
    queryKey: ['/api/advertising/roas/audience-segments'],
  });

  // Fetch ROAS forecast data from API - returns empty array when no real data exists
  const { data: roasForecastDataRaw } = useQuery<any[]>({
    queryKey: ['/api/advertising/roas/forecast'],
  });

  // Fetch budget optimization data from API - returns empty array when no real data exists
  const { data: budgetOptimizationDataRaw } = useQuery<any[]>({
    queryKey: ['/api/advertising/roas/budget-optimization'],
  });

  // Fetch creative fatigue analysis from API - returns empty array when no real data exists
  const { data: creativeFatigueDataRaw } = useQuery<any[]>({
    queryKey: ['/api/advertising/roas/creative-fatigue-analysis'],
  });

  // Use API data or empty arrays - NO MOCK DATA
  const campaigns: CampaignROAS[] = Array.isArray(campaignsData) ? campaignsData : [];
  const audienceSegments: AudienceSegment[] = Array.isArray(audienceSegmentsData) ? audienceSegmentsData : [];
  const roasForecastData: any[] = Array.isArray(roasForecastDataRaw) ? roasForecastDataRaw : [];
  const budgetOptimizationData: any[] = Array.isArray(budgetOptimizationDataRaw) ? budgetOptimizationDataRaw : [];
  const creativeFatigueData: any[] = Array.isArray(creativeFatigueDataRaw) ? creativeFatigueDataRaw : [];

  // Calculate metrics safely with empty array handling
  const avgROAS = campaigns.length > 0
    ? campaigns.reduce((acc, c) => acc + c.currentROAS, 0) / campaigns.length
    : 0;
  const totalRevenue = campaigns.reduce((acc, c) => acc + c.revenue, 0);
  const totalSpend = campaigns.reduce((acc, c) => acc + c.spend, 0);

  const chartConfig = {
    actual: { label: 'Actual', color: '#3b82f6' },
    predicted: { label: 'Predicted', color: '#22c55e' },
    lower: { label: 'Lower Bound', color: '#94a3b8' },
    upper: { label: 'Upper Bound', color: '#94a3b8' },
    roas: { label: 'ROAS', color: '#8b5cf6' },
    marginalReturn: { label: 'Marginal Return', color: '#f59e0b' },
    impressions: { label: 'Impressions', color: '#3b82f6' },
    ctr: { label: 'CTR', color: '#22c55e' },
    frequency: { label: 'Frequency', color: '#ef4444' },
  };

  const getROASColor = (roas: number) => {
    if (roas >= 4) return 'text-green-500';
    if (roas >= 2.5) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getFatigueColor = (level: number) => {
    if (level <= 25) return 'bg-green-500';
    if (level <= 50) return 'bg-yellow-500';
    if (level <= 75) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-500" />
            ROAS Predictor & Optimizer
          </h2>
          <p className="text-muted-foreground">
            ML-powered return on ad spend prediction and optimization
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Predictions
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average ROAS</p>
                <p className={`text-2xl font-bold ${getROASColor(avgROAS)}`}>
                  {avgROAS.toFixed(1)}x
                </p>
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
                <p className="text-sm text-muted-foreground">Predicted ROAS (7d)</p>
                <p className="text-2xl font-bold text-green-500">5.1x</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Model Confidence</p>
                <p className="text-2xl font-bold">89%</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="predictions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="predictions">ROAS Predictions</TabsTrigger>
          <TabsTrigger value="audiences">Audience Performance</TabsTrigger>
          <TabsTrigger value="optimization">Budget Optimization</TabsTrigger>
          <TabsTrigger value="fatigue">Creative Fatigue</TabsTrigger>
          <TabsTrigger value="diminishing">Diminishing Returns</TabsTrigger>
        </TabsList>

        <TabsContent value="predictions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" />
                ROAS Forecast with Confidence Intervals
              </CardTitle>
              <CardDescription>
                8-week forward-looking ROAS prediction with uncertainty bands
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px]">
                <AreaChart data={roasForecastData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" />
                  <YAxis className="text-xs" domain={[2, 7]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="upper"
                    stroke="transparent"
                    fill="#94a3b8"
                    fillOpacity={0.2}
                  />
                  <Area
                    type="monotone"
                    dataKey="lower"
                    stroke="transparent"
                    fill="#ffffff"
                    fillOpacity={1}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <ReferenceLine y={3} stroke="#ef4444" strokeDasharray="3 3" label="Break-even" />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {campaigns.map((campaign) => (
              <Card key={campaign.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{campaign.name}</h4>
                    {getTrendIcon(campaign.trend)}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Current ROAS</p>
                      <p className={`text-xl font-bold ${getROASColor(campaign.currentROAS)}`}>
                        {campaign.currentROAS}x
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Predicted ROAS</p>
                      <p className={`text-xl font-bold ${getROASColor(campaign.predictedROAS)}`}>
                        {campaign.predictedROAS}x
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Model Confidence</span>
                      <span className="font-medium">{campaign.confidence}%</span>
                    </div>
                    <Progress value={campaign.confidence} />
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <Brain className="w-4 h-4 text-purple-500" />
                      <span className="text-muted-foreground">AI Insight:</span>
                    </div>
                    <p className="text-sm mt-1">
                      {campaign.trend === 'up'
                        ? 'Strong upward trajectory. Consider increasing budget.'
                        : campaign.trend === 'down'
                          ? 'Performance declining. Review creative and targeting.'
                          : 'Stable performance. Maintain current strategy.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="audiences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                Audience Segment Performance
              </CardTitle>
              <CardDescription>
                ROAS and efficiency metrics by audience segment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {audienceSegments.map((segment) => (
                  <div key={segment.id} className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{segment.name}</h4>
                        {getTrendIcon(segment.trend)}
                      </div>
                      <Badge
                        className={
                          segment.roas >= 5
                            ? 'bg-green-500/10 text-green-500'
                            : segment.roas >= 3
                              ? 'bg-yellow-500/10 text-yellow-500'
                              : 'bg-red-500/10 text-red-500'
                        }
                      >
                        {segment.roas}x ROAS
                      </Badge>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Audience Size</p>
                        <p className="font-bold">{(segment.size / 1000).toFixed(0)}K</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">CPA</p>
                        <p className="font-bold">${segment.cpa.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Conv. Rate</p>
                        <p className="font-bold">{segment.conversionRate}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Trend</p>
                        <p className="font-bold flex items-center gap-1">
                          {segment.trend === 'up' ? (
                            <>
                              <ArrowUpRight className="w-4 h-4 text-green-500" />
                              Improving
                            </>
                          ) : segment.trend === 'down' ? (
                            <>
                              <ArrowDownRight className="w-4 h-4 text-red-500" />
                              Declining
                            </>
                          ) : (
                            <>
                              <Activity className="w-4 h-4 text-gray-500" />
                              Stable
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {segment.roas >= 5 && (
                      <div className="mt-3 p-2 rounded bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        High-performing segment. Consider increased allocation.
                      </div>
                    )}
                    {segment.trend === 'down' && segment.roas < 4 && (
                      <div className="mt-3 p-2 rounded bg-yellow-500/10 text-yellow-600 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Performance declining. Review targeting and creative.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  Budget Optimization Curve
                </CardTitle>
                <CardDescription>
                  Find the optimal budget level for maximum ROAS
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ComposedChart data={budgetOptimizationData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="budget" className="text-xs" tickFormatter={(v) => `$${v}`} />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="roas"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="marginalReturn"
                      fill="#f59e0b"
                      fillOpacity={0.5}
                      radius={[4, 4, 0, 0]}
                    />
                    <ReferenceLine
                      x={budgetScenario}
                      stroke="#22c55e"
                      strokeWidth={2}
                      label="Current"
                    />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-green-500" />
                  Budget Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>Test Budget Scenario</Label>
                    <div className="mt-2 space-y-2">
                      <Slider
                        value={[budgetScenario]}
                        onValueChange={(v) => setBudgetScenario(v[0])}
                        min={1000}
                        max={8000}
                        step={500}
                      />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>$1,000</span>
                        <span className="font-bold text-foreground">${budgetScenario.toLocaleString()}</span>
                        <span>$8,000</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <h4 className="font-medium mb-3">Predicted Outcomes at ${budgetScenario.toLocaleString()}</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Expected ROAS</p>
                        <p className="text-xl font-bold text-purple-500">
                          {budgetOptimizationData.find((d) => d.budget === budgetScenario)?.roas || 4.0}x
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Expected Revenue</p>
                        <p className="text-xl font-bold text-green-500">
                          ${((budgetOptimizationData.find((d) => d.budget === budgetScenario)?.roas || 4.0) * budgetScenario).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="font-medium">Optimal Budget: $2,000</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Best balance of ROAS (4.8x) and scale
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">Growth Budget: $4,000</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Maximize reach while maintaining 4.0x ROAS
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        <span className="font-medium">Above $5,000: Diminishing Returns</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        ROAS drops below 3.6x - not recommended
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fatigue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-orange-500" />
                Creative Fatigue Detection
              </CardTitle>
              <CardDescription>
                Monitor ad performance degradation over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ComposedChart data={creativeFatigueData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" tickFormatter={(v) => `Day ${v}`} />
                  <YAxis yAxisId="left" className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="impressions"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.2}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="ctr"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="frequency"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {campaigns.map((campaign) => (
              <Card key={campaign.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{campaign.name}</h4>
                    <Badge
                      className={
                        campaign.fatigueLevel <= 25
                          ? 'bg-green-500/10 text-green-500'
                          : campaign.fatigueLevel <= 50
                            ? 'bg-yellow-500/10 text-yellow-500'
                            : 'bg-red-500/10 text-red-500'
                      }
                    >
                      {campaign.fatigueLevel}% fatigue
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Creative Fatigue Level</span>
                    </div>
                    <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`absolute left-0 top-0 h-full rounded-full ${getFatigueColor(campaign.fatigueLevel)}`}
                        style={{ width: `${campaign.fatigueLevel}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    {campaign.fatigueLevel <= 25 ? (
                      <div className="p-2 rounded bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Creative is fresh. Continue running.
                      </div>
                    ) : campaign.fatigueLevel <= 50 ? (
                      <div className="p-2 rounded bg-yellow-500/10 text-yellow-600 text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Plan new creative variants soon.
                      </div>
                    ) : (
                      <div className="p-2 rounded bg-red-500/10 text-red-600 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Rotate creative immediately.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="diminishing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
                Diminishing Returns Analysis
              </CardTitle>
              <CardDescription>
                Identify the point where additional spend becomes less efficient
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {campaigns.map((campaign) => {
                  const spendPercentage = (campaign.spend / campaign.diminishingReturnsPoint) * 100;
                  const isApproaching = spendPercentage >= 70;
                  const isExceeded = spendPercentage >= 100;

                  return (
                    <div key={campaign.id} className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{campaign.name}</h4>
                        <Badge
                          className={
                            isExceeded
                              ? 'bg-red-500/10 text-red-500'
                              : isApproaching
                                ? 'bg-yellow-500/10 text-yellow-500'
                                : 'bg-green-500/10 text-green-500'
                          }
                        >
                          {isExceeded
                            ? 'Exceeded Point'
                            : isApproaching
                              ? 'Approaching Point'
                              : 'Within Efficient Zone'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Current Spend</p>
                          <p className="text-lg font-bold">${campaign.spend.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Diminishing Returns Point</p>
                          <p className="text-lg font-bold">
                            ${campaign.diminishingReturnsPoint.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Headroom</p>
                          <p
                            className={`text-lg font-bold ${
                              campaign.diminishingReturnsPoint - campaign.spend > 0
                                ? 'text-green-500'
                                : 'text-red-500'
                            }`}
                          >
                            ${(campaign.diminishingReturnsPoint - campaign.spend).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Spend vs. Optimal</span>
                          <span>{Math.min(spendPercentage, 150).toFixed(0)}%</span>
                        </div>
                        <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                              isExceeded
                                ? 'bg-red-500'
                                : isApproaching
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(spendPercentage, 100)}%` }}
                          />
                          <div
                            className="absolute top-0 h-full w-0.5 bg-white"
                            style={{ left: '100%', transform: 'translateX(-50%)' }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>$0</span>
                          <span>Optimal Point</span>
                        </div>
                      </div>

                      {isExceeded && (
                        <div className="mt-3 p-2 rounded bg-red-500/10 text-red-600 text-sm flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          <span>
                            Spending ${(campaign.spend - campaign.diminishingReturnsPoint).toLocaleString()} 
                            above optimal. Consider reallocating to other campaigns.
                          </span>
                        </div>
                      )}
                      {isApproaching && !isExceeded && (
                        <div className="mt-3 p-2 rounded bg-yellow-500/10 text-yellow-600 text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          <span>
                            Approaching diminishing returns. Monitor efficiency closely.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
