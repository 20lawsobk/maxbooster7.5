import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';
import { Progress } from './progress';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { createAriaProgressBar } from '@/lib/accessibility';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
}

const spinnerSizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

export function LoadingSpinner({ size = 'md', label = 'Loading', className }: LoadingSpinnerProps) {
  return (
    <div
      className={cn('flex items-center justify-center gap-2', className)}
      role="status"
      aria-label={label}
    >
      <Loader2 className={cn('animate-spin text-primary', spinnerSizes[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

interface LoadingOverlayProps {
  isLoading: boolean;
  label?: string;
  blur?: boolean;
  children: React.ReactNode;
}

export function LoadingOverlay({
  isLoading,
  label = 'Loading content',
  blur = true,
  children,
}: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-background/80 z-50',
            blur && 'backdrop-blur-sm'
          )}
          role="status"
          aria-label={label}
        >
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner size="lg" />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ProgressIndicatorProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
  className?: string;
}

const progressSizes = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const progressVariants = {
  default: '',
  success: '[&>div]:bg-green-500',
  warning: '[&>div]:bg-yellow-500',
  error: '[&>div]:bg-red-500',
};

export function ProgressIndicator({
  value,
  max = 100,
  label,
  showPercentage = true,
  showLabel = true,
  size = 'md',
  variant = 'default',
  className,
}: ProgressIndicatorProps) {
  const percentage = Math.round((value / max) * 100);
  const ariaProps = createAriaProgressBar(value, 0, max, label);

  return (
    <div className={cn('space-y-2', className)}>
      {(showLabel || showPercentage) && (
        <div className="flex items-center justify-between text-sm">
          {showLabel && label && <span className="text-muted-foreground">{label}</span>}
          {showPercentage && <span className="font-medium">{percentage}%</span>}
        </div>
      )}
      <Progress
        value={percentage}
        className={cn(progressSizes[size], progressVariants[variant])}
        {...ariaProps}
      />
    </div>
  );
}

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
  showConnector?: boolean;
  className?: string;
}

export function StepProgress({
  currentStep,
  totalSteps,
  labels,
  showConnector = true,
  className,
}: StepProgressProps) {
  return (
    <div
      className={cn('flex items-center justify-between', className)}
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-label={`Step ${currentStep} of ${totalSteps}`}
    >
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNumber = i + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;

        return (
          <React.Fragment key={stepNumber}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2',
                  !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isCompleted ? (
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                ) : (
                  stepNumber
                )}
              </div>
              {labels?.[i] && (
                <span
                  className={cn(
                    'text-xs max-w-[80px] text-center',
                    (isCompleted || isCurrent) ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {labels[i]}
                </span>
              )}
            </div>
            {showConnector && stepNumber < totalSteps && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2',
                  isCompleted ? 'bg-primary' : 'bg-muted'
                )}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface OptimisticUpdateFeedbackProps {
  status: 'idle' | 'pending' | 'success' | 'error';
  pendingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  className?: string;
}

export function OptimisticUpdateFeedback({
  status,
  pendingLabel = 'Saving...',
  successLabel = 'Saved',
  errorLabel = 'Failed to save',
  className,
}: OptimisticUpdateFeedbackProps) {
  if (status === 'idle') return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm transition-opacity',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {status === 'pending' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">{pendingLabel}</span>
        </>
      )}
      {status === 'success' && (
        <>
          <CheckCircle className="h-3 w-3 text-green-500" aria-hidden="true" />
          <span className="text-green-600 dark:text-green-400">{successLabel}</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="h-3 w-3 text-red-500" aria-hidden="true" />
          <span className="text-red-600 dark:text-red-400">{errorLabel}</span>
        </>
      )}
    </div>
  );
}

interface SkeletonContentProps {
  isLoading: boolean;
  children: React.ReactNode;
  skeleton: React.ReactNode;
  minHeight?: string;
}

export function SkeletonContent({
  isLoading,
  children,
  skeleton,
  minHeight,
}: SkeletonContentProps) {
  if (isLoading) {
    return (
      <div style={{ minHeight }} role="status" aria-label="Loading content">
        {skeleton}
        <span className="sr-only">Loading content, please wait</span>
      </div>
    );
  }
  return <>{children}</>;
}

interface InlineLoadingProps {
  isLoading: boolean;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}

export function InlineLoading({ isLoading, children, size = 'sm' }: InlineLoadingProps) {
  if (isLoading) {
    return <Loader2 className={cn('animate-spin', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')} aria-hidden="true" />;
  }
  return <>{children}</>;
}

interface ButtonLoadingStateProps {
  isLoading: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export function ButtonLoadingState({ isLoading, loadingText, children }: ButtonLoadingStateProps) {
  if (isLoading) {
    return (
      <>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        {loadingText || 'Loading...'}
      </>
    );
  }
  return <>{children}</>;
}

interface PulsingDotProps {
  color?: 'primary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const dotColors = {
  primary: 'bg-primary',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
};

const dotSizes = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
};

export function PulsingDot({ color = 'primary', size = 'md', className }: PulsingDotProps) {
  return (
    <span className={cn('relative flex', className)}>
      <span
        className={cn(
          'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
          dotColors[color]
        )}
      />
      <span
        className={cn(
          'relative inline-flex rounded-full',
          dotColors[color],
          dotSizes[size]
        )}
      />
    </span>
  );
}

interface ContentPlaceholderProps {
  lines?: number;
  className?: string;
}

export function ContentPlaceholder({ lines = 3, className }: ContentPlaceholderProps) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading content">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
      <span className="sr-only">Loading content</span>
    </div>
  );
}

interface ImageLoadingProps {
  isLoading: boolean;
  children: React.ReactNode;
  aspectRatio?: string;
  className?: string;
}

export function ImageLoading({
  isLoading,
  children,
  aspectRatio = '16/9',
  className,
}: ImageLoadingProps) {
  if (isLoading) {
    return (
      <div
        className={cn('relative overflow-hidden bg-muted rounded-lg', className)}
        style={{ aspectRatio }}
        role="status"
        aria-label="Loading image"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skeleton-shimmer" />
        <span className="sr-only">Loading image</span>
      </div>
    );
  }
  return <>{children}</>;
}

interface DataLoadingStateProps {
  isLoading: boolean;
  isEmpty: boolean;
  isError: boolean;
  error?: Error | null;
  loadingComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  children: React.ReactNode;
}

export function DataLoadingState({
  isLoading,
  isEmpty,
  isError,
  error,
  loadingComponent,
  emptyComponent,
  errorComponent,
  children,
}: DataLoadingStateProps) {
  if (isLoading) {
    return (
      loadingComponent || (
        <div className="flex items-center justify-center p-8">
          <LoadingSpinner size="lg" label="Loading data" />
        </div>
      )
    );
  }

  if (isError) {
    return (
      errorComponent || (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" aria-hidden="true" />
          <h3 className="font-semibold text-lg mb-2">Something went wrong</h3>
          <p className="text-muted-foreground text-sm">
            {error?.message || 'Failed to load data. Please try again.'}
          </p>
        </div>
      )
    );
  }

  if (isEmpty) {
    return (
      emptyComponent || (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <span className="text-2xl">📭</span>
          </div>
          <h3 className="font-semibold text-lg mb-2">No data found</h3>
          <p className="text-muted-foreground text-sm">
            There's nothing here yet. Check back later.
          </p>
        </div>
      )
    );
  }

  return <>{children}</>;
}
