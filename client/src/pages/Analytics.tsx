import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { motion, AnimatePresence } from 'framer-motion';

import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { StatCard, StatCardRow } from '@/components/ui/stat-card';
import { ChartCard, SimpleAreaChart, PlatformBreakdown } from '@/components/ui/chart-card';
import {
  BarChart3,
  TrendingUp,
  Play,
  DollarSign,
  Users,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  Eye,
  Heart,
  Share2,
  Clock,
  Globe,
  Music,
  Target,
  Zap,
  Activity,
  PieChart,
  LineChart,
  MapPin,
  Smartphone,
  Monitor,
  Headphones,
  Radio,
  Mic,
  Volume2,
  Star,
  Award,
  Trophy,
  Crown,
  Flame,
  Sparkles,
  SkipForward,
  RotateCcw,
  Brain,
  Rocket,
  Shield,
  Lock,
  Unlock,
  CheckCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  ArrowUp,
  ArrowDown,
  TrendingDown,
  Plus,
  Settings,
  Bell,
  Search,
  Edit2,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Megaphone,
  Tv,
  Laptop,
  Tablet,
  Gamepad2,
  Car,
  Plane,
  Train,
  Bus,
  Home,
  Building,
  School,
  Coffee,
  Utensils,
  ShoppingBag,
  Briefcase,
  Dumbbell,
  Gamepad,
  Book,
  Camera,
  Video,
  Image,
  FileText,
  Link,
  Mail,
  Phone,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  UserMinus,
  UserPlus,
  ListMusic,
  Map,
  GitBranch,
  Layers,
  Percent,
} from 'lucide-react';

interface FanJourneyStage {
  stage: string;
  count: number;
  percentage: number;
  conversionRate: number;
  dropOffRate: number;
}

interface CohortData {
  cohortMonth: string;
  initialUsers: number;
  retention: {
    week1: number;
    week2: number;
    week3: number;
    week4: number;
    month2: number;
    month3: number;
    month6: number;
  };
}

interface ChurnData {
  period: string;
  churnedUsers: number;
  churnRate: number;
  reasons: Array<{ reason: string; percentage: number }>;
  riskSegments: Array<{ segment: string; riskLevel: string; count: number }>;
}

interface PlaylistData {
  id: string;
  name: string;
  platform: string;
  followers: number;
  trackCount: number;
  addedDate: string;
  removedDate?: string;
  status: 'active' | 'removed';
  estimatedStreams: number;
  position?: number;
}

interface RevenueAttribution {
  source: string;
  revenue: number;
  percentage: number;
  streams: number;
  growth: number;
  avgPerStream: number;
}

interface GeoData {
  country: string;
  countryCode: string;
  streams: number;
  revenue: number;
  listeners: number;
  growth: number;
  topCities: Array<{ city: string; streams: number }>;
}

interface DemographicData {
  category: string;
  segments: Array<{
    name: string;
    count: number;
    percentage: number;
    avgEngagement: number;
  }>;
}

interface ForecastData {
  metric: string;
  currentValue: number;
  predictions: Array<{
    period: string;
    predicted: number;
    lowerBound: number;
    upperBound: number;
    confidence: number;
  }>;
  trend: 'up' | 'down' | 'stable';
  growthRate: number;
}

interface AnalyticsData {
  overview: {
    totalStreams: number;
    totalRevenue: number;
    totalListeners: number;
    totalPlays: number;
    avgListenTime: number;
    completionRate: number;
    skipRate: number;
    shareRate: number;
    likeRate: number;
    growthRate: number;
  };
  streams: {
    daily: Array<{ date: string; streams: number; revenue: number }>;
    weekly: Array<{ week: string; streams: number; revenue: number }>;
    monthly: Array<{ month: string; streams: number; revenue: number }>;
    yearly: Array<{ year: string; streams: number; revenue: number }>;
    byPlatform: Array<{ platform: string; streams: number; revenue: number; growth: number }>;
    byTrack: Array<{ track: string; streams: number; revenue: number; growth: number }>;
    byGenre: Array<{ genre: string; streams: number; revenue: number; growth: number }>;
    byCountry: Array<{ country: string; streams: number; revenue: number; growth: number }>;
    byCity: Array<{ city: string; country: string; streams: number; revenue: number }>;
    byDevice: Array<{ device: string; streams: number; percentage: number }>;
    byOS: Array<{ os: string; streams: number; percentage: number }>;
    byBrowser: Array<{ browser: string; streams: number; percentage: number }>;
    bySource: Array<{ source: string; streams: number; percentage: number }>;
    byTimeOfDay: Array<{ hour: number; streams: number; percentage: number }>;
    byDayOfWeek: Array<{ day: string; streams: number; percentage: number }>;
    bySeason: Array<{ season: string; streams: number; percentage: number }>;
    byWeather: Array<{ weather: string; streams: number; percentage: number }>;
    byMood: Array<{ mood: string; streams: number; percentage: number }>;
    byActivity: Array<{ activity: string; streams: number; percentage: number }>;
    byLocation: Array<{ location: string; streams: number; percentage: number }>;
    byDemographics: {
      age: Array<{ ageGroup: string; streams: number; percentage: number }>;
      gender: Array<{ gender: string; streams: number; percentage: number }>;
      income: Array<{ incomeGroup: string; streams: number; percentage: number }>;
      education: Array<{ education: string; streams: number; percentage: number }>;
      occupation: Array<{ occupation: string; streams: number; percentage: number }>;
      interests: Array<{ interest: string; streams: number; percentage: number }>;
    };
  };
  audience: {
    totalListeners: number;
    newListeners: number;
    returningListeners: number;
    listenerRetention: number;
    avgSessionDuration: number;
    sessionsPerListener: number;
    listenerGrowth: number;
    topListeners: Array<{ name: string; streams: number; revenue: number }>;
    listenerSegments: Array<{ segment: string; count: number; percentage: number }>;
    listenerJourney: Array<{ stage: string; count: number; conversion: number }>;
    listenerLifetime: Array<{ period: string; value: number; count: number }>;
    listenerChurn: Array<{ period: string; churnRate: number; retentionRate: number }>;
    listenerEngagement: Array<{ level: string; count: number; percentage: number }>;
    listenerFeedback: Array<{ type: string; count: number; sentiment: string }>;
    listenerSocial: Array<{ platform: string; followers: number; engagement: number }>;
    listenerInfluence: Array<{ level: string; count: number; reach: number }>;
    listenerValue: Array<{ tier: string; count: number; revenue: number }>;
    listenerPredictions: {
      nextMonthListeners: number;
      nextMonthRevenue: number;
      churnRisk: number;
      growthPotential: number;
    };
  };
  revenue: {
    totalRevenue: number;
    monthlyRevenue: number;
    yearlyRevenue: number;
    revenueGrowth: number;
    revenuePerStream: number;
    revenuePerListener: number;
    revenueByPlatform: Array<{ platform: string; revenue: number; percentage: number }>;
    revenueByTrack: Array<{ track: string; revenue: number; percentage: number }>;
    revenueByCountry: Array<{ country: string; revenue: number; percentage: number }>;
    revenueBySource: Array<{ source: string; revenue: number; percentage: number }>;
    revenueByTime: Array<{ period: string; revenue: number; percentage: number }>;
    revenueByDemographics: Array<{ demographic: string; revenue: number; percentage: number }>;
    revenuePredictions: {
      nextMonth: number;
      nextQuarter: number;
      nextYear: number;
      growthRate: number;
    };
    revenueOptimization: Array<{ strategy: string; potential: number; impact: string }>;
    revenueStreams: Array<{ stream: string; revenue: number; growth: number }>;
    revenueForecasting: Array<{
      period: string;
      predicted: number;
      actual: number;
      accuracy: number;
    }>;
  };
  fanJourney: {
    stages: FanJourneyStage[];
    funnelMetrics: {
      awarenessToEngagement: number;
      engagementToConversion: number;
      conversionToAdvocacy: number;
      overallConversion: number;
    };
    journeyInsights: Array<{
      insight: string;
      impact: string;
      recommendation: string;
    }>;
  };
  cohorts: CohortData[];
  churn: ChurnData[];
  playlists: {
    current: PlaylistData[];
    historical: PlaylistData[];
    metrics: {
      totalPlaylists: number;
      totalReach: number;
      estimatedMonthlyStreams: number;
      avgPlaylistPosition: number;
      additionsThisMonth: number;
      removalsThisMonth: number;
    };
  };
  revenueAttribution: RevenueAttribution[];
  geographic: GeoData[];
  demographics: DemographicData[];
  forecasts: ForecastData[];
  aiInsights: {
    performanceScore: number;
    recommendations: Array<{
      title: string;
      description: string;
      priority: string;
      impact: string;
    }>;
    predictions: {
      nextMonthStreams: number;
      nextMonthRevenue: number;
      viralPotential: number;
      growthTrend: string;
      marketOpportunity: number;
      competitivePosition: number;
      contentGaps: Array<{ gap: string; opportunity: number }>;
      audienceExpansion: Array<{ segment: string; potential: number }>;
      platformOptimization: Array<{ platform: string; improvement: number }>;
      contentStrategy: Array<{ strategy: string; effectiveness: number }>;
      marketingOpportunities: Array<{ opportunity: string; potential: number }>;
      partnershipPotential: Array<{ partner: string; value: number }>;
      trendAnalysis: Array<{ trend: string; relevance: number; timeframe: string }>;
      riskAssessment: Array<{ risk: string; probability: number; impact: string }>;
      opportunityMatrix: Array<{ opportunity: string; effort: number; impact: number }>;
      successFactors: Array<{ factor: string; importance: number; current: number }>;
      improvementAreas: Array<{ area: string; current: number; potential: number }>;
      benchmarkComparison: Array<{
        metric: string;
        current: number;
        benchmark: number;
        gap: number;
      }>;
      marketPosition: Array<{ dimension: string; score: number; trend: string }>;
      competitiveAdvantage: Array<{ advantage: string; strength: number; sustainability: number }>;
      growthDrivers: Array<{ driver: string; impact: number; timeframe: string }>;
      performanceIndicators: Array<{
        indicator: string;
        value: number;
        trend: string;
        target: number;
      }>;
      optimizationOpportunities: Array<{
        area: string;
        current: number;
        optimized: number;
        improvement: number;
      }>;
      strategicRecommendations: Array<{
        recommendation: string;
        priority: string;
        timeframe: string;
        resources: string;
      }>;
      marketIntelligence: Array<{
        insight: string;
        source: string;
        confidence: number;
        relevance: number;
      }>;
      futureScenarios: Array<{
        scenario: string;
        probability: number;
        impact: string;
        preparation: string;
      }>;
    };
    realTimeOptimization: {
      active: boolean;
      optimizations: Array<{ type: string; status: string; impact: number }>;
      performance: Array<{
        metric: string;
        current: number;
        optimized: number;
        improvement: number;
      }>;
      recommendations: Array<{ recommendation: string; priority: string; implementation: string }>;
    };
  };
}

const FanJourneyFunnel = memo(({ data }: { data: AnalyticsData['fanJourney'] | undefined }) => {
  const defaultStages: FanJourneyStage[] = [
    { stage: 'Awareness', count: 0, percentage: 100, conversionRate: 0, dropOffRate: 0 },
    { stage: 'Discovery', count: 0, percentage: 0, conversionRate: 0, dropOffRate: 0 },
    { stage: 'Engagement', count: 0, percentage: 0, conversionRate: 0, dropOffRate: 0 },
    { stage: 'Conversion', count: 0, percentage: 0, conversionRate: 0, dropOffRate: 0 },
    { stage: 'Advocacy', count: 0, percentage: 0, conversionRate: 0, dropOffRate: 0 },
  ];

  const stages = data?.stages || defaultStages;
  const stageColors = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'];
  const stageIcons = [Eye, Search, Heart, DollarSign, Megaphone];

  return (
    <div className="space-y-6">
      <div className="relative">
        {stages.map((stage, index) => {
          const Icon = stageIcons[index] || Eye;
          const width = Math.max(stage.percentage, 20);
          return (
            <motion.div
              key={stage.stage}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="mb-3"
            >
              <div className="flex items-center gap-4">
                <div 
                  className="flex items-center justify-between p-4 rounded-lg transition-all hover:shadow-md"
                  style={{ 
                    width: `${width}%`,
                    backgroundColor: `${stageColors[index]}15`,
                    borderLeft: `4px solid ${stageColors[index]}`
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${stageColors[index]}20` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: stageColors[index] }} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{stage.stage}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {stage.count.toLocaleString()} users
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold" style={{ color: stageColors[index] }}>
                      {stage.percentage.toFixed(1)}%
                    </p>
                    {index > 0 && (
                      <p className="text-xs text-slate-500">
                        {stage.conversionRate.toFixed(1)}% from previous
                      </p>
                    )}
                  </div>
                </div>
                {index < stages.length - 1 && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <ChevronDown className="h-5 w-5" />
                    <span className="text-xs">
                      {stage.dropOffRate > 0 ? `-${stage.dropOffRate.toFixed(1)}%` : ''}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {data?.funnelMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{data.funnelMetrics.awarenessToEngagement.toFixed(1)}%</p>
            <p className="text-xs text-slate-600">Awareness → Engagement</p>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">{data.funnelMetrics.engagementToConversion.toFixed(1)}%</p>
            <p className="text-xs text-slate-600">Engagement → Conversion</p>
          </div>
          <div className="text-center p-3 bg-pink-50 dark:bg-pink-950/20 rounded-lg">
            <p className="text-2xl font-bold text-pink-600">{data.funnelMetrics.conversionToAdvocacy.toFixed(1)}%</p>
            <p className="text-xs text-slate-600">Conversion → Advocacy</p>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{data.funnelMetrics.overallConversion.toFixed(1)}%</p>
            <p className="text-xs text-slate-600">Overall Conversion</p>
          </div>
        </div>
      )}
    </div>
  );
});
FanJourneyFunnel.displayName = 'FanJourneyFunnel';

const CohortAnalysisChart = memo(({ cohorts }: { cohorts: CohortData[] | undefined }) => {
  const defaultCohorts: CohortData[] = [
    { cohortMonth: 'Jan 2025', initialUsers: 1000, retention: { week1: 85, week2: 70, week3: 60, week4: 55, month2: 45, month3: 38, month6: 25 } },
    { cohortMonth: 'Dec 2024', initialUsers: 850, retention: { week1: 82, week2: 68, week3: 58, week4: 52, month2: 42, month3: 35, month6: 22 } },
    { cohortMonth: 'Nov 2024', initialUsers: 920, retention: { week1: 80, week2: 65, week3: 55, week4: 50, month2: 40, month3: 32, month6: 20 } },
  ];

  const data = cohorts && cohorts.length > 0 ? cohorts : defaultCohorts;
  const retentionPeriods = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Month 2', 'Month 3', 'Month 6'];

  const getRetentionColor = (value: number) => {
    if (value >= 70) return 'bg-green-500';
    if (value >= 50) return 'bg-green-400';
    if (value >= 30) return 'bg-yellow-400';
    if (value >= 15) return 'bg-orange-400';
    return 'bg-red-400';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left p-3 font-semibold">Cohort</th>
            <th className="text-center p-3 font-semibold">Users</th>
            {retentionPeriods.map((period) => (
              <th key={period} className="text-center p-3 font-semibold">{period}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((cohort, idx) => (
            <tr key={cohort.cohortMonth} className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-900/50' : ''}>
              <td className="p-3 font-medium">{cohort.cohortMonth}</td>
              <td className="p-3 text-center">{cohort.initialUsers.toLocaleString()}</td>
              {Object.values(cohort.retention).map((value, i) => (
                <td key={i} className="p-2 text-center">
                  <div 
                    className={`inline-flex items-center justify-center w-12 h-8 rounded text-white text-xs font-semibold ${getRetentionColor(value)}`}
                  >
                    {value}%
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
CohortAnalysisChart.displayName = 'CohortAnalysisChart';

const ChurnAnalytics = memo(({ churnData }: { churnData: ChurnData[] | undefined }) => {
  const defaultChurn: ChurnData = {
    period: 'Last 30 days',
    churnedUsers: 0,
    churnRate: 0,
    reasons: [
      { reason: 'No new content', percentage: 35 },
      { reason: 'Found alternatives', percentage: 25 },
      { reason: 'Price sensitivity', percentage: 20 },
      { reason: 'Lost interest', percentage: 15 },
      { reason: 'Other', percentage: 5 },
    ],
    riskSegments: [
      { segment: 'Casual listeners', riskLevel: 'high', count: 1200 },
      { segment: 'Inactive 30+ days', riskLevel: 'critical', count: 450 },
      { segment: 'Low engagement', riskLevel: 'medium', count: 800 },
    ],
  };

  const data = churnData && churnData.length > 0 ? churnData[0] : defaultChurn;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Churn Rate</p>
                <p className="text-3xl font-bold text-red-600">{data.churnRate.toFixed(1)}%</p>
              </div>
              <UserMinus className="h-10 w-10 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Churned Users</p>
                <p className="text-3xl font-bold">{data.churnedUsers.toLocaleString()}</p>
              </div>
              <Users className="h-10 w-10 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Retention Rate</p>
                <p className="text-3xl font-bold text-green-600">{(100 - data.churnRate).toFixed(1)}%</p>
              </div>
              <UserPlus className="h-10 w-10 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Churn Reasons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.reasons.map((reason, idx) => (
                <div key={reason.reason} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{reason.reason}</span>
                    <span className="font-semibold">{reason.percentage}%</span>
                  </div>
                  <Progress value={reason.percentage} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">At-Risk Segments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.riskSegments.map((segment) => (
                <div 
                  key={segment.segment}
                  className={`flex items-center justify-between p-3 rounded-lg border ${getRiskColor(segment.riskLevel)}`}
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="font-medium">{segment.segment}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{segment.count.toLocaleString()}</p>
                    <p className="text-xs uppercase">{segment.riskLevel} risk</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
ChurnAnalytics.displayName = 'ChurnAnalytics';

const GeographicHeatMap = memo(({ geoData }: { geoData: GeoData[] | undefined }) => {
  const defaultGeo: GeoData[] = [
    { country: 'United States', countryCode: 'US', streams: 45000, revenue: 180, listeners: 12000, growth: 12.5, topCities: [{ city: 'Los Angeles', streams: 15000 }, { city: 'New York', streams: 12000 }] },
    { country: 'United Kingdom', countryCode: 'GB', streams: 28000, revenue: 112, listeners: 7500, growth: 8.3, topCities: [{ city: 'London', streams: 18000 }, { city: 'Manchester', streams: 5000 }] },
    { country: 'Germany', countryCode: 'DE', streams: 22000, revenue: 88, listeners: 6000, growth: 15.2, topCities: [{ city: 'Berlin', streams: 10000 }, { city: 'Munich', streams: 6000 }] },
    { country: 'Brazil', countryCode: 'BR', streams: 18000, revenue: 36, listeners: 8000, growth: 25.8, topCities: [{ city: 'São Paulo', streams: 9000 }, { city: 'Rio de Janeiro', streams: 5000 }] },
    { country: 'Japan', countryCode: 'JP', streams: 15000, revenue: 75, listeners: 4000, growth: 5.2, topCities: [{ city: 'Tokyo', streams: 10000 }, { city: 'Osaka', streams: 3000 }] },
  ];

  const data = geoData && geoData.length > 0 ? geoData : defaultGeo;
  const totalStreams = data.reduce((sum, g) => sum + g.streams, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.slice(0, 6).map((geo, idx) => {
          const percentage = ((geo.streams / totalStreams) * 100).toFixed(1);
          return (
            <motion.div
              key={geo.country}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getCountryFlag(geo.countryCode)}</span>
                      <div>
                        <p className="font-semibold">{geo.country}</p>
                        <p className="text-xs text-slate-500">{percentage}% of total</p>
                      </div>
                    </div>
                    <Badge 
                      variant={geo.growth > 0 ? 'default' : 'secondary'}
                      className={geo.growth > 0 ? 'bg-green-100 text-green-800' : ''}
                    >
                      {geo.growth > 0 ? '+' : ''}{geo.growth.toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="p-2 bg-blue-50 dark:bg-blue-950/20 rounded">
                      <p className="font-bold text-blue-600">{(geo.streams / 1000).toFixed(1)}k</p>
                      <p className="text-xs text-slate-500">Streams</p>
                    </div>
                    <div className="p-2 bg-green-50 dark:bg-green-950/20 rounded">
                      <p className="font-bold text-green-600">${geo.revenue}</p>
                      <p className="text-xs text-slate-500">Revenue</p>
                    </div>
                    <div className="p-2 bg-purple-50 dark:bg-purple-950/20 rounded">
                      <p className="font-bold text-purple-600">{(geo.listeners / 1000).toFixed(1)}k</p>
                      <p className="text-xs text-slate-500">Listeners</p>
                    </div>
                  </div>
                  {geo.topCities && geo.topCities.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-slate-500 mb-2">Top Cities</p>
                      <div className="flex flex-wrap gap-1">
                        {geo.topCities.slice(0, 2).map((city) => (
                          <Badge key={city.city} variant="outline" className="text-xs">
                            {city.city}: {(city.streams / 1000).toFixed(1)}k
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});
GeographicHeatMap.displayName = 'GeographicHeatMap';

const DemographicsBreakdown = memo(({ demographics }: { demographics: DemographicData[] | undefined }) => {
  const defaultDemographics: DemographicData[] = [
    {
      category: 'Age',
      segments: [
        { name: '18-24', count: 8500, percentage: 28, avgEngagement: 4.2 },
        { name: '25-34', count: 12000, percentage: 40, avgEngagement: 3.8 },
        { name: '35-44', count: 5500, percentage: 18, avgEngagement: 3.5 },
        { name: '45-54', count: 2800, percentage: 9, avgEngagement: 3.2 },
        { name: '55+', count: 1500, percentage: 5, avgEngagement: 2.9 },
      ],
    },
    {
      category: 'Gender',
      segments: [
        { name: 'Male', count: 16000, percentage: 53, avgEngagement: 3.6 },
        { name: 'Female', count: 12500, percentage: 42, avgEngagement: 4.1 },
        { name: 'Other', count: 1500, percentage: 5, avgEngagement: 3.8 },
      ],
    },
  ];

  const data = demographics && demographics.length > 0 ? demographics : defaultDemographics;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {data.map((demo) => (
        <Card key={demo.category}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              {demo.category} Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {demo.segments.map((segment, idx) => {
                const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e'];
                return (
                  <div key={segment.name} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium">{segment.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500">{segment.count.toLocaleString()} users</span>
                        <span className="font-bold" style={{ color: colors[idx % colors.length] }}>
                          {segment.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${segment.percentage}%` }}
                        transition={{ duration: 0.5, delay: idx * 0.1 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: colors[idx % colors.length] }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Avg. engagement: {segment.avgEngagement.toFixed(1)} streams/user
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});
DemographicsBreakdown.displayName = 'DemographicsBreakdown';

const PlaylistTracker = memo(({ playlists }: { playlists: AnalyticsData['playlists'] | undefined }) => {
  const defaultPlaylists: PlaylistData[] = [
    { id: '1', name: 'Chill Vibes', platform: 'Spotify', followers: 250000, trackCount: 85, addedDate: '2025-01-05', status: 'active', estimatedStreams: 15000, position: 23 },
    { id: '2', name: 'New Music Friday', platform: 'Spotify', followers: 8500000, trackCount: 50, addedDate: '2025-01-03', status: 'active', estimatedStreams: 85000, position: 42 },
    { id: '3', name: 'Indie Essentials', platform: 'Apple Music', followers: 180000, trackCount: 100, addedDate: '2024-12-20', status: 'active', estimatedStreams: 8500 },
    { id: '4', name: 'Today\'s Hits', platform: 'Spotify', followers: 12000000, trackCount: 50, addedDate: '2024-12-01', removedDate: '2024-12-15', status: 'removed', estimatedStreams: 0 },
  ];

  const data = playlists?.current && playlists.current.length > 0 ? playlists.current : defaultPlaylists;
  const metrics = playlists?.metrics || {
    totalPlaylists: 12,
    totalReach: 21430000,
    estimatedMonthlyStreams: 108500,
    avgPlaylistPosition: 35,
    additionsThisMonth: 3,
    removalsThisMonth: 1,
  };

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'spotify': return 'bg-green-100 text-green-800 border-green-200';
      case 'apple music': return 'bg-red-100 text-red-800 border-red-200';
      case 'youtube music': return 'bg-red-100 text-red-800 border-red-200';
      case 'amazon music': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <ListMusic className="h-8 w-8 mx-auto text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{metrics.totalPlaylists}</p>
            <p className="text-xs text-slate-500">Total Playlists</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-8 w-8 mx-auto text-purple-500 mb-2" />
            <p className="text-2xl font-bold">{(metrics.totalReach / 1000000).toFixed(1)}M</p>
            <p className="text-xs text-slate-500">Total Reach</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Play className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold">{(metrics.estimatedMonthlyStreams / 1000).toFixed(1)}k</p>
            <p className="text-xs text-slate-500">Est. Monthly Streams</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Target className="h-8 w-8 mx-auto text-orange-500 mb-2" />
            <p className="text-2xl font-bold">#{metrics.avgPlaylistPosition}</p>
            <p className="text-xs text-slate-500">Avg. Position</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-4 text-center">
            <Plus className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold text-green-600">+{metrics.additionsThisMonth}</p>
            <p className="text-xs text-slate-500">Added This Month</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-4 text-center">
            <Trash2 className="h-8 w-8 mx-auto text-red-500 mb-2" />
            <p className="text-2xl font-bold text-red-600">-{metrics.removalsThisMonth}</p>
            <p className="text-xs text-slate-500">Removed This Month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListMusic className="h-5 w-5 text-blue-500" />
            Playlist Placements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">Playlist</th>
                  <th className="text-left p-3">Platform</th>
                  <th className="text-right p-3">Followers</th>
                  <th className="text-right p-3">Position</th>
                  <th className="text-right p-3">Est. Streams</th>
                  <th className="text-center p-3">Status</th>
                  <th className="text-left p-3">Added</th>
                </tr>
              </thead>
              <tbody>
                {data.map((playlist) => (
                  <tr key={playlist.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="p-3 font-medium">{playlist.name}</td>
                    <td className="p-3">
                      <Badge className={getPlatformColor(playlist.platform)}>
                        {playlist.platform}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">{playlist.followers.toLocaleString()}</td>
                    <td className="p-3 text-right">{playlist.position ? `#${playlist.position}` : '-'}</td>
                    <td className="p-3 text-right">{playlist.estimatedStreams.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <Badge variant={playlist.status === 'active' ? 'default' : 'secondary'}>
                        {playlist.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-slate-500">
                      {new Date(playlist.addedDate).toLocaleDateString()}
                      {playlist.removedDate && (
                        <span className="text-red-500 ml-2">
                          → {new Date(playlist.removedDate).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
PlaylistTracker.displayName = 'PlaylistTracker';

const RevenueAttributionChart = memo(({ attribution }: { attribution: RevenueAttribution[] | undefined }) => {
  const defaultAttribution: RevenueAttribution[] = [
    { source: 'Streaming', revenue: 2450, percentage: 45, streams: 612500, growth: 12.3, avgPerStream: 0.004 },
    { source: 'Playlist Placements', revenue: 1200, percentage: 22, streams: 300000, growth: 28.5, avgPerStream: 0.004 },
    { source: 'Algorithmic Discovery', revenue: 850, percentage: 16, streams: 212500, growth: 35.2, avgPerStream: 0.004 },
    { source: 'Social Media', revenue: 450, percentage: 8, streams: 112500, growth: 45.8, avgPerStream: 0.004 },
    { source: 'Direct Links', revenue: 280, percentage: 5, streams: 70000, growth: 8.2, avgPerStream: 0.004 },
    { source: 'Search', revenue: 220, percentage: 4, streams: 55000, growth: 5.5, avgPerStream: 0.004 },
  ];

  const data = attribution && attribution.length > 0 ? attribution : defaultAttribution;
  const totalRevenue = data.reduce((sum, a) => sum + a.revenue, 0);
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#06b6d4'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.map((item, idx) => (
                <div key={item.source} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: colors[idx % colors.length] }}
                      />
                      <span className="font-medium">{item.source}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-500">${item.revenue.toLocaleString()}</span>
                      <Badge 
                        variant={item.growth > 0 ? 'default' : 'secondary'}
                        className={item.growth > 0 ? 'bg-green-100 text-green-800' : ''}
                      >
                        {item.growth > 0 ? '+' : ''}{item.growth.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.percentage}%` }}
                      transition={{ duration: 0.5, delay: idx * 0.1 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: colors[idx % colors.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attribution Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-xl">
                <p className="text-4xl font-bold text-blue-600">${totalRevenue.toLocaleString()}</p>
                <p className="text-sm text-slate-600 mt-1">Total Attributed Revenue</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-center">
                  <p className="text-xl font-bold">{data.length}</p>
                  <p className="text-xs text-slate-500">Revenue Sources</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-center">
                  <p className="text-xl font-bold">${(totalRevenue / data.length).toFixed(0)}</p>
                  <p className="text-xs text-slate-500">Avg per Source</p>
                </div>
              </div>
              <div className="pt-4 border-t">
                <p className="text-sm font-semibold mb-2">Top Performers</p>
                <div className="space-y-2">
                  {data.slice(0, 3).map((item, idx) => (
                    <div key={item.source} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <span>{item.source}</span>
                      </div>
                      <span className="font-semibold">${item.revenue.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
RevenueAttributionChart.displayName = 'RevenueAttributionChart';

const PredictiveForecasting = memo(({ forecasts }: { forecasts: ForecastData[] | undefined }) => {
  const defaultForecasts: ForecastData[] = [
    {
      metric: 'Streams',
      currentValue: 125000,
      trend: 'up',
      growthRate: 15.2,
      predictions: [
        { period: 'Next Week', predicted: 32500, lowerBound: 28000, upperBound: 37000, confidence: 92 },
        { period: 'Next Month', predicted: 145000, lowerBound: 130000, upperBound: 165000, confidence: 85 },
        { period: 'Next Quarter', predicted: 480000, lowerBound: 420000, upperBound: 550000, confidence: 75 },
      ],
    },
    {
      metric: 'Followers',
      currentValue: 28500,
      trend: 'up',
      growthRate: 8.5,
      predictions: [
        { period: 'Next Week', predicted: 29200, lowerBound: 28800, upperBound: 29600, confidence: 90 },
        { period: 'Next Month', predicted: 31000, lowerBound: 29500, upperBound: 32500, confidence: 82 },
        { period: 'Next Quarter', predicted: 38000, lowerBound: 35000, upperBound: 42000, confidence: 72 },
      ],
    },
    {
      metric: 'Revenue',
      currentValue: 2850,
      trend: 'up',
      growthRate: 12.8,
      predictions: [
        { period: 'Next Week', predicted: 750, lowerBound: 680, upperBound: 820, confidence: 88 },
        { period: 'Next Month', predicted: 3200, lowerBound: 2900, upperBound: 3600, confidence: 80 },
        { period: 'Next Quarter', predicted: 11500, lowerBound: 10000, upperBound: 13500, confidence: 70 },
      ],
    },
  ];

  const data = forecasts && forecasts.length > 0 ? forecasts : defaultForecasts;

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-5 w-5 text-green-500" />;
      case 'down': return <TrendingDown className="h-5 w-5 text-red-500" />;
      default: return <Activity className="h-5 w-5 text-slate-500" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return 'text-green-600 bg-green-100';
    if (confidence >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-orange-600 bg-orange-100';
  };

  return (
    <div className="space-y-6">
      {data.map((forecast) => (
        <Card key={forecast.metric}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {getTrendIcon(forecast.trend)}
                {forecast.metric} Forecast
              </CardTitle>
              <Badge 
                variant="outline"
                className={forecast.growthRate > 0 ? 'text-green-600' : 'text-red-600'}
              >
                {forecast.growthRate > 0 ? '+' : ''}{forecast.growthRate.toFixed(1)}% trend
              </Badge>
            </div>
            <CardDescription>
              Current: {forecast.metric === 'Revenue' ? '$' : ''}{forecast.currentValue.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {forecast.predictions.map((pred) => (
                <div 
                  key={pred.period}
                  className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 rounded-lg"
                >
                  <p className="text-sm text-slate-500 mb-2">{pred.period}</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {forecast.metric === 'Revenue' ? '$' : ''}{pred.predicted.toLocaleString()}
                  </p>
                  <div className="mt-2 text-xs text-slate-500">
                    <p>Range: {forecast.metric === 'Revenue' ? '$' : ''}{pred.lowerBound.toLocaleString()} - {forecast.metric === 'Revenue' ? '$' : ''}{pred.upperBound.toLocaleString()}</p>
                  </div>
                  <div className="mt-2">
                    <Badge className={getConfidenceColor(pred.confidence)}>
                      {pred.confidence}% confidence
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});
PredictiveForecasting.displayName = 'PredictiveForecasting';

function getCountryFlag(countryCode: string): string {
  const flags: Record<string, string> = {
    US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', BR: '🇧🇷',
    JP: '🇯🇵', AU: '🇦🇺', CA: '🇨🇦', MX: '🇲🇽', ES: '🇪🇸',
    IT: '🇮🇹', NL: '🇳🇱', SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰',
    IN: '🇮🇳', KR: '🇰🇷', AR: '🇦🇷', CL: '🇨🇱', CO: '🇨🇴',
  };
  return flags[countryCode] || '🌍';
}

export default function Analytics() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [timeRange, setTimeRange] = useState('30d');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [realtimeData, setRealtimeData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [connectionLostTime, setConnectionLostTime] = useState<number | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const {
    data: analyticsData,
    isLoading: analyticsLoading,
    refetch,
  } = useQuery({
    queryKey: ['/api/analytics/dashboard', timeRange],
    enabled: !!user,
    refetchInterval: autoRefresh ? 30000 : false,
    staleTime: 1 * 60 * 1000,
  });

  const { isConnected, sendMessage, connectionStatus } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'analytics_update') {
        setRealtimeData(message.data);
        setLastUpdate(message.timestamp);
        setConnectionLostTime(null);
      }
    },
    onConnect: () => {
      console.info('📊 Analytics WebSocket connected');
      sendMessage({ type: 'subscribe_analytics' });
      setConnectionLostTime(null);
    },
    onDisconnect: () => {
      console.info('📊 Analytics WebSocket disconnected');
      setConnectionLostTime(Date.now());
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          refetch();
        }, 5000);
      }
    },
    onError: (error) => {
      console.error('Analytics WebSocket error:', error);
    },
    reconnectInterval: 3000,
    maxReconnectAttempts: 10,
  });

  useEffect(() => {
    if (connectionLostTime) {
      const checkInterval = setInterval(() => {
        const timeLost = Date.now() - connectionLostTime;
        if (timeLost > 30000 && !isConnected) {
          toast({
            variant: 'destructive',
            title: 'Connection Lost',
            description: 'Real-time analytics updates are unavailable. Falling back to polling.',
          });
          clearInterval(checkInterval);
        }
      }, 5000);
      return () => clearInterval(checkInterval);
    }
  }, [connectionLostTime, isConnected, toast]);

  useEffect(() => {
    if (isConnected && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, [isConnected]);

  const [anomalyMetricFilter, setAnomalyMetricFilter] = useState<string>('all');
  const [anomalySeverityFilter, setAnomalySeverityFilter] = useState<string>('all');

  const { data: anomalySummary } = useQuery({
    queryKey: ['/api/analytics/anomalies/summary'],
    enabled: !!user,
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const {
    data: anomalyData,
    isLoading: anomaliesLoading,
    refetch: refetchAnomalies,
  } = useQuery({
    queryKey: ['/api/analytics/anomalies', anomalyMetricFilter, anomalySeverityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (anomalyMetricFilter !== 'all') params.append('metricType', anomalyMetricFilter);
      if (anomalySeverityFilter !== 'all') params.append('severity', anomalySeverityFilter);
      const response = await fetch(`/api/analytics/anomalies?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch anomalies');
      const result = await response.json();
      return { anomalies: result.data || [], summary: anomalySummary };
    },
    enabled: !!user && selectedTab === 'anomalies',
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (anomalyId: string) => {
      return await apiRequest(`/api/analytics/anomalies/${anomalyId}/acknowledge`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/anomalies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/anomalies/summary'] });
      toast({
        title: 'Anomaly Acknowledged',
        description: 'The anomaly has been marked as acknowledged.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to acknowledge anomaly',
      });
    },
  });

  useEffect(() => {
    const handleAnomalyDetected = (message: any) => {
      if (message.type === 'anomaly_detected') {
        queryClient.invalidateQueries({ queryKey: ['/api/analytics/anomalies'] });
        queryClient.invalidateQueries({ queryKey: ['/api/analytics/anomalies/summary'] });
        toast({
          variant: message.severity === 'critical' ? 'destructive' : 'default',
          title: 'New Anomaly Detected',
          description: `${message.metricType} ${message.anomalyType}: ${message.deviationPercentage}% deviation`,
        });
      }
    };
    return () => {};
  }, [queryClient, toast]);

  useEffect(() => {
    return () => {
      sendMessage({ type: 'unsubscribe_analytics' });
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [sendMessage]);

  const exportAnalyticsMutation = useMutation({
    mutationFn: async (format: string) => {
      const response = await apiRequest('POST', '/api/analytics/export', {
        format,
        filters: { timeRange },
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Analytics Exported',
        description: `Your analytics data has been exported successfully.`,
      });
      const link = document.createElement('a');
      link.href = data.downloadUrl;
      link.download = `analytics-${new Date().toISOString().split('T')[0]}.${data.format}`;
      link.click();
    },
  });

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        refetch();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refetch]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const data = analyticsData as AnalyticsData;
  const currentData = realtimeData || data?.overview;

  const getTimeSinceUpdate = useCallback(() => {
    const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }, [lastUpdate]);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                📊 Analytics Dashboard
              </h1>
            </div>
            <p className="text-muted-foreground mt-1">
              Real-time updates • Updated {getTimeSinceUpdate()}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Label htmlFor="auto-refresh" className="text-sm">
                Auto Refresh
              </Label>
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                data-testid="switch-auto-refresh"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={analyticsLoading}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${analyticsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32" data-testid="select-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => exportAnalyticsMutation.mutate('csv')}
              disabled={exportAnalyticsMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
              data-testid="button-export"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {data?.aiInsights && (
          <Card className="border-2 border-gradient-to-r from-blue-500 to-purple-600 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-white dark:bg-gray-900 rounded-full">
                    <Brain className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      AI Performance Score
                    </h3>
                    <p className="text-muted-foreground">
                      Your music performance is optimized with AI insights
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {data?.aiInsights?.performanceScore !== undefined ? (
                    <>
                      <div className="text-4xl font-bold text-purple-600">
                        {data.aiInsights.performanceScore}%
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Based on your current performance
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-4xl font-bold text-gray-400">--</div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Upload music to get your AI score
                      </p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <StatCardRow>
          <StatCard
            title="Total Streams"
            value={currentData?.totalStreams || data?.overview?.totalStreams || 0}
            change={data?.overview?.growthRate || 0}
            trend={data?.overview?.growthRate && data.overview.growthRate > 0 ? 'up' : 'neutral'}
            sparklineData={data?.streams?.daily?.slice(-7)?.map((d: { streams: number }) => d.streams) ?? []}
            icon={<Play className="h-5 w-5" />}
          />
          <StatCard
            title="Total Revenue"
            value={currentData?.totalRevenue || data?.overview?.totalRevenue || 0}
            change={data?.overview?.growthRate || 0}
            trend={data?.overview?.growthRate && data.overview.growthRate > 0 ? 'up' : 'neutral'}
            prefix="$"
            sparklineData={data?.streams?.daily?.slice(-7)?.map((d: { revenue: number }) => d.revenue) ?? []}
            icon={<DollarSign className="h-5 w-5" />}
          />
          <StatCard
            title="Total Listeners"
            value={currentData?.totalListeners || data?.overview?.totalListeners || 0}
            change={data?.overview?.growthRate || 0}
            trend={data?.overview?.growthRate && data.overview.growthRate > 0 ? 'up' : 'neutral'}
            sparklineData={[]}
            icon={<Users className="h-5 w-5" />}
          />
          <StatCard
            title="Avg Listen Time"
            value={data?.overview?.avgListenTime || 0}
            change={data?.overview?.growthRate || 0}
            trend={data?.overview?.growthRate && data.overview.growthRate > 0 ? 'up' : 'neutral'}
            suffix="m"
            sparklineData={[]}
            icon={<Clock className="h-5 w-5" />}
          />
          <StatCard
            title="Completion Rate"
            value={data?.overview?.completionRate || 0}
            change={data?.overview?.growthRate || 0}
            trend={data?.overview?.growthRate && data.overview.growthRate > 0 ? 'up' : 'neutral'}
            suffix="%"
            sparklineData={[]}
            icon={<Target className="h-5 w-5" />}
          />
          <StatCard
            title="Share Rate"
            value={data?.overview?.shareRate || 0}
            change={data?.overview?.growthRate || 0}
            trend={data?.overview?.growthRate && data.overview.growthRate > 0 ? 'up' : 'neutral'}
            suffix="%"
            sparklineData={[]}
            icon={<Share2 className="h-5 w-5" />}
          />
        </StatCardRow>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-10 h-auto">
            <TabsTrigger value="overview" data-testid="tab-overview" className="text-xs px-2">
              Overview
            </TabsTrigger>
            <TabsTrigger value="fan-journey" data-testid="tab-fan-journey" className="text-xs px-2">
              Fan Journey
            </TabsTrigger>
            <TabsTrigger value="forecasting" data-testid="tab-forecasting" className="text-xs px-2">
              Forecasting
            </TabsTrigger>
            <TabsTrigger value="cohorts" data-testid="tab-cohorts" className="text-xs px-2">
              Cohorts
            </TabsTrigger>
            <TabsTrigger value="churn" data-testid="tab-churn" className="text-xs px-2">
              Churn
            </TabsTrigger>
            <TabsTrigger value="geographic" data-testid="tab-geographic" className="text-xs px-2">
              Geographic
            </TabsTrigger>
            <TabsTrigger value="demographics" data-testid="tab-demographics" className="text-xs px-2">
              Demographics
            </TabsTrigger>
            <TabsTrigger value="playlists" data-testid="tab-playlists" className="text-xs px-2">
              Playlists
            </TabsTrigger>
            <TabsTrigger value="revenue" data-testid="tab-revenue" className="text-xs px-2">
              Revenue
            </TabsTrigger>
            <TabsTrigger value="anomalies" data-testid="tab-anomalies" className="text-xs px-2 relative">
              Anomalies
              {anomalyData?.summary?.unacknowledged > 0 && (
                <Badge variant="destructive" className="ml-1 px-1 py-0 text-xs">
                  {anomalyData?.summary?.unacknowledged}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard
                title="Streaming Revenue"
                subtitle="Last 30 days performance"
                icon={<TrendingUp className="h-5 w-5 text-blue-500" />}
              >
                {analyticsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : data?.streams?.daily && data.streams.daily.length > 0 ? (
                  <SimpleAreaChart
                    data={data.streams.daily.slice(-14).map((day: { date: string; revenue: number }) => ({
                      label: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                      value: day.revenue,
                    }))}
                    height={180}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-sm">No revenue data yet</p>
                      <p className="text-xs text-slate-600">Start distributing music to see earnings</p>
                    </div>
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Platform Breakdown"
                subtitle="Streams by platform"
                icon={<Globe className="h-5 w-5 text-blue-500" />}
              >
                {analyticsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : data?.streams?.byPlatform && data.streams.byPlatform.length > 0 ? (
                  <PlatformBreakdown
                    platforms={data.streams.byPlatform.slice(0, 5).map((p: { platform: string; streams: number }, i: number) => {
                      const platformColors: Record<string, string> = {
                        'Spotify': '#1DB954',
                        'Apple Music': '#FA2D48',
                        'YouTube Music': '#FF0000',
                        'YouTube': '#FF0000',
                        'Amazon Music': '#00A8E1',
                        'Deezer': '#FEAA2D',
                        'Tidal': '#000000',
                        'Pandora': '#005483',
                        'SoundCloud': '#FF5500',
                      };
                      const defaultColors = ['#06b6d4', '#a855f7', '#f43f5e', '#f97316', '#84cc16'];
                      return {
                        name: p.platform,
                        value: p.streams,
                        color: platformColors[p.platform] || defaultColors[i % defaultColors.length],
                      };
                    })}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <Globe className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-sm">No platform data yet</p>
                      <p className="text-xs text-slate-600">Distribute music to see platform breakdown</p>
                    </div>
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Follower Growth"
                subtitle="Social media audience growth"
                icon={<Users className="h-5 w-5 text-blue-500" />}
              >
                {analyticsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : data?.audience?.listenerJourney && data.audience.listenerJourney.length > 0 ? (
                  <SimpleAreaChart
                    data={data.audience.listenerJourney.map((stage: { stage: string; count: number }) => ({
                      label: stage.stage,
                      value: stage.count,
                    }))}
                    height={180}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <Users className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-sm">No follower data yet</p>
                      <p className="text-xs text-slate-600">Connect social accounts to track growth</p>
                    </div>
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Engagement Metrics"
                subtitle="Listener interaction rates"
                icon={<Activity className="h-5 w-5 text-blue-500" />}
              >
                {analyticsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <Target className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Completion Rate</p>
                          <p className="text-xs text-slate-500">Songs played to end</p>
                        </div>
                      </div>
                      <span className="text-xl font-bold text-blue-600">{data?.overview?.completionRate || 0}%</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <Share2 className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Share Rate</p>
                          <p className="text-xs text-slate-500">Content shared by listeners</p>
                        </div>
                      </div>
                      <span className="text-xl font-bold text-blue-600">{data?.overview?.shareRate || 0}%</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <Heart className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Like Rate</p>
                          <p className="text-xs text-slate-500">Positive reactions</p>
                        </div>
                      </div>
                      <span className="text-xl font-bold text-blue-600">{data?.overview?.likeRate || 0}%</span>
                    </div>
                  </div>
                )}
              </ChartCard>
            </div>
          </TabsContent>

          <TabsContent value="fan-journey" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-blue-500" />
                  Fan Journey Funnel
                </CardTitle>
                <CardDescription>
                  Track how fans move from awareness to advocacy
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FanJourneyFunnel data={data?.fanJourney} />
              </CardContent>
            </Card>

            {data?.fanJourney?.journeyInsights && data.fanJourney.journeyInsights.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                    Journey Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.fanJourney.journeyInsights.map((insight: any, idx: number) => (
                      <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border">
                        <p className="font-medium">{insight.insight}</p>
                        <p className="text-sm text-slate-500 mt-1">Impact: {insight.impact}</p>
                        <p className="text-sm text-blue-600 mt-2">💡 {insight.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="forecasting" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-purple-500" />
                  Predictive Forecasting
                </CardTitle>
                <CardDescription>
                  AI-powered projections for streams, followers, and revenue
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PredictiveForecasting forecasts={data?.forecasts} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cohorts" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-indigo-500" />
                  Cohort Analysis
                </CardTitle>
                <CardDescription>
                  User retention over time by acquisition cohort
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CohortAnalysisChart cohorts={data?.cohorts} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="churn" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserMinus className="h-5 w-5 text-red-500" />
                  Churn Analytics
                </CardTitle>
                <CardDescription>
                  Fan drop-off detection and at-risk segment identification
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChurnAnalytics churnData={data?.churn} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geographic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Map className="h-5 w-5 text-green-500" />
                  Geographic Distribution
                </CardTitle>
                <CardDescription>
                  Streams, revenue, and listeners by country and city
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GeographicHeatMap geoData={data?.geographic} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="demographics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-pink-500" />
                  Demographic Breakdowns
                </CardTitle>
                <CardDescription>
                  Audience composition by age, gender, and other segments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DemographicsBreakdown demographics={data?.demographics} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="playlists" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListMusic className="h-5 w-5 text-cyan-500" />
                  Playlist Tracking
                </CardTitle>
                <CardDescription>
                  Monitor playlist additions, removals, and performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlaylistTracker playlists={data?.playlists} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                  Revenue Attribution
                </CardTitle>
                <CardDescription>
                  Understand where your revenue comes from
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueAttributionChart attribution={data?.revenueAttribution} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="anomalies" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Anomalies</p>
                      <p className="text-2xl font-bold">{anomalySummary?.total || 0}</p>
                    </div>
                    <Activity className="w-8 h-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Unacknowledged</p>
                      <p className="text-2xl font-bold text-red-600">
                        {anomalySummary?.unacknowledged || 0}
                      </p>
                    </div>
                    <Bell className="w-8 h-8 text-red-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">By Severity</p>
                    <div className="flex gap-2 flex-wrap">
                      {anomalySummary?.bySeverity &&
                        Object.entries(anomalySummary.bySeverity).map(([severity, count]) => (
                          <Badge
                            key={severity}
                            variant={
                              severity === 'critical'
                                ? 'destructive'
                                : severity === 'high'
                                  ? 'default'
                                  : 'secondary'
                            }
                            data-testid={`severity-badge-${severity}`}
                          >
                            {severity}: {count as number}
                          </Badge>
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-4">
                <div className="flex gap-4 flex-wrap items-center">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="metric-filter">Metric Type:</Label>
                    <Select value={anomalyMetricFilter} onValueChange={setAnomalyMetricFilter}>
                      <SelectTrigger
                        id="metric-filter"
                        className="w-40"
                        data-testid="select-metric-filter"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="streams">Streams</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                        <SelectItem value="listeners">Listeners</SelectItem>
                        <SelectItem value="engagement">Engagement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label htmlFor="severity-filter">Severity:</Label>
                    <Select value={anomalySeverityFilter} onValueChange={setAnomalySeverityFilter}>
                      <SelectTrigger
                        id="severity-filter"
                        className="w-40"
                        data-testid="select-severity-filter"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchAnomalies()}
                    data-testid="button-refresh-anomalies"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            {anomaliesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : anomalyData?.anomalies && anomalyData.anomalies.length > 0 ? (
              <div className="space-y-4">
                {anomalyData.anomalies.map((anomaly: any) => {
                  const severityColors: Record<string, string> = {
                    critical: 'border-red-500 bg-red-50 dark:bg-red-950/20',
                    high: 'border-orange-500 bg-orange-50 dark:bg-orange-950/20',
                    medium: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
                    low: 'border-blue-500 bg-blue-50 dark:bg-blue-950/20',
                  };

                  const severityBadgeColors: Record<string, string> = {
                    critical: 'destructive',
                    high: 'default',
                    medium: 'secondary',
                    low: 'outline',
                  };

                  const anomalyIcons: Record<string, any> = {
                    spike: ArrowUp,
                    drop: ArrowDown,
                    unusual_pattern: Activity,
                  };

                  const AnomalyIcon = anomalyIcons[anomaly.anomalyType] || Activity;

                  return (
                    <motion.div
                      key={anomaly.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Card
                        className={`border-2 ${severityColors[anomaly.severity] || ''}`}
                        data-testid={`anomaly-card-${anomaly.id}`}
                      >
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center gap-3">
                                <Badge
                                  variant={severityBadgeColors[anomaly.severity] as any || 'default'}
                                >
                                  {anomaly.severity}
                                </Badge>
                                <Badge variant="outline">{anomaly.metricType}</Badge>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <AnomalyIcon className="w-4 h-4" />
                                  <span className="text-sm capitalize">
                                    {anomaly.anomalyType?.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <p className="text-xs text-muted-foreground">Baseline</p>
                                  <p className="text-lg font-semibold">
                                    {parseFloat(anomaly.baselineValue).toLocaleString()}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Actual</p>
                                  <p className="text-lg font-semibold">
                                    {parseFloat(anomaly.actualValue).toLocaleString()}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Deviation</p>
                                  <p
                                    className={`text-lg font-semibold ${parseFloat(anomaly.deviationPercentage) > 0 ? 'text-green-600' : 'text-red-600'}`}
                                  >
                                    {parseFloat(anomaly.deviationPercentage) > 0 ? '+' : ''}
                                    {parseFloat(anomaly.deviationPercentage).toFixed(1)}%
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {new Date(anomaly.detectedAt).toLocaleString()}
                                </div>
                                {anomaly.acknowledgedAt && (
                                  <div className="flex items-center gap-1 text-green-600">
                                    <CheckCircle className="w-4 h-4" />
                                    Acknowledged
                                  </div>
                                )}
                              </div>
                            </div>

                            {!anomaly.acknowledgedAt && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => acknowledgeMutation.mutate(anomaly.id)}
                                disabled={acknowledgeMutation.isPending}
                                data-testid={`button-acknowledge-${anomaly.id}`}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Acknowledge
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <CheckCircle className="w-16 h-16 mx-auto text-green-600 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Anomalies Detected</h3>
                  <p className="text-muted-foreground">
                    All metrics are within normal ranges. We'll alert you if any unusual patterns
                    are detected.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
