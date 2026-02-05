import { Cloud, Archive, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type StorageTier = 'hot' | 'cold';

interface StorageTierIndicatorProps {
  tier: StorageTier;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  compressedSize?: number;
  originalSize?: number;
  accessCount?: number;
  lastAccessed?: Date;
  isDeduplicated?: boolean;
}

const tierConfig = {
  hot: {
    label: 'Hot',
    description: 'Stored in Replit Object Storage for fast access',
    icon: Cloud,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    badgeVariant: 'default' as const,
  },
  cold: {
    label: 'Cold',
    description: 'Stored in Pocket Dimension with compression',
    icon: Archive,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950',
    badgeVariant: 'secondary' as const,
  },
};

const sizeConfig = {
  sm: { icon: 'h-3 w-3', text: 'text-xs' },
  md: { icon: 'h-4 w-4', text: 'text-sm' },
  lg: { icon: 'h-5 w-5', text: 'text-base' },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export function StorageTierIndicator({
  tier,
  size = 'md',
  showLabel = true,
  compressedSize,
  originalSize,
  accessCount,
  lastAccessed,
  isDeduplicated,
}: StorageTierIndicatorProps) {
  const config = tierConfig[tier];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const compressionRatio = originalSize && compressedSize 
    ? (originalSize / compressedSize).toFixed(2) 
    : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${config.bgColor}`}>
            <Icon className={`${sizeStyles.icon} ${config.color}`} />
            {showLabel && (
              <span className={`${sizeStyles.text} font-medium ${config.color}`}>
                {config.label}
              </span>
            )}
            {isDeduplicated && (
              <Zap className={`${sizeStyles.icon} text-yellow-500`} />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2">
            <p className="font-medium">{config.label} Tier Storage</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            
            {(originalSize || compressedSize || accessCount !== undefined || lastAccessed) && (
              <div className="pt-2 border-t space-y-1">
                {originalSize && (
                  <div className="flex justify-between text-xs">
                    <span>Original size:</span>
                    <span>{formatBytes(originalSize)}</span>
                  </div>
                )}
                {compressedSize && tier === 'cold' && (
                  <div className="flex justify-between text-xs">
                    <span>Compressed:</span>
                    <span>{formatBytes(compressedSize)}</span>
                  </div>
                )}
                {compressionRatio && tier === 'cold' && (
                  <div className="flex justify-between text-xs text-green-600">
                    <span>Compression:</span>
                    <span>{compressionRatio}x</span>
                  </div>
                )}
                {accessCount !== undefined && (
                  <div className="flex justify-between text-xs">
                    <span>Access count:</span>
                    <span>{accessCount}</span>
                  </div>
                )}
                {lastAccessed && (
                  <div className="flex justify-between text-xs">
                    <span>Last accessed:</span>
                    <span>{formatRelativeTime(lastAccessed)}</span>
                  </div>
                )}
                {isDeduplicated && (
                  <div className="flex items-center gap-1 text-xs text-yellow-600 pt-1">
                    <Zap className="h-3 w-3" />
                    <span>Deduplicated (saving space)</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function StorageTierBadge({ tier, isDeduplicated }: { tier: StorageTier; isDeduplicated?: boolean }) {
  const config = tierConfig[tier];
  const Icon = config.icon;

  return (
    <Badge variant={config.badgeVariant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
      {isDeduplicated && <Zap className="h-3 w-3 text-yellow-500" />}
    </Badge>
  );
}

export function StorageTierCompact({ tier }: { tier: StorageTier }) {
  const config = tierConfig[tier];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Icon className={`h-4 w-4 ${config.color}`} />
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.label} Tier - {config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default StorageTierIndicator;
