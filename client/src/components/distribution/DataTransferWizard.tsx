import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Upload, 
  Download, 
  Link2, 
  Unlink, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Music,
  FileSpreadsheet,
  ExternalLink,
  Loader2,
  ArrowRight,
  BarChart3,
  Globe,
  Users,
  TrendingUp
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Distributor {
  id: string;
  name: string;
  importFormat: string;
  exportUrl: string | null;
}

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

export function DataTransferWizard() {
  const [selectedDistributor, setSelectedDistributor] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [profileUrl, setProfileUrl] = useState('');
  const [artistName, setArtistName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: distributors } = useQuery<{ distributors: Distributor[] }>({
    queryKey: ['/api/distribution/transfer/distributors'],
  });

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

  const validateMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('distributor', selectedDistributor);
      
      const res = await fetch('/api/distribution/transfer/validate', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!res.ok) throw new Error('Validation failed');
      return res.json();
    },
    onSuccess: (data) => {
      setValidationResult(data);
      if (data.valid) {
        toast({
          title: 'Validation Successful',
          description: `Found ${data.validRows} valid releases to import`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Validation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('distributor', selectedDistributor);
      
      const res = await fetch('/api/distribution/transfer/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!res.ok) throw new Error('Import failed');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Import Complete',
        description: data.message,
      });
      setImportFile(null);
      setValidationResult(null);
      refetchJobs();
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
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
      toast({
        title: 'Profile Linked',
        description: data.message,
      });
      setShowLinkDialog(false);
      setProfileUrl('');
      setArtistName('');
      refetchProfiles();
    },
    onError: (error: any) => {
      toast({
        title: 'Link Failed',
        description: error.message,
        variant: 'destructive',
      });
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
      toast({
        title: 'Profile Synced',
        description: data.message,
      });
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
    onSuccess: (data) => {
      toast({
        title: 'Profile Unlinked',
        description: data.message,
      });
      refetchProfiles();
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setValidationResult(null);
    }
  };

  const handleValidate = () => {
    if (importFile && selectedDistributor) {
      validateMutation.mutate(importFile);
    }
  };

  const handleImport = () => {
    if (importFile && selectedDistributor) {
      importMutation.mutate(importFile);
    }
  };

  const handleLinkProfile = () => {
    if (selectedPlatform && profileUrl) {
      linkProfileMutation.mutate({
        platformId: selectedPlatform,
        profileUrl,
        artistName,
      });
    }
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

  const getStatusBadge = (status: TransferJob['status']) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-500"><AlertCircle className="w-3 h-3 mr-1" />Partial</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Data Transfer & Profile Sync</h2>
          <p className="text-muted-foreground">Import your catalog from other distributors and sync your streaming profiles</p>
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
                <span className="text-2xl font-bold">{linkedProfiles?.profiles?.length || 0}</span>
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

      <Tabs defaultValue="import" className="space-y-4">
        <TabsList>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import Catalog
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

        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import from Another Distributor</CardTitle>
              <CardDescription>
                Transfer your releases and streaming data from your current distributor
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Select Your Current Distributor</Label>
                  <Select value={selectedDistributor} onValueChange={setSelectedDistributor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose distributor" />
                    </SelectTrigger>
                    <SelectContent>
                      {distributors?.distributors.map((dist) => (
                        <SelectItem key={dist.id} value={dist.id}>
                          {dist.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedDistributor && distributors?.distributors.find(d => d.id === selectedDistributor)?.exportUrl && (
                  <div className="space-y-2">
                    <Label>Export Your Data</Label>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => window.open(distributors?.distributors.find(d => d.id === selectedDistributor)?.exportUrl || '', '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Go to {distributors?.distributors.find(d => d.id === selectedDistributor)?.name} Dashboard
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Export your catalog as a CSV file from your distributor's dashboard
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Upload Exported CSV File</Label>
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!selectedDistributor}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {importFile ? importFile.name : 'Choose CSV File'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleValidate}
                      disabled={!importFile || !selectedDistributor || validateMutation.isPending}
                    >
                      {validateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Validate'
                      )}
                    </Button>
                  </div>
                </div>

                {validationResult && (
                  <Alert className={validationResult.valid ? 'border-green-500' : 'border-red-500'}>
                    <AlertDescription>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {validationResult.valid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="font-medium">
                            {validationResult.valid ? 'Validation Passed' : 'Validation Failed'}
                          </span>
                        </div>
                        <p className="text-sm">
                          Found {validationResult.validRows} valid releases out of {validationResult.totalRows} rows
                        </p>
                        {validationResult.preview && validationResult.preview.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm font-medium mb-1">Preview:</p>
                            <ul className="text-sm space-y-1">
                              {validationResult.preview.slice(0, 3).map((release: any, idx: number) => (
                                <li key={idx} className="text-muted-foreground">
                                  {release.artistName} - {release.title} ({release.releaseType})
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  className="w-full"
                  onClick={handleImport}
                  disabled={!validationResult?.valid || importMutation.isPending}
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Import Releases
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Streaming Platform Profiles</CardTitle>
                <CardDescription>
                  Link your existing artist profiles to sync analytics and verify your identity
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
                      Connect your existing artist profile to sync your analytics
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
                                {platform.apiSupported && (
                                  <Badge variant="outline" className="text-xs">API</Badge>
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
                      onClick={handleLinkProfile}
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
              {linkedProfiles?.profiles && linkedProfiles.profiles.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {linkedProfiles.profiles.map((profile) => (
                      <Card key={profile.platformId} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{getPlatformIcon(profile.platformId)}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{profile.artistName}</span>
                                {profile.verified && (
                                  <Badge variant="outline" className="text-green-500 border-green-500">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Verified
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {platforms?.platforms.find(p => p.id === profile.platformId)?.name}
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
                              >
                                <RefreshCw className={`h-4 w-4 ${syncProfileMutation.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(profile.profileUrl, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => unlinkProfileMutation.mutate(profile.platformId)}
                                disabled={unlinkProfileMutation.isPending}
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
                    Link your streaming platform profiles to sync your analytics
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

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transfer History</CardTitle>
              <CardDescription>
                View the status of your import and sync operations
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
                              <Upload className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <RefreshCw className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium capitalize">{job.type}</span>
                            <span className="text-muted-foreground">from</span>
                            <span className="font-medium">{job.source}</span>
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
