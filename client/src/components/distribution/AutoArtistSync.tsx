import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  ExternalLink, ChevronDown, ChevronUp, Loader2,
  Zap, ShieldCheck, Wrench, Globe, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

interface PlatformUrlDiscovery {
  platform: string;
  platformLabel: string;
  searchUrl: string;
  profileUrlTemplate: string | null;
  method: 'url_template';
}

interface DiscoverResult {
  spotify:     { result: SpotifyHit;   confidence: number } | null;
  apple:       { result: AppleHit;     confidence: number } | null;
  deezer:      { result: DeezerHit;    confidence: number } | null;
  musicbrainz: { result: MBHit;        confidence: number } | null;
  audiomack:   { result: AudiomackHit; confidence: number } | null;
  jiosaavn:    { result: JioSaavnHit;  confidence: number } | null;
  urlDiscoveries: PlatformUrlDiscovery[];
  saved: boolean;
  savedFields: string[];
}

interface SpotifyHit   { id: string; uri: string; name: string; imageUrl: string | null; genres: string[]; followers: number; popularity: number; externalUrl: string; }
interface AppleHit     { id: string; name: string; genres: string[]; artworkUrl: string | null; url: string; }
interface DeezerHit    { id: string; name: string; pictureUrl: string | null; fans: number; link: string; }
interface MBHit        { id: string; name: string; score: number; type: string | null; country: string | null; tags: string[]; }
interface AudiomackHit { id: string; name: string; slug: string; imageUrl: string | null; followers: number; url: string; }
interface JioSaavnHit  { id: string; name: string; imageUrl: string | null; url: string; }

interface SyncResult {
  synced: string[];
  changes: Record<string, unknown>;
}

interface Props {
  profile: ArtistProfile;
  onUpdated: () => void;
}

const PLATFORM_META: Record<string, { label: string; color: string; dot: string }> = {
  spotify:              { label: 'Spotify',       color: 'text-green-500',  dot: 'bg-green-500'  },
  apple:                { label: 'Apple Music',   color: 'text-pink-500',   dot: 'bg-pink-500'   },
  deezer:               { label: 'Deezer',        color: 'text-purple-500', dot: 'bg-purple-500' },
  audiomack:            { label: 'Audiomack',     color: 'text-amber-500',  dot: 'bg-amber-500'  },
  jiosaavn:             { label: 'JioSaavn',      color: 'text-blue-500',   dot: 'bg-blue-500'   },
  musicbrainz_confirmed:{ label: 'MusicBrainz',   color: 'text-orange-400', dot: 'bg-orange-400' },
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-mono tabular-nums w-8 text-right">{value}%</span>
    </div>
  );
}

export default function AutoArtistSync({ profile, onUpdated }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [discovery, setDiscovery] = useState<DiscoverResult | null>(null);
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const [fixerOpen, setFixerOpen] = useState(false);
  const [urlDiscoveriesOpen, setUrlDiscoveriesOpen] = useState(false);
  const [fixerUri, setFixerUri] = useState('');
  const [fixerNotes, setFixerNotes] = useState('');
  const [fixerUriError, setFixerUriError] = useState('');

  const discoverMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/auto-discover`).then(r => r.json()),
    onSuccess: (data: DiscoverResult) => {
      setDiscovery(data);
      if (data.saved && data.savedFields.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
        onUpdated();
        const savedLabels = data.savedFields
          .filter(f => !f.endsWith('_confirmed'))
          .map(f => PLATFORM_META[f]?.label ?? f);
        toast({
          title: `Auto-discovered ${savedLabels.length} platform${savedLabels.length !== 1 ? 's' : ''}`,
          description: savedLabels.join(', '),
        });
      }
    },
    onError: (err: any) => {
      const is401 = err?.message?.includes('401') || err?.status === 401 || String(err).includes('401');
      if (is401) {
        toast({
          title: 'Session expired',
          description: 'Your session timed out. Reloading…',
          variant: 'destructive',
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast({ title: 'Discovery failed', description: 'Could not reach platform APIs', variant: 'destructive' });
      }
    },
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/auto-sync`).then(r => r.json()),
    onSuccess: (data: SyncResult) => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      onUpdated();
      if (data.synced.length > 0) {
        toast({
          title: `Synced from ${data.synced.join(', ')}`,
          description: Object.keys(data.changes).length > 0
            ? `Updated: ${Object.keys(data.changes).join(', ')}`
            : 'Profile data is already up to date',
        });
      } else {
        toast({ title: 'Nothing to sync yet', description: 'Link at least one platform first' });
      }
    },
    onError: () => toast({ title: 'Sync failed', variant: 'destructive' }),
  });

  const savePlatformMutation = useMutation({
    mutationFn: (updates: Record<string, string>) =>
      apiRequest('PATCH', `/api/artist-profiles/${profile.id}`, updates).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      onUpdated();
      toast({ title: 'Platform ID saved' });
    },
    onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
  });

  const fixerMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/artist-profiles/${profile.id}/fixer`, {
        targetSpotifyUri: fixerUri,
        notes: fixerNotes,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      onUpdated();
      setFixerOpen(false);
      toast({ title: 'Fixer request submitted', description: 'Re-mapping will be applied to future releases' });
    },
    onError: (err: any) => toast({
      title: 'Fixer request failed',
      description: err?.message ?? 'Check that the Spotify URI is valid',
      variant: 'destructive',
    }),
  });

  useEffect(() => {
    if (!hasAutoRun) {
      setHasAutoRun(true);
      discoverMutation.mutate();
    }
  }, []);

  const hasAnyLinked = !!(profile.spotifyArtistId || profile.appleArtistId || profile.deezerArtistId || profile.soundcloudArtistId);
  const isRunning = discoverMutation.isPending || syncMutation.isPending;

  // Build the API-searched platform rows for rendering
  const apiRows = discovery ? [
    {
      key: 'spotify' as const,
      hit: discovery.spotify,
      alreadyLinked: !!profile.spotifyArtistId,
      savePayload: discovery.spotify
        ? { spotifyArtistId: discovery.spotify.result.id, spotifyArtistUri: discovery.spotify.result.uri }
        : null,
      imageUrl: discovery.spotify?.result.imageUrl ?? null,
      subtitle: discovery.spotify
        ? `${fmt(discovery.spotify.result.followers)} followers · ${discovery.spotify.result.genres.slice(0, 2).join(', ')}`
        : null,
      href: discovery.spotify?.result.externalUrl ?? null,
    },
    {
      key: 'apple' as const,
      hit: discovery.apple,
      alreadyLinked: !!profile.appleArtistId,
      savePayload: discovery.apple ? { appleArtistId: discovery.apple.result.id } : null,
      imageUrl: null,
      subtitle: discovery.apple ? discovery.apple.result.genres.join(', ') : null,
      href: discovery.apple?.result.url ?? null,
    },
    {
      key: 'deezer' as const,
      hit: discovery.deezer,
      alreadyLinked: !!profile.deezerArtistId,
      savePayload: discovery.deezer ? { deezerArtistId: discovery.deezer.result.id } : null,
      imageUrl: discovery.deezer?.result.pictureUrl ?? null,
      subtitle: discovery.deezer ? `${fmt(discovery.deezer.result.fans)} fans` : null,
      href: discovery.deezer?.result.link ?? null,
    },
    {
      key: 'audiomack' as const,
      hit: discovery.audiomack,
      alreadyLinked: !!profile.soundcloudArtistId,
      savePayload: discovery.audiomack
        ? { soundcloudArtistId: discovery.audiomack.result.slug || discovery.audiomack.result.id }
        : null,
      imageUrl: discovery.audiomack?.result.imageUrl ?? null,
      subtitle: discovery.audiomack ? `${fmt(discovery.audiomack.result.followers)} followers` : null,
      href: discovery.audiomack?.result.url ?? null,
    },
    {
      key: 'jiosaavn' as const,
      hit: discovery.jiosaavn,
      alreadyLinked: false,
      savePayload: null,
      imageUrl: discovery.jiosaavn?.result.imageUrl ?? null,
      subtitle: null,
      href: discovery.jiosaavn?.result.url ?? null,
    },
  ] : [];

  return (
    <div className="space-y-4 pt-2">

      {/* ── Header actions ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Auto Artist Sync</span>
          {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => discoverMutation.mutate()}
            disabled={isRunning}
            title="Re-discover platform IDs by name"
          >
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Discover
          </Button>
          {hasAnyLinked && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={isRunning}
              title="Refresh data from linked platforms"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          )}
        </div>
      </div>

      {/* ── Discovery scanning state ── */}
      {discoverMutation.isPending && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">Scanning platforms for "{profile.artistName}"…</p>
          {['Spotify', 'Apple Music', 'Deezer', 'Audiomack', 'JioSaavn', 'MusicBrainz'].map((p, i) => (
            <div key={p} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ animationDelay: `${i * 150}ms` }} />
              {p}
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            Generating search links for 90+ additional DSPs…
          </p>
        </div>
      )}

      {/* ── Discovery results — API-searched platforms ── */}
      {discovery && !discoverMutation.isPending && (
        <div className="space-y-2">
          {apiRows.map(({ key, hit, alreadyLinked, savePayload, imageUrl, subtitle, href }) => {
            const meta = PLATFORM_META[key];
            return (
              <div key={key} className="rounded-lg border p-3 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {alreadyLinked ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : hit ? (
                    <div className={`h-2 w-2 rounded-full mt-1 ${meta.dot}`} />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                    {alreadyLinked && <Badge variant="secondary" className="text-xs py-0">Linked</Badge>}
                    {discovery.savedFields.includes(key) && (
                      <Badge className="text-xs py-0 bg-green-500">Auto-saved</Badge>
                    )}
                  </div>

                  {hit ? (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {imageUrl && (
                          <img src={imageUrl} alt={hit.result.name} className="h-7 w-7 rounded-full object-cover" />
                        )}
                        <span className="text-sm truncate">{hit.result.name}</span>
                      </div>
                      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                      <ConfidenceBar value={hit.confidence} />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">No match found on this platform</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  {!alreadyLinked && hit && savePayload && hit.confidence >= 60 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => savePlatformMutation.mutate(savePayload as Record<string, string>)}
                      disabled={savePlatformMutation.isPending}
                    >
                      Use
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── MusicBrainz cross-validation indicator ── */}
          {discovery.musicbrainz && (
            <div className="rounded-lg border border-dashed p-3 flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-orange-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-orange-400">MusicBrainz</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Identity cross-validated · {discovery.musicbrainz.result.name}
                  {discovery.musicbrainz.result.type ? ` (${discovery.musicbrainz.result.type})` : ''}
                </p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {discovery.musicbrainz.confidence}% match
              </Badge>
            </div>
          )}

          {/* ── URL discoveries — all 97 DSPs ── */}
          {discovery.urlDiscoveries.length > 0 && (
            <Collapsible open={urlDiscoveriesOpen} onOpenChange={setUrlDiscoveriesOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between rounded-lg border bg-muted/20 p-3 text-sm hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {discovery.urlDiscoveries.length} more platforms available
                    </span>
                    <Badge variant="outline" className="text-xs">Search links generated</Badge>
                  </div>
                  {urlDiscoveriesOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-lg border divide-y max-h-64 overflow-y-auto">
                  {discovery.urlDiscoveries.map(d => (
                    <div key={d.platform} className="flex items-center justify-between px-3 py-2 hover:bg-muted/20">
                      <span className="text-sm text-muted-foreground">{d.platformLabel}</span>
                      <a
                        href={d.searchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Search
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground px-1 pt-2">
                  These links open artist search pages on each DSP. Your music is distributed to all these platforms via your distributor.
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {/* ── Linked platform quick view ── */}
      {hasAnyLinked && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Currently linked</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profile.spotifyArtistId && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-200 font-mono">
                Spotify · {profile.spotifyArtistId.slice(0, 10)}…
              </Badge>
            )}
            {profile.appleArtistId && (
              <Badge variant="outline" className="text-xs text-pink-600 border-pink-200 font-mono">
                Apple · {profile.appleArtistId}
              </Badge>
            )}
            {profile.deezerArtistId && (
              <Badge variant="outline" className="text-xs text-purple-600 border-purple-200 font-mono">
                Deezer · {profile.deezerArtistId}
              </Badge>
            )}
            {profile.soundcloudArtistId && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 font-mono">
                Audiomack · {profile.soundcloudArtistId.slice(0, 12)}
              </Badge>
            )}
            {profile.isVerified && (
              <Badge className="text-xs bg-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />Verified
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* ── Fixer (wrong artist page) ── */}
      {profile.spotifyArtistId && (
        <Collapsible open={fixerOpen} onOpenChange={setFixerOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
              <span className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                {profile.fixerPending
                  ? `Fixer pending (${profile.fixerStatus})`
                  : 'Release landed on wrong artist page?'}
              </span>
              {fixerOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-lg border p-4 space-y-3 mt-1">
              {profile.fixerPending ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    A fixer request is currently <strong>{profile.fixerStatus}</strong>.
                    It will be applied to future releases automatically.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    If your release appeared on the wrong Spotify artist page, enter the correct Spotify artist URI below. This will be applied to all future releases.
                  </p>
                  <div className="space-y-2">
                    <Label className="text-xs">Correct Spotify Artist URI</Label>
                    <Input
                      placeholder="spotify:artist:4Z8W4fKeB5YxbusRsdQVPb"
                      value={fixerUri}
                      onChange={e => {
                        setFixerUri(e.target.value);
                        setFixerUriError(
                          e.target.value && !/^spotify:artist:[A-Za-z0-9]+$/.test(e.target.value)
                            ? 'Must match: spotify:artist:<ID>'
                            : ''
                        );
                      }}
                      className={fixerUriError ? 'border-destructive' : ''}
                    />
                    {fixerUriError && <p className="text-xs text-destructive">{fixerUriError}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Notes (optional)</Label>
                    <Textarea
                      placeholder="Describe what happened…"
                      value={fixerNotes}
                      onChange={e => setFixerNotes(e.target.value)}
                      className="text-sm min-h-[60px]"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => fixerMutation.mutate()}
                    disabled={!fixerUri || !!fixerUriError || fixerMutation.isPending}
                  >
                    {fixerMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    Submit Fixer Request
                  </Button>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
