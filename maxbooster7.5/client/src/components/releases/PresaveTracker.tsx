import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Share2,
  Eye,
  TrendingUp,
  ExternalLink,
  Copy,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AnalyticsData {
  totalPresaves: number;
  totalShares: number;
  totalPageViews: number;
  dailyData: Array<{
    date: string;
    presaves: number;
    shares: number;
    pageViews: number;
  }>;
}

interface PresaveTrackerProps {
  countdownId: string;
  presaveUrl?: string | null;
  analytics: AnalyticsData;
  isLoading?: boolean;
}

export function PresaveTracker({ countdownId, presaveUrl, analytics, isLoading }: PresaveTrackerProps) {
  const { toast } = useToast();

  const copyLink = () => {
    if (presaveUrl) {
      navigator.clipboard.writeText(presaveUrl);
      toast({
        title: "Link Copied",
        description: "Pre-save link copied to clipboard",
      });
    }
  };

  const stats = [
    {
      label: "Pre-saves",
      value: analytics.totalPresaves,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Shares",
      value: analytics.totalShares,
      icon: Share2,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      label: "Page Views",
      value: analytics.totalPageViews,
      icon: Eye,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  const conversionRate =
    analytics.totalPageViews > 0
      ? ((analytics.totalPresaves / analytics.totalPageViews) * 100).toFixed(1)
      : "0";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle>Pre-save Tracker</CardTitle>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
            {conversionRate}% conversion
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`p-4 rounded-lg ${stat.bgColor} text-center`}
            >
              <stat.icon className={`h-6 w-6 ${stat.color} mx-auto mb-2`} />
              <p className={`text-2xl font-bold ${stat.color}`}>
                {stat.value.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {presaveUrl ? (
          <div className="p-4 rounded-lg bg-muted/30 border border-border">
            <p className="text-sm text-muted-foreground mb-2">Pre-save Link</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-background px-3 py-2 rounded border truncate">
                {presaveUrl}
              </code>
              <Button variant="outline" size="icon" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={presaveUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/30 border border-dashed border-border text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No pre-save link configured yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a pre-save link to start tracking
            </p>
          </div>
        )}

        {analytics.dailyData.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Recent Activity</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {analytics.dailyData.slice(0, 7).map((day, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded bg-muted/20"
                >
                  <span className="text-sm text-muted-foreground">
                    {new Date(day.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-blue-500" />
                      {day.presaves}
                    </span>
                    <span className="flex items-center gap-1">
                      <Share2 className="h-3 w-3 text-purple-500" />
                      {day.shares}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3 text-orange-500" />
                      {day.pageViews}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PresaveTracker;
