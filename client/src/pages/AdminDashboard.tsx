import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRequireAdmin } from '@/hooks/useRequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Users,
  Database,
  Server,
  Cpu,
  HardDrive,
  Network,
  Zap,
  BarChart3,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Settings,
  Eye,
  Bug,
  TestTube,
  FileText,
  Clock,
  Star,
  Award,
  Target,
  AlertCircle,
  Info,
  CheckSquare,
  XSquare,
  MinusSquare,
  Key,
  Webhook,
  Search,
  Filter,
  Trash2,
  RotateCcw,
} from 'lucide-react';

export default function AdminDashboard() {
  const { user, isLoading: authLoading } = useRequireAdmin();
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
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
  const isAdmin = !!user && user.role === 'admin';

  // Fetch audit results
  const {
    data: auditResults,
    isLoading: auditLoading,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ['/api/audit/results'],
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  // Fetch testing results
  const {
    data: testResults,
    isLoading: testLoading,
    refetch: refetchTests,
  } = useQuery({
    queryKey: ['/api/testing/results'],
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  // Fetch system metrics
  const {
    data: systemMetrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ['/api/admin/metrics'],
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  // Fetch user analytics
  const {
    data: userAnalytics,
    isLoading: userAnalyticsLoading,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['/api/admin/analytics'],
    enabled: isAdmin,
  });

  // Fetch recent activity
  const {
    data: recentActivity = [],
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useQuery({
    queryKey: ['/api/admin/activity'],
    enabled: isAdmin,
  });

  // Fetch users list with pagination and search
  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ['/api/admin/users', usersPage, debouncedSearch],
    enabled: isAdmin,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: usersPage.toString(),
        limit: '20',
      });
      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }
      const response = await fetch(`/api/admin/users?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch users');
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
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Access denied - useRequireAdmin handles redirect for non-admin users
  if (!user || user.role !== 'admin') {
    return null;
  }

  // Direct data assignment - no fallbacks
  const auditData = auditResults;
  const testData = testResults;
  const metricsData = systemMetrics;
  const analyticsData = userAnalytics;

  // Calculate health status
  const getHealthStatus = (score: number) => {
    if (score >= 95) return { status: 'excellent', color: 'text-green-600', bg: 'bg-green-100' };
    if (score >= 85) return { status: 'good', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (score >= 70) return { status: 'fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { status: 'poor', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const auditHealth = auditData
    ? getHealthStatus(auditData.overallScore)
    : { status: 'unknown', color: 'text-gray-600', bg: 'bg-gray-100' };
  const testHealth = testData
    ? getHealthStatus(testData.overallScore)
    : { status: 'unknown', color: 'text-gray-600', bg: 'bg-gray-100' };

  return (
    <AppLayout title="Admin Dashboard" subtitle="System monitoring and management">
      <div className="space-y-6">
          {/* Header with refresh button */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">System Overview</h1>
              <p className="text-gray-600">Monitor system health, security, and performance</p>
            </div>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2"
              data-testid="button-refresh-dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
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
                      <p className="text-sm font-medium text-green-700">Audit Score</p>
                      <p className="text-3xl font-bold text-green-900">
                        {auditData.overallScore}/100
                      </p>
                      <p className="text-xs text-green-600 mt-1">Security & Compliance</p>
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
                      <p className="text-sm font-medium text-blue-700">Test Score</p>
                      <p className="text-3xl font-bold text-blue-900">
                        {testData.overallScore}/100
                      </p>
                      <p className="text-xs text-blue-600 mt-1">Quality Assurance</p>
                    </div>
                    <div className={`p-3 rounded-full ${testHealth.bg}`}>
                      <TestTube className={`w-6 h-6 ${testHealth.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {metricsLoading || !metricsData ? (
              <Skeleton className="h-32 w-full" data-testid="card-system-uptime" />
            ) : (
              <Card
                className="bg-gradient-to-br from-purple-50 to-violet-100 border-purple-200"
                data-testid="card-system-uptime"
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-700">System Uptime</p>
                      <p className="text-3xl font-bold text-purple-900">{metricsData.uptime}%</p>
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
                      <p className="text-sm font-medium text-orange-700">Active Users</p>
                      <p className="text-3xl font-bold text-orange-900">
                        {metricsData.activeUsers.toLocaleString()}
                      </p>
                      <p className="text-xs text-orange-600 mt-1">Currently Online</p>
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-9">
              <TabsTrigger value="overview" data-testid="tab-overview">
                Overview
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
                          <span className="text-sm font-bold">{metricsData.cpu}%</span>
                        </div>
                        <Progress value={metricsData.cpu} className="h-2" />

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <HardDrive className="h-5 w-5 text-green-600" />
                            <span className="text-sm font-medium">Memory Usage</span>
                          </div>
                          <span className="text-sm font-bold">{metricsData.memory}%</span>
                        </div>
                        <Progress value={metricsData.memory} className="h-2" />

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Database className="h-5 w-5 text-purple-600" />
                            <span className="text-sm font-medium">Disk Usage</span>
                          </div>
                          <span className="text-sm font-bold">{metricsData.disk}%</span>
                        </div>
                        <Progress value={metricsData.disk} className="h-2" />

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Network className="h-5 w-5 text-orange-600" />
                            <span className="text-sm font-medium">Network I/O</span>
                          </div>
                          <span className="text-sm font-bold">{metricsData.network}%</span>
                        </div>
                        <Progress value={metricsData.network} className="h-2" />
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
                            <p className="text-sm text-blue-600">New Users Today</p>
                          </div>
                          <div className="text-center p-4 bg-green-50 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">
                              {analyticsData.totalRevenue.toLocaleString()}
                            </p>
                            <p className="text-sm text-green-600">Total Revenue</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Monthly Growth</span>
                            <div className="flex items-center space-x-2">
                              <TrendingUp className="h-4 w-4 text-green-600" />
                              <span className="text-sm font-bold text-green-600">
                                +{analyticsData.monthlyGrowth}%
                              </span>
                            </div>
                          </div>
                          <Progress value={analyticsData.monthlyGrowth} className="h-2" />
                        </div>

                        <div className="space-y-2">
                          <h4 className="font-medium text-gray-900">Top Countries</h4>
                          {analyticsData.topCountries && analyticsData.topCountries.length > 0 ? (
                            analyticsData.topCountries
                              .slice(0, 3)
                              .map((country: unknown, index: number) => (
                                <div key={index} className="flex items-center justify-between">
                                  <span className="text-sm text-gray-600">{country.country}</span>
                                  <span className="text-sm font-bold">
                                    {country.users.toLocaleString()}
                                  </span>
                                </div>
                              ))
                          ) : (
                            <p className="text-sm text-gray-500">No data available</p>
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
                  ) : recentActivity.length > 0 ? (
                    <div className="space-y-4">
                      {recentActivity.map((activity: unknown, index: number) => (
                        <div
                          key={index}
                          className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg"
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              activity.type === 'success'
                                ? 'bg-green-500'
                                : activity.type === 'error'
                                  ? 'bg-red-500'
                                  : 'bg-blue-500'
                            }`}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                            <p className="text-xs text-gray-500">{activity.user}</p>
                          </div>
                          <span className="text-xs text-gray-400">{activity.time}</span>
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
                    {auditLoading || !auditData ? (
                      <Skeleton className="h-64 w-full" />
                    ) : (
                      <div className="space-y-4">
                        {[
                          { name: 'Security', score: auditData.securityScore, icon: Shield },
                          {
                            name: 'Functionality',
                            score: auditData.functionalityScore,
                            icon: CheckCircle,
                          },
                          { name: 'Performance', score: auditData.performanceScore, icon: Zap },
                          {
                            name: 'Code Quality',
                            score: auditData.codeQualityScore,
                            icon: FileText,
                          },
                          { name: 'Accessibility', score: auditData.accessibilityScore, icon: Eye },
                          { name: 'SEO', score: auditData.seoScore, icon: Target },
                        ].map((item, index) => {
                          const health = getHealthStatus(item.score);
                          return (
                            <div key={index} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <item.icon className="h-5 w-5 text-gray-600" />
                                  <span className="text-sm font-medium">{item.name}</span>
                                </div>
                                <span className={`text-sm font-bold ${health.color}`}>
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
                        Issues {auditData && `(${auditData.issues.length})`}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {auditLoading || !auditData ? (
                        <Skeleton className="h-32 w-full" />
                      ) : (
                        <div className="space-y-3">
                          {auditData.issues.map((issue: unknown, index: number) => (
                            <Alert
                              key={index}
                              className={`${
                                issue.severity === 'critical'
                                  ? 'border-red-200 bg-red-50'
                                  : issue.severity === 'high'
                                    ? 'border-orange-200 bg-orange-50'
                                    : 'border-yellow-200 bg-yellow-50'
                              }`}
                            >
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription>
                                <div>
                                  <p className="font-medium text-gray-900">{issue.title}</p>
                                  <p className="text-sm text-gray-600 mt-1">{issue.description}</p>
                                  <Badge variant="outline" className="mt-2">
                                    {issue.severity}
                                  </Badge>
                                </div>
                              </AlertDescription>
                            </Alert>
                          ))}
                          {auditData.issues.length === 0 && (
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
                        Recommendations {auditData && `(${auditData.recommendations.length})`}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {auditLoading || !auditData ? (
                        <Skeleton className="h-32 w-full" />
                      ) : (
                        <div className="space-y-3">
                          {auditData.recommendations.map((rec: unknown, index: number) => (
                            <div
                              key={index}
                              className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">{rec.title}</p>
                                  <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                                </div>
                                <Badge variant="outline" className="ml-2">
                                  {rec.priority}
                                </Badge>
                              </div>
                            </div>
                          ))}
                          {auditData.recommendations.length === 0 && (
                            <div className="text-center py-8">
                              <Star className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                              <p className="text-gray-600">No recommendations at this time</p>
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
                  {auditLoading || !auditData ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {Object.entries(auditData.compliance).map(([key, value]: [string, any]) => (
                        <div
                          key={key}
                          className={`p-4 rounded-lg text-center ${
                            value
                              ? 'bg-green-50 border border-green-200'
                              : 'bg-gray-50 border border-gray-200'
                          }`}
                        >
                          {value ? (
                            <CheckSquare className="h-6 w-6 text-green-600 mx-auto mb-2" />
                          ) : (
                            <XSquare className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                          )}
                          <p className="text-sm font-medium uppercase">{key}</p>
                        </div>
                      ))}
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
                    {testLoading || !testData ? (
                      <Skeleton className="h-64 w-full" />
                    ) : (
                      <div className="space-y-4">
                        {[
                          { name: 'Unit Tests', score: testData.unitTestScore, icon: CheckCircle },
                          {
                            name: 'Integration Tests',
                            score: testData.integrationTestScore,
                            icon: Zap,
                          },
                          { name: 'E2E Tests', score: testData.e2eTestScore, icon: Eye },
                          {
                            name: 'Performance Tests',
                            score: testData.performanceTestScore,
                            icon: Activity,
                          },
                          {
                            name: 'Security Tests',
                            score: testData.securityTestScore,
                            icon: Shield,
                          },
                          {
                            name: 'Accessibility Tests',
                            score: testData.accessibilityTestScore,
                            icon: Users,
                          },
                        ].map((item, index) => {
                          const health = getHealthStatus(item.score);
                          return (
                            <div key={index} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <item.icon className="h-5 w-5 text-gray-600" />
                                  <span className="text-sm font-medium">{item.name}</span>
                                </div>
                                <span className={`text-sm font-bold ${health.color}`}>
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

                {/* Test Statistics */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Bug className="h-5 w-5 mr-2" />
                      Test Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {testLoading || !testData ? (
                      <Skeleton className="h-64 w-full" />
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-4 bg-green-50 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">
                              {testData.passedTests}
                            </p>
                            <p className="text-sm text-green-600">Passed</p>
                          </div>
                          <div className="text-center p-4 bg-red-50 rounded-lg">
                            <p className="text-2xl font-bold text-red-600">
                              {testData.failedTests}
                            </p>
                            <p className="text-sm text-red-600">Failed</p>
                          </div>
                          <div className="text-center p-4 bg-yellow-50 rounded-lg">
                            <p className="text-2xl font-bold text-yellow-600">
                              {testData.skippedTests}
                            </p>
                            <p className="text-sm text-yellow-600">Skipped</p>
                          </div>
                          <div className="text-center p-4 bg-blue-50 rounded-lg">
                            <p className="text-2xl font-bold text-blue-600">
                              {testData.totalTests}
                            </p>
                            <p className="text-sm text-blue-600">Total Tests</p>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">Code Coverage</h4>
                          <div className="space-y-3">
                            {Object.entries(testData.coverage).map(
                              ([key, value]: [string, any]) => (
                                <div key={key} className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-600 capitalize">{key}</span>
                                    <span className="text-sm font-bold">{value}%</span>
                                  </div>
                                  <Progress value={value} className="h-2" />
                                </div>
                              )
                            )}
                          </div>
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
                      <p className="text-gray-600">Performance metrics will be displayed here</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Response Time: {metricsData.responseTime}ms
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
                        <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
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
                  ) : usersData?.users && usersData.users.length > 0 ? (
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
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {usersData.users.map((userData: any) => (
                              <TableRow key={userData.id}>
                                <TableCell className="font-medium">{userData.username}</TableCell>
                                <TableCell>{userData.email}</TableCell>
                                <TableCell>
                                  <Badge variant={userData.role === 'admin' ? 'default' : 'secondary'}>
                                    {userData.role || 'user'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {userData.subscriptionTier ? (
                                    <Badge
                                      variant={
                                        userData.subscriptionTier === 'lifetime'
                                          ? 'default'
                                          : 'outline'
                                      }
                                    >
                                      {userData.subscriptionTier}
                                    </Badge>
                                  ) : (
                                    <span className="text-sm text-gray-500">Free</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      userData.emailVerified ? 'default' : 'secondary'
                                    }
                                    className={userData.emailVerified ? 'bg-green-100 text-green-800' : ''}
                                  >
                                    {userData.emailVerified ? 'Verified' : 'Unverified'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-gray-500">
                                  {userData.createdAt
                                    ? new Date(userData.createdAt).toLocaleDateString()
                                    : 'N/A'}
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
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination */}
                      {usersData.pagination && (
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-600">
                            Showing {usersData.pagination.offset + 1} to{' '}
                            {Math.min(
                              usersData.pagination.offset + usersData.pagination.limit,
                              usersData.pagination.total
                            )}{' '}
                            of {usersData.pagination.total} users
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                              disabled={usersPage === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setUsersPage((p) => p + 1)}
                              disabled={
                                !usersData.pagination ||
                                usersPage >= Math.ceil(usersData.pagination.total / usersData.pagination.limit)
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
                        {debouncedSearch ? 'No users match your search' : 'No users found'}
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
                          <p className="text-sm font-medium text-gray-500">Username</p>
                          <p className="text-sm">{selectedUser.username}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Email</p>
                          <p className="text-sm">{selectedUser.email}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Role</p>
                          <Badge variant={selectedUser.role === 'admin' ? 'default' : 'secondary'}>
                            {selectedUser.role || 'user'}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Subscription</p>
                          {selectedUser.subscriptionTier ? (
                            <Badge variant="outline">{selectedUser.subscriptionTier}</Badge>
                          ) : (
                            <span className="text-sm text-gray-500">Free</span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Email Verified</p>
                          <Badge
                            variant={selectedUser.emailVerified ? 'default' : 'secondary'}
                            className={selectedUser.emailVerified ? 'bg-green-100 text-green-800' : ''}
                          >
                            {selectedUser.emailVerified ? 'Yes' : 'No'}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Joined</p>
                          <p className="text-sm">
                            {selectedUser.createdAt
                              ? new Date(selectedUser.createdAt).toLocaleDateString()
                              : 'N/A'}
                          </p>
                        </div>
                        {selectedUser.stripeCustomerId && (
                          <div className="col-span-2">
                            <p className="text-sm font-medium text-gray-500">Stripe Customer ID</p>
                            <p className="text-sm font-mono text-xs">{selectedUser.stripeCustomerId}</p>
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
                  {auditLoading || !auditData ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(auditData.compliance).map(([key, value]: [string, any]) => (
                        <div
                          key={key}
                          className={`p-6 rounded-lg ${
                            value
                              ? 'bg-green-50 border-2 border-green-200'
                              : 'bg-gray-50 border-2 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold uppercase">{key}</h3>
                            {value ? (
                              <CheckCircle className="h-6 w-6 text-green-600" />
                            ) : (
                              <XCircle className="h-6 w-6 text-gray-400" />
                            )}
                          </div>
                          <p className={`text-sm ${value ? 'text-green-700' : 'text-gray-600'}`}>
                            {value ? 'Compliant' : 'Not Configured'}
                          </p>
                        </div>
                      ))}
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
          </Tabs>
        </div>
    </AppLayout>
  );
}

// Token Management Tab Component
function TokenManagementTab() {
  const [tokenUserId, setTokenUserId] = useState('');
  const [revokeTokenId, setRevokeTokenId] = useState('');

  const { mutate: issueToken, isPending: issuingToken } = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to issue token');
      return response.json();
    },
    onSuccess: (data) => {
      alert(
        `Token issued!\nAccess Token: ${data.accessToken.substring(0, 20)}...\nRefresh Token: ${data.refreshToken.substring(0, 20)}...`
      );
    },
  });

  const { mutate: revokeToken, isPending: revokingToken } = useMutation({
    mutationFn: async (tokenId: string) => {
      const response = await fetch('/api/auth/token/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokenId, reason: 'Admin revocation' }),
      });
      if (!response.ok) throw new Error('Failed to revoke token');
      return response.json();
    },
    onSuccess: () => {
      alert('Token revoked successfully');
      setRevokeTokenId('');
    },
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
              Generate JWT access and refresh tokens for API access
            </p>
            <Button
              onClick={() => issueToken()}
              disabled={issuingToken}
              data-testid="button-issue-token"
            >
              {issuingToken ? 'Issuing...' : 'Issue Token for Current User'}
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
              {revokingToken ? 'Revoking...' : 'Revoke Token'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Webhook Monitor Tab Component
function WebhookMonitorTab() {
  const [eventId, setEventId] = useState('');

  const { data: dlqData, isLoading: dlqLoading } = useQuery({
    queryKey: ['/api/webhooks/dead-letter'],
  });

  const { mutate: retryWebhook, isPending: retrying } = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/webhooks/${id}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to retry webhook');
      return response.json();
    },
    onSuccess: () => {
      alert('Webhook retry initiated');
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
                <p className="text-sm text-blue-600 font-medium">Dead Letter Queue</p>
                <p className="text-2xl font-bold text-blue-900" data-testid="text-dlq-count">
                  {dlqLoading ? '...' : dlqData?.queue?.length || 0}
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
              {retrying ? 'Retrying...' : 'Retry Webhook'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {dlqData?.queue && dlqData.queue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dead Letter Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="list-dlq-items">
              {dlqData.queue.map((item: unknown, index: number) => (
                <div
                  key={item.id}
                  className="p-3 bg-gray-50 rounded-lg"
                  data-testid={`dlq-item-${index}`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">Event ID: {item.webhookEventId}</p>
                      <p className="text-xs text-gray-600">Attempts: {item.attempts}</p>
                      <p className="text-xs text-red-600">{item.lastError}</p>
                    </div>
                    <Badge variant={item.status === 'queued' ? 'secondary' : 'default'}>
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
  const [level, setLevel] = useState('');
  const [service, setService] = useState('');
  const [limit, setLimit] = useState('100');

  const {
    data: logsData,
    isLoading: logsLoading,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['/api/logs/query', { level, service, limit }],
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
                <option value="">All</option>
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
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
                {logsLoading ? 'Searching...' : 'Search Logs'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {logsData?.logs && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Log Results ({logsData.logs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="list-log-events">
              {logsData.logs.map((log: unknown, index: number) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg text-sm ${
                    log.level === 'error' || log.level === 'critical'
                      ? 'bg-red-50 border-l-4 border-red-500'
                      : log.level === 'warn'
                        ? 'bg-yellow-50 border-l-4 border-yellow-500'
                        : 'bg-gray-50 border-l-4 border-gray-300'
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
