import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Link as LinkIcon, Unlink, AlertCircle } from 'lucide-react';
import { TwitterIcon, InstagramIcon, LinkedInIcon, FacebookIcon, YouTubeIcon, TikTokIcon, ThreadsIcon, GoogleIcon } from '@/components/ui/brand-icons';

interface Platform {
  id: string;
  name: string;
  icon: any;
  color: string;
  connected: boolean;
  username?: string;
  oauth: boolean;
}

/**
 * TODO: Add function documentation
 */
export function PlatformConnections() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['/api/social/connections'],
    retry: false,
  });

  const connectPlatformMutation = useMutation({
    mutationFn: async (platform: string) => {
      const response = await fetch(`/api/social/connect/${platform}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to connect platform');
      }

      return response.json();
    },
    onSuccess: (data, platform) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/social/connections'] });
        toast({
          title: 'Platform Connected',
          description: `Successfully connected to ${platform}`,
        });
      }
    },
    onError: (error: unknown) => {
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect platform',
        variant: 'destructive',
      });
    },
  });

  const disconnectPlatformMutation = useMutation({
    mutationFn: async (platform: string) => {
      const response = await fetch(`/api/social/disconnect/${platform}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect platform');
      }

      return response.json();
    },
    onSuccess: (_, platform) => {
      queryClient.invalidateQueries({ queryKey: ['/api/social/connections'] });
      toast({
        title: 'Platform Disconnected',
        description: `Successfully disconnected from ${platform}`,
      });
    },
    onError: () => {
      toast({
        title: 'Disconnection Failed',
        description: 'Failed to disconnect platform',
        variant: 'destructive',
      });
    },
  });

  const platforms: Platform[] = [
    {
      id: 'twitter',
      name: 'Twitter/X',
      icon: TwitterIcon,
      color: 'text-black dark:text-white',
      connected: connections.some((c: unknown) => c.platform === 'twitter'),
      username: connections.find((c: unknown) => c.platform === 'twitter')?.username,
      oauth: true,
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: FacebookIcon,
      color: 'text-blue-500',
      connected: connections.some((c: unknown) => c.platform === 'facebook'),
      username: connections.find((c: unknown) => c.platform === 'facebook')?.username,
      oauth: true,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: InstagramIcon,
      color: 'text-pink-500',
      connected: connections.some((c: unknown) => c.platform === 'instagram'),
      username: connections.find((c: unknown) => c.platform === 'instagram')?.username,
      oauth: true,
    },
    {
      id: 'threads',
      name: 'Threads',
      icon: ThreadsIcon,
      color: 'text-black dark:text-white',
      connected: connections.some((c: unknown) => c.platform === 'threads'),
      username: connections.find((c: unknown) => c.platform === 'threads')?.username,
      oauth: true,
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      icon: TikTokIcon,
      color: 'text-black dark:text-white',
      connected: connections.some((c: unknown) => c.platform === 'tiktok'),
      username: connections.find((c: unknown) => c.platform === 'tiktok')?.username,
      oauth: true,
    },
    {
      id: 'youtube',
      name: 'YouTube',
      icon: YouTubeIcon,
      color: 'text-red-600',
      connected: connections.some((c: unknown) => c.platform === 'youtube'),
      username: connections.find((c: unknown) => c.platform === 'youtube')?.username,
      oauth: true,
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      icon: LinkedInIcon,
      color: 'text-blue-600',
      connected: connections.some((c: unknown) => c.platform === 'linkedin'),
      username: connections.find((c: unknown) => c.platform === 'linkedin')?.username,
      oauth: true,
    },
    {
      id: 'googlebusiness',
      name: 'Google Business',
      icon: GoogleIcon,
      color: 'text-blue-500',
      connected: connections.some((c: unknown) => c.platform === 'googlebusiness'),
      username: connections.find((c: unknown) => c.platform === 'googlebusiness')?.username,
      oauth: true,
    },
  ];

  const connectedCount = platforms.filter((p) => p.connected).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Social Media Platforms</CardTitle>
          <CardDescription>
            Connect your social media accounts to enable autopilot posting and analytics
          </CardDescription>
          <div className="flex items-center gap-2 pt-2">
            <Badge variant={connectedCount > 0 ? 'default' : 'secondary'}>
              {connectedCount} of {platforms.length} Connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {platforms.map((platform) => {
              const IconComponent = platform.icon;
              return (
                <Card key={platform.id} className={platform.connected ? 'border-green-500/50' : ''}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-muted ${platform.color}`}>
                          <IconComponent className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-medium">{platform.name}</p>
                          {platform.connected && platform.username ? (
                            <p className="text-xs text-muted-foreground">@{platform.username}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {platform.oauth ? 'OAuth Connection' : 'Not connected'}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {platform.connected ? (
                          <>
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => disconnectPlatformMutation.mutate(platform.id)}
                              disabled={disconnectPlatformMutation.isPending}
                            >
                              <Unlink className="h-4 w-4 mr-1" />
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => connectPlatformMutation.mutate(platform.id)}
                            disabled={connectPlatformMutation.isPending}
                          >
                            <LinkIcon className="h-4 w-4 mr-1" />
                            Connect
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {connectedCount === 0 && (
            <Card className="mt-6 border-blue-500/20 bg-blue-50/50 dark:bg-blue-950/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-6 w-6 text-blue-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold mb-2">Connect Your Platforms</h4>
                    <p className="text-sm text-muted-foreground">
                      Connect at least one social media platform to enable:
                    </p>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                      <li>• Automated content posting with Social Autopilot</li>
                      <li>• Real-time analytics and performance tracking</li>
                      <li>• Cross-platform content optimization</li>
                      <li>• 24/7 autonomous social media management</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
