import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, ExternalLink, ChevronDown, ChevronUp,
  Loader2, Globe, Info, Key, Wrench, Music2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  claimed: boolean;
  artistId: string | null;
  howVerified: string;
  distributorHandles: boolean;
}

interface PlatformUrlDiscovery {
  platform: string;
  platformLabel: string;
  searchUrl: string;
  profileUrlTemplate: string | null;
  method: 'url_template';
}

interface HubData {
  artistName: string;
  portals: Portal[];
  metadataKeys: {
    artistName: string;
    storedIds: Record<string, string>;
  };
  urlDiscoveries: PlatformUrlDiscovery[];
  labelgridConfigured: boolean;
}

interface Props {
  profile: ArtistProfile;
  onUpdated: () => void;
}

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

export default function AutoArtistSync({ profile, onUpdated }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [dspGridOpen, setDspGridOpen] = useState(false);
  const [fixerOpen, setFixerOpen] = useState(false);
  const [fixerUri, setFixerUri] = useState('');
  const [fixerNotes, setFixerNotes] = useState('');
  const [fixerUriError, setFixerUriError] = useState('');

  const { data: hub, isLoading } = useQuery<HubData>({
    queryKey: [`/api/artist-profiles/${profile.id}/profile-hub`],
    queryFn: () => apiRequest('GET', `/api/artist-profiles/${profile.id}/profile-hub`).then(r => r.json()),
  });

  const savePlatformMutation = useMutation({
    mutationFn: (updates: Record<string, string>) =>
      apiRequest('PATCH', `/api/artist-profiles/${profile.id}`, updates).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      queryClient.invalidateQueries({ queryKey: [`/api/artist-profiles/${profile.id}/profile-hub`] });
      onUpdated();
      toast({ title: 'Artist ID saved' });
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
      toast({ title: 'Re-mapping request submitted', description: 'Will be applied to future releases' });
    },
    onError: (err: any) => toast({
      title: 'Request failed',
      description: err?.message ?? 'Check that the Spotify URI is valid',
      variant: 'destructive',
    }),
  });

  const claimedCount = hub?.portals.filter(p => p.claimed).length ?? 0;
  const totalPortals = hub?.portals.length ?? 8;

  return (
    <div className="space-y-4 pt-2">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">DSP Profile Hub</span>
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {hub && !isLoading && (
            <Badge variant={claimedCount === totalPortals ? 'default' : 'outline'} className="text-xs">
              {claimedCount}/{totalPortals} portals set up
            </Badge>
          )}
        </div>
      </div>

      {/* ── How it works (collapsible) ── */}
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
            <p><span className="text-foreground font-medium">Switching distributors does not delete your profiles.</span> When your new distributor delivers a release, DSPs match it to your existing profile using artist name, ISRCs, audio fingerprints, and the artist IDs you provide. Keep metadata consistent across releases to ensure everything lands on the right profile.</p>
            <p><span className="text-foreground font-medium">You then claim or re-claim each DSP's artist portal.</span> Once a release is live (or in pre-release), use each platform's official artist portal to request access. Your distributor helps resolve mismatches and can request OAC merging for YouTube on your behalf.</p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Artist Portals ── */}
      {isLoading ? (
        <div className="rounded-lg border bg-muted/30 p-4 flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading your profile hub…</p>
        </div>
      ) : hub ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            DSP Artist Portals
          </p>
          <div className="space-y-2">
            {hub.portals.map(portal => (
              <div key={portal.key} className="rounded-lg border p-3 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {portal.claimed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground/50" />
                  )}
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
                  <p className="text-xs text-muted-foreground mt-0.5">{portal.howVerified}</p>
                  {portal.claimed && portal.artistId && (
                    <p className="text-xs font-mono text-muted-foreground/60 mt-0.5 truncate">ID: {portal.artistId}</p>
                  )}
                </div>
                <div className="shrink-0">
                  <a href={portal.portalUrl} target="_blank" rel="noreferrer">
                    <Button variant={portal.claimed ? 'ghost' : 'outline'} size="sm" className="h-7 text-xs gap-1">
                      {portal.claimed ? (
                        <>Open <ExternalLink className="h-3 w-3" /></>
                      ) : portal.distributorHandles ? (
                        <>Info <ExternalLink className="h-3 w-3" /></>
                      ) : (
                        <>Claim <ExternalLink className="h-3 w-3" /></>
                      )}
                    </Button>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
                  No platform IDs stored yet. Claim your portals above and your IDs will appear here for release matching.
                </div>
              )}
              <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                Keep your artist name and ISRCs identical across all releases. DSPs use these to attach new music to your existing profile — inconsistencies create duplicate or split profiles.
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
              Release landed on the wrong profile?
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
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    placeholder="Describe the issue — e.g. 'New release landed on duplicate profile, correct profile has 1.2M followers'"
                    value={fixerNotes}
                    onChange={e => setFixerNotes(e.target.value)}
                    className="text-xs min-h-[60px] resize-none"
                  />
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
