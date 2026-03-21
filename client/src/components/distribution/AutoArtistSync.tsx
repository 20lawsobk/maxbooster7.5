import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, ExternalLink, ChevronDown, ChevronUp,
  Loader2, Globe, Info, Key, Wrench, Music2, AlertCircle,
  RefreshCw, Search, Edit2, Save, X, Zap, BarChart2,
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
      onUpdated();
      const synced = data.synced ?? [];
      toast({
        title: 'Metadata synced',
        description: synced.length > 0
          ? `Updated from: ${synced.join(', ')}`
          : 'No changes found',
      });
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
      onUpdated();
      setFixerOpen(false);
      toast({ title: 'Re-mapping request submitted', description: 'Will be applied to future releases' });
    },
    onError: (err: any) => toast({
      title: 'Request failed',
      description: err?.message ?? 'Check that the Spotify URI is valid',
      variant: 'destructive',
    }),
  });

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
    return (discoverResults as any)[portal.autoDiscoverKey] ?? null;
  };

  return (
    <div className="space-y-4 pt-2">

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
                  const r = (discoverResults as any)[key] as DiscoverResult | null;
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
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-24 shrink-0">Artist Name</span>
                <span className="text-xs font-medium">{hub.metadataKeys.artistName}</span>
              </div>
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
                Keep your artist name and ISRCs identical across all releases. DSPs use these keys to attach new music to your existing profile — inconsistencies create duplicate or split profiles.
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
    </div>
  );
}
