import { useQuery } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { AlertCircle, Brain, Loader2, RefreshCw, Sparkles } from "lucide-react";

interface AnalyticsInsightResponse {
  status: "ready" | "insufficient_history";
  insight: string;
  method: { name: "observed_summary" };
  publicContext: { status: "ready" | "unavailable" };
  generatedAt: string;
  dataWindow: {
    start: string;
    end: string;
    dataPoints: number;
  };
}

function isAnalyticsInsight(value: unknown): value is AnalyticsInsightResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AnalyticsInsightResponse>;
  return ["ready", "insufficient_history"].includes(String(data.status)) &&
    typeof data.insight === "string" && data.insight.trim().length > 0 &&
    data.method?.name === "observed_summary" &&
    ["ready", "unavailable"].includes(String(data.publicContext?.status)) &&
    typeof data.generatedAt === "string" && Number.isFinite(Date.parse(data.generatedAt)) &&
    typeof data.dataWindow?.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.dataWindow.start) &&
    typeof data.dataWindow.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.dataWindow.end) &&
    Number.isInteger(data.dataWindow.dataPoints) && data.dataWindow.dataPoints >= 0;
}

async function generateAnalyticsInsight(): Promise<AnalyticsInsightResponse> {
  const csrfToken = getCsrfTokenFromCookie();
  const response = await fetch("/api/ai/analytics/insights", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body?.error || `AI analysis could not be generated (HTTP ${response.status}).`,
    );
  }
  if (!isAnalyticsInsight(body)) throw new Error("MaxCore returned an invalid analytics summary.");
  return body;
}

export default function AIDashboard() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const {
    data: insight,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["/api/ai/analytics/insights", user?.id],
    queryFn: generateAnalyticsInsight,
    enabled: !!user && !authLoading,
    retry: false,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading AI analytics…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AppLayout
      title="AI Analytics"
      subtitle="MaxCore statistics from your recorded performance data"
    >
      <div className="max-w-4xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold">
              <Brain className="h-8 w-8 text-primary" />
              AI Analytics Dashboard
            </h1>
            <p className="mt-1 text-muted-foreground">
              Measured summaries of your recorded analytics, computed by MaxCore.
            </p>
          </div>
          <Button onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Generate analysis
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Your performance summary
            </CardTitle>
            <CardDescription>
              Summaries use complete UTC days. Missing days remain unknown, and listener observations are not unique audience counts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isFetching ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  MaxCore is summarizing your recorded performance…
                </p>
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>AI analysis unavailable</AlertTitle>
                <AlertDescription>
                  {error instanceof Error ? error.message : "AI analysis could not be generated."}
                </AlertDescription>
              </Alert>
            ) : insight ? (
              <div className="space-y-5">
                {insight.status === "insufficient_history" && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>More recorded history is needed</AlertTitle>
                    <AlertDescription>Connect a source and sync completed reporting days to build your analysis history.</AlertDescription>
                  </Alert>
                )}
                <p className="whitespace-pre-wrap leading-7 text-foreground">
                  {insight.insight}
                </p>
                <p className="text-sm text-muted-foreground">
                  Observed statistics; this summary does not establish causes or guarantee future performance.
                  {insight.publicContext.status === "unavailable" && " Public trend context is currently unavailable."}
                </p>
                <div className="border-t pt-4 text-sm text-muted-foreground">
                  Based on {insight.dataWindow.dataPoints} observed reporting day
                  {insight.dataWindow.dataPoints === 1 ? "" : "s"}, beginning {insight.dataWindow.start}{" "}
                  and ending before {insight.dataWindow.end} (UTC). Generated{" "}
                  {new Date(insight.generatedAt).toLocaleString()}.
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Generate an analysis to see a MaxCore insight based on your analytics.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
