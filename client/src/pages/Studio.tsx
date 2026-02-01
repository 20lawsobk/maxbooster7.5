import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { HighPerformanceDAW } from '@/components/studio/HighPerformanceDAW';
import { Loader2 } from 'lucide-react';

export default function Studio() {
  const { user, isLoading } = useRequireSubscription();

  if (isLoading) {
    return (
      <AppLayout noPadding title="Studio">
        <div className="h-full w-full flex items-center justify-center bg-slate-950">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout noPadding title="Studio">
      <div className="h-full w-full relative">
        <HighPerformanceDAW />
      </div>
    </AppLayout>
  );
}
