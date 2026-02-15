// AI Analytics Dashboard - Fixed: All null checks added (v2.1)
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import {
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  DollarSign,
  Activity,
  Brain,
  Zap,
  Target,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
} from 'lucide-react';

interface MetricPrediction {
  metric: string;
  current: number;
  predicted: number;
  confidence: number;
  trend: 'up' | 'down' | 'stable';
  forecast: Array<{ date: string; value: number; confidence_low: number; confidence_high: number }>;
}

interface ChurnPrediction {
  userId: string;
  username: string;
  email: string;
  churnProbability: number;
  riskLevel: 'high' | 'medium' | 'low';
  riskFactors: string[];
  recommendedActions: string[];
}

interface RevenueScenario {
  name: string;
  probability: number;
  mrr: number;
  arr: number;
  growth: number;
}

interface Anomaly {
  id: string;
  metric: string;
  severity: 'critical' | 'warning' | 'info';
  detected_at: string;
  deviation: number;
  root_cause: string;
  impact: string;
  recommendation: string;
}

interface AIInsight {
  id: string;
  category: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  actions: string[];
}

interface CareerGrowthPrediction {
  metric: 'streams' | 'followers' | 'engagement';
  currentValue: number;
  predictedValue: number;
  growthRate: number;
  timeline: '30d' | '90d' | '180d';
  recommendations: string[];
  confidence: number;
}

interface ReleaseStrategyInsight {
  bestReleaseDay: string;
  bestReleaseTime: string;
  optimalFrequency: string;
  genreTrends: Array<{ genre: string; trend: 'rising' | 'stable' | 'declining'; score: number }>;
  competitorAnalysis: string[];
  recommendations: string[];
}

interface FanbaseInsight {
  totalFans: number;
  activeListeners: number;
  engagementRate: number;
  topPlatforms: Array<{ platform: string; percentage: number }>;
  demographics: {
    topLocations: string[];
    peakListeningTimes: string[];
  };
  growthOpportunities: string[];
}

interface CareerMilestone {
  type: 'streams' | 'followers' | 'releases' | 'revenue';
  current: number;
  nextMilestone: number;
  progress: number;
  estimatedDate: string;
  recommendations: string[];
}

interface MusicInsight {
  category: 'release_strategy' | 'audience_growth' | 'monetization' | 'marketing';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionable: string[];
  priority: number;
}

// Admin-specific interfaces
interface AdminAnalytics {
  totalUsers: number;
  totalProjects: number;
  totalRevenue: number;
  recentSignups: number;
  activeUsers: number;
  monthlyGrowth: number;
  subscriptionStats: Array<{ tier: string; count: number }>;
}

interface PlatformMetrics {
  cpu: number;
  memory: number;
  activeUsers: number;
  uptime: number;
  responseTime: number;
}

// Last updated: 2025-11-17 - Added Admin-specific Analytics
export default function AIDashboard() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const [selectedMetric, setSelectedMetric] = useState('streams');
  const [timeRange, setTimeRange] = useState('30d');

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  const {
    data: predictions,
    isLoading: loadingPredictions,
    error: predictionsError,
  } = useQuery<MetricPrediction[]>({
    queryKey: ['/api/analytics/ai/predict-metric', selectedMetric, timeRange],
    queryFn: async () => {
      const response = await fetch('/api/analytics/ai/predict-metric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ metric: selectedMetric, timeframe: timeRange }),
      });
      if (!response.ok) throw new Error('Failed to fetch predictions');
      const data = await response.json();
      return [data];
    },
  });

  const {
    data: churnPredictions,
    isLoading: loadingChurn,
    error: churnError,
  } = useQuery<ChurnPrediction[]>({
    queryKey: ['/api/analytics/ai/predict-churn'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/ai/predict-churn', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch churn predictions');
      const data = await response.json();
      return data.atRiskUsers || [];
    },
  });

  const {
    data: revenueForecasts,
    isLoading: loadingRevenue,
    error: revenueError,
  } = useQuery<RevenueScenario[]>({
    queryKey: ['/api/analytics/ai/forecast-revenue', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/ai/forecast-revenue?timeframe=${timeRange}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch revenue forecasts');
      const data = await response.json();

      const currentMRR = data.currentMRR || 0;
      const projectedMRR = data.projectedMRR || 0;
      const growthRate = data.growthRate || 0;

      const scenarios: RevenueScenario[] = [
        {
          name: 'Conservative',
          probability: 30,
          mrr: Math.round(currentMRR * 0.9),
          arr: Math.round(currentMRR * 0.9 * 12),
          growth: Math.max(0, growthRate - 20),
        },
        {
          name: 'Expected',
          probability: 60,
          mrr: currentMRR,
          arr: currentMRR * 12,
          growth: growthRate,
        },
        {
          name: 'Optimistic',
          probability: 10,
          mrr: Math.round(currentMRR * 1.3),
          arr: Math.round(currentMRR * 1.3 * 12),
          growth: growthRate + 30,
        },
      ];

      return scenarios;
    },
  });

  const {
    data: anomalies,
    isLoading: loadingAnomalies,
    error: anomaliesError,
  } = useQuery<Anomaly[]>({
    queryKey: ['/api/analytics/ai/detect-anomalies'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/ai/detect-anomalies', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch anomalies');
      const data = await response.json();
      return data.anomalies || [];
    },
  });

  const {
    data: insights,
    isLoading: loadingInsights,
    error: insightsError,
  } = useQuery<AIInsight[]>({
    queryKey: ['/api/analytics/ai/insights'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/ai/insights', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch insights');
      const data = await response.json();
      return data.insights || [];
    },
  });

  // Music Career AI Analytics
  const [careerMetric, setCareerMetric] = useState<'streams' | 'followers' | 'engagement'>(
    'streams'
  );
  const [careerTimeline, setCareerTimeline] = useState<'30d' | '90d' | '180d'>('30d');

  const {
    data: careerGrowth,
    isLoading: loadingCareerGrowth,
    error: careerGrowthError,
  } = useQuery<CareerGrowthPrediction>({
    queryKey: ['/api/analytics/music/career-growth', careerMetric, careerTimeline],
    queryFn: async () => {
      const response = await fetch('/api/analytics/music/career-growth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ metric: careerMetric, timeline: careerTimeline }),
      });
      if (!response.ok) throw new Error('Failed to fetch career growth');
      return response.json();
    },
  });

  const {
    data: releaseStrategy,
    isLoading: loadingReleaseStrategy,
    error: releaseStrategyError,
  } = useQuery<ReleaseStrategyInsight>({
    queryKey: ['/api/analytics/music/release-strategy'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/music/release-strategy', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch release strategy');
      return response.json();
    },
  });

  const {
    data: fanbaseData,
    isLoading: loadingFanbase,
    error: fanbaseError,
  } = useQuery<FanbaseInsight>({
    queryKey: ['/api/analytics/music/fanbase'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/music/fanbase', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch fanbase data');
      return response.json();
    },
  });

  const {
    data: careerMilestones,
    isLoading: loadingMilestones,
    error: milestonesError,
  } = useQuery<CareerMilestone[]>({
    queryKey: ['/api/analytics/music/milestones'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/music/milestones', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch career milestones');
      return response.json();
    },
  });

  const {
    data: musicInsights,
    isLoading: loadingMusicInsights,
    error: musicInsightsError,
  } = useQuery<MusicInsight[]>({
    queryKey: ['/api/analytics/music/insights'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/music/insights', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch music insights');
      return response.json();
    },
  });

  // Admin-only queries
  const { data: adminAnalytics, isLoading: loadingAdminAnalytics } = useQuery<AdminAnalytics>({
    queryKey: ['/api/admin/analytics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/analytics', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch admin analytics');
      return response.json();
    },
    enabled: isAdmin,
  });

  const { data: platformMetrics, isLoading: loadingPlatformMetrics } = useQuery<PlatformMetrics>({
    queryKey: ['/api/admin/metrics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/metrics', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch platform metrics');
      return response.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000, // Refresh every 30 seconds for admins
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'high':
        return <Zap className="w-4 h-4 text-yellow-600" />;
      case 'medium':
        return <Activity className="w-4 h-4 text-blue-600" />;
      default:
        return <Target className="w-4 h-4 text-gray-600" />;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-muted-foreground">Loading AI Analytics...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AppLayout title="AI Analytics" subtitle="Powered by AI Insights Engine - Predictive analytics and intelligent recommendations">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Brain className="w-8 h-8 text-primary" />
              AI Analytics Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Powered by AI Insights Engine - Predictive analytics and intelligent recommendations
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered
          </Badge>
        </div>

        <Tabs defaultValue="predictions" className="w-full">
          <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-9' : 'grid-cols-9'}`}>
            <TabsTrigger value="predictions">
              <TrendingUp className="w-4 h-4 mr-1" />
              Predictions
            </TabsTrigger>
            <TabsTrigger value="churn">
              <Users className="w-4 h-4 mr-1" />
              Churn Risk
            </TabsTrigger>
            <TabsTrigger value="revenue">
              <DollarSign className="w-4 h-4 mr-1" />
              Revenue
            </TabsTrigger>
            <TabsTrigger value="anomalies">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Anomalies
            </TabsTrigger>
            <TabsTrigger value="insights">
              <Sparkles className="w-4 h-4 mr-1" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="career">
              <Target className="w-4 h-4 mr-1" />
              Career
            </TabsTrigger>
            <TabsTrigger value="fanbase">
              <Users className="w-4 h-4 mr-1" />
              Fanbase
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="platform">
                  <Shield className="w-4 h-4 mr-1" />
                  Platform
                </TabsTrigger>
                <TabsTrigger value="admin-overview">
                  <Activity className="w-4 h-4 mr-1" />
                  Overview
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="predictions" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Predictive Analytics</CardTitle>
                    <CardDescription>Forecasted metrics with confidence intervals</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="streams">Streams</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                        <SelectItem value="engagement">Engagement</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={timeRange} onValueChange={setTimeRange}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7d">7 Days</SelectItem>
                        <SelectItem value="30d">30 Days</SelectItem>
                        <SelectItem value="90d">90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {predictionsError ? (
                  <div className="text-center py-12">
                    <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
                    <p className="text-destructive font-semibold">Failed to load predictions</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Unable to fetch prediction data
                    </p>
                  </div>
                ) : loadingPredictions ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Analyzing data...</p>
                  </div>
                ) : predictions && predictions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Brain className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold">Insufficient data for predictions</p>
                    <p className="text-sm mt-1">More data needed for accurate forecasting</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {predictions?.map((prediction) => (
                      <div key={prediction.metric} className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <Card className="bg-muted/50">
                            <CardContent className="p-4">
                              <p className="text-sm text-muted-foreground">Current</p>
                              <p className="text-2xl font-bold">
                                {prediction.current?.toLocaleString() || '0'}
                              </p>
                            </CardContent>
                          </Card>
                          <Card className="bg-primary/10 border-primary">
                            <CardContent className="p-4">
                              <p className="text-sm text-muted-foreground">Predicted</p>
                              <p className="text-2xl font-bold flex items-center gap-2">
                                {prediction.predicted?.toLocaleString() || '0'}
                                {prediction.trend === 'up' ? (
                                  <ArrowUpRight className="w-5 h-5 text-green-600" />
                                ) : (
                                  <ArrowDownRight className="w-5 h-5 text-red-600" />
                                )}
                              </p>
                            </CardContent>
                          </Card>
                          <Card className="bg-muted/50">
                            <CardContent className="p-4">
                              <p className="text-sm text-muted-foreground">Confidence</p>
                              <div className="space-y-2">
                                <p className="text-2xl font-bold">{prediction.confidence}%</p>
                                <Progress value={prediction.confidence} className="h-2" />
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="border rounded-lg p-4">
                          <h4 className="text-sm font-medium mb-3">Forecast Timeline</h4>
                          <div className="space-y-2">
                            {(prediction.forecast || []).map((point, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-muted-foreground">{point.date}</span>
                                <div className="flex items-center gap-4">
                                  <span className="text-xs text-muted-foreground">
                                    {point.confidence_low} - {point.confidence_high}
                                  </span>
                                  <span className="font-semibold">
                                    {point.value?.toLocaleString() || '0'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="churn" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Churn Prediction</CardTitle>
                <CardDescription>
                  Users at risk of churning with recommended actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {churnError ? (
                  <div className="text-center py-12">
                    <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
                    <p className="text-destructive font-semibold">
                      Failed to load churn predictions
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Unable to fetch churn analysis
                    </p>
                  </div>
                ) : loadingChurn ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Analyzing user behavior...</p>
                  </div>
                ) : churnPredictions && churnPredictions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold">No at-risk users detected</p>
                    <p className="text-sm mt-1">All users appear to be engaged</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {churnPredictions?.map((user) => (
                      <Card key={user.userId} className="border-l-4 border-l-primary">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold">{user.username}</h4>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant={getRiskColor(user.riskLevel)}>
                                {user.riskLevel} risk
                              </Badge>
                              <p className="text-sm mt-1 font-semibold text-primary">
                                {user.churnProbability}% churn probability
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Risk Factors:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {(user.riskFactors || []).map((factor, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    {factor}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Recommended Actions:
                              </p>
                              <div className="space-y-1">
                                {(user.recommendedActions || []).map((action, index) => (
                                  <div key={index} className="flex items-center gap-2 text-sm">
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                    <span>{action}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <Button size="sm" className="w-full">
                            Take Action
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Forecasting</CardTitle>
                <CardDescription>MRR/ARR projections with 3-scenario analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueError ? (
                  <div className="text-center py-12">
                    <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
                    <p className="text-destructive font-semibold">
                      Failed to load revenue forecasts
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Unable to fetch revenue analysis
                    </p>
                  </div>
                ) : loadingRevenue ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Calculating scenarios...</p>
                  </div>
                ) : revenueForecasts && revenueForecasts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold">Insufficient revenue data</p>
                    <p className="text-sm mt-1">More historical data needed for forecasting</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {revenueForecasts?.map((scenario) => (
                      <Card
                        key={scenario.name}
                        className={
                          scenario.name === 'Expected' ? 'border-primary bg-primary/5' : ''
                        }
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold flex items-center gap-2">
                                {scenario.name} Scenario
                                {scenario.name === 'Expected' && (
                                  <Badge variant="default">Most Likely</Badge>
                                )}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {scenario.probability}% probability
                              </p>
                            </div>
                            <Badge variant={scenario.growth > 40 ? 'default' : 'secondary'}>
                              +{scenario.growth}% growth
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                Monthly Recurring Revenue
                              </p>
                              <p className="text-2xl font-bold">${scenario.mrr?.toLocaleString() || '0'}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                Annual Recurring Revenue
                              </p>
                              <p className="text-2xl font-bold">${scenario.arr?.toLocaleString() || '0'}</p>
                            </div>
                          </div>

                          <Progress value={scenario.probability} className="h-2 mt-3" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="anomalies" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Anomaly Detection</CardTitle>
                <CardDescription>Detected anomalies with root cause analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {anomaliesError ? (
                  <div className="text-center py-12">
                    <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
                    <p className="text-destructive font-semibold">Failed to load anomalies</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Unable to fetch anomaly detection
                    </p>
                  </div>
                ) : loadingAnomalies ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Scanning for anomalies...</p>
                  </div>
                ) : anomalies && anomalies.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50 text-green-600" />
                    <p className="font-semibold">No anomalies detected</p>
                    <p className="text-sm mt-1">All metrics are within normal ranges</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {anomalies?.map((anomaly) => (
                      <Alert key={anomaly.id} className={getSeverityColor(anomaly.severity)}>
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className="w-4 h-4" />
                                <h4 className="font-semibold">{anomaly.metric}</h4>
                                <Badge variant="outline">{anomaly.deviation}% deviation</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Detected {anomaly.detected_at}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs font-medium mb-1">Root Cause:</p>
                              <p>{anomaly.root_cause}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium mb-1">Impact:</p>
                              <p>{anomaly.impact}</p>
                            </div>
                          </div>

                          <Alert variant="default" className="bg-white">
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertDescription>
                              <span className="font-medium">Recommendation: </span>
                              {anomaly.recommendation}
                            </AlertDescription>
                          </Alert>
                        </div>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>AI Insights</CardTitle>
                <CardDescription>
                  Natural language insights with actionable recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {insightsError ? (
                  <div className="text-center py-12">
                    <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
                    <p className="text-destructive font-semibold">Failed to load insights</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Unable to generate AI insights
                    </p>
                  </div>
                ) : loadingInsights ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Generating insights...</p>
                  </div>
                ) : insights && insights.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold">No insights available yet</p>
                    <p className="text-sm mt-1">Collecting data to generate actionable insights</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {insights?.map((insight) => (
                      <Card key={insight.id} className="border-l-4 border-l-primary">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-2">
                              {getImpactIcon(insight.impact)}
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    {insight.category}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    {insight.impact} impact
                                  </Badge>
                                </div>
                                <h4 className="font-semibold">{insight.title}</h4>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-primary">
                                {insight.confidence}% confidence
                              </p>
                              <Progress value={insight.confidence} className="h-1 w-20 mt-1" />
                            </div>
                          </div>

                          <p className="text-sm text-muted-foreground">{insight.description}</p>

                          <div>
                            <p className="text-xs font-medium mb-2">Recommended Actions:</p>
                            <div className="space-y-1">
                              {(insight.actions || []).map((action, index) => (
                                <div key={index} className="flex items-start gap-2 text-sm">
                                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-xs font-medium text-primary">
                                      {index + 1}
                                    </span>
                                  </div>
                                  <span>{action}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Music Career Analytics Tabs - Available to all paid users */}
          <TabsContent value="career" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Current {careerMetric}</p>
                      <p className="text-2xl font-bold">
                        {careerGrowth?.currentValue?.toLocaleString() || 0}
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Predicted</p>
                      <p className="text-2xl font-bold">
                        {careerGrowth?.predictedValue?.toLocaleString() || 0}
                      </p>
                    </div>
                    <Target className="w-8 h-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Growth Rate</p>
                      <p className="text-2xl font-bold">
                        {careerGrowth?.growthRate?.toFixed(1) || 0}%
                      </p>
                    </div>
                    <Activity className="w-8 h-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Career Growth Prediction</CardTitle>
                    <CardDescription>
                      AI-powered forecasts for your music career metrics
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Select value={careerMetric} onValueChange={setCareerMetric}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="streams">Streams</SelectItem>
                        <SelectItem value="followers">Followers</SelectItem>
                        <SelectItem value="engagement">Engagement</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={careerTimeline} onValueChange={setCareerTimeline}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30d">30 Days</SelectItem>
                        <SelectItem value="90d">90 Days</SelectItem>
                        <SelectItem value="180d">180 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingCareerGrowth ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Analyzing career trajectory...</p>
                  </div>
                ) : careerGrowthError ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold">Unable to load career predictions</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-3">AI Recommendations</h4>
                      <div className="space-y-2">
                        {(careerGrowth?.recommendations || []).map((rec, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 p-3 bg-muted/50 rounded"
                          >
                            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                            <span className="text-sm">{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Alert>
                      <Brain className="h-4 w-4" />
                      <AlertDescription>
                        Confidence: {careerGrowth?.confidence || 0}% - Based on historical data and
                        industry trends
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Career Milestones</CardTitle>
                <CardDescription>Track your progress toward major achievements</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingMilestones ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading milestones...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(careerMilestones || []).map((milestone, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium capitalize">{milestone.type}</span>
                          <Badge variant="outline">{milestone.progress}% complete</Badge>
                        </div>
                        <Progress value={milestone.progress} className="h-2" />
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Current: {milestone.current?.toLocaleString() || '0'}</span>
                          <span>Next: {milestone.nextMilestone?.toLocaleString() || '0'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Est. completion: {milestone.estimatedDate}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fanbase" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Fans</p>
                      <p className="text-2xl font-bold">
                        {fanbaseData?.totalFans?.toLocaleString() || 0}
                      </p>
                    </div>
                    <Users className="w-8 h-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Listeners</p>
                      <p className="text-2xl font-bold">
                        {fanbaseData?.activeListeners?.toLocaleString() || 0}
                      </p>
                    </div>
                    <Activity className="w-8 h-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Engagement Rate</p>
                      <p className="text-2xl font-bold">
                        {fanbaseData?.engagementRate?.toFixed(1) || 0}%
                      </p>
                    </div>
                    <Sparkles className="w-8 h-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Fanbase Insights</CardTitle>
                <CardDescription>
                  Understand your audience demographics and behavior
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingFanbase ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Analyzing fanbase...</p>
                  </div>
                ) : fanbaseError ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold">Unable to load fanbase data</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Top Platforms</h4>
                      <div className="space-y-2">
                        {(fanbaseData?.topPlatforms || []).map((platform, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <span className="text-sm">{platform.platform}</span>
                            <div className="flex items-center gap-2">
                              <Progress value={platform.percentage} className="h-2 w-24" />
                              <span className="text-sm text-muted-foreground w-12 text-right">
                                {platform.percentage}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-3">Demographics</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Top Locations</p>
                          <div className="space-y-1">
                            {(fanbaseData?.demographics?.topLocations || []).map(
                              (location, index) => (
                                <Badge key={index} variant="outline" className="text-xs mr-1">
                                  {location}
                                </Badge>
                              )
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Peak Listening Times</p>
                          <div className="space-y-1">
                            {(fanbaseData?.demographics?.peakListeningTimes || []).map(
                              (time, index) => (
                                <Badge key={index} variant="secondary" className="text-xs mr-1">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {time}
                                </Badge>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-3">Growth Opportunities</h4>
                      <div className="space-y-2">
                        {(fanbaseData?.growthOpportunities || []).map((opportunity, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 p-3 bg-primary/5 rounded"
                          >
                            <Target className="w-5 h-5 text-primary mt-0.5" />
                            <span className="text-sm">{opportunity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Release Strategy</CardTitle>
                <CardDescription>Optimal timing and approach for your next release</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingReleaseStrategy ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Generating strategy...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-muted/50 rounded">
                        <p className="text-xs text-muted-foreground mb-1">Best Release Day</p>
                        <p className="text-lg font-semibold">
                          {releaseStrategy?.bestReleaseDay || 'N/A'}
                        </p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded">
                        <p className="text-xs text-muted-foreground mb-1">Best Release Time</p>
                        <p className="text-lg font-semibold">
                          {releaseStrategy?.bestReleaseTime || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-3">AI Recommendations</h4>
                      <div className="space-y-2">
                        {(releaseStrategy?.recommendations || []).map((rec, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 text-sm p-2 bg-muted/30 rounded"
                          >
                            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Admin-only tabs */}
          {isAdmin && (
            <>
              <TabsContent value="platform" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Platform Uptime</p>
                          <p className="text-2xl font-bold">{platformMetrics?.uptime || 0}%</p>
                        </div>
                        <Activity className="w-8 h-8 text-green-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Active Users</p>
                          <p className="text-2xl font-bold">{platformMetrics?.activeUsers || 0}</p>
                        </div>
                        <Users className="w-8 h-8 text-blue-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Response Time</p>
                          <p className="text-2xl font-bold">
                            {platformMetrics?.responseTime || 0}ms
                          </p>
                        </div>
                        <Zap className="w-8 h-8 text-yellow-600" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>System Resources</CardTitle>
                    <CardDescription>Real-time platform performance metrics</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loadingPlatformMetrics ? (
                      <div className="text-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading platform metrics...</p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">CPU Usage</span>
                            <span className="text-sm text-muted-foreground">
                              {platformMetrics?.cpu || 0}%
                            </span>
                          </div>
                          <Progress value={platformMetrics?.cpu || 0} className="h-2" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Memory Usage</span>
                            <span className="text-sm text-muted-foreground">
                              {platformMetrics?.memory || 0}%
                            </span>
                          </div>
                          <Progress value={platformMetrics?.memory || 0} className="h-2" />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="admin-overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Users</p>
                          <p className="text-2xl font-bold">{adminAnalytics?.totalUsers || 0}</p>
                        </div>
                        <Users className="w-8 h-8 text-blue-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Revenue</p>
                          <p className="text-2xl font-bold">${adminAnalytics?.totalRevenue || 0}</p>
                        </div>
                        <DollarSign className="w-8 h-8 text-green-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Recent Signups</p>
                          <p className="text-2xl font-bold">{adminAnalytics?.recentSignups || 0}</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-purple-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Growth Rate</p>
                          <p className="text-2xl font-bold">
                            {adminAnalytics?.monthlyGrowth?.toFixed(1) || 0}%
                          </p>
                        </div>
                        <Activity className="w-8 h-8 text-orange-600" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Platform Overview</CardTitle>
                    <CardDescription>
                      Comprehensive platform analytics and user distribution
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingAdminAnalytics ? (
                      <div className="text-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading admin analytics...</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium mb-3">Subscription Distribution</h4>
                          <div className="space-y-2">
                            {(adminAnalytics?.subscriptionStats || []).map((stat, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-muted/50 rounded"
                              >
                                <span className="text-sm font-medium capitalize">
                                  {stat.tier || 'Free'}
                                </span>
                                <Badge variant="secondary">{stat.count || 0} users</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                        <Alert>
                          <Shield className="h-4 w-4" />
                          <AlertDescription>
                            Platform-wide AI analytics provide insights into user behavior,
                            engagement patterns, and revenue forecasting for strategic
                            decision-making.
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
