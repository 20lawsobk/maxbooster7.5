// @ts-nocheck
import { useState, useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Play,
  TrendingUp,
  TrendingDown,
  Headphones,
  Clock,
  SkipForward,
  Heart,
  Share2,
  RefreshCw,
  Info,
} from "lucide-react";
import { DateRangePicker } from "@/components/analytics/DateRangePicker";
import { PlatformFilterChips } from "@/components/analytics/PlatformFilterChips";
import {
  StreamingEmptyState,
  RefreshingState,
  DateRangeEmptyState,
} from "@/components/analytics/AnalyticsEmptyStates";
import {
  ChartCardSkeleton,
  StatCardRowSkeleton,
} from "@/components/analytics/AnalyticsLoadingSkeletons";
import { cn } from "@/lib/utils";

interface StreamingData {
  date: string;
  streams: number;
  uniqueListeners: number;
  completionRate: number;
}

interface StreamingMetrics {
  totalStreams: number;
  totalListeners: number;
  avgCompletionRate: number;
  skipRate: number;
  saveRate: number;
  shareRate: number;
  avgListenTime: number;
  streamChange: number;
  listenerChange: number;
}

const CustomTooltip = ({ active, payload, label }: Record<string, unknown>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
        <p className="font-semibold text-sm mb-2">{label}</p>
        {payload.map((entry: Record<string, unknown>, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-600 dark:text-slate-400">
              {entry.name}:
            </span>
            <span className="font-medium">{entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const MetricCard = memo(
  ({
    title,
    value,
    change,
    icon: Icon,
    tooltip,
    color = "blue",
  }: {
    title: string;
    value: string | number;
    change?: number;
    icon: React.ElementType;
    tooltip?: string;
    color?: string;
  }) => {
    const colorClasses = {
      blue: "from-blue-500/10 to-blue-600/5 border-blue-500/20 text-blue-500",
      green:
        "from-green-500/10 to-green-600/5 border-green-500/20 text-green-500",
      purple:
        "from-purple-500/10 to-purple-600/5 border-purple-500/20 text-purple-500",
      orange:
        "from-orange-500/10 to-orange-600/5 border-orange-500/20 text-orange-500",
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02 }}
      >
        <Card
          className={cn(
            "bg-gradient-to-br",
            colorClasses[color as keyof typeof colorClasses],
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium">
                    {title}
                  </span>
                  {tooltip && (
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-[200px]">{tooltip}</p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  )}
                </div>
                <p className="text-2xl font-bold mt-1">{value}</p>
                {change !== undefined && (
                  <div className="flex items-center gap-1 mt-1">
                    {change > 0 ? (
                      <TrendingUp className="w-3 h-3 text-green-500" />
                    ) : change < 0 ? (
                      <TrendingDown className="w-3 h-3 text-red-500" />
                    ) : null}
                    <span
                      className={cn(
                        "text-xs",
                        change > 0
                          ? "text-green-500"
                          : change < 0
                            ? "text-red-500"
                            : "text-muted-foreground",
                      )}
                    >
                      {change > 0 ? "+" : ""}
                      {change}%
                    </span>
                  </div>
                )}
              </div>
              <Icon
                className={cn(
                  "h-5 w-5",
                  colorClasses[color as keyof typeof colorClasses]
                    .split(" ")
                    .pop(),
                )}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  },
);
MetricCard.displayName = "MetricCard";

interface StreamingAnalyticsProps {
  userId?: string;
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
}

export function StreamingAnalytics({
  _userId,
  timeRange = "30d",
  onTimeRangeChange,
}: StreamingAnalyticsProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [chartView, setChartView] = useState<"area" | "bar" | "line">("area");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["/api/analytics/streaming", timeRange, selectedPlatforms],
    queryFn: async () => {
      const params = new URLSearchParams({ range: timeRange });
      if (selectedPlatforms.length > 0) {
        params.append("platforms", selectedPlatforms.join(","));
      }
      const response = await fetch(
        `/api/analytics/dashboard?${params.toString()}`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Failed to fetch streaming data");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const streamingData = useMemo<StreamingData[]>(() => {
    if (!data?.streams?.daily) return [];
    return data.streams.daily.map((d: Record<string, unknown>) => ({
      date: new Date(d.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      streams: d.streams || 0,
      uniqueListeners: d.listeners || Math.round((d.streams || 0) * 0.6),
      completionRate: d.completionRate || 75,
    }));
  }, [data]);

  const metrics = useMemo<StreamingMetrics>(() => {
    const overview = data?.overview || {};
    return {
      totalStreams: overview.totalStreams || 0,
      totalListeners: overview.totalListeners || 0,
      avgCompletionRate: overview.completionRate || 0,
      skipRate: overview.skipRate || 0,
      saveRate: overview.likeRate || 0,
      shareRate: overview.shareRate || 0,
      avgListenTime: overview.avgListenTime || 0,
      streamChange: overview.growthRate || 0,
      listenerChange: overview.listenerChange || 0,
    };
  }, [data]);

  const hasData = streamingData.length > 0 || metrics.totalStreams > 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <StatCardRowSkeleton count={4} />
        <ChartCardSkeleton height={350} />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Streaming Analytics</h2>
          <DateRangePicker
            value={timeRange}
            onChange={onTimeRangeChange || (() => {})}
          />
        </div>
        <StreamingEmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Streaming Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Track your streaming performance across platforms
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")}
            />
            Refresh
          </Button>
          <DateRangePicker
            value={timeRange}
            onChange={onTimeRangeChange || (() => {})}
            showCompare
          />
        </div>
      </div>

      <PlatformFilterChips
        selectedPlatforms={selectedPlatforms}
        onChange={setSelectedPlatforms}
        variant="chips"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Streams"
          value={metrics.totalStreams.toLocaleString()}
          change={metrics.streamChange}
          icon={Play}
          tooltip="Total number of streams across all platforms"
          color="blue"
        />
        <MetricCard
          title="Unique Listeners"
          value={metrics.totalListeners.toLocaleString()}
          change={metrics.listenerChange}
          icon={Headphones}
          tooltip="Number of unique listeners in this period"
          color="purple"
        />
        <MetricCard
          title="Avg Completion"
          value={`${metrics.avgCompletionRate.toFixed(1)}%`}
          icon={Clock}
          tooltip="Average percentage of track listened"
          color="green"
        />
        <MetricCard
          title="Skip Rate"
          value={`${metrics.skipRate.toFixed(1)}%`}
          icon={SkipForward}
          tooltip="Percentage of plays skipped within 30 seconds"
          color="orange"
        />
      </div>

      <Card className="relative overflow-hidden">
        {isRefreshing && <RefreshingState />}
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Streaming Trends</CardTitle>
              <CardDescription>
                Daily streams and unique listeners over time
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tabs
                value={chartView}
                onValueChange={(v) =>
                  setChartView(v as Record<string, unknown>)
                }
              >
                <TabsList className="h-8">
                  <TabsTrigger value="area" className="text-xs h-6">
                    Area
                  </TabsTrigger>
                  <TabsTrigger value="bar" className="text-xs h-6">
                    Bar
                  </TabsTrigger>
                  <TabsTrigger value="line" className="text-xs h-6">
                    Line
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {streamingData.length === 0 ? (
            <DateRangeEmptyState range={timeRange} />
          ) : (
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                {chartView === "area" ? (
                  <AreaChart data={streamingData}>
                    <defs>
                      <linearGradient
                        id="colorStreams"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3b82f6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorListeners"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#8b5cf6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-slate-200 dark:stroke-slate-700"
                    />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="streams"
                      name="Streams"
                      stroke="#3b82f6"
                      fill="url(#colorStreams)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="uniqueListeners"
                      name="Unique Listeners"
                      stroke="#8b5cf6"
                      fill="url(#colorListeners)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                ) : chartView === "bar" ? (
                  <BarChart data={streamingData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-slate-200 dark:stroke-slate-700"
                    />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar
                      dataKey="streams"
                      name="Streams"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="uniqueListeners"
                      name="Unique Listeners"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                ) : (
                  <LineChart data={streamingData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-slate-200 dark:stroke-slate-700"
                    />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="streams"
                      name="Streams"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: "#3b82f6", r: 4 }}
                      activeDot={{
                        r: 6,
                        stroke: "#3b82f6",
                        strokeWidth: 2,
                        fill: "#fff",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="uniqueListeners"
                      name="Unique Listeners"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: "#8b5cf6", r: 4 }}
                      activeDot={{
                        r: 6,
                        stroke: "#8b5cf6",
                        strokeWidth: 2,
                        fill: "#fff",
                      }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Heart className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Save Rate</p>
                <p className="text-xl font-bold">
                  {metrics.saveRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Share2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Share Rate</p>
                <p className="text-xl font-bold">
                  {metrics.shareRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Listen Time</p>
                <p className="text-xl font-bold">
                  {Math.floor(metrics.avgListenTime / 60)}:
                  {String(metrics.avgListenTime % 60).padStart(2, "0")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default StreamingAnalytics;
