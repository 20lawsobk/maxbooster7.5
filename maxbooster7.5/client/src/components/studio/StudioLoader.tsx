import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  StudioSkeleton,
  ProjectListSkeleton,
  TrackLoadingSkeleton,
  FileBrowserSkeleton,
} from './StudioSkeleton';
import {
  AlertCircle,
  RefreshCw,
  WifiOff,
  Clock,
  Plus,
  FolderOpen,
  Home,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { errorService, captureException } from '@/lib/errorService';
import { apiRequest } from '@/lib/queryClient';
import { useRouter } from 'wouter/use-location';

interface LoadingState {
  projects: boolean;
  tracks: boolean;
  samples: boolean;
  plugins: boolean;
  settings: boolean;
}

interface ErrorState {
  projects?: Error;
  tracks?: Error;
  samples?: Error;
  plugins?: Error;
  settings?: Error;
}

interface StudioLoaderProps {
  children: React.ReactNode;
  userId?: string;
}

/**
 * TODO: Add function documentation
 */
export function StudioLoader({ children, userId }: StudioLoaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useRouter();

  const [loadingState, setLoadingState] = useState<LoadingState>({
    projects: true,
    tracks: false,
    samples: false,
    plugins: false,
    settings: false,
  });

  const [errorState, setErrorState] = useState<ErrorState>({});
  const [retryCount, setRetryCount] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasPartialData, setHasPartialData] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  // Calculate overall loading progress
  useEffect(() => {
    const loadedItems = Object.values(loadingState).filter((v) => !v).length;
    const totalItems = Object.keys(loadingState).length;
    setLoadProgress((loadedItems / totalItems) * 100);
  }, [loadingState]);

  // Query for projects with error handling
  const {
    data: projectsData,
    isLoading: projectsLoading,
    isError: projectsError,
    error: projectsErrorData,
    refetch: refetchProjects,
  } = useQuery({
    queryKey: ['/api/studio/projects'],
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    onError: (error) => {
      captureException(error, {
        component: 'StudioLoader',
        action: 'load-projects',
      });
      setErrorState((prev) => ({ ...prev, projects: error as Error }));
    },
    onSuccess: () => {
      setLoadingState((prev) => ({ ...prev, projects: false }));
      setErrorState((prev) => ({ ...prev, projects: undefined }));
    },
  });

  // Query for samples with error handling
  const {
    data: samplesData,
    isLoading: samplesLoading,
    isError: samplesError,
    error: samplesErrorData,
    refetch: refetchSamples,
  } = useQuery({
    queryKey: ['/api/studio/samples'],
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    onError: (error) => {
      // Don't capture sample loading errors as they're not critical
      setErrorState((prev) => ({ ...prev, samples: error as Error }));
    },
    onSuccess: () => {
      setLoadingState((prev) => ({ ...prev, samples: false }));
      setErrorState((prev) => ({ ...prev, samples: undefined }));
    },
  });

  // Check if we have partial data
  useEffect(() => {
    const hasAnyData = projectsData || samplesData;
    const hasAnyError = Object.values(errorState).some((e) => e !== undefined);
    setHasPartialData(hasAnyData && hasAnyError);
  }, [projectsData, samplesData, errorState]);

  // Retry mechanism with exponential backoff
  const handleRetryAll = useCallback(async () => {
    setIsRetrying(true);
    setRetryCount((prev) => prev + 1);

    // Clear errors
    setErrorState({});

    // Calculate retry delay
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    const countdownSeconds = Math.ceil(delay / 1000);
    setRetryCountdown(countdownSeconds);

    // Start countdown
    const countdownInterval = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Wait for delay
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Retry failed queries
    const retryPromises = [];
    if (errorState.projects) retryPromises.push(refetchProjects());
    if (errorState.samples) retryPromises.push(refetchSamples());

    try {
      await Promise.all(retryPromises);
      setIsRetrying(false);
      toast({
        title: 'Data loaded successfully',
        description: 'All studio resources have been loaded.',
      });
    } catch (error: unknown) {
      setIsRetrying(false);
      toast({
        title: 'Some resources failed to load',
        description: 'You can continue with partial functionality.',
        variant: 'destructive',
      });
    }
  }, [retryCount, errorState, refetchProjects, refetchSamples, toast]);

  // Create empty project if none exist
  const handleCreateProject = async () => {
    try {
      errorService.addBreadcrumb('create-empty-project', {});

      const response = await apiRequest('POST', '/api/studio/projects', {
        title: 'Untitled Project',
        bpm: 120,
        status: 'draft',
      });

      const newProject = await response.json();

      // Invalidate and refetch - sync across all project views
      await queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/projects'] });

      toast({
        title: 'Project created',
        description: 'A new project has been created for you.',
      });

      // Reload to apply the new project
      window.location.reload();
    } catch (error: unknown) {
      captureException(error, {
        component: 'StudioLoader',
        action: 'create-empty-project',
      });

      toast({
        title: 'Failed to create project',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle critical errors (projects failed to load)
  const hasCriticalError = errorState.projects && !hasPartialData;

  // Determine if we're in a degraded state
  const isDegraded =
    hasPartialData || (Object.values(errorState).some((e) => e) && !hasCriticalError);

  // Show full loading skeleton initially
  if (projectsLoading && !projectsData) {
    return (
      <div className="relative">
        <StudioSkeleton />
        <div className="absolute top-4 right-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 rounded-lg shadow-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
            <span className="text-sm font-medium">Loading Studio...</span>
          </div>
          <Progress value={loadProgress} className="mt-2 w-48" />
        </div>
      </div>
    );
  }

  // Show error state if critical resources failed
  if (hasCriticalError) {
    const isNetworkError =
      projectsErrorData?.message?.includes('Network') ||
      projectsErrorData?.message?.includes('fetch');
    const isTimeoutError = projectsErrorData?.message?.includes('timeout');
    const isAuthError =
      projectsErrorData?.message?.includes('401') || projectsErrorData?.message?.includes('403');

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                {isNetworkError ? (
                  <WifiOff className="h-6 w-6 text-red-600 dark:text-red-400" />
                ) : isTimeoutError ? (
                  <Clock className="h-6 w-6 text-red-600 dark:text-red-400" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                )}
              </div>
              <div>
                <CardTitle className="text-2xl">
                  {isAuthError
                    ? 'Authentication Required'
                    : isNetworkError
                      ? 'Connection Problem'
                      : isTimeoutError
                        ? 'Loading Timeout'
                        : 'Unable to Load Studio'}
                </CardTitle>
                <CardDescription>
                  {isAuthError
                    ? 'Please log in to access the studio'
                    : isNetworkError
                      ? 'Check your internet connection and try again'
                      : isTimeoutError
                        ? 'The studio is taking too long to load'
                        : 'We encountered an error loading your projects'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isRetrying && retryCountdown > 0 && (
              <Alert>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Retrying in {retryCountdown} seconds... (Attempt {retryCount + 1} of 3)
                </AlertDescription>
                <Progress value={(1 - retryCountdown / 10) * 100} className="mt-2" />
              </Alert>
            )}

            {!projectsData && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Projects Found</AlertTitle>
                <AlertDescription>
                  You don't have any projects yet. Create one to get started.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              {isAuthError ? (
                <Button onClick={() => navigate('/login?returnUrl=/studio')} className="w-full">
                  Go to Login
                </Button>
              ) : (
                <>
                  <Button onClick={handleRetryAll} disabled={isRetrying} className="w-full">
                    <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
                    {isRetrying ? 'Retrying...' : 'Retry Loading'}
                  </Button>

                  {!projectsData && (
                    <Button onClick={handleCreateProject} variant="secondary" className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Empty Project
                    </Button>
                  )}
                </>
              )}

              <Button onClick={() => navigate('/dashboard')} variant="outline" className="w-full">
                <Home className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show degraded mode notification if some resources failed
  if (isDegraded) {
    const failedResources = Object.entries(errorState)
      .filter(([_, error]) => error)
      .map(([resource]) => resource);

    return (
      <div className="relative">
        {children}
        <div className="fixed bottom-4 right-4 z-50">
          <Alert className="w-96 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertTitle>Limited Functionality</AlertTitle>
            <AlertDescription>
              Some studio features are unavailable: {failedResources.join(', ')}.
              <Button onClick={handleRetryAll} variant="link" className="px-0 mt-2" size="sm">
                Try to reload missing features
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  // Everything loaded successfully
  return (
    <>
      {children}
      {loadProgress === 100 && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2">
          <Alert className="w-64 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription>Studio loaded successfully</AlertDescription>
          </Alert>
        </div>
      )}
    </>
  );
}

// Export a HOC for wrapping the Studio component
export function withStudioLoader<P extends object>(Component: React.ComponentType<P>): React.FC<P> {
  return (props: P) => (
    <StudioLoader userId={(props as any).userId}>
      <Component {...props} />
    </StudioLoader>
  );
}
