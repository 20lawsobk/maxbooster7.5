import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Circle,
  Clock,
  Moon,
  WifiOff,
  Crown,
  Edit3,
  Eye,
  MessageSquare,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export type UserStatus = 'online' | 'idle' | 'away' | 'offline';
export type UserRole = 'owner' | 'editor' | 'viewer' | 'commenter';

export type PresenceOutcomeType =
  | 'user_joined_session'
  | 'user_left_session'
  | 'user_cursor_position_updated'
  | 'user_selection_highlighted'
  | 'user_is_typing'
  | 'user_went_idle';

export interface PresenceUser {
  userId: string;
  displayName: string;
  email?: string;
  avatar?: string;
  status: UserStatus;
  role: UserRole;
  color: string;
  isTyping?: boolean;
  currentAction?: string;
  lastActive: Date;
  joinedAt?: Date;
}

export interface PresenceOutcome {
  type: PresenceOutcomeType;
  userId: string;
  displayName: string;
  timestamp: Date;
}

interface UserPresenceIndicatorProps {
  users: PresenceUser[];
  currentUserId?: string;
  maxVisible?: number;
  showLabels?: boolean;
  compact?: boolean;
  onUserClick?: (user: PresenceUser) => void;
  onOutcome?: (outcome: PresenceOutcome) => void;
  className?: string;
}

const STATUS_CONFIG: Record<UserStatus, { color: string; icon: typeof Circle; label: string }> = {
  online: { color: 'bg-green-500', icon: Circle, label: 'Online' },
  idle: { color: 'bg-yellow-500', icon: Clock, label: 'Idle' },
  away: { color: 'bg-orange-500', icon: Moon, label: 'Away' },
  offline: { color: 'bg-zinc-500', icon: WifiOff, label: 'Offline' },
};

const ROLE_CONFIG: Record<UserRole, { icon: typeof Crown; label: string; color: string }> = {
  owner: { icon: Crown, label: 'Owner', color: 'text-yellow-400' },
  editor: { icon: Edit3, label: 'Editor', color: 'text-blue-400' },
  viewer: { icon: Eye, label: 'Viewer', color: 'text-zinc-400' },
  commenter: { icon: MessageSquare, label: 'Commenter', color: 'text-purple-400' },
};

export function UserPresenceIndicator({
  users,
  currentUserId,
  maxVisible = 5,
  showLabels = false,
  compact = false,
  onUserClick,
  onOutcome,
  className,
}: UserPresenceIndicatorProps) {
  const { toast } = useToast();
  const [expandedView, setExpandedView] = useState(false);
  const [previousUsers, setPreviousUsers] = useState<string[]>([]);

  useEffect(() => {
    const currentUserIds = users.map(u => u.userId);
    
    const joinedUsers = users.filter(u => !previousUsers.includes(u.userId));
    const leftUserIds = previousUsers.filter(id => !currentUserIds.includes(id));

    joinedUsers.forEach(user => {
      if (user.userId !== currentUserId) {
        onOutcome?.({
          type: 'user_joined_session',
          userId: user.userId,
          displayName: user.displayName,
          timestamp: new Date(),
        });

        toast({
          title: 'User Joined',
          description: (
            <div className="flex items-center gap-2">
              <Avatar className="w-5 h-5">
                <AvatarImage src={user.avatar} />
                <AvatarFallback style={{ backgroundColor: user.color }} className="text-[10px]">
                  {(user.displayName || "?").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span>{user.displayName} joined the session</span>
            </div>
          ),
        });
      }
    });

    leftUserIds.forEach(userId => {
      onOutcome?.({
        type: 'user_left_session',
        userId,
        displayName: 'User',
        timestamp: new Date(),
      });
    });

    setPreviousUsers(currentUserIds);
  }, [users, currentUserId, previousUsers, onOutcome, toast]);

  const onlineUsers = users.filter(u => u.status !== 'offline');
  const visibleUsers = onlineUsers.slice(0, maxVisible);
  const hiddenCount = onlineUsers.length - maxVisible;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatLastActive = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn("flex items-center", className)}>
          <div className="flex -space-x-2">
            {visibleUsers.map((user) => (
              <Tooltip key={user.userId}>
                <TooltipTrigger asChild>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="relative cursor-pointer"
                    onClick={() => onUserClick?.(user)}
                  >
                    <Avatar className="w-7 h-7 border-2 border-zinc-950">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback
                        style={{ backgroundColor: user.color }}
                        className="text-[10px] font-medium"
                      >
                        {getInitials(user.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        "absolute bottom-0 right-0 w-2 h-2 rounded-full border border-zinc-950",
                        STATUS_CONFIG[user.status].color
                      )}
                    />
                    {user.isTyping && (
                      <motion.div
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center"
                      >
                        <span className="text-[6px]">...</span>
                      </motion.div>
                    )}
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{user.displayName}</span>
                    {user.userId === currentUserId && (
                      <Badge variant="secondary" className="text-[10px]">You</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-400">
                    {React.createElement(ROLE_CONFIG[user.role].icon, {
                      className: cn("w-3 h-3", ROLE_CONFIG[user.role].color)
                    })}
                    {ROLE_CONFIG[user.role].label}
                  </div>
                  {user.currentAction && (
                    <p className="text-xs text-zinc-500 mt-1">{user.currentAction}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
            {hiddenCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium border-2 border-zinc-950 cursor-pointer">
                    +{hiddenCount}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-800">
                  {hiddenCount} more user{hiddenCount > 1 ? 's' : ''} online
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn("bg-zinc-950 rounded-lg border border-zinc-800", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium">Active Users</span>
          <Badge variant="secondary" className="text-xs">
            {onlineUsers.length} online
          </Badge>
        </div>
        {users.length > maxVisible && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandedView(!expandedView)}
            className="text-xs"
          >
            {expandedView ? 'Show Less' : 'Show All'}
          </Button>
        )}
      </div>

      <ScrollArea className={cn(expandedView ? 'h-64' : 'h-auto max-h-48')}>
        <div className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {(expandedView ? users : visibleUsers).map((user) => {
              const StatusIcon = STATUS_CONFIG[user.status].icon;
              const RoleIcon = ROLE_CONFIG[user.role].icon;

              return (
                <motion.div
                  key={user.userId}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-900 cursor-pointer transition-colors",
                    user.userId === currentUserId && "bg-zinc-900/50"
                  )}
                  onClick={() => onUserClick?.(user)}
                >
                  <div className="relative">
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback
                        style={{ backgroundColor: user.color }}
                        className="text-xs font-medium"
                      >
                        {getInitials(user.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-950",
                        STATUS_CONFIG[user.status].color
                      )}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {user.displayName}
                      </span>
                      {user.userId === currentUserId && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">You</Badge>
                      )}
                      <RoleIcon className={cn("w-3 h-3", ROLE_CONFIG[user.role].color)} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      {user.isTyping ? (
                        <motion.span
                          animate={{ opacity: [1, 0.5, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="text-blue-400"
                        >
                          Typing...
                        </motion.span>
                      ) : user.currentAction ? (
                        <span className="truncate">{user.currentAction}</span>
                      ) : (
                        <span>{formatLastActive(user.lastActive)}</span>
                      )}
                    </div>
                  </div>

                  {showLabels && (
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px]", ROLE_CONFIG[user.role].color)}
                    >
                      {ROLE_CONFIG[user.role].label}
                    </Badge>
                  )}

                  {user.userId !== currentUserId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                        <DropdownMenuItem>View Profile</DropdownMenuItem>
                        <DropdownMenuItem>Send Message</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Follow Cursor</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {!expandedView && hiddenCount > 0 && (
            <Button
              variant="ghost"
              className="w-full text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => setExpandedView(true)}
            >
              +{hiddenCount} more user{hiddenCount > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

import React from 'react';

export default UserPresenceIndicator;
