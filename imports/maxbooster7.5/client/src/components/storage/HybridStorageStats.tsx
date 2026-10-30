// @ts-nocheck
import { logger } from "@/lib/logger";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Cloud,
  Database,
  Zap,
  Archive,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  HardDrive,
} from "lucide-react";

interface TierBreakdown {
  hot: {
    count: number;
    sizeBytes: number;
    files: string[];
  };
  cold: {
    count: number;
    sizeBytes: number;
    compressedSize: number;
    compressionRatio: number;
    files: string[];
  };
}

interface DeduplicationStats {
  totalDuplicates: number;
  spaceSaved: number;
  savingsPercent: number;
  crossUserDuplicates: number;
}

interface Recommendation {
  type: "tier_down" | "tier_up" | "deduplicate" | "cleanup" | "compress";
  priority: "low" | "medium" | "high";
  message: string;
  potentialSavings?: number;
  affectedKeys?: string[];
}

interface StorageAnalytics {
  totalFiles: number;
  totalSizeBytes: number;
  physicalSizeBytes: number;
  tierBreakdown: TierBreakdown;
  deduplication: DeduplicationStats;
  overallCompressionRatio: number;
  costSavingsPercent: number;
  recommendations: Recommendation[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    default:
      return "outline";
  }
}

export function HybridStorageStats() {
  const [analytics, setAnalytics] = useState<StorageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/storage/hybrid/analytics");
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      logger.error("Failed to fetch storage analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const runAutoTiering = async () => {
    try {
      setOptimizing(true);
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch("/api/storage/hybrid/auto-tier", {
        method: "POST",
        credentials: "include",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (response.ok) {
        await fetchAnalytics();
      }
    } catch (error) {
      logger.error("Failed to run auto-tiering:", error);
    } finally {
      setOptimizing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Hybrid Storage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hybrid Storage</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Unable to load storage analytics
          </p>
        </CardContent>
      </Card>
    );
  }

  const hotPercent =
    analytics.totalFiles > 0
      ? (analytics.tierBreakdown.hot.count / analytics.totalFiles) * 100
      : 0;
  const coldPercent =
    analytics.totalFiles > 0
      ? (analytics.tierBreakdown.cold.count / analytics.totalFiles) * 100
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <HardDrive className="h-6 w-6" />
            Hybrid Storage Analytics
          </h2>
          <p className="text-muted-foreground">
            Intelligent tiering between Replit Object Storage and Pocket
            Dimension
          </p>
        </div>
        <Button
          onClick={runAutoTiering}
          disabled={optimizing}
          variant="outline"
        >
          {optimizing ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          Run Auto-Tiering
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Files</CardDescription>
            <CardTitle className="text-3xl">{analytics.totalFiles}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Logical: {formatBytes(analytics.totalSizeBytes)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Physical Storage</CardDescription>
            <CardTitle className="text-3xl">
              {formatBytes(analytics.physicalSizeBytes)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-600">
              {analytics.costSavingsPercent.toFixed(1)}% savings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Compression Ratio</CardDescription>
            <CardTitle className="text-3xl">
              {analytics.overallCompressionRatio.toFixed(2)}x
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Across cold tier</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deduplicated</CardDescription>
            <CardTitle className="text-3xl">
              {analytics.deduplication.totalDuplicates}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-600">
              {formatBytes(analytics.deduplication.spaceSaved)} saved
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tiers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tiers">Storage Tiers</TabsTrigger>
          <TabsTrigger value="dedup">Deduplication</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="tiers">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-blue-500" />
                  Hot Tier (Replit)
                </CardTitle>
                <CardDescription>Fast access for active files</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>{analytics.tierBreakdown.hot.count} files</span>
                  <span>
                    {formatBytes(analytics.tierBreakdown.hot.sizeBytes)}
                  </span>
                </div>
                <Progress value={hotPercent} className="bg-blue-100" />
                <div className="text-sm text-muted-foreground">
                  {hotPercent.toFixed(1)}% of total files
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Archive className="h-5 w-5 text-purple-500" />
                  Cold Tier (Pocket Dimension)
                </CardTitle>
                <CardDescription>
                  Compressed storage for archives
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>{analytics.tierBreakdown.cold.count} files</span>
                  <span>
                    {formatBytes(analytics.tierBreakdown.cold.sizeBytes)}
                  </span>
                </div>
                <Progress value={coldPercent} className="bg-purple-100" />
                <div className="text-sm text-muted-foreground">
                  Compressed to{" "}
                  {formatBytes(analytics.tierBreakdown.cold.compressedSize)}(
                  {analytics.tierBreakdown.cold.compressionRatio.toFixed(2)}x
                  ratio)
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dedup">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Deduplication Statistics
              </CardTitle>
              <CardDescription>
                Content-hash based deduplication across storage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Total Duplicates</p>
                  <p className="text-2xl font-bold">
                    {analytics.deduplication.totalDuplicates}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Space Saved</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatBytes(analytics.deduplication.spaceSaved)}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Cross-User Deduplication
                  </p>
                  <p className="text-2xl font-bold">
                    {analytics.deduplication.crossUserDuplicates}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Deduplication Efficiency</span>
                  <span>
                    {analytics.deduplication.savingsPercent.toFixed(1)}%
                  </span>
                </div>
                <Progress value={analytics.deduplication.savingsPercent} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5" />
                Optimization Recommendations
              </CardTitle>
              <CardDescription>
                Suggested actions to improve storage efficiency
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.recommendations.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span>Your storage is optimally configured!</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {analytics.recommendations.map((rec, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 border rounded-lg"
                    >
                      <AlertTriangle
                        className={`h-5 w-5 mt-0.5 ${
                          rec.priority === "high"
                            ? "text-red-500"
                            : rec.priority === "medium"
                              ? "text-yellow-500"
                              : "text-blue-500"
                        }`}
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              getPriorityColor(rec.priority) as Record<
                                string,
                                unknown
                              >
                            }
                          >
                            {rec.priority}
                          </Badge>
                          <Badge variant="outline">
                            {rec.type.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-sm">{rec.message}</p>
                        {rec.potentialSavings && (
                          <p className="text-sm text-green-600">
                            Potential savings:{" "}
                            {formatBytes(rec.potentialSavings)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default HybridStorageStats;
