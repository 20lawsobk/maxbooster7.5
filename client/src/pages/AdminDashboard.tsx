import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import {
  normalizeAuditResults,
  normalizeTestingResults,
  type AuditIssue,
  type AuditResults,
  type AuditRecommendation,
  type TestingResults,
} from "@/lib/adminDashboardContracts";
import { useToast } from "@/hooks/use-toast";
import { useRequireAdmin } from "@/hooks/useRequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shield, CheckCircle, XCircle, AlertTriangle, Activity, Users, Database, Server, Cpu, HardDrive, Network, Zap, BarChart3, TrendingUp, RefreshCw, Eye, Bug, TestTube, FileText, Clock, Star, Award, Target, AlertCircle, Info, CheckSquare, XSquare, Key, Webhook, Search, Filter, Trash2, RotateCcw, Loader2 } from "lucide-react";

interface SystemMetrics {
  uptime: number;
  activeUsers: number;
  cpu: number;
  memory: number;
  disk: number;
  network?: number;
  avgResponseTime?: number;
  responseTime?: number;
}

interface TopCountry {
  country: string;
  users: number;
}

interface ExternalApiCheck {
  status: "connected" | "disconnected" | "unknown";
  latency: number | null;
}

interface SystemHealthResponse {
  externalApis: Record<
    "stripe" | "labelgrid" | "spotify" | "apple_music" | "youtube" | "twitter" | "instagram" | "tiktok",
    ExternalApiCheck
  >;
}

const EXTERNAL_API_LABELS: Record<string, string> = {
  stripe: "Stripe",
  labelgrid: "LabelGrid",
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube: "YouTube",
  twitter: "Twitter",
  instagram: "Instagram",
  tiktok: "TikTok",
};

interface UserAnalytics {
  newUsers: number;
  totalRevenue: number;
  monthlyGrowth: number;
  topCountries?: TopCountry[];
}

interface ActivityItem {
  type: string;
  action: string;
  user: string;
  time: string;
  timestamp?: string | Date | null;
}

interface AdminUser {
  id: string;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  subscriptionTier?: string | null;
  subscriptionStatus?: string | null;
  emailVerified?: boolean | null;
  createdAt?: string | null;
  stripeCustomerId?: string | null;
}

interface AdminUsersResponse {
  users: AdminUser[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    offset?: number;
  };
}

interface WebhookDlqItem {
  id: string;
  webhookEventId: string;
  attempts: number;
  lastError: string;
  status: string;
}

interface WebhookDlqResponse {
  items: WebhookDlqItem[];
}

interface LogEntry {
  id: string;
  level: string;
  service: string;
  timestamp: string | Date;
  message: string;
  context?: Record<string, unknown> | null;
}

interface LogsResponse {
  logs: LogEntry[];
}

function isAdminUsersResponse(
  data: AdminUsersResponse | undefined,
): data is AdminUsersResponse {
  return !!data && Array.isArray(data.users);
}

export default function AdminDashboard({ defaultTab }: { defaultTab?: string } = {}) {
  const { user, isLoading: authLoading } = useRequireAdmin();
  const [activeTab, setActiveTab] = useState(defaultTab || "overview");
  const [refreshing, setRefreshing] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(usersSearch);
      setUsersPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [usersSearch]);

  // All hooks must be called before any conditional returns (React Rules of Hooks)
  const isAdmin = !!user && user.role === "admin";

  // Fetch audit results
  const {
    data: auditResults,
    isLoading: auditLoading,
    isError: auditError,
    error: auditQueryError,
    refetch: refetchAudit,
  } = useQuery<AuditResults>({
    queryKey: ["/api/audit/results"],
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  // Fetch testing results
  const {
    data: testResults,
    isLoading: testLoading,
    isError: testError,
    error: testQueryError,
    refetch: refetchTests,
  } = useQuery<TestingResults>({
    queryKey: ["/api/testing/results"],
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  // Fetch system metrics
  const {
    data: systemMetrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
  } = useQuery<SystemMetrics>({
    queryKey: ["/api/admin/metrics"],
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  // Fetch user analytics
  const {
    data: userAnalytics,
    isLoading: userAnalyticsLoading,
    refetch: refetchAnalytics,
  } = useQuery<UserAnalytics>({
    queryKey: ["/api/admin/analytics"],
    enabled: isAdmin,
  });

  // Fetch recent activity
  const {
    data: recentActivity,
    isLoading: activityLoading,
    isError: activityError,
    refetch: refetchActivity,
  } = useQuery<ActivityItem[]>({
    queryKey: ["/api/admin/activity"],
    enabled: isAdmin,
  });

  // Fetch real system/external-API health (replaces the old hardcoded panel)
  const {
    data: systemHealth,
    isLoading: systemHealthLoading,
  } = useQuery<SystemHealthResponse>({
    queryKey: ["/api/admin/system-health"],
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  // Fetch users list with pagination and search
  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery<AdminUsersResponse>({
    queryKey: ["/api/admin/users", usersPage, debouncedSearch],
    enabled: isAdmin,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: usersPage.toString(),
        limit: "20",
      });
      if (debouncedSearch) {
        params.append("search", debouncedSearch);
      }
      const response = await fetch(`/api/admin/users?${params}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      return response.json();
    },
  });

  // Handle refresh - refetch ALL queries
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchAudit(),
        refetchTests(),
        refetchMetrics(),
        refetchAnalytics(),
        refetchActivity(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // Loading state - conditional return AFTER all hooks
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading admin dashboard…</p>
        </div>
      </div>
    );
  }

  // Access denied - useRequireAdmin handles redirect for non-admin users
  if (!user || user.role !== "admin") {
    return null;
  }

  // Direct data assignment - no fallbacks
  const auditData = normalizeAuditResults(auditResults);
  const testData = normalizeTestingResults(testResults);
  const metricsData = systemMetrics;
  const analyticsData = userAnalytics;
  const usersPayloadValid = isAdminUsersResponse(usersData);
  const activityPayloadValid =
    recentActivity === undefined || Array.isArray(recentActivity);

  // Calculate health status
  const getHealthStatus = (score: number) => {
    if (score >= 95)
      return {
        status: "excellent",
        color: "text-green-600",
        bg: "bg-green-100",
      };
    if (score >= 85)
      return { status: "good", color: "text-blue-600", bg: "bg-blue-100" };
    if (score >= 70)
      return { status: "fair", color: "text-yellow-600", bg: "bg-yellow-100" };
    return { status: "poor", color: "text-red-600", bg: "bg-red-100" };
  };

  const auditHealth = auditData
    ? getHealthStatus(auditData.overallScore)
    : { status: "unknown", color: "text-gray-600", bg: "bg-gray-100" };
  const testHealth = testData
    ? testData.overallScore !== null
      ? getHealthStatus(testData.overallScore)
      : { status: "unknown", color: "text-gray-600", bg: "bg-gray-100" }
    : { status: "unknown", color: "text-gray-600", bg: "bg-gray-100" };

  return (
    <AppLayout
      title="Admin Dashboard"
      subtitle="System monitoring and management"
    >
      <div className="space-y-6">
        {/* Header with refresh button */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              System Overview
            </h1>
            <p className="text-gray-600">
              Monitor system health, security, and performance
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2"
            data-testid="button-refresh-dashboard"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </Button>
        </div>

        {/* System Health Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {auditLoading || !auditData ? (
            <Skeleton className="h-32 w-full" data-testid="card-audit-score" />
          ) : (
            <Card
              className="bg-gradient-to-br from-green-50 to-emerald-100 border-green-200"
              data-testid="card-audit-score"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-700">
                      Audit Score
                    </p>
                    <p className="text-3xl font-bold text-green-900">
                      {auditData.overallScore}/100
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Security & Compliance
                    </p>
                  </div>
                  <div className={`p-3 rounded-full ${auditHealth.bg}`}>
                    <Shield className={`w-6 h-6 ${auditHealth.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {testLoading || !testData ? (
            <Skeleton className="h-32 w-full" data-testid="card-test-score" />
          ) : (
            <Card
              className="bg-gradient-to-br from-blue-50 to-cyan-100 border-blue-200"
              data-testid="card-test-score"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-700">
                      Test Score
                    </p>
                    <p className="text-3xl font-bold text-blue-900">
                      {testData.overallScore}/100
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Quality Assurance
                    </p>
                  </div>
                  <div className={`p-3 rounded-full ${testHealth.bg}`}>
                    <TestTube className={`w-6 h-6 ${testHealth.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {metricsLoading || !metricsData ? (
            <Skeleton
              className="h-32 w-full"
              data-testid="card-system-uptime"
            />
          ) : (
            <Card
              className="bg-gradient-to-br from-purple-50 to-violet-100 border-purple-200"
              data-testid="card-system-uptime"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-purple-700">
                      System Uptime
                    </p>
                    <p className="text-3xl font-bold text-purple-900">
                      {metricsData.uptime}%
                    </p>
                    <p className="text-xs text-purple-600 mt-1">Availability</p>
                  </div>
                  <div className="p-3 bg-purple-200 rounded-full">
                    <Server className="w-6 h-6 text-purple-700" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {metricsLoading || !metricsData ? (
            <Skeleton className="h-32 w-full" data-testid="card-active-users" />
          ) : (
            <Card
              className="bg-gradient-to-br from-orange-50 to-amber-100 border-orange-200"
              data-testid="card-active-users"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-700">
                      Active Users
                    </p>
                    <p className="text-3xl font-bold text-orange-900">
                      {metricsData.activeUsers.toLocaleString()}
                    </p>
                    <p className="text-xs text-orange-600 mt-1">
                      Currently Online
                    </p>
                  </div>
                  <div className="p-3 bg-orange-200 rounded-full">
                    <Users className="w-6 h-6 text-orange-700" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-10">
            <TabsTrigger value="overview" data-testid="tab-overview">
              Overview
            </TabsTrigger>
            <TabsTrigger value="money-loop" data-testid="tab-money-loop">
              Beat Loop
            </TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit">
              Audit
            </TabsTrigger>
            <TabsTrigger value="testing" data-testid="tab-testing">
              Testing
            </TabsTrigger>
            <TabsTrigger value="performance" data-testid="tab-performance">
              Performance
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              Users
            </TabsTrigger>
            <TabsTrigger value="compliance" data-testid="tab-compliance">
              Compliance
            </TabsTrigger>
            <TabsTrigger value="tokens" data-testid="tab-tokens">
              Tokens
            </TabsTrigger>
            <TabsTrigger value="webhooks" data-testid="tab-webhooks">
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs">
              Logs
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* System Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Activity className="h-5 w-5 mr-2" />
                    System Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {metricsLoading || !metricsData ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Cpu className="h-5 w-5 text-blue-600" />
                          <span className="text-sm font-medium">CPU Usage</span>
                        </div>
                        <span className="text-sm font-bold">
                          {metricsData.cpu}%
                        </span>
                      </div>
                      <Progress value={metricsData.cpu} className="h-2" />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <HardDrive className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium">
                            Memory Usage
                          </span>
                        </div>
                        <span className="text-sm font-bold">
                          {metricsData.memory}%
                        </span>
                      </div>
                      <Progress value={metricsData.memory} className="h-2" />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Database className="h-5 w-5 text-purple-600" />
                          <span className="text-sm font-medium">
                            Disk Usage
                          </span>
                        </div>
                        <span className="text-sm font-bold">
                          {metricsData.disk}%
                        </span>
                      </div>
                      <Progress value={metricsData.disk} className="h-2" />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Network className="h-5 w-5 text-orange-600" />
                          <span className="text-sm font-medium">
                            Network I/O
                          </span>
                        </div>
                        <span className="text-sm font-bold">
                          {metricsData.network === undefined
                            ? "Unavailable"
                            : `${metricsData.network}%`}
                        </span>
                      </div>
                      {metricsData.network === undefined ? null : (
                        <Progress value={metricsData.network} className="h-2" />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* User Analytics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2" />
                    User Analytics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {userAnalyticsLoading || !analyticsData ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                          <p className="text-2xl font-bold text-blue-600">
                            {analyticsData.newUsers}
                          </p>
                          <p className="text-sm text-blue-600">
                            New Users Today
                          </p>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <p className="text-2xl font-bold text-green-600">
                            {analyticsData.totalRevenue.toLocaleString()}
                          </p>
                          <p className="text-sm text-green-600">
                            Total Revenue
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            Monthly Growth
                          </span>
                          <div className="flex items-center space-x-2">
                            <TrendingUp className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-bold text-green-600">
                              +{analyticsData.monthlyGrowth}%
                            </span>
                          </div>
                        </div>
                        <Progress
                          value={analyticsData.monthlyGrowth}
                          className="h-2"
                        />
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-medium text-gray-900">
                          Top Countries
                        </h4>
                        {Array.isArray(analyticsData.topCountries) &&
                        analyticsData.topCountries.length > 0 ? (
                          analyticsData.topCountries
                            .slice(0, 3)
                            .map((country: TopCountry, index: number) => (
                              <div
                                key={index}
                                className="flex items-center justify-between"
                              >
                                <span className="text-sm text-gray-600">
                                  {country.country}
                                </span>
                                <span className="text-sm font-bold">
                                  {country.users.toLocaleString()}
                                </span>
                              </div>
                            ))
                        ) : (
                          <p className="text-sm text-gray-500">
                            No data available
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : activityError || !activityPayloadValid ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {activityError
                        ? "Failed to load recent activity."
                        : "Recent activity response was invalid."}
                    </AlertDescription>
                  </Alert>
                ) : recentActivity && recentActivity.length > 0 ? (
                  <div className="space-y-4">
                    {recentActivity.map((activity: ActivityItem, index: number) => (
                      <div
                        key={index}
                        className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg"
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            activity.type === "success"
                              ? "bg-green-500"
                              : activity.type === "error"
                                ? "bg-red-500"
                                : "bg-blue-500"
                          }`}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {activity.action}
                          </p>
                          <p className="text-xs text-gray-500">
                            {activity.user}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {activity.time}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No recent activity</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* External API Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Network className="h-5 w-5 mr-2" />
                  External API Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {systemHealthLoading && !systemHealth ? (
                  <div className="text-center py-6 text-sm text-gray-500">
                    Checking external services…
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                    {Object.entries(EXTERNAL_API_LABELS).map(([key, label]) => {
                      const check = systemHealth?.externalApis?.[
                        key as keyof SystemHealthResponse["externalApis"]
                      ];
                      const status = check?.status ?? "unknown";
                      const isOperational = status === "connected";
                      const isUnknown = status === "unknown";
                      const isDown = status === "disconnected";
                      return (
                        <div
                          key={key}
                          className={`p-3 rounded-lg border ${
                            isOperational
                              ? "bg-green-50 border-green-200"
                              : isUnknown
                                ? "bg-gray-50 border-gray-200"
                                : "bg-red-50 border-red-200"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {isOperational ? (
                              <CheckCircle className="h-3 w-3 text-green-600" />
                            ) : isUnknown ? (
                              <AlertTriangle className="h-3 w-3 text-gray-400" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-600" />
                            )}
                            <span className="text-xs font-medium truncate">
                              {label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {isUnknown
                              ? "not configured"
                              : isDown
                                ? "unreachable"
                                : `${check?.latency ?? "–"}ms`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-3">
                  Live reachability checks against each provider's API, run every 30s. "Not configured" means no credential is set for that service in this environment.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Tab */}
          <TabsContent value="audit" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Audit Scores */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Shield className="h-5 w-5 mr-2" />
                    Audit Scores
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {auditLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : auditError ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>Failed to load audit scores.</AlertDescription>
                    </Alert>
                  ) : !auditData ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        The audit response did not include score data.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-4">
                      {[
                        {
                          name: "Security",
                          score: auditData.securityScore,
                          icon: Shield,
                        },
                        {
                          name: "Functionality",
                          score: auditData.functionalityScore,
                          icon: CheckCircle,
                        },
                        {
                          name: "Performance",
                          score: auditData.performanceScore,
                          icon: Zap,
                        },
                        {
                          name: "Code Quality",
                          score: auditData.codeQualityScore,
                          icon: FileText,
                        },
                        {
                          name: "Accessibility",
                          score: auditData.accessibilityScore,
                          icon: Eye,
                        },
                        {
                          name: "SEO",
                          score: auditData.seoScore,
                          icon: Target,
                        },
                      ].map((item, index) => {
                        const health = getHealthStatus(item.score);
                        return (
                          <div key={index} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <item.icon className="h-5 w-5 text-gray-600" />
                                <span className="text-sm font-medium">
                                  {item.name}
                                </span>
                              </div>
                              <span
                                className={`text-sm font-bold ${health.color}`}
                              >
                                {item.score}/100
                              </span>
                            </div>
                            <Progress value={item.score} className="h-2" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Issues and Recommendations */}
              <div className="space-y-6">
                {/* Issues */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <AlertTriangle className="h-5 w-5 mr-2" />
                      Audit Checks{" "}
                      {auditData && `(${auditData.auditItems?.length ?? 0})`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {auditLoading ? (
                      <Skeleton className="h-32 w-full" />
                    ) : auditError ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {auditQueryError instanceof Error
                            ? auditQueryError.message
                            : "Failed to load audit checks."}
                        </AlertDescription>
                      </Alert>
                    ) : !auditData ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          The audit response was invalid. Expected auditItems,
                          summary, and recommendations.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="space-y-3">
                        {auditData.auditItems.map(
                          (issue: AuditIssue, index: number) => (
                            <Alert
                              key={index}
                              className={`${
                                issue.status === "fail"
                                  ? "border-red-200 bg-red-50"
                                  : issue.status === "warning"
                                    ? "border-orange-200 bg-orange-50"
                                    : "border-yellow-200 bg-yellow-50"
                              }`}
                            >
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription>
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {issue.item}
                                  </p>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {issue.details}
                                  </p>
                                  <Badge variant="outline" className="mt-2">
                                    {issue.category}: {issue.status}
                                  </Badge>
                                </div>
                              </AlertDescription>
                            </Alert>
                          ),
                        )}
                        {auditData.auditItems.length === 0 && (
                          <div className="text-center py-8">
                            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                            <p className="text-gray-600">No issues found!</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recommendations */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Info className="h-5 w-5 mr-2" />
                      Recommendations{" "}
                      {auditData &&
                        `(${auditData.recommendations?.length ?? 0})`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {auditLoading ? (
                      <Skeleton className="h-32 w-full" />
                    ) : auditError ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>Failed to load recommendations.</AlertDescription>
                      </Alert>
                    ) : !auditData ? (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          The audit response did not include recommendations.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="space-y-3">
                        {auditData.recommendations.map(
                          (rec: AuditRecommendation, index: number) => (
                            <div
                              key={index}
                              className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">
                                   {rec.category}
                                  </p>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {rec.recommendation}
                                  </p>
                                </div>
                                <Badge variant="outline" className="ml-2">
                                  {rec.priority}
                                </Badge>
                              </div>
                            </div>
                          ),
                        )}
                        {(auditData.recommendations?.length ?? 0) === 0 && (
                          <div className="text-center py-8">
                            <Star className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                            <p className="text-gray-600">
                              No recommendations at this time
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Compliance Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Award className="h-5 w-5 mr-2" />
                  Compliance Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : auditError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Failed to load audit checks.</AlertDescription>
                  </Alert>
                ) : !auditData ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      The audit response did not include compliance checks.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {auditData.auditItems.map((item) => (
                        <div
                          key={`${item.category}-${item.item}`}
                          className={`p-4 rounded-lg text-center ${
                            item.status === "pass"
                              ? "bg-green-50 border border-green-200"
                              : "bg-gray-50 border border-gray-200"
                          }`}
                        >
                          {item.status === "pass" ? (
                            <CheckSquare className="h-6 w-6 text-green-600 mx-auto mb-2" />
                          ) : (
                            <XSquare className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                          )}
                          <p className="text-sm font-medium">{item.item}</p>
                          <p className="text-xs text-gray-500 capitalize">
                            {item.status}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Testing Tab */}
          <TabsContent value="testing" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Test Scores */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TestTube className="h-5 w-5 mr-2" />
                    Test Coverage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {testLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : testError ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {testQueryError instanceof Error
                          ? testQueryError.message
                          : "Failed to load test results."}
                      </AlertDescription>
                    </Alert>
                  ) : !testData ? (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        No test result data is available yet.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <p className="text-3xl font-bold text-blue-600">
                          {testData.overallScore ?? "—"}
                        </p>
                        <p className="text-sm text-blue-600">
                          Overall score
                        </p>
                      </div>
                      {testData.testSuites.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No test suites were recorded.
                        </p>
                      ) : (
                        testData.testSuites.map((suite) => (
                          <div key={suite.name} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {suite.name}
                              </span>
                              <span className="text-sm text-gray-600">
                                {suite.passed} passed · {suite.failed} failed ·{" "}
                                {suite.skipped} skipped
                              </span>
                            </div>
                            <Progress
                              value={
                                suite.passed +
                                  suite.failed +
                                  suite.skipped >
                                0
                                  ? (suite.passed /
                                      (suite.passed +
                                        suite.failed +
                                        suite.skipped)) *
                                    100
                                  : 0
                              }
                              className="h-2"
                            />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Test Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Bug className="h-5 w-5 mr-2" />
                    Test Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {testLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : testError ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>Failed to load test statistics.</AlertDescription>
                    </Alert>
                  ) : !testData ? (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        No test statistics are available yet.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <p className="text-2xl font-bold text-green-600">
                            {testData.summary.passed}
                          </p>
                          <p className="text-sm text-green-600">Passed</p>
                        </div>
                        <div className="text-center p-4 bg-red-50 rounded-lg">
                          <p className="text-2xl font-bold text-red-600">
                            {testData.summary.failed}
                          </p>
                          <p className="text-sm text-red-600">Failed</p>
                        </div>
                        <div className="text-center p-4 bg-yellow-50 rounded-lg">
                          <p className="text-2xl font-bold text-yellow-600">
                            {testData.summary.skipped}
                          </p>
                          <p className="text-sm text-yellow-600">Skipped</p>
                        </div>
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                          <p className="text-2xl font-bold text-blue-600">
                            {testData.summary.total}
                          </p>
                          <p className="text-sm text-blue-600">Total Tests</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">
                          Code Coverage
                        </h4>
                        {testData.coverage ? (
                          <div className="space-y-3">
                            {Object.entries(testData.coverage).map(
                              ([key, value]: [string, number]) => (
                              <div key={key} className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-gray-600 capitalize">
                                    {key}
                                  </span>
                                  <span className="text-sm font-bold">
                                    {value}%
                                  </span>
                                </div>
                                <Progress value={value} className="h-2" />
                              </div>
                              ),
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">
                            Coverage was not included in this test result.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="h-5 w-5 mr-2" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metricsLoading || !metricsData ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="text-center p-6 bg-gray-50 rounded-lg">
                    <Activity className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-600">
                      Performance metrics will be displayed here
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Response Time:{" "}
                      {metricsData.avgResponseTime ??
                        metricsData.responseTime ??
                        0}
                      ms
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <CardTitle className="flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    User Management
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search by name or email..."
                        value={usersSearch}
                        onChange={(e) => setUsersSearch(e.target.value)}
                        className="pl-10 w-64"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchUsers()}
                      disabled={usersLoading}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${usersLoading ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {usersError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Failed to load users. Please try again.
                    </AlertDescription>
                  </Alert>
                ) : usersLoading ? (
                  <Skeleton className="h-96 w-full" />
                ) : !usersPayloadValid ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      The users response was invalid. Expected an object with a
                      users array.
                    </AlertDescription>
                  </Alert>
                ) : usersPayloadValid && usersData.users.length > 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Subscription</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Joined</TableHead>
                            <TableHead className="text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usersData.users.map(
                            (userData: AdminUser) => (
                              <TableRow key={userData.id}>
                                <TableCell className="font-medium">
                                  {userData.username}
                                </TableCell>
                                <TableCell>{userData.email}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      userData.role === "admin"
                                        ? "default"
                                        : "secondary"
                                    }
                                  >
                                    {userData.role || "user"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {userData.subscriptionTier ? (
                                    <Badge
                                      variant={
                                        userData.subscriptionTier === "lifetime"
                                          ? "default"
                                          : "outline"
                                      }
                                    >
                                      {userData.subscriptionTier}
                                    </Badge>
                                  ) : (
                                    <span className="text-sm text-gray-500">
                                      Free
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      userData.emailVerified
                                        ? "default"
                                        : "secondary"
                                    }
                                    className={
                                      userData.emailVerified
                                        ? "bg-green-100 text-green-800"
                                        : ""
                                    }
                                  >
                                    {userData.emailVerified
                                      ? "Verified"
                                      : "Unverified"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-gray-500">
                                  {userData.createdAt
                                    ? new Date(
                                        userData.createdAt,
                                      ).toLocaleDateString()
                                    : "N/A"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedUser(userData);
                                      setShowUserDetails(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ),
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {usersData?.pagination && (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">
                          Showing{" "}
                          {(usersData.pagination.offset ??
                            (usersData.pagination.page - 1) *
                              usersData.pagination.limit) + 1}{" "}
                          to{" "}
                          {Math.min(
                            (usersData.pagination.offset ??
                              (usersData.pagination.page - 1) *
                                usersData.pagination.limit) +
                              usersData.pagination.limit,
                            usersData.pagination.total,
                          )}{" "}
                          of {usersData.pagination.total} users
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setUsersPage((p) => Math.max(1, p - 1))
                            }
                            disabled={usersPage === 1}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUsersPage((p) => p + 1)}
                            disabled={
                              !usersData?.pagination ||
                              usersPage >=
                                Math.ceil(
                                  usersData.pagination.total /
                                    usersData.pagination.limit,
                                )
                            }
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center p-6 bg-gray-50 rounded-lg">
                    <Users className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-600">
                      {debouncedSearch
                        ? "No users match your search"
                        : "No users found"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* User Details Dialog */}
            <Dialog open={showUserDetails} onOpenChange={setShowUserDetails}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>User Details</DialogTitle>
                  <DialogDescription>
                    Detailed information about this user account
                  </DialogDescription>
                </DialogHeader>
                {selectedUser && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Username
                        </p>
                        <p className="text-sm">{selectedUser.username}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Email
                        </p>
                        <p className="text-sm">{selectedUser.email}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Role
                        </p>
                        <Badge
                          variant={
                            selectedUser.role === "admin"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {selectedUser.role || "user"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Subscription
                        </p>
                        {selectedUser.subscriptionTier ? (
                          <Badge variant="outline">
                            {selectedUser.subscriptionTier}
                          </Badge>
                        ) : (
                          <span className="text-sm text-gray-500">Free</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Email Verified
                        </p>
                        <Badge
                          variant={
                            selectedUser.emailVerified ? "default" : "secondary"
                          }
                          className={
                            selectedUser.emailVerified
                              ? "bg-green-100 text-green-800"
                              : ""
                          }
                        >
                          {selectedUser.emailVerified ? "Yes" : "No"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Joined
                        </p>
                        <p className="text-sm">
                          {selectedUser.createdAt
                            ? new Date(
                                selectedUser.createdAt,
                              ).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                      {selectedUser.stripeCustomerId && (
                        <div className="col-span-2">
                          <p className="text-sm font-medium text-gray-500">
                            Stripe Customer ID
                          </p>
                          <p className="text-sm font-mono text-xs">
                            {selectedUser.stripeCustomerId}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Compliance Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : auditError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Failed to load compliance checks.</AlertDescription>
                  </Alert>
                ) : !auditData ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      The audit response did not include compliance checks.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {auditData.auditItems.map((item) => (
                        <div
                          key={`${item.category}-${item.item}`}
                          className={`p-6 rounded-lg ${
                            item.status === "pass"
                              ? "bg-green-50 border-2 border-green-200"
                              : "bg-gray-50 border-2 border-gray-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold uppercase">
                              {item.item}
                            </h3>
                            {item.status === "pass" ? (
                              <CheckCircle className="h-6 w-6 text-green-600" />
                            ) : (
                              <XCircle className="h-6 w-6 text-gray-400" />
                            )}
                          </div>
                          <p
                            className={`text-sm ${item.status === "pass" ? "text-green-700" : "text-gray-600"}`}
                          >
                            {item.status === "pass" ? "Compliant" : item.status}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Token Management Tab */}
          <TabsContent value="tokens" className="space-y-6">
            <TokenManagementTab />
          </TabsContent>

          {/* Webhook Monitor Tab */}
          <TabsContent value="webhooks" className="space-y-6">
            <WebhookMonitorTab />
          </TabsContent>

          {/* Log Viewer Tab */}
          <TabsContent value="logs" className="space-y-6">
            <LogViewerTab />
          </TabsContent>

          {/* Beat Money Loop Tab */}
          <TabsContent value="money-loop" className="space-y-6">
            <BeatMoneyLoopTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// Token Management Tab Component
function TokenManagementTab() {
  const { toast } = useToast();
  const [revokeTokenId, setRevokeTokenId] = useState("");
  const [issuedCredential, setIssuedCredential] = useState<{ token: string; tokenId: string; expiresAt: string } | null>(null);

  const { mutate: issueToken, isPending: issuingToken } = useMutation({
    mutationFn: async () => {
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch("/api/admin/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to issue token (${response.status})`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      const issuedToken = data.token || data.accessToken;
      if (!issuedToken) {
        toast({
          title: "Token issuance response was invalid",
          description: "The server did not return an access token.",
          variant: "destructive",
        });
        return;
      }
      setIssuedCredential({ token: issuedToken, tokenId: data.tokenId, expiresAt: data.expiresAt });
      toast({
        title: "Token issued",
        description: "Copy the credential now. It will not be shown again.",
      });
    },
    onError: (e: Error) =>
      toast({
        title: "Token issuance unavailable",
        description: e.message,
        variant: "destructive",
      }),
  });

  const { mutate: revokeToken, isPending: revokingToken } = useMutation({
    mutationFn: async (tokenId: string) => {
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch("/api/admin/tokens/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ tokenId, reason: "Admin revocation" }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Failed to revoke token (${response.status})`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Token revoked",
        description: "The token has been revoked successfully.",
      });
      setRevokeTokenId("");
    },
    onError: (e: Error) =>
      toast({
        title: "Token revocation unavailable",
        description: e.message,
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Key className="h-5 w-5 mr-2" />
            Issue New Token
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Generate a developer API credential for your own account, valid for 24 hours.
              This is not an admin session or refresh token; it grants the existing developer API access.
            </p>
            {issuedCredential && <div className="space-y-2 rounded border p-3">
              <p>Credential ID: {issuedCredential.tokenId}</p>
              <p>Expires: {new Date(issuedCredential.expiresAt).toLocaleString()}</p>
              <label className="block">Copy this secret now
                <Input readOnly value={issuedCredential.token} onFocus={event => event.target.select()} />
              </label>
              <Button variant="outline" onClick={() => setIssuedCredential(null)}>Dismiss secret</Button>
            </div>}
            <Button
              onClick={() => issueToken()}
              disabled={issuingToken}
              data-testid="button-issue-token"
            >
              {issuingToken ? "Issuing..." : "Issue Token for Current User"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Trash2 className="h-5 w-5 mr-2" />
            Revoke Token
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Token ID"
              value={revokeTokenId}
              onChange={(e) => setRevokeTokenId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              data-testid="input-revoke-token-id"
            />
            <Button
              onClick={() => revokeToken(revokeTokenId)}
              disabled={!revokeTokenId || revokingToken}
              variant="destructive"
              data-testid="button-revoke-token"
            >
              {revokingToken ? "Revoking..." : "Revoke Token"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Webhook Monitor Tab Component
function WebhookMonitorTab() {
  const { toast } = useToast();
  const [eventId, setEventId] = useState("");

  const { data: dlqData, isLoading: dlqLoading } = useQuery<WebhookDlqResponse>({
    queryKey: ["/api/admin/webhooks/dead-letter"],
  });

  const { mutate: retryWebhook, isPending: retrying } = useMutation({
    mutationFn: async (id: string) => {
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch(`/api/admin/webhooks/${id}/retry`, {
        method: "POST",
        credentials: "include",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (!response.ok) throw new Error("Failed to retry webhook");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Retry initiated",
        description: "The webhook event has been queued for retry.",
      });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Webhook className="h-5 w-5 mr-2" />
            Webhook Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">
                  Dead Letter Queue
                </p>
                <p
                  className="text-2xl font-bold text-blue-900"
                  data-testid="text-dlq-count"
                >
              {dlqLoading
                ? "..."
                : Array.isArray(dlqData?.items)
                  ? dlqData.items.length
                  : "—"}
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600 font-medium">Successful</p>
                <p className="text-2xl font-bold text-green-900">N/A</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-red-600 font-medium">Failed</p>
                <p className="text-2xl font-bold text-red-900">N/A</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <RotateCcw className="h-5 w-5 mr-2" />
            Retry Webhook
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Attempt ID"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              data-testid="input-webhook-attempt-id"
            />
            <Button
              onClick={() => retryWebhook(eventId)}
              disabled={!eventId || retrying}
              data-testid="button-retry-webhook"
            >
              {retrying ? "Retrying..." : "Retry Webhook"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {Array.isArray(dlqData?.items) && dlqData.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dead Letter Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="list-dlq-items">
              {dlqData.items.map((item: WebhookDlqItem, index: number) => (
                <div
                  key={item.id}
                  className="p-3 bg-gray-50 rounded-lg"
                  data-testid={`dlq-item-${index}`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">
                        Event ID: {item.webhookEventId}
                      </p>
                      <p className="text-xs text-gray-600">
                        Attempts: {item.attempts}
                      </p>
                      <p className="text-xs text-red-600">{item.lastError}</p>
                    </div>
                    <Badge
                      variant={
                        item.status === "queued" ? "secondary" : "default"
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Log Viewer Tab Component
function LogViewerTab() {
  const [level, setLevel] = useState("all");
  const [service, setService] = useState("");
  const [limit, setLimit] = useState("100");

  const {
    data: logsData,
    isLoading: logsLoading,
    refetch: refetchLogs,
  } = useQuery<LogsResponse>({
    queryKey: ["/api/logs/query", { level, service, limit }],
    enabled: false,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Log Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-3 py-2 border rounded-md mt-1"
                data-testid="select-log-level"
              >
                <option value="all">All</option>
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
                <option value="fatal">Fatal</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Service</label>
              <input
                type="text"
                placeholder="Service name"
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full px-3 py-2 border rounded-md mt-1"
                data-testid="input-log-service"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Limit</label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full px-3 py-2 border rounded-md mt-1"
                data-testid="input-log-limit"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => refetchLogs()}
                disabled={logsLoading}
                className="w-full"
                data-testid="button-search-logs"
              >
                <Search className="h-4 w-4 mr-2" />
                {logsLoading ? "Searching..." : "Search Logs"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {logsData && Array.isArray(logsData.logs) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Log Results ({logsData.logs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="space-y-2 max-h-96 overflow-y-auto"
              data-testid="list-log-events"
            >
              {logsData.logs.map((log: LogEntry, index: number) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg text-sm ${
                    log.level === "error" || log.level === "critical"
                      ? "bg-red-50 border-l-4 border-red-500"
                      : log.level === "warn"
                        ? "bg-yellow-50 border-l-4 border-yellow-500"
                        : "bg-gray-50 border-l-4 border-gray-300"
                  }`}
                  data-testid={`log-event-${index}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">{log.level}</Badge>
                      <span className="font-medium">{log.service}</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-900">{log.message}</p>
                  {log.context && (
                    <pre className="mt-2 text-xs bg-white p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.context, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
            {logsData.logs.length === 0 && (
              <p className="text-sm text-gray-500">No logs matched these filters.</p>
            )}
          </CardContent>
        </Card>
      )}
      {logsData && !Array.isArray(logsData.logs) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The log response was invalid. Expected a logs array.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ============================================================================
// Beat Money Loop Tab — admin-only autonomous revenue loop
// ============================================================================
function BeatMoneyLoopTab() {
  const { toast } = useToast();
  const queryKey = ["/api/admin/beat-money-loop/status"];

  const {
    data: status,
    isLoading,
    refetch,
  } = useQuery<{
    enabled: boolean;
    nextRunAt: string | null;
    lastCycleAt: string | null;
    totalCycles: number;
    successfulCycles: number;
    failedCycles: number;
    consecutiveFailures: number;
    totalRevenueCents: number;
    currentCadenceMs: number;
    msUntilNextRun: number | null;
    recentCycles: Array<{
      id: string;
      status: string;
      triggeredBy: string;
      beatTitle: string | null;
      beatId: string | null;
      price: number | null;
      campaignId: string | null;
      scanContext: any;
      errorMessage: string | null;
      plays: number;
      downloads: number;
      revenueCents: number;
      durationMs: number | null;
      startedAt: string;
      completedAt: string | null;
    }>;
  }>({
    queryKey,
    refetchInterval: 15000,
  });

  const callAction = async (action: "enable" | "disable" | "run-now") => {
    const csrf = getCsrfTokenFromCookie();
    const res = await fetch(`/api/admin/beat-money-loop/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Action ${action} failed (${res.status})`);
    }
    return res.json();
  };

  const enableMut = useMutation({
    mutationFn: () => callAction("enable"),
    onSuccess: () => {
      toast({ title: "Beat Money Loop enabled" });
      refetch();
    },
    onError: (e: Error) =>
      toast({
        title: "Enable failed",
        description: e.message,
        variant: "destructive",
      }),
  });
  const disableMut = useMutation({
    mutationFn: () => callAction("disable"),
    onSuccess: () => {
      toast({ title: "Beat Money Loop disabled" });
      refetch();
    },
    onError: (e: Error) =>
      toast({
        title: "Disable failed",
        description: e.message,
        variant: "destructive",
      }),
  });
  const runNowMut = useMutation({
    mutationFn: () => callAction("run-now"),
    onSuccess: (data: any) => {
      if (data?.status === "started") {
        toast({
          title: "Beat Money Loop cycle started",
          description:
            "Generation is running in the background. This page refreshes automatically with its progress.",
        });
        refetch();
        return;
      }
      const r = data?.result;
      const title =
        r?.status === "completed"
          ? "Cycle completed — beat listed & ads posted"
          : r?.status === "listed"
            ? "Beat listed — ads NOT posted"
            : "Cycle finished";
      const description = r?.beatId
        ? r.status === "listed"
          ? `Beat ${r.beatId.slice(0, 8)} listed in ${r.durationMs}ms. Ads not sent: ${r.note || "no connected social accounts"}`
          : `Beat ${r.beatId.slice(0, 8)} listed${r.campaignId ? `, campaign ${r.campaignId.slice(0, 8)} posted` : ""} in ${r.durationMs}ms`
        : r?.error || "See cycles table for details";
      toast({
        title,
        description,
        variant: r.status === "failed" ? "destructive" : "default",
      });
      refetch();
    },
    onError: (e: Error) =>
      toast({
        title: "Manual cycle failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!status) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Beat Money Loop status is unavailable.
        </AlertDescription>
      </Alert>
    );
  }

  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : "—";
  const fmtIn = (ms: number | null) => {
    if (ms == null) return "—";
    if (ms <= 0) return "now";
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.round(mins / 60);
    return `${hrs} h`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Beat Money Loop
              <Badge
                variant={status.enabled ? "default" : "secondary"}
                data-testid="badge-bml-status"
              >
                {status.enabled ? "RUNNING" : "PAUSED"}
              </Badge>
            </span>
            <div className="flex gap-2">
              {status.enabled ? (
                <Button
                  variant="outline"
                  onClick={() => disableMut.mutate()}
                  disabled={disableMut.isPending}
                  data-testid="btn-bml-disable"
                >
                  Pause
                </Button>
              ) : (
                <Button
                  onClick={() => enableMut.mutate()}
                  disabled={enableMut.isPending}
                  data-testid="btn-bml-enable"
                >
                  Enable
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => runNowMut.mutate()}
                disabled={runNowMut.isPending}
                data-testid="btn-bml-run-now"
              >
                {runNowMut.isPending ? "Running…" : "Run cycle now"}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <AlertDescription>
              Autonomous: scan trending music context → generate beat → list on
              marketplace at competitive price → trigger organic ad campaign
              (MaxCore/PDIM, no paid spend) → analyse → repeat. Cadence adapts
              to industry confidence. Admin-only.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500">Cycles (total)</div>
              <div
                className="text-2xl font-semibold"
                data-testid="stat-bml-total"
              >
                {status.totalCycles}
              </div>
              <div className="text-xs text-gray-500">
                {status.successfulCycles} ok · {status.failedCycles} failed
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Revenue</div>
              <div
                className="text-2xl font-semibold"
                data-testid="stat-bml-revenue"
              >
                ${(status.totalRevenueCents / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Current cadence</div>
              <div className="text-2xl font-semibold">
                {Math.round(status.currentCadenceMs / 60000)} min
              </div>
              {status.consecutiveFailures > 0 && (
                <div className="text-xs text-red-500">
                  backoff: {status.consecutiveFailures} fails
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500">Next cycle</div>
              <div
                className="text-2xl font-semibold"
                data-testid="stat-bml-next"
              >
                {fmtIn(status.msUntilNextRun)}
              </div>
              <div className="text-xs text-gray-500">
                {fmtTime(status.nextRunAt)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent cycles</CardTitle>
        </CardHeader>
        <CardContent>
          {!Array.isArray(status.recentCycles) ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Beat Money Loop status contained an invalid recentCycles value.
              </AlertDescription>
            </Alert>
          ) : status.recentCycles.length === 0 ? (
            <p className="text-sm text-gray-500">
              No cycles yet. Enable the loop or click "Run cycle now" to start.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Beat</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Plays / DLs</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.recentCycles.map((c) => (
                  <TableRow key={c.id} data-testid={`row-bml-cycle-${c.id}`}>
                    <TableCell className="text-xs">
                      {new Date(c.startedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.status === "completed"
                            ? "default"
                            : c.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{c.triggeredBy}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate">
                      {c.beatTitle || "—"}
                    </TableCell>
                    <TableCell>
                      {c.price != null ? `$${c.price.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.plays} / {c.downloads}
                    </TableCell>
                    <TableCell>${(c.revenueCents / 100).toFixed(2)}</TableCell>
                    <TableCell className="text-xs">
                      {c.durationMs != null
                        ? `${Math.round(c.durationMs / 1000)}s`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-red-500 max-w-xs truncate">
                      {c.errorMessage || ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
