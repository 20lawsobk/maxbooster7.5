import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  BarChart3,
  Zap,
  Target,
  Lightbulb,
  RefreshCw,
  ArrowUpRight,
  Activity,
  Eye,
  Share2,
  Heart,
} from 'lucide-react';

interface PlatformHealth {
  platform: string;
  overallScore: number;
  status: 'healthy' | 'warning' | 'critical' | 'shadowbanned';
  metrics: {
    reachTrend: 'increasing' | 'stable' | 'declining';
    engagementRate: number;
    impressionRatio: number;
    followerGrowth: number;
    hashtagReach: number;
  };
  alerts: Array<{
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    suggestedAction: string;
  }>;
  recommendations: string[];
}

interface DashboardData {
  overallHealth: number;
  reachMultiplier: number;
  platformHealth: Record<string, PlatformHealth>;
  optimalTiming: Record<string, {
    bestTimes: Array<{
      dayOfWeek: number;
      hour: number;
      score: number;
    }>;
    nextOptimalSlot: string;
  }>;
  alerts: Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    suggestedAction: string;
  }>;
  recommendations: string[];
  growthProjection: {
    current: number;
    projected30Days: number;
    projected90Days: number;
  };
  viralHighlights: Array<{
    platform: string;
    topScore: number;
    avgScore: number;
    viralPotential: number;
  }>;
  heatmapData: Array<{
    dayOfWeek: number;
    hour: number;
    value: number;
    platform: string;
  }>;
  lastUpdated: string;
}

const platformIcons: Record<string, string> = {
  tiktok: '📱',
  instagram: '📸',
  youtube: '🎬',
  twitter: '🐦',
  facebook: '👥',
  linkedin: '💼',
};

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function OrganicReachDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/growth/dashboard', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      
      const result = await response.json();
      setData(result.dashboard);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 300000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      case 'shadowbanned': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      healthy: 'default',
      warning: 'secondary',
      critical: 'destructive',
      shadowbanned: 'destructive',
    };
    return variants[status] || 'default';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'declining': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'high': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'medium': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default: return <CheckCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={fetchDashboardData} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Organic Growth OS</h1>
          <p className="text-muted-foreground">
            AI-powered reach optimization across all platforms
          </p>
        </div>
        <Button 
          onClick={fetchDashboardData} 
          variant="outline" 
          size="sm"
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall Health</p>
                <p className="text-3xl font-bold">{data.overallHealth}/100</p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                data.overallHealth >= 70 ? 'bg-green-100' : 
                data.overallHealth >= 50 ? 'bg-yellow-100' : 'bg-red-100'
              }`}>
                <Activity className={`w-6 h-6 ${
                  data.overallHealth >= 70 ? 'text-green-600' : 
                  data.overallHealth >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`} />
              </div>
            </div>
            <Progress value={data.overallHealth} className="mt-4" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Reach Multiplier</p>
                <p className="text-3xl font-bold">{data.reachMultiplier}x</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              {data.reachMultiplier >= 1.2 ? 'Above average performance' : 
               data.reachMultiplier >= 1 ? 'Average performance' : 'Below baseline'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Alerts</p>
                <p className="text-3xl font-bold">{data.alerts.length}</p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                data.alerts.length === 0 ? 'bg-green-100' : 'bg-yellow-100'
              }`}>
                <AlertTriangle className={`w-6 h-6 ${
                  data.alerts.length === 0 ? 'text-green-600' : 'text-yellow-600'
                }`} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              {data.alerts.filter(a => a.severity === 'high' || a.severity === 'critical').length} require attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">30-Day Projection</p>
                <p className="text-3xl font-bold">+{data.growthProjection.projected30Days - data.growthProjection.current}%</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              90-day: +{data.growthProjection.projected90Days - data.growthProjection.current}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="platforms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="platforms">Platform Health</TabsTrigger>
          <TabsTrigger value="timing">Optimal Timing</TabsTrigger>
          <TabsTrigger value="viral">Viral Potential</TabsTrigger>
          <TabsTrigger value="recommendations">AI Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="platforms" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(data.platformHealth).map(([platform, health]) => (
              <Card key={platform} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{platformIcons[platform]}</span>
                      <CardTitle className="capitalize">{platform}</CardTitle>
                    </div>
                    <Badge variant={getStatusBadge(health.status)}>
                      {health.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Health Score</span>
                      <span className="font-semibold">{health.overallScore}/100</span>
                    </div>
                    <Progress value={health.overallScore} />
                    
                    <div className="space-y-2 mt-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Reach
                        </span>
                        <span className="flex items-center gap-1">
                          {getTrendIcon(health.metrics.reachTrend)}
                          {health.metrics.reachTrend}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" /> Engagement
                        </span>
                        <span>{health.metrics.engagementRate}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> Growth
                        </span>
                        <span className={health.metrics.followerGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {health.metrics.followerGrowth >= 0 ? '+' : ''}{health.metrics.followerGrowth}%
                        </span>
                      </div>
                    </div>

                    {health.alerts.length > 0 && (
                      <Alert className="mt-3 py-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          {health.alerts[0].message}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="timing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(data.optimalTiming).map(([platform, timing]) => (
              <Card key={platform}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{platformIcons[platform]}</span>
                    <CardTitle className="capitalize">{platform} Best Times</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>Next optimal: {new Date(timing.nextOptimalSlot).toLocaleString()}</span>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-1">
                      {dayNames.map((day, i) => (
                        <div key={day} className="text-center text-xs text-muted-foreground">
                          {day}
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-1">
                      {timing.bestTimes.slice(0, 5).map((slot, i) => (
                        <div 
                          key={i} 
                          className="flex items-center justify-between p-2 rounded bg-muted/50"
                        >
                          <span className="text-sm">
                            {dayNames[slot.dayOfWeek]} at {slot.hour}:00
                          </span>
                          <div className="flex items-center gap-2">
                            <div 
                              className="h-2 rounded-full bg-green-500"
                              style={{ width: `${slot.score}px` }}
                            />
                            <span className="text-sm font-medium">{slot.score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="viral" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.viralHighlights.map((highlight) => (
              <Card key={highlight.platform}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{platformIcons[highlight.platform]}</span>
                    <CardTitle className="capitalize">{highlight.platform}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-muted-foreground">Viral Potential</span>
                        <span className="font-bold text-lg">{highlight.viralPotential}%</span>
                      </div>
                      <Progress value={highlight.viralPotential} className="h-3" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-2 rounded bg-muted/50">
                        <p className="text-2xl font-bold">{highlight.topScore}</p>
                        <p className="text-xs text-muted-foreground">Top Score</p>
                      </div>
                      <div className="text-center p-2 rounded bg-muted/50">
                        <p className="text-2xl font-bold">{highlight.avgScore}</p>
                        <p className="text-xs text-muted-foreground">Avg Score</p>
                      </div>
                    </div>

                    <Button variant="outline" className="w-full" size="sm">
                      <Target className="w-4 h-4 mr-2" />
                      Optimize Content
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Content Performance Heatmap
              </CardTitle>
              <CardDescription>
                Performance scores by day and time across platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-8 gap-1 min-w-[500px]">
                  <div></div>
                  {dayNames.map((day) => (
                    <div key={day} className="text-center text-xs font-medium p-2">
                      {day}
                    </div>
                  ))}
                  
                  {[6, 9, 12, 15, 18, 21].map((hour) => (
                    <>
                      <div key={`label-${hour}`} className="text-xs text-muted-foreground text-right pr-2 py-2">
                        {hour}:00
                      </div>
                      {dayNames.map((_, dayIndex) => {
                        const entry = data.heatmapData.find(
                          d => d.dayOfWeek === dayIndex && d.hour === hour
                        );
                        const value = entry?.value || 0;
                        return (
                          <div
                            key={`${hour}-${dayIndex}`}
                            className="aspect-square rounded flex items-center justify-center text-xs font-medium"
                            style={{
                              backgroundColor: `rgba(34, 197, 94, ${value / 100})`,
                              color: value > 60 ? 'white' : 'inherit',
                            }}
                          >
                            {value}
                          </div>
                        );
                      })}
                    </>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  AI Recommendations
                </CardTitle>
                <CardDescription>
                  Personalized suggestions to boost your organic reach
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.recommendations.map((rec, i) => (
                    <div 
                      key={i} 
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold">{i + 1}</span>
                      </div>
                      <p className="text-sm">{rec}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  Active Alerts
                </CardTitle>
                <CardDescription>
                  Issues that need your attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.alerts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                    <p>No active alerts - everything looks healthy!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.alerts.map((alert) => (
                      <Alert 
                        key={alert.id} 
                        variant={alert.severity === 'critical' || alert.severity === 'high' ? 'destructive' : 'default'}
                      >
                        <div className="flex items-start gap-2">
                          {getSeverityIcon(alert.severity)}
                          <div className="flex-1">
                            <AlertTitle className="text-sm">{alert.message}</AlertTitle>
                            <AlertDescription className="text-xs mt-1">
                              {alert.suggestedAction}
                            </AlertDescription>
                          </div>
                          <Badge variant="outline" className="ml-2">
                            {alert.severity}
                          </Badge>
                        </div>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                Growth Trajectory
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-1">Current</p>
                  <p className="text-3xl font-bold">{data.growthProjection.current}%</p>
                  <p className="text-xs text-muted-foreground">Baseline</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950">
                  <p className="text-sm text-muted-foreground mb-1">30 Days</p>
                  <p className="text-3xl font-bold text-green-600">
                    {data.growthProjection.projected30Days}%
                  </p>
                  <p className="text-xs text-green-600 flex items-center justify-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +{data.growthProjection.projected30Days - data.growthProjection.current}%
                  </p>
                </div>
                <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-950">
                  <p className="text-sm text-muted-foreground mb-1">90 Days</p>
                  <p className="text-3xl font-bold text-purple-600">
                    {data.growthProjection.projected90Days}%
                  </p>
                  <p className="text-xs text-purple-600 flex items-center justify-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    +{data.growthProjection.projected90Days - data.growthProjection.current}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="text-xs text-muted-foreground text-center">
        Last updated: {new Date(data.lastUpdated).toLocaleString()}
      </div>
    </div>
  );
}

export default OrganicReachDashboard;
