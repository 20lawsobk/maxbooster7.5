import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, CheckCircle2, XCircle, AlertCircle,
  ExternalLink, Loader2, Globe, Barcode, Info,
  Music, Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  amazonMusicArtistId: string | null;
  youtubeChannelId: string | null;
  tidalArtistId: string | null;
  profileImageUrl: string | null;
  genres: string[];
  isVerified: boolean;
  fixerPending: boolean;
  fixerStatus: string;
}

interface ClaimEntry {
  hasId: boolean;
  artistId?: string | null;
  channelId?: string | null;
  claimUrl: string;
  profileUrl?: string | null;
  channelUrl?: string | null;
}

interface PlatformUrlDiscovery {
  platform: string;
  platformLabel: string;
  searchUrl: string;
  method: 'url_template';
}

interface LabelGridPlatform {
  platform: string;
  platformLabel: string;
  artistId: string | null;
  artistUrl: string | null;
  status: 'live' | 'pending' | 'processing' | 'not_found' | 'error';
  liveAt?: string;
}

interface DiscoverResult {
  claims: {
    spotify: ClaimEntry;
    apple:   ClaimEntry;
    amazon:  ClaimEntry;
    youtube: ClaimEntry;
    tidal:   ClaimEntry;
    deezer:  ClaimEntry;
  };
  upcMatch: { apple: any | null; deezer: any | null } | null;
  upcDiscovered: boolean;
  urlDiscoveries: PlatformUrlDiscovery[];
  labelgridPlatforms: LabelGridPlatform[];
  labelgridConfigured: boolean;
  metadata: { artistName: string; linkedCount: number; missingPlatforms: string[] };
  saved: boolean;
  savedFields: string[];
}

interface SyncResult {
  synced: string[];
  changes: Record<string, unknown>;
  metadataConsistency: {
    consistent: boolean;
    linkedIds: Record<string, string | null>;
    missingPlatforms: string[];
  };
}

interface Props {
  profile: ArtistProfile;
  onUpdated: () => void;
}

const CLAIM_META: Record<string, { label: string; color: string; dot: string; description: string }> = {
  spotify: {
    label: 'Spotify for Artists',
    color: 'text-green-500',
    dot: 'bg-green-500',
    description: 'Claim via Spotify for Artists — verify with distributor metadata + social links',
  },
  apple: {
    label: 'Apple Music for Artists',
    color: 'text-pink-500',
    dot: 'bg-pink-500',
    description: 'Sign in with Apple ID → request access → Apple verifies via distributor metadata',
  },
  amazon: {
    label: 'Amazon Music for Artists',
    color: 'text-blue-400',
    dot: 'bg-blue-400',
    description: 'Request access → verify identity via Amazon account + distributor data',
  },
  youtube: {
    label: 'YouTube Official Artist Channel',
    color: 'text-red-500',
    dot: 'bg-red-500',
    description: 'Your distributor can request OAC merging — YouTube verifies via channel ownership + music delivery',
  },
  tidal: {
    label: 'TIDAL for Artists',
    color: 'text-cyan-400',
    dot: 'bg-cyan-400',
    description: 'Request artist access → TIDAL verifies via distributor delivery',
  },
  deezer: {
    label: 'Deezer for Creators',
    color: 'text-purple-500',
    dot: 'bg-purple-500',
    description: 'Claim your profile on Deezer Creators portal',
  },
};

export default function AutoArtistSync({ profile, onUpdated }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [discovery, setDiscovery] = useState<DiscoverResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const [upc, setUpc] = useState('');
  const [showAllDsps, setShowAllDsps] = useState(false);

  const discoverMutation = useMutation({
    mutationFn: (runUpc?: string) =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/auto-discover`,
        runUpc ? { upc: runUpc } : undefined
      ).then(r => r.json()),
    onSuccess: (data: DiscoverResult) => {
      setDiscovery(data);
      if (data.saved && data.savedFields.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
        onUpdated();
        toast({
          title: `UPC matched ${data.savedFields.length} platform${data.savedFields.length !== 1 ? 's' : ''}`,
          description: data.savedFields.join(', '),
        });
      }
    },
    onError: (err: any) => {
      const is401 = err?.status === 401 || String(err).includes('401');
      if (is401) {
        toast({ title: 'Session expired — reloading…', variant: 'destructive' });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast({ title: 'Could not load platform status', variant: 'destructive' });
      }
    },
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/auto-sync`).then(r => r.json()),
    onSuccess: (data: SyncResult) => {
      setSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      onUpdated();
      if (data.changes.isVerified) {
        toast({ title: 'Profile verified', description: `Linked on ${data.synced.length} platform${data.synced.length !== 1 ? 's' : ''}` });
      } else {
        toast({ title: 'Metadata checked', description: data.metadataConsistency.consistent ? 'All platform IDs linked' : `${data.metadataConsistency.missingPlatforms.length} platforms still need IDs` });
      }
    },
    onError: () => toast({ title: 'Sync check failed', variant: 'destructive' }),
  });

  useEffect(() => {
    if (!hasAutoRun) {
      setHasAutoRun(true);
      discoverMutation.mutate();
    }
  }, []);

  const isRunning = discoverMutation.isPending || syncMutation.isPending;
  const claimKeys = ['spotify', 'apple', 'amazon', 'youtube', 'tidal', 'deezer'] as const;

  return (
    <div className="space-y-4 pt-2">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Artist Profile Ownership</span>
          {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {discovery && !isRunning && (
            <Badge variant="outline" className="text-xs">
              {discovery.metadata.linkedCount}/6 linked
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => discoverMutation.mutate(upc.replace(/\D/g, '') || undefined)} disabled={isRunning}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${discoverMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={isRunning}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Check
          </Button>
        </div>
      </div>

      {/* ── How it works ── */}
      <Alert className="border-blue-500/30 bg-blue-500/5">
        <Info className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Your artist profiles belong to the DSPs, not your distributor.</strong> When you switch distributors, nothing transfers between them.</p>
          <p>Your new distributor delivers releases with your existing artist IDs → DSPs match via metadata (name, ISRCs, fingerprint) → you claim your profiles on each platform.</p>
        </AlertDescription>
      </Alert>

      {/* ── UPC Lookup ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            inputMode="numeric"
            placeholder="Enter UPC to match Apple Music / Deezer artist IDs"
            value={upc}
            onChange={e => setUpc(e.target.value.replace(/[^0-9]/g, '').slice(0, 14))}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {upc.length >= 12 && (
          <Button size="sm" onClick={() => discoverMutation.mutate(upc)} disabled={isRunning} className="text-xs h-8 px-3">
            <Barcode className="h-3 w-3 mr-1" />
            Match
          </Button>
        )}
      </div>

      {/* ── UPC Match Banner ── */}
      {discovery?.upcDiscovered && discovery.upcMatch && (
        <Alert className="border-green-500/30 bg-green-500/5">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-xs">
            <strong>UPC match found</strong> — artist IDs auto-saved for {[discovery.upcMatch.apple && 'Apple Music', discovery.upcMatch.deezer && 'Deezer'].filter(Boolean).join(' and ')}.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Loading state ── */}
      {discoverMutation.isPending && (
        <div className="rounded-lg border bg-muted/30 p-4 flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Loading platform claim status…</p>
            <p className="text-xs text-muted-foreground mt-0.5">Checking your linked IDs and distribution delivery</p>
          </div>
        </div>
      )}

      {/* ── Platform Claim Cards ── */}
      {discovery && !discoverMutation.isPending && (
        <>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Music className="h-3.5 w-3.5" />
              Artist Portals — claim your profile on each DSP
            </p>
            <div className="space-y-2">
              {claimKeys.map(key => {
                const entry = discovery.claims[key];
                const meta = CLAIM_META[key];
                const profileUrl = (entry as any).profileUrl ?? (entry as any).channelUrl ?? null;
                const artistId = (entry as any).artistId ?? (entry as any).channelId ?? null;
                return (
                  <div key={key} className="rounded-lg border p-3 flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {entry.hasId ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                        {entry.hasId ? (
                          <Badge variant="secondary" className="text-xs py-0">ID linked</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs py-0 text-muted-foreground">Not linked</Badge>
                        )}
                      </div>
                      {artistId && (
                        <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{artistId}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {profileUrl && (
                        <a href={profileUrl} target="_blank" rel="noreferrer" title="View profile">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      <a href={entry.claimUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant={entry.hasId ? 'ghost' : 'outline'} className="h-7 text-xs">
                          {entry.hasId ? 'Manage' : 'Claim'}
                        </Button>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Sync consistency result ── */}
          {syncResult && (
            <Alert className={syncResult.metadataConsistency.consistent ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}>
              {syncResult.metadataConsistency.consistent
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <AlertCircle className="h-4 w-4 text-yellow-500" />
              }
              <AlertDescription className="text-xs">
                {syncResult.metadataConsistency.consistent
                  ? `All 6 platform IDs linked. Metadata consistent — new releases will attach to your existing profiles automatically.`
                  : `${syncResult.metadataConsistency.missingPlatforms.length} platform${syncResult.metadataConsistency.missingPlatforms.length !== 1 ? 's' : ''} missing IDs: ${syncResult.metadataConsistency.missingPlatforms.join(', ')}. Claim those profiles above to ensure new releases attach correctly.`
                }
              </AlertDescription>
            </Alert>
          )}

          {/* ── LabelGrid Distribution Status ── */}
          {discovery.labelgridConfigured && discovery.labelgridPlatforms.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  Distribution Delivery Status — {discovery.labelgridPlatforms.length} platforms
                </p>
                <div className="flex gap-1.5">
                  <Badge className="text-xs bg-green-600">{discovery.labelgridPlatforms.filter(p => p.status === 'live').length} live</Badge>
                  {discovery.labelgridPlatforms.filter(p => p.status === 'pending' || p.status === 'processing').length > 0 && (
                    <Badge variant="outline" className="text-xs text-yellow-600">
                      {discovery.labelgridPlatforms.filter(p => p.status === 'pending' || p.status === 'processing').length} pending
                    </Badge>
                  )}
                </div>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-y divide-border/50 max-h-60 overflow-y-auto">
                  {discovery.labelgridPlatforms.map(p => (
                    <div key={p.platform} className="flex items-center justify-between px-3 py-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.status === 'live' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                        ) : p.status === 'pending' || p.status === 'processing' ? (
                          <Loader2 className="h-3 w-3 text-yellow-500 animate-spin flex-shrink-0" />
                        ) : p.status === 'not_found' ? (
                          <XCircle className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
                        )}
                        <span className="text-xs truncate">{p.platformLabel}</span>
                      </div>
                      {p.artistUrl && (
                        <a href={p.artistUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3 text-muted-foreground/40 hover:text-primary transition-colors" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 bg-muted/20 border-t flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-green-500" /> Live on DSP
                  <span className="mx-1">·</span>
                  <Loader2 className="h-3 w-3 text-yellow-500" /> Pending delivery
                  <span className="mx-1">·</span>
                  <XCircle className="h-3 w-3 text-muted-foreground/40" /> Not distributed
                </div>
              </div>
            </div>
          ) : discovery.labelgridConfigured ? (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <Globe className="h-6 w-6 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm font-medium">No releases distributed yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Once you distribute a release, delivery status across all DSPs will appear here.
              </p>
            </div>
          ) : null}

          {/* ── Search Links for 97 DSPs ── */}
          {discovery.urlDiscoveries.length > 0 && (
            <div>
              <button
                onClick={() => setShowAllDsps(v => !v)}
                className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <span className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  Search Links — {discovery.urlDiscoveries.length} more DSPs
                </span>
                <Badge variant="secondary" className="text-xs">{showAllDsps ? 'Hide' : 'Show'}</Badge>
              </button>
              {showAllDsps && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="grid grid-cols-2 divide-x divide-y divide-border/50 max-h-72 overflow-y-auto">
                    {discovery.urlDiscoveries.map(d => (
                      <a
                        key={d.platform}
                        href={d.searchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between px-3 py-2 gap-2 hover:bg-muted/30 transition-colors group"
                      >
                        <span className="text-xs truncate">{d.platformLabel}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary transition-colors flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
