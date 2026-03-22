import { useEffect } from 'react';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { StudioOneDAW } from '@/components/studio/StudioOneDAW';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { useParams } from 'wouter';
import { dawCore } from '@/lib/daw';

export default function Studio() {
  const { user, isLoading } = useRequireSubscription();
  const params = useParams<{ projectId?: string }>();
  const projectId = params.projectId || null;

  useEffect(() => {
    dawCore.midi.initialize();
  }, []);

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
        <ErrorBoundary>
          <StudioOneDAW projectId={projectId} />
        </ErrorBoundary>
      </div>
    </AppLayout>
  );
}
