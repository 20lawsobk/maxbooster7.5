// @ts-nocheck
/**
 * Loop Health Score Widget
 *
 * Renders the Beat Money Loop's 0–100 health score on the main dashboard.
 * Visible to admin users only — hides gracefully for non-admins.
 *
 * Score dimensions:
 *   Success Rate (40 pts) · Revenue Momentum (25 pts) ·
 *   Catalog Freshness (20 pts) · Payout Velocity (15 pts)
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";

interface Dimension {
  score: number;
  max: number;
  signal: number;
  label: string;
}

interface DraggingFactor {
  dimension: string;
  message: string;
  fix: string;
  fixAction: string;
}

interface HealthScoreData {
  score: number;
  grade: string;
  enabled: boolean;
  dimensions: {
    successRate: Dimension;
    revenueMomentum: Dimension;
    catalogFreshness: Dimension;
    payoutVelocity: Dimension;
  };
  draggingFactors: DraggingFactor[];
  snapshot: {
    totalCycles: number;
    successfulCycles: number;
    totalRevenueCents: number;
    last7RevenueCents: number;
    prev7RevenueCents: number;
    last7Successful: number;
    totalPlays: number;
    totalDownloads: number;
  };
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A":
      return "text-green-500";
    case "B":
      return "text-emerald-400";
    case "C":
      return "text-yellow-400";
    case "D":
      return "text-orange-400";
    default:
      return "text-red-500";
  }
}

function scoreRingColor(score: number): string {
  if (score >= 85) return "stroke-green-500";
  if (score >= 70) return "stroke-emerald-400";
  if (score >= 50) return "stroke-yellow-400";
  if (score >= 30) return "stroke-orange-400";
  return "stroke-red-500";
}

function ScoreRing({
  score,
  grade,
}: {
  score: number;
  grade: string;
}) {
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-muted/30" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className={`transition-all duration-700 ${scoreRingColor(score)}`}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-2xl font-bold leading-none">{score}</span>
        <span className={`text-lg font-bold leading-none ${gradeColor(grade)}`}>
          {grade}
        </span>
      </div>
    </div>
  );
}

export function LoopHealthScore() {
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<HealthScoreData>({
    queryKey: ["beat-money-loop-health-score"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/beat-money-loop/health-score").then((r) =>
        r.json(),
      ),
    refetchInterval: 60_000,
    retry: false,
  });

  // Non-admin: endpoint returns 403 → isError true → hide widget
  if (isError) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="flex gap-4">
          <Skeleton className="w-28 h-28 rounded-full" />
          <div className="flex-1 space-y-2 pt-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
            <Skeleton className="h-3 w-3/6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const dims = [
    data.dimensions.successRate,
    data.dimensions.revenueMomentum,
    data.dimensions.catalogFreshness,
    data.dimensions.payoutVelocity,
  ];

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="w-4 h-4 text-primary" />
            Beat Money Loop Health
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant={data.enabled ? "default" : "secondary"}
              className="text-xs"
            >
              {data.enabled ? "Running" : "Paused"}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={() => navigate("/admin/beat-money-loop")}
            >
              Manage
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex gap-5 items-start">
          {/* Ring */}
          <ScoreRing score={data.score} grade={data.grade} />

          {/* Dimension bars */}
          <div className="flex-1 space-y-2.5 pt-1">
            {dims.map((d) => (
              <div key={d.label} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-medium">
                    {d.score}/{d.max}
                  </span>
                </div>
                <Progress
                  value={(d.score / d.max) * 100}
                  className="h-1.5"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Dragging factors */}
        {data.draggingFactors.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              What's dragging the score
            </p>
            {data.draggingFactors.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{f.dimension}</p>
                  <p className="text-xs text-muted-foreground">{f.message}</p>
                  <p className="text-xs text-primary mt-0.5">{f.fix}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {data.draggingFactors.length === 0 && data.score >= 70 && (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2">
            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <p className="text-xs text-green-500 font-medium">
              Loop is operating at peak efficiency
            </p>
          </div>
        )}

        {/* Snapshot */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-muted/40 py-1.5 px-2">
            <p className="text-xs text-muted-foreground">Total Cycles</p>
            <p className="text-sm font-semibold">{data.snapshot.totalCycles}</p>
          </div>
          <div className="rounded-md bg-muted/40 py-1.5 px-2">
            <p className="text-xs text-muted-foreground">7-Day Revenue</p>
            <p className="text-sm font-semibold">
              ${(data.snapshot.last7RevenueCents / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-md bg-muted/40 py-1.5 px-2">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-sm font-semibold">
              ${(data.snapshot.totalRevenueCents / 100).toFixed(2)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
