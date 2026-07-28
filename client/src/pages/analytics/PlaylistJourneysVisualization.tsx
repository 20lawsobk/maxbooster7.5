import { useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListMusic, TrendingUp, Calendar, Users, Plus, Minus, Clock, ChevronUp, Sparkles, Radio, UserCheck, Loader2, RefreshCw } from "lucide-react";

interface PlaylistEvent {
  id: string;
  playlistName: string;
  platform: string;
  type: "editorial" | "algorithmic" | "user";
  action: "added" | "removed";
  date: string;
  position?: number;
  followers: number;
  estimatedStreams: number;
  trackName?: string;
}

interface PositionHistory {
  date: string;
  position: number;
  playlistName: string;
}

interface PlaylistTypeBreakdown {
  type: "editorial" | "algorithmic" | "user";
  count: number;
  percentage: number;
  totalReach: number;
  avgStreamsPerDay: number;
}

interface PlaylistJourneysProps {
  events?: PlaylistEvent[];
  positionHistory?: PositionHistory[];
  typeBreakdown?: PlaylistTypeBreakdown[];
  onRefresh?: () => void;
}

const PlaylistTimeline = memo(({ events }: { events: PlaylistEvent[] }) => {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        <p>No playlist events recorded yet</p>
      </div>
    );
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "editorial":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "algorithmic":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "user":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "editorial":
        return <Sparkles className="h-4 w-4" />;
      case "algorithmic":
        return <Radio className="h-4 w-4" />;
      case "user":
        return <UserCheck className="h-4 w-4" />;
      default:
        return <ListMusic className="h-4 w-4" />;
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "spotify":
        return "#1DB954";
      case "apple music":
        return "#FA2D48";
      case "amazon music":
        return "#00A8E1";
      case "youtube music":
        return "#FF0000";
      case "deezer":
        return "#FEAA2D";
      default:
        return "#6366f1";
    }
  };

  return (
    <div className="space-y-4">
      {events.map((event, idx) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.05 }}
          className="relative"
        >
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  event.action === "added" ? "bg-green-100" : "bg-red-100"
                }`}
              >
                {event.action === "added" ? (
                  <Plus className="h-5 w-5 text-green-600" />
                ) : (
                  <Minus className="h-5 w-5 text-red-600" />
                )}
              </div>
              {idx < events.length - 1 && (
                <div className="w-0.5 h-16 bg-slate-200 dark:bg-slate-700 my-2" />
              )}
            </div>

            <div className="flex-1 pb-4">
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: getPlatformColor(event.platform),
                          }}
                        />
                        <span className="font-semibold">
                          {event.playlistName}
                        </span>
                        <Badge
                          variant="outline"
                          className={getTypeColor(event.type)}
                        >
                          {getTypeIcon(event.type)}
                          <span className="ml-1 capitalize">{event.type}</span>
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {event.trackName && (
                          <span className="font-medium">
                            "{event.trackName}"{" "}
                          </span>
                        )}
                        was{" "}
                        {event.action === "added" ? "added to" : "removed from"}{" "}
                        {event.platform}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(event.date).toLocaleDateString()}
                        </span>
                        {event.position && (
                          <span className="flex items-center gap-1">
                            Position: #{event.position}
                          </span>
                        )}
                        {event.followers > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {(event.followers / 1000000).toFixed(1)}M followers
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {event.estimatedStreams > 0 && (
                        <div>
                          <p className="text-lg font-bold text-green-600">
                            +{event.estimatedStreams.toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-500">est. streams</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
});
PlaylistTimeline.displayName = "PlaylistTimeline";

const PositionChart = memo(({ history }: { history: PositionHistory[] }) => {
  const reversedHistory = [...history].reverse();

  if (reversedHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        <p>No position history available yet</p>
      </div>
    );
  }

  const maxPosition = Math.max(...reversedHistory.map((h) => h.position));
  const minPosition = Math.min(...reversedHistory.map((h) => h.position));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>Best: #{minPosition}</span>
        <span>
          Current: #{reversedHistory[reversedHistory.length - 1]?.position || 0}
        </span>
      </div>
      <div className="relative h-48 bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
        <div className="flex items-end justify-between h-full gap-2">
          {reversedHistory.map((point, idx) => {
            const height =
              ((maxPosition - point.position + 1) / maxPosition) * 100;
            return (
              <motion.div
                key={idx}
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                className="flex-1 bg-gradient-to-t from-blue-500 to-blue-300 rounded-t-md relative group cursor-pointer"
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  #{point.position} -{" "}
                  {new Date(point.date).toLocaleDateString()}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        {reversedHistory.map((point, idx) => (
          <span key={idx}>
            {new Date(point.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        ))}
      </div>
    </div>
  );
});
PositionChart.displayName = "PositionChart";

const TypeBreakdownChart = memo(
  ({ breakdown }: { breakdown: PlaylistTypeBreakdown[] }) => {
    if (breakdown.length === 0) {
      return (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          <p>No playlist type data available yet</p>
        </div>
      );
    }

    const typeColors = {
      editorial: {
        bg: "bg-purple-500",
        light: "bg-purple-100",
        text: "text-purple-700",
      },
      algorithmic: {
        bg: "bg-blue-500",
        light: "bg-blue-100",
        text: "text-blue-700",
      },
      user: {
        bg: "bg-green-500",
        light: "bg-green-100",
        text: "text-green-700",
      },
    };

    const typeIcons = {
      editorial: <Sparkles className="h-5 w-5" />,
      algorithmic: <Radio className="h-5 w-5" />,
      user: <UserCheck className="h-5 w-5" />,
    };

    return (
      <div className="space-y-6">
        <div className="flex h-4 rounded-full overflow-hidden">
          {breakdown.map((item) => (
            <motion.div
              key={item.type}
              initial={{ width: 0 }}
              animate={{ width: `${item.percentage}%` }}
              transition={{ duration: 0.5 }}
              className={typeColors[item.type].bg}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {breakdown.map((item) => (
            <Card
              key={item.type}
              className={`${typeColors[item.type].light} border-0`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`p-2 rounded-lg ${typeColors[item.type].bg} text-white`}
                  >
                    {typeIcons[item.type]}
                  </div>
                  <div>
                    <p
                      className={`font-semibold capitalize ${typeColors[item.type].text}`}
                    >
                      {item.type}
                    </p>
                    <p className="text-sm text-slate-600">
                      {item.count} playlists
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Share</span>
                    <span className="font-semibold">{item.percentage}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Reach</span>
                    <span className="font-semibold">
                      {item.totalReach > 0
                        ? `${(item.totalReach / 1000000).toFixed(1)}M`
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Avg Streams/Day</span>
                    <span className="font-semibold">
                      {item.avgStreamsPerDay.toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  },
);
TypeBreakdownChart.displayName = "TypeBreakdownChart";

export default function PlaylistJourneysVisualization({
  events: propEvents,
  positionHistory: propPositionHistory,
  typeBreakdown: propTypeBreakdown,
  onRefresh,
}: PlaylistJourneysProps) {
  const [timeFilter, setTimeFilter] = useState("30d");
  const [platformFilter, setPlatformFilter] = useState("all");

  const {
    data: journeysResponse,
    isLoading,
    
    refetch,
  } = useQuery<{
    data: {
      events: PlaylistEvent[];
      positionHistory: PositionHistory[];
      typeBreakdown: PlaylistTypeBreakdown[];
    };
  }>({
    queryKey: ["/api/analytics/playlist-journeys", timeFilter],
    enabled: !propEvents,
  });

  const journeysData = journeysResponse?.data ?? journeysResponse;
  const events: PlaylistEvent[] = propEvents || journeysData?.events || [];
  const positionHistory: PositionHistory[] =
    propPositionHistory || journeysData?.positionHistory || [];
  const typeBreakdown: PlaylistTypeBreakdown[] =
    propTypeBreakdown || journeysData?.typeBreakdown || [];

  const handleRefresh = () => {
    refetch();
    onRefresh?.();
  };

  const filteredEvents = events.filter((event: PlaylistEvent) => {
    if (
      platformFilter !== "all" &&
      event.platform.toLowerCase() !== platformFilter
    ) {
      return false;
    }
    return true;
  });

  const stats = {
    totalPlaylists: events.filter((e: PlaylistEvent) => e.action === "added")
      .length,
    removals: events.filter((e: PlaylistEvent) => e.action === "removed")
      .length,
    estimatedStreams: events.reduce(
      (sum: number, e: PlaylistEvent) => sum + e.estimatedStreams,
      0,
    ),
    totalReach: events.reduce(
      (sum: number, e: PlaylistEvent) => sum + e.followers,
      0,
    ),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ListMusic className="h-6 w-6 text-cyan-500" />
            Playlist Journeys
          </h2>
          <p className="text-muted-foreground mt-1">
            Track your playlist placements across all platforms
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="spotify">Spotify</SelectItem>
              <SelectItem value="apple music">Apple Music</SelectItem>
              <SelectItem value="amazon music">Amazon Music</SelectItem>
              <SelectItem value="youtube music">YouTube Music</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Active Playlists
                </p>
                <p className="text-3xl font-bold text-cyan-600">
                  {stats.totalPlaylists}
                </p>
              </div>
              <Plus className="h-8 w-8 text-cyan-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Removals</p>
                <p className="text-3xl font-bold text-red-600">
                  {stats.removals}
                </p>
              </div>
              <Minus className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Est. Streams</p>
                <p className="text-3xl font-bold text-green-600">
                  {(stats.estimatedStreams / 1000).toFixed(0)}K
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reach</p>
                <p className="text-3xl font-bold text-purple-600">
                  {(stats.totalReach / 1000000).toFixed(1)}M
                </p>
              </div>
              <Users className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList>
          <TabsTrigger value="timeline">
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="positions">
            <ChevronUp className="h-4 w-4 mr-2" />
            Position History
          </TabsTrigger>
          <TabsTrigger value="breakdown">
            <ListMusic className="h-4 w-4 mr-2" />
            Type Breakdown
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Playlist Activity Timeline</CardTitle>
              <CardDescription>
                Recent additions and removals across platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlaylistTimeline events={filteredEvents} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle>Position History</CardTitle>
              <CardDescription>
                Track position changes in major playlists
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PositionChart history={positionHistory} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <Card>
            <CardHeader>
              <CardTitle>Playlist Type Breakdown</CardTitle>
              <CardDescription>
                Distribution across editorial, algorithmic, and user playlists
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TypeBreakdownChart breakdown={typeBreakdown} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
