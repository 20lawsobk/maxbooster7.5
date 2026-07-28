import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Shield, Share2, Activity, Eye, Clock, Link, Mail, UserPlus, UserMinus, Settings, FileText, AlertCircle } from "lucide-react";

export type WorkspaceOutcomeType =
  | "workspace_created"
  | "workspace_updated"
  | "workspace_deleted"
  | "member_invited"
  | "member_role_changed"
  | "member_removed"
  | "permission_granted"
  | "permission_denied"
  | "role_created"
  | "role_updated"
  | "role_deleted"
  | "custom_permissions_applied"
  | "presence_updated"
  | "cursor_synced"
  | "comment_added"
  | "comment_resolved"
  | "version_history_displayed"
  | "activity_logged"
  | "audit_export_generated"
  | "suspicious_activity_detected"
  | "project_shared"
  | "external_link_generated"
  | "share_revoked"
  | "invitation_accepted"
  | "invitation_expired";

export interface WorkspaceOutcome {
  type: WorkspaceOutcomeType;
  success: boolean;
  message: string;
  details?: {
    workspaceId?: string;
    workspaceName?: string;
    memberId?: string;
    memberEmail?: string;
    memberName?: string;
    previousRole?: string;
    newRole?: string;
    permission?: string;
    reason?: string;
    roleId?: string;
    roleName?: string;
    projectId?: string;
    shareLink?: string;
    expiresAt?: string;
    activityType?: string;
    userId?: string;
    timestamp?: string;
    ipAddress?: string;
  };
}

interface WorkspaceOutcomeHandlerProps {
  outcome: WorkspaceOutcome | null;
  onDismiss?: () => void;
}

const getOutcomeConfig = (outcome: WorkspaceOutcome) => {
  const configs: Record<
    WorkspaceOutcomeType,
    {
      icon: React.ElementType;
      title: string;
      variant: "default" | "destructive";
    }
  > = {
    workspace_created: {
      icon: CheckCircle,
      title: "Workspace Created",
      variant: "default",
    },
    workspace_updated: {
      icon: Settings,
      title: "Workspace Updated",
      variant: "default",
    },
    workspace_deleted: {
      icon: CheckCircle,
      title: "Workspace Deleted",
      variant: "default",
    },
    member_invited: {
      icon: Mail,
      title: "Invitation Sent",
      variant: "default",
    },
    member_role_changed: {
      icon: Shield,
      title: "Role Changed",
      variant: "default",
    },
    member_removed: {
      icon: UserMinus,
      title: "Member Removed",
      variant: "default",
    },
    permission_granted: {
      icon: Shield,
      title: "Permission Granted",
      variant: "default",
    },
    permission_denied: {
      icon: XCircle,
      title: "Permission Denied",
      variant: "destructive",
    },
    role_created: { icon: Shield, title: "Role Created", variant: "default" },
    role_updated: { icon: Shield, title: "Role Updated", variant: "default" },
    role_deleted: { icon: Shield, title: "Role Deleted", variant: "default" },
    custom_permissions_applied: {
      icon: Shield,
      title: "Permissions Applied",
      variant: "default",
    },
    presence_updated: {
      icon: Eye,
      title: "Presence Updated",
      variant: "default",
    },
    cursor_synced: {
      icon: Activity,
      title: "Cursor Synced",
      variant: "default",
    },
    comment_added: {
      icon: FileText,
      title: "Comment Added",
      variant: "default",
    },
    comment_resolved: {
      icon: CheckCircle,
      title: "Comment Resolved",
      variant: "default",
    },
    version_history_displayed: {
      icon: Clock,
      title: "Version History",
      variant: "default",
    },
    activity_logged: {
      icon: Activity,
      title: "Activity Logged",
      variant: "default",
    },
    audit_export_generated: {
      icon: FileText,
      title: "Audit Export Ready",
      variant: "default",
    },
    suspicious_activity_detected: {
      icon: AlertCircle,
      title: "Security Alert",
      variant: "destructive",
    },
    project_shared: {
      icon: Share2,
      title: "Project Shared",
      variant: "default",
    },
    external_link_generated: {
      icon: Link,
      title: "Share Link Created",
      variant: "default",
    },
    share_revoked: {
      icon: XCircle,
      title: "Share Revoked",
      variant: "default",
    },
    invitation_accepted: {
      icon: UserPlus,
      title: "Invitation Accepted",
      variant: "default",
    },
    invitation_expired: {
      icon: Clock,
      title: "Invitation Expired",
      variant: "destructive",
    },
  };
  return configs[outcome.type];
};

export function WorkspaceOutcomeHandler({
  outcome,
  onDismiss,
}: WorkspaceOutcomeHandlerProps) {
  const { toast } = useToast();

  useEffect(() => {
    if (!outcome) return;

    const config = getOutcomeConfig(outcome);

    let description = outcome.message;

    if (outcome.details) {
      switch (outcome.type) {
        case "member_invited":
          description = `Invitation sent to ${outcome.details.memberEmail}`;
          break;
        case "member_role_changed":
          description = `${outcome.details.memberName}'s role changed from ${outcome.details.previousRole} to ${outcome.details.newRole}`;
          break;
        case "member_removed":
          description = `${outcome.details.memberName} has been removed from the workspace`;
          break;
        case "permission_denied":
          description = `Access denied: ${outcome.details.reason || "Insufficient permissions"}`;
          break;
        case "external_link_generated":
          description = outcome.details.expiresAt
            ? `Share link created (expires ${new Date(outcome.details.expiresAt).toLocaleDateString()})`
            : "Share link created";
          break;
        case "suspicious_activity_detected":
          description = `Suspicious activity from ${outcome.details.ipAddress || "unknown IP"}`;
          break;
        case "audit_export_generated":
          description = "Your audit log export is ready for download";
          break;
      }
    }

    toast({
      title: config.title,
      description,
      variant: outcome.success ? config.variant : "destructive",
    });

    if (onDismiss) {
      onDismiss();
    }
  }, [outcome, toast, onDismiss]);

  return null;
}

export function useWorkspaceOutcome() {
  const [outcome, setOutcome] = useState<WorkspaceOutcome | null>(null);

  const triggerOutcome = useCallback((newOutcome: WorkspaceOutcome) => {
    setOutcome(newOutcome);
  }, []);

  const clearOutcome = useCallback(() => {
    setOutcome(null);
  }, []);

  const workspaceCreated = useCallback(
    (workspaceName: string, workspaceId: string) => {
      triggerOutcome({
        type: "workspace_created",
        success: true,
        message: `${workspaceName} has been created successfully`,
        details: { workspaceName, workspaceId },
      });
    },
    [triggerOutcome],
  );

  const workspaceUpdated = useCallback(
    (workspaceName: string) => {
      triggerOutcome({
        type: "workspace_updated",
        success: true,
        message: `${workspaceName} settings have been updated`,
        details: { workspaceName },
      });
    },
    [triggerOutcome],
  );

  const workspaceDeleted = useCallback(
    (workspaceName: string) => {
      triggerOutcome({
        type: "workspace_deleted",
        success: true,
        message: `${workspaceName} has been deleted`,
        details: { workspaceName },
      });
    },
    [triggerOutcome],
  );

  const memberInvited = useCallback(
    (email: string) => {
      triggerOutcome({
        type: "member_invited",
        success: true,
        message: `Invitation sent to ${email}`,
        details: { memberEmail: email },
      });
    },
    [triggerOutcome],
  );

  const memberRoleChanged = useCallback(
    (memberName: string, previousRole: string, newRole: string) => {
      triggerOutcome({
        type: "member_role_changed",
        success: true,
        message: `Role updated for ${memberName}`,
        details: { memberName, previousRole, newRole },
      });
    },
    [triggerOutcome],
  );

  const memberRemoved = useCallback(
    (memberName: string) => {
      triggerOutcome({
        type: "member_removed",
        success: true,
        message: `${memberName} has been removed`,
        details: { memberName },
      });
    },
    [triggerOutcome],
  );

  const permissionDenied = useCallback(
    (reason: string) => {
      triggerOutcome({
        type: "permission_denied",
        success: false,
        message: reason,
        details: { reason },
      });
    },
    [triggerOutcome],
  );

  const roleCreated = useCallback(
    (roleName: string) => {
      triggerOutcome({
        type: "role_created",
        success: true,
        message: `Role "${roleName}" has been created`,
        details: { roleName },
      });
    },
    [triggerOutcome],
  );

  const roleUpdated = useCallback(
    (roleName: string) => {
      triggerOutcome({
        type: "role_updated",
        success: true,
        message: `Role "${roleName}" has been updated`,
        details: { roleName },
      });
    },
    [triggerOutcome],
  );

  const roleDeleted = useCallback(
    (roleName: string) => {
      triggerOutcome({
        type: "role_deleted",
        success: true,
        message: `Role "${roleName}" has been deleted`,
        details: { roleName },
      });
    },
    [triggerOutcome],
  );

  const projectShared = useCallback(
    (projectId: string, memberCount: number) => {
      triggerOutcome({
        type: "project_shared",
        success: true,
        message: `Project shared with ${memberCount} member(s)`,
        details: { projectId },
      });
    },
    [triggerOutcome],
  );

  const externalLinkGenerated = useCallback(
    (shareLink: string, expiresAt?: string) => {
      triggerOutcome({
        type: "external_link_generated",
        success: true,
        message: "Share link created",
        details: { shareLink, expiresAt },
      });
    },
    [triggerOutcome],
  );

  const shareRevoked = useCallback(
    (projectId: string) => {
      triggerOutcome({
        type: "share_revoked",
        success: true,
        message: "Share access has been revoked",
        details: { projectId },
      });
    },
    [triggerOutcome],
  );

  const auditExportGenerated = useCallback(() => {
    triggerOutcome({
      type: "audit_export_generated",
      success: true,
      message: "Audit export is ready for download",
    });
  }, [triggerOutcome]);

  const suspiciousActivityDetected = useCallback(
    (ipAddress: string, activityType: string) => {
      triggerOutcome({
        type: "suspicious_activity_detected",
        success: false,
        message: `Suspicious activity detected`,
        details: { ipAddress, activityType },
      });
    },
    [triggerOutcome],
  );

  const commentAdded = useCallback(
    (projectId: string) => {
      triggerOutcome({
        type: "comment_added",
        success: true,
        message: "Comment added successfully",
        details: { projectId },
      });
    },
    [triggerOutcome],
  );

  const commentResolved = useCallback(
    (projectId: string) => {
      triggerOutcome({
        type: "comment_resolved",
        success: true,
        message: "Comment marked as resolved",
        details: { projectId },
      });
    },
    [triggerOutcome],
  );

  return {
    outcome,
    clearOutcome,
    workspaceCreated,
    workspaceUpdated,
    workspaceDeleted,
    memberInvited,
    memberRoleChanged,
    memberRemoved,
    permissionDenied,
    roleCreated,
    roleUpdated,
    roleDeleted,
    projectShared,
    externalLinkGenerated,
    shareRevoked,
    auditExportGenerated,
    suspiciousActivityDetected,
    commentAdded,
    commentResolved,
  };
}

export default WorkspaceOutcomeHandler;
