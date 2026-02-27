import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Play, Square, Shield, Cpu, Activity, Zap, TrendingUp,
  AlertTriangle, CheckCircle, Clock, RefreshCw, FlaskConical,
  Radio, Globe, Music, BarChart3,
} from 'lucide-react';

const URGENCY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_COLORS: Record<string, string> = {
  deployed: 'bg-green-100 text-green-700',
  testing: 'bg-blue-100 text-blue-700',
  deploying: 'bg-indigo-100 text-indigo-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  rolled_back: 'bg-gray-100 text-gray-600',
};

const SOURCE_ICON: Record<string, React.ReactNode> = {
  streaming_platform: <Music className="w-3 h-3" />,
  social_media: <Radio className="w-3 h-3" />,
  competitor: <TrendingUp className="w-3 h-3" />,
  technology: <Cpu className="w-3 h-3" />,
  regulation: <Shield className="w-3 h-3" />,
  security: <AlertTriangle className="w-3 h-3" />,
};

export default function AdminAutonomy() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [simRunning, setSimRunning] = useState(false);
  const [simReport, setSimReport] = useState<string | null>(null);

  const updatesKey = ['/api/auto-updates/status'];
  const changesKey = ['/api/auto-updates/changes'];
  const upgradesKey = ['/api/auto-updates/upgrades'];
  const securityMetricsKey = ['/api/security/metrics'];
  const securityThreatsKey = ['/api/security/threats'];
  const autopilotKey = ['/api/autopilot/status'];
  const autonomousKey = ['/api/auto/social/status'];

  const { data: status, isLoading: statusLoading } = useQuery<any>({
    queryKey: updatesKey,
    refetchInterval: 10000,
  });
  const { data: changesData } = useQuery<any>({ queryKey: changesKey });
  const { data: upgradesData } = useQuery<any>({ queryKey: upgradesKey });
  const { data: securityMetrics } = useQuery<any>({ queryKey: securityMetricsKey });
  const { data: securityThreats } = useQuery<any>({ queryKey: securityThreatsKey });
  const { data: autopilotStatus } = useQuery<any>({ queryKey: autopilotKey });
  const { data: autonomousStatus } = useQuery<any>({ queryKey: autonomousKey });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: updatesKey });
    queryClient.invalidateQueries({ queryKey: changesKey });
    queryClient.invalidateQueries({ queryKey: upgradesKey });
  };

  const startEngine = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/auto-updates/start');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.error) {
        toast({ title: 'Cannot auto-start in production', description: data.reason, variant: 'destructive' });
      } else {
        toast({ title: 'Self-Evolution Engine activated', description: data.message });
      }
      invalidateAll();
    },
  });

  const stopEngine = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/auto-updates/stop')).json(),
    onSuccess: () => { toast({ title: 'Engine paused' }); invalidateAll(); },
  });

  const runOnce = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/auto-updates/run-once')).json(),
    onSuccess: (data) => {
      toast({
        title: 'Evolution cycle complete',
        description: `${data.changesDetected} changes detected, ${data.upgradesDeployed} upgrades deployed`,
      });
      invalidateAll();
    },
    onError: () => toast({ title: 'Cycle failed', variant: 'destructive' }),
  });

  const startAutopilot = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/autopilot/start')).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: autopilotKey }),
  });
  const stopAutopilot = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/autopilot/stop')).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: autopilotKey }),
  });
  const startAutonomous = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/auto/social/start', {})).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: autonomousKey }),
  });
  const stopAutonomous = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/auto/social/stop', {})).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: autonomousKey }),
  });

  const runSimulation = async () => {
    setSimRunning(true);
    setSimReport(null);
    try {
      const res = await apiRequest('POST', '/api/auto-updates/simulation');
      const data = await res.json();
      setSimReport(data.report ?? 'Simulation complete.');
      toast({
        title: 'Simulation complete',
        description: `${data.mainResults?.totalScenarios ?? 0} scenarios verified`,
      });
    } catch {
      toast({ title: 'Simulation failed', variant: 'destructive' });
    } finally {
      setSimRunning(false);
    }
  };

  if (authLoading || statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-muted-foreground">Loading Admin Autonomy...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isRunning = status?.isRunning ?? false;
  const safetyStatus = status?.safety;
  const recentChanges: any[] = status?.recentChanges ?? [];
  const recentUpgrades: any[] = status?.recentUpgrades ?? [];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Admin Autonomy" />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Self-Evolution Engine */}
          <Card className="border-2 border-blue-200 dark:border-blue-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${isRunning ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Cpu className={`w-6 h-6 ${isRunning ? 'text-green-600 animate-pulse' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Self-Evolution Engine</CardTitle>
                    <CardDescription>
                      Monitors music industry shifts and autonomously upgrades Max Booster to stay ahead of competitors
                    </CardDescription>
                  </div>
                </div>
                <Badge className={isRunning ? 'bg-green-600 text-white' : ''} variant={isRunning ? 'default' : 'secondary'}>
                  {isRunning ? 'ACTIVE' : 'STANDBY'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <div className="text-2xl font-bold text-blue-700">{status?.changesDetected ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Changes Detected</div>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{status?.upgradesDeployed ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Upgrades Deployed</div>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                  <div className="text-sm font-bold text-purple-700">
                    {status?.lastCycle ? new Date(status.lastCycle).toLocaleDateString() : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Last Cycle</div>
                </div>
              </div>

              {safetyStatus && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border ${safetyStatus.autoEvolutionEnabled ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  {safetyStatus.autoEvolutionEnabled
                    ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span>{safetyStatus.reason}</span>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => startEngine.mutate()}
                  disabled={isRunning || startEngine.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {startEngine.isPending ? 'Starting…' : 'Start Engine'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => stopEngine.mutate()}
                  disabled={!isRunning || stopEngine.isPending}
                >
                  <Square className="w-4 h-4 mr-2" />
                  {stopEngine.isPending ? 'Stopping…' : 'Stop Engine'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => runOnce.mutate()}
                  disabled={runOnce.isPending}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${runOnce.isPending ? 'animate-spin' : ''}`} />
                  {runOnce.isPending ? 'Running cycle…' : 'Run One Cycle Now'}
                </Button>
                <Button variant="outline" onClick={runSimulation} disabled={simRunning}>
                  <FlaskConical className="w-4 h-4 mr-2" />
                  {simRunning ? 'Simulating…' : 'Run Verification Simulation'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Industry changes + upgrade history */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="w-4 h-4 text-blue-600" />
                  Industry Changes Detected
                </CardTitle>
                <CardDescription>Music industry shifts the engine has identified</CardDescription>
              </CardHeader>
              <CardContent>
                {recentChanges.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No changes detected yet. Run a cycle to scan the industry.
                  </p>
                ) : (
                  <ScrollArea className="h-64">
                    <div className="space-y-2 pr-2">
                      {recentChanges.map((change: any) => (
                        <div key={change.id} className="p-3 border rounded-lg text-sm space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-medium min-w-0">
                              {SOURCE_ICON[change.source] ?? <Activity className="w-3 h-3 shrink-0" />}
                              <span className="truncate">{change.title}</span>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${URGENCY_COLORS[change.urgency] ?? 'bg-gray-100 text-gray-600'}`}>
                              {change.urgency}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{change.description}</p>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span>Impact: {change.competitiveImpact}/100</span>
                            <span>·</span>
                            <span>{change.implementationComplexity}</span>
                            <span>·</span>
                            <span>~{change.estimatedImplementationHours}h</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="w-4 h-4 text-green-600" />
                  Upgrade History
                </CardTitle>
                <CardDescription>Code upgrades generated and deployed by the engine</CardDescription>
              </CardHeader>
              <CardContent>
                {recentUpgrades.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No upgrades deployed yet.
                  </p>
                ) : (
                  <ScrollArea className="h-64">
                    <div className="space-y-2 pr-2">
                      {recentUpgrades.map((upgrade: any) => (
                        <div key={upgrade.id} className="p-3 border rounded-lg text-sm space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium capitalize">{upgrade.type?.replace(/_/g, ' ')}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[upgrade.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {upgrade.status}
                            </span>
                          </div>
                          {upgrade.targetFiles?.length > 0 && (
                            <p className="text-xs text-muted-foreground truncate">
                              Files: {upgrade.targetFiles.join(', ')}
                            </p>
                          )}
                          {upgrade.createdAt && (
                            <p className="text-xs text-muted-foreground">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {new Date(upgrade.createdAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Simulation report */}
          {simReport && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="w-4 h-4 text-purple-600" />
                  Verification Simulation Report
                </CardTitle>
                <CardDescription>1-year autonomous upgrade simulation results</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed">
                    {simReport}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Other systems row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  Content Autopilot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={autopilotStatus?.isRunning ? 'default' : 'secondary'}>
                    {autopilotStatus?.isRunning ? 'Running' : 'Stopped'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => startAutopilot.mutate()} disabled={autopilotStatus?.isRunning}>
                    <Play className="w-3 h-3 mr-1" /> Start
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => stopAutopilot.mutate()} disabled={!autopilotStatus?.isRunning}>
                    <Square className="w-3 h-3 mr-1" /> Stop
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Radio className="w-4 h-4 text-pink-600" />
                  Autonomous Social
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={autonomousStatus?.isRunning ? 'default' : 'secondary'}>
                    {autonomousStatus?.isRunning ? 'Running' : 'Stopped'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => startAutonomous.mutate()} disabled={autonomousStatus?.isRunning}>
                    <Play className="w-3 h-3 mr-1" /> Start
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => stopAutonomous.mutate()} disabled={!autonomousStatus?.isRunning}>
                    <Square className="w-3 h-3 mr-1" /> Stop
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-600" />
                  Security Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Score</span>
                  <Badge>{securityMetrics?.securityScore ?? 100}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">Active threats: {securityMetrics?.activeThreats ?? 0}</div>
                <div className="text-xs text-muted-foreground">Total logged: {securityMetrics?.totalThreats ?? 0}</div>
                {(securityThreats ?? []).length > 0 && (
                  <ScrollArea className="h-24 mt-2">
                    {(securityThreats ?? []).slice(-5).map((t: any, i: number) => (
                      <div key={i} className="text-xs p-1.5 border rounded mb-1">
                        <span className="font-medium">{t.type}</span>
                        <span className="text-muted-foreground ml-2">{t.severity}</span>
                      </div>
                    ))}
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

          </div>
        </main>
      </div>
    </div>
  );
}
