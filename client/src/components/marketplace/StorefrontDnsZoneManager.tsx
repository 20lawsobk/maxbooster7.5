/**
 * StorefrontDnsZoneManager — Max Booster Domain Hub
 *
 * Three-in-one experience:
 *   1) Domain registrar  — search any name, claim any TLD, free with subscription
 *   2) My Domains        — manage every domain you've registered
 *   3) DNS Records       — full-featured zone editor (A / AAAA / CNAME / MX / TXT / NS / SRV / CAA)
 */

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Search,
  Star,
  Sparkles,
  ExternalLink,
  Lock,
  XCircle,
  Link2,
  Link2Off,
  ShoppingBag,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DomainSearchResult {
  domain:            string;
  tld:               string;
  available:         boolean;
  isPremium:         boolean;
  claimedByPlatform: boolean;
}

interface ClaimedDomain {
  id:              string;
  domain:          string;
  sld:             string;
  tld:             string;
  status:          string;
  registrarName:   string;
  nameserver1:     string;
  nameserver2:     string;
  expiresAt:       string | null;
  autoRenew:       boolean;
  createdAt:       string;
}

interface DnsZone {
  id:                string;
  domain:            string;
  status:            string;
  isVerified:        boolean;
  verificationToken: string;
  nameserver1:       string;
  nameserver2:       string;
  notes?:            string;
  createdAt:         string;
}

interface DnsRecord {
  id:        string;
  zoneId:    string;
  type:      string;
  name:      string;
  value:     string;
  ttl:       number;
  priority?: number;
  weight?:   number;
  port?:     number;
  tag?:      string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NS  = 'maxbooster.replit.app';
const NS1 = NS;
const NS2 = NS;
const PLATFORM_DOMAIN = 'maxboostermusic.com';

const FEATURED_TLDS = ['.com', '.io', '.music', '.band', '.studio', '.net', '.co', '.org'];

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const;

const TTL_OPTIONS = [
  { label: '1 minute',  value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '30 minutes',value: 1800 },
  { label: '1 hour',    value: 3600 },
  { label: '6 hours',   value: 21600 },
  { label: '12 hours',  value: 43200 },
  { label: '1 day',     value: 86400 },
  { label: '1 week',    value: 604800 },
];

const RECORD_HINTS: Record<string, { placeholder: string; description: string }> = {
  A:     { placeholder: '192.0.2.1',              description: 'IPv4 address this domain resolves to' },
  AAAA:  { placeholder: '2001:db8::1',             description: 'IPv6 address this domain resolves to' },
  CNAME: { placeholder: 'target.example.com',      description: 'Alias pointing to another hostname' },
  MX:    { placeholder: 'mail.example.com',         description: 'Mail server hostname (requires priority)' },
  TXT:   { placeholder: 'v=spf1 include:... ~all', description: 'Text record — SPF, DKIM, verification strings' },
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

const SYSTEM_TYPES = ['NS', 'SOA'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ttlLabel(v: number): string {
  const opt = TTL_OPTIONS.find(o => o.value === v);
  if (opt) return opt.label;
  if (v >= 86400) return `${v / 86400}d`;
  if (v >= 3600)  return `${v / 3600}h`;
  if (v >= 60)    return `${v / 60}m`;
  return `${v}s`;
}

function emptyRecord() {
  return { type: 'A', name: '@', value: '', ttl: 3600, priority: '', weight: '', port: '', tag: '' };
}

function domainStatusLabel(status: string): { label: string; color: string; icon: typeof CheckCircle2 } {
  switch (status) {
    case 'active':           return { label: 'Active',           color: 'text-green-600 border-green-400',  icon: CheckCircle2 };
    case 'platform_managed': return { label: 'DNS Managed',      color: 'text-blue-600 border-blue-400',    icon: Server };
    case 'pending':          return { label: 'Pending',          color: 'text-amber-600 border-amber-400',  icon: Clock };
    case 'expired':          return { label: 'Expired',          color: 'text-red-500 border-red-400',      icon: AlertCircle };
    default:                 return { label: status,             color: 'text-muted-foreground border-border', icon: Globe };
  }
}

// ── Sub-component: DNS Status Badge ──────────────────────────────────────────

function ZoneStatusBadge({ status, isVerified }: { status: string; isVerified: boolean }) {
  if (isVerified && status === 'active')
    return <Badge className="bg-green-600 text-white gap-1 text-[10px] px-1.5"><CheckCircle2 className="w-2.5 h-2.5" />Active</Badge>;
  if (status === 'pending')
    return <Badge variant="outline" className={`gap-1 text-[10px] px-1.5 text-amber-600 border-amber-400`}><Clock className="w-2.5 h-2.5" />Pending NS</Badge>;
  return <Badge variant="outline" className="gap-1 text-[10px] px-1.5 text-red-500 border-red-400"><AlertCircle className="w-2.5 h-2.5" />{status}</Badge>;
}

// ── Sub-component: Domain Search Result Row ───────────────────────────────────

function SearchResultRow({
  result,
  onClaim,
  claiming,
}: {
  result: DomainSearchResult;
  onClaim: (domain: string) => void;
  claiming: boolean;
}) {
  const tldColors: Record<string, string> = {
    '.com':    'text-blue-600',
    '.music':  'text-purple-600',
    '.band':   'text-pink-600',
    '.studio': 'text-orange-500',
    '.io':     'text-emerald-600',
    '.co':     'text-cyan-600',
  };
  const tldColor = tldColors[result.tld] ?? 'text-muted-foreground';

  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
      result.available
        ? 'border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-950/20 hover:border-green-400'
        : 'border-border bg-muted/20 opacity-60'
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        {result.available
          ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          : <XCircle      className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        }
        <span className="font-mono text-sm font-medium truncate">
          {result.domain.replace(result.tld, '')}
          <span className={`${tldColor} font-semibold`}>{result.tld}</span>
        </span>
        {result.isPremium && (
          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600 gap-1">
            <Star className="w-2.5 h-2.5" />Premium
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {result.available ? (
          <>
            <Badge className="bg-green-600/15 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800 text-[10px] gap-1 hidden sm:flex">
              <Sparkles className="w-2.5 h-2.5" />Included
            </Badge>
            <Button
              size="sm"
              className="h-7 text-xs px-3 gap-1"
              onClick={() => onClaim(result.domain)}
              disabled={claiming}
            >
              {claiming ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Claim Free
            </Button>
          </>
        ) : result.claimedByPlatform ? (
          <span className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Server className="w-3 h-3" />On Max Booster
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Taken</span>
        )}
      </div>
    </div>
  );
}

// ── Sub-component: DNS Zone Editor ────────────────────────────────────────────

function DnsZoneEditor({ zone, onBack, storefrontId, onCustomizeStorefront }: { zone: DnsZone; onBack: () => void; storefrontId?: string; onCustomizeStorefront?: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [editingRecord, setEditingRecord]       = useState<DnsRecord | null>(null);
  const [rec, setRec]                           = useState(emptyRecord());

  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['/api/dns-manager/zones', zone.id, 'records'],
    queryFn:  () => apiRequest('GET', `/api/dns-manager/zones/${zone.id}/records`).then(r => r.json()),
  });
  const records: DnsRecord[] = recordsData?.records ?? [];

  // ── Storefront URL link ──────────────────────────────────────────────────
  const { data: linkData, refetch: refetchLink } = useQuery({
    queryKey: ['/api/dns-manager/zones', zone.id, 'storefront-link'],
    queryFn:  () => apiRequest('GET', `/api/dns-manager/zones/${zone.id}/storefront-link`).then(r => r.json()),
  });
  const currentLink: { storefrontId: string; storefrontName: string; storefrontSlug: string; status: string } | null =
    linkData?.linked ?? null;

  const linkStorefront = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/dns-manager/zones/${zone.id}/use-as-storefront`, { storefrontId }).then(r => r.json()),
    onSuccess: (data) => {
      refetchLink();
      qc.invalidateQueries({ queryKey: ['/api/storefront/my'] });
      toast({ title: 'Storefront URL set!', description: `${zone.domain} is now your storefront URL.` });
    },
    onError: async (err: any) => {
      let msg = 'Failed to link domain';
      try { const d = await err.response?.json(); msg = d?.error ?? msg; } catch {}
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const unlinkStorefront = useMutation({
    mutationFn: () =>
      apiRequest('DELETE', `/api/dns-manager/zones/${zone.id}/use-as-storefront`).then(r => r.json()),
    onSuccess: () => {
      refetchLink();
      qc.invalidateQueries({ queryKey: ['/api/storefront/my'] });
      toast({ title: 'Storefront URL removed', description: `${zone.domain} is no longer your storefront URL.` });
    },
    onError: async (err: any) => {
      let msg = 'Failed to unlink domain';
      try { const d = await err.response?.json(); msg = d?.error ?? msg; } catch {}
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const verifyZone = useMutation({
    mutationFn: () => apiRequest('POST', `/api/dns-manager/zones/${zone.id}/verify`).then(r => r.json()),
    onSuccess:  (data) => {
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones'] });
      toast(data.verified
        ? { title: 'Domain verified & active!' }
        : { title: 'Not verified yet', description: data.message, variant: 'destructive' });
    },
  });

  const deleteZone = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/dns-manager/zones/${zone.id}`).then(r => r.json()),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones'] }); onBack(); toast({ title: 'Domain removed' }); },
  });

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast({ title: `Copied ${label}` });
  }

  function openEdit(r: DnsRecord) {
    setEditingRecord(r);
    setRec({ type: r.type, name: r.name, value: r.value, ttl: r.ttl, priority: r.priority?.toString() ?? '', weight: r.weight?.toString() ?? '', port: r.port?.toString() ?? '', tag: r.tag ?? '' });
    setShowRecordDialog(true);
  }

  function closeDialog() {
    setShowRecordDialog(false);
    setEditingRecord(null);
    setRec(emptyRecord());
  }

  const saveRecord = useMutation({
    mutationFn: () => {
      const body = {
        type: rec.type, name: rec.name, value: rec.value, ttl: rec.ttl,
        priority: rec.priority ? parseInt(rec.priority) : undefined,
        weight:   rec.weight   ? parseInt(rec.weight)   : undefined,
        port:     rec.port     ? parseInt(rec.port)     : undefined,
        tag:      rec.tag || undefined,
      };
      if (editingRecord)
        return apiRequest('PUT',  `/api/dns-manager/zones/${zone.id}/records/${editingRecord.id}`, body).then(r => r.json());
      return apiRequest('POST', `/api/dns-manager/zones/${zone.id}/records`, body).then(r => r.json());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones', zone.id, 'records'] }); closeDialog(); toast({ title: editingRecord ? 'Record updated' : 'Record added' }); },
    onError:   async (err: any) => {
      let msg = 'Failed to save record';
      try { const d = await err.response?.json(); msg = d?.error ?? msg; } catch {}
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const deleteRecord = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/dns-manager/zones/${zone.id}/records/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones', zone.id, 'records'] }); toast({ title: 'Record deleted' }); },
  });

  const showPriority = ['MX', 'SRV'].includes(rec.type);
  const showWeightPort = rec.type === 'SRV';
  const showTag = rec.type === 'CAA';
  const hint = RECORD_HINTS[rec.type] ?? { placeholder: '', description: '' };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1.5 h-7" onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5" /> All Domains
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="font-mono font-semibold text-sm">{zone.domain}</span>
        <ZoneStatusBadge status={zone.status} isVerified={zone.isVerified} />
        <div className="ml-auto flex gap-2">
          {!zone.isVerified && (
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => verifyZone.mutate()} disabled={verifyZone.isPending}>
              {verifyZone.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Check NS
            </Button>
          )}
          <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs text-red-500 hover:text-red-600"
            onClick={() => { if (confirm(`Remove ${zone.domain}?`)) deleteZone.mutate(); }}>
            <Trash2 className="w-3 h-3" /> Remove
          </Button>
        </div>
      </div>

      <Tabs defaultValue="records">
        <TabsList className="h-8">
          <TabsTrigger value="records"   className="text-xs">DNS Records</TabsTrigger>
          <TabsTrigger value="setup"     className="text-xs">Setup Guide</TabsTrigger>
          {storefrontId && (
            <TabsTrigger value="storefront" className="text-xs gap-1">
              <ShoppingBag className="w-3 h-3" />Storefront URL
              {currentLink && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
            </TabsTrigger>
          )}
        </TabsList>

        {/* DNS Records tab */}
        <TabsContent value="records" className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{records.length} record{records.length !== 1 ? 's' : ''}</p>
            <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => { setEditingRecord(null); setRec(emptyRecord()); setShowRecordDialog(true); }}>
              <Plus className="w-3 h-3" /> Add Record
            </Button>
          </div>

          {recordsLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : records.length === 0 ? (
            <div className="border border-dashed rounded-lg flex flex-col items-center py-8 text-center">
              <Server className="w-8 h-8 text-muted-foreground/25 mb-2" />
              <p className="text-sm font-semibold mb-1">No records yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">Add A, CNAME, MX and other records to control how your domain works.</p>
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
                            <button onClick={() => openEdit(r)} className="text-muted-foreground hover:text-foreground p-1">
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

        {/* Setup Guide tab */}
        <TabsContent value="setup" className="mt-3 space-y-3">
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</div>
              <p className="font-semibold text-sm">Point your nameservers to Max Booster</p>
            </div>
            <p className="text-xs text-muted-foreground">Log into your domain registrar and set the nameserver to:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-muted/60 rounded px-3 py-2 font-mono text-xs">
                <span className="text-muted-foreground w-8">NS</span>
                <span className="flex-1">{NS}</span>
                <button onClick={() => copy(NS, 'nameserver')} className="text-muted-foreground hover:text-foreground">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              DNS changes propagate within 1–48 hours.
            </p>
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</div>
              <p className="font-semibold text-sm">Verify ownership</p>
            </div>
            <p className="text-xs text-muted-foreground">Add this TXT record at your current DNS provider:</p>
            <div className="bg-muted/60 rounded px-3 py-2 font-mono text-xs flex items-center gap-2">
              <span className="flex-1 break-all">maxbooster-verify={zone.verificationToken}</span>
              <button onClick={() => copy(`maxbooster-verify=${zone.verificationToken}`, 'token')} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => verifyZone.mutate()} disabled={verifyZone.isPending}>
              {verifyZone.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Check Verification
            </Button>
          </div>

          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</div>
              <p className="font-semibold text-sm">Add your DNS records</p>
            </div>
            <p className="text-xs text-muted-foreground">Switch to DNS Records and configure your records:</p>
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
        {/* Storefront URL tab */}
        {storefrontId && (
          <TabsContent value="storefront" className="mt-3 space-y-4">
            {/* Verification gate */}
            {!zone.isVerified ? (
              <div className="border border-amber-300 dark:border-amber-800 rounded-lg p-4 bg-amber-50/40 dark:bg-amber-950/20 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Domain not verified yet</p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">
                      You must verify ownership of <span className="font-mono">{zone.domain}</span> before it can be used as your storefront URL.
                      Go to the <strong>Setup Guide</strong> tab to add the verification TXT record and check it.
                    </p>
                  </div>
                </div>
              </div>
            ) : currentLink ? (
              /* Already linked */
              <div className="border border-green-300 dark:border-green-800 rounded-lg p-4 bg-green-50/30 dark:bg-green-950/20 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-300">Active storefront URL</p>
                    <p className="text-xs text-green-700/80 dark:text-green-400/70 mt-0.5">
                      <span className="font-mono">{zone.domain}</span> is set as the public URL for{' '}
                      <strong>{currentLink.storefrontName}</strong>.
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <a
                        href={`https://${zone.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 hover:underline font-mono"
                      >
                        https://{zone.domain} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
                <div className="pt-1 border-t border-green-200 dark:border-green-800 flex items-center justify-between gap-2">
                  {onCustomizeStorefront && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs gap-1.5"
                      onClick={onCustomizeStorefront}
                    >
                      <ShoppingBag className="w-3 h-3" />
                      Customize Storefront
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 ml-auto"
                    onClick={() => { if (confirm(`Remove ${zone.domain} as your storefront URL?`)) unlinkStorefront.mutate(); }}
                    disabled={unlinkStorefront.isPending}
                  >
                    {unlinkStorefront.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
                    Remove URL link
                  </Button>
                </div>
              </div>
            ) : (
              /* Not yet linked */
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Use as storefront URL</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Set <span className="font-mono">{zone.domain}</span> as the public address customers use to reach your storefront.
                      This replaces the default <span className="font-mono">/storefront/…</span> URL.
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-md px-3 py-2 flex items-center gap-2 text-xs">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="font-mono text-foreground">{zone.domain}</span>
                  <span className="text-muted-foreground ml-auto">→ your storefront</span>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => linkStorefront.mutate()}
                    disabled={linkStorefront.isPending}
                  >
                    {linkStorefront.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                    Use as storefront URL
                  </Button>
                </div>
              </div>
            )}

            {/* Info callout */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-muted/40 border">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Your domain must point to Max Booster's nameservers for the storefront to load correctly.
                DNS changes can take up to 48 hours to propagate globally.
              </span>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Add / Edit Record Dialog */}
      <Dialog open={showRecordDialog} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Edit DNS Record' : 'Add DNS Record'}</DialogTitle>
            <DialogDescription>{zone.domain}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={rec.type} onValueChange={v => setRec(r => ({ ...r, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECORD_TYPES.map(t => <SelectItem key={t} value={t}><span className="font-mono">{t}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input className="mt-1 font-mono" placeholder="@ or subdomain" value={rec.name} onChange={e => setRec(r => ({ ...r, name: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground mt-0.5">@ = root domain</p>
              </div>
            </div>

            {hint.description && (
              <p className="text-xs text-blue-600 dark:text-blue-400 flex items-start gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded px-3 py-2">
                <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />{hint.description}
              </p>
            )}

            <div>
              <Label>Value</Label>
              <Input className="mt-1 font-mono" placeholder={hint.placeholder} value={rec.value} onChange={e => setRec(r => ({ ...r, value: e.target.value }))} />
            </div>

            {showTag && (
              <div>
                <Label>CAA Tag</Label>
                <Select value={rec.tag} onValueChange={v => setRec(r => ({ ...r, tag: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select tag" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issue">issue — authorize CA to issue certs</SelectItem>
                    <SelectItem value="issuewild">issuewild — authorize wildcard certs</SelectItem>
                    <SelectItem value="iodef">iodef — violation report URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={`grid gap-4 ${showWeightPort ? 'grid-cols-4' : showPriority ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <Label>TTL</Label>
                <Select value={rec.ttl.toString()} onValueChange={v => setRec(r => ({ ...r, ttl: parseInt(v) }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TTL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value.toString()}>{o.label}</SelectItem>)}</SelectContent>
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
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
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

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  storefrontId?: string;
  onCustomizeStorefront?: () => void;
}

export function StorefrontDnsZoneManager({ storefrontId, onCustomizeStorefront }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Tab control
  const [activeTab, setActiveTab] = useState('search');

  // Domain registrar state
  const [searchInput,    setSearchInput]    = useState('');
  const [searchName,     setSearchName]     = useState('');
  const [claimingDomain, setClaimingDomain] = useState<string | null>(null);

  // DNS zone manager state
  const [selectedZone, setSelectedZone] = useState<DnsZone | null>(null);
  const [showAddZone,  setShowAddZone]  = useState(false);
  const [newZoneDomain, setNewZoneDomain] = useState('');

  // Domain search query
  const { data: searchData, isFetching: searchLoading } = useQuery({
    queryKey: ['/api/domain-registrar/search', searchName],
    queryFn:  () => apiRequest('GET', `/api/domain-registrar/search?name=${encodeURIComponent(searchName)}`).then(r => r.json()),
    enabled:  searchName.length >= 2,
    staleTime: 30_000,
  });
  const searchResults: DomainSearchResult[] = searchData?.results ?? [];

  // My claimed domains
  const { data: myDomainsData, isLoading: myDomainsLoading } = useQuery({
    queryKey: ['/api/domain-registrar/my-domains'],
    queryFn:  () => apiRequest('GET', '/api/domain-registrar/my-domains').then(r => r.json()),
  });
  const myDomains: ClaimedDomain[] = myDomainsData?.domains ?? [];

  // DNS zones (for the DNS manager tab)
  const { data: zonesData, isLoading: zonesLoading } = useQuery({
    queryKey: ['/api/dns-manager/zones'],
    queryFn:  () => apiRequest('GET', '/api/dns-manager/zones').then(r => r.json()),
  });
  const zones: DnsZone[] = zonesData?.zones ?? [];

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast({ title: `Copied ${label}` });
  }

  function runSearch() {
    const name = searchInput.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (name.length >= 2) setSearchName(name);
  }

  // Claim domain mutation
  const claimDomain = useMutation({
    mutationFn: (domain: string) =>
      apiRequest('POST', '/api/domain-registrar/claim', { domain, storefrontId }).then(r => r.json()),
    onMutate:  (domain) => setClaimingDomain(domain),
    onSettled: () => setClaimingDomain(null),
    onSuccess: (data, domain) => {
      qc.invalidateQueries({ queryKey: ['/api/domain-registrar/my-domains'] });
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones'] });
      qc.invalidateQueries({ queryKey: ['/api/domain-registrar/search', searchName] });
      setActiveTab('mine');
      toast({
        title: `${domain} claimed!`,
        description: data.message ?? 'Your domain is active. DNS zone created — manage records in the DNS Records tab.',
      });
    },
    onError: async (err: any) => {
      let msg = 'Could not claim domain';
      try { const d = await err.response?.json(); msg = d?.error ?? msg; } catch {}
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  // Remove claimed domain
  const removeClaimed = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/domain-registrar/my-domains/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/domain-registrar/my-domains'] });
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones'] });
      toast({ title: 'Domain removed' });
    },
  });

  // Add DNS zone
  const addZone = useMutation({
    mutationFn: () => apiRequest('POST', '/api/dns-manager/zones', { domain: newZoneDomain }).then(r => r.json()),
    onSuccess:  (data) => {
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones'] });
      setShowAddZone(false);
      setNewZoneDomain('');
      setSelectedZone(data.zone);
      toast({ title: 'Domain added to DNS', description: 'Add records and update your nameservers.' });
    },
    onError: async (err: any) => {
      let msg = 'Failed to add domain';
      try { const d = await err.response?.json(); msg = d?.error ?? msg; } catch {}
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-5">

      {/* ── Nameservers Banner ───────────────────────────────────────────── */}
      <Card className="border-blue-200 dark:border-blue-900 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 dark:from-blue-950/30 dark:to-indigo-950/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-600 rounded-lg flex-shrink-0">
              <Server className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-0.5">
                Max Booster Nameservers
              </p>
              <p className="text-xs text-blue-700/70 dark:text-blue-400/70 mb-2.5">
                All registered domains are automatically configured. Own a domain elsewhere? Point it here.
              </p>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 font-mono text-xs border border-blue-200 dark:border-blue-800">
                  <span className="text-blue-400">NS</span>
                  <span className="text-blue-800 dark:text-blue-300">{NS}</span>
                  <button onClick={() => copy(NS, 'nameserver')} className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 transition-colors">
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 hidden sm:flex flex-col items-end gap-1">
              {[
                { icon: Shield, label: 'DNSSEC' },
                { icon: Zap,    label: 'TTL ≥ 60s' },
                { icon: Lock,   label: 'Privacy' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1 text-[10px] text-blue-600/70 dark:text-blue-400/70">
                  <Icon className="w-3 h-3" />{label}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Main Tabs ────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 w-full sm:w-auto">
          <TabsTrigger value="search"  className="text-xs gap-1.5 flex-1 sm:flex-none"><Search  className="w-3.5 h-3.5" />Find Domain</TabsTrigger>
          <TabsTrigger value="mine"    className="text-xs gap-1.5 flex-1 sm:flex-none"><Globe   className="w-3.5 h-3.5" />My Domains{myDomains.length > 0 && <Badge className="ml-1 text-[9px] h-4 px-1.5 bg-primary/20 text-primary border-primary/30">{myDomains.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="dns"     className="text-xs gap-1.5 flex-1 sm:flex-none"><Server  className="w-3.5 h-3.5" />DNS Records</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Domain Search ─────────────────────────────────────── */}
        <TabsContent value="search" className="mt-4 space-y-5">

          {/* Included badge */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200 dark:border-purple-900">
            <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">Domains included with Max Booster</p>
              <p className="text-xs text-purple-600/70 dark:text-purple-400/70">Register any domain — .com, .music, .band, .io and more — at no extra cost.</p>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 font-mono h-10"
                placeholder="Search for your domain name (e.g. mybeats)"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
              />
            </div>
            <Button className="h-10 px-5 gap-2" onClick={runSearch} disabled={searchInput.trim().length < 2 || searchLoading}>
              {searchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </Button>
          </div>

          {/* Platform subdomain (always show when there's a search) */}
          {searchName && (
            <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center gap-3 min-w-0">
                <Star className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold">{searchName}<span className="text-primary">.{PLATFORM_DOMAIN}</span></span>
                    <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Platform Subdomain</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Instant setup · No nameserver changes needed</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-3 gap-1 border-primary/40 text-primary hover:bg-primary/10 flex-shrink-0"
                onClick={() => claimDomain.mutate(`${searchName}.${PLATFORM_DOMAIN}`)}
                disabled={claimingDomain === `${searchName}.${PLATFORM_DOMAIN}`}
              >
                {claimingDomain === `${searchName}.${PLATFORM_DOMAIN}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Claim Free
              </Button>
            </div>
          )}

          {/* Search results */}
          {searchLoading && searchName && (
            <div className="space-y-2">
              {FEATURED_TLDS.map(tld => (
                <div key={tld} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          )}

          {!searchLoading && searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map(result => (
                <SearchResultRow
                  key={result.domain}
                  result={result}
                  onClaim={d => claimDomain.mutate(d)}
                  claiming={claimingDomain === result.domain}
                />
              ))}
            </div>
          )}

          {/* Tip when no search has been made */}
          {!searchName && (
            <div className="border border-dashed rounded-xl flex flex-col items-center py-10 text-center">
              <Globe className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="font-semibold text-sm mb-1">Find your domain</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Type any name above to see availability across .com, .music, .band, .io, .studio and more — all included with your plan.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {FEATURED_TLDS.map(tld => (
                  <Badge key={tld} variant="outline" className="text-[10px] font-mono">{tld}</Badge>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: My Domains ────────────────────────────────────────── */}
        <TabsContent value="mine" className="mt-4 space-y-3">
          {myDomainsLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : myDomains.length === 0 ? (
            <div className="border border-dashed rounded-xl flex flex-col items-center py-10 text-center">
              <Globe className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="font-semibold text-sm mb-1">No domains yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Use the Find Domain tab to search and claim domains included with your Max Booster subscription.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {myDomains.map(d => {
                const st = domainStatusLabel(d.status);
                const StatusIcon = st.icon;
                const matchedZone = zones.find(z => z.domain === d.domain);
                return (
                  <div key={d.id} className="flex items-center justify-between p-3.5 border rounded-lg hover:border-blue-300 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-medium">{d.domain}</span>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${st.color}`}>
                            <StatusIcon className="w-2.5 h-2.5" />{st.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            <Sparkles className="w-2.5 h-2.5 mr-0.5" />Included
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          via {d.registrarName === 'external' ? 'external registrar' : 'Max Booster'}
                          {d.expiresAt && ` · expires ${new Date(d.expiresAt).toLocaleDateString()}`}
                          {matchedZone && <span className="text-green-600 dark:text-green-400"> · DNS zone active</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {matchedZone ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2.5 gap-1 border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                          onClick={() => { setSelectedZone(matchedZone); setActiveTab('dns'); }}
                        >
                          <Server className="w-3 h-3" />Manage DNS
                        </Button>
                      ) : d.status === 'platform_managed' ? (
                        <span className="text-[10px] text-muted-foreground hidden sm:block">Point NS to Max Booster</span>
                      ) : null}
                      <button
                        onClick={() => { if (confirm(`Remove ${d.domain}?`)) removeClaimed.mutate(d.id); }}
                        className="text-red-400 hover:text-red-600 p-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Nameserver reminder if user has platform_managed domains */}
          {myDomains.some(d => d.status === 'platform_managed') && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-400">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Some domains are managed externally. Log into your registrar and set the nameserver to{' '}
                <strong>{NS}</strong> to activate Max Booster DNS.
              </span>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: DNS Records (zone manager) ───────────────────────── */}
        <TabsContent value="dns" className="mt-4 space-y-3">
          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: Shield, label: 'A · AAAA · CNAME · MX · TXT · SRV · NS · CAA' },
              { icon: Zap,    label: 'TTL as low as 60s' },
              { icon: Globe,  label: 'Unlimited records' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1 text-muted-foreground">
                <Icon className="w-3 h-3" />{label}
              </div>
            ))}
          </div>

          {selectedZone ? (
            <DnsZoneEditor zone={selectedZone} onBack={() => setSelectedZone(null)} storefrontId={storefrontId} onCustomizeStorefront={onCustomizeStorefront} />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Hosted DNS Zones</p>
                  <p className="text-xs text-muted-foreground">Manage DNS records for any domain — including external ones</p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => setShowAddZone(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add Domain
                </Button>
              </div>

              {zonesLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
                </div>
              ) : zones.length === 0 ? (
                <div className="border border-dashed rounded-xl flex flex-col items-center py-10 text-center">
                  <Server className="w-10 h-10 text-muted-foreground/20 mb-3" />
                  <p className="font-semibold text-sm mb-1">No DNS zones yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Add a domain to manage its DNS records directly from Max Booster. After adding, point your nameservers here.
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
                      className="flex items-center justify-between p-3.5 border rounded-lg cursor-pointer hover:border-blue-400 transition-colors"
                      onClick={() => setSelectedZone(zone)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-mono text-sm truncate">{zone.domain}</span>
                        <ZoneStatusBadge status={zone.status} isVerified={zone.isVerified} />
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Add DNS Zone Dialog */}
      <Dialog open={showAddZone} onOpenChange={setShowAddZone}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Domain to DNS</DialogTitle>
            <DialogDescription>
              Enter a domain you own. After adding it, update its nameservers at your registrar to point to Max Booster.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Domain Name</Label>
            <Input
              className="mt-1 font-mono"
              placeholder="yourdomain.com"
              value={newZoneDomain}
              onChange={e => setNewZoneDomain(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newZoneDomain.trim()) addZone.mutate(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddZone(false)}>Cancel</Button>
            <Button onClick={() => addZone.mutate()} disabled={!newZoneDomain.trim() || addZone.isPending}>
              {addZone.isPending && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              Add Domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
