import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow, format } from "date-fns";
import { Activity, UserPlus, UserMinus, Shield, Settings, FileText, Share2, Download, AlertTriangle, CheckCircle, XCircle, Clock, Filter, RefreshCw } from "lucide-react";

export type ActivityType =
  | "workspace.created"
  | "workspace.updated"
  | "workspace.deleted"
  | "member.invited"
  | "member.joined"
  | "member.removed"
  | "member.role_changed"
  | "role.created"
  | "role.updated"
  | "role.deleted"
  | "project.shared"
  | "project.unshared"
  | "share_link.created"
  | "share_link.revoked"
  | "invitation.sent"
  | "invitation.accepted"
  | "invitation.cancelled"
  | "audit.exported"
  | "security.alert"
  | "comment.added"
  | "comment.resolved";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  userId: string;
  userName: string;
  userAvatar?: string;
  timestamp: string;
  resourceType?: string;
  resourceId?: string;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onExportAudit?: () => void;
  canExport?: boolean;
}

const activityConfig: Record<
  ActivityType,
  { icon: React.ElementType; color: string; label: string }
> = {
  "workspace.created": {
    icon: CheckCircle,
    color: "text-green-500",
    label: "Workspace Created",
  },
  "workspace.updated": {
    icon: Settings,
    color: "text-blue-500",
    label: "Workspace Updated",
  },
  "workspace.deleted": {
    icon: XCircle,
    color: "text-red-500",
    label: "Workspace Deleted",
  },
  "member.invited": {
    icon: UserPlus,
    color: "text-blue-500",
    label: "Member Invited",
  },
  "member.joined": {
    icon: UserPlus,
    color: "text-green-500",
    label: "Member Joined",
  },
  "member.removed": {
    icon: UserMinus,
    color: "text-red-500",
    label: "Member Removed",
  },
  "member.role_changed": {
    icon: Shield,
    color: "text-purple-500",
    label: "Role Changed",
  },
  "role.created": {
    icon: Shield,
    color: "text-green-500",
    label: "Role Created",
  },
  "role.updated": {
    icon: Shield,
    color: "text-blue-500",
    label: "Role Updated",
  },
  "role.deleted": {
    icon: Shield,
    color: "text-red-500",
    label: "Role Deleted",
  },
  "project.shared": {
    icon: Share2,
    color: "text-blue-500",
    label: "Project Shared",
  },
  "project.unshared": {
    icon: Share2,
    color: "text-orange-500",
    label: "Share Revoked",
  },
  "share_link.created": {
    icon: Share2,
    color: "text-green-500",
    label: "Share Link Created",
  },
  "share_link.revoked": {
    icon: XCircle,
    color: "text-red-500",
    label: "Share Link Revoked",
  },
  "invitation.sent": {
    icon: UserPlus,
    color: "text-blue-500",
    label: "Invitation Sent",
  },
  "invitation.accepted": {
    icon: CheckCircle,
    color: "text-green-500",
    label: "Invitation Accepted",
  },
  "invitation.cancelled": {
    icon: XCircle,
    color: "text-orange-500",
    label: "Invitation Cancelled",
  },
  "audit.exported": {
    icon: Download,
    color: "text-blue-500",
    label: "Audit Exported",
  },
  "security.alert": {
    icon: AlertTriangle,
    color: "text-red-500",
    label: "Security Alert",
  },
  "comment.added": {
    icon: FileText,
    color: "text-blue-500",
    label: "Comment Added",
  },
  "comment.resolved": {
    icon: CheckCircle,
    color: "text-green-500",
    label: "Comment Resolved",
  },
};

function getActivityDescription(activity: ActivityItem): string {
  const { type, userName, previousValues, newValues, metadata } = activity;

  switch (type) {
    case "workspace.created":
      return `${userName} created the workspace`;
    case "workspace.updated":
      return `${userName} updated workspace settings`;
    case "workspace.deleted":
      return `${userName} deleted the workspace`;
    case "member.invited":
      return `${userName} invited ${newValues?.email || "a member"}`;
    case "member.joined":
      return `${userName} joined the workspace`;
    case "member.removed":
      return `${userName} removed ${previousValues?.userName || "a member"}`;
    case "member.role_changed":
      return `${userName} changed ${metadata?.memberName || "member"}'s role from ${previousValues?.role} to ${newValues?.role}`;
    case "role.created":
      return `${userName} created the "${newValues?.name}" role`;
    case "role.updated":
      return `${userName} updated the "${newValues?.name || previousValues?.name}" role`;
    case "role.deleted":
      return `${userName} deleted the "${previousValues?.name}" role`;
    case "project.shared":
      return `${userName} shared a project`;
    case "project.unshared":
      return `${userName} revoked project access`;
    case "share_link.created":
      return `${userName} created a share link`;
    case "share_link.revoked":
      return `${userName} revoked a share link`;
    case "invitation.sent":
      return `${userName} sent an invitation to ${newValues?.email}`;
    case "invitation.accepted":
      return `${userName} accepted the invitation`;
    case "invitation.cancelled":
      return `${userName} cancelled an invitation`;
    case "audit.exported":
      return `${userName} exported the audit log`;
    case "security.alert":
      return `Security alert: ${metadata?.reason || "Suspicious activity detected"}`;
    case "comment.added":
      return `${userName} added a comment`;
    case "comment.resolved":
      return `${userName} resolved a comment`;
    default:
      return `${userName} performed an action`;
  }
}

export function ActivityFeed({
  activities,
  isLoading = false,
  onRefresh,
  onExportAudit,
  canExport = false,
}: ActivityFeedProps) {
  const [filter, setFilter] = useState<string>("all");

  const filteredActivities = activities.filter((activity) => {
    if (filter === "all") return true;
    if (filter === "members") return activity.type.startsWith("member.");
    if (filter === "roles") return activity.type.startsWith("role.");
    if (filter === "sharing")
      return (
        activity.type.includes("share") || activity.type.includes("project.")
      );
    if (filter === "security") return activity.type === "security.alert";
    return true;
  });

  const groupActivitiesByDate = (items: ActivityItem[]) => {
    const groups: Record<string, ActivityItem[]> = {};
    items.forEach((item) => {
      const date = format(new Date(item.timestamp), "yyyy-MM-dd");
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return groups;
  };

  const groupedActivities = groupActivitiesByDate(filteredActivities);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Feed
            </CardTitle>
            <CardDescription>
              Track all workspace activities and changes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-32">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activity</SelectItem>
                <SelectItem value="members">Members</SelectItem>
                <SelectItem value="roles">Roles</SelectItem>
                <SelectItem value="sharing">Sharing</SelectItem>
                <SelectItem value="security">Security</SelectItem>
              </SelectContent>
            </Select>
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
            )}
            {canExport && onExportAudit && (
              <Button variant="outline" size="sm" onClick={onExportAudit}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {Object.keys(groupedActivities).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <Activity className="h-12 w-12 mb-3 opacity-50" />
              <p>No activity to display</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedActivities).map(([date, items]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {format(new Date(date), "MMMM d, yyyy")}
                    </span>
                  </div>
                  <div className="space-y-3 border-l-2 border-muted pl-4 ml-2">
                    {items.map((activity) => {
                      const config = activityConfig[activity.type];
                      const Icon = config?.icon || Activity;

                      return (
                        <div key={activity.id} className="relative">
                          <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-background border-2 border-muted" />
                          <div className="flex items-start gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={activity.userAvatar} />
                              <AvatarFallback className="text-xs">
                                {activity.userName.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Icon
                                  className={`h-4 w-4 ${config?.color || "text-muted-foreground"}`}
                                />
                                <span className="text-sm">
                                  {getActivityDescription(activity)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                <span>
                                  {formatDistanceToNow(
                                    new Date(activity.timestamp),
                                    { addSuffix: true },
                                  )}
                                </span>
                                {activity.ipAddress && (
                                  <>
                                    <span>•</span>
                                    <span>IP: {activity.ipAddress}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default ActivityFeed;
