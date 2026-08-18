// @ts-nocheck
import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, UserPlus, UserMinus, Cloud, CloudOff, Check, AlertTriangle, Loader2, GitBranch, GitMerge, Save, RefreshCw, Lock, Unlock, Eye, Edit3, Crown, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: "owner" | "editor" | "viewer";
  status: "online" | "idle" | "offline";
  color: string;
  currentAction?: string;
  joinedAt: Date;
}

interface ConflictDetails {
  id: string;
  type: "track_edit" | "clip_move" | "settings_change" | "effect_modify";
  description: string;
  users: { id: string; name: string; version: string }[];
  timestamp: Date;
}

interface SyncState {
  status: "synced" | "syncing" | "offline" | "error";
  progress?: number;
  lastSyncedAt?: Date;
  pendingChanges?: number;
  error?: string;
}

interface CollaborationOutcome {
  id: string;
  type: "join" | "leave" | "sync" | "conflict" | "save" | "lock" | "unlock";
  message: string;
  user?: Collaborator;
  timestamp: Date;
  data?: Record<string, any>;
}

interface CollaborationOutcomesProps {
  projectId?: string;
  currentUserId?: string;
  collaborators: Collaborator[];
  syncState: SyncState;
  outcomes: CollaborationOutcome[];
  onResolveConflict?: (
    conflictId: string,
    resolution: "mine" | "theirs" | "merge",
  ) => Promise<void>;
  onSaveSession?: () => Promise<void>;
  onInvite?: (email: string, role: "editor" | "viewer") => Promise<void>;
  onRemoveCollaborator?: (userId: string) => Promise<void>;
  className?: string;
}


export function CollaborationOutcomes({
  _projectId,
  currentUserId,
  collaborators,
  syncState,
  outcomes,
  onResolveConflict,
  onSaveSession,
  _onInvite,
  _onRemoveCollaborator,
  className,
}: CollaborationOutcomesProps) {
  const { toast } = useToast();
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [activeConflict, setActiveConflict] = useState<ConflictDetails | null>(
    null,
  );
  const [isResolving, setIsResolving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notifications, setNotifications] = useState(true);

  const handleResolveConflict = useCallback(
    async (resolution: "mine" | "theirs" | "merge") => {
      if (!activeConflict || !onResolveConflict) return;

      setIsResolving(true);
      try {
        await onResolveConflict(activeConflict.id, resolution);

        toast({
          title: "Conflict Resolved",
          description: (
            <div className="flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-green-400" />
              <span>Changes have been merged successfully</span>
            </div>
          ),
        });

        setShowConflictDialog(false);
        setActiveConflict(null);
      } catch (error) {
        toast({
          title: "Resolution Failed",
          description: "Failed to resolve the conflict. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsResolving(false);
      }
    },
    [activeConflict, onResolveConflict, toast],
  );

  const handleSaveSession = useCallback(async () => {
    if (!onSaveSession) return;

    setIsSaving(true);
    try {
      await onSaveSession();

      toast({
        title: "Session Saved",
        description: (
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <span>All changes have been saved</span>
          </div>
        ),
      });
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save the session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [onSaveSession, toast]);

  const getSyncStatusIcon = () => {
    switch (syncState.status) {
      case "synced":
        return <Cloud className="w-4 h-4 text-green-400" />;
      case "syncing":
        return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
      case "offline":
        return <CloudOff className="w-4 h-4 text-yellow-400" />;
      case "error":
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
    }
  };

  const getSyncStatusText = () => {
    switch (syncState.status) {
      case "synced":
        return "All changes synced";
      case "syncing":
        return `Syncing${syncState.progress ? ` (${syncState.progress}%)` : "..."}`;
      case "offline":
        return "Working offline";
      case "error":
        return syncState.error || "Sync error";
    }
  };

  const getStatusColor = (status: Collaborator["status"]) => {
    switch (status) {
      case "online":
        return "bg-green-500";
      case "idle":
        return "bg-yellow-500";
      case "offline":
        return "bg-zinc-500";
    }
  };

  const getRoleIcon = (role: Collaborator["role"]) => {
    switch (role) {
      case "owner":
        return <Crown className="w-3 h-3 text-yellow-400" />;
      case "editor":
        return <Edit3 className="w-3 h-3 text-blue-400" />;
      case "viewer":
        return <Eye className="w-3 h-3 text-zinc-400" />;
    }
  };

  useEffect(() => {
    if (!notifications) return;

    const lastOutcome = outcomes[0];
    if (lastOutcome && Date.now() - lastOutcome.timestamp.getTime() < 5000) {
      if (
        lastOutcome.type === "join" &&
        lastOutcome.user?.id !== currentUserId
      ) {
        toast({
          title: "Collaborator Joined",
          description: (
            <div className="flex items-center gap-2">
              <Avatar className="w-6 h-6">
                <AvatarImage src={lastOutcome.user?.avatar} />
                <AvatarFallback
                  style={{ backgroundColor: lastOutcome.user?.color }}
                >
                  {lastOutcome.user?.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span>{lastOutcome.user?.name} has joined the session</span>
            </div>
          ),
        });
      } else if (lastOutcome.type === "conflict") {
        toast({
          title: "Conflict Detected",
          description: (
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-amber-400" />
              <span>{lastOutcome.message}</span>
            </div>
          ),
          variant: "destructive",
        });
      }
    }
  }, [outcomes, notifications, currentUserId, toast]);

  const onlineCollaborators = collaborators.filter(
    (c) => c.status === "online",
  );

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-violet-500/20 to-purple-500/20 rounded-lg">
            <Users className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="font-semibold">Collaboration</h2>
            <p className="text-xs text-zinc-500">
              {onlineCollaborators.length} online
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNotifications(!notifications)}
            className="h-8 w-8"
          >
            {notifications ? (
              <Bell className="w-4 h-4" />
            ) : (
              <BellOff className="w-4 h-4 text-zinc-500" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveSession}
            disabled={isSaving || syncState.status === "syncing"}
            className="gap-1"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getSyncStatusIcon()}
          <span className="text-xs text-zinc-400">{getSyncStatusText()}</span>
        </div>
        {syncState.pendingChanges && syncState.pendingChanges > 0 && (
          <Badge variant="secondary" className="text-xs">
            {syncState.pendingChanges} pending
          </Badge>
        )}
      </div>

      {syncState.status === "syncing" && syncState.progress !== undefined && (
        <div className="px-4 py-2 border-b border-zinc-800">
          <Progress value={syncState.progress} className="h-1" />
        </div>
      )}

      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-zinc-500 uppercase">
            Active Collaborators
          </h3>
          <div className="flex -space-x-2">
            {onlineCollaborators.slice(0, 4).map((collab) => (
              <Avatar
                key={collab.id}
                className="w-6 h-6 border-2 border-zinc-950"
              >
                <AvatarImage src={collab.avatar} />
                <AvatarFallback
                  style={{ backgroundColor: collab.color }}
                  className="text-[10px]"
                >
                  {collab.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ))}
            {onlineCollaborators.length > 4 && (
              <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] border-2 border-zinc-950">
                +{onlineCollaborators.length - 4}
              </div>
            )}
          </div>
        </div>

        <ScrollArea className="h-32">
          <div className="space-y-2">
            {collaborators.map((collab) => (
              <div
                key={collab.id}
                className="flex items-center gap-2 p-2 bg-zinc-900 rounded-lg"
              >
                <div className="relative">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={collab.avatar} />
                    <AvatarFallback style={{ backgroundColor: collab.color }}>
                      {collab.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-900",
                      getStatusColor(collab.status),
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium truncate">
                      {collab.name}
                      {collab.id === currentUserId && " (You)"}
                    </span>
                    {getRoleIcon(collab.role)}
                  </div>
                  {collab.currentAction && (
                    <p className="text-xs text-zinc-500 truncate">
                      {collab.currentAction}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="p-4">
          <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2">
            Activity
          </h3>
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {outcomes.length === 0 ? (
                <div className="text-center py-4 text-xs text-zinc-600">
                  No recent activity
                </div>
              ) : (
                outcomes.slice(0, 20).map((outcome) => (
                  <motion.div
                    key={outcome.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2 p-2 bg-zinc-900/50 rounded text-xs"
                  >
                    {outcome.type === "join" && (
                      <UserPlus className="w-3 h-3 text-green-400 mt-0.5" />
                    )}
                    {outcome.type === "leave" && (
                      <UserMinus className="w-3 h-3 text-red-400 mt-0.5" />
                    )}
                    {outcome.type === "sync" && (
                      <Cloud className="w-3 h-3 text-blue-400 mt-0.5" />
                    )}
                    {outcome.type === "conflict" && (
                      <GitBranch className="w-3 h-3 text-amber-400 mt-0.5" />
                    )}
                    {outcome.type === "save" && (
                      <Save className="w-3 h-3 text-green-400 mt-0.5" />
                    )}
                    {outcome.type === "lock" && (
                      <Lock className="w-3 h-3 text-purple-400 mt-0.5" />
                    )}
                    {outcome.type === "unlock" && (
                      <Unlock className="w-3 h-3 text-blue-400 mt-0.5" />
                    )}

                    <div className="flex-1">
                      <span className="text-zinc-300">{outcome.message}</span>
                      <span className="ml-2 text-zinc-600">
                        {outcome.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {outcome.type === "conflict" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px]"
                        onClick={() => {
                          setActiveConflict(outcome.data as ConflictDetails);
                          setShowConflictDialog(true);
                        }}
                      >
                        Resolve
                      </Button>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <GitBranch className="w-5 h-5" />
              Conflict Resolution Required
            </DialogTitle>
            <DialogDescription>{activeConflict?.description}</DialogDescription>
          </DialogHeader>

          {activeConflict && (
            <div className="py-4 space-y-4">
              <div className="p-3 bg-zinc-900 rounded-lg">
                <h4 className="text-sm font-medium mb-2">
                  Conflicting Changes
                </h4>
                {activeConflict.users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-zinc-300">{user.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {user.version}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => handleResolveConflict("mine")}
                  disabled={isResolving}
                  className="w-full justify-between"
                  variant="outline"
                >
                  <span>Keep My Changes</span>
                  <span className="text-xs text-zinc-500">Discard others</span>
                </Button>
                <Button
                  onClick={() => handleResolveConflict("theirs")}
                  disabled={isResolving}
                  className="w-full justify-between"
                  variant="outline"
                >
                  <span>Accept Their Changes</span>
                  <span className="text-xs text-zinc-500">Discard mine</span>
                </Button>
                <Button
                  onClick={() => handleResolveConflict("merge")}
                  disabled={isResolving}
                  className="w-full bg-amber-600 hover:bg-amber-700"
                >
                  {isResolving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <GitMerge className="w-4 h-4 mr-2" />
                  )}
                  Smart Merge
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConflictDialog(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CollaborationOutcomes;
