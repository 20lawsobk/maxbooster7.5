// @ts-nocheck
import { useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
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
import { History, TrendingUp, Trophy, Milestone, ArrowUp, ArrowDown, BarChart3, LineChart, Loader2, RefreshCw } from "lucide-react";

interface YearData {
  year: number;
  streams: number;
  revenue: number;
  listeners: number;
  releases: number;
  playlistAdds: number;
}

interface Milestone {
  id: string;
  type: "streams" | "followers" | "revenue" | "release" | "playlist" | "award";
  title: string;
  description: string;
  date: string;
  value?: number;
  icon: string;
}

interface TrendData {
  metric: string;
  data: Array<{ year: number; value: number }>;
  currentValue: number;
  totalGrowth: number;
  avgYearlyGrowth: number;
}

interface HistoricalAnalyticsProps {
  yearlyData?: YearData[];
  milestones?: Milestone[];
  trends?: TrendData[];
}

const defaultYearlyData: YearData[] = [];

const defaultMilestones: Milestone[] = [];

const defaultTrends: TrendData[] = [];

const YearOverYearComparison = memo(({ data }: { data: YearData[] }) => {
  const [metric, setMetric] = useState<keyof YearData>("streams");
  const sortedData = [...data].sort((a, b) => b.year - a.year);

  const getChange = (current: number, previous: number) => {
    if (!previous) return 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const formatValue = (value: number, key: string) => {
    if (key === "revenue") return `$${value.toLocaleString()}`;
    if (key === "streams" || key === "listeners") {
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toLocaleString();
  };

  const maxValue =
    sortedData.length > 0
      ? Math.max(...sortedData.map((d) => d[metric] as number))
      : 1;

  if (sortedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <BarChart3 className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">No historical data available yet</p>
        <p className="text-xs mt-1">
          Year-over-year comparisons will appear after your first full year
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Year-over-Year Comparison</h3>
        <Select
          value={metric}
          onValueChange={(v) => setMetric(v as keyof YearData)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="streams">Streams</SelectItem>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="listeners">Listeners</SelectItem>
            <SelectItem value="releases">Releases</SelectItem>
            <SelectItem value="playlistAdds">Playlist Adds</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {sortedData.map((yearData, idx) => {
          const value = yearData[metric] as number;
          const prevYear = sortedData[idx + 1];
          const prevValue = prevYear ? (prevYear[metric] as number) : 0;
          const change = getChange(value, prevValue);
          const barWidth = (value / maxValue) * 100;

          return (
            <motion.div
              key={yearData.year}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold w-16">
                    {yearData.year}
                  </span>
                  <span className="text-lg font-medium">
                    {formatValue(value, metric)}
                  </span>
                </div>
                {idx < sortedData.length - 1 && (
                  <Badge
                    variant={change >= 0 ? "default" : "destructive"}
                    className={change >= 0 ? "bg-green-100 text-green-800" : ""}
                  >
                    {change >= 0 ? (
                      <ArrowUp className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDown className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(change)}%
                  </Badge>
                )}
              </div>
              <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${barWidth}%` }}
                  transition={{ duration: 0.8, delay: idx * 0.1 }}
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
        {sortedData.slice(0, 2).length === 2 && (
          <>
            <div className="col-span-2 md:col-span-5">
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    Streams Growth
                  </p>
                  <p className="text-xl font-bold text-blue-600">
                    +{getChange(sortedData[0].streams, sortedData[1].streams)}%
                  </p>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    Revenue Growth
                  </p>
                  <p className="text-xl font-bold text-green-600">
                    +{getChange(sortedData[0].revenue, sortedData[1].revenue)}%
                  </p>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    Listener Growth
                  </p>
                  <p className="text-xl font-bold text-purple-600">
                    +
                    {getChange(
                      sortedData[0].listeners,
                      sortedData[1].listeners,
                    )}
                    %
                  </p>
                </div>
                <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">New Releases</p>
                  <p className="text-xl font-bold text-orange-600">
                    {sortedData[0].releases}
                  </p>
                </div>
                <div className="text-center p-3 bg-cyan-50 dark:bg-cyan-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Playlist Adds</p>
                  <p className="text-xl font-bold text-cyan-600">
                    {sortedData[0].playlistAdds}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
YearOverYearComparison.displayName = "YearOverYearComparison";

const CareerTimeline = memo(({ milestones }: { milestones: Milestone[] }) => {
  const sortedMilestones = [...milestones].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const getMilestoneColor = (type: string) => {
    switch (type) {
      case "streams":
        return "border-blue-500 bg-blue-50 dark:bg-blue-950/30";
      case "followers":
        return "border-purple-500 bg-purple-50 dark:bg-purple-950/30";
      case "revenue":
        return "border-green-500 bg-green-50 dark:bg-green-950/30";
      case "release":
        return "border-orange-500 bg-orange-50 dark:bg-orange-950/30";
      case "playlist":
        return "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30";
      case "award":
        return "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30";
      default:
        return "border-slate-500 bg-slate-50";
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-lg flex items-center gap-2">
        <Trophy className="h-5 w-5 text-yellow-500" />
        Career Milestones
      </h3>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

        <div className="space-y-6">
          {sortedMilestones.map((milestone, idx) => (
            <motion.div
              key={milestone.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="relative flex items-start gap-4"
            >
              <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-900 border-4 border-slate-200 dark:border-slate-700 flex items-center justify-center text-2xl z-10">
                {milestone.icon}
              </div>

              <Card
                className={`flex-1 border-l-4 ${getMilestoneColor(milestone.type)}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-lg">{milestone.title}</h4>
                      <p className="text-muted-foreground text-sm">
                        {milestone.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {new Date(milestone.date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <Badge
                        variant="outline"
                        className="mt-1 capitalize text-xs"
                      >
                        {milestone.type}
                      </Badge>
                    </div>
                  </div>
                  {milestone.value && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-2xl font-bold text-indigo-600">
                        {milestone.type === "revenue"
                          ? `$${milestone.value.toLocaleString()}`
                          : milestone.value.toLocaleString()}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
});
CareerTimeline.displayName = "CareerTimeline";

const LongTermTrends = memo(({ trends }: { trends: TrendData[] }) => {
  const [selectedMetric, setSelectedMetric] = useState(
    trends[0]?.metric || "Streams",
  );
  const selectedTrend =
    trends.find((t) => t.metric === selectedMetric) || trends[0];

  if (!selectedTrend) return null;

  const { data } = selectedTrend;
  const maxValue = Math.max(...data.map((d) => d.value));
  const minValue = Math.min(...data.map((d) => d.value));
  const range = maxValue - minValue || 1;

  const points = data
    .map((d, i) => {
      const x = (i / ((data.length - 1 || 1))) * 100;
      const y = 100 - ((d.value - minValue) / range) * 80 - 10;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPath = `M0,100 L0,${100 - ((data[0].value - minValue) / range) * 80 - 10} ${data
    .map((d, i) => {
      const x = (i / ((data.length - 1 || 1))) * 100;
      const y = 100 - ((d.value - minValue) / range) * 80 - 10;
      return `L${x},${y}`;
    })
    .join(" ")} L100,100 Z`;

  const formatValue = (value: number) => {
    if (selectedMetric === "Revenue") return `$${(value / 1000).toFixed(1)}K`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <LineChart className="h-5 w-5 text-indigo-500" />
          Long-Term Trends
        </h3>
        <div className="flex gap-2">
          {trends.map((trend) => (
            <Button
              key={trend.metric}
              variant={selectedMetric === trend.metric ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedMetric(trend.metric)}
            >
              {trend.metric}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-indigo-50 dark:bg-indigo-950/30">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Current {selectedMetric}
            </p>
            <p className="text-3xl font-bold text-indigo-600">
              {formatValue(selectedTrend.currentValue)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 dark:bg-green-950/30">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Growth</p>
            <p className="text-3xl font-bold text-green-600">
              +{selectedTrend.totalGrowth}%
            </p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 dark:bg-purple-950/30">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Avg Yearly Growth</p>
            <p className="text-3xl font-bold text-purple-600">
              +{selectedTrend.avgYearlyGrowth}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="h-64 relative">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full h-full"
            >
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#trendGradient)" />
              <polyline
                points={points}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {data.map((d, i) => {
                const x = (i / ((data.length - 1 || 1))) * 100;
                const y = 100 - ((d.value - minValue) / range) * 80 - 10;
                return (
                  <g key={i}>
                    <circle
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#6366f1"
                      stroke="white"
                      strokeWidth="2"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex justify-between mt-4 text-sm text-muted-foreground">
            {data.map((d, i) => (
              <div key={i} className="text-center">
                <p className="font-bold text-foreground">{d.year}</p>
                <p>{formatValue(d.value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
LongTermTrends.displayName = "LongTermTrends";

export default function HistoricalAnalyticsView({
  yearlyData: propYearlyData,
  milestones: propMilestones,
  trends: propTrends,
}: HistoricalAnalyticsProps) {
  const {
    data: yearlyResponse,
    isLoading: yearlyLoading,
    isError: yearlyError,
    refetch: refetchYearly,
  } = useQuery<{ data: YearData[] }>({
    queryKey: ["/api/analytics/historical/yearly"],
    enabled: !propYearlyData,
  });

  const {
    data: milestonesResponse,
    isLoading: milestonesLoading,
    isError: milestonesError,
    refetch: refetchMilestones,
  } = useQuery<{ data: Milestone[] }>({
    queryKey: ["/api/analytics/historical/milestones"],
    enabled: !propMilestones,
  });

  const {
    data: trendsResponse,
    isLoading: trendsLoading,
    isError: trendsError,
    refetch: refetchTrends,
  } = useQuery<{ data: TrendData[] }>({
    queryKey: ["/api/analytics/historical/trends"],
    enabled: !propTrends,
  });

  const yearlyData =
    propYearlyData ||
    (yearlyError
      ? defaultYearlyData
      : (yearlyResponse?.data ?? yearlyResponse)) ||
    defaultYearlyData;
  const milestones =
    propMilestones ||
    (milestonesError
      ? defaultMilestones
      : (milestonesResponse?.data ?? milestonesResponse)) ||
    defaultMilestones;
  const trends =
    propTrends ||
    (trendsError ? defaultTrends : (trendsResponse?.data ?? trendsResponse)) ||
    defaultTrends;

  const isLoading = yearlyLoading || milestonesLoading || trendsLoading;

  const handleRefresh = () => {
    refetchYearly();
    refetchMilestones();
    refetchTrends();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-indigo-500" />
            Historical Analytics
          </h2>
          <p className="text-muted-foreground mt-1">
            Track your long-term growth and career milestones
          </p>
        </div>
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
      </div>

      <Tabs defaultValue="comparison" className="w-full">
        <TabsList>
          <TabsTrigger value="comparison">
            <BarChart3 className="h-4 w-4 mr-2" />
            Year Comparison
          </TabsTrigger>
          <TabsTrigger value="milestones">
            <Trophy className="h-4 w-4 mr-2" />
            Milestones
          </TabsTrigger>
          <TabsTrigger value="trends">
            <TrendingUp className="h-4 w-4 mr-2" />
            Long-Term Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comparison">
          <Card>
            <CardContent className="p-6">
              <YearOverYearComparison data={yearlyData} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="milestones">
          <Card>
            <CardContent className="p-6">
              <CareerTimeline milestones={milestones} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <LongTermTrends trends={trends} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
