import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Zap, Play, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, AlertCircle, Settings2 } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ConfigField {
  label: string;
  type: 'boolean' | 'string' | 'number' | 'select';
  default: any;
  options?: string[];
  description?: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  phase: 'creation' | 'pre-release' | 'release-day' | 'post-release' | 'revenue';
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
  result: any;
  error: string | null;
  executedAt: string;
}

// ─── Phase metadata ─────────────────────────────────────────────────────────

const PHASES: { key: string; label: string; description: string; color: string }[] = [
  {
    key: 'creation',
    label: 'Music Creation',
    description: 'From the first idea to finished recordings — studio, collaboration, and analysis automations.',
    color: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  },
  {
    key: 'pre-release',
    label: 'Pre-Release',
    description: 'Build momentum before your music drops — countdowns, pre-saves, and distribution alerts.',
    color: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  },
  {
    key: 'release-day',
    label: 'Release Day',
    description: 'Make release day effortless — coordinated social blasts, newsletters, and fan notifications.',
    color: 'bg-green-500/10 border-green-500/20 text-green-400',
  },
  {
    key: 'post-release',
    label: 'Post-Release',
    description: 'Keep the momentum going — milestone celebrations, analytics digests, and engagement rescue.',
    color: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  },
  {
    key: 'revenue',
    label: 'Revenue & Royalties',
    description: 'Protect your earnings — automated sale confirmations and monthly royalty audits.',
    color: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
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
  onChange: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4">
      {Object.entries(schema).map(([key, field]) => (
        <div key={key} className="space-y-1">
          {field.type === 'boolean' ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">{field.label}</Label>
                {field.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                )}
              </div>
              <Switch
                checked={values[key] ?? field.default}
                onCheckedChange={(v) => onChange(key, v)}
              />
            </div>
          ) : field.type === 'select' ? (
            <div className="space-y-1">
              <Label className="text-sm font-medium">{field.label}</Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
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
          ) : field.type === 'number' ? (
            <div className="space-y-1">
              <Label className="text-sm font-medium">{field.label}</Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
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
                <p className="text-xs text-muted-foreground">{field.description}</p>
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

// ─── Single automation card ──────────────────────────────────────────────────

function AutomationCard({ automation }: { automation: WorkflowTemplate }) {
  const [expanded, setExpanded] = useState(false);
  const [localConfig, setLocalConfig] = useState<Record<string, any>>(automation.config);
  const { toast } = useToast();
  const qc = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: (enable: boolean) =>
      apiRequest(
        enable
          ? `/api/music-workflow-automations/${automation.id}/enable`
          : `/api/music-workflow-automations/${automation.id}/disable`,
        { method: 'POST', body: enable ? JSON.stringify({ config: localConfig }) : undefined }
      ),
    onSuccess: (_data, enable) => {
      qc.invalidateQueries({ queryKey: ['/api/music-workflow-automations'] });
      toast({
        title: enable ? 'Automation enabled' : 'Automation disabled',
        description: `"${automation.name}" is now ${enable ? 'active' : 'paused'}.`,
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not update automation.', variant: 'destructive' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (config: Record<string, any>) =>
      apiRequest(`/api/music-workflow-automations/${automation.id}/config`, {
        method: 'PUT',
        body: JSON.stringify({ config }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/music-workflow-automations'] });
      toast({ title: 'Settings saved', description: `"${automation.name}" config updated.` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not save config.', variant: 'destructive' });
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/music-workflow-automations/trigger', {
        method: 'POST',
        body: JSON.stringify({ eventType: automation.trigger.event, data: {} }),
      }),
    onSuccess: () => {
      toast({ title: 'Test triggered', description: `"${automation.name}" fired. Check your logs.` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Test trigger failed.', variant: 'destructive' });
    },
  });

  const hasConfig = Object.keys(automation.configSchema).length > 0;
  const isPending = toggleMutation.isPending || saveMutation.isPending;

  return (
    <Card className={`transition-all duration-200 ${automation.enabled ? 'border-primary/30 bg-primary/5' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-2xl flex-shrink-0 mt-0.5">{automation.icon}</span>
            <div className="min-w-0">
              <CardTitle className="text-base leading-snug">{automation.name}</CardTitle>
              <CardDescription className="text-sm mt-1 leading-relaxed">
                {automation.description}
              </CardDescription>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs py-0 h-5">
                  <Clock className="h-3 w-3 mr-1" />
                  {automation.trigger.description}
                </Badge>
              </div>
            </div>
          </div>
          <Switch
            checked={automation.enabled}
            onCheckedChange={(v) => toggleMutation.mutate(v)}
            disabled={isPending}
            className="flex-shrink-0 mt-1"
          />
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
              {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>

            {expanded && (
              <div className="mt-4 space-y-4">
                <ConfigEditor
                  schema={automation.configSchema}
                  values={localConfig}
                  onChange={(k, v) => setLocalConfig((prev) => ({ ...prev, [k]: v }))}
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => saveMutation.mutate(localConfig)}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save settings'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending}
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        Test run
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </>
      )}
    </Card>
  );
}

// ─── Execution log panel ─────────────────────────────────────────────────────

function ExecutionLogs() {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/music-workflow-automations/logs'],
    queryFn: () => apiRequest('/api/music-workflow-automations/logs').then((r: any) => r.logs as ExecutionLog[]),
    refetchInterval: 15000,
  });

  const templates: Record<string, string> = Object.fromEntries(
    ([] as [string, string][]).concat()
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading logs...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Zap className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No automation runs yet.</p>
        <p className="text-xs mt-1">Enable automations above and they will appear here when triggered.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-2 pr-3">
        {data.map((log) => (
          <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card text-sm">
            {log.status === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
            ) : log.status === 'failed' ? (
              <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{log.templateId}</span>
                <Badge
                  variant={log.status === 'success' ? 'default' : 'destructive'}
                  className="text-xs py-0 h-4"
                >
                  {log.status}
                </Badge>
                <span className="text-muted-foreground text-xs ml-auto">
                  {new Date(log.executedAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Event: {log.eventType}</p>
              {log.error && (
                <p className="text-xs text-destructive mt-1">{log.error}</p>
              )}
              {log.result && typeof log.result === 'object' && (log.result as any).actions?.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Actions: {((log.result as any).actions as string[]).join(' · ')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MusicWorkflowAutomations() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['/api/music-workflow-automations'],
    queryFn: () =>
      apiRequest('/api/music-workflow-automations').then(
        (r: any) => r.automations as WorkflowTemplate[]
      ),
  });

  const automations = data ?? [];
  const enabledCount = automations.filter((a) => a.enabled).length;

  const automationsByPhase = (phase: string) =>
    automations.filter((a) => a.phase === phase);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Workflow Automations</h1>
              <p className="text-muted-foreground text-sm">
                From first recording to first stream — automate your entire music career.
              </p>
            </div>
          </div>

          {!isLoading && automations.length > 0 && (
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/40 border text-sm mt-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="font-medium">{enabledCount} active</span>
              </div>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{automations.length - enabledCount} available to enable</span>
              <span className="text-muted-foreground ml-auto">All optional — enable only what fits your workflow</span>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading your automations...
          </div>
        ) : (
          <Tabs defaultValue="automations">
            <TabsList className="mb-6">
              <TabsTrigger value="automations">Automations</TabsTrigger>
              <TabsTrigger value="logs">Run History</TabsTrigger>
            </TabsList>

            <TabsContent value="automations" className="space-y-10">
              {PHASES.map((phase) => {
                const phaseAutomations = automationsByPhase(phase.key);
                if (phaseAutomations.length === 0) return null;
                return (
                  <section key={phase.key}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-4 ${phase.color}`}>
                      {phase.label}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">{phase.description}</p>
                    <div className="space-y-3">
                      {phaseAutomations.map((automation) => (
                        <AutomationCard key={automation.id} automation={automation} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </TabsContent>

            <TabsContent value="logs">
              <ExecutionLogs />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
