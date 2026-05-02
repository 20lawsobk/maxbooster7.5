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
  Radio, Globe, Music, BarChart3, PowerOff, Power, Loader2,
  Wrench, Bug, HeartPulse, Server, Timer,
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

  const { data: status, isLoading: statusLoading } = useQuery<Record<string, unknown>>({
    queryKey: updatesKey,
    refetchInterval: 30000,
  });
  const { data: changesData } = useQuery<Record<string, unknown>>({ queryKey: changesKey });
  const { data: upgradesData } = useQuery<Record<string, unknown>>({ queryKey: upgradesKey });
  const { data: securityMetrics } = useQuery<Record<string, unknown>>({ queryKey: securityMetricsKey });
  const { data: securityThreats } = useQuery<Record<string, unknown>>({ queryKey: securityThreatsKey });
  const { data: autopilotStatus } = useQuery<Record<string, unknown>>({ queryKey: autopilotKey });
  const { data: autonomousStatus } = useQuery<Record<string, unknown>>({ queryKey: autonomousKey });

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

  const chainFixerKey = ['/api/admin/chain-fixer/status'];
  const platformFixerKey = ['/api/admin/platform-fixer/status'];
  const selfHealingStatusKey = ['/api/security/self-healing/status'];
  const selfHealingMetricsKey = ['/api/security/self-healing/metrics'];

  const { data: chainFixerStatus, refetch: refetchChainFixer } = useQuery<Record<string, unknown>>({
    queryKey: chainFixerKey,
    refetchInterval: 15000,
    enabled: !!user,
  });
  const { data: platformFixerStatus, refetch: refetchPlatformFixer } = useQuery<Record<string, unknown>>({
    queryKey: platformFixerKey,
    refetchInterval: 15000,
    enabled: !!user,
  });
  const { data: selfHealingStatusData } = useQuery<Record<string, unknown>>({
    queryKey: selfHealingStatusKey,
    refetchInterval: 10000,
    enabled: !!user,
  });
  const { data: selfHealingMetricsData } = useQuery<Record<string, unknown>>({
    queryKey: selfHealingMetricsKey,
    refetchInterval: 10000,
    enabled: !!user,
  });

  const forceChainCheck = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/admin/chain-fixer/force-check', { message: 'Admin forced health check' })).json(),
    onSuccess: () => { toast({ title: 'Health check complete' }); refetchChainFixer(); },
    onError: () => toast({ title: 'Health check failed', variant: 'destructive' }),
  });

  const forcePlatformScan = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/admin/platform-fixer/scan')).json(),
    onSuccess: () => { toast({ title: 'Platform scan triggered' }); refetchPlatformFixer(); },
    onError: () => toast({ title: 'Scan failed', variant: 'destructive' }),
  });

  const killSwitchKey = ['/api/kill-switch/status'];
  const { data: killSwitchData, refetch: refetchKillSwitch } = useQuery<Record<string, unknown>>({
    queryKey: killSwitchKey,
    refetchInterval: 30000,
  });

  const killAll = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/kill-switch/kill-all', { reason: 'Admin emergency stop' })).json(),
    onSuccess: () => { toast({ title: 'All autonomous systems halted', variant: 'destructive' }); refetchKillSwitch(); },
    onError: () => toast({ title: 'Kill switch failed', variant: 'destructive' }),
  });

  const resumeAll = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/kill-switch/resume-all', { reason: 'Admin resume' })).json(),
    onSuccess: () => { toast({ title: 'All autonomous systems resumed' }); refetchKillSwitch(); },
    onError: () => toast({ title: 'Resume failed', variant: 'destructive' }),
  });

  const killSystem = useMutation({
    mutationFn: async (system: string) => (await apiRequest('POST', `/api/kill-switch/kill/${system}`, { reason: 'Admin individual stop' })).json(),
    onSuccess: (_, system) => { toast({ title: `${system} halted` }); refetchKillSwitch(); },
  });

  const resumeSystem = useMutation({
    mutationFn: async (system: string) => (await apiRequest('POST', `/api/kill-switch/resume/${system}`, { reason: 'Admin individual resume' })).json(),
    onSuccess: (_, system) => { toast({ title: `${system} resumed` }); refetchKillSwitch(); },
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
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Initializing autonomy controls…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isRunning = status?.isRunning ?? false;
  const safetyStatus = status?.safety;
  const recentChanges: Record<string, unknown>[] = status?.recentChanges ?? [];
  const recentUpgrades: Record<string, unknown>[] = status?.recentUpgrades ?? [];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Admin Autonomy" />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Emergency Kill Switch */}
          {(() => {
            const ksData = killSwitchData?.data ?? killSwitchData ?? {};
            const globalKilled: boolean = ksData.globalKilled ?? false;
            const systemStates: Record<string, boolean> = ksData.systemStates ?? {};
            const auditLog: Record<string, unknown>[] = ksData.auditLog ?? [];
            const registeredSystems = Object.keys(systemStates);
            return (
              <Card className={`border-2 ${globalKilled ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-green-200 dark:border-green-900'}`}>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${globalKilled ? 'bg-red-100' : 'bg-green-100'}`}>
                        {globalKilled
                          ? <PowerOff className="w-6 h-6 text-red-600 animate-pulse" />
                          : <Power className="w-6 h-6 text-green-600" />}
                      </div>
                      <div>
                        <CardTitle className="text-lg">Emergency Kill Switch</CardTitle>
                        <CardDescription>Instantly halt or resume all 9 autonomous systems</CardDescription>
                      </div>
                    </div>
                    <Badge className={globalKilled ? 'bg-red-600 text-white text-sm px-3 py-1' : 'bg-green-600 text-white text-sm px-3 py-1'}>
                      {globalKilled ? 'ALL SYSTEMS HALTED' : 'ALL SYSTEMS ACTIVE'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3 flex-wrap">
                    <Button
                      variant="destructive"
                      onClick={() => killAll.mutate()}
                      disabled={globalKilled || killAll.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <PowerOff className="w-4 h-4 mr-2" />
                      {killAll.isPending ? 'Halting…' : 'Kill All Systems'}
                    </Button>
                    <Button
                      onClick={() => resumeAll.mutate()}
                      disabled={!globalKilled || resumeAll.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Power className="w-4 h-4 mr-2" />
                      {resumeAll.isPending ? 'Resuming…' : 'Resume All Systems'}
                    </Button>
                  </div>

                  {registeredSystems.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No systems registered yet — server will populate on restart.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {registeredSystems.map((sys) => {
                        const killed: boolean = systemStates[sys];
                        return (
                          <div key={sys} className={`flex items-center justify-between p-2 rounded-lg border text-xs ${killed ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${killed ? 'bg-red-500' : 'bg-green-500'}`} />
                              <span className="truncate font-medium capitalize">{sys.replace(/-/g, ' ')}</span>
                            </div>
                            <div className="flex gap-1 ml-1 shrink-0">
                              {!killed ? (
                                <button
                                  onClick={() => killSystem.mutate(sys)}
                                  className="text-red-600 hover:text-red-800 text-xs px-1.5 py-0.5 border border-red-200 rounded hover:bg-red-50"
                                >
                                  Stop
                                </button>
                              ) : (
                                <button
                                  onClick={() => resumeSystem.mutate(sys)}
                                  className="text-green-700 hover:text-green-900 text-xs px-1.5 py-0.5 border border-green-200 rounded hover:bg-green-50"
                                >
                                  Start
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {auditLog.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Recent Audit Log</p>
                      <ScrollArea className="h-24">
                        <div className="space-y-1 pr-1">
                          {[...auditLog].reverse().slice(0, 10).map((entry: Record<string, unknown>, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className={`font-medium shrink-0 ${entry.action.includes('KILL') ? 'text-red-600' : 'text-green-700'}`}>
                                {entry.action}
                              </span>
                              <span className="truncate">{entry.system ?? 'all'} — {entry.triggeredBy}</span>
                              <span className="shrink-0">{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

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
                      {recentChanges.map((change: Record<string, unknown>) => (
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
                      {recentUpgrades.map((upgrade: Record<string, unknown>) => (
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
                    {(securityThreats ?? []).slice(-5).map((t: Record<string, unknown>, i: number) => (
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

          {/* Self-Healing & Auto-Fixer Systems */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Self-Healing Security Engine */}
            <Card className="border border-emerald-200 dark:border-emerald-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-emerald-600" />
                  Self-Healing Security
                </CardTitle>
                <CardDescription className="text-xs">
                  10× faster than attacks · MTTD &lt;50ms P95
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const healStatus = selfHealingStatusData?.data ?? {};
                  const metrics = selfHealingMetricsData?.data ?? {};
                  const summary = metrics.summary ?? {};
                  const latency = metrics.latencyMetrics ?? {};
                  const isHealing = summary.isHealingFasterThanAttacks ?? false;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Healing speed</span>
                        <Badge className={isHealing ? 'bg-emerald-600 text-white text-xs' : 'bg-yellow-100 text-yellow-700 text-xs'}>
                          {summary.healingSpeedRatio ?? '—'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className="font-semibold text-foreground">{summary.threatsDetected ?? 0}</div>
                          <div className="text-muted-foreground">Detected</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className="font-semibold text-foreground">{summary.threatsBlocked ?? 0}</div>
                          <div className="text-muted-foreground">Blocked</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className="font-semibold text-foreground">{latency.detection?.p95 ?? '—'}</div>
                          <div className="text-muted-foreground">Detect P95</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className="font-semibold text-foreground">{latency.response?.p95 ?? '—'}</div>
                          <div className="text-muted-foreground">Respond P95</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${healStatus.isRunning !== false ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        <span className="text-muted-foreground">
                          {healStatus.isRunning !== false ? 'Active — intercepting all requests' : 'Inactive'}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Blocked IPs: <span className="font-medium text-foreground">{healStatus.blockedIpCount ?? 0}</span>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Chain Error Auto-Fixer */}
            <Card className="border border-orange-200 dark:border-orange-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bug className="w-4 h-4 text-orange-600" />
                  Chain Error Auto-Fixer
                </CardTitle>
                <CardDescription className="text-xs">
                  Reactive · intercepts every log error in real-time
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const cf = chainFixerStatus ?? {};
                  const patterns: Record<string, unknown>[] = cf.patterns ?? [];
                  const history: Record<string, unknown>[] = cf.history ?? [];
                  const active = patterns.filter((p: Record<string, unknown>) => !p.suppressed && p.attempts > 0);
                  const totalFixes = history.length;
                  const successFixes = history.filter((h: Record<string, unknown>) => h.result === 'success').length;
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className="font-semibold text-foreground">{patterns.length}</div>
                          <div className="text-muted-foreground">Patterns</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className="font-semibold text-foreground">{active.length}</div>
                          <div className="text-muted-foreground">Active</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className="font-semibold text-foreground">{totalFixes}</div>
                          <div className="text-muted-foreground">Total Fixes</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className="font-semibold text-emerald-600">{successFixes}</div>
                          <div className="text-muted-foreground">Succeeded</div>
                        </div>
                      </div>
                      {history.length > 0 && (
                        <ScrollArea className="h-20">
                          <div className="space-y-1 pr-1">
                            {[...history].reverse().slice(0, 5).map((h: Record<string, unknown>, i: number) => (
                              <div key={i} className="flex items-center gap-1.5 text-xs">
                                <span className={`shrink-0 ${h.result === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {h.result === 'success' ? '✓' : '✗'}
                                </span>
                                <span className="truncate text-muted-foreground">{h.patternName}</span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => forceChainCheck.mutate()} disabled={forceChainCheck.isPending}>
                        <RefreshCw className={`w-3 h-3 mr-1.5 ${forceChainCheck.isPending ? 'animate-spin' : ''}`} />
                        {forceChainCheck.isPending ? 'Checking…' : 'Force Health Check'}
                      </Button>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Platform Auto-Fixer */}
            <Card className="border border-violet-200 dark:border-violet-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-violet-600" />
                  Platform Auto-Fixer
                </CardTitle>
                <CardDescription className="text-xs">
                  Proactive · probes all subsystems every 30s
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const pf = platformFixerStatus?.data ?? platformFixerStatus ?? {};
                  const subsystems: Record<string, unknown> = (pf.subsystems as Record<string, unknown>) ?? {};
                  const patches: Record<string, unknown>[] = pf.activePatches ?? [];
                  const incidents: Record<string, unknown>[] = pf.incidents ?? [];
                  const subsysNames = Object.keys(subsystems);
                  const degraded = subsysNames.filter(s => subsystems[s]?.status === 'degraded' || subsystems[s]?.status === 'critical');
                  const overallStatus = pf.overallStatus ?? 'unknown';
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Overall health</span>
                        <Badge className={
                          overallStatus === 'healthy' ? 'bg-emerald-100 text-emerald-700 text-xs' :
                          overallStatus === 'degraded' ? 'bg-yellow-100 text-yellow-700 text-xs' :
                          overallStatus === 'critical' ? 'bg-red-100 text-red-700 text-xs' :
                          'bg-gray-100 text-gray-600 text-xs'
                        }>
                          {overallStatus}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className="font-semibold text-foreground">{subsysNames.length}</div>
                          <div className="text-muted-foreground">Subsystems</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className={`font-semibold ${patches.length > 0 ? 'text-violet-600' : 'text-foreground'}`}>{patches.length}</div>
                          <div className="text-muted-foreground">Patches</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                          <div className={`font-semibold ${degraded.length > 0 ? 'text-yellow-600' : 'text-foreground'}`}>{degraded.length}</div>
                          <div className="text-muted-foreground">Degraded</div>
                        </div>
                      </div>
                      {patches.length > 0 && (
                        <ScrollArea className="h-16">
                          <div className="space-y-1 pr-1">
                            {patches.slice(0, 3).map((p: Record<string, unknown>, i: number) => (
                              <div key={i} className="text-xs text-muted-foreground truncate">
                                <span className="text-violet-600 font-medium">patch</span> {p.name ?? p.subsystem}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => forcePlatformScan.mutate()} disabled={forcePlatformScan.isPending}>
                        <Server className={`w-3 h-3 mr-1.5 ${forcePlatformScan.isPending ? 'animate-spin' : ''}`} />
                        {forcePlatformScan.isPending ? 'Scanning…' : 'Force Full Scan'}
                      </Button>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

          </div>
        </main>
      </div>
    </div>
  );
}
