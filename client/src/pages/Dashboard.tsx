import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { ValueCalculator } from "@/components/onboarding/ValueCalculator";
import SimplifiedDashboard from "@/components/onboarding/SimplifiedDashboard";
import FeatureDiscovery from "@/components/feature-discovery/FeatureDiscovery";
import FeatureSpotlight from "@/components/feature-discovery/FeatureSpotlight";
import { UserOverviewPanel } from "@/components/dashboard/UserOverviewPanel";
import { SmartNextActionWidget } from "@/components/dashboard/SmartNextActionWidget";
import FirstWeekSuccessPath from "@/components/onboarding/FirstWeekSuccessPath";
import PowerFeatureSpotlight from "@/components/onboarding/PowerFeatureSpotlight";
import ContextualFeatureHint from "@/components/onboarding/ContextualFeatureHint";
import { AICareerCoach } from "@/components/dashboard/AICareerCoach";
import { LoopHealthScore } from "@/components/dashboard/LoopHealthScore";
import {
  formatDashboardTimestamp,
  hasDashboardPaidAccess,
  metricValueOrUnavailable,
  normalizeDashboardAIInsights,
  normalizeDashboardCountdowns,
  normalizeDashboardOptimization,
  normalizeDashboardSocialPosts,
  readDashboardJson,
  type DashboardAIInsights,
  type DashboardCountdownItem,
  type DashboardOptimizedDraft,
  type DashboardSocialPost,
} from "@/components/dashboard/dashboardDataContracts";
import { StreakCounter } from "@/components/achievements/StreakCounter";
import { AchievementNotification } from "@/components/achievements/AchievementNotification";
import { CountdownCard } from "@/components/releases/CountdownCard";
import { SuggestedCollaborators } from "@/components/collaboration/SuggestedCollaborators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SkeletonCard,
  SkeletonChart,
  SkeletonList,
} from "@/components/ui/skeleton-loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAnalyticsInvalidation } from "@/hooks/useAnalyticsInvalidation";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Brain,
  Calendar,
  CheckCircle,
  Crown,
  DollarSign,
  Globe,
  Info,
  Lightbulb,
  Lock,
  Music,
  Plus,
  Rocket,
  Sparkles,
  TrendingUp,
  Upload,
  Zap,
  Activity,
} from "lucide-react";

type DashboardUserPersona =
  | "artist"
  | "producer"
  | "label"
  | "manager"
  | null;

interface OnboardingStatusResponse {
  hasCompletedOnboarding: boolean;
  currentStep: number;
}

interface DashboardStats {
  totalTracks?: number | null;
  activeDistributions?: number | null;
  totalRevenue?: number | null;
  socialReach?: number | null;
  monthlyGrowth?: {
    tracks?: number | null;
    distributions?: number | null;
    revenue?: number | null;
    socialReach?: number | null;
  };
}

interface DashboardTopPlatform {
  name: string;
  streams: number;
  revenue: number;
  growth: number;
}

interface DashboardActivity {
  id?: string | number;
  type?: string;
  status: string;
  title: string;
  description: string;
  timestamp: string | number | Date;
}

interface ComprehensiveDashboardData {
  stats?: DashboardStats;
  topPlatforms?: DashboardTopPlatform[];
  recentActivity?: DashboardActivity[];
  dataAvailability?: {
    revenue?: boolean;
    socialReach?: boolean;
  };
}

interface DashboardProject {
  id: string | number;
  title?: string;
  genre?: string;
  streams?: number | null;
  status?: string;
}

interface ProjectsResponse {
  data: DashboardProject[];
}

function getStoredOnboardingData(user: User): Record<string, unknown> {
  return user.onboardingData && typeof user.onboardingData === "object"
    ? (user.onboardingData as Record<string, unknown>)
    : {};
}

function getStoredUserLevel(
  onboardingData: Record<string, unknown>,
): "beginner" | "intermediate" | "advanced" {
  const level = onboardingData.experienceLevel ?? onboardingData.userLevel;
  return level === "intermediate" || level === "advanced" ? level : "beginner";
}

function UpcomingReleasesSection() {
  const { data: countdowns = [], isLoading, isError, refetch } = useQuery<
    DashboardCountdownItem[]
  >({
    queryKey: ["/api/countdowns"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/countdowns");
      return normalizeDashboardCountdowns(await readDashboardJson(response));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Calendar className="w-5 h-5 mr-2 text-purple-600" />
          Upcoming Releases
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : isError ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Upcoming releases could not be loaded.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : countdowns.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Music className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No upcoming releases yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {countdowns.map((countdown) => {
              const releaseDate = new Date(countdown.releaseDate);
              const diff = releaseDate.getTime() - Date.now();
              const isReleased = diff <= 0;
              const positiveDiff = Math.max(0, diff);
              const days = Math.floor(positiveDiff / (1000 * 60 * 60 * 24));
              const hours = Math.floor(
                (positiveDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
              );
              const minutes = Math.floor(
                (positiveDiff % (1000 * 60 * 60)) / (1000 * 60),
              );
              const progress = countdown.progress ?? {
                completed: 0,
                total: 1,
                percentage: 0,
              };

              return (
                <CountdownCard
                  key={countdown.id}
                  id={String(countdown.id)}
                  title={countdown.title ?? "Untitled Release"}
                  releaseDate={countdown.releaseDate}
                  artworkUrl={countdown.artworkUrl}
                  status={countdown.status ?? "active"}
                  progress={progress}
                  timeRemaining={{ days, hours, minutes, isReleased }}
                  presaveCount={countdown.presaveCount}
                  compact
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, isLoading: authLoading } = useRequireSubscription();

  if (authLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, index) => (
              <SkeletonCard key={index} className="h-32" />
            ))}
          </div>
          <SkeletonChart />
          <SkeletonList />
        </div>
      </AppLayout>
    );
  }

  if (!user) return null;
  return <DashboardContent user={user} />;
}

function DashboardContent({ user }: { user: User }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invalidateDashboard } = useAnalyticsInvalidation();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [showContentOptimizer, setShowContentOptimizer] = useState(false);
  const [optimizerContent, setOptimizerContent] = useState("");
  const [optimizerPlatform, setOptimizerPlatform] = useState("instagram");
  const [optimizerPostId, setOptimizerPostId] = useState("");
  const [optimizerOriginalContent, setOptimizerOriginalContent] = useState("");
  const [optimizedDraft, setOptimizedDraft] =
    useState<DashboardOptimizedDraft | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userLevel, setUserLevel] = useState<
    "beginner" | "intermediate" | "advanced"
  >(() => getStoredUserLevel(getStoredOnboardingData(user)));
  const [showSimplified, setShowSimplified] = useState(() => {
    const onboardingData = getStoredOnboardingData(user);
    return typeof onboardingData.preferSimplifiedView === "boolean"
      ? onboardingData.preferSimplifiedView
      : getStoredUserLevel(onboardingData) === "beginner";
  });
  const [showFeatureDiscovery, setShowFeatureDiscovery] = useState(false);
  const [showFeatureSpotlight, setShowFeatureSpotlight] = useState(false);

  const hasPaidSubscription = hasDashboardPaidAccess(user);

  const { data: onboardingStatus } = useQuery<OnboardingStatusResponse>({
    queryKey: ["/api/auth/onboarding-status"],
    staleTime: 15 * 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (
      onboardingStatus &&
      !onboardingStatus.hasCompletedOnboarding &&
      !localStorage.getItem("onboardingSkipped")
    ) {
      setShowOnboarding(true);
    }
  }, [onboardingStatus]);

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useQuery<ComprehensiveDashboardData>({
    queryKey: ["/api/dashboard/comprehensive"],
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const { data: projectsData, isLoading: projectsLoading } =
    useQuery<ProjectsResponse>({
      queryKey: ["/api/projects"],
      staleTime: 5 * 60 * 1000,
    });
  const projects = projectsData?.data ?? [];

  const {
    data: aiInsights,
    isLoading: aiInsightsLoading,
    error: aiInsightsError,
  } = useQuery<DashboardAIInsights>({
    queryKey: ["/api/ai/insights"],
    enabled: hasPaidSubscription,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/ai/insights");
      return normalizeDashboardAIInsights(await readDashboardJson(response));
    },
  });

  const { data: socialPosts = [] } = useQuery<DashboardSocialPost[]>({
    queryKey: ["/api/social/posts"],
    enabled: showContentOptimizer && hasPaidSubscription,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/social/posts");
      return normalizeDashboardSocialPosts(await readDashboardJson(response));
    },
  });

  const optimizableDrafts = socialPosts.filter(
    (post) =>
      post.status === "draft" &&
      post.approvalStatus === "draft" &&
      typeof post.content === "string" &&
      post.content.trim().length > 0,
  );

  const optimizeContentMutation = useMutation({
    mutationFn: async (input: {
      content: string;
      platform: string;
      postId?: string;
      expectedContent?: string;
    }) => {
      const response = await apiRequest(
        "POST",
        "/api/ai/optimize-content",
        input,
      );
      return normalizeDashboardOptimization(await readDashboardJson(response));
    },
    onSuccess: ({ draft, updatedExisting }) => {
      setOptimizedDraft({ ...draft, updatedExisting });
      if (updatedExisting) {
        setOptimizerContent(draft.content);
        setOptimizerOriginalContent(draft.content);
      }
      void queryClient.invalidateQueries({ queryKey: ["/api/social/posts"] });
      toast({
        title: updatedExisting
          ? "Existing Draft Updated"
          : "Optimized Draft Saved",
        description: updatedExisting
          ? "The selected unpublished draft now contains the MaxCore rewrite."
          : "Review the new draft in Social Media before scheduling or publishing.",
      });
      invalidateDashboard();
    },
    onError: (error: Error) => {
      toast({
        title: "Content Optimization Failed",
        description: error.message || "Unable to optimize content. Please try again.",
        variant: "destructive",
      });
    },
  });

  const stats = dashboardData?.stats;
  const hasAnalyticsReport = (dashboardData?.topPlatforms?.length ?? 0) > 0;
  const revenueAvailable =
    dashboardData?.dataAvailability?.revenue ?? hasAnalyticsReport;
  const socialReachAvailable =
    dashboardData?.dataAvailability?.socialReach ?? hasAnalyticsReport;
  const revenueValue = metricValueOrUnavailable(
    stats?.totalRevenue,
    revenueAvailable,
  );

  const statsCards = [
    {
      title: "Studio Projects",
      value: metricValueOrUnavailable(stats?.totalTracks),
      change: stats?.monthlyGrowth?.tracks ?? null,
      icon: Music,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950/20",
      borderColor: "border-blue-200 dark:border-blue-800",
      testId: "stat-total-tracks",
    },
    {
      title: "Active Distributions",
      value: metricValueOrUnavailable(stats?.activeDistributions),
      change: stats?.monthlyGrowth?.distributions ?? null,
      icon: Upload,
      color: "text-purple-600",
      bgColor: "bg-purple-50 dark:bg-purple-950/20",
      borderColor: "border-purple-200 dark:border-purple-800",
      testId: "stat-active-distributions",
    },
    {
      title: "Total Revenue",
      value:
        typeof revenueValue === "number"
          ? `$${revenueValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : revenueValue,
      change: revenueAvailable ? (stats?.monthlyGrowth?.revenue ?? null) : null,
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-50 dark:bg-green-950/20",
      borderColor: "border-green-200 dark:border-green-800",
      testId: "stat-total-revenue",
    },
    {
      title: "Social Reach",
      value: metricValueOrUnavailable(stats?.socialReach, socialReachAvailable),
      change: socialReachAvailable
        ? (stats?.monthlyGrowth?.socialReach ?? null)
        : null,
      icon: TrendingUp,
      color: "text-orange-600",
      bgColor: "bg-orange-50 dark:bg-orange-950/20",
      borderColor: "border-orange-200 dark:border-orange-800",
      testId: "stat-social-reach",
    },
  ];

  const quickActions = [
    {
      title: "Create New Project",
      description: "Start a new music project with AI assistance",
      icon: Plus,
      action: () => setLocation("/projects"),
      color: "bg-blue-600 hover:bg-blue-700",
      loading: false,
      disabled: false,
    },
    {
      title: "AI Content Optimization",
      description: hasPaidSubscription
        ? "Generate a MaxCore rewrite and save it as an unpublished draft"
        : "Upgrade to access AI features",
      icon: Brain,
      action: () => {
        if (!hasPaidSubscription) {
          toast({
            title: "Subscription Required",
            description:
              "AI features require an active or trialing paid subscription.",
            variant: "destructive",
          });
          return;
        }
        setShowContentOptimizer(true);
        setOptimizedDraft(null);
      },
      color: hasPaidSubscription
        ? "bg-purple-600 hover:bg-purple-700"
        : "bg-gray-400 cursor-not-allowed",
      loading: optimizeContentMutation.isPending,
      disabled: !hasPaidSubscription,
    },
    {
      title: "Launch Campaign",
      description: "Start an AI-powered advertising campaign",
      icon: Rocket,
      action: () => setLocation("/advertising"),
      color: "bg-green-600 hover:bg-green-700",
      loading: false,
      disabled: false,
    },
    {
      title: "Distribute Music",
      description: "Release your music to all platforms",
      icon: Upload,
      action: () => setLocation("/distribution"),
      color: "bg-cyan-600 hover:bg-cyan-700",
      loading: false,
      disabled: false,
    },
  ];

  const handleOnboardingComplete = (selection?: {
    experienceLevel?: "beginner" | "intermediate" | "advanced" | null;
    preferSimplifiedView?: boolean;
  }) => {
    const selectedLevel = selection?.experienceLevel ?? userLevel;
    setUserLevel(selectedLevel);
    setShowOnboarding(false);
    setShowSimplified(
      selection?.preferSimplifiedView ?? selectedLevel === "beginner",
    );
    void queryClient.invalidateQueries({
      queryKey: ["/api/auth/onboarding-status"],
    });
    void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        onSkip={() => {
          setShowOnboarding(false);
          setShowSimplified(false);
        }}
      />
    );
  }

  if (showSimplified) {
    return (
      <SimplifiedDashboard
        onUpgrade={() => {
          setShowSimplified(false);
          setUserLevel("intermediate");
        }}
        userLevel={userLevel}
      />
    );
  }

  return (
    <AppLayout title="Dashboard">
      <AchievementNotification />
      <div
        className="max-w-7xl mx-auto space-y-6"
        role="main"
        aria-label="Dashboard content"
      >
        <header className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              🎵 Welcome to Max Booster!
            </h1>
            <p className="text-muted-foreground" role="status" aria-live="polite">
              Hi {user.username}! Build and grow your music career from one dashboard.
            </p>
          </div>
          <nav
            className="flex flex-wrap items-center gap-3"
            aria-label="Dashboard actions"
          >
            <StreakCounter compact />
            <Button
              data-testid="button-discover-features"
              variant="outline"
              onClick={() => setShowFeatureDiscovery(true)}
              aria-label="Discover platform features"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Discover Features
            </Button>
            <Button
              data-testid="button-all-features"
              variant="ghost"
              onClick={() => setShowFeatureSpotlight(true)}
              size="sm"
            >
              <Zap className="w-4 h-4 mr-1" />
              All Features
            </Button>
            <Badge
              data-testid="badge-ai-enhanced"
              className={
                hasPaidSubscription
                  ? "bg-green-100 text-green-800 border-green-300"
                  : "bg-gray-100 text-gray-700 border-gray-300"
              }
            >
              {hasPaidSubscription ? (
                <CheckCircle className="w-3 h-3 mr-1" />
              ) : (
                <Lock className="w-3 h-3 mr-1" />
              )}
              {hasPaidSubscription ? "AI Enhanced" : "AI with subscription"}
            </Badge>
          </nav>
        </header>

        <UserOverviewPanel user={user} />
        <PowerFeatureSpotlight
          userPersona={
            user.onboardingData &&
            typeof user.onboardingData === "object" &&
            "persona" in user.onboardingData
              ? ((user.onboardingData as { persona?: DashboardUserPersona }).persona ??
                null)
              : null
          }
          compact={false}
        />
        {hasPaidSubscription && <ValueCalculator />}
        <SmartNextActionWidget />

        {dashboardError && (
          <Card className="border-destructive">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <p className="text-sm">
                Dashboard data could not be loaded. Please try again.
              </p>
              <Button variant="outline" onClick={() => void refetchDashboard()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        <section
          className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6"
          aria-label="Performance statistics"
        >
          {statsCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card
                key={stat.title}
                data-testid={stat.testId}
                className={`${stat.bgColor} ${stat.borderColor} border-2`}
              >
                <CardContent className="p-3 sm:p-4 lg:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 truncate">
                        {stat.title}
                      </p>
                      <p className={`text-lg sm:text-xl lg:text-2xl font-bold ${stat.color}`}>
                        {stat.value}
                      </p>
                      {stat.change === null ? (
                        <p className="text-[10px] sm:text-xs mt-1 text-muted-foreground">
                          Change unavailable
                        </p>
                      ) : (
                        <p
                          className={`text-[10px] sm:text-xs flex items-center mt-1 ${
                            stat.change > 0
                              ? "text-green-600"
                              : stat.change < 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                          }`}
                        >
                          {stat.change > 0 ? (
                            <ArrowUp className="w-3 h-3 mr-1" />
                          ) : stat.change < 0 ? (
                            <ArrowDown className="w-3 h-3 mr-1" />
                          ) : null}
                          {stat.change}% from last month
                        </p>
                      )}
                    </div>
                    <Icon className={`w-6 h-6 ${stat.color}`} aria-hidden="true" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-600" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.title}
                    data-testid={`button-${action.title.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={action.action}
                    disabled={action.loading || action.disabled}
                    className={`${action.color} text-white h-auto p-4 flex flex-col items-center space-y-2`}
                  >
                    {action.loading ? (
                      <Brain className="w-6 h-6 animate-spin" />
                    ) : (
                      <Icon className="w-6 h-6" />
                    )}
                    <span className="font-semibold">{action.title}</span>
                    <span className="text-xs opacity-90 text-center">
                      {action.description}
                    </span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {showContentOptimizer && (
          <Card data-testid="dashboard-content-optimizer">
            <CardHeader>
              <CardTitle>Optimize a social post</CardTitle>
              <p className="text-sm text-muted-foreground">
                Update an unreviewed draft in place or create a new unpublished draft.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="dashboard-optimizer-existing-draft" className="text-sm font-medium">
                  Existing draft (optional)
                </label>
                <select
                  id="dashboard-optimizer-existing-draft"
                  value={optimizerPostId}
                  onChange={(event) => {
                    const postId = event.target.value;
                    const selected = optimizableDrafts.find(
                      (post) => String(post.id) === postId,
                    );
                    setOptimizerPostId(selected ? String(selected.id) : "");
                    const selectedContent =
                      selected && typeof selected.content === "string"
                        ? selected.content
                        : "";
                    setOptimizerOriginalContent(selectedContent);
                    setOptimizerContent(selectedContent);
                    if (selected?.platform) setOptimizerPlatform(selected.platform);
                    setOptimizedDraft(null);
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Create a new optimized draft</option>
                  {optimizableDrafts.map((post) => (
                    <option key={post.id} value={String(post.id)}>
                      {post.platform ?? "Social"} — {post.content?.slice(0, 90)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="dashboard-optimizer-content" className="text-sm font-medium">
                  Content to optimize
                </label>
                <textarea
                  id="dashboard-optimizer-content"
                  value={optimizerContent}
                  onChange={(event) => setOptimizerContent(event.target.value)}
                  maxLength={5000}
                  rows={5}
                  readOnly={Boolean(optimizerPostId)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {optimizerContent.length}/5000
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="dashboard-optimizer-platform" className="text-sm font-medium">
                  Platform
                </label>
                <select
                  id="dashboard-optimizer-platform"
                  value={optimizerPlatform}
                  onChange={(event) => setOptimizerPlatform(event.target.value)}
                  disabled={Boolean(optimizerPostId)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                  <option value="twitter">X / Twitter</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="threads">Threads</option>
                  <option value="google_business">Google Business</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    optimizeContentMutation.mutate({
                      content: optimizerContent.trim(),
                      platform: optimizerPlatform,
                      ...(optimizerPostId
                        ? {
                            postId: optimizerPostId,
                            expectedContent: optimizerOriginalContent,
                          }
                        : {}),
                    })
                  }
                  disabled={!optimizerContent.trim() || optimizeContentMutation.isPending}
                  data-testid="button-optimize-content"
                >
                  {optimizeContentMutation.isPending
                    ? "Generating…"
                    : "Generate optimized draft"}
                </Button>
                <Button variant="outline" onClick={() => setShowContentOptimizer(false)}>
                  Close
                </Button>
              </div>
              {optimizedDraft && (
                <section
                  className="space-y-3 rounded-md border bg-muted/30 p-4"
                  aria-live="polite"
                  data-testid="dashboard-optimized-draft"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">
                      {optimizedDraft.updatedExisting ? "Updated" : "Saved"}{" "}
                      {optimizedDraft.platform} draft
                    </h3>
                    <Badge variant="secondary">Not published</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">
                    {optimizedDraft.content}
                  </p>
                  <Button variant="outline" onClick={() => setLocation("/social-media")}>
                    Open Social Media drafts
                  </Button>
                </section>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
            <TabsTrigger data-testid="tab-overview" value="overview">Overview</TabsTrigger>
            <TabsTrigger data-testid="tab-growth" value="growth">Growth</TabsTrigger>
            <TabsTrigger data-testid="tab-analytics" value="analytics">Analytics</TabsTrigger>
            <TabsTrigger data-testid="tab-ai-insights" value="ai-insights">AI Insights</TabsTrigger>
            <TabsTrigger data-testid="tab-projects" value="projects">Projects</TabsTrigger>
            <TabsTrigger data-testid="tab-activity" value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TopPlatformsCard
                platforms={dashboardData?.topPlatforms ?? []}
                loading={dashboardLoading}
              />
              <ProjectsCard
                projects={projects}
                loading={projectsLoading}
                onOpenProjects={() => setLocation("/projects")}
              />
            </div>
            <FirstWeekSuccessPath />
          </TabsContent>

          <TabsContent value="growth" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <AICareerCoach />
              </div>
              <div className="space-y-4">
                <StreakCounter showAll />
                <SuggestedCollaborators />
              </div>
            </div>
            <ErrorBoundary>
              <LoopHealthScore />
            </ErrorBoundary>
            <UpcomingReleasesSection />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Analytics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Review the measured dashboard summary here, or open the full Analytics workspace for deeper reporting.
                </p>
                <TopPlatformsCard
                  platforms={dashboardData?.topPlatforms ?? []}
                  loading={dashboardLoading}
                />
                <Button onClick={() => setLocation("/analytics")}>Open Full Analytics</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai-insights" className="space-y-6">
            {!hasPaidSubscription ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Lock className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    AI Features Require Subscription
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Upgrade to a paid plan to access AI-powered insights.
                  </p>
                  <Button onClick={() => setLocation("/pricing")}>
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade Plan
                  </Button>
                </CardContent>
              </Card>
            ) : aiInsightsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : aiInsightsError ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Brain className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">AI Insights Unavailable</h3>
                  <p className="text-muted-foreground">
                    The current MaxCore analytics contract does not provide supported insight data. No invented scores or forecasts are shown.
                  </p>
                </CardContent>
              </Card>
            ) : aiInsights && aiInsights.insights.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Lightbulb className="w-5 h-5 mr-2 text-yellow-600" />
                    AI Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aiInsights.insights.map((insight, index) => (
                    <div
                      key={`${insight.metric ?? insight.type}-${index}`}
                      className="p-4 rounded-lg border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                    >
                      <h4 className="font-semibold">{insight.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {insight.description}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  No supported insight data is available yet.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="projects" className="space-y-6">
            <ProjectsCard
              projects={projects}
              loading={projectsLoading}
              onOpenProjects={() => setLocation("/projects")}
            />
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
                {dashboardLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (dashboardData?.recentActivity?.length ?? 0) > 0 ? (
                  <div className="space-y-4">
                    {dashboardData?.recentActivity?.map((activity) => (
                      <div
                        key={activity.id ?? `${activity.type ?? activity.title}-${String(activity.timestamp)}`}
                        className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                      >
                        {activity.status === "success" ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mt-1" />
                        ) : activity.status === "warning" || activity.status === "error" ? (
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-1" />
                        ) : (
                          <Info className="w-5 h-5 text-blue-600 mt-1" />
                        )}
                        <div className="flex-1">
                          <div className="font-semibold">{activity.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {activity.description}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatDashboardTimestamp(activity.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No recent activity yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {showFeatureDiscovery && (
          <FeatureDiscovery
            onClose={() => setShowFeatureDiscovery(false)}
            userLevel={userLevel}
          />
        )}
        {showFeatureSpotlight && (
          <FeatureSpotlight
            onClose={() => setShowFeatureSpotlight(false)}
            onExploreFeature={(featureId) => {
              setShowFeatureSpotlight(false);
              setShowFeatureDiscovery(false);
              toast({
                title: "Feature Selected",
                description: `Find ${featureId} in the navigation to get started.`,
              });
            }}
          />
        )}
        <ContextualFeatureHint />
      </div>
    </AppLayout>
  );
}

function TopPlatformsCard({
  platforms,
  loading,
}: {
  platforms: DashboardTopPlatform[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Globe className="w-5 h-5 mr-2 text-blue-600" />
          Top Performing Platforms
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : platforms.length > 0 ? (
          <div className="space-y-4">
            {platforms.map((platform, index) => (
              <div
                key={`${platform.name}-${index}`}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div>
                  <div className="font-semibold">{platform.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {platform.streams.toLocaleString()} streams
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-green-600">
                    ${platform.revenue.toLocaleString()}
                  </div>
                  <div
                    className={`text-sm ${
                      platform.growth > 0
                        ? "text-green-600"
                        : platform.growth < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {platform.growth > 0 ? "+" : ""}
                    {platform.growth}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No platform analytics have been reported yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectsCard({
  projects,
  loading,
  onOpenProjects,
}: {
  projects: DashboardProject[];
  loading: boolean;
  onOpenProjects: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Music className="w-5 h-5 mr-2 text-purple-600" />
          Recent Projects
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : projects.length > 0 ? (
          <div className="space-y-3">
            {projects.slice(0, 8).map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div>
                  <div className="font-semibold">
                    {project.title || "Untitled Project"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {project.genre || "Genre not set"} •{" "}
                    {project.streams == null
                      ? "Streams not reported"
                      : `${project.streams.toLocaleString()} streams`}
                  </div>
                </div>
                {project.status && <Badge variant="secondary">{project.status}</Badge>}
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={onOpenProjects}>
              Open all projects
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <Music className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <Button onClick={onOpenProjects}>
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
