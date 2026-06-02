import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Eye,
  Edit3,
  MessageSquare,
  Check,
  X,
  Clock,
  ArrowUp,
  ArrowDown,
  Ban,
  Send,
  Loader2,
  AlertTriangle,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export type AccessLevel = "view" | "edit" | "comment";

export type AccessOutcomeType =
  | "view_only_access_granted"
  | "edit_access_granted"
  | "comment_access_granted"
  | "access_upgraded"
  | "access_downgraded"
  | "access_revoked"
  | "access_request_submitted"
  | "access_request_approved"
  | "access_request_denied";

export interface AccessRequest {
  id: string;
  projectId: string;
  projectName?: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requesterAvatar?: string;
  requestedAccess: AccessLevel;
  currentAccess?: AccessLevel;
  message?: string;
  status: "pending" | "approved" | "denied";
  createdAt: Date;
  respondedBy?: string;
  respondedAt?: Date;
  responseMessage?: string;
}

interface AccessRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "request" | "manage";
  projectId: string;
  projectName?: string;
  currentAccess?: AccessLevel;
  pendingRequests?: AccessRequest[];
  onSubmitRequest?: (
    accessLevel: AccessLevel,
    message?: string,
  ) => Promise<void>;
  onApprove?: (requestId: string, accessLevel: AccessLevel) => Promise<void>;
  onDeny?: (requestId: string, reason?: string) => Promise<void>;
  onUpgrade?: (userId: string, newLevel: AccessLevel) => Promise<void>;
  onDowngrade?: (userId: string, newLevel: AccessLevel) => Promise<void>;
  onRevoke?: (userId: string) => Promise<void>;
  onOutcome?: (type: AccessOutcomeType, details?: Record<string, any>) => void;
  className?: string;
}

const ACCESS_LEVELS: {
  value: AccessLevel;
  label: string;
  icon: typeof Eye;
  description: string;
}[] = [
  {
    value: "view",
    label: "View Only",
    icon: Eye,
    description: "Can view the project but cannot make changes",
  },
  {
    value: "comment",
    label: "Comment",
    icon: MessageSquare,
    description: "Can view and leave comments on the project",
  },
  {
    value: "edit",
    label: "Edit",
    icon: Edit3,
    description: "Can make changes to the project",
  },
];

export function AccessRequestDialog({
  open,
  onOpenChange,
  mode,
  projectId,
  projectName,
  currentAccess,
  pendingRequests = [],
  onSubmitRequest,
  onApprove,
  onDeny,
  onUpgrade,
  onDowngrade,
  onRevoke,
  onOutcome,
  className,
}: AccessRequestDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAccess, setSelectedAccess] = useState<AccessLevel>("view");
  const [requestMessage, setRequestMessage] = useState("");
  const [denyReason, setDenyReason] = useState("");
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(
    null,
  );

  const handleSubmitRequest = useCallback(async () => {
    if (!onSubmitRequest) return;

    setIsSubmitting(true);
    try {
      await onSubmitRequest(selectedAccess, requestMessage || undefined);

      toast({
        title: "Request Submitted",
        description: (
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-400" />
            <span>Your access request has been sent for approval</span>
          </div>
        ),
      });

      onOutcome?.("access_request_submitted", {
        projectId,
        requestedAccess: selectedAccess,
      });

      onOpenChange(false);
      setRequestMessage("");
    } catch (error) {
      toast({
        title: "Request Failed",
        description: "Failed to submit access request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    onSubmitRequest,
    selectedAccess,
    requestMessage,
    projectId,
    onOutcome,
    onOpenChange,
    toast,
  ]);

  const handleApprove = useCallback(
    async (request: AccessRequest) => {
      if (!onApprove) return;

      setProcessingRequestId(request.id);
      try {
        await onApprove(request.id, request.requestedAccess);

        const outcomeType =
          request.requestedAccess === "view"
            ? "view_only_access_granted"
            : request.requestedAccess === "edit"
              ? "edit_access_granted"
              : "comment_access_granted";

        toast({
          title: "Access Approved",
          description: (
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              <span>
                {request.requesterName} now has {request.requestedAccess} access
              </span>
            </div>
          ),
        });

        onOutcome?.(outcomeType as AccessOutcomeType, {
          userId: request.requesterId,
          accessLevel: request.requestedAccess,
        });
        onOutcome?.("access_request_approved", {
          requestId: request.id,
          userId: request.requesterId,
        });
      } catch (error) {
        toast({
          title: "Approval Failed",
          description: "Failed to approve request. Please try again.",
          variant: "destructive",
        });
      } finally {
        setProcessingRequestId(null);
      }
    },
    [onApprove, onOutcome, toast],
  );

  const handleDeny = useCallback(
    async (request: AccessRequest) => {
      if (!onDeny) return;

      setProcessingRequestId(request.id);
      try {
        await onDeny(request.id, denyReason || undefined);

        toast({
          title: "Request Denied",
          description: `${request.requesterName}'s request has been denied`,
        });

        onOutcome?.("access_request_denied", {
          requestId: request.id,
          userId: request.requesterId,
          reason: denyReason,
        });

        setDenyReason("");
      } catch (error) {
        toast({
          title: "Action Failed",
          description: "Failed to deny request. Please try again.",
          variant: "destructive",
        });
      } finally {
        setProcessingRequestId(null);
      }
    },
    [onDeny, denyReason, onOutcome, toast],
  );

  const handleUpgrade = useCallback(
    async (userId: string, userName: string, newLevel: AccessLevel) => {
      if (!onUpgrade) return;

      setIsSubmitting(true);
      try {
        await onUpgrade(userId, newLevel);

        toast({
          title: "Access Upgraded",
          description: (
            <div className="flex items-center gap-2">
              <ArrowUp className="w-4 h-4 text-green-400" />
              <span>
                {userName}'s access upgraded to {newLevel}
              </span>
            </div>
          ),
        });

        onOutcome?.("access_upgraded", { userId, newLevel });
      } catch (error) {
        toast({
          title: "Upgrade Failed",
          description: "Failed to upgrade access. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [onUpgrade, onOutcome, toast],
  );

  const handleDowngrade = useCallback(
    async (userId: string, userName: string, newLevel: AccessLevel) => {
      if (!onDowngrade) return;

      setIsSubmitting(true);
      try {
        await onDowngrade(userId, newLevel);

        toast({
          title: "Access Downgraded",
          description: (
            <div className="flex items-center gap-2">
              <ArrowDown className="w-4 h-4 text-amber-400" />
              <span>
                {userName}'s access downgraded to {newLevel}
              </span>
            </div>
          ),
        });

        onOutcome?.("access_downgraded", { userId, newLevel });
      } catch (error) {
        toast({
          title: "Downgrade Failed",
          description: "Failed to downgrade access. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [onDowngrade, onOutcome, toast],
  );

  const handleRevoke = useCallback(
    async (userId: string, userName: string) => {
      if (!onRevoke) return;

      setIsSubmitting(true);
      try {
        await onRevoke(userId);

        toast({
          title: "Access Revoked",
          description: (
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-red-400" />
              <span>{userName}'s access has been revoked</span>
            </div>
          ),
        });

        onOutcome?.("access_revoked", { userId });
      } catch (error) {
        toast({
          title: "Revoke Failed",
          description: "Failed to revoke access. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [onRevoke, onOutcome, toast],
  );

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-lg bg-zinc-950 border-zinc-800", className)}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-violet-400" />
            {mode === "request" ? "Request Access" : "Manage Access Requests"}
          </DialogTitle>
          {projectName && (
            <DialogDescription>
              {mode === "request"
                ? `Request access to "${projectName}"`
                : `Pending access requests for "${projectName}"`}
            </DialogDescription>
          )}
        </DialogHeader>

        {mode === "request" ? (
          <div className="space-y-6">
            {currentAccess && (
              <div className="p-3 bg-zinc-900 rounded-lg">
                <p className="text-xs text-zinc-500 mb-1">
                  Current Access Level
                </p>
                <div className="flex items-center gap-2">
                  {ACCESS_LEVELS.find((l) => l.value === currentAccess)
                    ?.icon && (
                    <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center">
                      {React.createElement(
                        ACCESS_LEVELS.find((l) => l.value === currentAccess)!
                          .icon,
                        { className: "w-4 h-4 text-zinc-400" },
                      )}
                    </div>
                  )}
                  <span className="text-sm font-medium capitalize">
                    {currentAccess}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label>Requested Access Level</Label>
              <RadioGroup
                value={selectedAccess}
                onValueChange={(v) => setSelectedAccess(v as AccessLevel)}
                className="space-y-2"
              >
                {ACCESS_LEVELS.map((level) => {
                  const Icon = level.icon;
                  const isCurrentLevel = level.value === currentAccess;
                  const isDowngrade =
                    currentAccess === "edit" &&
                    (level.value === "view" || level.value === "comment");

                  return (
                    <div
                      key={level.value}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                        selectedAccess === level.value
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-zinc-800 hover:border-zinc-700",
                        isCurrentLevel && "opacity-50 cursor-not-allowed",
                      )}
                      onClick={() =>
                        !isCurrentLevel && setSelectedAccess(level.value)
                      }
                    >
                      <RadioGroupItem
                        value={level.value}
                        id={level.value}
                        disabled={isCurrentLevel}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-zinc-400" />
                          <Label
                            htmlFor={level.value}
                            className={cn(
                              "cursor-pointer",
                              isCurrentLevel && "cursor-not-allowed",
                            )}
                          >
                            {level.label}
                          </Label>
                          {isCurrentLevel && (
                            <Badge variant="secondary" className="text-[10px]">
                              Current
                            </Badge>
                          )}
                          {isDowngrade && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-400 border-amber-400/30"
                            >
                              Downgrade
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                          {level.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message (optional)</Label>
              <Textarea
                id="message"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="Explain why you need access..."
                className="min-h-[80px] bg-zinc-900 border-zinc-700 resize-none"
              />
            </div>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="space-y-3">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No pending requests</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {pendingRequests.map((request) => {
                    const isProcessing = processingRequestId === request.id;
                    const RequestIcon =
                      ACCESS_LEVELS.find(
                        (l) => l.value === request.requestedAccess,
                      )?.icon || Eye;

                    return (
                      <motion.div
                        key={request.id}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="p-3 bg-zinc-900 rounded-lg"
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={request.requesterAvatar} />
                            <AvatarFallback>
                              {(request.requesterName || "?").charAt(0)}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-medium">
                                  {request.requesterName}
                                </span>
                                <p className="text-xs text-zinc-500">
                                  {request.requesterEmail}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-zinc-500">
                                <Clock className="w-3 h-3" />
                                {formatTime(request.createdAt)}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                <RequestIcon className="w-3 h-3 mr-1" />
                                Requesting {request.requestedAccess} access
                              </Badge>
                            </div>

                            {request.message && (
                              <p className="text-sm text-zinc-400 mt-2 italic">
                                "{request.message}"
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-3">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(request)}
                                disabled={isProcessing}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="w-4 h-4 mr-1" />
                                    Approve
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeny(request)}
                                disabled={isProcessing}
                                className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                              >
                                <X className="w-4 h-4 mr-1" />
                                Deny
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === "request" && (
            <Button
              onClick={handleSubmitRequest}
              disabled={isSubmitting || selectedAccess === currentAccess}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Submit Request
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React from "react";

export default AccessRequestDialog;
