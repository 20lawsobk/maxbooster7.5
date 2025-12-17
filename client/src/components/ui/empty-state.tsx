import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Music,
  FileText,
  Users,
  BarChart3,
  Play,
  Plus,
  Upload,
  Search,
  FolderOpen,
  CloudOff,
  AlertCircle,
  CheckCircle,
  Info,
  Rocket,
  TrendingUp,
  Megaphone,
  DollarSign,
  Share2,
  Sparkles,
  Globe,
  Package,
  Zap,
  Brain,
} from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
  variant?: 'default' | 'error' | 'success' | 'info' | 'card' | 'minimal';
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

const iconMap = {
  music: Music,
  file: FileText,
  users: Users,
  chart: BarChart3,
  play: Play,
  plus: Plus,
  upload: Upload,
  search: Search,
  folder: FolderOpen,
  offline: CloudOff,
  alert: AlertCircle,
  check: CheckCircle,
  info: Info,
  rocket: Rocket,
  trending: TrendingUp,
  megaphone: Megaphone,
  dollar: DollarSign,
  share: Share2,
  sparkles: Sparkles,
  globe: Globe,
  package: Package,
  zap: Zap,
  brain: Brain,
};

const variantStyles = {
  default: {
    icon: 'text-gray-400 dark:text-gray-600',
    container: 'bg-gray-50 dark:bg-gray-900/50',
    border: 'border-gray-200 dark:border-gray-800',
    glow: 'bg-gray-400/20',
  },
  error: {
    icon: 'text-red-400 dark:text-red-600',
    container: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    glow: 'bg-red-400/20',
  },
  success: {
    icon: 'text-green-400 dark:text-green-600',
    container: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    glow: 'bg-green-400/20',
  },
  info: {
    icon: 'text-blue-400 dark:text-blue-600',
    container: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    glow: 'bg-blue-400/20',
  },
  card: {
    icon: 'text-primary',
    container: 'bg-card',
    border: 'border-border',
    glow: 'bg-primary/10',
  },
  minimal: {
    icon: 'text-muted-foreground',
    container: 'transparent',
    border: 'border-transparent',
    glow: 'bg-primary/10',
  },
};

const sizeClasses = {
  sm: {
    container: 'p-4 sm:p-6',
    icon: 'w-12 h-12',
    iconWrapper: 'w-14 h-14',
    title: 'text-base',
    description: 'text-xs',
    maxWidth: 'max-w-sm',
  },
  md: {
    container: 'p-6 sm:p-8',
    icon: 'w-16 h-16',
    iconWrapper: 'w-20 h-20',
    title: 'text-lg',
    description: 'text-sm',
    maxWidth: 'max-w-md',
  },
  lg: {
    container: 'p-8 sm:p-12',
    icon: 'w-20 h-20',
    iconWrapper: 'w-24 h-24',
    title: 'text-xl',
    description: 'text-base',
    maxWidth: 'max-w-lg',
  },
};

/**
 * TODO: Add function documentation
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
  variant = 'default',
  size = 'md',
  animate = true,
}: EmptyStateProps) {
  const styles = variantStyles[variant];
  const sizes = sizeClasses[size];
  const DefaultIcon = Icon || iconMap.folder;

  const content = (
    <>
      <div className="relative mb-4">
        {animate && (
          <div
            className={cn('absolute inset-0 rounded-full blur-2xl animate-pulse', styles.glow)}
          />
        )}
        <div
          className={cn(
            'relative rounded-full flex items-center justify-center transition-all duration-300',
            sizes.iconWrapper,
            variant !== 'minimal' && [styles.container, 'border-2', styles.border],
            animate && 'hover:scale-110 hover:rotate-3'
          )}
        >
          <DefaultIcon
            className={cn(sizes.icon, styles.icon, animate && 'animate-in zoom-in-50 duration-700')}
          />
        </div>
      </div>

      <h3
        className={cn(
          'font-semibold text-gray-900 dark:text-white mb-2 text-center',
          sizes.title,
          animate && 'animate-in fade-in-50 slide-in-from-bottom-2 duration-500'
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          className={cn(
            'text-gray-600 dark:text-gray-400 text-center mb-6',
            sizes.description,
            sizes.maxWidth,
            animate && 'animate-in fade-in-50 slide-in-from-bottom-3 duration-700'
          )}
        >
          {description}
        </p>
      )}

      {(actionLabel || secondaryActionLabel) && (
        <div
          className={cn(
            'flex flex-col sm:flex-row gap-3',
            animate && 'animate-in fade-in-50 slide-in-from-bottom-4 duration-1000'
          )}
        >
          {actionLabel && onAction && (
            <Button
              onClick={onAction}
              variant={variant === 'error' ? 'destructive' : 'default'}
              className={cn(animate && 'transition-all hover:scale-105', 'touch-target-minimum')}
              data-testid="button-empty-state-primary"
            >
              {actionLabel}
            </Button>
          )}

          {secondaryActionLabel && onSecondaryAction && (
            <Button
              onClick={onSecondaryAction}
              variant="outline"
              className={cn(animate && 'transition-all hover:scale-105', 'touch-target-minimum')}
              data-testid="button-empty-state-secondary"
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </>
  );

  if (variant === 'card') {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <div className={cn('flex flex-col items-center justify-center', sizes.container)}>
          {content}
        </div>
      </Card>
    );
  }

  if (variant === 'minimal') {
    return (
      <div className={cn('flex flex-col items-center justify-center', sizes.container, className)}>
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all duration-300',
        sizes.container,
        styles.container,
        styles.border,
        animate && 'animate-in fade-in-50 duration-500',
        className
      )}
    >
      {content}
    </div>
  );
}

export default EmptyState;
