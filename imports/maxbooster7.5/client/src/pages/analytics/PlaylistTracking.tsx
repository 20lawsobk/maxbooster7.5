// @ts-nocheck
import { useState, useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListMusic, Plus, Minus, Users, Play, Star, Clock, CheckCircle, XCircle, Music, Sparkles, RefreshCw } from "lucide-react";
import { DateRangePicker } from "@/components/analytics/DateRangePicker";
import { PlaylistEmptyState } from "@/components/analytics/AnalyticsEmptyStates";
import { PlaylistTrackingSkeleton } from "@/components/analytics/AnalyticsLoadingSkeletons";
import { cn } from "@/lib/utils";

interface PlaylistPlacement {
  id: string;
  playlistName: string;
  platform: string;
  type?: "editorial" | "algorithmic" | "user" | "artist";
  followers: number;
  trackName?: string;
  position?: number;
  addedDate: string;
  status: "active" | "removed";
  estimatedStreams: number;
  curatorName?: string;
}

interface PlaylistMetrics {
  totalPlaylists: number;
  totalReach: number;
  monthlyStreamsFromPlaylists: number;
  newAdditions: number;
  removals: number;
  avgPosition: number;
}

interface CuratorInsight {
  curatorName: string;
  playlistCount: number;
  totalFollowers: number;
  responseRate: number;
  avgTimeToAdd: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  spotify: "#1DB954",
  apple: "#FA2D48",
  deezer: "#00C7F2",
  amazon: "#FF9900",
  youtube: "#FF0000",
};

const PLATFORM_ICONS: Record<string, string> = {
  spotify: "🎵",
  apple: "🍎",
  deezer: "🎧",
  amazon: "📦",
  youtube: "📺",
};

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  editorial: {
    label: "Editorial",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  },
  algorithmic: {
    label: "Algo",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  user: {
    label: "User",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  artist: {
    label: "Artist",
    color:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  },
};

const PlaylistCard = memo(({ playlist }: { playlist: PlaylistPlacement }) => {
  const platformColor = PLATFORM_COLORS[playlist.platform] || "#6B7280";
  const typeInfo = playlist.type ? TYPE_BADGES[playlist.type] : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className={cn(
        "p-4 rounded-lg border transition-all",
        playlist.status === "active"
          ? "bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
          : "bg-slate-50 dark:bg-slate-900/50 border-slate-200/50 opacity-75",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
          style={{ backgroundColor: `${platformColor}15` }}
        >
          {PLATFORM_ICONS[playlist.platform] || "🎵"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold truncate">{playlist.playlistName}</h4>
            {typeInfo && (
              <Badge className={cn("text-xs", typeInfo.color)}>
                {typeInfo.label}
              </Badge>
            )}
            {playlist.status === "active" ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
          </div>

          {(playlist.trackName || playlist.curatorName) && (
            <p className="text-sm text-muted-foreground mb-2">
              {playlist.trackName && (
                <>
                  <Music className="inline h-3 w-3 mr-1" />
                  {playlist.trackName}
                </>
              )}
              {playlist.curatorName && (
                <span className={playlist.trackName ? "ml-2" : ""}>
                  {playlist.trackName && "• "}Curated by {playlist.curatorName}
                </span>
              )}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {playlist.followers.toLocaleString()} followers
            </span>
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" />~
              {playlist.estimatedStreams.toLocaleString()} streams
            </span>
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              {playlist.position ? `Position #${playlist.position}` : "Position unavailable"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Added {playlist.addedDate}
            </span>
          </div>
        </div>

      </div>
    </motion.div>
  );
});
PlaylistCard.displayName = "PlaylistCard";

interface PlaylistTrackingProps {
  userId?: string;
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
}

export function PlaylistTracking({
  _userId,
  timeRange = "30d",
  onTimeRangeChange,
}: PlaylistTrackingProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [localTimeRange, setLocalTimeRange] = useState(timeRange);
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "removed"
  >("all");
  const selectedTimeRange = onTimeRangeChange ? timeRange : localTimeRange;

  const handleTimeRangeChange = (range: string) => {
    setLocalTimeRange(range);
    onTimeRangeChange?.(range);
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["/api/analytics/dashboard", selectedTimeRange],
    queryFn: async () => {
      const response = await fetch(
        `/api/analytics/dashboard?range=${selectedTimeRange}`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Failed to fetch playlist data");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const placements = useMemo<PlaylistPlacement[]>(() => {
    const platformMap: Record<string, string> = {
      spotify: "spotify",
      apple: "apple",
      "apple music": "apple",
      deezer: "deezer",
      amazon: "amazon",
      "amazon music": "amazon",
      youtube: "youtube",
      "youtube music": "youtube",
    };
    return (data?.playlists?.current || []).map((playlist: Record<string, unknown>) => ({
      id: String(playlist.id),
      playlistName: String(playlist.name || "Untitled playlist"),
      platform:
        platformMap[String(playlist.platform || "").toLowerCase()] ||
        String(playlist.platform || "unknown"),
      followers: Number(playlist.followers) || 0,
      trackName: typeof playlist.trackName === "string" ? playlist.trackName : undefined,
      position: typeof playlist.position === "number" ? playlist.position : undefined,
      addedDate: String(playlist.addedDate || ""),
      status: playlist.status === "removed" ? "removed" : "active",
      estimatedStreams: Number(playlist.estimatedStreams) || 0,
      curatorName: typeof playlist.curatorName === "string" ? playlist.curatorName : undefined,
    }));
  }, [data]);

  const metrics = useMemo<PlaylistMetrics>(
    () => ({
      totalPlaylists: placements.filter((p) => p.status === "active").length,
      totalReach: placements
        .filter((p) => p.status === "active")
        .reduce((sum, p) => sum + p.followers, 0),
      monthlyStreamsFromPlaylists: placements
        .filter((p) => p.status === "active")
        .reduce((sum, p) => sum + p.estimatedStreams, 0),
      newAdditions: placements.filter((p) => p.status === "active").length,
      removals: placements.filter((p) => p.status === "removed").length,
      avgPosition:
        Math.round(
          placements
            .filter((p) => p.status === "active")
            .reduce((sum, p) => sum + p.position, 0) /
            (placements.filter((p) => p.status === "active").length || 1),
        ) || 0,
    }),
    [placements],
  );

  const curatorInsights = useMemo<CuratorInsight[]>(() => [], []);

  const filteredPlacements = useMemo(() => {
    let filtered = placements;
    if (filterStatus !== "all") {
      filtered = filtered.filter((p) => p.status === filterStatus);
    }
    if (activeTab !== "all") {
      filtered = filtered.filter((p) => p.platform === activeTab);
    }
    return filtered;
  }, [placements, filterStatus, activeTab]);

  const performanceData = useMemo(
    () =>
      placements.length > 0
        ? placements.map((p, i) => ({
            week: `Week ${i + 1}`,
            streams: p.estimatedStreams || 0,
            additions: p.status === "active" ? 1 : 0,
          }))
        : [],
    [placements],
  );

  const hasData = placements.length > 0;

  if (isLoading) {
    return <PlaylistTrackingSkeleton />;
  }

  if (isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <p className="font-semibold">Could not load playlist tracking</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Unable to load playlist data."}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Playlist Tracking</h2>
          <DateRangePicker
            value={selectedTimeRange}
            onChange={handleTimeRangeChange}
          />
        </div>
        <PlaylistEmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Playlist Tracking</h2>
          <p className="text-sm text-muted-foreground">
            Monitor your playlist placements and performance
          </p>
        </div>
        <DateRangePicker
          value={selectedTimeRange}
          onChange={handleTimeRangeChange}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <ListMusic className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">
                Active Playlists
              </span>
            </div>
            <p className="text-2xl font-bold">{metrics.totalPlaylists}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Total Reach</span>
            </div>
            <p className="text-2xl font-bold">
              {(metrics.totalReach / 1000000).toFixed(1)}M
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Play className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">
                Est. Monthly Streams
              </span>
            </div>
            <p className="text-2xl font-bold">
              {(metrics.monthlyStreamsFromPlaylists / 1000).toFixed(0)}K
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Additions</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              +{metrics.newAdditions}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Minus className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Removals</span>
            </div>
            <p className="text-2xl font-bold text-red-600">
              -{metrics.removals}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">
                Avg Position
              </span>
            </div>
            <p className="text-2xl font-bold">#{metrics.avgPosition}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Playlist Placements</CardTitle>
                <CardDescription>
                  Your tracks on playlists across platforms
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={filterStatus === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("all")}
                >
                  All
                </Button>
                <Button
                  variant={filterStatus === "active" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("active")}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </Button>
                <Button
                  variant={filterStatus === "removed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("removed")}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Removed
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">All Platforms</TabsTrigger>
                <TabsTrigger value="spotify">🎵 Spotify</TabsTrigger>
                <TabsTrigger value="apple">🍎 Apple</TabsTrigger>
                <TabsTrigger value="deezer">🎧 Deezer</TabsTrigger>
              </TabsList>
            </Tabs>

            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                <AnimatePresence>
                  {filteredPlacements.map((playlist) => (
                    <PlaylistCard key={playlist.id} playlist={playlist} />
                  ))}
                </AnimatePresence>
                {filteredPlacements.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No playlists match your filters
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Curator Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {curatorInsights.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No curator data available yet.
                  </p>
                ) : (
                  curatorInsights.map((curator, index) => (
                    <motion.div
                      key={curator.curatorName}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">
                          {curator.curatorName}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {curator.playlistCount} playlists
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>
                          Followers:{" "}
                          {(curator.totalFollowers / 1000000).toFixed(1)}M
                        </span>
                        <span>Response: {curator.responseRate}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Avg time to add: {curator.avgTimeToAdd}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-slate-200 dark:stroke-slate-700"
                    />
                    <XAxis dataKey="week" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="streams"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: "#3b82f6", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default PlaylistTracking;
