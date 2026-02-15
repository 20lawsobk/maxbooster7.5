import { cn } from '@/lib/utils';

interface InstantSkeletonProps {
  variant?: 'card' | 'list' | 'page' | 'table';
  count?: number;
  className?: string;
}

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-muted/50", className)} />
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonPulse className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <SkeletonPulse className="h-4 w-1/3" />
          <SkeletonPulse className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonPulse className="h-20 w-full" />
      <div className="flex gap-2">
        <SkeletonPulse className="h-8 w-20 rounded-md" />
        <SkeletonPulse className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border-b">
      <SkeletonPulse className="h-12 w-12 rounded-lg" />
      <div className="space-y-2 flex-1">
        <SkeletonPulse className="h-4 w-2/5" />
        <SkeletonPulse className="h-3 w-3/5" />
      </div>
      <SkeletonPulse className="h-8 w-16 rounded-md" />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <SkeletonPulse className="h-8 w-48" />
        <SkeletonPulse className="h-10 w-32 rounded-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <SkeletonPulse className="h-5 w-24" />
            <SkeletonPulse className="h-8 w-16" />
            <SkeletonPulse className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 p-3 border-b">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonPulse key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3 border-b border-muted/30">
          {Array.from({ length: 4 }).map((_, j) => (
            <SkeletonPulse key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function InstantSkeleton({ variant = 'page', count = 1, className }: InstantSkeletonProps) {
  const Component = {
    card: CardSkeleton,
    list: ListSkeleton,
    page: PageSkeleton,
    table: TableSkeleton,
  }[variant];

  if (variant === 'page') {
    return (
      <div className={className}>
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
    </div>
  );
}
