import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  AlertCircle,
  Home,
  RefreshCw,
  AlertTriangle,
  Info,
  Bug,
  WifiOff,
  Shield,
  Database,
  Clock,
  HardDrive,
} from 'lucide-react';
import {
  errorService,
  ErrorSeverity,
  ErrorCategory,
  ErrorRecoveryAction,
  captureException,
} from '@/lib/errorService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  severity: ErrorSeverity;
  category: ErrorCategory;
  userMessage: string;
  recoveryActions: ErrorRecoveryAction[];
  retryCount: number;
  maxRetries: number;
  isRetrying: boolean;
  retryCountdown: number;
  hasReportedError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    severity: 'error',
    category: 'unknown',
    userMessage: 'An unexpected error occurred',
    recoveryActions: [],
    retryCount: 0,
    maxRetries: 3,
    isRetrying: false,
    retryCountdown: 0,
    hasReportedError: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const category = ErrorBoundary.categorizeError(error);
    const severity = ErrorBoundary.determineSeverity(error, category);
    const isTransient = ErrorBoundary.isTransientError(category);

    return {
      hasError: true,
      error,
      category,
      severity,
      userMessage: ErrorBoundary.getUserMessage(category, error),
      maxRetries: isTransient ? 3 : 0,
    };
  }

  private static categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (message.includes('network') || message.includes('fetch') || name.includes('network')) {
      return 'network';
    }
    if (message.includes('401') || message.includes('403') || message.includes('auth')) {
      return 'auth';
    }
    if (message.includes('timeout') || name.includes('timeout')) {
      return 'timeout';
    }
    if (message.includes('permission') || message.includes('denied')) {
      return 'permission';
    }
    if (message.includes('storage') || message.includes('quota')) {
      return 'storage';
    }
    if (message.includes('audio') || message.includes('media')) {
      return 'media';
    }
    if (message.includes('memory') || message.includes('cpu')) {
      return 'system';
    }
    return 'unknown';
  }

  private static determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    if (category === 'auth' || category === 'system') return 'critical';
    if (category === 'network' || category === 'timeout') return 'error';
    if (category === 'permission' || category === 'storage') return 'warning';
    return 'error';
  }

  private static isTransientError(category: ErrorCategory): boolean {
    return ['network', 'timeout', 'system'].includes(category);
  }

  private static getUserMessage(category: ErrorCategory, error: Error): string {
    const messages: Record<ErrorCategory, string> = {
      network: "We're having trouble connecting. Please check your internet connection.",
      auth: 'Your session has expired. Please log in again to continue.',
      validation: 'Some information appears to be incorrect. Please review and try again.',
      system: 'System resources are temporarily limited. This should resolve shortly.',
      timeout: 'The operation is taking longer than expected. Please try again.',
      permission: "You don't have permission to access this feature.",
      storage: 'Storage space is running low. Please free up some space to continue.',
      media: 'There was an issue processing audio/video. Please try a different file or format.',
      unknown: "Something unexpected happened. We're working to fix it.",
    };

    return messages[category] || messages.unknown;
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report error to our error service
    if (!this.state.hasReportedError) {
      errorService.handleError(
        error,
        {
          component: 'ErrorBoundary',
          action: 'component-error',
          metadata: {
            componentStack: errorInfo.componentStack,
            errorBoundary: true,
          },
        },
        {
          severity: this.state.severity,
          showToast: false, // Don't show toast since we're showing the error UI
          retryable: this.state.maxRetries > 0,
        }
      );

      this.setState({ hasReportedError: true });
    }

    // Set up recovery actions based on error category
    const recoveryActions = this.getRecoveryActions();

    this.setState({
      errorInfo,
      recoveryActions,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Auto-retry for transient errors
    if (this.state.maxRetries > 0 && this.state.retryCount < this.state.maxRetries) {
      this.scheduleRetry();
    }
  }

  private getRecoveryActions(): ErrorRecoveryAction[] {
    const actions: ErrorRecoveryAction[] = [];
    const { category } = this.state;

    switch (category) {
      case 'network':
      case 'timeout':
        actions.push({
          label: 'Retry Now',
          type: 'primary',
          action: () => this.handleManualRetry(),
        });
        break;

      case 'auth':
        actions.push({
          label: 'Log In',
          type: 'primary',
          action: () => {
            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/login?returnUrl=${returnUrl}`;
          },
        });
        break;

      case 'storage':
        actions.push({
          label: 'Clear Cache',
          type: 'primary',
          action: async () => {
            if ('caches' in window) {
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map((name) => caches.delete(name)));
              this.handleReset();
            }
          },
        });
        break;

      default:
        actions.push({
          label: 'Try Again',
          type: 'primary',
          action: () => this.handleReset(),
        });
    }

    // Always add secondary actions
    actions.push({
      label: 'Go Home',
      type: 'secondary',
      action: () => this.handleGoHome(),
    });

    actions.push({
      label: 'Report Issue',
      type: 'secondary',
      action: () => this.handleReportIssue(),
    });

    return actions;
  }

  private scheduleRetry() {
    const retryDelay = Math.min(1000 * Math.pow(2, this.state.retryCount), 30000);
    const countdownSeconds = Math.ceil(retryDelay / 1000);

    this.setState({
      isRetrying: true,
      retryCountdown: countdownSeconds,
    });

    // Update countdown every second
    this.countdownTimer = setInterval(() => {
      this.setState((prev) => {
        if (prev.retryCountdown <= 1) {
          if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
          }
          return { retryCountdown: 0 };
        }
        return { retryCountdown: prev.retryCountdown - 1 };
      });
    }, 1000);

    // Schedule the actual retry
    this.retryTimer = setTimeout(() => {
      this.handleReset();
      this.setState((prev) => ({
        retryCount: prev.retryCount + 1,
        isRetrying: false,
      }));
    }, retryDelay);
  }

  private handleManualRetry = () => {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    this.setState((prev) => ({
      retryCount: prev.retryCount + 1,
      isRetrying: false,
      retryCountdown: 0,
    }));

    this.handleReset();
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      hasReportedError: false,
    });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleReportIssue = () => {
    const { error, errorInfo } = this.state;

    errorService.addBreadcrumb('error-boundary-report', {
      error: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });

    // This will trigger the error service's report dialog
    errorService.captureException(error || new Error('Unknown error'), {
      component: 'ErrorBoundary',
      action: 'manual-report',
    });
  };

  private getIconForCategory(category: ErrorCategory) {
    const icons: Record<ErrorCategory, ReactNode> = {
      network: <WifiOff className="h-6 w-6" />,
      auth: <Shield className="h-6 w-6" />,
      validation: <AlertCircle className="h-6 w-6" />,
      system: <Database className="h-6 w-6" />,
      timeout: <Clock className="h-6 w-6" />,
      permission: <Shield className="h-6 w-6" />,
      storage: <HardDrive className="h-6 w-6" />,
      media: <AlertCircle className="h-6 w-6" />,
      unknown: <Bug className="h-6 w-6" />,
    };

    return icons[category] || <AlertCircle className="h-6 w-6" />;
  }

  private getSeverityColor(severity: ErrorSeverity) {
    const colors: Record<ErrorSeverity, string> = {
      critical: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
      error: 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
      warning: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
      info: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    };

    return colors[severity] || colors.error;
  }

  public componentWillUnmount() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const {
        error,
        severity,
        category,
        userMessage,
        recoveryActions,
        isRetrying,
        retryCountdown,
        retryCount,
        maxRetries,
      } = this.state;

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
          <Card className="max-w-lg w-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`h-12 w-12 rounded-full flex items-center justify-center ${this.getSeverityColor(severity)}`}
                >
                  {this.getIconForCategory(category)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-2xl">
                      {severity === 'critical'
                        ? 'Critical Error'
                        : severity === 'warning'
                          ? 'Warning'
                          : 'Something went wrong'}
                    </CardTitle>
                    <Badge variant={severity === 'critical' ? 'destructive' : 'secondary'}>
                      {category}
                    </Badge>
                  </div>
                  <CardDescription>{userMessage}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isRetrying && retryCountdown > 0 && (
                <Alert>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <AlertDescription>
                    Automatically retrying in {retryCountdown} seconds... (Attempt {retryCount + 1}{' '}
                    of {maxRetries})
                  </AlertDescription>
                  <Progress
                    value={
                      (1 - retryCountdown / Math.ceil((1000 * Math.pow(2, retryCount)) / 1000)) *
                      100
                    }
                    className="mt-2"
                  />
                </Alert>
              )}

              {retryCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  Retry attempt {retryCount} of {maxRetries}
                </p>
              )}

              {error && (
                <details className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
                  <summary className="cursor-pointer font-medium mb-2">Technical details</summary>
                  <pre className="whitespace-pre-wrap break-words mt-2">
                    {error.message}
                    {error.stack && (
                      <>
                        {'\n\nStack trace:\n'}
                        {error.stack}
                      </>
                    )}
                  </pre>
                </details>
              )}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              {recoveryActions.map((action, index) => (
                <Button
                  key={index}
                  onClick={action.action}
                  variant={
                    action.type === 'primary'
                      ? 'default'
                      : action.type === 'danger'
                        ? 'destructive'
                        : 'outline'
                  }
                  disabled={isRetrying}
                  data-testid={`button-recovery-${index}`}
                  className="flex-1 min-w-[120px]"
                >
                  {action.label}
                </Button>
              ))}
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
