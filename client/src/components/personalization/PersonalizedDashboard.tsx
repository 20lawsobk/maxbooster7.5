// @ts-nocheck
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePersonalizedLayout,
  WidgetConfig,
} from "@/hooks/usePersonalizedLayout";
import { SmartActionBar } from "./SmartActionBar";
import { Music, DollarSign, TrendingUp, Users, Upload, Calendar, Trophy, Bell, Brain, Zap, BarChart3, MessageSquare, GripVertical } from "lucide-react";

interface PersonalizedDashboardProps {
  userId?: string;
  onNavigate?: (path: string) => void;
}

const widgetComponents: Record<
  string,
  React.FC<{ size: "small" | "medium" | "large" }>
> = {
  streams: StreamsWidget,
  revenue: RevenueWidget,
  "social-reach": SocialReachWidget,
  "next-release": NextReleaseWidget,
  "ai-coach": AICoachWidget,
  "quick-actions": QuickActionsWidget,
  "recent-activity": RecentActivityWidget,
  "analytics-chart": AnalyticsChartWidget,
  collaborations: CollaborationsWidget,
  notifications: NotificationsWidget,
  achievements: AchievementsWidget,
  goals: GoalsWidget,
};

export function PersonalizedDashboard({
  _userId,
  onNavigate,
}: PersonalizedDashboardProps) {
  const {
    
    isLoading,
    visibleWidgets,
  } = usePersonalizedLayout();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const sortedWidgets = visibleWidgets.sort((a, b) => a.position - b.position);
  const largeWidgets = sortedWidgets.filter((w) => w.size === "large");
  const mediumWidgets = sortedWidgets.filter((w) => w.size === "medium");
  const smallWidgets = sortedWidgets.filter((w) => w.size === "small");

  return (
    <div className="space-y-6">
      <SmartActionBar onNavigate={onNavigate} />

      {largeWidgets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {largeWidgets.map((widget) => {
            const WidgetComponent = widgetComponents[widget.id];
            return WidgetComponent ? (
              <WidgetWrapper key={widget.id} widget={widget}>
                <WidgetComponent size={widget.size} />
              </WidgetWrapper>
            ) : null;
          })}
        </div>
      )}

      {mediumWidgets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mediumWidgets.map((widget) => {
            const WidgetComponent = widgetComponents[widget.id];
            return WidgetComponent ? (
              <WidgetWrapper key={widget.id} widget={widget}>
                <WidgetComponent size={widget.size} />
              </WidgetWrapper>
            ) : null;
          })}
        </div>
      )}

      {smallWidgets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {smallWidgets.map((widget) => {
            const WidgetComponent = widgetComponents[widget.id];
            return WidgetComponent ? (
              <WidgetWrapper key={widget.id} widget={widget}>
                <WidgetComponent size={widget.size} />
              </WidgetWrapper>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

function WidgetWrapper({
  _widget,
  children,
}: {
  widget: WidgetConfig;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <Button variant="ghost" size="icon" className="h-6 w-6 bg-muted">
          <GripVertical className="h-3 w-3" />
        </Button>
      </div>
      {children}
    </div>
  );
}

function StreamsWidget({ size }: { size: "small" | "medium" | "large" }) {
  const { data: analytics } = useQuery({
    queryKey: ["/api/analytics/dashboard"],
    staleTime: 5 * 60 * 1000,
  });

  const streams = (analytics as Record<string, unknown>)?.totalStreams || 0;
  const growth = (analytics as Record<string, unknown>)?.streamGrowth || 0;

  return (
    <Card className={size === "small" ? "p-3" : ""}>
      <CardHeader className={size === "small" ? "p-2" : ""}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Music className="h-4 w-4 text-blue-500" />
          Total Streams
        </CardTitle>
      </CardHeader>
      <CardContent className={size === "small" ? "p-2 pt-0" : ""}>
        <div className="text-2xl font-bold">{streams.toLocaleString()}</div>
        <div
          className={`text-sm ${growth >= 0 ? "text-green-500" : "text-red-500"}`}
        >
          {growth >= 0 ? "+" : ""}
          {growth}% this month
        </div>
      </CardContent>
    </Card>
  );
}

function RevenueWidget({ size }: { size: "small" | "medium" | "large" }) {
  const { data: analytics } = useQuery({
    queryKey: ["/api/analytics/dashboard"],
    staleTime: 5 * 60 * 1000,
  });

  const revenue = (analytics as Record<string, unknown>)?.totalRevenue || 0;
  const growth = (analytics as Record<string, unknown>)?.revenueGrowth || 0;

  return (
    <Card className={size === "small" ? "p-3" : ""}>
      <CardHeader className={size === "small" ? "p-2" : ""}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-green-500" />
          Revenue
        </CardTitle>
      </CardHeader>
      <CardContent className={size === "small" ? "p-2 pt-0" : ""}>
        <div className="text-2xl font-bold">${revenue.toLocaleString()}</div>
        <div
          className={`text-sm ${growth >= 0 ? "text-green-500" : "text-red-500"}`}
        >
          {growth >= 0 ? "+" : ""}
          {growth}% this month
        </div>
      </CardContent>
    </Card>
  );
}

function SocialReachWidget({ size }: { size: "small" | "medium" | "large" }) {
  const { data: analytics } = useQuery({
    queryKey: ["/api/analytics/dashboard"],
    staleTime: 5 * 60 * 1000,
  });

  const reach = (analytics as Record<string, unknown>)?.socialReach || 0;
  const growth = (analytics as Record<string, unknown>)?.socialGrowth || 0;

  return (
    <Card className={size === "small" ? "p-3" : ""}>
      <CardHeader className={size === "small" ? "p-2" : ""}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-purple-500" />
          Social Reach
        </CardTitle>
      </CardHeader>
      <CardContent className={size === "small" ? "p-2 pt-0" : ""}>
        <div className="text-2xl font-bold">{reach.toLocaleString()}</div>
        <div
          className={`text-sm ${growth >= 0 ? "text-green-500" : "text-red-500"}`}
        >
          {growth >= 0 ? "+" : ""}
          {growth}% this month
        </div>
      </CardContent>
    </Card>
  );
}

function NextReleaseWidget({ size }: { size: "small" | "medium" | "large" }) {
  const { data: releases } = useQuery({
    queryKey: ["/api/releases/upcoming"],
    staleTime: 5 * 60 * 1000,
  });

  const nextRelease = (releases as Record<string, unknown>)?.[0];

  return (
    <Card className={size === "small" ? "p-3" : ""}>
      <CardHeader className={size === "small" ? "p-2" : ""}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-orange-500" />
          Next Release
        </CardTitle>
      </CardHeader>
      <CardContent className={size === "small" ? "p-2 pt-0" : ""}>
        {nextRelease ? (
          <>
            <div className="font-semibold truncate">{nextRelease.title}</div>
            <div className="text-sm text-muted-foreground">
              {new Date(nextRelease.releaseDate).toLocaleDateString()}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            No upcoming releases
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AICoachWidget({ _size }: { size: "small" | "medium" | "large" }) {
  const { data: insights } = useQuery({
    queryKey: ["/api/ai/insights"],
    staleTime: 10 * 60 * 1000,
  });

  const topInsight = (insights as Record<string, unknown>)
    ?.recommendations?.[0];

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-blue-600" />
          AI Career Coach
        </CardTitle>
      </CardHeader>
      <CardContent>
        {topInsight ? (
          <div className="space-y-3">
            <p className="text-sm">{topInsight.message}</p>
            <Button size="sm" variant="outline">
              Learn More
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your AI coach is analyzing your career trajectory...
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionsWidget({ _size }: { size: "small" | "medium" | "large" }) {
  const actions = [
    { label: "Upload Track", icon: Upload, path: "/studio" },
    { label: "View Analytics", icon: BarChart3, path: "/analytics" },
    { label: "Create Post", icon: MessageSquare, path: "/social" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-yellow-500" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button key={action.label} variant="outline" size="sm">
              <action.icon className="h-4 w-4 mr-1" />
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivityWidget({
  size,
}: {
  size: "small" | "medium" | "large";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-cyan-500" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>New follower</span>
            <span className="text-muted-foreground">2m ago</span>
          </div>
          <div className="flex justify-between">
            <span>Track streamed</span>
            <span className="text-muted-foreground">5m ago</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyticsChartWidget({
  size,
}: {
  size: "small" | "medium" | "large";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-indigo-500" />
          Analytics Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-32 flex items-center justify-center text-muted-foreground">
          Chart visualization
        </div>
      </CardContent>
    </Card>
  );
}

function CollaborationsWidget({
  size,
}: {
  size: "small" | "medium" | "large";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-pink-500" />
          Collaborations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          No active collaborations
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationsWidget({ _size }: { size: "small" | "medium" | "large" }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bell className="h-4 w-4 text-red-500" />
          Notifications
          <Badge variant="destructive" className="ml-auto">
            3
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm">3 unread notifications</div>
      </CardContent>
    </Card>
  );
}

function AchievementsWidget({ _size }: { size: "small" | "medium" | "large" }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Trophy className="h-4 w-4 text-amber-500" />
          Achievements
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">12</div>
        <div className="text-sm text-muted-foreground">badges earned</div>
      </CardContent>
    </Card>
  );
}

function GoalsWidget({ _size }: { size: "small" | "medium" | "large" }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          Goals
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm">10K streams goal</div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 w-3/4" />
          </div>
          <div className="text-xs text-muted-foreground">75% complete</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PersonalizedDashboard;
