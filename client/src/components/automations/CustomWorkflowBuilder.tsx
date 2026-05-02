import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Play, Trash2, Edit, Loader2, Zap, Clock, ChevronRight,
  AlertCircle, CheckCircle2, X, ListTodo, Webhook,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TriggerDef {
  id: string;
  label: string;
  category: string;
  description: string;
}

interface ActionFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  placeholder?: string;
  options?: string[];
}

interface ActionDef {
  id: string;
  label: string;
  description: string;
  fields: ActionFieldDef[];
}

interface Catalog {
  triggers: TriggerDef[];
  actions: ActionDef[];
}

interface CustomAction {
  type: string;
  config: Record<string, string>;
}

interface CustomWorkflow {
  id: string;
  name: string;
  description: string;
  triggerEvent: string;
  triggerConditions: Record<string, any>;
  actions: CustomAction[];
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
}

// ─── Action icon ─────────────────────────────────────────────────────────────

function actionIcon(type: string) {
  const icons: Record<string, React.ReactNode> = {
    push_notification: <AlertCircle className="h-3.5 w-3.5 text-blue-500" />,
    email_self: <CheckCircle2 className="h-3.5 w-3.5 text-purple-500" />,
    social_post: <Zap className="h-3.5 w-3.5 text-pink-500" />,
    log_note: <ListTodo className="h-3.5 w-3.5 text-amber-500" />,
    webhook: <Webhook className="h-3.5 w-3.5 text-green-500" />,
  };
  return icons[type] ?? <Zap className="h-3.5 w-3.5 text-muted-foreground" />;
}

// ─── Action builder row ───────────────────────────────────────────────────────

function ActionRow({
  action,
  index,
  actionDefs,
  onChange,
  onRemove,
}: {
  action: CustomAction;
  index: number;
  actionDefs: ActionDef[];
  onChange: (updated: CustomAction) => void;
  onRemove: () => void;
}) {
  const def = actionDefs.find((a) => a.id === action.type);

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground w-5">{index + 1}.</span>
        <Select
          value={action.type}
          onValueChange={(v) => onChange({ type: v, config: {} })}
        >
          <SelectTrigger className="h-8 text-sm flex-1">
            <SelectValue placeholder="Choose action type..." />
          </SelectTrigger>
          <SelectContent>
            {actionDefs.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <span className="font-medium">{a.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {def && def.description && (
        <p className="text-xs text-muted-foreground pl-7">{def.description}</p>
      )}

      {def && def.fields.length > 0 && (
        <div className="pl-7 space-y-2">
          {def.fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs font-medium">{field.label}</Label>
              {field.type === 'textarea' ? (
                <Textarea
                  className="text-xs resize-none min-h-[60px]"
                  placeholder={field.placeholder}
                  value={action.config[field.key] ?? ''}
                  onChange={(e) => onChange({ ...action, config: { ...action.config, [field.key]: e.target.value } })}
                />
              ) : field.type === 'select' ? (
                <Select
                  value={action.config[field.key] ?? field.options?.[0] ?? ''}
                  onValueChange={(v) => onChange({ ...action, config: { ...action.config, [field.key]: v } })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-7 text-xs"
                  placeholder={field.placeholder}
                  value={action.config[field.key] ?? ''}
                  onChange={(e) => onChange({ ...action, config: { ...action.config, [field.key]: e.target.value } })}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Workflow form dialog ─────────────────────────────────────────────────────

function WorkflowDialog({
  open,
  onClose,
  catalog,
  editWorkflow,
}: {
  open: boolean;
  onClose: () => void;
  catalog: Catalog;
  editWorkflow?: CustomWorkflow;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState(editWorkflow?.name ?? '');
  const [description, setDescription] = useState(editWorkflow?.description ?? '');
  const [triggerEvent, setTriggerEvent] = useState(editWorkflow?.triggerEvent ?? '');
  const [actions, setActions] = useState<CustomAction[]>(editWorkflow?.actions ?? [{ type: 'push_notification', config: {} }]);

  const isEdit = !!editWorkflow;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name, description, triggerEvent, actions };
      if (isEdit) {
        const res = await apiRequest('PUT', `/api/custom-workflows/${editWorkflow!.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest('POST', '/api/custom-workflows', body);
        return res.json();
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/custom-workflows'] });
      toast({
        title: isEdit ? 'Workflow updated' : 'Workflow created',
        description: `"${name}" is ready. Enable it to activate.`,
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message ?? 'Could not save workflow.', variant: 'destructive' });
    },
  });

  const triggersByCategory: Record<string, TriggerDef[]> = {};
  for (const t of catalog.triggers) {
    if (!triggersByCategory[t.category]) triggersByCategory[t.category] = [];
    triggersByCategory[t.category].push(t);
  }

  const selectedTrigger = catalog.triggers.find((t) => t.id === triggerEvent);

  const canSave = name.trim().length > 0 && triggerEvent.length > 0 && actions.length > 0 && actions.every((a) => a.type);

  const addAction = () => setActions((prev) => [...prev, { type: 'push_notification', config: {} }]);
  const updateAction = (i: number, updated: CustomAction) =>
    setActions((prev) => prev.map((a, idx) => idx === i ? updated : a));
  const removeAction = (i: number) =>
    setActions((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            {isEdit ? 'Edit Workflow' : 'Create Custom Workflow'}
          </DialogTitle>
          <DialogDescription>
            Define a trigger and one or more actions. Your workflow fires automatically when the trigger event occurs.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 pb-6">
            {/* Step 1: Name */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
                <h3 className="font-semibold text-sm">Name your workflow</h3>
              </div>
              <div className="pl-8 space-y-2">
                <Input
                  placeholder="e.g. Notify me when a beat sells"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-sm"
                />
                <Textarea
                  placeholder="Optional: describe what this workflow does..."
                  className="resize-none text-sm min-h-[56px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            {/* Step 2: Trigger */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">2</div>
                <h3 className="font-semibold text-sm">When should this run?</h3>
              </div>
              <div className="pl-8 space-y-2">
                <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Choose a trigger event..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(triggersByCategory).map(([category, triggers]) => (
                      <div key={category}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</div>
                        {triggers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTrigger && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Clock className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    {selectedTrigger.description}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Step 3: Actions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">3</div>
                <h3 className="font-semibold text-sm">What should happen?</h3>
                <span className="text-xs text-muted-foreground ml-auto">
                  {actions.length} action{actions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="pl-8 space-y-2">
                {actions.map((action, i) => (
                  <ActionRow
                    key={i}
                    action={action}
                    index={i}
                    actionDefs={catalog.actions}
                    onChange={(updated) => updateAction(i, updated)}
                    onRemove={() => removeAction(i)}
                  />
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs gap-1.5 border-dashed"
                  onClick={addAction}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add another action
                </Button>
              </div>
            </div>

            {/* Variable reference */}
            <div className="pl-8">
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                  Available template variables
                </summary>
                <div className="mt-2 text-xs text-muted-foreground space-y-1 pl-4">
                  {[
                    ['{{trackName}}', 'The track that triggered the event'],
                    ['{{releaseName}}', 'The release or album name'],
                    ['{{platform}}', 'Streaming platform name'],
                    ['{{artistName}}', 'Your artist name'],
                    ['{{eventType}}', 'The event that fired (e.g. track:uploaded)'],
                    ['{{timestamp}}', 'Date and time of the trigger'],
                    ['{{milestone}}', 'Stream count milestone (e.g. 10,000)'],
                  ].map(([v, d]) => (
                    <div key={v} className="flex gap-2">
                      <code className="font-mono text-primary bg-primary/10 px-1 rounded flex-shrink-0">{v}</code>
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            {isEdit ? 'Save changes' : 'Create workflow'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Custom workflow card ────────────────────────────────────────────────────

function WorkflowCard({
  workflow,
  catalog,
  onEdit,
}: {
  workflow: CustomWorkflow;
  catalog: Catalog;
  onEdit: (w: CustomWorkflow) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const triggerDef = catalog.triggers.find((t) => t.id === workflow.triggerEvent);

  const toggleMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      const res = await apiRequest('POST', `/api/custom-workflows/${workflow.id}/${enable ? 'enable' : 'disable'}`);
      return res.json();
    },
    onSuccess: (_, enable) => {
      qc.invalidateQueries({ queryKey: ['/api/custom-workflows'] });
      toast({ title: enable ? 'Workflow enabled' : 'Workflow disabled', description: `"${workflow.name}" updated.` });
    },
    onError: () => toast({ title: 'Error', description: 'Could not update workflow.', variant: 'destructive' }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/custom-workflows/${workflow.id}/test`);
      return res.json();
    },
    onSuccess: (data: Record<string, unknown>) => {
      qc.invalidateQueries({ queryKey: ['/api/custom-workflows'] });
      toast({
        title: 'Test run complete',
        description: `Actions run: ${data.actionsRun?.join(', ') ?? 'none'}`,
      });
    },
    onError: () => toast({ title: 'Error', description: 'Test run failed.', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/custom-workflows/${workflow.id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/custom-workflows'] });
      toast({ title: 'Workflow deleted', description: `"${workflow.name}" removed.` });
    },
    onError: () => toast({ title: 'Error', description: 'Could not delete.', variant: 'destructive' }),
  });

  const actions = workflow.actions as CustomAction[];

  return (
    <Card className={`transition-all ${workflow.enabled ? 'border-primary/40 bg-primary/5' : ''}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold leading-snug">{workflow.name}</CardTitle>
              {workflow.enabled && (
                <Badge className="text-xs py-0 h-4 bg-green-500/20 text-green-600 border-green-500/30 hover:bg-green-500/20">
                  Active
                </Badge>
              )}
              {workflow.runCount > 0 && (
                <Badge variant="outline" className="text-xs py-0 h-4">
                  {workflow.runCount} run{workflow.runCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {workflow.description && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{workflow.description}</p>
            )}
          </div>
          <Switch
            checked={workflow.enabled}
            onCheckedChange={(v) => toggleMutation.mutate(v)}
            disabled={toggleMutation.isPending}
          />
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Trigger pill */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs gap-1 py-0.5">
            <Clock className="h-2.5 w-2.5" />
            {triggerDef?.label ?? workflow.triggerEvent}
          </Badge>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1 flex-wrap">
            {actions.slice(0, 3).map((a, i) => (
              <Badge key={i} variant="outline" className="text-xs gap-1 py-0.5">
                {actionIcon(a.type)}
                {catalog.actions.find((d) => d.id === a.type)?.label.split(' ').slice(0, 2).join(' ') ?? a.type}
              </Badge>
            ))}
            {actions.length > 3 && (
              <Badge variant="outline" className="text-xs py-0.5">+{actions.length - 3} more</Badge>
            )}
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-1.5 pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            title="Test run"
          >
            {testMutation.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Play className="h-3 w-3" />}
            Test
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => onEdit(workflow)}
          >
            <Edit className="h-3 w-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive ml-auto"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Delete
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{workflow.name}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmDeleteOpen(false); deleteMutation.mutate(); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── Main exported tab component ─────────────────────────────────────────────

export function CustomWorkflowTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomWorkflow | undefined>(undefined);

  const { data: workflows = [], isLoading } = useQuery<CustomWorkflow[]>({
    queryKey: ['/api/custom-workflows'],
  });

  const { data: catalog } = useQuery<{ triggers: TriggerDef[]; actions: ActionDef[] }>({
    queryKey: ['/api/custom-workflows/catalog'],
  });

  const openCreate = () => { setEditTarget(undefined); setDialogOpen(true); };
  const openEdit = (w: CustomWorkflow) => { setEditTarget(w); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditTarget(undefined); };

  const enabledCount = workflows.filter((w) => w.enabled).length;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 bg-muted animate-pulse rounded w-40" />
                <div className="h-3 bg-muted animate-pulse rounded w-60" />
              </div>
            </div>
            <div className="h-5 w-10 bg-muted animate-pulse rounded-full ml-4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Custom Workflows</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Build your own automations with any trigger + action combination.
            {workflows.length > 0 && ` ${enabledCount}/${workflows.length} active.`}
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 flex-shrink-0">
          <Plus className="h-3.5 w-3.5" />
          New Workflow
        </Button>
      </div>

      {/* Info banner (first time) */}
      {workflows.length === 0 && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-10 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <p className="font-semibold text-sm mb-1">Build your first automation</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
              Choose any trigger — a sale, a release going live, a milestone — and define exactly what happens next.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-md mx-auto text-xs text-left mb-6">
              {[
                { trigger: 'Beat sold', arrow: '→', action: 'Email myself + notify buyer' },
                { trigger: 'Track uploaded', arrow: '→', action: 'Post to Instagram' },
                { trigger: 'Every Monday', arrow: '→', action: 'Log weekly goals' },
              ].map((ex) => (
                <div key={ex.trigger} className="rounded-lg border bg-card p-2.5">
                  <p className="font-medium text-foreground">{ex.trigger}</p>
                  <p className="text-muted-foreground text-xs">{ex.arrow} {ex.action}</p>
                </div>
              ))}
            </div>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Create Workflow
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Workflow list */}
      {workflows.length > 0 && (
        <div className="space-y-3">
          {workflows.map((w) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              catalog={catalog ?? { triggers: [], actions: [] }}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {/* Dialog */}
      {catalog && (
        <WorkflowDialog
          open={dialogOpen}
          onClose={closeDialog}
          catalog={catalog}
          editWorkflow={editTarget}
        />
      )}
    </div>
  );
}
