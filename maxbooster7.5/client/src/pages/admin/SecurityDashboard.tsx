import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRequireAdmin } from '@/hooks/useRequireAuth';
import {
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Clock,
  TrendingUp,
  Target,
  Loader2,
  AlertCircle,
  RefreshCw,
  Download,
  Server,
  Users,
  Lock,
} from 'lucide-react';

interface SecurityMetrics {
  systemHealth: {
    uptime: number;
    status: 'healthy' | 'degraded' | 'critical';
    errorRate: number;
    requestsPerMinute: number;
  };
  authentication: {
    totalLogins: number;
    failedLogins: number;
    successRate: number;
    activeSessions: number;
  };
  threats: {
    blockedAttempts: number;
    suspiciousActivity: number;
    rateLimit: number;
  };
}

interface BehavioralAlert {
  id: string;
  userId: string;
  username: string;
  type: 'unusual_activity' | 'multiple_failed_logins';
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  description: string;
  resolved: boolean;
}

interface BehavioralAlertsResponse {
  alerts: BehavioralAlert[];
}

interface Anomaly {
  type: 'traffic_spike' | 'auth_pattern';
  timestamp: string;
  metric: string;
  expectedValue: number;
  actualValue: number;
  severity: 'high' | 'medium';
  description: string;
}

interface AnomaliesResponse {
  anomalies: Anomaly[];
}

interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  status: 'open';
  detectedDate: string;
}

interface PenTestResponse {
  lastScan: string;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    passed: number;
  };
  vulnerabilities: Vulnerability[];
  recommendations: string[];
}

export default function SecurityDashboard() {
  const { user, isLoading: authLoading } = useRequireAdmin();
  const [refreshInterval, setRefreshInterval] = useState(30000);

  const {
    data: securityMetrics,
    isLoading: loadingMetrics,
    error: metricsError,
    refetch: refetchMetrics,
  } = useQuery<SecurityMetrics>({
    queryKey: ['/api/security/metrics'],
    queryFn: async () => {
      const response = await fetch('/api/security/metrics', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch security metrics');
      return response.json();
    },
    refetchInterval: refreshInterval,
  });

  const {
    data: behavioralAlertsData,
    isLoading: loadingAlerts,
    error: alertsError,
  } = useQuery<BehavioralAlertsResponse>({
    queryKey: ['/api/security/behavioral-alerts'],
    queryFn: async () => {
      const response = await fetch('/api/security/behavioral-alerts', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch behavioral alerts');
      return response.json();
    },
    refetchInterval: refreshInterval,
  });

  const {
    data: anomaliesData,
    isLoading: loadingAnomalies,
    error: anomaliesError,
  } = useQuery<AnomaliesResponse>({
    queryKey: ['/api/security/anomaly-detection'],
    queryFn: async () => {
      const response = await fetch('/api/security/anomaly-detection', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to detect anomalies');
      return response.json();
    },
    refetchInterval: refreshInterval,
  });

  const {
    data: penTestData,
    isLoading: loadingPenTest,
    error: penTestError,
  } = useQuery<PenTestResponse>({
    queryKey: ['/api/security/pentest-results'],
    queryFn: async () => {
      const response = await fetch('/api/security/pentest-results', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch pentest results');
      return response.json();
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'degraded':
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-muted-foreground">Loading Security Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') return null;

  return (
    <AppLayout title="Security Dashboard" subtitle="Real-time security monitoring and threat intelligence">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="w-8 h-8 text-red-600" />
              Security Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Real-time security monitoring and threat intelligence
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              <Activity className="w-3 h-3 mr-1 animate-pulse text-green-600" />
              Live Monitoring
            </Badge>
            <Button variant="outline" size="sm" onClick={() => refetchMetrics()}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {metricsError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Failed to load security metrics. Please try again.</AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loadingMetrics ? (
              <div className="col-span-full text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading metrics...</p>
              </div>
            ) : (
              securityMetrics && (
                <>
                  <Card
                    className={`border-l-4 ${getStatusColor(securityMetrics.systemHealth.status)}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Server className="w-4 h-4" />
                          System Uptime
                        </h3>
                        {securityMetrics.systemHealth.status === 'healthy' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : securityMetrics.systemHealth.status === 'degraded' ? (
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-bold">
                          {formatUptime(securityMetrics.systemHealth.uptime)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Status: {securityMetrics.systemHealth.status}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-blue-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Active Sessions
                        </h3>
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-bold">
                          {securityMetrics.authentication.activeSessions}
                        </p>
                        <p className="text-sm text-muted-foreground">users</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-green-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Lock className="w-4 h-4" />
                          Login Success Rate
                        </h3>
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-bold">
                          {securityMetrics.authentication.successRate.toFixed(1)}
                        </p>
                        <p className="text-sm text-muted-foreground">%</p>
                      </div>
                      <Progress
                        value={securityMetrics.authentication.successRate}
                        className="h-2 mt-2"
                      />
                    </CardContent>
                  </Card>

                  <Card
                    className={`border-l-4 ${securityMetrics.authentication.failedLogins > 10 ? 'border-l-yellow-500' : 'border-l-green-200'}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Failed Login Attempts (24h)
                        </h3>
                        {securityMetrics.authentication.failedLogins > 10 ? (
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-bold">
                          {securityMetrics.authentication.failedLogins}
                        </p>
                        <p className="text-sm text-muted-foreground">attempts</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-blue-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Total Logins (24h)
                        </h3>
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-bold">
                          {securityMetrics.authentication.totalLogins}
                        </p>
                        <p className="text-sm text-muted-foreground">logins</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className={`border-l-4 ${securityMetrics.threats.suspiciousActivity > 5 ? 'border-l-red-500' : 'border-l-green-200'}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Suspicious Activity
                        </h3>
                        {securityMetrics.threats.suspiciousActivity > 5 ? (
                          <XCircle className="w-4 h-4 text-red-600" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-bold">
                          {securityMetrics.threats.suspiciousActivity}
                        </p>
                        <p className="text-sm text-muted-foreground">events</p>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )
            )}
          </div>
        )}

        <Tabs defaultValue="alerts" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="alerts">
              <AlertCircle className="w-4 h-4 mr-1" />
              Behavioral Alerts
            </TabsTrigger>
            <TabsTrigger value="anomalies">
              <Eye className="w-4 h-4 mr-1" />
              Anomalies
            </TabsTrigger>
            <TabsTrigger value="pentest">
              <Target className="w-4 h-4 mr-1" />
              Security Assessment
            </TabsTrigger>
          </TabsList>

          <TabsContent value="alerts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Behavioral Analytics Alerts</CardTitle>
                <CardDescription>AI-detected unusual user behavior patterns</CardDescription>
              </CardHeader>
              <CardContent>
                {alertsError ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Failed to load behavioral alerts. Please try again.
                    </AlertDescription>
                  </Alert>
                ) : loadingAlerts ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Analyzing behavior...</p>
                  </div>
                ) : behavioralAlertsData && behavioralAlertsData.alerts.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                    <p className="text-lg font-semibold">No Security Alerts</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      System is operating normally with no unusual behavior detected
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {behavioralAlertsData?.alerts.map((alert) => (
                      <Alert
                        key={alert.id}
                        variant={alert.severity === 'high' ? 'destructive' : 'default'}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant={getSeverityBadge(alert.severity)}>
                                  {alert.severity}
                                </Badge>
                                <h4 className="font-semibold capitalize">
                                  {alert.type.replace('_', ' ')}
                                </h4>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                User: {alert.username} (ID: {alert.userId})
                              </p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {formatTimestamp(alert.timestamp)}
                            </div>
                          </div>

                          <p className="text-sm">{alert.description}</p>

                          {alert.resolved ? (
                            <Alert variant="default" className="bg-green-50">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <AlertDescription>
                                <span className="font-medium">Status: </span>
                                Resolved
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline">
                                Investigate
                              </Button>
                              <Button size="sm" variant="ghost">
                                Mark as Resolved
                              </Button>
                            </div>
                          )}
                        </div>
                      </Alert>
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
                <CardDescription>Real-time threat detection and pattern analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {anomaliesError ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Failed to load anomaly detection data. Please try again.
                    </AlertDescription>
                  </Alert>
                ) : loadingAnomalies ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Scanning for anomalies...</p>
                  </div>
                ) : anomaliesData && anomaliesData.anomalies.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                    <p className="text-lg font-semibold">No Anomalies Detected</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      All system metrics are within normal parameters
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {anomaliesData?.anomalies.map((anomaly, index) => (
                      <Alert
                        key={`${anomaly.type}-${index}`}
                        variant={anomaly.severity === 'high' ? 'destructive' : 'default'}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className="w-4 h-4" />
                                <h4 className="font-semibold capitalize">
                                  {anomaly.type.replace('_', ' ')}
                                </h4>
                                <Badge variant={getSeverityBadge(anomaly.severity)}>
                                  {anomaly.severity}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                <Clock className="w-3 h-3 inline mr-1" />
                                Detected {formatTimestamp(anomaly.timestamp)}
                              </p>
                            </div>
                          </div>

                          <p className="text-sm">{anomaly.description}</p>

                          <div className="grid grid-cols-2 gap-3 text-sm bg-white/50 dark:bg-gray-800/50 p-3 rounded">
                            <div>
                              <p className="text-xs font-medium mb-1">Metric:</p>
                              <p className="font-mono text-xs">{anomaly.metric}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium mb-1">Expected vs Actual:</p>
                              <p className="font-mono text-xs">
                                {anomaly.expectedValue} → {anomaly.actualValue}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pentest" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Security Assessment Results</CardTitle>
                    <CardDescription>
                      Latest security scan and vulnerability assessment
                      {penTestData && (
                        <span className="ml-2 text-xs">
                          Last scan: {formatTimestamp(penTestData.lastScan)}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4 mr-1" />
                    Export Report
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {penTestError ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Failed to load security assessment results. Please try again.
                    </AlertDescription>
                  </Alert>
                ) : loadingPenTest ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading assessment results...</p>
                  </div>
                ) : (
                  penTestData && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <Card className="border-l-4 border-l-red-500">
                          <CardContent className="p-3">
                            <p className="text-xs text-muted-foreground">Critical</p>
                            <p className="text-2xl font-bold text-red-600">
                              {penTestData.summary.critical}
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border-l-4 border-l-orange-500">
                          <CardContent className="p-3">
                            <p className="text-xs text-muted-foreground">High</p>
                            <p className="text-2xl font-bold text-orange-600">
                              {penTestData.summary.high}
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border-l-4 border-l-yellow-500">
                          <CardContent className="p-3">
                            <p className="text-xs text-muted-foreground">Medium</p>
                            <p className="text-2xl font-bold text-yellow-600">
                              {penTestData.summary.medium}
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border-l-4 border-l-blue-500">
                          <CardContent className="p-3">
                            <p className="text-xs text-muted-foreground">Low</p>
                            <p className="text-2xl font-bold text-blue-600">
                              {penTestData.summary.low}
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border-l-4 border-l-green-500">
                          <CardContent className="p-3">
                            <p className="text-xs text-muted-foreground">Passed</p>
                            <p className="text-2xl font-bold text-green-600">
                              {penTestData.summary.passed}
                            </p>
                          </CardContent>
                        </Card>
                      </div>

                      {penTestData.vulnerabilities.length === 0 ? (
                        <div className="text-center py-12">
                          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                          <p className="text-lg font-semibold">No Vulnerabilities Detected</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Your system passed all security checks
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {penTestData.vulnerabilities.map((vuln) => (
                            <Card
                              key={vuln.id}
                              className={`border-l-4 ${
                                vuln.severity === 'critical'
                                  ? 'border-l-red-500'
                                  : vuln.severity === 'high'
                                    ? 'border-l-orange-500'
                                    : vuln.severity === 'medium'
                                      ? 'border-l-yellow-500'
                                      : 'border-l-blue-500'
                              }`}
                            >
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="outline">{vuln.category}</Badge>
                                      <Badge variant={getSeverityBadge(vuln.severity)}>
                                        {vuln.severity}
                                      </Badge>
                                      <Badge variant="outline">{vuln.status}</Badge>
                                    </div>
                                    <h4 className="font-semibold">{vuln.description}</h4>
                                  </div>
                                  <div className="text-right text-xs text-muted-foreground">
                                    {formatTimestamp(vuln.detectedDate)}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}

                      {penTestData.recommendations.length > 0 && (
                        <div className="mt-6">
                          <h4 className="font-semibold mb-3">Recommendations</h4>
                          <div className="space-y-2">
                            {penTestData.recommendations.map((rec, index) => (
                              <Alert
                                key={index}
                                variant="default"
                                className="bg-blue-50 dark:bg-blue-950"
                              >
                                <Target className="h-4 w-4 text-blue-600" />
                                <AlertDescription>{rec}</AlertDescription>
                              </Alert>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
