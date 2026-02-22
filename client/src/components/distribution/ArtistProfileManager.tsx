import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Music2, CheckCircle2, AlertCircle, ChevronRight, Trash2, Wrench, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import ArtistLookerUpper from './ArtistLookerUpper';
import ArtistProfileFixer from './ArtistProfileFixer';

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

export default function ArtistProfileManager({ onSelectProfile, selectedProfileId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showLookerUpper, setShowLookerUpper] = useState(false);
  const [showFixer, setShowFixer] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ArtistProfile | null>(null);
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
      toast({ title: 'Artist profile created', description: profile.artistName });
    },
    onError: () => toast({ title: 'Failed to create artist profile', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/artist-profiles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      toast({ title: 'Artist profile deleted' });
    },
    onError: () => toast({ title: 'Failed to delete artist profile', variant: 'destructive' }),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => apiRequest('POST', `/api/artist-profiles/${id}/verify`).then(r => r.json()),
    onSuccess: ({ spotifyData }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
      toast({ title: 'Spotify identity verified', description: `Confirmed: ${spotifyData.name}` });
    },
    onError: (err: any) => toast({
      title: 'Verification failed',
      description: err?.message ?? 'Could not verify Spotify artist ID',
      variant: 'destructive',
    }),
  });

  const connectedPlatforms = (p: ArtistProfile) => {
    const platforms = [];
    if (p.spotifyArtistId) platforms.push('Spotify');
    if (p.appleArtistId) platforms.push('Apple');
    if (p.youtubeChannelId) platforms.push('YouTube');
    if (p.deezerArtistId) platforms.push('Deezer');
    if (p.tidalArtistId) platforms.push('Tidal');
    if (p.soundcloudArtistId) platforms.push('SoundCloud');
    if (p.amazonMusicArtistId) platforms.push('Amazon');
    return platforms;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Artist Profiles</h3>
          <p className="text-sm text-muted-foreground">
            Link your artist identity to streaming platforms so releases land on the correct pages.
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
              Create a profile to link your releases to the correct artist pages on Spotify, Apple Music, and more.
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

          return (
            <Card
              key={profile.id}
              className={`cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : 'hover:border-primary/50'}`}
              onClick={() => onSelectProfile?.(profile)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {profile.profileImageUrl ? (
                    <img src={profile.profileImageUrl} alt={profile.artistName} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <Music2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{profile.artistName}</span>
                      {profile.isVerified && (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" title="Spotify identity verified" />
                      )}
                      {profile.fixerPending && (
                        <Badge variant="secondary" className="text-xs">Fixer pending</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant={profile.isNewArtist ? 'secondary' : 'outline'} className="text-xs">
                        {profile.isNewArtist ? 'New artist' : 'Existing artist'}
                      </Badge>
                      {platforms.map(p => (
                        <Badge key={p} variant="outline" className="text-xs text-green-600 border-green-200">
                          {p}
                        </Badge>
                      ))}
                      {platforms.length === 0 && (
                        <Badge variant="outline" className="text-xs text-orange-500 border-orange-200">
                          No platform IDs
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {profile.spotifyArtistId && !profile.isVerified && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); verifyMutation.mutate(profile.id); }}
                        title="Verify Spotify identity"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); setActiveProfile(profile); setShowLookerUpper(true); }}
                      title="Look up platform IDs"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); setActiveProfile(profile); setShowFixer(true); }}
                      title="Submit fixer request"
                    >
                      <Wrench className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); deleteMutation.mutate(profile.id); }}
                      title="Delete profile"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
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
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                You'll need to link your platform IDs after creating this profile. Use the Looker-Upper tool to find them.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.artistName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeProfile && (
        <>
          <ArtistLookerUpper
            open={showLookerUpper}
            onOpenChange={setShowLookerUpper}
            profile={activeProfile}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
              setShowLookerUpper(false);
            }}
          />
          <ArtistProfileFixer
            open={showFixer}
            onOpenChange={setShowFixer}
            profile={activeProfile}
            onSubmitted={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/artist-profiles'] });
              setShowFixer(false);
            }}
          />
        </>
      )}
    </div>
  );
}
