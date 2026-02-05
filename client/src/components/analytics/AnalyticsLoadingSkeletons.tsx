import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function StatCardSkeleton({ className }: SkeletonProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardRowSkeleton({ count = 4, className }: { count?: number } & SkeletonProps) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartCardSkeleton({ className, height = 300 }: { height?: number } & SkeletonProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full" style={{ height }} />
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 5, columns = 4, className }: { rows?: number; columns?: number } & SkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-4 pb-2 border-b">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton 
              key={colIndex} 
              className="h-6 flex-1" 
              style={{ 
                animationDelay: `${(rowIndex * columns + colIndex) * 50}ms` 
              }} 
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PlatformListSkeleton({ count = 6, className }: { count?: number } & SkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2 w-full" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function GeographicSkeleton({ className }: SkeletonProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          <Skeleton className="h-48 w-48 rounded-lg" />
          <div className="flex-1 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DemographicsSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-6", className)}>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center">
            <Skeleton className="h-40 w-40 rounded-full" />
          </div>
          <div className="mt-4 flex justify-center gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function RevenueBreakdownSkeleton({ className }: SkeletonProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="text-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <Skeleton className="h-8 w-24 mx-auto mb-2" />
              <Skeleton className="h-3 w-16 mx-auto" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-6 w-6 rounded" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-2 w-full" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function PlaylistTrackingSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-6 w-6 rounded mb-3" />
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-48 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ExportSkeleton({ className }: SkeletonProps) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
      </CardContent>
    </Card>
  );
}

export function FullPageAnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      <StatCardRowSkeleton />

      <div className="grid grid-cols-3 gap-6">
        <ChartCardSkeleton className="col-span-2" height={350} />
        <ChartCardSkeleton height={350} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <GeographicSkeleton />
        <RevenueBreakdownSkeleton />
      </div>

      <PlaylistTrackingSkeleton />
    </div>
  );
}
