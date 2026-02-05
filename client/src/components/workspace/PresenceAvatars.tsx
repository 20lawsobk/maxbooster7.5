import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type PresenceStatus = 'online' | 'away' | 'editing' | 'offline';

export interface Collaborator {
  userId: string;
  displayName: string;
  avatar?: string;
  color: string;
  status: PresenceStatus;
  cursor?: {
    x: number;
    y: number;
    trackIndex?: number;
    timePosition?: number;
  } | null;
  selection?: {
    startTime: number;
    endTime: number;
  } | null;
}

interface PresenceAvatarsProps {
  collaborators: Collaborator[];
  maxVisible?: number;
  size?: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
  onCollaboratorClick?: (collaborator: Collaborator) => void;
}

const sizeConfig = {
  sm: { avatar: 'h-6 w-6', status: 'h-2 w-2', text: 'text-[10px]', offset: '-ml-1' },
  md: { avatar: 'h-8 w-8', status: 'h-2.5 w-2.5', text: 'text-xs', offset: '-ml-2' },
  lg: { avatar: 'h-10 w-10', status: 'h-3 w-3', text: 'text-sm', offset: '-ml-3' },
};

const statusConfig: Record<PresenceStatus, { color: string; label: string; animate?: boolean }> = {
  online: { color: 'bg-green-500', label: 'Online' },
  away: { color: 'bg-yellow-500', label: 'Away' },
  editing: { color: 'bg-blue-500', label: 'Editing', animate: true },
  offline: { color: 'bg-gray-400', label: 'Offline' },
};

export function PresenceAvatars({
  collaborators,
  maxVisible = 5,
  size = 'md',
  showStatus = true,
  onCollaboratorClick,
}: PresenceAvatarsProps) {
  const [animatedUsers, setAnimatedUsers] = useState<Set<string>>(new Set());
  const config = sizeConfig[size];

  useEffect(() => {
    const editing = new Set(
      collaborators
        .filter(c => c.status === 'editing')
        .map(c => c.userId)
    );
    setAnimatedUsers(editing);
  }, [collaborators]);

  const visibleCollaborators = collaborators.slice(0, maxVisible);
  const hiddenCount = Math.max(0, collaborators.length - maxVisible);

  if (collaborators.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted" />
        <span>No collaborators online</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center">
        {visibleCollaborators.map((collaborator, index) => {
          const statusInfo = statusConfig[collaborator.status];
          const isEditing = animatedUsers.has(collaborator.userId);

          return (
            <Tooltip key={collaborator.userId}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'relative rounded-full ring-2 ring-background focus:outline-none focus:ring-primary transition-transform hover:scale-110 hover:z-10',
                    index > 0 && config.offset
                  )}
                  onClick={() => onCollaboratorClick?.(collaborator)}
                  style={{ borderColor: collaborator.color }}
                >
                  <Avatar
                    className={cn(
                      config.avatar,
                      'border-2',
                      isEditing && 'animate-pulse'
                    )}
                    style={{ borderColor: collaborator.color }}
                  >
                    <AvatarImage src={collaborator.avatar} />
                    <AvatarFallback
                      className={config.text}
                      style={{ backgroundColor: `${collaborator.color}20` }}
                    >
                      {collaborator.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {showStatus && (
                    <span
                      className={cn(
                        'absolute bottom-0 right-0 rounded-full border-2 border-background',
                        config.status,
                        statusInfo.color,
                        statusInfo.animate && 'animate-pulse'
                      )}
                    />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="p-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: collaborator.color }}
                  />
                  <span className="font-medium">{collaborator.displayName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {statusInfo.label}
                  </Badge>
                </div>
                {collaborator.status === 'editing' && collaborator.cursor && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Track {(collaborator.cursor.trackIndex || 0) + 1} at {collaborator.cursor.timePosition?.toFixed(1)}s
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {hiddenCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  'flex items-center justify-center rounded-full ring-2 ring-background bg-muted hover:bg-muted-foreground/20 transition-colors',
                  config.avatar,
                  config.offset
                )}
              >
                <span className={cn(config.text, 'font-medium')}>+{hiddenCount}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="space-y-1">
                {collaborators.slice(maxVisible).map(c => (
                  <div key={c.userId} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="text-sm">{c.displayName}</span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

export function CursorOverlay({
  collaborators,
}: {
  collaborators: Collaborator[];
}) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {collaborators
        .filter(c => c.cursor && c.status === 'editing')
        .map(collaborator => (
          <div
            key={collaborator.userId}
            className="absolute transition-all duration-75"
            style={{
              left: collaborator.cursor!.x,
              top: collaborator.cursor!.y,
              transform: 'translate(-2px, -2px)',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5.65376 12.4563L5.65376 3L12.8137 10.1599L8.52556 11.2468L5.65376 12.4563Z"
                fill={collaborator.color}
                stroke={collaborator.color}
                strokeWidth="2"
              />
            </svg>
            <div
              className="absolute left-4 top-4 px-2 py-0.5 rounded text-xs text-white whitespace-nowrap"
              style={{ backgroundColor: collaborator.color }}
            >
              {collaborator.displayName}
            </div>
          </div>
        ))}
    </div>
  );
}

export default PresenceAvatars;
