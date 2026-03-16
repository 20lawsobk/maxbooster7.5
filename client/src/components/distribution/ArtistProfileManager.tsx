import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Music2, CheckCircle2, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import AutoArtistSync from './AutoArtistSync';

interface ArtistProfile {
  id: string;
  artistName: string;
  isNewArtist: boolean;
  spotifyArtistId: string | null;
  spotifyArtistUri: string | null;
  appleArtistId: string | null;
  youtubeChannelId: string | null;
  tidalArtistId: string | null;
  deezerArtistId: string | null;
  soundcloudArtistId: string | null;
  amazonMusicArtistId: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  fixerPending: boolean;
  fixerStatus: string;
  profileImageUrl: string | null;
  genres: string[];
}

interface Props {
  onSelectProfile?: (profile: ArtistProfile) => void;
  selectedProfileId?: string;
}

function connectedPlatforms(p: ArtistProfile): string[] {
  const out: string[] = [];
  if (p.spotifyArtistId) out.push('Spotify');
  if (p.appleArtistId) out.push('Apple');
  if (p.youtubeChannelId) out.push('YouTube');
  if (p.deezerArtistId) out.push('Deezer');
  if (p.tidalArtistId) out.push('Tidal');
  if (p.soundcloudArtistId) out.push('SoundCloud');
  if (p.amazonMusicArtistId) out.push('Amazon');
  return out;
}

export default function ArtistProfileManager({ onSelectProfile, selectedProfileId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ artistName: '', isNewArtist: true });

  const { data, isLoading } = useQuery<{ profiles: ArtistProfile[] }>({
    queryKey: ['/api/artist-profiles'],
    queryFn: () => apiRequest('GET', '/api/artist-profiles').then(r => r.json()),
  });
  const profiles = data?.profiles ?? [];

  const createMutation = useMutation({
    mutationFn: (body: object) => apiRequest('POST', '/api/artist-profiles', body).then(r => r.json()),
    onSuccess: ({ profile }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      setShowCreateDialog(false);
      setForm({ artistName: '', isNewArtist: true });
      setExpandedId(profile.id);
      toast({ title: 'Artist profile created', description: `Auto-discovering "${profile.artistName}" across platforms…` });
    },
    onError: () => toast({ title: 'Failed to create artist profile', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/artist-profiles/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      if (expandedId === id) setExpandedId(null);
      toast({ title: 'Artist profile deleted' });
    },
    onError: () => toast({ title: 'Failed to delete artist profile', variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Artist Profiles</h3>
          <p className="text-sm text-muted-foreground">
            Auto-discovers and syncs your artist identity across Spotify, Apple Music, and Deezer.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground py-4 text-center">Loading artist profiles…</div>
      )}

      {!isLoading && profiles.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Music2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No artist profiles yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create a profile — the system will automatically find and sync your artist page across streaming platforms.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Profile
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {profiles.map(profile => {
          const platforms = connectedPlatforms(profile);
          const isSelected = selectedProfileId === profile.id;
          const isExpanded = expandedId === profile.id;

          return (
            <Card
              key={profile.id}
              className={`transition-all ${isSelected ? 'ring-2 ring-primary' : 'hover:border-primary/50'}`}
            >
              <Collapsible open={isExpanded} onOpenChange={open => setExpandedId(open ? profile.id : null)}>
                <CollapsibleTrigger asChild>
                  <CardContent
                    className="p-4 cursor-pointer"
                    onClick={() => {
                      onSelectProfile?.(profile);
                      setExpandedId(isExpanded ? null : profile.id);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {profile.profileImageUrl ? (
                        <img
                          src={profile.profileImageUrl}
                          alt={profile.artistName}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                          <Music2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold truncate">{profile.artistName}</span>
                          {profile.isVerified && (
                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" title="Verified" />
                          )}
                          {profile.fixerPending && (
                            <Badge variant="secondary" className="text-xs">Fixer pending</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge
                            variant={profile.isNewArtist ? 'secondary' : 'outline'}
                            className="text-xs"
                          >
                            {profile.isNewArtist ? 'New artist' : 'Existing artist'}
                          </Badge>
                          {platforms.map(p => (
                            <Badge key={p} variant="outline" className="text-xs text-green-600 border-green-200">
                              {p}
                            </Badge>
                          ))}
                          {platforms.length === 0 && (
                            <Badge variant="outline" className="text-xs text-orange-500 border-orange-200">
                              Discovering…
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={e => { e.stopPropagation(); deleteMutation.mutate(profile.id); }}
                          title="Delete profile"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-4 pb-4 border-t pt-3">
                    <AutoArtistSync
                      profile={profile}
                      onUpdated={() => queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] })}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Artist Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Artist Name</Label>
              <Input
                placeholder="e.g. The Weeknd"
                value={form.artistName}
                onChange={e => setForm(f => ({ ...f, artistName: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && form.artistName.trim()) createMutation.mutate(form);
                }}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium text-sm">New artist?</p>
                <p className="text-xs text-muted-foreground">
                  Turn off if this artist already has profiles on Spotify, Apple Music, etc.
                </p>
              </div>
              <Switch
                checked={form.isNewArtist}
                onCheckedChange={v => setForm(f => ({ ...f, isNewArtist: v }))}
              />
            </div>
            {!form.isNewArtist && (
              <div className="rounded-lg bg-muted/50 border p-3 text-sm text-muted-foreground">
                After creating this profile, the auto-discover system will search all major platforms and link the matching artist pages automatically.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.artistName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating…' : 'Create & Auto-Discover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
