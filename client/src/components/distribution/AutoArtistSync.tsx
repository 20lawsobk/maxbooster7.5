import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, ExternalLink, ChevronDown, ChevronUp,
  Loader2, Globe, Info, Key, Wrench, Music2, AlertCircle,
  RefreshCw, Search, Edit2, Save, X, Zap, BarChart2,
  Shield, Download, Upload, Link2, Activity, Network,
  Dna, History, ScanSearch, GitBranch, Hash, Star,
  TriangleAlert, Fingerprint, BookOpen, Share2, Disc3, SendHorizonal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ArtistProfile {
  id: string;
  artistName: string;
  spotifyArtistId: string | null;
  spotifyArtistUri: string | null;
  appleArtistId: string | null;
  deezerArtistId: string | null;
  soundcloudArtistId: string | null;
  profileImageUrl: string | null;
  genres: string[];
  isVerified: boolean;
  fixerPending: boolean;
  fixerStatus: string;
}

interface Portal {
  key: string;
  label: string;
  portalUrl: string;
  artistPageUrl: string | null;
  fieldKey: string | null;
  claimed: boolean;
  artistId: string | null;
  howVerified: string;
  claimInstructions: string;
  distributorHandles: boolean;
  autoDiscoverKey: string | null;
}

interface PlatformUrlDiscovery {
  platform: string;
  platformLabel: string;
  searchUrl: string;
  method: 'url_template';
}

interface HubData {
  artistName: string;
  profileImageUrl: string | null;
  genres: string[];
  isVerified: boolean;
  verifiedPlatforms: string[];
  portals: Portal[];
  metadataKeys: {
    artistName: string;
    storedIds: Record<string, string>;
  };
  urlDiscoveries: PlatformUrlDiscovery[];
  labelgridConfigured: boolean;
}

interface DiscoverResult {
  result: {
    id?: string;
    uri?: string;
    name: string;
    imageUrl?: string | null;
    artworkUrl?: string | null;
    pictureUrl?: string | null;
    genres?: string[];
    followers?: number;
    fans?: number;
    popularity?: number;
    externalUrl?: string;
    link?: string;
    url?: string;
    slug?: string;
  };
  confidence: number;
}

type DiscoverPayload = {
  spotify: DiscoverResult | null;
  apple: DiscoverResult | null;
  deezer: DiscoverResult | null;
  musicbrainz: DiscoverResult | null;
  audiomack: DiscoverResult | null;
  jiosaavn: DiscoverResult | null;
  saved: boolean;
  savedFields: string[];
  upcDiscovered?: boolean;
};

interface CatalogRelease {
  id: string;
  title: string;
  artist: string;
  releaseDate: string | null;
  upc: string | null;
  coverUrl: string | null;
  releaseType: 'album' | 'ep' | 'single';
  trackCount: number;
  genre: string | null;
  platforms: string[];
  tracks: {
    id: string;
    title: string;
    isrc: string | null;
    trackNumber: number;
    duration: number | null;
  }[];
  alreadyDistributed: boolean;
}

interface Props {
  profile: ArtistProfile;
  onUpdated: () => void;
}

const PORTAL_ICONS: Record<string, string> = {
  spotify:    '🎵',
  apple:      '🍎',
  amazon:     '🛒',
  youtube:    '▶',
  deezer:     '🎶',
  tidal:      '🌊',
  pandora:    '📻',
  soundcloud: '☁️',
};

const PORTAL_COLORS: Record<string, string> = {
  spotify:    'text-green-500',
  apple:      'text-pink-500',
  amazon:     'text-blue-400',
  youtube:    'text-red-500',
  deezer:     'text-purple-500',
  tidal:      'text-cyan-400',
  pandora:    'text-indigo-400',
  soundcloud: 'text-orange-400',
};

const CONFIDENCE_COLOR = (c: number) => {
  if (c >= 85) return 'bg-green-500';
  if (c >= 65) return 'bg-blue-500';
  if (c >= 50) return 'bg-yellow-500';
  return 'bg-red-400';
};

const CONFIDENCE_LABEL = (c: number) => {
  if (c >= 85) return 'High confidence';
  if (c >= 65) return 'Good match';
  if (c >= 50) return 'Possible match';
  return 'Low confidence';
};

export default function AutoArtistSync({ profile, onUpdated }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [dspGridOpen, setDspGridOpen] = useState(false);
  const [fixerOpen, setFixerOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverUpc, setDiscoverUpc] = useState('');
  const [discoverResults, setDiscoverResults] = useState<DiscoverPayload | null>(null);
  const [discoverRunning, setDiscoverRunning] = useState(false);
  const [fixerUri, setFixerUri] = useState('');
  const [fixerNotes, setFixerNotes] = useState('');
  const [fixerUriError, setFixerUriError] = useState('');

  const [editingPortal, setEditingPortal] = useState<string | null>(null);
  const [editingId, setEditingId] = useState('');
  const [instructionsOpen, setInstructionsOpen] = useState<string | null>(null);

  // ── New Phase 1-3 state ────────────────────────────────────────────────────
  const [healthOpen, setHealthOpen] = useState(false);
  const [isrcDiscoverOpen, setIsrcDiscoverOpen] = useState(false);
  const [isrcResults, setIsrcResults] = useState<Record<string, unknown> | null>(null);
  const [isrcRunning, setIsrcRunning] = useState(false);
  const [splitScanOpen, setSplitScanOpen] = useState(false);
  const [splitResults, setSplitResults] = useState<Record<string, unknown> | null>(null);
  const [splitRunning, setSplitRunning] = useState(false);
  const [dnaOpen, setDnaOpen] = useState(false);
  const [dnaSnapRunning, setDnaSnapRunning] = useState(false);
  const [portabilityOpen, setPortabilityOpen] = useState(false);
  const [portabilityRunning, setPortabilityRunning] = useState(false);
  const [portabilityReport, setPortabilityReport] = useState<Record<string, unknown> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSource, setImportSource] = useState('');
  const [importIsrcs, setImportIsrcs] = useState('');
  const [importUpcs, setImportUpcs] = useState('');
  const [handleOpen, setHandleOpen] = useState(false);
  const [handlePlatform, setHandlePlatform] = useState<string>('instagram');
  const [handleValue, setHandleValue] = useState('');
  const [multiFixerOpen, setMultiFixerOpen] = useState(false);
  const [multiFixerIds, setMultiFixerIds] = useState<Record<string, string>>({});
  const [graphOpen, setGraphOpen] = useState(false);
  const [watchRunning, setWatchRunning] = useState(false);

  // ── Catalog Scanner ───────────────────────────────────────────────────────
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogReleases, setCatalogReleases] = useState<CatalogRelease[] | null>(null);
  const [catalogRunning, setCatalogRunning] = useState(false);
  const [distributingId, setDistributingId] = useState<string | null>(null);

  const { data: hub, isLoading, refetch: refetchHub } = useQuery<HubData>({
    queryKey: [`/api/artist-profiles/${profile.id}/profile-hub`],
    queryFn: () => apiRequest('GET', `/api/artist-profiles/${profile.id}/profile-hub`).then(r => r.json()),
  });

  const savePlatformMutation = useMutation({
    mutationFn: (updates: Record<string, string | null>) =>
      apiRequest('PATCH', `/api/artist-profiles/${profile.id}`, updates).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/profile-hub`] });
      queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/health`] });
      setEditingPortal(null);
      setEditingId('');
      onUpdated();
      toast({ title: 'Artist ID saved' });
    },
    onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/auto-sync`).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/profile-hub`] });
      queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/health`] });
      onUpdated();
      const synced = data.synced ?? [];
      toast({
        title: 'Metadata synced',
        description: synced.length > 0
          ? `Updated from: ${synced.join(', ')}`
          : 'No changes found',
      });
      // Breakthrough: auto-capture DNA snapshot after every successful sync
      apiRequest('POST', `/api/artist-profiles/${profile.id}/dna-snapshot`, {
        triggeredBy: 'auto-sync',
        notes: synced.length > 0 ? `Auto-snapshot after syncing from: ${synced.join(', ')}` : 'Auto-snapshot after sync (no changes)',
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/dna-snapshots`] });
      }).catch(() => {});
    },
    onError: () => toast({ title: 'Sync failed', variant: 'destructive' }),
  });

  const fixerMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/fixer`, {
        targetSpotifyUri: fixerUri,
        notes: fixerNotes,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/health`] });
      onUpdated();
      setFixerOpen(false);
      toast({ title: 'Re-mapping request submitted', description: 'Will be applied to future releases' });
    },
    onError: (err: Error) => toast({
      title: 'Request failed',
      description: err?.message ?? 'Check that the Spotify URI is valid',
      variant: 'destructive',
    }),
  });

  // ── Phase 2: Health Score ──────────────────────────────────────────────────
  const { data: healthData, refetch: refetchHealth, isLoading: healthLoading } = useQuery<{
    score: number; breakdown: Record<string, number>; recommendations: string[]; grade: string;
  }>({
    queryKey: [`/api/artist-profiles/${profile.id}/health`],
    queryFn: () => apiRequest('GET', `/api/artist-profiles/${profile.id}/health`).then(r => r.json()),
    staleTime: 60_000,
  });

  // ── Phase 1: Claim Pipeline ───────────────────────────────────────────────
  const { data: pipelineData, refetch: refetchPipeline } = useQuery<{ pipeline: unknown[] }>({
    queryKey: [`/api/artist-profiles/${profile.id}/claim-pipeline`],
    queryFn: () => apiRequest('GET', `/api/artist-profiles/${profile.id}/claim-pipeline`).then(r => r.json()),
    staleTime: 30_000,
  });

  const updateClaimMutation = useMutation({
    mutationFn: (data: { platform: string; state: string; notes?: string }) =>
      apiRequest('PATCH', `/api/artist-profiles/${profile.id}/claim-state`, data).then(r => r.json()),
    onSuccess: (_, variables) => {
      refetchPipeline();
      queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/health`] });
      toast({ title: 'Claim progress updated' });
      // Breakthrough: auto-init pipeline to 'instructions_read' the first time a portal is claimed
      if (variables.state === 'portal_claimed' || variables.state === 'instructions_read') {
        queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      }
    },
  });

  // ── Phase 3: DNA Snapshots ────────────────────────────────────────────────
  const { data: dnaData, refetch: refetchDna } = useQuery<{ snapshots: unknown[] }>({
    queryKey: [`/api/artist-profiles/${profile.id}/dna-snapshots`],
    queryFn: () => apiRequest('GET', `/api/artist-profiles/${profile.id}/dna-snapshots`).then(r => r.json()),
    staleTime: 60_000,
    enabled: dnaOpen,
  });

  // ── Phase 2: Identity Graph ───────────────────────────────────────────────
  const { data: graphData, refetch: refetchGraph } = useQuery<{
    nodes: Record<string, unknown>[]; links: Record<string, unknown>[]; confirmationScore: number;
  }>({
    queryKey: [`/api/artist-profiles/${profile.id}/identity-graph`],
    queryFn: () => apiRequest('GET', `/api/artist-profiles/${profile.id}/identity-graph`).then(r => r.json()),
    staleTime: 60_000,
    enabled: graphOpen,
  });

  // ── Multi-platform Fixer ──────────────────────────────────────────────────
  const multiFixerMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/fixer-multi`, {
        targetPlatformIds: multiFixerIds,
        notes: fixerNotes,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      onUpdated();
      setMultiFixerOpen(false);
      setMultiFixerIds({});
      toast({ title: 'Multi-platform re-mapping submitted', description: 'Will apply to future releases on all selected platforms' });
    },
    onError: (err: Error) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  // ── Social Handle Resolver ────────────────────────────────────────────────
  const resolveHandleMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/resolve-handle`, {
        platform: handlePlatform,
        handle: handleValue,
      }).then(r => r.json()),
    onSuccess: (data: Record<string, unknown>) => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      onUpdated();
      setHandleValue('');
      toast({ title: data.saved ? 'Handle linked' : 'Profile URL generated', description: data.profileUrl });
    },
    onError: () => toast({ title: 'Handle resolution failed', variant: 'destructive' }),
  });

  // ── Import History ────────────────────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/import-history`, {
        sourceDistributor: importSource,
        isrcList: importIsrcs.split(/[\n,\s]+/).filter(s => s.trim().length === 12),
        upcList: importUpcs.split(/[\n,\s]+/).filter(s => s.trim().length >= 8),
      }).then(r => r.json()),
    onSuccess: (data: Record<string, unknown>) => {
      setImportSource(''); setImportIsrcs(''); setImportUpcs('');
      setImportOpen(false);
      toast({ title: 'Import queued', description: `${data.isrcsQueued} ISRCs + ${data.upcsQueued} UPCs submitted for discovery` });
    },
    onError: () => toast({ title: 'Import failed', variant: 'destructive' }),
  });

  // ── ISRC Chain Discovery ──────────────────────────────────────────────────
  const handleIsrcDiscover = async () => {
    setIsrcRunning(true);
    setIsrcResults(null);
    try {
      const res = await apiRequest('POST', `/api/artist-profiles/${profile.id}/isrc-discover`);
      const data = await res.json();
      setIsrcResults(data);
      if (data.savedFields?.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
        queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/profile-hub`] });
        onUpdated();
      }
      toast({
        title: 'ISRC chain discovery complete',
        description: data.savedFields?.length > 0
          ? `Linked: ${data.savedFields.join(', ')}`
          : data.isrcsSearched?.length === 0
          ? 'No ISRCs found — distribute music first or import history below'
          : 'No new IDs found via ISRC chain',
      });
    } catch {
      toast({ title: 'ISRC discovery failed', variant: 'destructive' });
    } finally {
      setIsrcRunning(false);
    }
  };

  // ── Split Scanner ─────────────────────────────────────────────────────────
  const handleScanSplits = async () => {
    setSplitRunning(true);
    setSplitResults(null);
    try {
      const res = await apiRequest('POST', `/api/artist-profiles/${profile.id}/scan-splits`);
      const data = await res.json();
      setSplitResults(data);
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      onUpdated();
      if (data.splitsDetected > 0) {
        toast({ title: `${data.splitsDetected} split profile(s) detected`, description: 'Use the Multi-Platform Fixer to resolve', variant: 'destructive' });
      } else {
        toast({ title: 'No split profiles detected', description: 'All ISRCs appear on the correct artist pages' });
      }
    } catch {
      toast({ title: 'Split scan failed', variant: 'destructive' });
    } finally {
      setSplitRunning(false);
    }
  };

  // ── DNA Snapshot ──────────────────────────────────────────────────────────
  const handleCreateDnaSnapshot = async () => {
    setDnaSnapRunning(true);
    try {
      const res = await apiRequest('POST', `/api/artist-profiles/${profile.id}/dna-snapshot`);
      const data = await res.json();
      refetchDna();
      toast({ title: 'DNA snapshot created', description: `Captured ${Object.keys((data.snapshot as Record<string, unknown>)?.platformIdsAtSnapshot ?? {}).length} platform IDs at this moment` });
    } catch {
      toast({ title: 'Snapshot failed', variant: 'destructive' });
    } finally {
      setDnaSnapRunning(false);
    }
  };

  // ── Portability Report ────────────────────────────────────────────────────
  const handlePortabilityReport = async () => {
    setPortabilityRunning(true);
    try {
      const res = await apiRequest('GET', `/api/artist-profiles/${profile.id}/portability-report`);
      const data = await res.json();
      setPortabilityReport(data);
    } catch {
      toast({ title: 'Report generation failed', variant: 'destructive' });
    } finally {
      setPortabilityRunning(false);
    }
  };

  const downloadPortabilityReport = () => {
    if (!portabilityReport) return;
    const blob = new Blob([JSON.stringify(portabilityReport.jsonLd, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.artistName.replace(/\s+/g, '_')}_artist_identity.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Catalog Scanner ───────────────────────────────────────────────────────
  const handleScanCatalog = async () => {
    setCatalogRunning(true);
    setCatalogReleases(null);
    try {
      const res = await apiRequest('GET', `/api/artist-profiles/${profile.id}/catalog`);
      const data = await res.json();
      setCatalogReleases(data.releases ?? []);
      toast({
        title: 'Catalog scanned',
        description: `${data.total ?? 0} release(s) found in your catalog`,
      });
    } catch {
      toast({ title: 'Catalog scan failed', variant: 'destructive' });
    } finally {
      setCatalogRunning(false);
    }
  };

  const handleDistributeRelease = async (release: CatalogRelease) => {
    setDistributingId(release.id);
    try {
      const res = await apiRequest('POST', `/api/artist-profiles/${profile.id}/distribute-release`, {
        title:       release.title,
        releaseType: release.releaseType,
        releaseDate: release.releaseDate ?? undefined,
        upc:         release.upc ?? undefined,
        coverUrl:    release.coverUrl ?? undefined,
        genre:       release.genre ?? undefined,
        platforms:   release.platforms,
        tracks:      release.tracks.map(t => ({
          title:       t.title,
          isrc:        t.isrc ?? undefined,
          trackNumber: t.trackNumber,
          duration:    t.duration ?? undefined,
        })),
      });
      const data = await res.json();
      // Mark the release as already distributed in local state
      setCatalogReleases(prev =>
        prev ? prev.map(r => r.id === release.id ? { ...r, alreadyDistributed: true } : r) : prev
      );
      toast({
        title: 'Distribution draft created',
        description: `"${data.title}" saved as a draft — open the Distribution tab to complete and submit.`,
      });
    } catch {
      toast({ title: 'Failed to create distribution draft', variant: 'destructive' });
    } finally {
      setDistributingId(null);
    }
  };

  // ── Profile Watch ─────────────────────────────────────────────────────────
  const handleWatch = async () => {
    setWatchRunning(true);
    try {
      const res = await apiRequest('POST', `/api/artist-profiles/${profile.id}/watch`);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      onUpdated();
      toast({
        title: 'Profile watch complete',
        description: data.unauthorized?.length > 0
          ? `${data.unauthorized.length} unauthorized release(s) detected`
          : `Checked ${data.checked?.length ?? 0} platform(s) — all clear`,
      });
    } catch {
      toast({ title: 'Watch failed', variant: 'destructive' });
    } finally {
      setWatchRunning(false);
    }
  };

  const getClaimStateForPortal = (platformKey: string) =>
    pipelineData?.pipeline?.find((p: Record<string, unknown>) => p.platform === platformKey);

  const CLAIM_STEP_LABELS = ['Not Started', 'Instructions Read', 'Portal Visited', 'ID Submitted', 'Verified', 'Monitoring'];

  const handleDiscover = async () => {
    setDiscoverRunning(true);
    setDiscoverResults(null);
    try {
      const res = await apiRequest('POST', `/api/artist-profiles/${profile.id}/auto-discover`, {
        upc: discoverUpc.replace(/[^0-9]/g, '') || undefined,
      });
      const data = await res.json();
      setDiscoverResults(data);
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/profile-hub`] });
      queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/health`] });
      onUpdated();
      const fields = data.savedFields?.filter((f: string) => !f.endsWith('_confirmed')) ?? [];
      toast({
        title: 'Discovery complete',
        description: fields.length > 0
          ? `Auto-linked: ${fields.join(', ')}`
          : 'Review the results below and accept or override any matches.',
      });
    } catch {
      toast({ title: 'Discovery failed', variant: 'destructive' });
    } finally {
      setDiscoverRunning(false);
    }
  };

  const handleAcceptMatch = (portal: Portal, result: DiscoverResult) => {
    if (!portal.fieldKey) return;
    const updates: Record<string, string | null> = { [portal.fieldKey]: result.result.id ?? result.result.slug ?? null };
    if (portal.key === 'spotify' && result.result.uri) {
      updates.spotifyArtistUri = result.result.uri;
    }
    savePlatformMutation.mutate(updates);
    setDiscoverResults(prev => prev ? { ...prev, [portal.autoDiscoverKey!]: null } : prev);
  };

  const handleSaveManualId = (portal: Portal) => {
    if (!portal.fieldKey || !editingId.trim()) return;
    const updates: Record<string, string | null> = { [portal.fieldKey]: editingId.trim() };
    if (portal.key === 'spotify') {
      const id = editingId.trim().replace('spotify:artist:', '');
      updates.spotifyArtistId = id;
      updates.spotifyArtistUri = `spotify:artist:${id}`;
    }
    savePlatformMutation.mutate(updates);
  };

  const handleClearId = (portal: Portal) => {
    if (!portal.fieldKey) return;
    savePlatformMutation.mutate({ [portal.fieldKey]: null });
  };

  const claimedCount = hub?.portals.filter(p => p.claimed).length ?? 0;
  const totalPortals = hub?.portals.filter(p => p.fieldKey !== null).length ?? 7;

  const getDiscoverResultForPortal = (portal: Portal): DiscoverResult | null => {
    if (!portal.autoDiscoverKey || !discoverResults) return null;
    return (discoverResults as Record<string, unknown>)[portal.autoDiscoverKey] ?? null;
  };

  return (
    <div className="space-y-4 pt-2">

      {/* ── Split Profile Alert — shown prominently if detected ── */}
      {profile.splitDetected && (
        <Alert className="border-destructive/50 bg-destructive/5">
          <TriangleAlert className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-xs text-destructive">
            <span className="font-semibold">Split profile detected.</span> Music has landed on a different artist page than expected. Use the Multi-Platform Fixer below to resolve, or run a fresh Split Scan to investigate.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Profile header ── */}
      <div className="flex items-start gap-3">
        {hub?.profileImageUrl ? (
          <img
            src={hub.profileImageUrl}
            alt={hub.artistName}
            className="h-14 w-14 rounded-full object-cover flex-shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <Music2 className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Globe className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">DSP Profile Hub</span>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {hub && !isLoading && (
              <Badge variant={claimedCount === totalPortals ? 'default' : 'outline'} className="text-xs">
                {claimedCount}/{totalPortals} portals set up
              </Badge>
            )}
            {hub?.isVerified && (
              <Badge className="text-xs bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />Verified
              </Badge>
            )}
            {/* Health score badge */}
            {healthData && (
              <Badge
                className={`text-xs cursor-pointer ${
                  healthData.grade === 'A' ? 'bg-green-600' :
                  healthData.grade === 'B' ? 'bg-blue-600' :
                  healthData.grade === 'C' ? 'bg-amber-500' :
                  'bg-destructive'
                }`}
                onClick={() => setHealthOpen(h => !h)}
                title="Profile Health Score — click to expand"
              >
                <Shield className="h-3 w-3 mr-1" />
                {healthData.score}/100 · {healthData.grade}
              </Badge>
            )}
          </div>
          {hub && hub.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {hub.genres.slice(0, 5).map(g => (
                <Badge key={g} variant="outline" className="text-xs py-0">{g}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleWatch}
            disabled={watchRunning}
            className="h-7 text-xs gap-1"
            title="Check platforms for unauthorized releases"
          >
            {watchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !hub?.portals.some(p => p.claimed)}
            className="h-7 text-xs gap-1"
            title="Re-sync metadata from known platform profiles"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing…' : 'Sync'}
          </Button>
        </div>
      </div>

      {/* ── Health Score Panel ── */}
      {healthOpen && (
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> Profile Health Score</span>
            {healthLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              : <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => refetchHealth()}>Recalculate</Button>}
          </div>
          {healthData && (
            <>
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold">{healthData.score}</div>
                <div>
                  <div className={`text-lg font-semibold ${
                    healthData.grade === 'A' ? 'text-green-500' : healthData.grade === 'B' ? 'text-blue-500' :
                    healthData.grade === 'C' ? 'text-amber-500' : 'text-destructive'
                  }`}>Grade {healthData.grade}</div>
                  <div className="h-2 w-40 rounded-full bg-muted overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full transition-all ${
                        healthData.score >= 85 ? 'bg-green-500' : healthData.score >= 70 ? 'bg-blue-500' :
                        healthData.score >= 55 ? 'bg-amber-500' : 'bg-destructive'
                      }`}
                      style={{ width: `${healthData.score}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {Object.entries(healthData.breakdown).map(([dim, score]: [string, any]) => (
                  <div key={dim} className="text-center space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(score / 25) * 100}%` }} />
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">{dim}</div>
                    <div className="text-xs font-mono">{score}</div>
                  </div>
                ))}
              </div>
              {healthData.recommendations.length > 0 && (
                <div className="space-y-1 border-t pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Recommendations:</p>
                  {healthData.recommendations.map((rec: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 mt-0.5 flex-shrink-0 text-amber-500" />
                      {rec}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── How it works ── */}
      <Collapsible open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
            <span className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              How artist profile ownership works
            </span>
            {howItWorksOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs text-muted-foreground mt-1">
            <p><span className="text-foreground font-medium">Your profiles belong to the DSPs, not your distributor.</span> Spotify, Apple, Amazon, Deezer, etc. each maintain their own artist profiles. Your distributor only delivers music — they don't own your profile.</p>
            <p><span className="text-foreground font-medium">Switching distributors does not delete your profiles.</span> DSPs match new releases to your existing profile using your artist name, ISRCs, and the stored artist IDs below. Keeping these consistent is critical to avoid split profiles.</p>
            <p><span className="text-foreground font-medium">You must claim each DSP's artist portal separately.</span> Once a release is live (or in pre-release), use the "Claim" button next to each portal below. Your distributor can assist with YouTube OAC merging.</p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── DSP Artist Portals (main claim section) ── */}
      {isLoading ? (
        <div className="rounded-lg border bg-muted/30 p-4 flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading your profile hub…</p>
        </div>
      ) : hub ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            DSP Artist Portals
          </p>

          {hub.portals.map(portal => {
            const isEditing = editingPortal === portal.key;
            const discoverResult = getDiscoverResultForPortal(portal);
            const showInstructions = instructionsOpen === portal.key;

            return (
              <div key={portal.key} className={`rounded-lg border p-3 space-y-2 ${portal.claimed ? 'bg-green-500/5 border-green-500/20' : ''}`}>
                {/* Portal header row */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {portal.claimed
                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                      : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${PORTAL_COLORS[portal.key] ?? 'text-foreground'}`}>
                        <span className="mr-1">{PORTAL_ICONS[portal.key]}</span>
                        {portal.label}
                      </span>
                      {portal.claimed && (
                        <Badge variant="secondary" className="text-xs py-0">Set up</Badge>
                      )}
                      {portal.distributorHandles && (
                        <Badge variant="outline" className="text-xs py-0 text-blue-500 border-blue-500/40">Via distributor</Badge>
                      )}
                    </div>
                    {portal.claimed && portal.artistId && !isEditing && (
                      <p className="text-xs font-mono text-muted-foreground/60 mt-0.5 truncate">
                        ID: {portal.artistId}
                      </p>
                    )}
                    {!portal.claimed && (
                      <p className="text-xs text-muted-foreground mt-0.5">{portal.howVerified}</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* View artist page when ID is known */}
                    {portal.artistPageUrl && (
                      <a href={portal.artistPageUrl} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" title="View your artist page">
                          <BarChart2 className="h-3 w-3" /> View
                        </Button>
                      </a>
                    )}
                    {/* Open portal button */}
                    <a href={portal.portalUrl} target="_blank" rel="noreferrer">
                      <Button variant={portal.claimed ? 'ghost' : 'outline'} size="sm" className="h-7 text-xs gap-1">
                        {portal.claimed ? (
                          <><ExternalLink className="h-3 w-3" /> Portal</>
                        ) : (
                          <><ExternalLink className="h-3 w-3" /> Claim</>
                        )}
                      </Button>
                    </a>
                    {/* Edit / Change ID */}
                    {portal.fieldKey && !portal.distributorHandles && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={portal.claimed ? 'Change ID' : 'Enter ID manually'}
                        onClick={() => {
                          if (isEditing) {
                            setEditingPortal(null);
                            setEditingId('');
                          } else {
                            setEditingPortal(portal.key);
                            setEditingId(portal.artistId ?? '');
                          }
                        }}
                      >
                        {isEditing ? <X className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Inline ID editor */}
                {isEditing && (
                  <div className="pl-7 flex items-center gap-2">
                    <Input
                      value={editingId}
                      onChange={e => setEditingId(e.target.value)}
                      placeholder={`Enter ${portal.label} artist ID…`}
                      className="h-7 text-xs font-mono flex-1"
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveManualId(portal); }}
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleSaveManualId(portal)}
                      disabled={!editingId.trim() || savePlatformMutation.isPending}
                    >
                      <Save className="h-3 w-3" /> Save
                    </Button>
                    {portal.claimed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive"
                        onClick={() => { handleClearId(portal); setEditingPortal(null); }}
                        disabled={savePlatformMutation.isPending}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                )}

                {/* Auto-discover result for this portal */}
                {discoverResult && portal.fieldKey && !portal.claimed && (
                  <div className="pl-7 rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-500 flex items-center gap-1">
                        <Zap className="h-3 w-3" /> Auto-discovered match
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{CONFIDENCE_LABEL(discoverResult.confidence)}</span>
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${CONFIDENCE_COLOR(discoverResult.confidence)}`}
                            style={{ width: `${discoverResult.confidence}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono">{discoverResult.confidence}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(discoverResult.result.imageUrl || discoverResult.result.artworkUrl || discoverResult.result.pictureUrl) && (
                        <img
                          src={discoverResult.result.imageUrl || discoverResult.result.artworkUrl || discoverResult.result.pictureUrl || ''}
                          alt={discoverResult.result.name}
                          className="h-8 w-8 rounded object-cover flex-shrink-0"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{discoverResult.result.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {discoverResult.result.id || discoverResult.result.slug}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-green-600 hover:bg-green-700"
                          onClick={() => handleAcceptMatch(portal, discoverResult)}
                          disabled={savePlatformMutation.isPending}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setDiscoverResults(prev => prev ? { ...prev, [portal.autoDiscoverKey!]: null } : prev)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Claim instructions (collapsible) */}
                {!portal.claimed && (
                  <div className="pl-7">
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      onClick={() => setInstructionsOpen(showInstructions ? null : portal.key)}
                    >
                      <Info className="h-3 w-3" />
                      How to claim {portal.label}
                      {showInstructions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {showInstructions && (
                      <p className="text-xs text-muted-foreground mt-1 pl-1 border-l-2 border-muted leading-relaxed">
                        {portal.claimInstructions}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ── Auto-Discovery panel ── */}
      <Collapsible open={discoverOpen} onOpenChange={setDiscoverOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Find my profiles automatically
              {discoverResults && (
                <Badge variant="outline" className="text-xs py-0 ml-1 text-blue-500">
                  Last run
                </Badge>
              )}
            </span>
            {discoverOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              MaxBooster searches Spotify, Apple Music, Deezer, MusicBrainz, and Audiomack for profiles matching your artist name.
              High-confidence matches are automatically linked. You can review and accept or dismiss lower-confidence results.
            </p>

            <div className="space-y-2">
              <Label className="text-xs">UPC (optional — for more accurate results)</Label>
              <Input
                value={discoverUpc}
                onChange={e => setDiscoverUpc(e.target.value)}
                placeholder="e.g. 00602557698992"
                className="h-7 text-xs font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Providing a UPC from one of your releases enables exact lookup on Apple Music and Deezer, bypassing name-search ambiguity.
              </p>
            </div>

            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={handleDiscover}
              disabled={discoverRunning}
            >
              {discoverRunning ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching across platforms…</>
              ) : (
                <><Zap className="h-3.5 w-3.5" /> {discoverResults ? 'Re-run Discovery' : 'Discover My Profiles'}</>
              )}
            </Button>

            {/* Discovery results summary */}
            {discoverResults && (
              <div className="space-y-2 border-t pt-2">
                <p className="text-xs font-medium">Discovery results:</p>
                {(['spotify', 'apple', 'deezer', 'audiomack', 'musicbrainz', 'jiosaavn'] as const).map(key => {
                  const r = (discoverResults as Record<string, unknown>)[key] as DiscoverResult | null;
                  if (!r) return (
                    <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <XCircle className="h-3.5 w-3.5" />
                      <span className="capitalize">{key === 'jiosaavn' ? 'JioSaavn' : key === 'musicbrainz' ? 'MusicBrainz' : key}</span>
                      <span className="text-muted-foreground/50">— no match found</span>
                    </div>
                  );
                  const alreadySaved = discoverResults.savedFields.includes(key) || discoverResults.savedFields.includes(`${key}_confirmed`);
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      {alreadySaved
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        : <div className={`h-2 w-2 rounded-full flex-shrink-0 ${CONFIDENCE_COLOR(r.confidence)}`} />}
                      <span className="capitalize font-medium w-24 flex-shrink-0">
                        {key === 'jiosaavn' ? 'JioSaavn' : key === 'musicbrainz' ? 'MusicBrainz' : key}
                      </span>
                      <span className="truncate flex-1 text-muted-foreground">{r.result.name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${CONFIDENCE_COLOR(r.confidence)}`}
                            style={{ width: `${r.confidence}%` }}
                          />
                        </div>
                        <span className="font-mono w-8 text-right">{r.confidence}%</span>
                        {alreadySaved && <span className="text-green-500 text-xs">✓ linked</span>}
                      </div>
                    </div>
                  );
                })}
                {discoverResults.upcDiscovered && (
                  <p className="text-xs text-blue-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    UPC-based exact match used for Apple/Deezer
                  </p>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Metadata Match Keys ── */}
      {hub && (
        <Collapsible open={metaOpen} onOpenChange={setMetaOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
              <span className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" />
                Metadata DSPs use to match your releases
              </span>
              {metaOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 mt-1">
              {/* Cover art */}
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-24 shrink-0">Cover Art</span>
                {hub.profileImageUrl ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={hub.profileImageUrl}
                      alt="Artist cover"
                      className="h-10 w-10 rounded object-cover border border-border/50 flex-shrink-0"
                    />
                    <span className="text-xs text-green-500 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Synced
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-amber-500 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Not set — run sync or find profiles to auto-fill
                  </span>
                )}
              </div>
              {/* Artist name */}
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-24 shrink-0">Artist Name</span>
                <span className="text-xs font-medium">{hub.metadataKeys.artistName}</span>
              </div>
              {/* Platform IDs */}
              {Object.entries(hub.metadataKeys.storedIds).map(([platform, id]) => (
                <div key={platform} className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{platform} ID</span>
                  <span className="text-xs font-mono truncate">{id}</span>
                </div>
              ))}
              {Object.keys(hub.metadataKeys.storedIds).length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  No platform IDs stored yet. Run "Find my profiles" or claim portals above — your IDs will appear here for future release matching.
                </div>
              )}
              <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                Keep your artist name, cover art, and ISRCs identical across all releases. DSPs use these keys to attach new music to your existing profile — inconsistencies create duplicate or split profiles.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Full Distribution Network (97 DSP search links) ── */}
      {hub && hub.urlDiscoveries.length > 0 && (
        <Collapsible open={dspGridOpen} onOpenChange={setDspGridOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
              <span className="flex items-center gap-1.5">
                <Music2 className="h-3.5 w-3.5" />
                Verify presence on {hub.urlDiscoveries.length} DSPs
              </span>
              {dspGridOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-lg border overflow-hidden mt-1">
              <div className="px-3 py-2 bg-muted/20 border-b">
                <p className="text-xs text-muted-foreground">
                  Search links for your artist name across all distribution network platforms. Use these to verify your music has landed and check your profile on each DSP.
                </p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-border/50 max-h-72 overflow-y-auto">
                {hub.urlDiscoveries.map(d => (
                  <a
                    key={d.platform}
                    href={d.searchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between px-3 py-2 gap-2 hover:bg-muted/30 transition-colors group"
                  >
                    <span className="text-xs truncate group-hover:text-foreground text-muted-foreground transition-colors">
                      {d.platformLabel}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary flex-shrink-0 transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Profile Fixer ── */}
      <Collapsible open={fixerOpen} onOpenChange={setFixerOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Release landed on the wrong Spotify profile?
              {profile.fixerPending && (
                <Badge variant="outline" className="text-xs py-0 ml-1 text-amber-500 border-amber-500/40">
                  Pending
                </Badge>
              )}
            </span>
            {fixerOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            {profile.fixerPending ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  A re-mapping request is already pending. Your distributor will apply it to future releases.
                  {profile.fixerStatus && <span className="block text-muted-foreground mt-1">Status: {profile.fixerStatus}</span>}
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  If a release was attached to the wrong Spotify profile (e.g. a duplicate or a different artist with the same name), submit a re-mapping request. Your distributor will deliver future releases to the correct Spotify URI.
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Correct Spotify URI</Label>
                  <Input
                    placeholder="spotify:artist:xxxxxxxxxxxxxxxxxxxxxx"
                    value={fixerUri}
                    onChange={e => {
                      setFixerUri(e.target.value);
                      setFixerUriError('');
                    }}
                    className="h-8 text-xs font-mono"
                  />
                  {fixerUriError && <p className="text-xs text-destructive">{fixerUriError}</p>}
                  <p className="text-xs text-muted-foreground">
                    On Spotify: right-click your correct artist page → Share → Copy Spotify URI
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    placeholder="Describe the issue — e.g. 'New release landed on duplicate profile, correct profile has 1.2M followers'"
                    value={fixerNotes}
                    onChange={e => setFixerNotes(e.target.value)}
                    className="text-xs min-h-[60px] resize-none"
                    maxLength={1000}
                  />
                  <p className="text-xs text-muted-foreground text-right">{fixerNotes.length}/1000</p>
                </div>
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => {
                    if (!fixerUri.startsWith('spotify:artist:')) {
                      setFixerUriError('Must be a Spotify artist URI starting with spotify:artist:');
                      return;
                    }
                    fixerMutation.mutate();
                  }}
                  disabled={fixerMutation.isPending || !fixerUri}
                >
                  {fixerMutation.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Submitting…</>
                  ) : (
                    'Submit Re-mapping Request'
                  )}
                </Button>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── ISRC Chain Discovery ── */}
      <Collapsible open={isrcDiscoverOpen} onOpenChange={setIsrcDiscoverOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              ISRC Chain Discovery
              <Badge variant="outline" className="text-xs py-0 ml-1 text-purple-500 border-purple-500/40">Phase 1</Badge>
            </span>
            {isrcDiscoverOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Uses ISRCs from your distributed tracks to look up your artist profiles on MusicBrainz, then propagates those IDs across Spotify, Apple Music, Deezer, Audiomack and more. More accurate than name-search because ISRCs uniquely identify recordings.
            </p>
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={handleIsrcDiscover}
              disabled={isrcRunning}
            >
              {isrcRunning
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running ISRC chain…</>
                : <><Hash className="h-3.5 w-3.5" /> {isrcResults ? 'Re-run ISRC Discovery' : 'Start ISRC Chain Discovery'}</>}
            </Button>
            {isrcResults && (
              <div className="space-y-2 border-t pt-2">
                <p className="text-xs font-medium">Results:</p>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="rounded bg-muted/30 p-2">
                    <div className="font-mono text-lg">{isrcResults.isrcsSearched?.length ?? 0}</div>
                    <div className="text-muted-foreground">ISRCs searched</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2">
                    <div className="font-mono text-lg text-green-500">{isrcResults.savedFields?.length ?? 0}</div>
                    <div className="text-muted-foreground">New IDs found</div>
                  </div>
                </div>
                {isrcResults.savedFields?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {isrcResults.savedFields.map((f: string) => (
                      <Badge key={f} className="text-xs bg-green-600">{f}</Badge>
                    ))}
                  </div>
                )}
                {isrcResults.isrcsSearched?.length === 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      No ISRCs found in your release catalog yet. Distribute music first, or use the <strong>Import History</strong> panel below to import ISRCs from a previous distributor.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Split Profile Scanner ── */}
      <Collapsible open={splitScanOpen} onOpenChange={setSplitScanOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <ScanSearch className="h-3.5 w-3.5" />
              Split Profile Scanner
              {profile.splitDetected && (
                <Badge variant="outline" className="text-xs py-0 ml-1 text-destructive border-destructive/40">Split detected</Badge>
              )}
            </span>
            {splitScanOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Checks whether your releases (by ISRC) appear on the correct artist pages across platforms, or whether some tracks have been captured by a duplicate/split artist profile. Runs across Spotify, Apple Music, and MusicBrainz.
            </p>
            <Button
              size="sm"
              className={`w-full h-8 text-xs gap-1.5 ${profile.splitDetected ? 'border-destructive text-destructive' : ''}`}
              variant={profile.splitDetected ? 'outline' : 'default'}
              onClick={handleScanSplits}
              disabled={splitRunning}
            >
              {splitRunning
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning all platforms…</>
                : <><ScanSearch className="h-3.5 w-3.5" /> {splitResults ? 'Re-run Split Scan' : 'Scan for Split Profiles'}</>}
            </Button>
            {splitResults && (
              <div className="space-y-2 border-t pt-2">
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <div className="font-mono text-lg">{splitResults.totalReleases ?? 0}</div>
                    <div className="text-muted-foreground">Releases checked</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <div className="font-mono text-lg text-green-500">{splitResults.cleanProfiles ?? 0}</div>
                    <div className="text-muted-foreground">Clean</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <div className={`font-mono text-lg ${(splitResults.splitsDetected ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{splitResults.splitsDetected ?? 0}</div>
                    <div className="text-muted-foreground">Splits found</div>
                  </div>
                </div>
                {splitResults.splitsDetected > 0 ? (
                  <Alert className="border-destructive/50">
                    <TriangleAlert className="h-4 w-4 text-destructive" />
                    <AlertDescription className="text-xs">
                      {splitResults.splitsDetected} split profile(s) detected. Use <strong>Multi-Platform Fixer</strong> below to submit re-mapping requests to your distributor.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <p className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> All releases land on the correct artist pages.
                  </p>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Claim Pipeline State Machine ── */}
      {pipelineData?.pipeline && pipelineData.pipeline.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
              <span className="flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" />
                Claim Pipeline ({pipelineData.pipeline.filter((p: Record<string, unknown>) => p.currentState === 'monitoring').length}/{pipelineData.pipeline.length} complete)
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-lg border p-3 space-y-3 mt-1">
              <p className="text-xs text-muted-foreground">Track your artist verification / claim progress per platform through the 6-stage pipeline.</p>
              {pipelineData.pipeline.map((entry: Record<string, unknown>) => {
                const stateIdx = CLAIM_STEP_LABELS.indexOf(entry.currentState ?? 'Not Started');
                const pct = Math.max(0, ((stateIdx) / (CLAIM_STEP_LABELS.length - 1)) * 100);
                return (
                  <div key={entry.platform} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize font-medium">{entry.platform}</span>
                      <span className="text-muted-foreground">{CLAIM_STEP_LABELS[stateIdx] ?? 'Not Started'}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {CLAIM_STEP_LABELS.slice(1).map((label, idx) => (
                        <button
                          key={label}
                          onClick={() => updateClaimMutation.mutate({ platform: entry.platform, state: label.toLowerCase().replace(/\s+/g, '_') })}
                          className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                            stateIdx > idx
                              ? 'bg-green-500/10 border-green-500/30 text-green-600'
                              : stateIdx === idx + 1
                              ? 'bg-primary/10 border-primary/30 text-primary'
                              : 'border-muted-foreground/20 text-muted-foreground/50 hover:text-muted-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Multi-Platform Fixer ── */}
      <Collapsible open={multiFixerOpen} onOpenChange={setMultiFixerOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Multi-Platform Profile Fixer
              <Badge variant="outline" className="text-xs py-0 ml-1 text-blue-500 border-blue-500/40">Phase 2</Badge>
              {profile.fixerPending && (
                <Badge variant="outline" className="text-xs py-0 text-amber-500 border-amber-500/40">Pending</Badge>
              )}
            </span>
            {multiFixerOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Submit re-mapping requests across multiple platforms at once — Spotify, Apple Music, Tidal, Amazon Music, Deezer. Enter the correct artist ID/URI for each platform where music landed on the wrong profile.
            </p>
            {(['spotify', 'apple', 'tidal', 'amazon', 'deezer'] as const).map(platform => (
              <div key={platform} className="space-y-1.5">
                <Label className="text-xs capitalize">{platform === 'apple' ? 'Apple Music' : platform === 'amazon' ? 'Amazon Music' : platform} — correct artist ID</Label>
                <Input
                  placeholder={
                    platform === 'spotify' ? 'spotify:artist:...' :
                    platform === 'apple' ? 'e.g. 12345678' :
                    platform === 'tidal' ? 'e.g. 7654321' :
                    platform === 'amazon' ? 'e.g. B01234ABCD' :
                    'e.g. 1234567'
                  }
                  value={multiFixerIds[platform] ?? ''}
                  onChange={e => setMultiFixerIds(prev => ({ ...prev, [platform]: e.target.value }))}
                  className="h-7 text-xs font-mono"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                placeholder="Describe the issue for your distributor…"
                value={fixerNotes}
                onChange={e => setFixerNotes(e.target.value)}
                className="text-xs min-h-[50px] resize-none"
                maxLength={1000}
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => multiFixerMutation.mutate()}
              disabled={multiFixerMutation.isPending || Object.values(multiFixerIds).every(v => !v)}
            >
              {multiFixerMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Submitting…</>
                : 'Submit Multi-Platform Re-mapping Request'}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Social Handle → DSP Bridging ── */}
      <Collapsible open={handleOpen} onOpenChange={setHandleOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Link Social Handle → DSP Profiles
            </span>
            {handleOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Enter your Instagram, TikTok, YouTube, or Twitter handle and MaxBooster will resolve it to your artist profile URLs on streaming platforms, cross-referencing your known metadata.
            </p>
            <div className="flex gap-2">
              <div className="space-y-1.5 flex-shrink-0">
                <Label className="text-xs">Platform</Label>
                <select
                  value={handlePlatform}
                  onChange={e => setHandlePlatform(e.target.value)}
                  className="h-8 text-xs rounded-md border border-input bg-background px-2"
                >
                  {['instagram', 'tiktok', 'youtube', 'twitter', 'facebook', 'threads'].map(p => (
                    <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Handle</Label>
                <Input
                  placeholder={`@${handlePlatform}handle`}
                  value={handleValue}
                  onChange={e => setHandleValue(e.target.value.replace(/^@/, ''))}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => resolveHandleMutation.mutate()}
              disabled={resolveHandleMutation.isPending || !handleValue.trim()}
            >
              {resolveHandleMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving…</>
                : <><Link2 className="h-3.5 w-3.5" /> Resolve Handle</>}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Artist DNA Snapshots ── */}
      <Collapsible open={dnaOpen} onOpenChange={setDnaOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <Dna className="h-3.5 w-3.5" />
              Artist DNA Snapshots
              {dnaData?.snapshots && dnaData.snapshots.length > 0 && (
                <Badge variant="outline" className="text-xs py-0 ml-1">{dnaData.snapshots.length} saved</Badge>
              )}
            </span>
            {dnaOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Create immutable snapshots of your artist identity at any point in time — platform IDs, ISRCs, metadata keys, verified status. These serve as proof-of-identity records and let you track profile drift over time.
            </p>
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={handleCreateDnaSnapshot}
              disabled={dnaSnapRunning}
            >
              {dnaSnapRunning
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturing snapshot…</>
                : <><Dna className="h-3.5 w-3.5" /> Capture DNA Snapshot Now</>}
            </Button>
            {dnaData?.snapshots && dnaData.snapshots.length > 0 && (
              <div className="space-y-2 border-t pt-2 max-h-40 overflow-y-auto">
                {dnaData.snapshots.map((snap: Record<string, unknown>) => (
                  <div key={snap.id} className="flex items-center justify-between text-xs rounded bg-muted/30 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-muted-foreground">{snap.snapshotLabel ?? new Date(snap.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{Object.keys(snap.platformIdsAtSnapshot ?? {}).length} platform IDs</span>
                      {snap.triggeredBy && <Badge variant="outline" className="text-xs py-0">{snap.triggeredBy}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Distributor Portability Report ── */}
      <Collapsible open={portabilityOpen} onOpenChange={setPortabilityOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Distributor Portability Report
              <Badge variant="outline" className="text-xs py-0 ml-1 text-green-500 border-green-500/40">JSON-LD</Badge>
            </span>
            {portabilityOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Generate a structured JSON-LD artist identity export — all your platform IDs, ISRCs, UPCs, social handles, verified status, health score, and release history in one portable file. Useful when switching distributors.
            </p>
            {!portabilityReport ? (
              <Button
                size="sm"
                className="w-full h-8 text-xs gap-1.5"
                onClick={handlePortabilityReport}
                disabled={portabilityRunning}
              >
                {portabilityRunning
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Building report…</>
                  : <><BookOpen className="h-3.5 w-3.5" /> Generate Portability Report</>}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <div className="font-mono text-base">{portabilityReport.summary?.platformsCovered ?? 0}</div>
                    <div className="text-muted-foreground">Platforms</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <div className="font-mono text-base">{portabilityReport.summary?.isrcCount ?? 0}</div>
                    <div className="text-muted-foreground">ISRCs</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <div className="font-mono text-base">{portabilityReport.summary?.healthScore ?? 0}</div>
                    <div className="text-muted-foreground">Health</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1.5"
                    onClick={downloadPortabilityReport}
                  >
                    <Download className="h-3.5 w-3.5" /> Download JSON-LD
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => { setPortabilityReport(null); handlePortabilityReport(); }}
                    disabled={portabilityRunning}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Artist Identity Graph ── */}
      <Collapsible open={graphOpen} onOpenChange={setGraphOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" />
              Artist Identity Graph
            </span>
            {graphOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Your artist identity graph shows every verified link between your profiles across platforms. Each node is a platform identity; edges show how they were confirmed (ISRC match, manual claim, MusicBrainz lookup, etc.).
            </p>
            {graphData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <div className="font-mono text-base">{graphData.nodes?.length ?? 0}</div>
                    <div className="text-muted-foreground">Identity nodes</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <div className="font-mono text-base">{graphData.links?.length ?? 0}</div>
                    <div className="text-muted-foreground">Verified links</div>
                  </div>
                  <div className="rounded bg-muted/30 p-2 text-center">
                    <div className={`font-mono text-base ${(graphData.confirmationScore ?? 0) >= 80 ? 'text-green-500' : 'text-amber-500'}`}>
                      {graphData.confirmationScore ?? 0}%
                    </div>
                    <div className="text-muted-foreground">Confidence</div>
                  </div>
                </div>
                {graphData.nodes && graphData.nodes.length > 0 && (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {graphData.nodes.map((node: Record<string, unknown>) => (
                      <div key={node.id} className="flex items-center justify-between text-xs rounded bg-muted/20 px-2 py-1">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${node.confirmed ? 'bg-green-500' : 'bg-amber-500'}`} />
                          <span className="capitalize font-medium">{node.platform}</span>
                          <span className="font-mono text-muted-foreground truncate max-w-[120px]">{node.platformId}</span>
                        </div>
                        <div className="font-mono text-muted-foreground">{node.confidence ?? 0}%</div>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => refetchGraph()}>
                  <RefreshCw className="h-3 w-3 mr-1.5" /> Refresh Graph
                </Button>
              </div>
            ) : (
              <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={() => refetchGraph()}>
                <Network className="h-3.5 w-3.5" /> Load Identity Graph
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Catalog Scanner + Distribute ── */}
      <Collapsible open={catalogOpen} onOpenChange={setCatalogOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <Disc3 className="h-3.5 w-3.5" />
              Collected Releases
              {catalogReleases && (
                <Badge variant="outline" className="text-xs py-0 ml-1 text-blue-500 border-blue-500/40">
                  {catalogReleases.length} found
                </Badge>
              )}
            </span>
            {catalogOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Scan your LabelGrid catalog to see releases already collected during distribution. Any release found here can be re-distributed or imported as a distribution draft with one click — all metadata including cover art, UPC, genre, and tracks is pre-filled automatically.
            </p>

            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={handleScanCatalog}
              disabled={catalogRunning}
            >
              {catalogRunning
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning catalog…</>
                : <><Disc3 className="h-3.5 w-3.5" /> {catalogReleases ? 'Re-scan Catalog' : 'Scan Catalog'}</>}
            </Button>

            {catalogReleases && catalogReleases.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  No releases found in your LabelGrid catalog for <strong>{profile.artistName}</strong>. Distribute your first release to see it here.
                </AlertDescription>
              </Alert>
            )}

            {catalogReleases && catalogReleases.length > 0 && (
              <div className="space-y-2 border-t pt-2 max-h-[480px] overflow-y-auto pr-0.5">
                {catalogReleases.map(release => (
                  <div
                    key={release.id}
                    className="rounded-lg border bg-muted/20 p-2.5 flex items-start gap-3"
                  >
                    {/* Cover art thumbnail */}
                    {release.coverUrl ? (
                      <img
                        src={release.coverUrl}
                        alt={release.title}
                        className="h-14 w-14 rounded object-cover border border-border/50 flex-shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded border border-border/50 bg-muted flex items-center justify-center flex-shrink-0">
                        <Disc3 className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                    )}

                    {/* Release info */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold truncate">{release.title}</span>
                        <Badge variant="outline" className="text-xs py-0 capitalize shrink-0">
                          {release.releaseType}
                        </Badge>
                        {release.alreadyDistributed && (
                          <Badge className="text-xs py-0 bg-green-600 shrink-0">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Distributed
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {release.trackCount} track{release.trackCount !== 1 ? 's' : ''}
                        {release.genre ? ` · ${release.genre}` : ''}
                        {release.releaseDate ? ` · ${release.releaseDate.slice(0, 10)}` : ''}
                      </div>
                      {release.upc && (
                        <div className="text-xs font-mono text-muted-foreground">UPC: {release.upc}</div>
                      )}
                      {release.platforms.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {release.platforms.slice(0, 6).map(p => (
                            <Badge key={p} variant="outline" className="text-xs py-0 text-muted-foreground/70">
                              {p}
                            </Badge>
                          ))}
                          {release.platforms.length > 6 && (
                            <Badge variant="outline" className="text-xs py-0 text-muted-foreground/50">
                              +{release.platforms.length - 6}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Distribute button */}
                    <div className="flex-shrink-0 self-center">
                      <Button
                        size="sm"
                        variant={release.alreadyDistributed ? 'outline' : 'default'}
                        className="h-7 text-xs gap-1"
                        onClick={() => handleDistributeRelease(release)}
                        disabled={distributingId === release.id}
                        title={release.alreadyDistributed ? 'Re-distribute / create a new draft' : 'Create distribution draft'}
                      >
                        {distributingId === release.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <SendHorizonal className="h-3 w-3" />}
                        {distributingId === release.id ? '' : release.alreadyDistributed ? 'Re-dist.' : 'Distribute'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {catalogReleases && catalogReleases.length > 0 && (
              <p className="text-xs text-muted-foreground border-t pt-2">
                Clicking <strong>Distribute</strong> creates a draft in the Distribution tab with all metadata pre-filled. Open the Distribution tab to review, add audio, and submit.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Cross-Distributor History Import ── */}
      <Collapsible open={importOpen} onOpenChange={setImportOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1 border-t pt-3">
            <span className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Import Distributor History
            </span>
            {importOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border p-3 space-y-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Moving from a previous distributor? Paste ISRCs and UPCs from your old distributor's reports to bootstrap ISRC chain discovery — MaxBooster will look up these recordings across all platforms and link any matching profiles.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Previous Distributor</Label>
              <Input
                placeholder="e.g. DistroKid, TuneCore, CD Baby…"
                value={importSource}
                onChange={e => setImportSource(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ISRCs (one per line or comma-separated)</Label>
              <Textarea
                placeholder={"USRC12345678\nUSRC87654321"}
                value={importIsrcs}
                onChange={e => setImportIsrcs(e.target.value)}
                className="text-xs font-mono min-h-[60px] resize-none"
              />
              <p className="text-xs text-muted-foreground">{importIsrcs.split(/[\n,\s]+/).filter(s => s.trim().length === 12).length} valid ISRCs detected</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">UPCs (optional)</Label>
              <Input
                placeholder="00602557698992, 00602558..."
                value={importUpcs}
                onChange={e => setImportUpcs(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || (!importIsrcs.trim() && !importUpcs.trim())}
            >
              {importMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</>
                : <><Upload className="h-3.5 w-3.5" /> Import & Begin Discovery</>}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

    </div>
  );
}
