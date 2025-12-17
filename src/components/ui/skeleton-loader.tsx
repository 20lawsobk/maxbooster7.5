import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

/**
 * TODO: Add function documentation
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-6 space-y-4', className)}>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-[200px]" />
          <Skeleton className="h-3 w-[150px]" />
        </div>
      </div>
      <Skeleton className="h-32 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <div className="flex items-center space-x-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
      </div>
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="border-b last:border-0 p-4">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-10 w-10 rounded" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24 ml-auto" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="space-y-3">
        <div className="flex items-end space-x-2 h-64">
          {[...Array(12)].map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1"
              style={{
                height: `${Math.random() * 100 + 50}%`,
              }}
            />
          ))}
        </div>
        <div className="flex justify-between">
          {[...Array(12)].map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function SkeletonList({ items = 3 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(items)].map((_, i) => (
        <div key={i} className="flex items-center space-x-3 p-3 rounded-lg border bg-card">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function SkeletonDashboardStats() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
          <Skeleton className="h-8 w-32 mb-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function SkeletonProjectCard() {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Skeleton className="h-48 w-full" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function SkeletonStudioTrack() {
  return (
    <div className="flex items-center space-x-3 p-2 border-b">
      <Skeleton className="h-8 w-8 rounded" />
      <Skeleton className="h-12 w-24" />
      <Skeleton className="h-8 flex-1" />
      <div className="flex space-x-2">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
  );
}

interface SkeletonLoaderProps {
  rows?: number;
  columns?: number;
  height?: string | number;
  className?: string;
  variant?: 'table' | 'card' | 'list' | 'grid';
}

/**
 * TODO: Add function documentation
 */
export function SkeletonLoader({
  rows = 3,
  columns = 1,
  height = 'h-20',
  className,
  variant = 'card',
}: SkeletonLoaderProps) {
  const heightClass = typeof height === 'number' ? `h-[${height}px]` : height;

  // Render table variant
  if (variant === 'table') {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: columns }).map((_, j) => (
              <Skeleton key={j} className={cn(heightClass, 'flex-1')} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Render list variant
  if (variant === 'list') {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Render grid variant
  if (variant === 'grid') {
    return (
      <div
        className={cn(`grid gap-4`, className)}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows * columns }).map((_, i) => (
          <Skeleton key={i} className={heightClass} />
        ))}
      </div>
    );
  }

  // Default card variant
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={heightClass} />
      ))}
    </div>
  );
}
