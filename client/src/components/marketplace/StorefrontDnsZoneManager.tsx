import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Globe,
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Server,
  ChevronRight,
  ArrowLeft,
  Shield,
  Zap,
  Info,
} from 'lucide-react';

interface DnsZone {
  id: string;
  domain: string;
  status: string;
  isVerified: boolean;
  verificationToken: string;
  nameserver1: string;
  nameserver2: string;
  notes?: string;
  createdAt: string;
}

interface DnsRecord {
  id: string;
  zoneId: string;
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  weight?: number;
  port?: number;
  tag?: string;
}

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const;

const TTL_OPTIONS = [
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '12 hours', value: 43200 },
  { label: '1 day', value: 86400 },
  { label: '1 week', value: 604800 },
];

const RECORD_HINTS: Record<string, { placeholder: string; description: string }> = {
  A:     { placeholder: '192.0.2.1',               description: 'IPv4 address this domain resolves to' },
  AAAA:  { placeholder: '2001:db8::1',              description: 'IPv6 address this domain resolves to' },
  CNAME: { placeholder: 'target.example.com',       description: 'Alias pointing to another hostname' },
  MX:    { placeholder: 'mail.example.com',         description: 'Mail server hostname (requires priority)' },
  TXT:   { placeholder: 'v=spf1 include:... ~all',  description: 'Text record — SPF, DKIM, verification strings' },
  NS:    { placeholder: 'ns1.example.com',          description: 'Delegate a subdomain to another nameserver' },
  SRV:   { placeholder: 'target.example.com',       description: 'Service record (requires priority, weight, port)' },
  CAA:   { placeholder: 'letsencrypt.org',          description: 'Authorize a certificate authority for this domain' },
};

const TYPE_COLORS: Record<string, string> = {
  A:     'bg-blue-500/15 text-blue-600 border-blue-300',
  AAAA:  'bg-purple-500/15 text-purple-600 border-purple-300',
  CNAME: 'bg-amber-500/15 text-amber-600 border-amber-300',
  MX:    'bg-green-500/15 text-green-600 border-green-300',
  TXT:   'bg-slate-500/15 text-slate-600 border-slate-300',
  NS:    'bg-cyan-500/15 text-cyan-600 border-cyan-300',
  SRV:   'bg-pink-500/15 text-pink-600 border-pink-300',
  CAA:   'bg-red-500/15 text-red-600 border-red-300',
  SOA:   'bg-orange-500/15 text-orange-600 border-orange-300',
};

const NS1 = 'ns1.maxboostermusic.com';
const NS2 = 'ns2.maxboostermusic.com';
const SYSTEM_TYPES = ['NS', 'SOA'];

function ttlLabel(v: number): string {
  const opt = TTL_OPTIONS.find(o => o.value === v);
  if (opt) return opt.label;
  if (v >= 86400) return `${v / 86400}d`;
  if (v >= 3600) return `${v / 3600}h`;
  if (v >= 60) return `${v / 60}m`;
  return `${v}s`;
}

function StatusBadge({ status, isVerified }: { status: string; isVerified: boolean }) {
  if (isVerified && status === 'active')
    return <Badge className="bg-green-600 text-white gap-1 text-[10px] px-1.5"><CheckCircle2 className="w-2.5 h-2.5" /> Active</Badge>;
  if (status === 'pending')
    return <Badge variant="outline" className="gap-1 text-amber-600 border-amber-400 text-[10px] px-1.5"><Clock className="w-2.5 h-2.5" /> Pending NS</Badge>;
  return <Badge variant="outline" className="gap-1 text-red-500 border-red-400 text-[10px] px-1.5"><AlertCircle className="w-2.5 h-2.5" /> {status}</Badge>;
}

function emptyRecord() {
  return { type: 'A', name: '@', value: '', ttl: 3600, priority: '', weight: '', port: '', tag: '' };
}

export function StorefrontDnsZoneManager() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedZone, setSelectedZone] = useState<DnsZone | null>(null);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [rec, setRec] = useState(emptyRecord());

  const { data: zonesData, isLoading: zonesLoading } = useQuery({
    queryKey: ['/api/dns-manager/zones'],
    queryFn: () => apiRequest('GET', '/api/dns-manager/zones').then(r => r.json()),
  });
  const zones: DnsZone[] = zonesData?.zones ?? [];

  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['/api/dns-manager/zones', selectedZone?.id, 'records'],
    queryFn: () => apiRequest('GET', `/api/dns-manager/zones/${selectedZone!.id}/records`).then(r => r.json()),
    enabled: !!selectedZone,
  });
  const records: DnsRecord[] = recordsData?.records ?? [];

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast({ title: `Copied ${label}` });
  }

  function openRecordEdit(r: DnsRecord) {
    setEditingRecord(r);
    setRec({ type: r.type, name: r.name, value: r.value, ttl: r.ttl, priority: r.priority?.toString() ?? '', weight: r.weight?.toString() ?? '', port: r.port?.toString() ?? '', tag: r.tag ?? '' });
    setShowRecordDialog(true);
  }

  function closeRecordDialog() {
    setShowRecordDialog(false);
    setEditingRecord(null);
    setRec(emptyRecord());
  }

  const addZone = useMutation({
    mutationFn: () => apiRequest('POST', '/api/dns-manager/zones', { domain: newDomain }).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones'] });
      setShowAddZone(false);
      setNewDomain('');
      setSelectedZone(data.zone);
      toast({ title: 'Domain added', description: `Now configure your DNS records and update your nameservers.` });
    },
    onError: async (err: any) => {
      let msg = 'Failed to add domain';
      try { const d = await err.response?.json(); msg = d?.error ?? msg; } catch {}
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const deleteZone = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/dns-manager/zones/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones'] });
      setSelectedZone(null);
      toast({ title: 'Domain removed' });
    },
  });

  const verifyZone = useMutation({
    mutationFn: (id: string) => apiRequest('POST', `/api/dns-manager/zones/${id}/verify`).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones'] });
      if (selectedZone) setSelectedZone(z => z ? { ...z, isVerified: data.verified, status: data.status ?? z.status } : z);
      toast(data.verified
        ? { title: 'Domain verified & active!' }
        : { title: 'Not verified yet', description: data.message, variant: 'destructive' });
    },
  });

  const saveRecord = useMutation({
    mutationFn: () => {
      const body = {
        type: rec.type, name: rec.name, value: rec.value, ttl: rec.ttl,
        priority: rec.priority ? parseInt(rec.priority) : undefined,
        weight:   rec.weight   ? parseInt(rec.weight)   : undefined,
        port:     rec.port     ? parseInt(rec.port)     : undefined,
        tag:      rec.tag || undefined,
      };
      if (editingRecord) {
        return apiRequest('PUT', `/api/dns-manager/zones/${selectedZone!.id}/records/${editingRecord.id}`, body).then(r => r.json());
      }
      return apiRequest('POST', `/api/dns-manager/zones/${selectedZone!.id}/records`, body).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones', selectedZone?.id, 'records'] });
      closeRecordDialog();
      toast({ title: editingRecord ? 'Record updated' : 'Record added' });
    },
    onError: async (err: any) => {
      let msg = 'Failed to save record';
      try { const d = await err.response?.json(); msg = d?.error ?? msg; } catch {}
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const deleteRecord = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/dns-manager/zones/${selectedZone!.id}/records/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones', selectedZone?.id, 'records'] });
      toast({ title: 'Record deleted' });
    },
  });

  const showPriority = ['MX', 'SRV'].includes(rec.type);
  const showWeightPort = rec.type === 'SRV';
  const showTag = rec.type === 'CAA';
  const hint = RECORD_HINTS[rec.type] ?? { placeholder: '', description: '' };

  return (
    <div className="space-y-4">
      {/* Nameservers banner */}
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Server className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                Max Booster Built-In Nameservers — point your domain here, no GoDaddy needed
              </p>
              <div className="flex flex-wrap gap-2">
                {[NS1, NS2].map((ns, i) => (
                  <div key={ns} className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded px-3 py-1.5 font-mono text-xs border">
                    <span className="text-muted-foreground">NS{i + 1}</span>
                    <span>{ns}</span>
                    <button onClick={() => copy(ns, `NS${i + 1}`)} className="text-muted-foreground hover:text-foreground">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { icon: Shield, label: 'A · AAAA · CNAME · MX · TXT · SRV · NS · CAA' },
          { icon: Zap,    label: 'TTL as low as 60s' },
          { icon: Globe,  label: 'Unlimited domains' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1 text-muted-foreground">
            <Icon className="w-3 h-3" />
            {label}
          </div>
        ))}
      </div>

      {/* Zone list or zone detail */}
      {!selectedZone ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Your Hosted Domains</p>
              <p className="text-xs text-muted-foreground">Add any domain you own — manage all its DNS records here</p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setShowAddZone(true)}>
              <Plus className="w-3.5 h-3.5" /> Add Domain
            </Button>
          </div>

          {zonesLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading...
            </div>
          ) : zones.length === 0 ? (
            <div className="border border-dashed rounded-xl flex flex-col items-center py-10 text-center">
              <Globe className="w-10 h-10 text-muted-foreground/25 mb-3" />
              <p className="font-semibold text-sm mb-1">No domains hosted yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Add your domain here, then point its nameservers to Max Booster. Manage every DNS record without leaving this page.
              </p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowAddZone(true)}>
                <Plus className="w-3.5 h-3.5" /> Add Domain
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {zones.map(zone => (
                <div
                  key={zone.id}
                  className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => setSelectedZone(zone)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-mono text-sm truncate">{zone.domain}</span>
                    <StatusBadge status={zone.status} isVerified={zone.isVerified} />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Zone header */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" className="gap-1.5 h-7" onClick={() => setSelectedZone(null)}>
              <ArrowLeft className="w-3.5 h-3.5" /> All Domains
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="font-mono font-semibold text-sm">{selectedZone.domain}</span>
            <StatusBadge status={selectedZone.status} isVerified={selectedZone.isVerified} />
            <div className="ml-auto flex gap-2">
              {!selectedZone.isVerified && (
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => verifyZone.mutate(selectedZone.id)} disabled={verifyZone.isPending}>
                  {verifyZone.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Check Nameservers
                </Button>
              )}
              <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs text-red-500 hover:text-red-600"
                onClick={() => { if (confirm(`Remove ${selectedZone.domain} and all its records?`)) deleteZone.mutate(selectedZone.id); }}>
                <Trash2 className="w-3 h-3" /> Remove
              </Button>
            </div>
          </div>

          <Tabs defaultValue="records">
            <TabsList className="h-8">
              <TabsTrigger value="records" className="text-xs">DNS Records</TabsTrigger>
              <TabsTrigger value="setup" className="text-xs">Setup Guide</TabsTrigger>
            </TabsList>

            <TabsContent value="records" className="mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{records.length} record{records.length !== 1 ? 's' : ''}</p>
                <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => { setEditingRecord(null); setRec(emptyRecord()); setShowRecordDialog(true); }}>
                  <Plus className="w-3 h-3" /> Add Record
                </Button>
              </div>

              {recordsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading records...
                </div>
              ) : records.length === 0 ? (
                <div className="border border-dashed rounded-lg flex flex-col items-center py-8 text-center">
                  <Server className="w-8 h-8 text-muted-foreground/25 mb-2" />
                  <p className="text-sm font-semibold mb-1">No records yet</p>
                  <p className="text-xs text-muted-foreground">Add A, CNAME, MX and other records to control how your domain works.</p>
                  <Button size="sm" className="mt-3 gap-1.5 h-7 text-xs" onClick={() => { setEditingRecord(null); setRec(emptyRecord()); setShowRecordDialog(true); }}>
                    <Plus className="w-3 h-3" /> Add First Record
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="w-20 text-xs">Type</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Value</TableHead>
                        <TableHead className="w-24 text-xs">TTL</TableHead>
                        <TableHead className="w-20 text-right text-xs">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map(r => (
                        <TableRow key={r.id} className="text-xs">
                          <TableCell>
                            <Badge variant="outline" className={`font-mono text-[10px] px-1.5 ${TYPE_COLORS[r.type] ?? ''}`}>{r.type}</Badge>
                          </TableCell>
                          <TableCell className="font-mono">{r.name}</TableCell>
                          <TableCell className="font-mono max-w-[180px]">
                            <div className="flex items-center gap-1">
                              <span className="truncate">{r.priority !== undefined ? `${r.priority} ` : ''}{r.value}</span>
                              <button onClick={() => copy(r.value, 'value')} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{ttlLabel(r.ttl)}</TableCell>
                          <TableCell className="text-right">
                            {SYSTEM_TYPES.includes(r.type) ? (
                              <span className="text-[10px] text-muted-foreground italic">system</span>
                            ) : (
                              <div className="flex justify-end gap-1">
                                <button onClick={() => openRecordEdit(r)} className="text-muted-foreground hover:text-foreground p-1">
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button onClick={() => { if (confirm('Delete this record?')) deleteRecord.mutate(r.id); }} className="text-red-400 hover:text-red-600 p-1">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="setup" className="mt-3 space-y-3">
              {/* Step 1 */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</div>
                  <p className="font-semibold text-sm">Update nameservers at your registrar</p>
                </div>
                <p className="text-xs text-muted-foreground">Log into wherever you bought this domain (GoDaddy, Namecheap, Google Domains, etc.) and change the nameservers to:</p>
                <div className="space-y-2">
                  {[NS1, NS2].map((ns, i) => (
                    <div key={ns} className="flex items-center gap-2 bg-muted/60 rounded px-3 py-2 font-mono text-xs">
                      <span className="text-muted-foreground w-8">NS{i + 1}</span>
                      <span className="flex-1">{ns}</span>
                      <button onClick={() => copy(ns, `NS${i + 1}`)} className="text-muted-foreground hover:text-foreground">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  Propagation takes 1–48 hours after updating nameservers.
                </p>
              </div>

              {/* Step 2 — verification */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</div>
                  <p className="font-semibold text-sm">Verify ownership (optional but recommended)</p>
                </div>
                <p className="text-xs text-muted-foreground">Add this TXT record at your current DNS host before switching nameservers:</p>
                <div className="bg-muted/60 rounded px-3 py-2 font-mono text-xs flex items-center gap-2">
                  <span className="flex-1 break-all">maxbooster-verify={selectedZone.verificationToken}</span>
                  <button onClick={() => copy(`maxbooster-verify=${selectedZone.verificationToken}`, 'token')} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => verifyZone.mutate(selectedZone.id)} disabled={verifyZone.isPending}>
                  {verifyZone.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Check Verification
                </Button>
              </div>

              {/* Step 3 */}
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</div>
                  <p className="font-semibold text-sm">Add your DNS records</p>
                </div>
                <p className="text-xs text-muted-foreground">Switch to the DNS Records tab and add records. Common setup:</p>
                <div className="space-y-1.5">
                  {[
                    { type: 'A',     name: '@',   note: 'Root domain → server IP' },
                    { type: 'CNAME', name: 'www', note: 'www → root domain alias' },
                    { type: 'MX',    name: '@',   note: 'Email delivery server' },
                    { type: 'TXT',   name: '@',   note: 'SPF / DKIM / site verify' },
                  ].map(ex => (
                    <div key={ex.type + ex.name} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                      <Badge variant="outline" className={`font-mono text-[10px] px-1.5 flex-shrink-0 ${TYPE_COLORS[ex.type] ?? ''}`}>{ex.type}</Badge>
                      <span className="font-mono text-muted-foreground w-10 flex-shrink-0">{ex.name}</span>
                      <span className="text-muted-foreground">{ex.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Add Domain Dialog */}
      <Dialog open={showAddZone} onOpenChange={setShowAddZone}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a Domain</DialogTitle>
            <DialogDescription>Enter the domain you own. After adding it, update your nameservers at your registrar to point to Max Booster.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Domain Name</Label>
            <Input
              className="mt-1 font-mono"
              placeholder="yourdomain.com"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newDomain.trim()) addZone.mutate(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddZone(false)}>Cancel</Button>
            <Button onClick={() => addZone.mutate()} disabled={!newDomain.trim() || addZone.isPending}>
              {addZone.isPending && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              Add Domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Record Dialog */}
      <Dialog open={showRecordDialog} onOpenChange={open => { if (!open) closeRecordDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Edit DNS Record' : 'Add DNS Record'}</DialogTitle>
            <DialogDescription>{selectedZone?.domain}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={rec.type} onValueChange={v => setRec(r => ({ ...r, type: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECORD_TYPES.map(t => (
                      <SelectItem key={t} value={t}>
                        <span className="font-mono">{t}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  className="mt-1 font-mono"
                  placeholder="@ or subdomain"
                  value={rec.name}
                  onChange={e => setRec(r => ({ ...r, name: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">@ = root domain</p>
              </div>
            </div>

            {hint.description && (
              <p className="text-xs text-blue-600 dark:text-blue-400 flex items-start gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded px-3 py-2">
                <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                {hint.description}
              </p>
            )}

            <div>
              <Label>Value</Label>
              <Input
                className="mt-1 font-mono"
                placeholder={hint.placeholder}
                value={rec.value}
                onChange={e => setRec(r => ({ ...r, value: e.target.value }))}
              />
            </div>

            {showTag && (
              <div>
                <Label>CAA Tag</Label>
                <Select value={rec.tag} onValueChange={v => setRec(r => ({ ...r, tag: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issue">issue — authorize CA to issue certs</SelectItem>
                    <SelectItem value="issuewild">issuewild — authorize wildcard certs</SelectItem>
                    <SelectItem value="iodef">iodef — violation report URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={`grid gap-4 ${showWeightPort ? 'grid-cols-4' : showPriority ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className={showWeightPort ? '' : 'col-span-1'}>
                <Label>TTL</Label>
                <Select value={rec.ttl.toString()} onValueChange={v => setRec(r => ({ ...r, ttl: parseInt(v) }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TTL_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value.toString()}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showPriority && (
                <div>
                  <Label>Priority</Label>
                  <Input type="number" placeholder="10" className="mt-1" value={rec.priority} onChange={e => setRec(r => ({ ...r, priority: e.target.value }))} />
                </div>
              )}
              {showWeightPort && (
                <>
                  <div>
                    <Label>Weight</Label>
                    <Input type="number" placeholder="100" className="mt-1" value={rec.weight} onChange={e => setRec(r => ({ ...r, weight: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Port</Label>
                    <Input type="number" placeholder="443" className="mt-1" value={rec.port} onChange={e => setRec(r => ({ ...r, port: e.target.value }))} />
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRecordDialog}>Cancel</Button>
            <Button onClick={() => saveRecord.mutate()} disabled={!rec.value.trim() || saveRecord.isPending}>
              {saveRecord.isPending && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              {editingRecord ? 'Save Changes' : 'Add Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
