// @ts-nocheck
/**
 * A&R Intelligence Page
 *
 * Uses the live awareness layer (RSS + Tavily + Exa) to deliver:
 *   • Trend Forecast — rising genres, BPMs, keys
 *   • Catalog Gap Analysis — what you're missing vs. demand
 *   • Release Timing Optimizer — best day + window to drop
 */

import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BarChart3,
  Brain,
  Calendar,
  Clock,
  Music,
  TrendingUp,
  Zap,
  AlertTriangle,
  Target,
  CheckCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useRequireSubscription } from "@/hooks/useRequireAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrendForecast {
  source: string;
  confidence: number;
  trendingGenres: string[];
  risingBpmRanges: Array<{
    label: string;
    bpmMin: number;
    bpmMax: number;
    momentum: string;
  }>;
  risingKeys: string[];
  trendingMoods: string[];
  trendingTopics: string[];
  platformSignals: Array<{ platform: string; trend: string; strength: string }>;
  updatedAt: string;
}

interface CatalogGap {
  catalog: {
    totalBeats: number;
    genreBreakdown: Array<{ genre: string; count: number }>;
    avgBpm: number;
    topGenre: string;
  };
  gaps: Array<{
    genre: string;
    demandScore: number;
    catalogCount: number;
    opportunityScore: number;
  }>;
  message: string;
}

interface ReleaseTiming {
  bestDays: Array<{ day: string; score: number }>;
  bestTimeWindows: Array<{
    window: string;
    reasoning: string;
    score: number;
  }>;
  recommendation: string;
  audiencePsychologyInsights: Array<{ trigger: string; pattern: string }>;
  trendingContext: string | null;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function momentumBadge(momentum: string) {
  const cls =
    momentum === "rising" || momentum === "strong"
      ? "bg-green-500/20 text-green-400"
      : momentum === "peak"
        ? "bg-yellow-500/20 text-yellow-400"
        : "bg-muted text-muted-foreground";
  return (
    <Badge className={`text-xs ${cls}`}>
      {momentum}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ARIntelligence() {
  useRequireSubscription();

  const forecast = useQuery<TrendForecast>({
    queryKey: ["ar-trend-forecast"],
    queryFn: () =>
      apiRequest("GET", "/api/ar-intelligence/trend-forecast").then((r) =>
        r.json(),
      ),
    staleTime: 30 * 60 * 1000, // 30 min — awareness layer has 30 min cache
  });

  const gap = useQuery<CatalogGap>({
    queryKey: ["ar-catalog-gap"],
    queryFn: () =>
      apiRequest("GET", "/api/ar-intelligence/catalog-gap").then((r) =>
        r.json(),
      ),
    staleTime: 30 * 60 * 1000,
  });

  const timing = useQuery<ReleaseTiming>({
    queryKey: ["ar-release-timing"],
    queryFn: () =>
      apiRequest("GET", "/api/ar-intelligence/release-timing").then((r) =>
        r.json(),
      ),
    staleTime: 30 * 60 * 1000,
  });

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            A&R Intelligence
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Live music industry signals powering trend forecasts, catalog gaps,
            and release timing
          </p>
          {forecast.data && (
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={
                  forecast.data.source === "awareness_layer"
                    ? "default"
                    : "secondary"
                }
                className="text-xs"
              >
                {forecast.data.source === "awareness_layer"
                  ? "🔴 Live Industry Feed"
                  : "📋 Cached Baseline"}
              </Badge>
              {forecast.data.confidence > 0 && (
                <span className="text-xs text-muted-foreground">
                  Confidence: {Math.round(forecast.data.confidence * 100)}%
                </span>
              )}
            </div>
          )}
        </div>

        <Tabs defaultValue="trends">
          <TabsList>
            <TabsTrigger value="trends">
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
              Trend Forecast
            </TabsTrigger>
            <TabsTrigger value="gaps">
              <Target className="w-3.5 h-3.5 mr-1.5" />
              Catalog Gaps
            </TabsTrigger>
            <TabsTrigger value="timing">
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              Release Timing
            </TabsTrigger>
          </TabsList>

          {/* ── Trend Forecast ── */}
          <TabsContent value="trends" className="mt-4 space-y-4">
            {forecast.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : forecast.data ? (
              <>
                {/* Trending Genres */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Music className="w-4 h-4 text-primary" />
                      Trending Genres
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {forecast.data.trendingGenres.map((g, i) => (
                        <Badge key={g} variant="outline" className="capitalize">
                          {i < 3 && (
                            <TrendingUp className="w-3 h-3 mr-1 text-green-400" />
                          )}
                          {g}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Rising BPM Ranges */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      Rising BPM Ranges
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {forecast.data.risingBpmRanges.map((r) => (
                      <div
                        key={r.label}
                        className="flex items-center justify-between"
                      >
                        <div>
                          <span className="text-sm font-medium">{r.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {r.bpmMin}–{r.bpmMax} BPM
                          </span>
                        </div>
                        {momentumBadge(r.momentum)}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Platform Signals */}
                {forecast.data.platformSignals.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-400" />
                        Platform Signals
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {forecast.data.platformSignals.map((s, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-medium uppercase text-muted-foreground">
                              {s.platform}
                            </span>
                            <p className="text-sm">{s.trend}</p>
                          </div>
                          {momentumBadge(s.strength)}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Trending Topics */}
                {forecast.data.trendingTopics.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Live Industry Topics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1">
                        {forecast.data.trendingTopics.slice(0, 6).map((t, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Trend data unavailable. Check your internet connection or
                  awareness layer status.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* ── Catalog Gaps ── */}
          <TabsContent value="gaps" className="mt-4 space-y-4">
            {gap.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : gap.data ? (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Total Beats</p>
                      <p className="text-xl font-bold">{gap.data.catalog.totalBeats}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Top Genre</p>
                      <p className="text-xl font-bold capitalize">{gap.data.catalog.topGenre}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Avg BPM</p>
                      <p className="text-xl font-bold">{gap.data.catalog.avgBpm || "–"}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Message */}
                <Alert className={gap.data.gaps.length > 0 ? "" : "border-green-500/30"}>
                  {gap.data.gaps.length > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  )}
                  <AlertDescription>{gap.data.message}</AlertDescription>
                </Alert>

                {/* Gap List */}
                {gap.data.gaps.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Opportunity Gaps</CardTitle>
                      <CardDescription className="text-xs">
                        Sorted by opportunity score — higher = more demand, fewer of
                        your beats
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {gap.data.gaps.map((g) => (
                        <div key={g.genre} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium capitalize">{g.genre}</span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{g.catalogCount} in catalog</span>
                              <Badge variant="outline" className="text-xs">
                                {g.opportunityScore}/100
                              </Badge>
                            </div>
                          </div>
                          <Progress value={g.opportunityScore} className="h-1.5" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Catalog Breakdown */}
                {gap.data.catalog.genreBreakdown.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Your Catalog by Genre</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {gap.data.catalog.genreBreakdown.map(({ genre, count }) => {
                        const pct = Math.round(
                          (count / gap.data.catalog.totalBeats) * 100,
                        );
                        return (
                          <div key={genre} className="space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span className="capitalize">{genre}</span>
                              <span className="text-muted-foreground">
                                {count} ({pct}%)
                              </span>
                            </div>
                            <Progress value={pct} className="h-1" />
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Could not compute catalog gap. Make sure you have published
                  beats.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* ── Release Timing ── */}
          <TabsContent value="timing" className="mt-4 space-y-4">
            {timing.isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : timing.data ? (
              <>
                {/* Main recommendation */}
                <Alert>
                  <Calendar className="h-4 w-4 text-primary" />
                  <AlertDescription className="font-medium">
                    {timing.data.recommendation}
                  </AlertDescription>
                </Alert>

                {/* Best Days */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      Best Days to Release
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {timing.data.bestDays.map((d) => (
                      <div key={d.day} className="space-y-0.5">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{d.day}</span>
                          <span className="text-muted-foreground text-xs">
                            {d.score}/100
                          </span>
                        </div>
                        <Progress value={d.score} className="h-1.5" />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Best Time Windows */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4 text-yellow-400" />
                      Optimal Time Windows
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {timing.data.bestTimeWindows.map((w) => (
                      <div key={w.window} className="flex items-start gap-3">
                        <div className="text-center min-w-[80px]">
                          <Progress value={w.score} className="h-1.5 mb-1" />
                          <span className="text-xs text-muted-foreground">
                            {w.score}/100
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{w.window}</p>
                          <p className="text-xs text-muted-foreground">
                            {w.reasoning}
                          </p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Audience Psychology */}
                {timing.data.audiencePsychologyInsights.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Audience Psychology</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {timing.data.audiencePsychologyInsights.map((p, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium">{p.trigger}</span>
                          <span className="text-muted-foreground"> — {p.pattern}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Release timing data unavailable.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
