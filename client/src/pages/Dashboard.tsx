import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { QuickStartWizard } from '@/components/onboarding/QuickStartWizard';
import { ValueCalculator } from '@/components/onboarding/ValueCalculator';
import SimplifiedDashboard from '@/components/onboarding/SimplifiedDashboard';
import FeatureDiscovery from '@/components/feature-discovery/FeatureDiscovery';
import FeatureSpotlight from '@/components/feature-discovery/FeatureSpotlight';
import { UserOverviewPanel } from '@/components/dashboard/UserOverviewPanel';
import { SmartNextActionWidget } from '@/components/dashboard/SmartNextActionWidget';
import FirstWeekSuccessPath from '@/components/onboarding/FirstWeekSuccessPath';
import { ArtistProgressDashboard } from '@/components/dashboard/ArtistProgressDashboard';
import { AICareerCoach } from '@/components/dashboard/AICareerCoach';
import RevenueForecast from '@/components/dashboard/RevenueForecast';
import { StreakCounter } from '@/components/achievements/StreakCounter';
import { AchievementNotification } from '@/components/achievements/AchievementNotification';
import { CountdownCard } from '@/components/releases/CountdownCard';
import { SuggestedCollaborators } from '@/components/collaboration/SuggestedCollaborators';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  SkeletonCard,
  SkeletonDashboardStats,
  SkeletonChart,
  SkeletonList,
} from '@/components/ui/skeleton-loader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Play,
  DollarSign,
  Music,
  Users,
  TrendingUp,
  Clock,
  Upload,
  Sparkles,
  Activity,
  BarChart3,
  Share2,
  Megaphone,
  Zap,
  Brain,
  Rocket,
  Crown,
  Target,
  Eye,
  MousePointerClick,
  Globe,
  Calendar,
  Award,
  Star,
  Heart,
  Headphones,
  Radio,
  Tv,
  Smartphone,
  Laptop,
  Monitor,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Settings,
  Bell,
  AlertTriangle,
  CheckCircle,
  Info,
  Lightbulb,
  Shield,
  Lock,
  Unlock,
} from 'lucide-react';
import { useLocation } from 'wouter';

interface DashboardStats {
  totalTracks: number;
  activeDistributions: number;
  totalRevenue: number;
  socialReach: number;
  monthlyGrowth: {
    tracks: number;
    distributions: number;
    revenue: number;
    socialReach: number;
  };
}

export default function Dashboard() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Show loading skeleton during auth check to prevent flickering
  if (authLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <SkeletonCard key={i} className="h-32" />
            ))}
          </div>
          <SkeletonChart />
          <SkeletonList />
        </div>
      </AppLayout>
    );
  }

  // Redirect is handled by useRequireSubscription - wait for user
  if (!user) {
    return null;
  }

  return <DashboardContent user={user} />;
}

// Separate component to ensure hooks are only called when user is authenticated
function DashboardContent({ user }: { user: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userLevel, setUserLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [showSimplified, setShowSimplified] = useState(false);
  const [showFeatureDiscovery, setShowFeatureDiscovery] = useState(false);
  const [showFeatureSpotlight, setShowFeatureSpotlight] = useState(false);

  // Check if user has paid subscription
  const hasPaidSubscription = Boolean(
    user.subscriptionPlan && user.subscriptionPlan !== '' && user.subscriptionPlan !== 'trial'
  );

  // Check onboarding status
  const { data: onboardingStatus } = useQuery({
    queryKey: ['/api/auth/onboarding-status'],
    staleTime: 15 * 60 * 1000, // 15 minutes - less frequent changes
    retry: 1, // Limit retries
    retryDelay: 1000,
  });

  useEffect(() => {
    // Show onboarding for new users who haven't completed it
    if (
      onboardingStatus &&
      !onboardingStatus.hasCompletedOnboarding &&
      !localStorage.getItem('onboardingSkipped')
    ) {
      setShowOnboarding(true);
    }
  }, [onboardingStatus]);

  // Fetch comprehensive dashboard data - now only called when user is authenticated
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['/api/dashboard/comprehensive'],
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 5 * 60 * 1000, // 5 minutes - moderate freshness
  });

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/projects'],
    staleTime: 5 * 60 * 1000, // 5 minutes - moderate freshness
  });

  const projects = (projectsData as any)?.data || [];

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['/api/analytics/dashboard'],
    staleTime: 5 * 60 * 1000, // 5 minutes - moderate freshness
  });

  const { data: aiInsights, isLoading: aiInsightsLoading } = useQuery({
    queryKey: ['/api/ai/insights'],
    enabled: hasPaidSubscription, // Only fetch if user has paid subscription
    staleTime: 5 * 60 * 1000, // 5 minutes - moderate freshness
  });

  // Quick action mutations
  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/projects', {
        title: 'New Project',
        description: 'AI-generated project',
        genre: 'Electronic',
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Project Created',
        description: 'New project created successfully with AI optimization.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    },
  });

  const optimizeContentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/ai/optimize-content');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Content Optimized',
        description: 'AI has optimized your content for maximum reach.',
      });
    },
  });

  // Stats object - no memoization needed as it's just a fallback
  const stats = dashboardData?.stats || {
    totalTracks: 0,
    activeDistributions: 0,
    totalRevenue: 0,
    socialReach: 0,
    monthlyGrowth: { tracks: 0, distributions: 0, revenue: 0, socialReach: 0 },
  };

  // Stats cards - simple array literal as stats changes with dashboard data
  const statsCards = [
    {
      title: 'Total Tracks',
      value: stats.totalTracks?.toLocaleString() || '0',
      change: `${stats.monthlyGrowth.tracks || 0}%`,
      icon: Music,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      testId: 'stat-total-tracks',
    },
    {
      title: 'Active Distributions',
      value: stats.activeDistributions?.toLocaleString() || '0',
      change: `${stats.monthlyGrowth.distributions || 0}%`,
      icon: Upload,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-950/20',
      borderColor: 'border-purple-200 dark:border-purple-800',
      testId: 'stat-active-distributions',
    },
    {
      title: 'Total Revenue',
      value: `$${stats.totalRevenue?.toLocaleString() || '0.00'}`,
      change: `${stats.monthlyGrowth.revenue || 0}%`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/20',
      borderColor: 'border-green-200 dark:border-green-800',
      testId: 'stat-total-revenue',
    },
    {
      title: 'Social Reach',
      value: stats.socialReach?.toLocaleString() || '0',
      change: `${stats.monthlyGrowth.socialReach || 0}%`,
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-950/20',
      borderColor: 'border-orange-200 dark:border-orange-800',
      testId: 'stat-social-reach',
    },
  ];

  // Quick actions - simple array literal to ensure state updates propagate correctly
  const quickActions = [
    {
      title: 'Create New Project',
      description: 'Start a new music project with AI assistance',
      icon: Plus,
      action: () => createProjectMutation.mutate(),
      color: 'bg-blue-600 hover:bg-blue-700',
      loading: createProjectMutation.isPending,
      disabled: false,
    },
    {
      title: 'AI Content Optimization',
      description: hasPaidSubscription
        ? 'Optimize your content for maximum reach'
        : 'Upgrade to access AI features',
      icon: Brain,
      action: () => {
        if (!hasPaidSubscription) {
          toast({
            title: 'Subscription Required',
            description:
              'AI features require an active paid subscription. Please upgrade your plan.',
            variant: 'destructive',
          });
          return;
        }
        optimizeContentMutation.mutate();
      },
      color: hasPaidSubscription
        ? 'bg-purple-600 hover:bg-purple-700'
        : 'bg-gray-400 cursor-not-allowed',
      loading: optimizeContentMutation.isPending,
      disabled: !hasPaidSubscription,
    },
    {
      title: 'Launch Campaign',
      description: 'Start an AI-powered advertising campaign',
      icon: Rocket,
      action: () => setLocation('/advertising'),
      color: 'bg-green-600 hover:bg-green-700',
      loading: false,
      disabled: false,
    },
    {
      title: 'Distribute Music',
      description: 'Release your music to all platforms',
      icon: Upload,
      action: () => setLocation('/distribution'),
      color: 'bg-cyan-600 hover:bg-cyan-700',
      loading: false,
      disabled: false,
    },
  ];

  // Onboarding handlers
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setShowSimplified(userLevel === 'beginner');
    queryClient.invalidateQueries({ queryKey: ['/api/auth/onboarding-status'] });
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
    setShowSimplified(false);
  };

  const handleUpgradeToFullMode = () => {
    setShowSimplified(false);
    setUserLevel('intermediate');
  };

  const handleExploreFeature = (featureId: string) => {
    setShowFeatureSpotlight(false);
    setShowFeatureDiscovery(false);
    toast({
      title: 'Feature Navigation',
      description: `Navigating to ${featureId} feature...`,
    });
  };

  // Show onboarding flow
  if (showOnboarding) {
    return <QuickStartWizard onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />;
  }

  // Show simplified dashboard for beginners
  if (showSimplified) {
    return <SimplifiedDashboard onUpgrade={handleUpgradeToFullMode} userLevel={userLevel} />;
  }

  return (
    <AppLayout>
      {/* Achievement Notification System */}
      <AchievementNotification />
      
      <div className="max-w-7xl mx-auto space-y-6" role="main" aria-label="Dashboard content">
        {/* Header */}
        <header className="flex justify-between items-center" role="banner">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              🎵 Welcome to Max Booster!
            </h1>
            <p className="text-muted-foreground" role="status" aria-live="polite">
              Hi {user?.username}! Start building your music career with our powerful AI-powered
              platform
            </p>
          </div>
          <nav
            className="flex items-center space-x-3"
            role="navigation"
            aria-label="Dashboard actions"
          >
            {/* Streak Counter in Header */}
            <StreakCounter mode="compact" />
            <Button
              data-testid="button-discover-features"
              variant="outline"
              onClick={() => setShowFeatureDiscovery(true)}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 hover:from-blue-600 hover:to-purple-700"
              aria-label="Discover platform features"
            >
              <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
              Discover Features
            </Button>
            <Button
              data-testid="button-all-features"
              variant="ghost"
              onClick={() => setShowFeatureSpotlight(true)}
              size="sm"
              aria-label="View all features"
            >
              <Zap className="w-4 h-4 mr-1" aria-hidden="true" />
              All Features
            </Button>
            <Badge
              data-testid="badge-ai-enhanced"
              className="bg-green-100 text-green-800 border-green-300"
              role="status"
              aria-label="AI features enabled"
            >
              <CheckCircle className="w-3 h-3 mr-1" aria-hidden="true" />
              AI Enhanced
            </Badge>
          </nav>
        </header>

        {/* User Overview Panel */}
        <UserOverviewPanel user={user} />

        {/* Value Calculator - Show subscription savings */}
        {hasPaidSubscription && <ValueCalculator />}

        {/* Smart Next Action Widget */}
        <SmartNextActionWidget />

        {/* AI Performance Banner */}
        {aiInsights && (
          <Card
            className="border-2 border-gradient-to-r from-blue-500 to-purple-600 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950"
            role="region"
            aria-label="AI Performance Score"
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-white dark:bg-gray-900 rounded-full" aria-hidden="true">
                    <Brain className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      AI Performance Score
                    </h3>
                    <p className="text-muted-foreground">
                      Your music career is optimized with AI assistance
                    </p>
                  </div>
                </div>
                <div className="text-right" role="status" aria-live="polite">
                  <div
                    className="text-4xl font-bold text-green-600"
                    aria-label={`Performance score: ${aiInsights?.performanceScore || 0} out of 100`}
                  >
                    {aiInsights?.performanceScore || 0}/100
                  </div>
                  <div className="text-sm text-muted-foreground" role="status">
                    {aiInsights?.performanceScore >= 80
                      ? 'Excellent Performance'
                      : aiInsights?.performanceScore >= 60
                        ? 'Good Performance'
                        : aiInsights?.performanceScore >= 40
                          ? 'Room for Improvement'
                          : 'Getting Started'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <section
          className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6"
          role="region"
          aria-label="Performance statistics"
        >
          {statsCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card
                key={index}
                data-testid={
                  (stat as any).testId ||
                  `card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`
                }
                className={`${stat.bgColor} ${stat.borderColor} border-2 hover:shadow-lg transition-all duration-300`}
                role="article"
                aria-label={`${stat.title} statistic`}
              >
                <CardContent className="p-3 sm:p-4 lg:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 truncate"
                        id={`stat-label-${index}`}
                      >
                        {stat.title}
                      </p>
                      <p
                        className={`text-lg sm:text-xl lg:text-2xl font-bold ${stat.color}`}
                        aria-labelledby={`stat-label-${index}`}
                        aria-describedby={`stat-change-${index}`}
                      >
                        {stat.value}
                      </p>
                      <p
                        className="text-[10px] sm:text-xs text-green-600 flex items-center mt-1"
                        id={`stat-change-${index}`}
                      >
                        <ArrowUp className="w-3 h-3 mr-1 flex-shrink-0" aria-label="Increase" />
                        <span className="truncate">{stat.change} from last month</span>
                      </p>
                    </div>
                    <div
                      className={`p-2 sm:p-3 rounded-full ${stat.bgColor} ${stat.borderColor} border-2 flex-shrink-0`}
                      aria-hidden="true"
                    >
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-600" />
              Quick Actions
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              AI-powered tools to accelerate your music career
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={index}
                    data-testid={`button-${action.title.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={action.action}
                    disabled={action.loading || action.disabled}
                    className={`${action.color} text-white h-auto p-4 flex flex-col items-center space-y-2`}
                  >
                    {action.loading ? (
                      <Brain className="w-6 h-6 animate-spin" />
                    ) : (
                      <Icon className="w-6 h-6" />
                    )}
                    <div className="text-center">
                      <div className="font-semibold">{action.title}</div>
                      <div className="text-xs opacity-90">{action.description}</div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger data-testid="tab-overview" value="overview">
              Overview
            </TabsTrigger>
            <TabsTrigger data-testid="tab-growth" value="growth">
              Growth
            </TabsTrigger>
            <TabsTrigger data-testid="tab-analytics" value="analytics">
              Analytics
            </TabsTrigger>
            <TabsTrigger data-testid="tab-ai-insights" value="ai-insights">
              AI Insights
            </TabsTrigger>
            <TabsTrigger data-testid="tab-projects" value="projects">
              Projects
            </TabsTrigger>
            <TabsTrigger data-testid="tab-activity" value="activity">
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Platforms */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Globe className="w-5 h-5 mr-2 text-blue-600" />
                    Top Performing Platforms
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardData?.topPlatforms ? (
                    <div className="space-y-4">
                      {dashboardData.topPlatforms.map((platform, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                              <span className="text-sm font-bold text-blue-600">{index + 1}</span>
                            </div>
                            <div>
                              <div className="font-semibold">{platform.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {platform.streams.toLocaleString()} streams
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-green-600">
                              ${platform.revenue.toLocaleString()}
                            </div>
                            <div
                              className={`text-sm flex items-center ${
                                platform.growth > 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {platform.growth > 0 ? (
                                <ArrowUp className="w-3 h-3 mr-1" />
                              ) : (
                                <ArrowDown className="w-3 h-3 mr-1" />
                              )}
                              {Math.abs(platform.growth)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Projects */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Music className="w-5 h-5 mr-2 text-purple-600" />
                    Recent Projects
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {projectsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : projects.length > 0 ? (
                    <div className="space-y-3">
                      {projects.slice(0, 5).map((project: unknown) => (
                        <div
                          key={project.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                              <Music className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                              <div className="font-semibold">{project.title}</div>
                              <div className="text-sm text-muted-foreground">
                                {project.genre} • {project.streams?.toLocaleString() || 0} streams
                              </div>
                            </div>
                          </div>
                          <Badge variant={project.status === 'published' ? 'default' : 'secondary'}>
                            {project.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Music className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Create your first project to get started
                      </p>
                      <Button onClick={() => createProjectMutation.mutate()}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Project
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* First Week Success Path for new users */}
            <FirstWeekSuccessPath />
          </TabsContent>

          {/* Growth Tab - Retention Features */}
          <TabsContent value="growth" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* AI Career Coach */}
              <div className="lg:col-span-2">
                <AICareerCoach />
              </div>
              
              {/* Streak Counter */}
              <div className="space-y-4">
                <StreakCounter mode="full" />
                <SuggestedCollaborators />
              </div>
            </div>

            {/* Artist Progress Dashboard */}
            <ArtistProgressDashboard />

            {/* Revenue Forecast */}
            <RevenueForecast />

            {/* Upcoming Releases */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-purple-600" />
                  Upcoming Releases
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CountdownCard />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai-insights" className="space-y-6">
            {!hasPaidSubscription ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Lock className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">AI Features Require Subscription</h3>
                  <p className="text-muted-foreground mb-4">
                    Upgrade to a paid plan to access AI-powered insights and recommendations.
                  </p>
                  <Button onClick={() => setLocation('/pricing')}>
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade Plan
                  </Button>
                </CardContent>
              </Card>
            ) : aiInsightsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : aiInsights ? (
              <>
                {/* AI Recommendations */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Lightbulb className="w-5 h-5 mr-2 text-yellow-600" />
                      AI Recommendations
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Personalized suggestions to boost your music career
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {aiInsights.recommendations?.map((rec, index) => (
                        <div
                          key={index}
                          className={`p-4 rounded-lg border-l-4 ${
                            rec.priority === 'high'
                              ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                              : rec.priority === 'medium'
                                ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20'
                                : 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold">{rec.title}</h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                {rec.description}
                              </p>
                              <Badge variant="outline" className="mt-2">
                                {rec.category}
                              </Badge>
                            </div>
                            <Badge
                              className={
                                rec.priority === 'high'
                                  ? 'bg-red-100 text-red-800'
                                  : rec.priority === 'medium'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-blue-100 text-blue-800'
                              }
                            >
                              {rec.priority}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* AI Predictions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Sparkles className="w-5 h-5 mr-2 text-purple-600" />
                      AI Predictions
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Forecast your music career growth with AI
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {aiInsights.predictions?.nextMonthStreams?.toLocaleString() || '0'}
                        </div>
                        <div className="text-sm text-muted-foreground">Predicted Streams</div>
                        <div className="text-xs text-green-600 mt-1">Next Month</div>
                      </div>
                      <div className="text-center p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          ${aiInsights.predictions?.nextMonthRevenue?.toLocaleString() || '0'}
                        </div>
                        <div className="text-sm text-muted-foreground">Predicted Revenue</div>
                        <div className="text-xs text-green-600 mt-1">Next Month</div>
                      </div>
                      <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {(aiInsights.predictions?.viralPotential * 100 || 0).toFixed(0)}%
                        </div>
                        <div className="text-sm text-muted-foreground">Viral Potential</div>
                        <div className="text-xs text-green-600 mt-1">Current Content</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Brain className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Unable to Load AI Insights</h3>
                  <p className="text-muted-foreground">
                    AI insights are currently unavailable. Please try again later.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-green-600" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dashboardData?.recentActivity ? (
                  <div className="space-y-4">
                    {dashboardData.recentActivity.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            activity.status === 'success'
                              ? 'bg-green-100 dark:bg-green-900'
                              : activity.status === 'warning'
                                ? 'bg-yellow-100 dark:bg-yellow-900'
                                : activity.status === 'error'
                                  ? 'bg-red-100 dark:bg-red-900'
                                  : 'bg-blue-100 dark:bg-blue-900'
                          }`}
                        >
                          {activity.status === 'success' ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : activity.status === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          ) : activity.status === 'error' ? (
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                          ) : (
                            <Info className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold">{activity.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {activity.description}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(activity.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Feature Discovery Modals */}
        {showFeatureDiscovery && (
          <FeatureDiscovery onClose={() => setShowFeatureDiscovery(false)} userLevel={userLevel} />
        )}

        {showFeatureSpotlight && (
          <FeatureSpotlight
            onClose={() => setShowFeatureSpotlight(false)}
            onExploreFeature={handleExploreFeature}
          />
        )}
      </div>
    </AppLayout>
  );
}
