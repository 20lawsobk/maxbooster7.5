import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Cloud,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  Check,
  X,
  Wifi,
  WifiOff,
  Save,
  GitBranch,
  Bell,
  BellOff,
  Eye,
  Edit3,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error';

export interface CollaboratorBrief {
  userId: string;
  displayName: string;
  avatar?: string;
  color: string;
  isTyping?: boolean;
  currentAction?: string;
}

export interface LiveEditingStatus {
  connectionStatus: ConnectionStatus;
  syncStatus: SyncStatus;
  syncProgress?: number;
  pendingChanges?: number;
  lastSyncedAt?: Date;
  hasConflict?: boolean;
  conflictCount?: number;
}

interface LiveEditingBannerProps {
  status: LiveEditingStatus;
  collaborators: CollaboratorBrief[];
  currentUserId?: string;
  accessLevel?: 'view' | 'edit' | 'comment';
  onReconnect?: () => Promise<void>;
  onSaveNow?: () => Promise<void>;
  onResolveConflicts?: () => void;
  onToggleNotifications?: (enabled: boolean) => void;
  notificationsEnabled?: boolean;
  compact?: boolean;
  className?: string;
}

export function LiveEditingBanner({
  status,
  collaborators,
  currentUserId,
  accessLevel = 'edit',
  onReconnect,
  onSaveNow,
  onResolveConflicts,
  onToggleNotifications,
  notificationsEnabled = true,
  compact = false,
  className,
}: LiveEditingBannerProps) {
  const { toast } = useToast();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  const otherCollaborators = collaborators.filter(c => c.userId !== currentUserId);
  const typingUsers = otherCollaborators.filter(c => c.isTyping);

  useEffect(() => {
    if (status.connectionStatus === 'disconnected' || status.connectionStatus === 'error') {
      toast({
        title: 'Connection Lost',
        description: (
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-red-400" />
            <span>You're working offline. Changes will sync when reconnected.</span>
          </div>
        ),
        variant: 'destructive',
      });
    } else if (status.connectionStatus === 'connected' && status.syncStatus === 'synced') {
      toast({
        title: 'Connected',
        description: (
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-green-400" />
            <span>All changes synced</span>
          </div>
        ),
      });
    }
  }, [status.connectionStatus, status.syncStatus]);

  const handleReconnect = useCallback(async () => {
    if (!onReconnect) return;

    setIsReconnecting(true);
    try {
      await onReconnect();
    } finally {
      setIsReconnecting(false);
    }
  }, [onReconnect]);

  const handleSaveNow = useCallback(async () => {
    if (!onSaveNow) return;

    setIsSaving(true);
    try {
      await onSaveNow();
      toast({
        title: 'Saved',
        description: (
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <span>All changes saved</span>
          </div>
        ),
      });
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: 'Failed to save changes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [onSaveNow, toast]);

  const getConnectionIcon = () => {
    switch (status.connectionStatus) {
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-400" />;
      case 'connecting':
        return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'disconnected':
        return <WifiOff className="w-4 h-4 text-amber-400" />;
      case 'error':
        return <WifiOff className="w-4 h-4 text-red-400" />;
    }
  };

  const getSyncIcon = () => {
    switch (status.syncStatus) {
      case 'synced':
        return <Cloud className="w-4 h-4 text-green-400" />;
      case 'syncing':
        return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'pending':
        return <CloudOff className="w-4 h-4 text-amber-400" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
    }
  };

  const getSyncText = () => {
    switch (status.syncStatus) {
      case 'synced':
        return 'All changes synced';
      case 'syncing':
        return status.syncProgress 
          ? `Syncing... ${status.syncProgress}%` 
          : 'Syncing...';
      case 'pending':
        return status.pendingChanges 
          ? `${status.pendingChanges} pending changes` 
          : 'Changes pending';
      case 'error':
        return 'Sync error';
    }
  };

  const getAccessIcon = () => {
    switch (accessLevel) {
      case 'view':
        return <Eye className="w-3 h-3" />;
      case 'edit':
        return <Edit3 className="w-3 h-3" />;
      case 'comment':
        return <MessageSquare className="w-3 h-3" />;
    }
  };

  const formatLastSynced = (date?: Date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!showBanner) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowBanner(true)}
        className={cn("fixed top-4 right-4 z-50", className)}
      >
        <Users className="w-4 h-4 mr-1" />
        {otherCollaborators.length + 1}
      </Button>
    );
  }

  if (compact) {
    return (
      <TooltipProvider>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-zinc-800",
            className
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                {getConnectionIcon()}
                {getSyncIcon()}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-800">
              <div className="text-xs">
                <p>Connection: {status.connectionStatus}</p>
                <p>Sync: {getSyncText()}</p>
                {status.lastSyncedAt && (
                  <p className="text-zinc-500">Last synced: {formatLastSynced(status.lastSyncedAt)}</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-zinc-700" />

          <div className="flex -space-x-1.5">
            {otherCollaborators.slice(0, 3).map((user) => (
              <Tooltip key={user.userId}>
                <TooltipTrigger asChild>
                  <Avatar className="w-5 h-5 border border-zinc-900">
                    <AvatarImage src={user.avatar} />
                    <AvatarFallback
                      style={{ backgroundColor: user.color }}
                      className="text-[8px]"
                    >
                      {(user.displayName || "?").charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-800">
                  <span>{user.displayName}</span>
                  {user.isTyping && <span className="text-blue-400 ml-1">typing...</span>}
                </TooltipContent>
              </Tooltip>
            ))}
            {otherCollaborators.length > 3 && (
              <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] border border-zinc-900">
                +{otherCollaborators.length - 3}
              </div>
            )}
          </div>

          {status.hasConflict && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-amber-400"
              onClick={onResolveConflicts}
            >
              <GitBranch className="w-3 h-3" />
            </Button>
          )}
        </motion.div>
      </TooltipProvider>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800",
        status.connectionStatus === 'error' && "bg-red-500/10 border-red-500/30",
        status.hasConflict && "bg-amber-500/10 border-amber-500/30",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {getConnectionIcon()}
          <span className="text-sm text-zinc-400 capitalize">
            {status.connectionStatus}
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-700" />

        <div className="flex items-center gap-2">
          {getSyncIcon()}
          <span className="text-sm text-zinc-400">
            {getSyncText()}
          </span>
          {status.syncStatus === 'syncing' && status.syncProgress !== undefined && (
            <Progress value={status.syncProgress} className="w-16 h-1" />
          )}
        </div>

        {status.lastSyncedAt && status.syncStatus !== 'syncing' && (
          <span className="text-xs text-zinc-500">
            Last saved: {formatLastSynced(status.lastSyncedAt)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {status.hasConflict && (
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-400 hover:text-amber-300"
            onClick={onResolveConflicts}
          >
            <GitBranch className="w-4 h-4 mr-1" />
            {status.conflictCount || 1} Conflict{(status.conflictCount || 1) > 1 ? 's' : ''}
          </Button>
        )}

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs capitalize">
            {getAccessIcon()}
            <span className="ml-1">{accessLevel}</span>
          </Badge>

          <TooltipProvider>
            <div className="flex items-center gap-1">
              <div className="flex -space-x-2">
                {otherCollaborators.slice(0, 4).map((user) => (
                  <Tooltip key={user.userId}>
                    <TooltipTrigger asChild>
                      <motion.div
                        animate={user.isTyping ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ duration: 0.5, repeat: user.isTyping ? Infinity : 0 }}
                      >
                        <Avatar className="w-7 h-7 border-2 border-zinc-900">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback
                            style={{ backgroundColor: user.color }}
                            className="text-[10px]"
                          >
                            {(user.displayName || "?").charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      </motion.div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-800">
                      <div>
                        <span className="font-medium">{user.displayName}</span>
                        {user.isTyping && (
                          <span className="text-blue-400 ml-2">typing...</span>
                        )}
                        {user.currentAction && (
                          <p className="text-xs text-zinc-500">{user.currentAction}</p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {otherCollaborators.length > 4 && (
                  <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs border-2 border-zinc-900">
                    +{otherCollaborators.length - 4}
                  </div>
                )}
              </div>

              <AnimatePresence>
                {typingUsers.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="flex items-center gap-1 text-xs text-blue-400 ml-2"
                  >
                    <motion.span
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      {typingUsers.length === 1
                        ? `${typingUsers[0].displayName} is typing...`
                        : `${typingUsers.length} people typing...`
                      }
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-1">
          {status.connectionStatus === 'disconnected' || status.connectionStatus === 'error' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReconnect}
              disabled={isReconnecting}
            >
              {isReconnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Reconnect
            </Button>
          ) : status.pendingChanges && status.pendingChanges > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveNow}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Now
            </Button>
          ) : null}

          {onToggleNotifications && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onToggleNotifications(!notificationsEnabled)}
            >
              {notificationsEnabled ? (
                <Bell className="w-4 h-4" />
              ) : (
                <BellOff className="w-4 h-4 text-zinc-500" />
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowBanner(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default LiveEditingBanner;
