import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Download,
  Link2,
  Unlink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Music,
  Disc3,
  FileSpreadsheet,
  ExternalLink,
  Loader2,
  BarChart3,
  Globe,
  TrendingUp,
  ScanSearch,
  PackagePlus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface StreamingPlatform {
  id: string;
  name: string;
  profileType: string;
  apiSupported: boolean;
}

interface LinkedProfile {
  platformId: string;
  artistId: string;
  artistName: string;
  profileUrl: string;
  verified: boolean;
  followers?: number;
  monthlyListeners?: number;
  totalStreams?: number;
}

interface ScannedRelease {
  id: string;
  title: string;
  artistName: string;
  releaseType: 'single' | 'EP' | 'album';
  releaseDate: string | null;
  trackCount: number;
  coverUrl?: string;
  platformUrl?: string;
  platformId: string;
  externalId: string;
  upc?: string;
  genre?: string;
}

interface TransferJob {
  id: string;
  type: 'import' | 'sync';
  source: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  progress: number;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  errors: Array<{ item: string; error: string }>;
  createdAt: string;
  completedAt?: string;
  result?: {
    importedReleases?: number;
    totalStreams?: number;
  };
}

interface MigrationReport {
  totalReleases: number;
  totalTracks: number;
  totalStreams: number;
  platforms: Array<{ name: string; releases: number; streams: number }>;
  linkedProfiles: LinkedProfile[];
  recommendations: string[];
}

const PLATFORM_SCAN_SUPPORT: Record<string, boolean> = {
  spotify: true,
  apple_music: true,
  deezer: true,
  soundcloud: true,
  bandcamp: true,
  audiomack: true,
  youtube_music: false,
  amazon_music: false,
  tidal: false,
  beatport: false,
};

export function DataTransferWizard() {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [profileUrl, setProfileUrl] = useState('');
  const [artistName, setArtistName] = useState('');
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  const [scanningPlatform, setScanningPlatform] = useState<string | null>(null);
  const [scannedReleases, setScannedReleases] = useState<Record<string, ScannedRelease[]>>({});
  const [selectedReleases, setSelectedReleases] = useState<Record<string, Set<string>>>({});
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: platforms } = useQuery<{ platforms: StreamingPlatform[] }>({
    queryKey: ['/api/distribution/transfer/platforms'],
  });

  const { data: linkedProfiles, refetch: refetchProfiles } = useQuery<{ profiles: LinkedProfile[] }>({
    queryKey: ['/api/distribution/profiles'],
  });

  const { data: transferJobs, refetch: refetchJobs } = useQuery<{ jobs: TransferJob[] }>({
    queryKey: ['/api/distribution/transfer/jobs'],
  });

  const { data: migrationReport } = useQuery<MigrationReport>({
    queryKey: ['/api/distribution/migration/report'],
  });

  const linkProfileMutation = useMutation({
    mutationFn: async ({ platformId, profileUrl, artistName }: { platformId: string; profileUrl: string; artistName: string }) => {
      const res = await fetch('/api/distribution/profiles/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformId, profileUrl, artistName }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to link profile');
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Profile Linked', description: data.message });
      setShowLinkDialog(false);
      setProfileUrl('');
      setArtistName('');
      refetchProfiles();
    },
    onError: (error: any) => {
      toast({ title: 'Link Failed', description: error.message, variant: 'destructive' });
    },
  });

  const syncProfileMutation = useMutation({
    mutationFn: async (platformId: string) => {
      const res = await fetch(`/api/distribution/profiles/${platformId}/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to sync profile');
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Profile Synced', description: data.message });
      refetchProfiles();
    },
  });

  const unlinkProfileMutation = useMutation({
    mutationFn: async (platformId: string) => {
      const res = await fetch(`/api/distribution/profiles/${platformId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to unlink profile');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Profile Unlinked' });
      refetchProfiles();
    },
  });

  const importCatalogMutation = useMutation({
    mutationFn: async ({ platformId, releases }: { platformId: string; releases: ScannedRelease[] }) => {
      const res = await fetch(`/api/distribution/profiles/${platformId}/import-catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releases }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Import failed');
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({ title: 'Catalog Imported', description: data.message });
      setScannedReleases(prev => { const n = { ...prev }; delete n[variables.platformId]; return n; });
      setSelectedReleases(prev => { const n = { ...prev }; delete n[variables.platformId]; return n; });
      refetchJobs();
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/migration/report'] });
    },
    onError: (error: any) => {
      toast({ title: 'Import Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleScanReleases = async (platformId: string) => {
    setScanningPlatform(platformId);
    try {
      const res = await fetch(`/api/distribution/profiles/${platformId}/scan-releases`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Scan failed' }));
        throw new Error(err.error || 'Scan failed');
      }
      const data = await res.json();
      const releases: ScannedRelease[] = data.releases || [];
      setScannedReleases(prev => ({ ...prev, [platformId]: releases }));
      setSelectedReleases(prev => ({
        ...prev,
        [platformId]: new Set(releases.map(r => r.id)),
      }));
      setExpandedPlatform(platformId);
      toast({
        title: 'Scan Complete',
        description: releases.length > 0
          ? `Found ${releases.length} release${releases.length !== 1 ? 's' : ''} on ${getPlatformName(platformId)}`
          : `No releases found on ${getPlatformName(platformId)}`,
      });
    } catch (err: any) {
      toast({ title: 'Scan Failed', description: err.message, variant: 'destructive' });
    } finally {
      setScanningPlatform(null);
    }
  };

  const handleToggleRelease = (platformId: string, releaseId: string) => {
    setSelectedReleases(prev => {
      const set = new Set(prev[platformId] || []);
      if (set.has(releaseId)) set.delete(releaseId);
      else set.add(releaseId);
      return { ...prev, [platformId]: set };
    });
  };

  const handleSelectAll = (platformId: string, all: boolean) => {
    const releases = scannedReleases[platformId] || [];
    setSelectedReleases(prev => ({
      ...prev,
      [platformId]: all ? new Set(releases.map(r => r.id)) : new Set(),
    }));
  };

  const handleImport = (platformId: string) => {
    const releases = (scannedReleases[platformId] || []).filter(r =>
      (selectedReleases[platformId] || new Set()).has(r.id)
    );
    if (releases.length === 0) {
      toast({ title: 'No releases selected', variant: 'destructive' });
      return;
    }
    importCatalogMutation.mutate({ platformId, releases });
  };

  const getPlatformIcon = (platformId: string) => {
    const icons: Record<string, string> = {
      spotify: '🎵',
      apple_music: '🍎',
      amazon_music: '📦',
      youtube_music: '▶️',
      deezer: '🎧',
      tidal: '🌊',
      soundcloud: '☁️',
      bandcamp: '🎸',
      audiomack: '🔊',
      beatport: '🎛️',
    };
    return icons[platformId] || '🎵';
  };

  const getPlatformName = (platformId: string) => {
    return platforms?.platforms.find(p => p.id === platformId)?.name || platformId;
  };

  const getReleaseTypeBadge = (type: string) => {
    switch (type) {
      case 'album': return <Badge className="bg-purple-600 text-white text-xs">Album</Badge>;
      case 'EP': return <Badge className="bg-blue-600 text-white text-xs">EP</Badge>;
      default: return <Badge variant="outline" className="text-xs">Single</Badge>;
    }
  };

  const getStatusBadge = (status: TransferJob['status']) => {
    switch (status) {
      case 'completed': return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed': return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'partial': return <Badge className="bg-yellow-500"><AlertCircle className="w-3 h-3 mr-1" />Partial</Badge>;
      case 'processing': return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      default: return <Badge variant="outline">Pending</Badge>;
    }
  };

  const profiles = linkedProfiles?.profiles || [];
  const scanSupportedProfiles = profiles.filter(p => PLATFORM_SCAN_SUPPORT[p.platformId]);
  const manualProfiles = profiles.filter(p => !PLATFORM_SCAN_SUPPORT[p.platformId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Data Transfer & Profile Sync</h2>
          <p className="text-muted-foreground">Scan and import your release catalog directly from your streaming profiles</p>
        </div>
      </div>

      {migrationReport && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Releases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{migrationReport.totalReleases}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Tracks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{migrationReport.totalTracks}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Streams</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{migrationReport.totalStreams.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Linked Profiles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{profiles.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {migrationReport?.recommendations && migrationReport.recommendations.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Recommendations:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {migrationReport.recommendations.map((rec, idx) => (
                <li key={idx} className="text-sm">{rec}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="catalog-sync" className="space-y-4">
        <TabsList>
          <TabsTrigger value="catalog-sync" className="flex items-center gap-2">
            <ScanSearch className="h-4 w-4" />
            Catalog Sync
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Streaming Profiles
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Transfer History
          </TabsTrigger>
        </TabsList>

        {/* ── Catalog Sync tab (replaces distributor CSV import) ── */}
        <TabsContent value="catalog-sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScanSearch className="h-5 w-5" />
                Profile Catalog Scanner
              </CardTitle>
              <CardDescription>
                Your linked streaming profiles are scanned directly using the same parser that syncs your analytics — now extended to pull your full release catalog including albums, EPs, and singles with artwork, dates, and track counts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Globe className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-1">No streaming profiles linked</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Link a Spotify, Apple Music, Deezer, SoundCloud, Bandcamp, or Audiomack profile to scan your release catalog.
                  </p>
                  <Button onClick={() => { }}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Link a Profile
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Profiles with scan support */}
                  {scanSupportedProfiles.length > 0 && (
                    <div className="space-y-3">
                      {scanSupportedProfiles.map(profile => {
                        const isScanning = scanningPlatform === profile.platformId;
                        const scanned = scannedReleases[profile.platformId];
                        const selected = selectedReleases[profile.platformId] || new Set();
                        const isExpanded = expandedPlatform === profile.platformId;
                        const isImporting = importCatalogMutation.isPending &&
                          importCatalogMutation.variables?.platformId === profile.platformId;

                        return (
                          <Card key={profile.platformId} className="overflow-hidden">
                            <div className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">{getPlatformIcon(profile.platformId)}</span>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{profile.artistName}</span>
                                      {profile.verified && (
                                        <Badge variant="outline" className="text-green-500 border-green-500 text-xs">
                                          <CheckCircle2 className="h-3 w-3 mr-1" />Verified
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {getPlatformName(profile.platformId)}
                                      {profile.followers !== undefined && (
                                        <span className="ml-2">· {profile.followers.toLocaleString()} followers</span>
                                      )}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {scanned && scanned.length > 0 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setExpandedPlatform(isExpanded ? null : profile.platformId)}
                                    >
                                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                      <span className="ml-1 text-xs">{scanned.length} found</span>
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleScanReleases(profile.platformId)}
                                    disabled={isScanning || scanningPlatform !== null}
                                  >
                                    {isScanning ? (
                                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning…</>
                                    ) : (
                                      <><ScanSearch className="h-4 w-4 mr-2" />{scanned ? 'Re-scan' : 'Scan Releases'}</>
                                    )}
                                  </Button>
                                  {scanned && scanned.length > 0 && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleImport(profile.platformId)}
                                      disabled={isImporting || selected.size === 0}
                                    >
                                      {isImporting ? (
                                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing…</>
                                      ) : (
                                        <><PackagePlus className="h-4 w-4 mr-2" />Import {selected.size > 0 && selected.size < scanned.length ? `${selected.size} of ${scanned.length}` : selected.size}</>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {/* Scanned releases list */}
                              {scanned && isExpanded && (
                                <div className="mt-4 border-t pt-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">
                                      {scanned.length} release{scanned.length !== 1 ? 's' : ''} found
                                    </span>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <button
                                        className="hover:text-foreground"
                                        onClick={() => handleSelectAll(profile.platformId, true)}
                                      >Select all</button>
                                      <span>·</span>
                                      <button
                                        className="hover:text-foreground"
                                        onClick={() => handleSelectAll(profile.platformId, false)}
                                      >Deselect all</button>
                                    </div>
                                  </div>

                                  {scanned.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                      No releases found on this profile.
                                    </p>
                                  ) : (
                                    <ScrollArea className="h-[340px]">
                                      <div className="space-y-2 pr-2">
                                        {scanned.map(release => {
                                          const isSelected = selected.has(release.id);
                                          return (
                                            <div
                                              key={release.id}
                                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                                              onClick={() => handleToggleRelease(profile.platformId, release.id)}
                                            >
                                              <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={() => handleToggleRelease(profile.platformId, release.id)}
                                                onClick={e => e.stopPropagation()}
                                              />

                                              {release.coverUrl ? (
                                                <img
                                                  src={release.coverUrl}
                                                  alt={release.title}
                                                  className="h-12 w-12 rounded object-cover flex-shrink-0"
                                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                              ) : (
                                                <div className="h-12 w-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                                  <Disc3 className="h-5 w-5 text-muted-foreground" />
                                                </div>
                                              )}

                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="font-medium text-sm truncate">{release.title}</span>
                                                  {getReleaseTypeBadge(release.releaseType)}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                                  {release.releaseDate && (
                                                    <span>{new Date(release.releaseDate).getFullYear()}</span>
                                                  )}
                                                  <span>·</span>
                                                  <span>{release.trackCount} track{release.trackCount !== 1 ? 's' : ''}</span>
                                                  {release.genre && (
                                                    <><span>·</span><span>{release.genre}</span></>
                                                  )}
                                                </div>
                                              </div>

                                              {release.platformUrl && (
                                                <a
                                                  href={release.platformUrl}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  onClick={e => e.stopPropagation()}
                                                >
                                                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                                </a>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </ScrollArea>
                                  )}
                                </div>
                              )}

                              {/* Empty state after scan */}
                              {scanned && scanned.length === 0 && !isExpanded && (
                                <p className="text-sm text-muted-foreground mt-2">
                                  No releases found on this profile. Try re-scanning or check your profile URL.
                                </p>
                              )}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {/* Profiles without scan support */}
                  {manualProfiles.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Profiles without catalog scanning
                      </p>
                      {manualProfiles.map(profile => (
                        <Card key={profile.platformId} className="p-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{getPlatformIcon(profile.platformId)}</span>
                            <div className="flex-1">
                              <span className="font-medium text-sm">{profile.artistName}</span>
                              <p className="text-xs text-muted-foreground">
                                {getPlatformName(profile.platformId)} · Catalog scanning not yet supported for this platform
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Analytics only
                            </Badge>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  <Alert>
                    <ScanSearch className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      The scanner reads your public artist pages using the same parser that syncs your followers, monthly listeners, and top tracks — now extended to discover your full discography. Releases already in your catalog are matched and merged automatically rather than duplicated.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Streaming Profiles tab ── */}
        <TabsContent value="profiles" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Streaming Platform Profiles</CardTitle>
                <CardDescription>
                  Link your existing artist profiles to sync analytics and scan your release catalog
                </CardDescription>
              </div>
              <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Link2 className="h-4 w-4 mr-2" />
                    Link Profile
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Link Streaming Profile</DialogTitle>
                    <DialogDescription>
                      Connect your artist profile to sync analytics and release catalog data
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Platform</Label>
                      <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                        <SelectContent>
                          {platforms?.platforms.map((platform) => (
                            <SelectItem key={platform.id} value={platform.id}>
                              <span className="flex items-center gap-2">
                                <span>{getPlatformIcon(platform.id)}</span>
                                <span>{platform.name}</span>
                                {PLATFORM_SCAN_SUPPORT[platform.id] && (
                                  <Badge variant="outline" className="text-xs text-green-600 border-green-400">Catalog scan</Badge>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Artist Name</Label>
                      <Input
                        value={artistName}
                        onChange={(e) => setArtistName(e.target.value)}
                        placeholder="Your artist name on this platform"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Profile URL</Label>
                      <Input
                        value={profileUrl}
                        onChange={(e) => setProfileUrl(e.target.value)}
                        placeholder="https://open.spotify.com/artist/..."
                      />
                      <p className="text-xs text-muted-foreground">
                        Paste the full URL to your artist profile
                      </p>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => linkProfileMutation.mutate({ platformId: selectedPlatform, profileUrl, artistName })}
                      disabled={!selectedPlatform || !profileUrl || linkProfileMutation.isPending}
                    >
                      {linkProfileMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Link Profile'
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {profiles.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {profiles.map((profile) => (
                      <Card key={profile.platformId} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{getPlatformIcon(profile.platformId)}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{profile.artistName}</span>
                                {profile.verified && (
                                  <Badge variant="outline" className="text-green-500 border-green-500">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />Verified
                                  </Badge>
                                )}
                                {PLATFORM_SCAN_SUPPORT[profile.platformId] && (
                                  <Badge variant="outline" className="text-xs text-blue-500 border-blue-400">Catalog scan</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {getPlatformName(profile.platformId)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {profile.monthlyListeners !== undefined && (
                              <div className="text-right">
                                <p className="text-sm font-medium">{profile.monthlyListeners.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">Monthly Listeners</p>
                              </div>
                            )}
                            {profile.followers !== undefined && (
                              <div className="text-right">
                                <p className="text-sm font-medium">{profile.followers.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">Followers</p>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => syncProfileMutation.mutate(profile.platformId)}
                                disabled={syncProfileMutation.isPending}
                                title="Sync analytics"
                              >
                                <RefreshCw className={`h-4 w-4 ${syncProfileMutation.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(profile.profileUrl, '_blank')}
                                title="Open profile"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => unlinkProfileMutation.mutate(profile.platformId)}
                                disabled={unlinkProfileMutation.isPending}
                                title="Unlink profile"
                              >
                                <Unlink className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Globe className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-1">No profiles linked yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Link your streaming platform profiles to sync analytics and scan your release catalog
                  </p>
                  <Button variant="outline" onClick={() => setShowLinkDialog(true)}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Link Your First Profile
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Transfer History tab ── */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transfer History</CardTitle>
              <CardDescription>
                View the status of your catalog imports and profile sync operations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transferJobs?.jobs && transferJobs.jobs.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {transferJobs.jobs.map((job) => (
                      <Card key={job.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {job.type === 'import' ? (
                              <Download className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <RefreshCw className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium capitalize">{job.type}</span>
                            <span className="text-muted-foreground">from</span>
                            <span className="font-medium">
                              {job.source.replace('_profile_scan', ' profile').replace(/_/g, ' ')}
                            </span>
                          </div>
                          {getStatusBadge(job.status)}
                        </div>

                        {job.status === 'processing' && (
                          <Progress value={job.progress} className="mb-2" />
                        )}

                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>
                            {job.successItems} imported, {job.failedItems} failed
                          </span>
                          <span>
                            {new Date(job.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {job.result && (
                          <div className="mt-2 text-sm">
                            <span className="text-green-500">
                              {job.result.importedReleases} releases imported
                            </span>
                            {job.result.totalStreams !== undefined && job.result.totalStreams > 0 && (
                              <span className="text-muted-foreground ml-2">
                                ({job.result.totalStreams.toLocaleString()} total streams)
                              </span>
                            )}
                          </div>
                        )}

                        {job.errors.length > 0 && (
                          <div className="mt-2">
                            <details className="text-sm">
                              <summary className="cursor-pointer text-red-500">
                                {job.errors.length} errors
                              </summary>
                              <ul className="mt-1 space-y-1 pl-4">
                                {job.errors.slice(0, 5).map((err, idx) => (
                                  <li key={idx} className="text-muted-foreground">
                                    {err.item}: {err.error}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-1">No transfers yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Your import and sync history will appear here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
