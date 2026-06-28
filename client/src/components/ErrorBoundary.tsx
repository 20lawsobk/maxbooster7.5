import { Component, ErrorInfo, ReactNode, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Home, RefreshCw, Bug, WifiOff, Shield, Database, Clock, HardDrive, MessageSquare, FileQuestion, ServerCrash, CloudOff, ArrowLeft, Search, Mail, Zap } from "lucide-react";
import { errorService, ErrorSeverity, ErrorCategory, ErrorRecoveryAction } from "@/lib/errorService";

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
  errorCode: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    severity: "error",
    category: "unknown",
    userMessage: "An unexpected error occurred",
    recoveryActions: [],
    retryCount: 0,
    maxRetries: 3,
    isRetrying: false,
    retryCountdown: 0,
    hasReportedError: false,
    errorCode: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const category = ErrorBoundary.categorizeError(error);
    const severity = ErrorBoundary.determineSeverity(error, category);
    const isTransient = ErrorBoundary.isTransientError(category);
    const errorCode = ErrorBoundary.extractErrorCode(error);

    return {
      hasError: true,
      error,
      category,
      severity,
      userMessage: ErrorBoundary.getUserMessage(category, error),
      maxRetries: isTransient ? 3 : 0,
      errorCode,
    };
  }

  private static extractErrorCode(error: Error): string | null {
    const message = error.message;
    const match = message.match(/^(\d{3}):/);
    if (match) return match[1];
    if (message.includes("404")) return "404";
    if (message.includes("500")) return "500";
    if (message.includes("502")) return "502";
    if (message.includes("503")) return "503";
    if (message.includes("504")) return "504";
    return null;
  }

  private static categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (
      message.includes("network") ||
      message.includes("fetch") ||
      name.includes("network") ||
      message.includes("failed to fetch")
    ) {
      return "network";
    }
    if (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("auth") ||
      message.includes("unauthorized")
    ) {
      return "auth";
    }
    if (
      message.includes("timeout") ||
      name.includes("timeout") ||
      message.includes("timed out")
    ) {
      return "timeout";
    }
    if (
      message.includes("permission") ||
      message.includes("denied") ||
      message.includes("forbidden")
    ) {
      return "permission";
    }
    if (message.includes("storage") || message.includes("quota")) {
      return "storage";
    }
    if (message.includes("audio") || message.includes("media")) {
      return "media";
    }
    if (message.includes("memory") || message.includes("cpu")) {
      return "system";
    }
    if (message.includes("validation") || message.includes("invalid")) {
      return "validation";
    }
    return "unknown";
  }

  private static determineSeverity(
    _error: Error,
    category: ErrorCategory,
  ): ErrorSeverity {
    if (category === "auth" || category === "system") return "critical";
    if (category === "network" || category === "timeout") return "error";
    if (category === "permission" || category === "storage") return "warning";
    return "error";
  }

  private static isTransientError(category: ErrorCategory): boolean {
    return ["network", "timeout", "system"].includes(category);
  }

  private static getUserMessage(category: ErrorCategory, _error: Error): string {
    const messages: Record<ErrorCategory, string> = {
      network:
        "We're having trouble connecting to our servers. This could be a temporary network issue.",
      auth: "Your session has expired or you need to log in to access this feature.",
      validation:
        "Some information appears to be incorrect. Please review and try again.",
      system:
        "Our servers are experiencing high load. This should resolve automatically.",
      timeout:
        "The operation is taking longer than expected. Our servers might be busy.",
      permission:
        "You don't have permission to access this feature. Contact support if you think this is an error.",
      storage:
        "Storage space is running low. Please free up some space to continue.",
      media:
        "There was an issue processing audio/video. Try a different file or format.",
      unknown: "Something unexpected happened. Our team has been notified.",
    };

    return messages[category] || messages.unknown;
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (!this.state.hasReportedError) {
      errorService.handleError(
        error,
        {
          component: "ErrorBoundary",
          action: "component-error",
          metadata: {
            componentStack: errorInfo.componentStack,
            errorBoundary: true,
          },
        },
        {
          severity: this.state.severity,
          showToast: false,
          retryable: this.state.maxRetries > 0,
        },
      );

      this.setState({ hasReportedError: true });
    }

    const recoveryActions = this.getRecoveryActions();

    this.setState({
      errorInfo,
      recoveryActions,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    if (
      this.state.maxRetries > 0 &&
      this.state.retryCount < this.state.maxRetries
    ) {
      this.scheduleRetry();
    }
  }

  private getRecoveryActions(): ErrorRecoveryAction[] {
    const actions: ErrorRecoveryAction[] = [];
    const { category } = this.state;

    switch (category) {
      case "network":
      case "timeout":
        actions.push({
          label: "Retry Now",
          type: "primary",
          action: () => this.handleManualRetry(),
        });
        break;

      case "auth":
        actions.push({
          label: "Log In",
          type: "primary",
          action: () => {
            const returnUrl = encodeURIComponent(
              window.location.pathname + window.location.search,
            );
            window.location.href = `/login?returnUrl=${returnUrl}`;
          },
        });
        break;

      case "storage":
        actions.push({
          label: "Clear Cache",
          type: "primary",
          action: async () => {
            if ("caches" in window) {
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map((name) => caches.delete(name)));
              this.handleReset();
            }
          },
        });
        break;

      default:
        actions.push({
          label: "Try Again",
          type: "primary",
          action: () => this.handleReset(),
        });
    }

    actions.push({
      label: "Go Home",
      type: "secondary",
      action: () => this.handleGoHome(),
    });

    actions.push({
      label: "Report Issue",
      type: "secondary",
      action: () => this.handleReportIssue(),
    });

    return actions;
  }

  private scheduleRetry() {
    const retryDelay = Math.min(
      1000 * Math.pow(2, this.state.retryCount),
      30000,
    );
    const countdownSeconds = Math.ceil(retryDelay / 1000);

    this.setState({
      isRetrying: true,
      retryCountdown: countdownSeconds,
    });

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
    window.location.href = "/";
  };

  private handleReportIssue = () => {
    const { error, errorInfo } = this.state;

    errorService.addBreadcrumb("error-boundary-report", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    errorService.captureException(error || new Error("Unknown error"), {
      component: "ErrorBoundary",
      action: "manual-report",
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
      critical: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
      error:
        "bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
      warning:
        "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400",
      info: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
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
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      const { errorCode, category } = this.state;

      if (errorCode === "404") {
        return (
          <NotFoundErrorPage
            onGoHome={this.handleGoHome}
            onGoBack={() => window.history.back()}
          />
        );
      }

      if (errorCode === "500" || errorCode === "502" || errorCode === "503") {
        return (
          <ServerErrorPage
            errorCode={errorCode}
            onRetry={this.handleManualRetry}
            onGoHome={this.handleGoHome}
            onReportIssue={this.handleReportIssue}
          />
        );
      }

      if (category === "network") {
        return (
          <NetworkErrorPage
            isRetrying={this.state.isRetrying}
            retryCountdown={this.state.retryCountdown}
            retryCount={this.state.retryCount}
            maxRetries={this.state.maxRetries}
            onRetry={this.handleManualRetry}
            onGoHome={this.handleGoHome}
          />
        );
      }

      if (category === "timeout") {
        return (
          <TimeoutErrorPage
            isRetrying={this.state.isRetrying}
            retryCountdown={this.state.retryCountdown}
            onRetry={this.handleManualRetry}
            onGoHome={this.handleGoHome}
          />
        );
      }

      const {
        error,
        severity,
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
                      {severity === "critical"
                        ? "Critical Error"
                        : severity === "warning"
                          ? "Warning"
                          : "Something went wrong"}
                    </CardTitle>
                    <Badge
                      variant={
                        severity === "critical" ? "destructive" : "secondary"
                      }
                    >
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
                    Automatically retrying in {retryCountdown} seconds...
                    (Attempt {retryCount + 1} of {maxRetries})
                  </AlertDescription>
                  <Progress
                    value={
                      (1 -
                        retryCountdown /
                          Math.ceil((1000 * Math.pow(2, retryCount)) / 1000)) *
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

              <RecoverySuggestions category={category} />

              {error && (
                <details className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
                  <summary className="cursor-pointer font-medium mb-2">
                    Technical details
                  </summary>
                  <pre className="whitespace-pre-wrap break-words mt-2">
                    {error.message}
                    {error.stack && (
                      <>
                        {"\n\nStack trace:\n"}
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
                    action.type === "primary"
                      ? "default"
                      : action.type === "danger"
                        ? "destructive"
                        : "outline"
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

function RecoverySuggestions({ category }: { category: ErrorCategory }) {
  const suggestions: Record<ErrorCategory, string[]> = {
    network: [
      "Check your internet connection",
      "Try disabling VPN or proxy",
      "Clear your browser cache",
      "Try a different browser",
    ],
    auth: [
      "Log in again with your credentials",
      "Check if your account is active",
      "Reset your password if needed",
    ],
    validation: [
      "Review the form for errors",
      "Check required fields are filled",
      "Ensure data format is correct",
    ],
    system: [
      "Wait a few moments and try again",
      "Our team is likely already working on it",
      "Check our status page for updates",
    ],
    timeout: [
      "The server might be busy",
      "Try with smaller data sets",
      "Check your internet speed",
    ],
    permission: [
      "Verify your account type",
      "Contact your admin for access",
      "Check if your subscription is active",
    ],
    storage: [
      "Clear browser storage",
      "Remove old projects or files",
      "Check available disk space",
    ],
    media: [
      "Try a different file format",
      "Check if the file is corrupted",
      "Reduce file size if too large",
    ],
    unknown: [
      "Try refreshing the page",
      "Clear your browser cache",
      "Contact support if issue persists",
    ],
  };

  const items = suggestions[category] || suggestions.unknown;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
      <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Quick fixes to try
      </h4>
      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface NotFoundErrorPageProps {
  onGoHome: () => void;
  onGoBack: () => void;
}

function NotFoundErrorPage({ onGoHome, onGoBack }: NotFoundErrorPageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-lg w-full text-center">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-6">
            <FileQuestion className="h-12 w-12 text-purple-600 dark:text-purple-400" />
          </div>
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-2">
            404
          </h1>
          <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Page Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            The page you're looking for doesn't exist or has been moved. Don't
            worry, it happens to the best of us!
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={onGoBack} variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            <Button onClick={onGoHome} className="gap-2">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">
            Looking for something specific?
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <a
              href="/studio"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Zap className="h-4 w-4" />
              Studio
            </a>
            <a
              href="/dashboard"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Home className="h-4 w-4" />
              Dashboard
            </a>
            <a
              href="/marketplace"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Search className="h-4 w-4" />
              Marketplace
            </a>
            <a
              href="/help"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <MessageSquare className="h-4 w-4" />
              Help Center
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ServerErrorPageProps {
  errorCode: string;
  onRetry: () => void;
  onGoHome: () => void;
  onReportIssue: () => void;
}

function ServerErrorPage({
  errorCode,
  onRetry,
  onGoHome,
  onReportIssue,
}: ServerErrorPageProps) {
  const errorMessages: Record<string, { title: string; description: string }> =
    {
      "500": {
        title: "Internal Server Error",
        description:
          "Something went wrong on our end. Our team has been notified and is working on it.",
      },
      "502": {
        title: "Bad Gateway",
        description:
          "Our servers are temporarily unavailable. This usually resolves quickly.",
      },
      "503": {
        title: "Service Unavailable",
        description:
          "We're performing maintenance or experiencing high traffic. Please try again soon.",
      },
      "504": {
        title: "Gateway Timeout",
        description:
          "The server took too long to respond. Please try again in a moment.",
      },
    };

  const { title, description } =
    errorMessages[errorCode] || errorMessages["500"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
            <ServerCrash className="h-10 w-10 text-red-600 dark:text-red-400" />
          </div>
          <div className="text-5xl font-bold text-red-600 dark:text-red-400 mb-2">
            {errorCode}
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="text-base">{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
            <h4 className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
              What you can do:
            </h4>
            <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
              <li>• Wait a moment and try again</li>
              <li>• Check our status page for updates</li>
              <li>• Clear your browser cache</li>
              <li>• Contact support if the issue persists</li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={onRetry} className="flex-1 gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button onClick={onGoHome} variant="outline" className="flex-1 gap-2">
            <Home className="h-4 w-4" />
            Go Home
          </Button>
          <Button
            onClick={onReportIssue}
            variant="ghost"
            className="w-full gap-2"
          >
            <Mail className="h-4 w-4" />
            Report Issue
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

interface NetworkErrorPageProps {
  isRetrying: boolean;
  retryCountdown: number;
  retryCount: number;
  maxRetries: number;
  onRetry: () => void;
  onGoHome: () => void;
}

function NetworkErrorPage({
  isRetrying,
  retryCountdown,
  retryCount,
  maxRetries,
  onRetry,
  onGoHome,
}: NetworkErrorPageProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto mb-4">
            {isOnline ? (
              <CloudOff className="h-10 w-10 text-gray-600 dark:text-gray-400" />
            ) : (
              <WifiOff className="h-10 w-10 text-gray-600 dark:text-gray-400" />
            )}
          </div>
          <CardTitle className="text-xl">
            {isOnline ? "Connection Problem" : "You're Offline"}
          </CardTitle>
          <CardDescription className="text-base">
            {isOnline
              ? "We're having trouble reaching our servers. This could be a temporary issue."
              : "Check your internet connection and try again when you're back online."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`rounded-lg p-4 ${isOnline ? "bg-blue-50 dark:bg-blue-900/20" : "bg-yellow-50 dark:bg-yellow-900/20"}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2 h-2 rounded-full ${isOnline ? "bg-blue-500" : "bg-yellow-500"}`}
              />
              <span
                className={`text-sm font-medium ${isOnline ? "text-blue-900 dark:text-blue-100" : "text-yellow-900 dark:text-yellow-100"}`}
              >
                Status: {isOnline ? "Online (Server Issue)" : "Offline"}
              </span>
            </div>
            {!isOnline && (
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                The page will automatically refresh when your connection is
                restored.
              </p>
            )}
          </div>

          {isRetrying && retryCountdown > 0 && (
            <Alert>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Retrying in {retryCountdown} seconds... (Attempt{" "}
                {retryCount + 1} of {maxRetries})
              </AlertDescription>
              <Progress
                value={(1 - retryCountdown / 10) * 100}
                className="mt-2"
              />
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            onClick={onRetry}
            className="flex-1 gap-2"
            disabled={isRetrying || !isOnline}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
            />
            {isRetrying ? "Retrying..." : "Try Again"}
          </Button>
          <Button onClick={onGoHome} variant="outline" className="flex-1 gap-2">
            <Home className="h-4 w-4" />
            Go Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

interface TimeoutErrorPageProps {
  isRetrying: boolean;
  retryCountdown: number;
  onRetry: () => void;
  onGoHome: () => void;
}

function TimeoutErrorPage({
  isRetrying,
  retryCountdown,
  onRetry,
  onGoHome,
}: TimeoutErrorPageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-900/30 mx-auto mb-4">
            <Clock className="h-10 w-10 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-xl">Request Timed Out</CardTitle>
          <CardDescription className="text-base">
            The server took too long to respond. This usually means our servers
            are busy or there's a complex operation running.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
            <h4 className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-2">
              Tips:
            </h4>
            <ul className="text-sm text-orange-800 dark:text-orange-200 space-y-1">
              <li>• Try again in a few moments</li>
              <li>• For large files, try smaller batches</li>
              <li>• Check your internet connection speed</li>
              <li>• Peak hours may cause delays</li>
            </ul>
          </div>

          {isRetrying && retryCountdown > 0 && (
            <Alert>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Retrying in {retryCountdown} seconds...
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            onClick={onRetry}
            className="flex-1 gap-2"
            disabled={isRetrying}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
            />
            {isRetrying ? "Retrying..." : "Try Again"}
          </Button>
          <Button onClick={onGoHome} variant="outline" className="flex-1 gap-2">
            <Home className="h-4 w-4" />
            Go Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export {
  NotFoundErrorPage,
  ServerErrorPage,
  NetworkErrorPage,
  TimeoutErrorPage,
  RecoverySuggestions,
};
