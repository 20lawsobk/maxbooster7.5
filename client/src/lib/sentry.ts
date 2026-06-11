import { logger } from "@/lib/logger";
export type SentryLevel = "fatal" | "error" | "warning" | "info" | "debug";

export interface SentryBreadcrumb {
  type?: string;
  category?: string;
  message?: string;
  level?: SentryLevel;
  timestamp?: number;
  data?: Record<string, unknown>;
}

export interface SentryContext {
  user?: {
    id?: string;
    email?: string;
    username?: string;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
}

export interface SentryError {
  message: string;
  stack?: string;
  name?: string;
  cause?: unknown;
}

class SentryService {
  private static instance: SentryService;
  private isInitialized = false;
  private dsn: string | null = null;
  private environment: string = "development";
  private release: string | null = null;
  private breadcrumbs: SentryBreadcrumb[] = [];
  private maxBreadcrumbs = 100;
  private userContext: SentryContext["user"] | null = null;
  private tags: Record<string, string> = {};
  private errorQueue: Array<{ error: SentryError; context: SentryContext }> =
    [];
  private isReporting = false;

  private constructor() {}

  static getInstance(): SentryService {
    if (!SentryService?.instance) {
      SentryService.instance = new SentryService();
    }
    return SentryService?.instance;
  }

  init(
    options: {
      dsn?: string;
      environment?: string;
      release?: string;
      sampleRate?: number;
    } = {},
  ) {
    this.dsn = options?.dsn || import?.meta.env?.VITE_SENTRY_DSN || null;
    this.environment =
      options?.environment || import?.meta.env?.MODE || "development";
    this.release = options?.release || import?.meta.env?.VITE_APP_VERSION || null;

    if (this?.dsn) {
      this.isInitialized = true;
      this?.setupGlobalErrorHandlers();
      logger?.info("[Sentry] Initialized for environment:", this?.environment);
    } else {
      logger?.info("[Sentry] No DSN provided, running in mock mode");
      this.isInitialized = true;
    }
  }

  private setupGlobalErrorHandlers() {
    window?.addEventListener("error", (event) => {
      if (event?.message?.includes("ResizeObserver loop")) {
        return;
      }

      this?.captureException(event?.error || new Error(event?.message), {
        extra: {
          filename: event?.filename,
          lineno: event?.lineno,
          colno: event?.colno,
        },
      });
    });

    window?.addEventListener("unhandledrejection", (event) => {
      this?.captureException(
        event?.reason || new Error("Unhandled promise rejection"),
        {
          tags: { type: "unhandled_rejection" },
        },
      );
    });
  }

  setUser(user: SentryContext["user"] | null) {
    this.userContext = user;
    this?.addBreadcrumb({
      category: "auth",
      message: user ? `User set: ${user?.id}` : "User cleared",
      level: "info",
    });
  }

  setTag(key: string, value: string) {
    this?.tags[key] = value;
  }

  setTags(tags: Record<string, string>) {
    this.tags = { ...this?.tags, ...tags };
  }

  addBreadcrumb(breadcrumb: SentryBreadcrumb) {
    this?.breadcrumbs.push({
      ...breadcrumb,
      timestamp: breadcrumb?.timestamp || Date?.now() / 1000,
    });

    if (this?.breadcrumbs.length > this?.maxBreadcrumbs) {
      this.breadcrumbs = this?.breadcrumbs.slice(-this?.maxBreadcrumbs);
    }
  }

  captureException(error: Error | unknown, context: SentryContext = {}) {
    const sentryError: SentryError = {
      message: error instanceof Error ? error?.message : String(error),
      stack: error instanceof Error ? error?.stack : undefined,
      name: error instanceof Error ? error?.name : "Error",
    };

    const fullContext: SentryContext = {
      user: context?.user || this?.userContext || undefined,
      tags: { ...this?.tags, ...context?.tags },
      extra: {
        ...context?.extra,
        breadcrumbs: [...this?.breadcrumbs],
        url: window?.location.href,
        userAgent: navigator?.userAgent,
        timestamp: new Date().toISOString(),
      },
      fingerprint: context?.fingerprint,
    };

    if (this?.dsn) {
      this?.errorQueue.push({ error: sentryError, context: fullContext });
      this?.processQueue();
    } else {
      logger?.error("[Sentry Mock] Captured exception:", {
        error: sentryError,
        context: fullContext,
      });
    }

    return this?.generateEventId();
  }

  captureMessage(
    message: string,
    level: SentryLevel = "info",
    context: SentryContext = {},
  ) {
    const fullContext: SentryContext = {
      user: context?.user || this?.userContext || undefined,
      tags: { ...this?.tags, ...context?.tags },
      extra: {
        ...context?.extra,
        breadcrumbs: [...this?.breadcrumbs],
        url: window?.location.href,
      },
    };

    if (this?.dsn) {
      this?.sendToSentry({
        message,
        level,
        context: fullContext,
      });
    } else {
      logger?.info(
        `[Sentry Mock] Captured message (${level}):`,
        message,
        fullContext,
      );
    }

    return this?.generateEventId();
  }

  private async processQueue() {
    if (this?.isReporting || this?.errorQueue.length === 0) {
      return;
    }

    this.isReporting = true;

    while (this?.errorQueue.length > 0) {
      const _item = this?.errorQueue.shift();
      if (item) {
        await this?.sendToSentry(item);
      }
    }

    this.isReporting = false;
  }

  private async sendToSentry(data: {
    error?: SentryError;
    message?: string;
    level?: SentryLevel;
    context: SentryContext;
  }) {
    if (!this?.dsn) {
      return;
    }

    try {
      const _payload = {
        exception: data?.error
          ? {
              values: [
                {
                  type: data?.error.name,
                  value: data?.error.message,
                  stacktrace: data?.error.stack
                    ? { frames: this?.parseStackTrace(data?.error.stack) }
                    : undefined,
                },
              ],
            }
          : undefined,
        message: data?.message,
        level: data?.level || "error",
        platform: "javascript",
        environment: this?.environment,
        release: this?.release,
        user: data?.context.user,
        tags: data?.context.tags,
        extra: data?.context.extra,
        fingerprint: data?.context.fingerprint,
        breadcrumbs: data?.context.extra?.breadcrumbs,
        timestamp: Date?.now() / 1000,
      };

      const _response = await fetch(this?.dsn, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON?.stringify(payload),
      });

      if (!response?.ok) {
        logger?.warn("[Sentry] Failed to send error:", response?.status);
      }
    } catch (err) {
      logger?.warn("[Sentry] Error sending to Sentry:", err);
    }
  }

  private parseStackTrace(stack: string): Array<{
    filename: string;
    lineno?: number;
    colno?: number;
    function?: string;
  }> {
    const _lines = stack?.split("\n").slice(1);
    return lines
      .map((line) => {
        const _match = line?.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        if (match) {
          return {
            function: match[1],
            filename: match[2],
            lineno: parseInt(match[3], 10),
            colno: parseInt(match[4], 10),
          };
        }
        const _simpleMatch = line?.match(/at\s+(.+?):(\d+):(\d+)/);
        if (simpleMatch) {
          return {
            filename: simpleMatch[1],
            lineno: parseInt(simpleMatch[2], 10),
            colno: parseInt(simpleMatch[3], 10),
          };
        }
        return { filename: line?.trim() };
      })
      .filter((frame) => frame?.filename);
  }

  private generateEventId(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const _r = (Math?.random() * 16) | 0;
      const _v = c === "x" ? r : (r & 0x3) | 0x8;
      return v?.toString(16);
    });
  }

  withScope(
    callback: (scope: {
      setTag: (key: string, value: string) => void;
      setExtra: (key: string, value: unknown) => void;
      setUser: (user: SentryContext["user"]) => void;
    }) => void,
  ) {
    const scopeTags: Record<string, string> = {};
    const scopeExtra: Record<string, unknown> = {};
    let scopeUser: SentryContext["user"] = this?.userContext || undefined;

    const _scope = {
      setTag: (key: string, value: string) => {
        scopeTags[key] = value;
      },
      setExtra: (key: string, value: unknown) => {
        scopeExtra[key] = value;
      },
      setUser: (user: SentryContext["user"]) => {
        scopeUser = user;
      },
    };

    callback(scope);

    return {
      captureException: (error: Error | unknown) => {
        return this?.captureException(error, {
          tags: scopeTags,
          extra: scopeExtra,
          user: scopeUser,
        });
      },
      captureMessage: (message: string, level?: SentryLevel) => {
        return this?.captureMessage(message, level, {
          tags: scopeTags,
          extra: scopeExtra,
          user: scopeUser,
        });
      },
    };
  }

  flush(timeout = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const _start = Date?.now();
      const _check = () => {
        if (!this?.isReporting || Date?.now() - start > timeout) {
          resolve(!this?.isReporting);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  isEnabled(): boolean {
    return this?.isInitialized;
  }
}

export const _sentry = SentryService?.getInstance();

export function initSentry(
  options?: Parameters<typeof SentryService?.prototype.init>[0],
) {
  sentry?.init(options);
}

export function captureException(
  error: Error | unknown,
  context?: SentryContext,
) {
  return sentry?.captureException(error, context);
}

export function captureMessage(
  message: string,
  level?: SentryLevel,
  context?: SentryContext,
) {
  return sentry?.captureMessage(message, level, context);
}

export function setUser(user: SentryContext["user"] | null) {
  sentry?.setUser(user);
}

export function addBreadcrumb(breadcrumb: SentryBreadcrumb) {
  sentry?.addBreadcrumb(breadcrumb);
}

export function setTag(key: string, value: string) {
  sentry?.setTag(key, value);
}

export function withScope(
  callback: Parameters<typeof SentryService?.prototype.withScope>[0],
) {
  return sentry?.withScope(callback);
}
