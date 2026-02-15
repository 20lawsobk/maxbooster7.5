import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

/**
 * TODO: Add function documentation
 */
export function StudioSkeleton() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="w-64 border-r bg-muted/10 p-4 space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col">
        {/* Top bar skeleton */}
        <div className="h-16 border-b px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>

        {/* Transport controls skeleton */}
        <div className="h-20 border-b px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-12 w-12 rounded-full" />
          </div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>

        {/* Track list skeleton */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex">
            {/* Track headers */}
            <div className="w-48 border-r">
              <div className="h-12 border-b px-4 flex items-center">
                <Skeleton className="h-6 w-24" />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 border-b px-4 py-2 space-y-2">
                  <Skeleton className="h-6 w-32" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline skeleton */}
            <div className="flex-1">
              <div className="h-12 border-b px-4">
                <Skeleton className="h-4 w-full mt-4" />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 border-b p-2">
                  <Skeleton className="h-full w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function TrackLoadingSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg animate-pulse">
      <Skeleton className="h-16 w-16 rounded" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function ProjectListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-10 w-20" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function FileBrowserSkeleton() {
  return (
    <div className="space-y-2 p-4">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function MixerPanelSkeleton() {
  return (
    <div className="flex gap-4 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="w-24 space-y-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}
