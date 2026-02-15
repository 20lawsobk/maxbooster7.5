import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tantml:parameter>@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Loader2,
  ExternalLink,
  ChevronRight,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import {
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
  AmazonIcon,
  TidalIcon,
  DeezerIcon,
  SoundCloudIcon,
} from '@/components/ui/brand-icons';

interface PlatformStatus {
  platform: string;
  platformName: string;
  status: 'pending' | 'processing' | 'delivered' | 'live' | 'failed' | 'removed';
  externalId?: string;
  estimatedGoLive?: string;
  deliveredAt?: string;
  liveAt?: string;
  errorMessage?: string;
  errorResolution?: string;
  lastChecked?: string;
}

interface ReleaseStatusDashboardProps {
  releaseId: string;
  releaseTitle?: string;
}

const PLATFORM_CONFIG: Record<
  string,
  {
    icon: any;
    color: string;
    processingTime: string;
  }
> = {
  spotify: { icon: SpotifyIcon, color: '#1DB954', processingTime: '2-3 days' },
  'apple-music': { icon: AppleMusicIcon, color: '#FA243C', processingTime: '3-5 days' },
  'youtube-music': { icon: YouTubeIcon, color: '#FF0000', processingTime: '2-4 days' },
  'amazon-music': { icon: AmazonIcon, color: '#FF9900', processingTime: '3-5 days' },
  tidal: { icon: TidalIcon, color: '#000000', processingTime: '3-5 days' },
  deezer: { icon: DeezerIcon, color: '#FEAA2D', processingTime: '2-4 days' },
  soundcloud: { icon: SoundCloudIcon, color: '#FF3300', processingTime: '1-2 days' },
};

const STATUS_CONFIG = {
  pending: {
    label: 'Awaiting Submission',
    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    icon: Clock,
    description: 'Release will be submitted soon',
  },
  processing: {
    label: 'Being Delivered',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    icon: Loader2,
    description: 'Currently being delivered to platform',
  },
  delivered: {
    label: 'Awaiting Approval',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    icon: Clock,
    description: 'Received by platform, pending approval',
  },
  live: {
    label: 'Live',
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
    icon: CheckCircle2,
    description: 'Successfully live on platform',
  },
  failed: {
    label: 'Delivery Failed',
    color: 'bg-red-500/10 text-red-500 border-red-500/20',
    icon: XCircle,
    description: 'Delivery encountered an error',
  },
  removed: {
    label: 'Taken Down',
    color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    icon: XCircle,
    description: 'Removed from platform',
  },
};

/**
 * TODO: Add function documentation
 */
export function ReleaseStatusDashboard({ releaseId, releaseTitle }: ReleaseStatusDashboardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformStatus | null>(null);

  // Fetch release status
  const {
    data: statusData,
    isLoading,
    refetch,
  } = useQuery<{ statuses: PlatformStatus[]; overallProgress: number }>({
    queryKey: [`/api/distribution/releases/${releaseId}/status`],
  });

  // Refresh status mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        'POST',
        `/api/distribution/releases/${releaseId}/check-status`
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Status updated',
        description: 'Latest delivery status has been fetched.',
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/distribution/releases/${releaseId}/status`],
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to refresh status. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const statuses = statusData?.statuses || [];
  const overallProgress = statusData?.overallProgress || 0;

  const liveCount = statuses.filter((s) => s.status === 'live').length;
  const totalCount = statuses.length;
  const failedCount = statuses.filter((s) => s.status === 'failed').length;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Release Delivery Status
              </CardTitle>
              {releaseTitle && <CardDescription className="mt-1">{releaseTitle}</CardDescription>}
            </div>
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`}
              />
              Refresh Status
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">
                {liveCount} / {totalCount} platforms live
              </span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <p className="text-2xl font-bold text-green-500">{liveCount}</p>
              <p className="text-xs text-muted-foreground">Live</p>
            </div>
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <p className="text-2xl font-bold text-blue-500">
                {
                  statuses.filter((s) => ['pending', 'processing', 'delivered'].includes(s.status))
                    .length
                }
              </p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
            <div className="text-center p-3 bg-red-500/10 rounded-lg">
              <p className="text-2xl font-bold text-red-500">{failedCount}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platform Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statuses.map((platformStatus) => {
          const config = PLATFORM_CONFIG[platformStatus.platform];
          const statusConfig = STATUS_CONFIG[platformStatus.status];
          const Icon = config?.icon;
          const StatusIcon = statusConfig?.icon;

          return (
            <Card
              key={platformStatus.platform}
              className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
              onClick={() => setSelectedPlatform(platformStatus)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {Icon && (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: config.color }}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-semibold">{platformStatus.platformName}</h4>
                      <p className="text-xs text-muted-foreground">
                        {config?.processingTime || 'Processing time varies'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Status Badge */}
                <Badge
                  className={`${statusConfig.color} border flex items-center gap-2 w-full justify-center py-2`}
                >
                  {StatusIcon && (
                    <StatusIcon
                      className={`h-3 w-3 ${platformStatus.status === 'processing' ? 'animate-spin' : ''}`}
                    />
                  )}
                  {statusConfig.label}
                </Badge>

                {/* Additional Info */}
                {platformStatus.status === 'live' && platformStatus.liveAt && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Went live {new Date(platformStatus.liveAt).toLocaleDateString()}</span>
                  </div>
                )}

                {platformStatus.status === 'delivered' && platformStatus.estimatedGoLive && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      Est. go-live: {new Date(platformStatus.estimatedGoLive).toLocaleDateString()}
                    </span>
                  </div>
                )}

                {platformStatus.status === 'failed' && (
                  <div className="p-2 bg-red-500/10 rounded text-xs text-red-500">
                    <AlertCircle className="h-3 w-3 inline mr-1" />
                    {platformStatus.errorMessage || 'Delivery failed'}
                  </div>
                )}

                {platformStatus.externalId && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3" />
                    <span className="font-mono truncate">{platformStatus.externalId}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Timeline View */}
      {statuses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery Timeline</CardTitle>
            <CardDescription>Track the progress of your release across platforms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statuses.map((platformStatus, index) => {
                const config = PLATFORM_CONFIG[platformStatus.platform];
                const statusConfig = STATUS_CONFIG[platformStatus.status];
                const Icon = config?.icon;
                const StatusIcon = statusConfig?.icon;

                return (
                  <div key={platformStatus.platform} className="flex gap-4">
                    {/* Timeline Line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          platformStatus.status === 'live'
                            ? 'bg-green-500'
                            : platformStatus.status === 'failed'
                              ? 'bg-red-500'
                              : platformStatus.status === 'processing'
                                ? 'bg-blue-500'
                                : 'bg-muted'
                        }`}
                      >
                        {StatusIcon && (
                          <StatusIcon
                            className={`h-5 w-5 text-white ${platformStatus.status === 'processing' ? 'animate-spin' : ''}`}
                          />
                        )}
                      </div>
                      {index < statuses.length - 1 && <div className="w-0.5 h-16 bg-muted" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-8">
                      <div className="flex items-center gap-2 mb-1">
                        {Icon && <Icon className="h-4 w-4" style={{ color: config.color }} />}
                        <h4 className="font-medium">{platformStatus.platformName}</h4>
                        <Badge variant="outline" className="text-xs">
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{statusConfig.description}</p>

                      {platformStatus.status === 'failed' && platformStatus.errorResolution && (
                        <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                          <p className="text-sm font-medium text-blue-500 mb-1">
                            Resolution Steps:
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {platformStatus.errorResolution}
                          </p>
                        </div>
                      )}

                      {platformStatus.lastChecked && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Last checked: {new Date(platformStatus.lastChecked).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {statuses.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No distribution status yet</h3>
            <p className="text-sm text-muted-foreground">
              Your release will appear here once it's submitted for distribution.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
