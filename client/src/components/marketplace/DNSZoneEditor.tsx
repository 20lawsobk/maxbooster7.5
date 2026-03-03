import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  Save,
  Shield,
  Globe,
  Download,
  Upload,
  Copy,
  Search,
  Filter,
  Loader2,
  Server,
  CheckCircle,
} from 'lucide-react';

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  port?: number;
  weight?: number;
  protocol?: string;
  service?: string;
}

interface DnsTemplate {
  id: string;
  name: string;
  description?: string;
  records: DnsRecord[];
  createdAt: string;
}

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'] as const;

const TTL_PRESETS = [
  { label: 'Auto', value: 1 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '12 hours', value: 43200 },
  { label: '1 day', value: 86400 },
  { label: '1 week', value: 604800 },
];

const RECORD_TYPE_INFO: Record<string, { description: string; placeholder: string; fields: string[] }> = {
  A: { description: 'Points domain to an IPv4 address', placeholder: '192.168.1.1', fields: ['value'] },
  AAAA: { description: 'Points domain to an IPv6 address', placeholder: '2001:0db8:85a3::8a2e:0370:7334', fields: ['value'] },
  CNAME: { description: 'Alias to another domain name', placeholder: 'example.com', fields: ['value'] },
  MX: { description: 'Mail server for this domain', placeholder: 'mail.example.com', fields: ['value', 'priority'] },
  TXT: { description: 'Text record (SPF, DKIM, verification)', placeholder: 'v=spf1 include:_spf.google.com ~all', fields: ['value'] },
  NS: { description: 'Nameserver delegation', placeholder: 'ns1.example.com', fields: ['value'] },
  SRV: { description: 'Service location record', placeholder: 'sip.example.com', fields: ['value', 'priority', 'weight', 'port'] },
};

const MAXBOOSTER_NAMESERVERS = ['ns1.maxbooster.app', 'ns2.maxbooster.app'];

function formatTTL(seconds: number): string {
  if (seconds <= 1) return 'Auto';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

interface DNSZoneEditorProps {
  storefrontId: string;
  domain: string;
}

export function DNSZoneEditor({ storefrontId, domain }: DNSZoneEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddRecord, setShowAddRecord] = useState(false);
  const [showEditRecord, setShowEditRecord] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showApplyTemplate, setShowApplyTemplate] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<DnsRecord | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [editingRecord, setEditingRecord] = useState<DnsRecord>({
    type: 'A',
    name: '@',
    value: '',
    ttl: 3600,
  });
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  const { data: recordsData, isLoading: recordsLoading, refetch: refetchRecords } = useQuery({
    queryKey: ['dns-records', storefrontId, domain],
    queryFn: async () => {
      const resp = await apiRequest('GET', `/api/dns/${storefrontId}/records?domain=${encodeURIComponent(domain)}`);
      return resp.json();
    },
    enabled: !!domain && !!storefrontId,
  });

  const { data: templatesData } = useQuery({
    queryKey: ['dns-templates', storefrontId],
    queryFn: async () => {
      const resp = await apiRequest('GET', `/api/dns/${storefrontId}/templates`);
      return resp.json();
    },
  });

  const addRecordMutation = useMutation({
    mutationFn: async (record: DnsRecord) => {
      const resp = await apiRequest('POST', `/api/dns/${storefrontId}/records`, { domain, record });
      return resp.json();
    },
    onSuccess: () => {
      toast({ title: 'Record Added', description: 'DNS record has been created.' });
      setShowAddRecord(false);
      queryClient.invalidateQueries({ queryKey: ['dns-records', storefrontId, domain] });
    },
    onError: () => {
      toast({ title: 'Failed', description: 'Could not add DNS record.', variant: 'destructive' });
    },
  });

  const updateRecordMutation = useMutation({
    mutationFn: async (data: { record: DnsRecord; originalName: string; originalType: string }) => {
      const resp = await apiRequest('PUT', `/api/dns/${storefrontId}/records`, {
        domain,
        record: data.record,
        originalName: data.originalName,
        originalType: data.originalType,
      });
      return resp.json();
    },
    onSuccess: () => {
      toast({ title: 'Record Updated', description: 'DNS record has been updated.' });
      setShowEditRecord(false);
      queryClient.invalidateQueries({ queryKey: ['dns-records', storefrontId, domain] });
    },
    onError: () => {
      toast({ title: 'Failed', description: 'Could not update DNS record.', variant: 'destructive' });
    },
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (data: { recordType: string; recordName: string }) => {
      const resp = await apiRequest('DELETE', `/api/dns/${storefrontId}/records`, {
        domain,
        recordType: data.recordType,
        recordName: data.recordName,
      });
      return resp.json();
    },
    onSuccess: () => {
      toast({ title: 'Record Deleted', description: 'DNS record has been removed.' });
      setShowDeleteConfirm(false);
      setSelectedRecord(null);
      queryClient.invalidateQueries({ queryKey: ['dns-records', storefrontId, domain] });
    },
    onError: () => {
      toast({ title: 'Failed', description: 'Could not delete DNS record.', variant: 'destructive' });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; records: DnsRecord[] }) => {
      const resp = await apiRequest('POST', `/api/dns/${storefrontId}/templates`, data);
      return resp.json();
    },
    onSuccess: () => {
      toast({ title: 'Template Saved', description: 'DNS template has been saved.' });
      setShowSaveTemplate(false);
      setTemplateName('');
      setTemplateDescription('');
      queryClient.invalidateQueries({ queryKey: ['dns-templates', storefrontId] });
    },
    onError: () => {
      toast({ title: 'Failed', description: 'Could not save template.', variant: 'destructive' });
    },
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const resp = await apiRequest('POST', `/api/dns/${storefrontId}/templates/${templateId}/apply`, { domain });
      return resp.json();
    },
    onSuccess: () => {
      toast({ title: 'Template Applied', description: 'DNS records from template have been applied.' });
      setShowApplyTemplate(false);
      queryClient.invalidateQueries({ queryKey: ['dns-records', storefrontId, domain] });
    },
    onError: () => {
      toast({ title: 'Failed', description: 'Could not apply template.', variant: 'destructive' });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const resp = await apiRequest('DELETE', `/api/dns/${storefrontId}/templates/${templateId}`);
      return resp.json();
    },
    onSuccess: () => {
      toast({ title: 'Template Deleted' });
      queryClient.invalidateQueries({ queryKey: ['dns-templates', storefrontId] });
    },
    onError: () => {
      toast({ title: 'Failed', description: 'Could not delete template.', variant: 'destructive' });
    },
  });

  const records = useMemo(() => {
    const all = (recordsData?.records as DnsRecord[]) || [];
    return all.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        return r.name.toLowerCase().includes(q) || r.value.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
      }
      return true;
    });
  }, [recordsData, typeFilter, searchFilter]);

  const templates = useMemo(() => (templatesData?.templates as DnsTemplate[]) || [], [templatesData]);

  const handleRefresh = useCallback(async () => {
    await refetchRecords();
    toast({ title: 'Records Refreshed', description: 'DNS records have been reloaded.' });
  }, [refetchRecords, toast]);

  const handleExportZone = useCallback(() => {
    window.open(`/api/dns/${storefrontId}/export?domain=${encodeURIComponent(domain)}`, '_blank');
  }, [storefrontId, domain]);

  const openAddRecord = useCallback(() => {
    setEditingRecord({ type: 'A', name: '@', value: '', ttl: 3600 });
    setShowAddRecord(true);
  }, []);

  const openEditRecord = useCallback((record: DnsRecord) => {
    setSelectedRecord(record);
    setEditingRecord({ ...record });
    setShowEditRecord(true);
  }, []);

  const openDeleteConfirm = useCallback((record: DnsRecord) => {
    setSelectedRecord(record);
    setShowDeleteConfirm(true);
  }, []);

  const recordTypeColor = useCallback((type: string) => {
    const colors: Record<string, string> = {
      A: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      AAAA: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
      CNAME: 'bg-green-500/10 text-green-400 border-green-500/30',
      MX: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      TXT: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      NS: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      SRV: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
    };
    return colors[type] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  }, []);

  const RecordForm = useMemo(() => {
    const typeInfo = RECORD_TYPE_INFO[editingRecord.type] || RECORD_TYPE_INFO['A'];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Record Type</Label>
            <Select value={editingRecord.type} onValueChange={(v) => setEditingRecord({ ...editingRecord, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECORD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${recordTypeColor(t)}`}>{t}</Badge>
                      <span className="text-xs text-muted-foreground">{RECORD_TYPE_INFO[t]?.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>TTL</Label>
            <Select value={String(editingRecord.ttl)} onValueChange={(v) => setEditingRecord({ ...editingRecord, ttl: parseInt(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TTL_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Host / Name</Label>
          <Input
            value={editingRecord.name}
            onChange={(e) => setEditingRecord({ ...editingRecord, name: e.target.value })}
            placeholder="@ for root, or subdomain name"
          />
          <p className="text-xs text-muted-foreground mt-1">Use @ for the root domain, or enter a subdomain name (e.g., www, mail)</p>
        </div>

        <div>
          <Label>Points to / Value</Label>
          <Input
            value={editingRecord.value}
            onChange={(e) => setEditingRecord({ ...editingRecord, value: e.target.value })}
            placeholder={typeInfo.placeholder}
          />
          <p className="text-xs text-muted-foreground mt-1">{typeInfo.description}</p>
        </div>

        {(editingRecord.type === 'MX' || editingRecord.type === 'SRV') && (
          <div>
            <Label>Priority</Label>
            <Input
              type="number"
              value={editingRecord.priority ?? 10}
              onChange={(e) => setEditingRecord({ ...editingRecord, priority: parseInt(e.target.value) || 0 })}
              placeholder="10"
              min={0}
              max={65535}
            />
          </div>
        )}

        {editingRecord.type === 'SRV' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Weight</Label>
              <Input
                type="number"
                value={editingRecord.weight ?? 0}
                onChange={(e) => setEditingRecord({ ...editingRecord, weight: parseInt(e.target.value) || 0 })}
                placeholder="0"
                min={0}
                max={65535}
              />
            </div>
            <div>
              <Label>Port</Label>
              <Input
                type="number"
                value={editingRecord.port ?? 443}
                onChange={(e) => setEditingRecord({ ...editingRecord, port: parseInt(e.target.value) || 0 })}
                placeholder="443"
                min={0}
                max={65535}
              />
            </div>
          </div>
        )}
      </div>
    );
  }, [editingRecord, recordTypeColor]);

  if (!domain) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Set a custom domain first to manage DNS records.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="w-4 h-4 text-purple-400" />
            Max Booster DNS
            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">
              <CheckCircle className="w-3 h-3 mr-1" />
              Active
            </Badge>
          </CardTitle>
          <CardDescription>
            Point your domain nameservers to Max Booster to activate full DNS management — no third-party registrar API needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Nameservers</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MAXBOOSTER_NAMESERVERS.map((ns) => (
                <div key={ns} className="flex items-center justify-between p-2 rounded-md border bg-background/50 font-mono text-sm">
                  <span>{ns}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      navigator.clipboard.writeText(ns);
                      toast({ title: 'Copied', description: `${ns} copied to clipboard.` });
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Log into your domain registrar (GoDaddy, Namecheap, etc.) and replace the existing nameservers with the two above. Changes propagate within 24-48 hours.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                DNS Zone Editor
              </CardTitle>
              <CardDescription className="mt-1">
                Manage DNS records for <span className="font-mono text-foreground">{domain}</span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search records..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px]">
                <Filter className="w-4 h-4 mr-1" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {RECORD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={recordsLoading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${recordsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={openAddRecord}>
              <Plus className="w-4 h-4 mr-1" />
              Add Record
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSaveTemplate(true)} disabled={!records.length}>
              <Save className="w-4 h-4 mr-1" />
              Save as Template
            </Button>
            {templates.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowApplyTemplate(true)}>
                <Upload className="w-4 h-4 mr-1" />
                Apply Template
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportZone} disabled={!records.length}>
              <Download className="w-4 h-4 mr-1" />
              Export Zone
            </Button>
          </div>

          {recordsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading DNS records...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">No DNS records yet. Add your first record to get started.</p>
              <Button onClick={openAddRecord}>
                <Plus className="w-4 h-4 mr-1" />
                Add First Record
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Value</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">TTL</th>
                      {records.some(r => r.priority !== undefined) && (
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Priority</th>
                      )}
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record, idx) => (
                      <tr key={`${record.type}-${record.name}-${idx}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs font-mono ${recordTypeColor(record.type)}`}>
                            {record.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm">{record.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 max-w-[300px]">
                            <span className="font-mono text-sm truncate" title={record.value}>{record.value}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => {
                                navigator.clipboard.writeText(record.value);
                                toast({ title: 'Copied', description: 'Value copied to clipboard.' });
                              }}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">{formatTTL(record.ttl)}</span>
                        </td>
                        {records.some(r => r.priority !== undefined) && (
                          <td className="px-4 py-3">
                            <span className="text-sm text-muted-foreground">{record.priority ?? '-'}</span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRecord(record)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => openDeleteConfirm(record)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t bg-muted/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {records.length} record{records.length !== 1 ? 's' : ''}
                  {typeFilter !== 'all' && ` (filtered by ${typeFilter})`}
                </span>
                <span className="text-xs text-muted-foreground">
                  Max Booster DNS
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddRecord} onOpenChange={setShowAddRecord}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add DNS Record</DialogTitle>
            <DialogDescription>Create a new DNS record for {domain}</DialogDescription>
          </DialogHeader>
          {RecordForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRecord(false)}>Cancel</Button>
            <Button
              onClick={() => addRecordMutation.mutate(editingRecord)}
              disabled={addRecordMutation.isPending || !editingRecord.value}
            >
              {addRecordMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditRecord} onOpenChange={setShowEditRecord}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit DNS Record</DialogTitle>
            <DialogDescription>Update the DNS record for {domain}</DialogDescription>
          </DialogHeader>
          {RecordForm}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditRecord(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedRecord) {
                  updateRecordMutation.mutate({
                    record: editingRecord,
                    originalName: selectedRecord.name,
                    originalType: selectedRecord.type,
                  });
                }
              }}
              disabled={updateRecordMutation.isPending || !editingRecord.value}
            >
              {updateRecordMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete DNS Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this record? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={recordTypeColor(selectedRecord.type)}>{selectedRecord.type}</Badge>
                <span className="font-mono text-sm">{selectedRecord.name}</span>
              </div>
              <p className="text-sm font-mono text-muted-foreground truncate">{selectedRecord.value}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedRecord) {
                  deleteRecordMutation.mutate({ recordType: selectedRecord.type, recordName: selectedRecord.name });
                }
              }}
              disabled={deleteRecordMutation.isPending}
            >
              {deleteRecordMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Delete Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save as DNS Template</DialogTitle>
            <DialogDescription>Save the current DNS configuration as a reusable template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g., Standard Website Setup" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} placeholder="Brief description of this configuration" />
            </div>
            <p className="text-sm text-muted-foreground">This will save {records.length} record{records.length !== 1 ? 's' : ''} as a template.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveTemplate(false)}>Cancel</Button>
            <Button
              onClick={() => saveTemplateMutation.mutate({ name: templateName, description: templateDescription, records })}
              disabled={saveTemplateMutation.isPending || !templateName}
            >
              {saveTemplateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showApplyTemplate} onOpenChange={setShowApplyTemplate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply DNS Template</DialogTitle>
            <DialogDescription>Apply a saved DNS configuration to {domain}. This will replace existing records.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {templates.map((tmpl) => (
              <div key={tmpl.id} className="p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium text-sm">{tmpl.name}</h4>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyTemplateMutation.mutate(tmpl.id)}
                      disabled={applyTemplateMutation.isPending}
                    >
                      {applyTemplateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteTemplateMutation.mutate(tmpl.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {tmpl.description && <p className="text-xs text-muted-foreground">{tmpl.description}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {tmpl.records.map((r, i) => (
                    <Badge key={i} variant="outline" className={`text-xs ${recordTypeColor(r.type)}`}>
                      {r.type}: {r.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyTemplate(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
