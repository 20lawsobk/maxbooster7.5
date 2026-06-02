import { useState, type ComponentType } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  Link as LinkIcon,
  Unlink,
  AlertCircle,
  Users,
  RefreshCw,
} from "lucide-react";
import {
  TwitterIcon,
  LinkedInIcon,
  YouTubeIcon,
  TikTokIcon,
  ThreadsIcon,
  GoogleIcon,
  MetaIcon,
  SpotifyIcon,
} from "@/components/ui/brand-icons";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { apiRequest } from "@/lib/queryClient";

interface SocialConnection {
  platform: string;
  username?: string;
  followers?: number;
  profileUrl?: string;
  metadata?: Record<string, unknown>;
}

type PlatformIcon = ComponentType<{ className?: string }>;

interface Platform {
  id: string;
  name: string;
  icon: PlatformIcon;
  color: string;
  connected: boolean;
  username?: string;
  oauth: boolean;
  followers?: number;
  profileUrl?: string;
  metadata?: Record<string, unknown>;
}

function formatCompactNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function PlatformConnections() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { trackSocialAccountConnected } = useOnboardingProgress();

  const { data: connections = [], isLoading } = useQuery<SocialConnection[]>({
    queryKey: ["/api/social/connections"],
    retry: false,
  });

  const connectPlatformMutation = useMutation({
    mutationFn: async (platform: string) => {
      const response = await apiRequest(
        "POST",
        `/api/social/connect/${platform}`,
      );
      return response.json();
    },
    onSuccess: (data, platform) => {
      if (data.authUrl) {
        const isInIframe = window !== window.top;
        if (isInIframe) {
          try {
            window.top!.location.href = data.authUrl;
          } catch {
            window.location.href = data.authUrl;
          }
        } else {
          window.location.href = data.authUrl;
        }
      } else {
        queryClient.invalidateQueries({
          queryKey: ["/api/social/connections"],
        });
        toast({
          title: "Platform Connected",
          description: `Successfully connected to ${platform}`,
        });
        trackSocialAccountConnected();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: (error as Error).message || "Failed to connect platform",
        variant: "destructive",
      });
    },
  });

  const disconnectPlatformMutation = useMutation({
    mutationFn: async (platform: string) => {
      const response = await apiRequest(
        "POST",
        `/api/social/disconnect/${platform}`,
      );
      return response.json();
    },
    onSuccess: (_, platform) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/connections"] });
      toast({
        title: "Platform Disconnected",
        description: `Successfully disconnected from ${platform}`,
      });
    },
    onError: () => {
      toast({
        title: "Disconnection Failed",
        description: "Failed to disconnect platform",
        variant: "destructive",
      });
    },
  });

  const syncPlatformMutation = useMutation({
    mutationFn: async (platform: string) => {
      const response = await apiRequest("POST", `/api/social/sync/${platform}`);
      return response.json();
    },
    onSuccess: (_, platform) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/connections"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/social/platform-status"],
      });
      toast({
        title: "Stats Synced",
        description: `Successfully synced ${platform} stats`,
      });
    },
    onError: () => {
      toast({
        title: "Sync Failed",
        description: "Failed to sync platform stats",
        variant: "destructive",
      });
    },
  });

  const metaConnected = connections.some(
    (c) => c.platform === "facebook" || c.platform === "instagram",
  );
  const metaUsername =
    connections.find((c) => c.platform === "facebook")?.username ||
    connections.find((c) => c.platform === "instagram")?.username;
  const metaFollowers =
    (connections.find((c) => c.platform === "facebook")?.followers || 0) +
    (connections.find((c) => c.platform === "instagram")?.followers || 0);
  const metaMetadata = {
    ...(connections.find((c) => c.platform === "facebook")?.metadata || {}),
    ...(connections.find((c) => c.platform === "instagram")?.metadata || {}),
  };
  const metaProfileUrl =
    connections.find((c) => c.platform === "instagram")?.profileUrl ||
    connections.find((c) => c.platform === "facebook")?.profileUrl ||
    "";

  const platforms: Platform[] = [
    {
      id: "meta",
      name: "Meta (Facebook + Instagram)",
      icon: MetaIcon,
      color: "text-blue-600",
      connected: metaConnected,
      username: metaUsername,
      oauth: true,
      followers: metaFollowers,
      profileUrl: metaProfileUrl,
      metadata: metaMetadata,
    },
    {
      id: "twitter",
      name: "Twitter/X",
      icon: TwitterIcon,
      color: "text-black dark:text-white",
      connected: connections.some((c) => c.platform === "twitter"),
      username: connections.find((c) => c.platform === "twitter")?.username,
      oauth: true,
      followers:
        connections.find((c) => c.platform === "twitter")?.followers || 0,
      profileUrl:
        connections.find((c) => c.platform === "twitter")?.profileUrl || "",
      metadata:
        connections.find((c) => c.platform === "twitter")?.metadata || {},
    },
    {
      id: "threads",
      name: "Threads",
      icon: ThreadsIcon,
      color: "text-black dark:text-white",
      connected: connections.some((c) => c.platform === "threads"),
      username: connections.find((c) => c.platform === "threads")?.username,
      oauth: true,
      followers:
        connections.find((c) => c.platform === "threads")?.followers || 0,
      profileUrl:
        connections.find((c) => c.platform === "threads")?.profileUrl || "",
      metadata:
        connections.find((c) => c.platform === "threads")?.metadata || {},
    },
    {
      id: "tiktok",
      name: "TikTok",
      icon: TikTokIcon,
      color: "text-black dark:text-white",
      connected: connections.some((c) => c.platform === "tiktok"),
      username: connections.find((c) => c.platform === "tiktok")?.username,
      oauth: true,
      followers:
        connections.find((c) => c.platform === "tiktok")?.followers || 0,
      profileUrl:
        connections.find((c) => c.platform === "tiktok")?.profileUrl || "",
      metadata:
        connections.find((c) => c.platform === "tiktok")?.metadata || {},
    },
    {
      id: "youtube",
      name: "YouTube",
      icon: YouTubeIcon,
      color: "text-red-600",
      connected: connections.some((c) => c.platform === "youtube"),
      username: connections.find((c) => c.platform === "youtube")?.username,
      oauth: true,
      followers:
        connections.find((c) => c.platform === "youtube")?.followers || 0,
      profileUrl:
        connections.find((c) => c.platform === "youtube")?.profileUrl || "",
      metadata:
        connections.find((c) => c.platform === "youtube")?.metadata || {},
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      icon: LinkedInIcon,
      color: "text-blue-600",
      connected: connections.some((c) => c.platform === "linkedin"),
      username: connections.find((c) => c.platform === "linkedin")?.username,
      oauth: true,
      followers:
        connections.find((c) => c.platform === "linkedin")?.followers || 0,
      profileUrl:
        connections.find((c) => c.platform === "linkedin")?.profileUrl || "",
      metadata:
        connections.find((c) => c.platform === "linkedin")?.metadata || {},
    },
    {
      id: "googlebusiness",
      name: "Google Business",
      icon: GoogleIcon,
      color: "text-blue-500",
      connected: connections.some((c) => c.platform === "googlebusiness"),
      username: connections.find((c) => c.platform === "googlebusiness")
        ?.username,
      oauth: true,
      followers:
        connections.find((c) => c.platform === "googlebusiness")?.followers ||
        0,
      profileUrl:
        connections.find((c) => c.platform === "googlebusiness")?.profileUrl ||
        "",
      metadata:
        connections.find((c) => c.platform === "googlebusiness")?.metadata ||
        {},
    },
    {
      id: "spotify",
      name: "Spotify",
      icon: SpotifyIcon,
      color: "text-green-500",
      connected: connections.some((c) => c.platform === "spotify"),
      username: connections.find((c) => c.platform === "spotify")?.username,
      oauth: true,
      followers:
        connections.find((c) => c.platform === "spotify")?.followers || 0,
      profileUrl:
        connections.find((c) => c.platform === "spotify")?.profileUrl || "",
      metadata:
        connections.find((c) => c.platform === "spotify")?.metadata || {},
    },
  ];

  const connectedCount = platforms.filter((p) => p.connected).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Social Media Platforms</CardTitle>
          <CardDescription>
            Connect your social media accounts to enable autopilot posting and
            analytics
          </CardDescription>
          <div className="flex items-center gap-2 pt-2">
            <Badge variant={connectedCount > 0 ? "default" : "secondary"}>
              {connectedCount} of {platforms.length} Connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {platforms.map((platform) => {
              const IconComponent = platform.icon;
              return (
                <Card
                  key={platform.id}
                  className={platform.connected ? "border-green-500/50" : ""}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg bg-muted ${platform.color}`}
                        >
                          <IconComponent className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{platform.name}</p>
                          </div>
                          {platform.connected && platform.username ? (
                            <p className="text-xs text-muted-foreground">
                              @{platform.username}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {platform.oauth
                                ? "OAuth Connection"
                                : "Not connected"}
                            </p>
                          )}
                          {platform.connected && (
                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                              {(platform.followers || 0) > 0 && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {formatCompactNumber(
                                    platform.followers || 0,
                                  )}{" "}
                                  followers
                                </span>
                              )}
                              {platform.metadata?.videoCount && (
                                <span>
                                  {formatCompactNumber(
                                    platform.metadata.videoCount,
                                  )}{" "}
                                  videos
                                </span>
                              )}
                              {platform.metadata?.tweetCount && (
                                <span>
                                  {formatCompactNumber(
                                    platform.metadata.tweetCount,
                                  )}{" "}
                                  posts
                                </span>
                              )}
                              {platform.metadata?.mediaCount && (
                                <span>
                                  {formatCompactNumber(
                                    platform.metadata.mediaCount,
                                  )}{" "}
                                  posts
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {platform.connected ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                syncPlatformMutation.mutate(platform.id)
                              }
                              disabled={syncPlatformMutation.isPending}
                              title="Sync stats"
                            >
                              <RefreshCw
                                className={`h-4 w-4 ${syncPlatformMutation.isPending ? "animate-spin" : ""}`}
                              />
                            </Button>
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                disconnectPlatformMutation.mutate(platform.id)
                              }
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
                            onClick={() =>
                              connectPlatformMutation.mutate(platform.id)
                            }
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
                    <h4 className="font-semibold mb-2">
                      Connect Your Platforms
                    </h4>
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
