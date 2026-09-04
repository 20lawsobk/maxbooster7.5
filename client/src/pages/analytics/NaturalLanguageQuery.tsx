// @ts-nocheck
import { useState, memo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Search, Sparkles, TrendingUp, DollarSign, Users, Music, Globe, Calendar, BarChart3, PieChart, Send, Loader2, History, Lightbulb, ChevronRight, ArrowUp, ArrowDown, X } from "lucide-react";

interface QueryResult {
  type: "chart" | "metric" | "table" | "text";
  title: string;
  data: Record<string, unknown>;
  summary: string;
}

interface QueryHistory {
  query: string;
  timestamp: Date;
  resultType: string;
}

interface NaturalLanguageQueryProps {
  onQuery?: (query: string) => Promise<QueryResult>;
}

const exampleQueries = [
  { text: "What were my top performing tracks last month?", icon: Music },
  { text: "Show me streaming trends for the past 6 months", icon: TrendingUp },
  { text: "Which countries generate the most revenue?", icon: Globe },
  { text: "Compare my Spotify vs Apple Music performance", icon: BarChart3 },
  { text: "How many new listeners did I gain this week?", icon: Users },
  {
    text: "What's my average revenue per stream by platform?",
    icon: DollarSign,
  },
  { text: "Show playlist additions in the last 30 days", icon: Calendar },
  { text: "Which demographics engage most with my music?", icon: PieChart },
];

const ResultChart = memo(({ data }: { data: Record<string, unknown> }) => {
  const values = Array.isArray(data.values)
    ? data.values.map((value) => Number(value)).filter(Number.isFinite)
    : [];
  const labels = Array.isArray(data.labels) ? data.labels : [];

  if (data.chartType === "line") {
    if (values.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No chart data is available for this query.
        </p>
      );
    }

    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    const points = values
      .map((value: number, i: number) => {
        const x = (i / ((values.length - 1 || 1))) * 100;
        const y = 100 - ((value - min) / range) * 80 - 10;
        return `${x},${y}`;
      })
      .join(" ");

    return (
      <div className="space-y-4">
        <div className="h-48 relative">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            <defs>
              <linearGradient id="queryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`M0,100 L0,${100 - ((values[0] - min) / range) * 80 - 10} ${values
                .map((v: number, i: number) => {
                  const x = (i / ((values.length - 1 || 1))) * 100;
                  const y = 100 - ((v - min) / range) * 80 - 10;
                  return `L${x},${y}`;
                })
                .join(" ")} L100,100 Z`}
              fill="url(#queryGradient)"
            />
            <polyline
              points={points}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          {labels.map((label: string, i: number) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      </div>
    );
  }

  if (data.chartType === "bar") {
    const items = Array.isArray(data.items)
      ? data.items
      : labels.map((label, idx) => ({
          name: label,
          value: values[idx] ?? 0,
        }));
    const maxValue = Math.max(
      ...items.map((item) => Number(item.value) || 0),
      1,
    );

    if (items.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No chart data is available for this query.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {items.map((item: Record<string, unknown>, idx: number) => {
          const value = Number(item.value) || 0;
          const percentage =
            typeof item.percentage === "number"
              ? item.percentage
              : Math.round((value / maxValue) * 100);
          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span className="font-semibold">
                  {value.toLocaleString()} ({percentage}%)
                </span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (data.chartType === "comparison") {
    return (
      <div className="grid grid-cols-2 gap-6">
        {data.platforms.map(
          (platform: Record<string, unknown>, idx: number) => (
            <div
              key={idx}
              className="text-center p-4 rounded-lg"
              style={{ backgroundColor: `${platform.color}15` }}
            >
              <p
                className="font-bold text-lg"
                style={{ color: platform.color }}
              >
                {platform.name}
              </p>
              <div className="mt-4 space-y-2">
                <div>
                  <p className="text-2xl font-bold">
                    {(platform.streams / 1000).toFixed(0)}K
                  </p>
                  <p className="text-xs text-muted-foreground">Streams</p>
                </div>
                <div>
                  <p className="text-xl font-bold">
                    ${platform.revenue.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>
                <div>
                  <p className="text-lg font-bold">
                    ${platform.rps.toFixed(4)}
                  </p>
                  <p className="text-xs text-muted-foreground">Per Stream</p>
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    );
  }

  if (data.chartType === "pie") {
    const colors = ["#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4"];
    return (
      <div className="grid grid-cols-5 gap-2">
        {data.segments.map((segment: Record<string, unknown>, idx: number) => (
          <div
            key={idx}
            className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900"
          >
            <div
              className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors[idx] }}
            >
              {segment.value}%
            </div>
            <p className="text-xs font-medium">{segment.name}</p>
            <p className="text-xs text-muted-foreground">
              {segment.engagement}% eng.
            </p>
          </div>
        ))}
      </div>
    );
  }

  return null;
});
ResultChart.displayName = "ResultChart";

const ResultMetric = memo(({ data }: { data: Record<string, unknown> }) => {
  return (
    <div className="flex items-center justify-center gap-8 py-8">
      <div className="text-center">
        <motion.p
          className="text-5xl font-bold text-indigo-600"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {typeof data.value === "number"
            ? data.value.toLocaleString()
            : data.value}
        </motion.p>
        {data.change !== undefined && (
          <div
            className={`flex items-center justify-center gap-1 mt-2 ${data.change >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {data.change >= 0 ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
            <span className="font-medium">
              {Math.abs(data.change)}% vs last {data.period}
            </span>
          </div>
        )}
        {data.reach && (
          <p className="text-sm text-muted-foreground mt-2">
            Combined reach: {(data.reach / 1000000).toFixed(1)}M listeners
          </p>
        )}
      </div>
    </div>
  );
});
ResultMetric.displayName = "ResultMetric";

const ResultTable = memo(({ data }: { data: Record<string, unknown> }) => {
  const items = Array.isArray(data.tracks)
    ? data.tracks
    : Array.isArray(data.releases)
      ? data.releases
      : Array.isArray(data.platforms)
        ? data.platforms
        : [];
  const isTrackData = Array.isArray(data.tracks) || Array.isArray(data.releases);
  const primaryLabel = Array.isArray(data.releases) ? "Release" : "Track";
  const comparisonRows =
    data.current && data.previous ? [data.current, data.previous] : [];

  if (comparisonRows.length > 0) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-semibold">Period</th>
              <th className="text-right p-3 font-semibold">Streams</th>
              <th className="text-right p-3 font-semibold">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((item, idx) => (
              <tr
                key={idx}
                className={
                  idx % 2 === 0 ? "bg-slate-50 dark:bg-slate-900/50" : ""
                }
              >
                <td className="p-3 font-medium">{item.label}</td>
                <td className="p-3 text-right">
                  {Number(item.streams ?? 0).toLocaleString()}
                </td>
                <td className="p-3 text-right">
                  ${Number(item.revenue ?? 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tabular data is available for this query.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left p-3 font-semibold">
              {isTrackData ? primaryLabel : "Platform"}
            </th>
            <th className="text-right p-3 font-semibold">
              {isTrackData ? "Streams" : "RPS"}
            </th>
            <th className="text-right p-3 font-semibold">Revenue</th>
            <th className="text-right p-3 font-semibold">
              {isTrackData ? "Growth" : "Streams"}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: Record<string, unknown>, idx: number) => (
            <motion.tr
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={
                idx % 2 === 0 ? "bg-slate-50 dark:bg-slate-900/50" : ""
              }
            >
              <td className="p-3 font-medium">{item.name}</td>
              <td className="p-3 text-right">
                {isTrackData
                  ? Number(item.streams ?? 0).toLocaleString()
                  : item.rps === undefined
                    ? "—"
                    : `$${Number(item.rps).toFixed(4)}`}
              </td>
              <td className="p-3 text-right">
                ${Number(item.revenue ?? 0).toLocaleString()}
              </td>
              <td className="p-3 text-right">
                {isTrackData ? (
                  <span
                    className={
                      item.growth >= 0 ? "text-green-600" : "text-red-600"
                    }
                  >
                    {item.growth >= 0 ? "+" : ""}
                    {item.growth}%
                  </span>
                ) : (
                  Number(item.streams ?? 0).toLocaleString()
                )}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
ResultTable.displayName = "ResultTable";

export default function NaturalLanguageQuery({
  onQuery,
}: NaturalLanguageQueryProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const handleQuery = useCallback(
    async (queryText: string) => {
      const trimmedQuery = queryText.trim();
      if (!trimmedQuery || isLoading) return;

      setIsLoading(true);
      setResult(null);

      try {
        let queryResult: QueryResult;
        if (onQuery) {
          queryResult = await onQuery(trimmedQuery);
        } else {
          const csrfToken = getCsrfTokenFromCookie();
          const response = await fetch("/api/analytics/natural-language-query", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ query: trimmedQuery }),
          });

          const data = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              data?.message ||
                data?.error ||
                `Request failed (${response.status})`,
            );
          }
          if (!data?.success || !data.result) {
            throw new Error(
              data?.message ||
                data?.error ||
                "The analytics service returned an invalid response.",
            );
          }
          queryResult = data.result;
        }

        setResult(queryResult);
        setHistory((prev) => [
          {
            query: trimmedQuery,
            timestamp: new Date(),
            resultType: queryResult.type,
          },
          ...prev.slice(0, 9),
        ]);
      } catch (error) {
        setResult({
          type: "text" as const,
          title: "Query Failed",
          summary:
            error instanceof Error
              ? error.message
              : "The analytics service could not process this query.",
          data: null,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, onQuery],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      handleQuery(query);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-indigo-500" />
            Natural Language Analytics
          </h2>
          <p className="text-muted-foreground mt-1">
            Ask questions about your music data in plain English
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="h-4 w-4 mr-2" />
          History
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything about your music analytics..."
                className="pl-12 pr-12 h-14 text-lg"
                aria-label="Analytics question"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isLoading || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>

          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">Try asking:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {exampleQueries.map((example, idx) => {
                const Icon = example.icon;
                return (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={isLoading}
                    onClick={() => {
                      setQuery(example.text);
                      handleQuery(example.text);
                    }}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {example.text}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Recent Queries
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistory(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Your submitted queries will appear here during this session.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {history.map((item, idx) => (
                      <button
                        type="button"
                        key={idx}
                        className="flex w-full items-center justify-between rounded p-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed dark:hover:bg-slate-900"
                        onClick={() => {
                          setQuery(item.query);
                          handleQuery(item.query);
                        }}
                        disabled={isLoading}
                      >
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{item.query}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {item.resultType}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {item.timestamp.toLocaleTimeString()}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <div className="mt-6">
              <Skeleton className="h-48 w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      <AnimatePresence>
        {result && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-indigo-500" />
                      {result.title}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {result.summary}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {result.type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {result.type === "chart" && <ResultChart data={result.data} />}
                {result.type === "metric" && (
                  <ResultMetric data={result.data} />
                )}
                {result.type === "table" && <ResultTable data={result.data} />}
                {result.type === "text" && (
                  <p className="text-muted-foreground">{result.summary}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
