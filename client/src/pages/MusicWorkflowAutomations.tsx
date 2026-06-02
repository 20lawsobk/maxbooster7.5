import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { CustomWorkflowTab } from "@/components/automations/CustomWorkflowBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Zap,
  Play,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Settings2,
  Activity,
  TrendingUp,
  Calendar,
  BarChart3,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ConfigField {
  label: string;
  type: "boolean" | "string" | "number" | "select";
  default: Record<string, unknown>;
  options?: string[];
  description?: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  phase: string;
  icon: string;
  trigger: { event: string; description: string };
  configSchema: Record<string, ConfigField>;
  defaultConfig: Record<string, any>;
  enabledByDefault: boolean;
  enabled: boolean;
  config: Record<string, any>;
}

interface ExecutionLog {
  id: string;
  templateId: string;
  eventType: string;
  status: string;
  result: Record<string, unknown>;
  error: string | null;
  executedAt: string;
}

interface AutomationStats {
  totalTemplates: number;
  enabledCount: number;
  totalRuns: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  lastRunAt: string | null;
  nextScheduledRuns: Array<{ name: string; schedule: string; nextRun: string }>;
}

// ─── Phase metadata ──────────────────────────────────────────────────────────

const PHASES = [
  {
    key: "creation",
    label: "Music Creation",
    description:
      "From the first idea to finished recordings — studio, collaboration, and analysis automations.",
    color: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    dotColor: "bg-purple-500",
  },
  {
    key: "pre-release",
    label: "Pre-Release",
    description:
      "Build momentum before your music drops — countdowns, pre-saves, and distribution alerts.",
    color: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    dotColor: "bg-blue-500",
  },
  {
    key: "release-day",
    label: "Release Day",
    description:
      "Make release day effortless — coordinated social blasts, newsletter, and fan notifications.",
    color: "bg-green-500/10 border-green-500/20 text-green-400",
    dotColor: "bg-green-500",
  },
  {
    key: "post-release",
    label: "Post-Release",
    description:
      "Keep the momentum going — milestone celebrations, analytics digests, and engagement rescue.",
    color: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    dotColor: "bg-amber-500",
  },
  {
    key: "revenue",
    label: "Revenue & Royalties",
    description:
      "Protect your earnings — sales confirmations, royalty audits, sync pitches, and venue follow-ups.",
    color: "bg-rose-500/10 border-rose-500/20 text-rose-400",
    dotColor: "bg-rose-500",
  },
];

// ─── Config editor ──────────────────────────────────────────────────────────

function ConfigEditor({
  schema,
  values,
  onChange,
}: {
  schema: Record<string, ConfigField>;
  values: Record<string, any>;
  onChange: (key: string, value: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      {Object.entries(schema).map(([key, field]) => (
        <div key={key} className="space-y-1">
          {field.type === "boolean" ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">{field.label}</Label>
                {field.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {field.description}
                  </p>
                )}
              </div>
              <Switch
                checked={values[key] ?? field.default}
                onCheckedChange={(v) => onChange(key, v)}
              />
            </div>
          ) : field.type === "select" ? (
            <div className="space-y-1">
              <Label className="text-sm font-medium">{field.label}</Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">
                  {field.description}
                </p>
              )}
              <Select
                value={String(values[key] ?? field.default)}
                onValueChange={(v) => onChange(key, v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : field.type === "number" ? (
            <div className="space-y-1">
              <Label className="text-sm font-medium">{field.label}</Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">
                  {field.description}
                </p>
              )}
              <Input
                type="number"
                className="h-8 text-sm"
                value={values[key] ?? field.default}
                onChange={(e) => onChange(key, Number(e.target.value))}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-sm font-medium">{field.label}</Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">
                  {field.description}
                </p>
              )}
              <Input
                className="h-8 text-sm"
                placeholder={field.description ?? field.label}
                value={values[key] ?? field.default}
                onChange={(e) => onChange(key, e.target.value)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Single automation card ─────────────────────────────────────────────────

function AutomationCard({ automation }: { automation: WorkflowTemplate }) {
  const [expanded, setExpanded] = useState(false);
  const [localConfig, setLocalConfig] = useState<Record<string, any>>(
    automation.config,
  );
  const { toast } = useToast();
  const qc = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      const url = enable
        ? `/api/music-workflow-automations/${automation.id}/enable`
        : `/api/music-workflow-automations/${automation.id}/disable`;
      const body = enable ? { config: localConfig } : undefined;
      const res = await apiRequest("POST", url, body);
      return res.json();
    },
    onSuccess: (_data, enable) => {
      qc.invalidateQueries({ queryKey: ["/api/music-workflow-automations"] });
      qc.invalidateQueries({
        queryKey: ["/api/music-workflow-automations/stats"],
      });
      toast({
        title: enable ? "Automation enabled" : "Automation disabled",
        description: `"${automation.name}" is now ${enable ? "active" : "paused"}.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not update automation.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (config: Record<string, any>) => {
      const res = await apiRequest(
        "PUT",
        `/api/music-workflow-automations/${automation.id}/config`,
        { config },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/music-workflow-automations"] });
      toast({
        title: "Settings saved",
        description: `"${automation.name}" config updated.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not save config.",
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/music-workflow-automations/trigger",
        {
          eventType: automation.trigger.event,
          data: {},
        },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/music-workflow-automations/logs"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/music-workflow-automations/stats"],
      });
      toast({
        title: "Test triggered",
        description: `"${automation.name}" fired. Check Run History.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Test trigger failed.",
        variant: "destructive",
      });
    },
  });

  const hasConfig = Object.keys(automation.configSchema).length > 0;
  const isPending = toggleMutation.isPending || saveMutation.isPending;

  return (
    <Card
      className={`transition-all duration-200 ${automation.enabled ? "border-primary/40 bg-primary/5" : "border-border"}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl flex-shrink-0 mt-0.5">
              {automation.icon}
            </span>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold leading-snug">
                {automation.name}
              </CardTitle>
              <CardDescription className="text-xs mt-1 leading-relaxed">
                {automation.description}
              </CardDescription>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs py-0 h-5 gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {automation.trigger.description}
                </Badge>
                {automation.enabled && (
                  <Badge className="text-xs py-0 h-5 bg-green-500/20 text-green-600 border-green-500/30 hover:bg-green-500/20">
                    Active
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              title="Test run"
            >
              {testMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </Button>
            <Switch
              checked={automation.enabled}
              onCheckedChange={(v) => toggleMutation.mutate(v)}
              disabled={isPending}
            />
          </div>
        </div>
      </CardHeader>

      {hasConfig && (
        <>
          <Separator />
          <CardContent className="pt-3 pb-3">
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
              onClick={() => setExpanded((v) => !v)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configure options
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5 ml-auto" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-auto" />
              )}
            </button>

            {expanded && (
              <div className="mt-4 space-y-4">
                <ConfigEditor
                  schema={automation.configSchema}
                  values={localConfig}
                  onChange={(k, v) =>
                    setLocalConfig((prev) => ({ ...prev, [k]: v }))
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => saveMutation.mutate(localConfig)}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  Save settings
                </Button>
              </div>
            )}
          </CardContent>
        </>
      )}
    </Card>
  );
}

// ─── Stats cards ────────────────────────────────────────────────────────────

function StatsBar({
  stats,
  isLoading,
}: {
  stats?: AutomationStats;
  isLoading: boolean;
}) {
  const cards = [
    {
      label: "Active Automations",
      value: isLoading
        ? "—"
        : `${stats?.enabledCount ?? 0} / ${stats?.totalTemplates ?? 0}`,
      icon: <Zap className="h-4 w-4 text-primary" />,
      sub: "automations running",
    },
    {
      label: "Total Runs",
      value: isLoading ? "—" : (stats?.totalRuns ?? 0).toLocaleString(),
      icon: <Activity className="h-4 w-4 text-blue-500" />,
      sub: "events processed",
    },
    {
      label: "Success Rate",
      value: isLoading ? "—" : `${stats?.successRate ?? 100}%`,
      icon: <TrendingUp className="h-4 w-4 text-green-500" />,
      sub: `${stats?.successCount ?? 0} succeeded · ${stats?.failedCount ?? 0} failed`,
    },
    {
      label: "Last Run",
      value: isLoading
        ? "—"
        : stats?.lastRunAt
          ? new Date(stats.lastRunAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          : "Never",
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      sub: stats?.lastRunAt
        ? new Date(stats.lastRunAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Enable automations to start",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="flex items-center gap-2 mb-1">
            {c.icon}
            <span className="text-xs text-muted-foreground font-medium">
              {c.label}
            </span>
          </div>
          <div className="text-2xl font-bold">{c.value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{c.sub}</div>
        </Card>
      ))}
    </div>
  );
}

// ─── Overview tab ───────────────────────────────────────────────────────────

function OverviewTab({
  automations,
  stats,
}: {
  automations: WorkflowTemplate[];
  stats?: AutomationStats;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const enableAllMutation = useMutation({
    mutationFn: async () => {
      const disabled = automations.filter((a) => !a.enabled);
      for (const a of disabled) {
        const res = await apiRequest(
          "POST",
          `/api/music-workflow-automations/${a.id}/enable`,
          { config: a.config },
        );
        await res.json();
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/music-workflow-automations"] });
      qc.invalidateQueries({
        queryKey: ["/api/music-workflow-automations/stats"],
      });
      toast({
        title: "All automations enabled",
        description: "Your full automation suite is now active.",
      });
    },
  });

  const phaseStats = PHASES.map((p) => {
    const total = automations.filter((a) => a.phase === p.key).length;
    const enabled = automations.filter(
      (a) => a.phase === p.key && a.enabled,
    ).length;
    return { ...p, total, enabled };
  });

  return (
    <div className="space-y-6">
      {automations.length > 0 &&
        automations.filter((a) => !a.enabled).length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="font-semibold text-sm">
                  You have {automations.filter((a) => !a.enabled).length}{" "}
                  automations ready to activate
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enable them all at once, or turn on only what you need from
                  the Automations tab.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => enableAllMutation.mutate()}
                disabled={enableAllMutation.isPending}
              >
                {enableAllMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Zap className="h-3 w-3 mr-1" />
                )}
                Enable All
              </Button>
            </CardContent>
          </Card>
        )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {phaseStats.map((p) => (
          <Card key={p.key} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`h-2 w-2 rounded-full ${p.dotColor}`} />
              <span className="font-semibold text-sm">{p.label}</span>
              <Badge variant="outline" className="ml-auto text-xs py-0 h-5">
                {p.enabled}/{p.total} active
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {p.description}
            </p>
            <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${p.dotColor} transition-all`}
                style={{
                  width: p.total > 0 ? `${(p.enabled / p.total) * 100}%` : "0%",
                }}
              />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            How Automations Work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              step: "1",
              title: "An event happens in Max Booster",
              desc: "You upload a track, set a release date, hit a streaming milestone, or make a sale.",
            },
            {
              step: "2",
              title: "Enabled automations fire instantly",
              desc: "Any automation listening for that event executes its actions automatically.",
            },
            {
              step: "3",
              title: "You get notified",
              desc: "A push notification confirms what ran. Check Run History for full logs.",
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Run history tab ─────────────────────────────────────────────────────────

function RunHistoryTab({
  templateNameMap,
}: {
  templateNameMap: Record<string, string>;
}) {
  const { data, isLoading, refetch, isFetching } = useQuery<{
    logs: ExecutionLog[];
  }>({
    queryKey: ["/api/music-workflow-automations/logs"],
    refetchInterval: 30000,
  });

  const logs = data?.logs ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading run history...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No automation runs yet</p>
        <p className="text-xs mt-1">
          Enable automations and use the test run button to see logs here.
        </p>
      </div>
    );
  }

  const successCount = logs.filter((l) => l.status === "success").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            {successCount} succeeded
          </span>
          {failedCount > 0 && (
            <span className="flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              {failedCount} failed
            </span>
          )}
          <span>{logs.length} total</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <ScrollArea className="h-[520px]">
        <div className="space-y-2 pr-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card text-sm"
            >
              {log.status === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
              ) : log.status === "failed" ? (
                <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {templateNameMap[log.templateId] ?? log.templateId}
                  </span>
                  <Badge
                    variant={
                      log.status === "success" ? "default" : "destructive"
                    }
                    className="text-xs py-0 h-4"
                  >
                    {log.status}
                  </Badge>
                  <span className="text-muted-foreground text-xs ml-auto whitespace-nowrap">
                    {new Date(log.executedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Trigger: <span className="font-mono">{log.eventType}</span>
                </p>
                {log.error && (
                  <p className="text-xs text-destructive mt-1">{log.error}</p>
                )}
                {log.result &&
                  typeof log.result === "object" &&
                  Array.isArray(
                    (log.result as Record<string, unknown>).actions,
                  ) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Actions:{" "}
                      {(
                        (log.result as Record<string, unknown>)
                          .actions as string[]
                      ).join(" · ")}
                    </p>
                  )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Schedule tab ────────────────────────────────────────────────────────────

function ScheduleTab({
  automations,
  stats,
}: {
  automations: WorkflowTemplate[];
  stats?: AutomationStats;
}) {
  const scheduledAutomations = automations.filter((a) =>
    a.trigger.event.startsWith("schedule:"),
  );
  const eventTriggered = automations.filter(
    (a) => !a.trigger.event.startsWith("schedule:"),
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Scheduled Automations
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          These automations run automatically on a fixed schedule — no action
          needed from you.
        </p>

        {scheduledAutomations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            <Calendar className="h-6 w-6 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No scheduled automations enabled yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stats?.nextScheduledRuns?.map((run) => {
              const match = scheduledAutomations.find(
                (a) => a.name === run.name,
              );
              return (
                <Card
                  key={run.name}
                  className={`p-4 ${match?.enabled ? "border-primary/30 bg-primary/5" : "opacity-60"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{run.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {run.schedule}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">Next run</p>
                      <p className="text-sm font-semibold">
                        {new Date(run.nextRun).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(run.nextRun).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  {!match?.enabled && (
                    <p className="text-xs text-amber-500 mt-2">
                      Disabled — enable this automation to activate its schedule
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Event-Triggered Automations
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          These fire instantly when a specific action happens in Max Booster —
          upload, release, sale, etc.
        </p>

        <div className="space-y-2">
          {eventTriggered.map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${a.enabled ? "" : "opacity-50"}`}
            >
              <span className="text-lg">{a.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm leading-tight">{a.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <ArrowRight className="h-2.5 w-2.5" />
                  {a.trigger.description}
                </p>
              </div>
              <Badge
                variant={a.enabled ? "default" : "outline"}
                className="text-xs py-0 h-5 flex-shrink-0"
              >
                {a.enabled ? "Active" : "Off"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MusicWorkflowAutomations() {
  const { data: automationsData, isLoading: automationsLoading } = useQuery<{
    automations: WorkflowTemplate[];
  }>({
    queryKey: ["/api/music-workflow-automations"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<AutomationStats>({
    queryKey: ["/api/music-workflow-automations/stats"],
    refetchInterval: 30000,
  });

  const automations = automationsData?.automations ?? [];

  const templateNameMap: Record<string, string> = Object.fromEntries(
    automations.map((a) => [a.id, a.name]),
  );

  const automationsByPhase = (phase: string) =>
    automations.filter((a) => a.phase === phase);

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Workflow Automations</h1>
              <p className="text-muted-foreground text-sm">
                From first recording to first stream — automate your entire
                music career.
              </p>
            </div>
          </div>
        </div>

        <StatsBar stats={stats} isLoading={statsLoading} />

        {automationsLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading your automations...
          </div>
        ) : (
          <Tabs defaultValue="overview">
            <TabsList className="mb-6 flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="automations">Automations</TabsTrigger>
              <TabsTrigger value="history">Run History</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab automations={automations} stats={stats} />
            </TabsContent>

            <TabsContent value="automations" className="space-y-10">
              {PHASES.map((phase) => {
                const phaseAutomations = automationsByPhase(phase.key);
                if (phaseAutomations.length === 0) return null;
                return (
                  <section key={phase.key}>
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-2 ${phase.color}`}
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${phase.dotColor}`}
                      />
                      {phase.label}
                      <span className="opacity-60">
                        · {phaseAutomations.filter((a) => a.enabled).length}/
                        {phaseAutomations.length} active
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {phase.description}
                    </p>
                    <div className="space-y-3">
                      {phaseAutomations.map((automation) => (
                        <AutomationCard
                          key={automation.id}
                          automation={automation}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </TabsContent>

            <TabsContent value="history">
              <RunHistoryTab templateNameMap={templateNameMap} />
            </TabsContent>

            <TabsContent value="schedule">
              <ScheduleTab automations={automations} stats={stats} />
            </TabsContent>

            <TabsContent value="custom">
              <CustomWorkflowTab />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
