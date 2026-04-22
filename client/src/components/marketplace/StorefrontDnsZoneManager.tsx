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

const PLATFORM_DOMAIN = 'max-booster.com';
const NS              = PLATFORM_DOMAIN;
const NS1             = `ns1.${PLATFORM_DOMAIN}`;
const NS2             = `ns2.${PLATFORM_DOMAIN}`;
// Artist stores live at {label}.max-booster.com — resolved via wildcard A/CNAME at registrar.
// The domain value stored in DB is {label}.max-booster.com.
const platformStoreUrl = (label: string) => `https://${label}.${PLATFORM_DOMAIN}`;

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
  atLimit,
  hasSubscription,
}: {
  result: DomainSearchResult;
  onClaim: (domain: string) => void;
  claiming: boolean;
  atLimit?: boolean;
  hasSubscription?: boolean;
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
            {!hasSubscription ? (
              <span className="text-[11px] text-amber-600 font-medium">Subscribe to claim</span>
            ) : atLimit ? (
              <span className="text-[11px] text-orange-600 font-medium">Limit reached</span>
            ) : (
              <Button
                size="sm"
                className="h-7 text-xs px-3 gap-1"
                onClick={() => onClaim(result.domain)}
                disabled={claiming}
              >
                {claiming ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Claim Free
              </Button>
            )}
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

  const linkQKey = ['/api/dns-manager/zones', zone.id, 'storefront-link'];

  const linkStorefront = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/dns-manager/zones/${zone.id}/use-as-storefront`, { storefrontId }).then(r => r.json()),
    onSuccess: (data) => {
      // Immediately write the known result into the cache so the UI flips
      // to "Active" without waiting for a round-trip (staleTime would block refetch).
      qc.setQueryData(linkQKey, {
        zone: { id: zone.id, domain: zone.domain, isVerified: zone.isVerified, status: zone.status },
        linked: {
          storefrontId: data.storefrontId,
          storefrontName: data.storefrontName,
          storefrontSlug: data.storefrontSlug,
          status: 'active',
        },
      });
      // Then force a background refetch so the cache stays in sync.
      qc.invalidateQueries({ queryKey: linkQKey, refetchType: 'active' });
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
      // Clear the cached link immediately, then force a refetch.
      qc.setQueryData(linkQKey, {
        zone: { id: zone.id, domain: zone.domain, isVerified: zone.isVerified, status: zone.status },
        linked: null,
      });
      qc.invalidateQueries({ queryKey: linkQKey, refetchType: 'active' });
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

          {zone.isVerified ? (
            /* ── Max Booster-registered: already active, no verification needed ── */
            <>
              <div className="border border-green-300 dark:border-green-800 rounded-lg p-4 bg-green-50/30 dark:bg-green-950/20 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">Domain active — no verification needed</p>
                  <p className="text-xs text-green-700/80 dark:text-green-400/70 mt-0.5">
                    <span className="font-mono">{zone.domain}</span> was registered through Max Booster. Your subscription covers this domain — it's ready to use immediately.
                  </p>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</div>
                  <p className="font-semibold text-sm">Add your DNS records</p>
                </div>
                <p className="text-xs text-muted-foreground">Switch to the DNS Records tab and configure your records:</p>
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
            </>
          ) : (
            /* ── BYOD / external transfer: needs NS delegation + TXT verification ── */
            <>
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</div>
                  <p className="font-semibold text-sm">Point your nameservers to Max Booster</p>
                </div>
                <p className="text-xs text-muted-foreground">Log into your current registrar and set the nameserver to:</p>
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
                <p className="text-xs text-muted-foreground">Add this TXT record at your current DNS provider to confirm you control this domain:</p>
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
            </>
          )}
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
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Transfer verification required</p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">
                      You need to verify ownership of <span className="font-mono">{zone.domain}</span> before it can be used as your storefront URL.
                      Since this domain was transferred from an external registrar, go to the <strong>Setup Guide</strong> tab, add the TXT record at your current registrar, and click <strong>Check Verification</strong>.
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

  // Domain usage (subscription perk: up to 2 custom domains)
  const { data: usageData } = useQuery({
    queryKey: ['/api/dns-manager/usage'],
    queryFn:  () => apiRequest('GET', '/api/dns-manager/usage').then(r => r.json()),
  });
  const domainLimit: number        = usageData?.limit         ?? 2;
  const domainsUsed: number        = usageData?.used          ?? 0;
  const domainsRemaining: number   = usageData?.remaining     ?? 2;
  const hasSubscription: boolean   = usageData?.hasSubscription ?? false;
  const atLimit: boolean           = domainsRemaining <= 0;

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
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/usage'] });
      qc.invalidateQueries({ queryKey: ['/api/domain-registrar/search', searchName] });
      setActiveTab('mine');
      const isPlatformSubdomain = domain.endsWith(`.${PLATFORM_DOMAIN}`);
      const label = isPlatformSubdomain ? domain.replace(`.${PLATFORM_DOMAIN}`, '') : null;
      toast({
        title: `${isPlatformSubdomain && label ? `${label}.${PLATFORM_DOMAIN}` : domain} claimed!`,
        description: isPlatformSubdomain && label
          ? `Your store is live at https://${label}.${PLATFORM_DOMAIN} — no DNS setup required.`
          : (data.message ?? 'Your domain is active. DNS zone created — manage records in the DNS Records tab.'),
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
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/usage'] });
      toast({ title: 'Domain removed' });
    },
  });

  // Add DNS zone
  const addZone = useMutation({
    mutationFn: () => apiRequest('POST', '/api/dns-manager/zones', { domain: newZoneDomain }).then(r => r.json()),
    onSuccess:  (data) => {
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/zones'] });
      qc.invalidateQueries({ queryKey: ['/api/dns-manager/usage'] });
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

      {/* ── Two-path onboarding banner ───────────────────────────────────── */}
      <Card className="border-blue-200 dark:border-blue-900 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 dark:from-blue-950/30 dark:to-indigo-950/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">

            {/* Path A — new domain */}
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-colors cursor-pointer ${
                activeTab === 'search'
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-white/60 dark:bg-slate-900/40 hover:border-primary/50'
              }`}
            >
              <div className="p-1.5 bg-primary/10 rounded-md flex-shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-sm font-semibold">New to domains?</p>
                  <Badge className="text-[9px] h-4 px-1.5 bg-green-600/15 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700">Recommended</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Get your first domain through Max Booster — instant setup, no extra configuration needed.</p>
              </div>
            </button>

            {/* Divider */}
            <div className="hidden sm:flex flex-col items-center gap-1 flex-shrink-0 text-muted-foreground/40">
              <div className="w-px h-6 bg-border" />
              <span className="text-[10px] font-medium">OR</span>
              <div className="w-px h-6 bg-border" />
            </div>
            <div className="sm:hidden flex items-center gap-2 text-muted-foreground/40">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-medium">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Path B — transfer */}
            <button
              onClick={() => setActiveTab('dns')}
              className={`flex-1 flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-colors cursor-pointer ${
                activeTab === 'dns'
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-border bg-white/60 dark:bg-slate-900/40 hover:border-blue-400/50'
              }`}
            >
              <div className="p-1.5 bg-blue-600/10 rounded-md flex-shrink-0">
                <Server className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold mb-0.5">Already have a domain?</p>
                <p className="text-xs text-muted-foreground">Transfer from GoDaddy, Namecheap, or any registrar — point your nameservers here.</p>
              </div>
            </button>

          </div>
        </CardContent>
      </Card>

      {/* ── Domain usage bar ─────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-xs ${
        atLimit
          ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'
          : !hasSubscription
          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
          : 'bg-muted/40 border-border'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Globe className={`w-3.5 h-3.5 flex-shrink-0 ${atLimit ? 'text-orange-500' : !hasSubscription ? 'text-amber-500' : 'text-muted-foreground'}`} />
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Custom Domains</span>
            <span className="text-muted-foreground">— {domainLimit} included with subscription</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {!hasSubscription ? (
            <span className="text-amber-600 font-medium">Subscribe to unlock</span>
          ) : atLimit ? (
            <span className="text-orange-600 font-medium">Limit reached ({domainsUsed}/{domainLimit})</span>
          ) : (
            <span className={domainsUsed > 0 ? 'font-medium' : 'text-muted-foreground'}>
              {domainsUsed} of {domainLimit} used
            </span>
          )}
          <div className="flex gap-0.5">
            {Array.from({ length: domainLimit }).map((_, i) => (
              <div key={i} className={`w-5 h-2 rounded-sm ${i < domainsUsed ? (atLimit ? 'bg-orange-500' : 'bg-green-500') : 'bg-muted-foreground/20'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Tabs ────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 w-full sm:w-auto">
          <TabsTrigger value="search"  className="text-xs gap-1.5 flex-1 sm:flex-none"><Sparkles className="w-3.5 h-3.5" />Get a Domain</TabsTrigger>
          <TabsTrigger value="mine"    className="text-xs gap-1.5 flex-1 sm:flex-none"><Globe    className="w-3.5 h-3.5" />My Domains{myDomains.length > 0 && <Badge className="ml-1 text-[9px] h-4 px-1.5 bg-primary/20 text-primary border-primary/30">{myDomains.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="dns"     className="text-xs gap-1.5 flex-1 sm:flex-none"><Server   className="w-3.5 h-3.5" />Transfer Domain</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Get a Domain (primary / first-time owner path) ───────── */}
        <TabsContent value="search" className="mt-4 space-y-5">

          {/* First-time owner intro */}
          <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-purple-50/40 dark:from-primary/10 dark:to-purple-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/15 rounded-md">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Your first domain — included free</p>
                <p className="text-xs text-muted-foreground">Max Booster is your domain provider. Claim up to {domainLimit} domains with your subscription — no registrar account needed.</p>
              </div>
              {atLimit && (
                <Badge variant="outline" className="ml-auto flex-shrink-0 text-[10px] border-orange-400 text-orange-600">Limit reached</Badge>
              )}
            </div>

            {/* Two quick-start options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/50 border border-border">
                <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary mt-0.5">1</div>
                <div>
                  <p className="text-xs font-semibold">Platform subdomain</p>
                  <p className="text-[11px] text-muted-foreground">yourname.{PLATFORM_DOMAIN} — live in seconds, zero DNS setup</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/70 dark:bg-slate-900/50 border border-border">
                <div className="w-5 h-5 rounded-full bg-purple-600/15 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-purple-600 mt-0.5">2</div>
                <div>
                  <p className="text-xs font-semibold">Custom domain</p>
                  <p className="text-[11px] text-muted-foreground">.com, .music, .band, .io — fully managed by Max Booster</p>
                </div>
              </div>
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
                    <span className="font-mono text-sm font-semibold">
                      <span className="text-primary">{searchName}</span>
                      <span className="text-muted-foreground">.{PLATFORM_DOMAIN}</span>
                    </span>
                    <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Platform Subdomain</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Instant setup · Your store loads at{' '}
                    <span className="font-mono text-primary">{searchName}.{PLATFORM_DOMAIN}</span>
                  </p>
                </div>
              </div>
              {!hasSubscription ? (
                <span className="text-[11px] text-amber-600 font-medium flex-shrink-0">Subscribe to claim</span>
              ) : atLimit ? (
                <span className="text-[11px] text-orange-600 font-medium flex-shrink-0">Limit reached</span>
              ) : (
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
              )}
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
                  atLimit={atLimit}
                  hasSubscription={hasSubscription}
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
            <div className="border border-dashed rounded-xl flex flex-col items-center py-10 text-center px-4">
              <Globe className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="font-semibold text-sm mb-1">No domains yet</p>
              <p className="text-xs text-muted-foreground max-w-xs mb-4">
                Up to {domainLimit} custom domains are included with your subscription — no separate registrar needed.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button size="sm" className="gap-1.5 text-xs" onClick={() => setActiveTab('search')}>
                  <Sparkles className="w-3.5 h-3.5" /> Get your first domain
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setActiveTab('dns')}>
                  <Server className="w-3.5 h-3.5" /> Transfer an existing domain
                </Button>
              </div>
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
                      {d.domain.endsWith(`.${PLATFORM_DOMAIN}`) && (() => {
                        const label = d.domain.replace(`.${PLATFORM_DOMAIN}`, '');
                        return (
                          <a
                            href={`https://${label}.${PLATFORM_DOMAIN}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline px-2.5 py-1 rounded border border-primary/30 hover:bg-primary/5 transition-colors"
                          >
                            <Globe className="w-3 h-3" />Open Store
                          </a>
                        );
                      })()}
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

          {/* Nameserver reminder if user has platform_managed (transferred) domains awaiting NS update */}
          {myDomains.some(d => d.status === 'platform_managed') && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-400">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Nameserver update pending</p>
                <p>
                  One or more transferred domains are waiting for a nameserver update. Log in to your current registrar and set the nameserver to{' '}
                  <strong className="font-mono">{NS}</strong> to complete the transfer. Propagation takes 24–48 hours.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: Transfer Domain (secondary / existing-owner path) ────── */}
        <TabsContent value="dns" className="mt-4 space-y-4">

          {/* Transfer steps */}
          {!selectedZone && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 dark:from-blue-950/30 dark:to-indigo-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <p className="text-sm font-semibold">Transfer your existing domain</p>
                <Badge variant="outline" className="ml-auto text-[10px] border-blue-300 text-blue-600">GoDaddy · Namecheap · any registrar</Badge>
              </div>
              <div className="space-y-2">
                {[
                  { step: '1', label: 'Add your domain below', desc: 'Enter the domain you own at another registrar — Max Booster creates a hosted DNS zone for it.' },
                  { step: '2', label: 'Copy the nameserver', desc: `Log into your registrar's control panel and replace its current nameservers with Max Booster's NS.` },
                  { step: '3', label: 'Point to Max Booster', desc: `Set nameserver to: ${NS} — propagation takes 24–48 hours; your DNS records are live immediately.` },
                ].map(({ step, label, desc }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-600/15 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-blue-700 dark:text-blue-400 mt-0.5">{step}</div>
                    <div>
                      <p className="text-xs font-semibold">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* NS copy row */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 font-mono text-xs border border-blue-200 dark:border-blue-800 flex-1 min-w-0 overflow-hidden">
                  <span className="text-blue-400 flex-shrink-0">NS</span>
                  <span className="text-blue-800 dark:text-blue-300 truncate">{NS}</span>
                  <button onClick={() => copy(NS, 'nameserver')} className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 transition-colors flex-shrink-0 ml-auto">
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="hidden sm:flex flex-col gap-0.5 text-[10px] text-blue-600/60 dark:text-blue-400/60 flex-shrink-0">
                  <span className="flex items-center gap-0.5"><Shield className="w-2.5 h-2.5" />DNSSEC</span>
                  <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />TTL ≥ 60s</span>
                </div>
              </div>
            </div>
          )}

          {/* Feature pills (compact, only when no zone selected) */}
          {!selectedZone && (
            <div className="flex flex-wrap gap-2">
              {[
                { icon: Shield, label: 'A · AAAA · CNAME · MX · TXT · SRV · NS · CAA' },
                { icon: Globe,  label: 'Unlimited records per zone' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1 text-muted-foreground">
                  <Icon className="w-3 h-3" />{label}
                </div>
              ))}
            </div>
          )}

          {selectedZone ? (
            <DnsZoneEditor zone={selectedZone} onBack={() => setSelectedZone(null)} storefrontId={storefrontId} onCustomizeStorefront={onCustomizeStorefront} />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Your Transferred Domains</p>
                  <p className="text-xs text-muted-foreground">Domains you've moved to Max Booster DNS</p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowAddZone(true)}
                  disabled={atLimit || !hasSubscription}
                  title={!hasSubscription ? 'Subscription required' : atLimit ? `Limit reached (${domainsUsed}/${domainLimit})` : undefined}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {atLimit ? `${domainsUsed}/${domainLimit} Used` : 'Add Domain'}
                </Button>
              </div>

              {zonesLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
                </div>
              ) : zones.length === 0 ? (
                <div className="border border-dashed rounded-xl flex flex-col items-center py-10 text-center px-4">
                  <Server className="w-10 h-10 text-muted-foreground/20 mb-3" />
                  <p className="font-semibold text-sm mb-1">No transferred domains yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Add a domain you own at another registrar — Max Booster will host its DNS records and you just update your nameserver once.
                  </p>
                  <Button
                    size="sm"
                    className="mt-4 gap-1.5"
                    onClick={() => setShowAddZone(true)}
                    disabled={atLimit || !hasSubscription}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {!hasSubscription ? 'Subscribe to Transfer' : atLimit ? 'Limit Reached' : 'Add My Domain'}
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
            <DialogTitle>Transfer Domain to Max Booster</DialogTitle>
            <DialogDescription>
              Enter a domain you already own at GoDaddy, Namecheap, or any other registrar. Max Booster will host its DNS records — then update your nameserver once to complete the transfer.
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
