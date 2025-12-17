import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Trash2,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  FileText,
  Shield,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Send,
  Flag,
  Scale,
  Upload,
  Eye,
  RotateCcw,
  Ban,
  Gavel,
} from 'lucide-react';
import {
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
  AmazonIcon,
  TidalIcon,
  SoundCloudIcon,
  TikTokIcon,
} from '@/components/ui/brand-icons';

interface TakedownRequest {
  id: string;
  releaseId: string;
  releaseTitle: string;
  artistName: string;
  reason: 'artist_request' | 'copyright' | 'legal' | 'licensing' | 'duplicate' | 'quality' | 'other';
  description: string;
  platforms: string[];
  status: 'pending' | 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled';
  progress: number;
  platformStatuses: {
    platform: string;
    status: 'pending' | 'completed' | 'failed';
    completedAt?: string;
    error?: string;
  }[];
  requestedAt: string;
  completedAt?: string;
  estimatedCompletion?: string;
}

interface CopyrightClaim {
  id: string;
  releaseId: string;
  releaseTitle: string;
  trackTitle: string;
  platform: string;
  claimType: 'audio' | 'composition' | 'both';
  claimant: string;
  claimantType: 'label' | 'publisher' | 'artist' | 'distributor' | 'other';
  status: 'active' | 'disputed' | 'resolved' | 'released';
  impact: 'monetized' | 'blocked' | 'tracked' | 'none';
  claimedAt: string;
  disputeDeadline?: string;
  revenue?: {
    claimed: number;
    released: number;
  };
}

interface Dispute {
  id: string;
  claimId: string;
  releaseTitle: string;
  trackTitle: string;
  platform: string;
  reason: 'fair_use' | 'license' | 'original' | 'public_domain' | 'permission' | 'other';
  explanation: string;
  supportingDocs: string[];
  status: 'submitted' | 'under_review' | 'escalated' | 'approved' | 'rejected';
  submittedAt: string;
  lastUpdateAt: string;
  resolution?: string;
}

interface ReinstatementRequest {
  id: string;
  takedownId: string;
  releaseTitle: string;
  platforms: string[];
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';
  requestedAt: string;
  processedAt?: string;
}

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  spotify: SpotifyIcon,
  'apple-music': AppleMusicIcon,
  'youtube-music': YouTubeIcon,
  'amazon-music': AmazonIcon,
  tidal: TidalIcon,
  soundcloud: SoundCloudIcon,
  tiktok: TikTokIcon,
};

const TAKEDOWN_REASONS = [
  { value: 'artist_request', label: 'Artist Request' },
  { value: 'copyright', label: 'Copyright Issue' },
  { value: 'legal', label: 'Legal Requirement' },
  { value: 'licensing', label: 'Licensing Expired' },
  { value: 'duplicate', label: 'Duplicate Release' },
  { value: 'quality', label: 'Quality Issues' },
  { value: 'other', label: 'Other' },
];

const DISPUTE_REASONS = [
  { value: 'fair_use', label: 'Fair Use' },
  { value: 'license', label: 'Valid License' },
  { value: 'original', label: 'Original Work' },
  { value: 'public_domain', label: 'Public Domain' },
  { value: 'permission', label: 'Permission Granted' },
  { value: 'other', label: 'Other' },
];

export function TakedownManager() {
  const [activeTab, setActiveTab] = useState('takedowns');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewTakedownOpen, setIsNewTakedownOpen] = useState(false);
  const [isNewDisputeOpen, setIsNewDisputeOpen] = useState(false);
  const [isReinstatementOpen, setIsReinstatementOpen] = useState(false);
  const [selectedTakedown, setSelectedTakedown] = useState<TakedownRequest | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<CopyrightClaim | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newTakedown, setNewTakedown] = useState({
    releaseId: '',
    reason: 'artist_request',
    description: '',
    platforms: ['spotify', 'apple-music', 'youtube-music'],
  });

  const [newDispute, setNewDispute] = useState({
    claimId: '',
    reason: 'original',
    explanation: '',
    supportingDocs: [] as string[],
  });

  const { data: takedowns = [], isLoading: takedownsLoading } = useQuery<TakedownRequest[]>({
    queryKey: ['/api/distribution/takedowns'],
  });

  const { data: claims = [], isLoading: claimsLoading } = useQuery<CopyrightClaim[]>({
    queryKey: ['/api/distribution/claims'],
  });

  const { data: disputes = [], isLoading: disputesLoading } = useQuery<Dispute[]>({
    queryKey: ['/api/distribution/disputes'],
  });

  const { data: reinstatements = [], isLoading: reinstatementsLoading } = useQuery<
    ReinstatementRequest[]
  >({
    queryKey: ['/api/distribution/reinstatements'],
  });

  const submitTakedownMutation = useMutation({
    mutationFn: async (data: typeof newTakedown) => {
      const response = await apiRequest('POST', '/api/distribution/takedowns', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/takedowns'] });
      setIsNewTakedownOpen(false);
      setNewTakedown({
        releaseId: '',
        reason: 'artist_request',
        description: '',
        platforms: ['spotify', 'apple-music', 'youtube-music'],
      });
      toast({
        title: 'Takedown Requested',
        description: 'Your takedown request has been submitted',
      });
    },
    onError: () => {
      toast({
        title: 'Request Failed',
        description: 'Unable to submit takedown request',
        variant: 'destructive',
      });
    },
  });

  const submitDisputeMutation = useMutation({
    mutationFn: async (data: typeof newDispute) => {
      const response = await apiRequest('POST', '/api/distribution/disputes', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/disputes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/claims'] });
      setIsNewDisputeOpen(false);
      toast({
        title: 'Dispute Submitted',
        description: 'Your dispute has been submitted for review',
      });
    },
    onError: () => {
      toast({
        title: 'Submission Failed',
        description: 'Unable to submit dispute',
        variant: 'destructive',
      });
    },
  });

  const requestReinstatementMutation = useMutation({
    mutationFn: async ({
      takedownId,
      reason,
    }: {
      takedownId: string;
      reason: string;
    }) => {
      const response = await apiRequest('POST', '/api/distribution/reinstatements', {
        takedownId,
        reason,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/reinstatements'] });
      setIsReinstatementOpen(false);
      toast({
        title: 'Reinstatement Requested',
        description: 'Your reinstatement request has been submitted',
      });
    },
  });

  const cancelTakedownMutation = useMutation({
    mutationFn: async (takedownId: string) => {
      const response = await apiRequest(
        'POST',
        `/api/distribution/takedowns/${takedownId}/cancel`
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/takedowns'] });
      toast({
        title: 'Takedown Cancelled',
        description: 'The takedown request has been cancelled',
      });
    },
  });


  const getStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; icon: React.ElementType }> = {
      pending: { className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: Clock },
      processing: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: RefreshCw },
      completed: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
      partial: { className: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: AlertCircle },
      failed: { className: 'bg-red-500/10 text-red-500 border-red-500/20', icon: XCircle },
      cancelled: { className: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: Ban },
      active: { className: 'bg-red-500/10 text-red-500 border-red-500/20', icon: AlertTriangle },
      disputed: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Scale },
      resolved: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
      released: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
      submitted: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Send },
      under_review: { className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: Eye },
      escalated: { className: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: AlertTriangle },
      approved: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
      rejected: { className: 'bg-red-500/10 text-red-500 border-red-500/20', icon: XCircle },
    };
    const config = styles[status] || styles.pending;
    const Icon = config.icon;
    return (
      <Badge className={`gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getPlatformIcon = (platform: string) => {
    const Icon = PLATFORM_ICONS[platform];
    return Icon ? <Icon className="h-4 w-4" /> : null;
  };

  const getImpactBadge = (impact: string) => {
    const styles: Record<string, string> = {
      monetized: 'bg-red-500/10 text-red-500 border-red-500/20',
      blocked: 'bg-red-700/10 text-red-700 border-red-700/20',
      tracked: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      none: 'bg-green-500/10 text-green-500 border-green-500/20',
    };
    return <Badge className={styles[impact] || styles.none}>{impact}</Badge>;
  };

  const pendingTakedowns = takedowns.filter(
    (t) => t.status === 'pending' || t.status === 'processing'
  ).length;
  const activeClaims = claims.filter((c) => c.status === 'active').length;
  const pendingDisputes = disputes.filter((d) => d.status !== 'approved' && d.status !== 'rejected').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Takedown & Rights Manager
            </CardTitle>
            <CardDescription>
              Manage content takedowns, copyright claims, and reinstatements
            </CardDescription>
          </div>
          <Button onClick={() => setIsNewTakedownOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Takedown Request
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-500">{pendingTakedowns}</div>
              <p className="text-xs text-muted-foreground">Pending Takedowns</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{activeClaims}</div>
              <p className="text-xs text-muted-foreground">Active Claims</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{pendingDisputes}</div>
              <p className="text-xs text-muted-foreground">Open Disputes</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">
                {takedowns.filter((t) => t.status === 'completed').length}
              </div>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search releases, claims, or disputes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="takedowns" className="gap-2">
              <Trash2 className="h-4 w-4" />
              Takedowns
            </TabsTrigger>
            <TabsTrigger value="claims" className="gap-2">
              <Flag className="h-4 w-4" />
              Claims
            </TabsTrigger>
            <TabsTrigger value="disputes" className="gap-2">
              <Scale className="h-4 w-4" />
              Disputes
            </TabsTrigger>
            <TabsTrigger value="reinstatements" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reinstatements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="takedowns" className="space-y-4">
            {takedowns.map((takedown) => (
              <Card key={takedown.id} className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{takedown.releaseTitle}</h3>
                      <p className="text-sm text-muted-foreground">
                        {takedown.artistName} •{' '}
                        {TAKEDOWN_REASONS.find((r) => r.value === takedown.reason)?.label}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(takedown.status)}
                      {takedown.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelTakedownMutation.mutate(takedown.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {takedown.status === 'processing' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{takedown.progress}%</span>
                      </div>
                      <Progress value={takedown.progress} className="h-2" />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {takedown.platformStatuses.map((ps) => (
                      <div
                        key={ps.platform}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                          ps.status === 'completed'
                            ? 'bg-green-500/10 text-green-500'
                            : ps.status === 'failed'
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {getPlatformIcon(ps.platform)}
                        <span className="capitalize">{ps.platform.replace('-', ' ')}</span>
                        {ps.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                        {ps.status === 'failed' && <XCircle className="h-3 w-3" />}
                        {ps.status === 'pending' && <Clock className="h-3 w-3" />}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Requested: {new Date(takedown.requestedAt).toLocaleString()}</span>
                    {takedown.completedAt ? (
                      <span>Completed: {new Date(takedown.completedAt).toLocaleString()}</span>
                    ) : takedown.estimatedCompletion ? (
                      <span>Est. completion: {new Date(takedown.estimatedCompletion).toLocaleDateString()}</span>
                    ) : null}
                  </div>

                  {takedown.status === 'completed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedTakedown(takedown);
                        setIsReinstatementOpen(true);
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Request Reinstatement
                    </Button>
                  )}
                </div>
              </Card>
            ))}

            {takedowns.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No takedown requests</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="claims" className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Release / Track</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Claimant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{claim.trackTitle}</p>
                        <p className="text-sm text-muted-foreground">{claim.releaseTitle}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getPlatformIcon(claim.platform)}
                        <span className="capitalize">{claim.platform.replace('-', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{claim.claimant}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {claim.claimantType}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {claim.claimType}
                      </Badge>
                    </TableCell>
                    <TableCell>{getImpactBadge(claim.impact)}</TableCell>
                    <TableCell>{getStatusBadge(claim.status)}</TableCell>
                    <TableCell>
                      {claim.disputeDeadline ? (
                        <span className="text-sm">
                          {new Date(claim.disputeDeadline).toLocaleDateString()}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {claim.status === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedClaim(claim);
                            setNewDispute({ ...newDispute, claimId: claim.id });
                            setIsNewDisputeOpen(true);
                          }}
                        >
                          <Scale className="h-4 w-4 mr-2" />
                          Dispute
                        </Button>
                      )}
                      {claim.status === 'disputed' && (
                        <Badge variant="outline">Under Review</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {claims.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Flag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No copyright claims</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="disputes" className="space-y-4">
            {disputes.map((dispute) => (
              <Card key={dispute.id} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{dispute.trackTitle}</h3>
                      <p className="text-sm text-muted-foreground">
                        {dispute.releaseTitle} • {dispute.platform}
                      </p>
                    </div>
                    {getStatusBadge(dispute.status)}
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">
                      Reason: {DISPUTE_REASONS.find((r) => r.value === dispute.reason)?.label}
                    </p>
                    <p className="text-sm text-muted-foreground">{dispute.explanation}</p>
                  </div>

                  {dispute.supportingDocs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {dispute.supportingDocs.map((doc, i) => (
                        <Badge key={i} variant="outline" className="gap-1">
                          <FileText className="h-3 w-3" />
                          {doc}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {dispute.resolution && (
                    <Alert>
                      <Gavel className="h-4 w-4" />
                      <AlertDescription>{dispute.resolution}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Submitted: {new Date(dispute.submittedAt).toLocaleString()}</span>
                    <span>Last update: {new Date(dispute.lastUpdateAt).toLocaleString()}</span>
                  </div>
                </div>
              </Card>
            ))}

            {disputes.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Scale className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No active disputes</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="reinstatements" className="space-y-4">
            {reinstatements.map((reinstatement) => (
              <Card key={reinstatement.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{reinstatement.releaseTitle}</h3>
                    <p className="text-sm text-muted-foreground">{reinstatement.reason}</p>
                    <div className="flex gap-2 mt-2">
                      {reinstatement.platforms.map((p) => (
                        <Badge key={p} variant="outline" className="gap-1">
                          {getPlatformIcon(p)}
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(reinstatement.status)}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(reinstatement.requestedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Card>
            ))}

            {reinstatements.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <RotateCcw className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No reinstatement requests</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={isNewTakedownOpen} onOpenChange={setIsNewTakedownOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Request Content Takedown</DialogTitle>
              <DialogDescription>
                Remove your content from streaming platforms. This action may take 2-14 days.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select Release</Label>
                <Select
                  value={newTakedown.releaseId}
                  onValueChange={(v) => setNewTakedown({ ...newTakedown, releaseId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a release" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rel-1">Midnight Dreams - John Doe</SelectItem>
                    <SelectItem value="rel-2">Summer Vibes - John Doe</SelectItem>
                    <SelectItem value="rel-3">Urban Stories - Jane Smith</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reason for Takedown</Label>
                <Select
                  value={newTakedown.reason}
                  onValueChange={(v) => setNewTakedown({ ...newTakedown, reason: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAKEDOWN_REASONS.map((reason) => (
                      <SelectItem key={reason.value} value={reason.value}>
                        {reason.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Provide additional details..."
                  value={newTakedown.description}
                  onChange={(e) =>
                    setNewTakedown({ ...newTakedown, description: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Platforms</Label>
                <div className="flex flex-wrap gap-2">
                  {['spotify', 'apple-music', 'youtube-music', 'amazon-music', 'tidal'].map(
                    (platform) => (
                      <div
                        key={platform}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border ${
                          newTakedown.platforms.includes(platform)
                            ? 'border-primary bg-primary/10'
                            : 'border-muted hover:border-primary/50'
                        }`}
                        onClick={() => {
                          if (newTakedown.platforms.includes(platform)) {
                            setNewTakedown({
                              ...newTakedown,
                              platforms: newTakedown.platforms.filter((p) => p !== platform),
                            });
                          } else {
                            setNewTakedown({
                              ...newTakedown,
                              platforms: [...newTakedown.platforms, platform],
                            });
                          }
                        }}
                      >
                        {getPlatformIcon(platform)}
                        <span className="text-sm capitalize">{platform.replace('-', ' ')}</span>
                      </div>
                    )
                  )}
                </div>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Takedowns typically take 2-14 days to complete across all platforms.
                  Some platforms may require additional verification.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewTakedownOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => submitTakedownMutation.mutate(newTakedown)}
                disabled={!newTakedown.releaseId || submitTakedownMutation.isPending}
              >
                {submitTakedownMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Submit Takedown Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isNewDisputeOpen} onOpenChange={setIsNewDisputeOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Dispute Copyright Claim</DialogTitle>
              <DialogDescription>
                {selectedClaim
                  ? `Dispute claim on "${selectedClaim.trackTitle}" by ${selectedClaim.claimant}`
                  : 'Submit a dispute for a copyright claim'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Dispute Reason</Label>
                <Select
                  value={newDispute.reason}
                  onValueChange={(v) => setNewDispute({ ...newDispute, reason: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPUTE_REASONS.map((reason) => (
                      <SelectItem key={reason.value} value={reason.value}>
                        {reason.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Explanation</Label>
                <Textarea
                  placeholder="Explain why you believe this claim is incorrect..."
                  value={newDispute.explanation}
                  onChange={(e) =>
                    setNewDispute({ ...newDispute, explanation: e.target.value })
                  }
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Supporting Documents</Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Upload licenses, contracts, or other proof
                  </p>
                  <Button variant="outline" size="sm" className="mt-2">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Files
                  </Button>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  False disputes may result in account penalties. Only submit if you
                  have legitimate rights to the content.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewDisputeOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => submitDisputeMutation.mutate(newDispute)}
                disabled={!newDispute.explanation || submitDisputeMutation.isPending}
              >
                {submitDisputeMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Dispute
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isReinstatementOpen} onOpenChange={setIsReinstatementOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Reinstatement</DialogTitle>
              <DialogDescription>
                {selectedTakedown
                  ? `Request to restore "${selectedTakedown.releaseTitle}"`
                  : 'Request to restore removed content'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Reason for Reinstatement</Label>
                <Textarea
                  placeholder="Explain why you want to restore this content..."
                  rows={4}
                />
              </div>

              {selectedTakedown && (
                <div className="space-y-2">
                  <Label>Platforms to Restore</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTakedown.platforms.map((platform) => (
                      <Badge key={platform} variant="outline" className="gap-1">
                        {getPlatformIcon(platform)}
                        {platform}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Reinstatement typically takes 2-7 days. You may need to provide
                  additional documentation.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReinstatementOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  requestReinstatementMutation.mutate({
                    takedownId: selectedTakedown?.id || '',
                    reason: 'Reinstatement request',
                  })
                }
                disabled={requestReinstatementMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Request Reinstatement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
