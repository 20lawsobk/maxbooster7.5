import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

export type ErrorCategory =
  | 'network'
  | 'auth'
  | 'validation'
  | 'system'
  | 'timeout'
  | 'permission'
  | 'storage'
  | 'media'
  | 'unknown';

export interface ErrorContext {
  userId?: string;
  route?: string;
  timestamp: Date;
  userAgent?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
  stackTrace?: string;
  breadcrumbs?: Array<{ timestamp: Date; action: string; data?: any }>;
}

export interface ErrorReport {
  id: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  userMessage: string;
  error: Error | unknown;
  context: ErrorContext;
  recoveryActions?: ErrorRecoveryAction[];
  isTransient?: boolean;
  retryCount?: number;
  maxRetries?: number;
}

export interface ErrorRecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  type: 'primary' | 'secondary' | 'danger';
}

class ErrorService {
  private static instance: ErrorService;
  private errorQueue: ErrorReport[] = [];
  private isReporting = false;
  private breadcrumbs: Array<{ timestamp: Date; action: string; data?: any }> = [];
  private maxBreadcrumbs = 50;
  private retryDelays = [1000, 2000, 4000, 8000, 16000, 30000]; // Exponential backoff
  private errorCount = 0;
  private errorRateLimit = { max: 10, windowMs: 60000 }; // 10 errors per minute
  private lastErrorResetTime = Date.now();

  private constructor() {
    this.setupGlobalHandlers();
    this.setupPeriodicReporting();
  }

  static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  private setupGlobalHandlers() {
    // Handle unhandled errors
    window.addEventListener('error', (event) => {
      const message = event.message || '';
      if (message.includes('ResizeObserver loop')) {
        return;
      }
      this.handleError(event.error || new Error(event.message), {
        component: 'window',
        action: 'unhandled-error',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
      event.preventDefault();
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason, {
        component: 'promise',
        action: 'unhandled-rejection',
        metadata: {
          promise: event.promise,
        },
      });
      event.preventDefault();
    });

    // Track console errors
    const originalConsoleError = console.error;
    console.error = (...args) => {
      originalConsoleError.apply(console, args);
      this.addBreadcrumb('console.error', { args });
    };
  }

  private setupPeriodicReporting() {
    // Report errors to backend every 5 seconds if there are any queued
    setInterval(() => {
      if (this.errorQueue.length > 0 && !this.isReporting) {
        this.reportErrorsBatch();
      }
    }, 5000);
  }

  addBreadcrumb(action: string, data?: unknown) {
    this.breadcrumbs.push({
      timestamp: new Date(),
      action,
      data,
    });

    // Keep only the last N breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }
  }

  private categorizeError(error: Error | unknown): ErrorCategory {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : '';

    // Network errors
    if (
      errorMessage.includes('fetch') ||
      errorMessage.includes('network') ||
      errorMessage.includes('NetworkError') ||
      errorMessage.includes('Failed to fetch') ||
      errorName === 'NetworkError' ||
      (error instanceof TypeError && errorMessage.includes('fetch'))
    ) {
      return 'network';
    }

    // Auth errors
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return 'auth';
    }

    // Validation errors
    if (
      errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('required') ||
      errorMessage.includes('must be') ||
      errorMessage.includes('format')
    ) {
      return 'validation';
    }

    // Timeout errors
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out') ||
      errorName === 'TimeoutError'
    ) {
      return 'timeout';
    }

    // Permission errors
    if (
      errorMessage.includes('permission') ||
      errorMessage.includes('access denied') ||
      errorMessage.includes('not allowed')
    ) {
      return 'permission';
    }

    // Storage errors
    if (
      errorMessage.includes('quota') ||
      errorMessage.includes('storage') ||
      errorMessage.includes('IndexedDB') ||
      errorMessage.includes('localStorage')
    ) {
      return 'storage';
    }

    // Media errors
    if (
      errorMessage.includes('audio') ||
      errorMessage.includes('video') ||
      errorMessage.includes('media') ||
      errorMessage.includes('codec') ||
      errorMessage.includes('AudioContext')
    ) {
      return 'media';
    }

    // System errors
    if (
      errorMessage.includes('memory') ||
      errorMessage.includes('cpu') ||
      errorMessage.includes('system')
    ) {
      return 'system';
    }

    return 'unknown';
  }

  private determineSeverity(error: Error | unknown, category: ErrorCategory): ErrorSeverity {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Critical errors that break core functionality
    if (
      category === 'auth' ||
      category === 'system' ||
      errorMessage.includes('critical') ||
      errorMessage.includes('fatal')
    ) {
      return 'critical';
    }

    // Standard errors that affect features
    if (category === 'network' || category === 'timeout' || category === 'validation') {
      return 'error';
    }

    // Warnings that don't break functionality
    if (
      category === 'permission' ||
      category === 'storage' ||
      errorMessage.includes('deprecated') ||
      errorMessage.includes('warning')
    ) {
      return 'warning';
    }

    return 'info';
  }

  private isTransientError(category: ErrorCategory): boolean {
    return ['network', 'timeout', 'system'].includes(category);
  }

  private getUserFriendlyMessage(category: ErrorCategory, error: Error | unknown): string {
    const messages: Record<ErrorCategory, string> = {
      network: 'Connection issue detected. Please check your internet connection and try again.',
      auth: 'Authentication required. Please log in to continue.',
      validation: 'Please check your input and try again.',
      system: 'System resources are limited. Please try again in a moment.',
      timeout: 'The operation took too long. Please try again.',
      permission: "You don't have permission to perform this action.",
      storage: 'Storage space is running low. Please free up some space.',
      media: 'There was an issue with audio/video processing. Please try a different format.',
      unknown: 'An unexpected error occurred. Please try again.',
    };

    return messages[category];
  }

  private getRecoveryActions(
    category: ErrorCategory,
    context?: Partial<ErrorContext>
  ): ErrorRecoveryAction[] {
    const actions: ErrorRecoveryAction[] = [];

    switch (category) {
      case 'network':
      case 'timeout':
        actions.push({
          label: 'Retry',
          type: 'primary',
          action: () => window.location.reload(),
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

      case 'validation':
        actions.push({
          label: 'Review Form',
          type: 'primary',
          action: () => {
            // Focus on first invalid field if available
            const firstInvalid = document.querySelector('.error, [aria-invalid="true"]');
            if (firstInvalid instanceof HTMLElement) {
              firstInvalid.focus();
            }
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
              window.location.reload();
            }
          },
        });
        break;

      case 'system':
      case 'media':
        actions.push({
          label: 'Reload Page',
          type: 'primary',
          action: () => window.location.reload(),
        });
        break;
    }

    // Always add report issue action
    actions.push({
      label: 'Report Issue',
      type: 'secondary',
      action: () => this.showReportDialog(),
    });

    return actions;
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    if (now - this.lastErrorResetTime > this.errorRateLimit.windowMs) {
      this.errorCount = 0;
      this.lastErrorResetTime = now;
    }

    this.errorCount++;
    return this.errorCount <= this.errorRateLimit.max;
  }

  async handleError(
    error: Error | unknown,
    contextOverrides?: Partial<ErrorContext>,
    options?: {
      severity?: ErrorSeverity;
      silent?: boolean;
      showToast?: boolean;
      retryable?: boolean;
      maxRetries?: number;
    }
  ): Promise<void> {
    // Check rate limit
    if (!this.checkRateLimit()) {
      logger.warn('Error rate limit exceeded, suppressing error reporting');
      return;
    }

    const category = this.categorizeError(error);
    const severity = options?.severity || this.determineSeverity(error, category);
    const isTransient = this.isTransientError(category);

    const context: ErrorContext = {
      route: window.location.pathname,
      timestamp: new Date(),
      userAgent: navigator.userAgent,
      breadcrumbs: [...this.breadcrumbs],
      stackTrace: error instanceof Error ? error.stack : undefined,
      ...contextOverrides,
    };

    const errorReport: ErrorReport = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      severity,
      category,
      message: error instanceof Error ? error.message : String(error),
      userMessage: this.getUserFriendlyMessage(category, error),
      error,
      context,
      recoveryActions: this.getRecoveryActions(category, context),
      isTransient,
      retryCount: 0,
      maxRetries: options?.maxRetries || (isTransient ? 3 : 0),
    };

    // Log to console for debugging
    logger.error('[ErrorService]', errorReport);

    // Add to error queue for batch reporting
    this.errorQueue.push(errorReport);

    // Show user feedback if not silent
    if (!options?.silent && options?.showToast !== false) {
      this.showUserFeedback(errorReport);
    }

    // Handle transient errors with retry
    if (isTransient && options?.retryable !== false && errorReport.maxRetries > 0) {
      this.scheduleRetry(errorReport);
    }

    // Trigger immediate reporting for critical errors
    if (severity === 'critical') {
      this.reportErrorsBatch();
    }
  }

  private async scheduleRetry(errorReport: ErrorReport) {
    const retryCount = errorReport.retryCount || 0;
    const delay = this.retryDelays[Math.min(retryCount, this.retryDelays.length - 1)];

    setTimeout(() => {
      if (errorReport.recoveryActions && errorReport.recoveryActions[0]) {
        const retryAction = errorReport.recoveryActions[0];
        retryAction.action();
      }
    }, delay);
  }

  private showUserFeedback(errorReport: ErrorReport) {
    const { severity, userMessage, category } = errorReport;

    // Suppress timeout errors - they're transient and often resolve on retry
    if (category === 'timeout') {
      return;
    }

    // Use toast for non-critical errors
    if (severity === 'warning' || severity === 'info') {
      toast({
        title: severity === 'warning' ? 'Warning' : 'Info',
        description: userMessage,
        variant: severity === 'warning' ? 'destructive' : 'default',
      });
      return;
    }

    // For errors and critical issues, show toast without actions
    toast({
      title: severity === 'critical' ? 'Critical Error' : 'Error',
      description: userMessage,
      variant: 'destructive',
    });
  }

  private async reportErrorsBatch() {
    if (this.isReporting || this.errorQueue.length === 0) return;

    this.isReporting = true;
    const errors = [...this.errorQueue];
    this.errorQueue = [];

    try {
      const response = await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          errors: errors.map((e) => ({
            severity: e.severity,
            category: e.category,
            message: e.message,
            context: {
              ...e.context,
              timestamp: e.context.timestamp.toISOString(),
            },
            stackTrace: e.context.stackTrace,
          })),
        }),
      });

      if (!response.ok) {
        // Re-queue errors if reporting fails
        this.errorQueue.push(...errors);
      }
    } catch (error: unknown) {
      // Re-queue errors if reporting fails
      this.errorQueue.push(...errors);
      logger.error('Failed to report errors to backend:', error);
    } finally {
      this.isReporting = false;
    }
  }

  private showReportDialog() {
    // Get current error context
    const errorContext = {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      windowSize: `${window.innerWidth}x${window.innerHeight}`,
      breadcrumbs: this.breadcrumbs.slice(-10),
    };

    // Create mailto link with error context
    const subject = encodeURIComponent('Error Report - MAX Booster');
    const body = encodeURIComponent(
      `
Error Report
============

URL: ${errorContext.url}
Time: ${errorContext.timestamp}
Browser: ${errorContext.userAgent}
Screen: ${errorContext.screenResolution}
Window: ${errorContext.windowSize}

Recent Actions:
${errorContext.breadcrumbs.map((b) => `- ${b.action} at ${b.timestamp}`).join('\n')}

Please describe what you were doing when the error occurred:
[Your description here]
    `.trim()
    );

    window.open(`mailto:support@maxbooster.com?subject=${subject}&body=${body}`);
  }

  // Utility method for manual error capture
  captureException(error: Error | unknown, context?: Partial<ErrorContext>) {
    this.handleError(error, context, { showToast: true });
  }

  // Utility method for capturing messages
  captureMessage(
    message: string,
    severity: ErrorSeverity = 'info',
    context?: Partial<ErrorContext>
  ) {
    const error = new Error(message);
    this.handleError(error, context, { severity, showToast: true });
  }

  // Method to clear error history
  clearErrors() {
    this.errorQueue = [];
    this.breadcrumbs = [];
  }

  // Get current error stats
  getErrorStats() {
    return {
      queuedErrors: this.errorQueue.length,
      breadcrumbs: this.breadcrumbs.length,
      errorCount: this.errorCount,
    };
  }
}

// Export singleton instance
export const errorService = ErrorService.getInstance();

// Export helper functions for convenience
export const captureException = (error: Error | unknown, context?: Partial<ErrorContext>) =>
  errorService.captureException(error, context);

export const captureMessage = (
  message: string,
  severity: ErrorSeverity = 'info',
  context?: Partial<ErrorContext>
) => errorService.captureMessage(message, severity, context);

export const addBreadcrumb = (action: string, data?: unknown) =>
  errorService.addBreadcrumb(action, data);
