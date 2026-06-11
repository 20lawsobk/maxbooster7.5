/**
 * React Query Client & API Fetch Utilities
 *
 * Central module for all HTTP communication between the React app and the
 * Express backend.  Exports a pre-configured QueryClient used by the
 * QueryClientProvider in App?.tsx, plus helper functions.
 *
 * Key exports:
 *   queryClient       — Singleton QueryClient (staleTime 5min, no window-focus refetch)
 *   apiRequest()      — Typed fetch wrapper with timeout, structured error classes,
 *                       and automatic Sentry breadcrumbs
 *   getQueryFn()      — React Query queryFn factory used as the global default;
 *                       supports 'returnNull' on 401 for optional-auth queries
 *   uploadWithProgress() — XHR wrapper for file uploads with progress callbacks
 *   ApiError          — Structured error class with code, userMessage, retryable flag
 *   getRateLimitState / clearRateLimitState — Client-side 429 throttle tracking
 *
 * Error handling:
 *   All 4xx/5xx responses are mapped to ApiError instances with a `userMessage`
 *   field safe to display to users.  The MutationCache shows a toast for any
 *   mutation that doesn't provide its own onError handler.
 */

import {
  QueryClient,
  QueryCache,
  QueryFunction,
  MutationCache,
} from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { errorService, captureException } from "./errorService";

const _DEFAULT_TIMEOUT_MS = 30000;

// ── In-memory JWT session token store ────────────────────────────────────────
// Stores the short-lived access token issued at login / refresh so it can be
// sent as "Authorization: Bearer <token>" on every API request.  This gives
// the server's JWT fallback (resolveJwtUser) a chance to authenticate the user
// even when the PDIM session store is temporarily unavailable.
let _sessionToken: string | null = null;

export function setAuthToken(token: string | null): void {
  _sessionToken = token;
}

export function getAuthToken(): string | null {
  return _sessionToken;
}

export function clearAuthToken(): void {
  _sessionToken = null;
}

export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "UNKNOWN";

export interface StructuredApiError {
  code: ApiErrorCode;
  message: string;
  userMessage: string;
  status?: number;
  retryAfter?: number;
  retryable: boolean;
  details?: Record<string, unknown>;
  suggestions: string[];
}

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly status?: number;
  public readonly retryAfter?: number;
  public readonly retryable: boolean;
  public readonly userMessage: string;
  public readonly details?: Record<string, unknown>;
  public readonly suggestions: string[];

  constructor(structured: StructuredApiError) {
    super(structured?.message);
    this?.name = "ApiError";
    this?.code = structured?.code;
    this?.status = structured?.status;
    this?.retryAfter = structured?.retryAfter;
    this?.retryable = structured?.retryable;
    this?.userMessage = structured?.userMessage;
    this?.details = structured?.details;
    this?.suggestions = structured?.suggestions;
  }

  static fromResponse(res: Response, body: string): ApiError {
    const _status = res?.status;
    let parsed: Record<string, unknown> = {};

    try {
      parsed = JSON?.parse(body);
    } catch {
      parsed = { message: body || res?.statusText };
    }

    const _serverMessage = (parsed?.error ||
      parsed?.message ||
      body ||
      res?.statusText) as string;

    switch (status) {
      case 401:
        return new ApiError({
          code: "UNAUTHORIZED",
          message: serverMessage,
          userMessage: "Your session has expired. Please log in again.",
          status,
          retryable: false,
          suggestions: ["Log in again", "Check your credentials"],
        });

      case 403: {
        const _isDemoBlock = (parsed as Record<string, unknown>).isDemo === true;
        return new ApiError({
          code: "FORBIDDEN",
          message: serverMessage,
          userMessage: isDemoBlock
            ? "This feature is read-only in demo mode. Subscribe to unlock full access."
            : "You don't have permission to perform this action.",
          status,
          retryable: false,
          details: isDemoBlock
            ? { isDemo: true, upgradeUrl: "/pricing" }
            : undefined,
          suggestions: isDemoBlock
            ? ["Subscribe to unlock full access", "Visit the pricing page"]
            : ["Contact your administrator", "Check your subscription status"],
        });
      }

      case 404:
        return new ApiError({
          code: "NOT_FOUND",
          message: serverMessage,
          userMessage: "The requested resource was not found.",
          status,
          retryable: false,
          suggestions: ["Check the URL", "The item may have been deleted"],
        });

      case 422:
        return new ApiError({
          code: "VALIDATION_ERROR",
          message: serverMessage,
          userMessage: "Please check your input and try again.",
          status,
          retryable: false,
          details: parsed?.errors as Record<string, unknown> | undefined,
          suggestions: ["Review the form for errors", "Check required fields"],
        });

      case 429:
        const _retryAfter = parseInt(res?.headers.get("Retry-After") || "60", 10);
        return new ApiError({
          code: "RATE_LIMITED",
          message: serverMessage,
          userMessage: `Too many requests. Please wait ${retryAfter} seconds before trying again.`,
          status,
          retryAfter,
          retryable: true,
          suggestions: [
            `Wait ${retryAfter} seconds`,
            "Reduce request frequency",
            "Contact support if this persists",
          ],
        });

      case 500:
        return new ApiError({
          code: "SERVER_ERROR",
          message: serverMessage,
          userMessage:
            "Something went wrong on our end. Please try again later.",
          status,
          retryable: true,
          suggestions: [
            "Wait a moment and try again",
            "Contact support if this persists",
          ],
        });

      case 502:
      case 503:
      case 504:
        return new ApiError({
          code: "SERVICE_UNAVAILABLE",
          message: serverMessage,
          userMessage:
            "Our service is temporarily unavailable. Please try again in a moment.",
          status,
          retryable: true,
          suggestions: ["Wait a moment and try again", "Check our status page"],
        });

      default:
        if (status >= 400 && status < 500) {
          return new ApiError({
            code: "UNKNOWN",
            message: serverMessage,
            userMessage: "There was a problem with your request.",
            status,
            retryable: false,
            suggestions: ["Try again", "Contact support if this persists"],
          });
        }
        return new ApiError({
          code: "SERVER_ERROR",
          message: serverMessage,
          userMessage: "An unexpected error occurred.",
          status,
          retryable: true,
          suggestions: ["Try again", "Contact support if this persists"],
        });
    }
  }

  static networkError(url: string): ApiError {
    return new ApiError({
      code: "NETWORK_ERROR",
      message: `Network error while fetching ${url}`,
      userMessage: "Unable to connect. Please check your internet connection.",
      retryable: true,
      suggestions: [
        "Check your internet connection",
        "Try disabling VPN or proxy",
        "Wait a moment and try again",
      ],
    });
  }

  static timeoutError(url: string, timeoutMs: number): ApiError {
    return new ApiError({
      code: "TIMEOUT",
      message: `Request to ${url} timed out after ${timeoutMs}ms`,
      userMessage: "The request took too long. Please try again.",
      retryable: true,
      suggestions: [
        "Check your internet connection",
        "Try with a smaller file or request",
        "Wait a moment and try again",
      ],
    });
  }
}

/** Read the CSRF token set by the server (httpOnly=false, same-origin cookie). */
export function getCsrfTokenFromCookie(): string | null {
  try {
    const _match = document?.cookie
      .split("; ")
      .find((row) => row?.startsWith("csrf-token="));
    return match ? decodeURIComponent(match?.split("=")[1]) : null;
  } catch {
    return null;
  }
}

const _CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

let rateLimitState: {
  isRateLimited: boolean;
  retryAfter: number | null;
  resetTime: number | null;
} = {
  isRateLimited: false,
  retryAfter: null,
  resetTime: null,
};

export function getRateLimitState() {
  if (rateLimitState?.resetTime && Date?.now() > rateLimitState?.resetTime) {
    rateLimitState = {
      isRateLimited: false,
      retryAfter: null,
      resetTime: null,
    };
  }
  return { ...rateLimitState };
}

export function clearRateLimitState() {
  rateLimitState = { isRateLimited: false, retryAfter: null, resetTime: null };
}

function setRateLimited(retryAfter: number) {
  rateLimitState = {
    isRateLimited: true,
    retryAfter,
    resetTime: Date?.now() + retryAfter * 1000,
  };
}

// Create an AbortController with timeout - returns controller, cleanup, and timeout flag
function createAbortControllerWithTimeout(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): {
  controller: AbortController;
  cleanup: () => void;
  wasTimeout: () => boolean;
} {
  const _controller = new AbortController();
  let timedOut = false;

  const _timeoutId = setTimeout(() => {
    timedOut = true;
    controller?.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  const _cleanup = () => {
    clearTimeout(timeoutId);
  };

  const _wasTimeout = () => timedOut;

  return { controller, cleanup, wasTimeout };
}

async function throwIfResNotOk(res: Response) {
  if (!res?.ok) {
    const _text = (await res?.text()) || res?.statusText;
    const _apiError = ApiError?.fromResponse(res, text);

    if (apiError?.code === "RATE_LIMITED" && apiError?.retryAfter) {
      setRateLimited(apiError?.retryAfter);
    }

    // Only report true server errors (5xx) to the error service.
    // 4xx responses are expected business-logic outcomes (validation, conflicts,
    // auth challenges) and are handled by each call site's own catch / onError.
    // Sending them to captureException triggers spurious "Info" toasts for
    // things like "Slug already taken" or "Unauthorized".
    if (res?.status >= 500) {
      captureException(apiError, {
        action: "api-response-error",
        metadata: {
          status: res?.status,
          url: res?.url,
          statusText: res?.statusText,
          errorCode: apiError?.code,
        },
      });
    }

    throw apiError;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: {
    timeout?: number;
    signal?: AbortSignal;
    retryCount?: number;
    maxRetries?: number;
  },
): Promise<Response> {
  const _isFormData = data instanceof FormData;
  const _controllerWithCleanup = options?.signal
    ? null
    : createAbortControllerWithTimeout(options?.timeout);
  const _signal = options?.signal || controllerWithCleanup?.controller?.signal;

  try {
    errorService?.addBreadcrumb("api-request", {
      method,
      url,
      hasData: !!data,
    });

    const headers: Record<string, string> = {};

    if (!isFormData && data) {
      headers["Content-Type"] = "application/json";
    }

    // Include the in-memory JWT session token as a Bearer fallback so the
    // server can authenticate the request even when PDIM session fetch fails.
    const _authToken = getAuthToken();
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    // Include the CSRF double-submit token for every state-mutating request
    if (!CSRF_SAFE_METHODS?.has(method?.toUpperCase())) {
      const _csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken;
      }
    }

    const _res = await fetch(url, {
      method,
      headers,
      body: isFormData ? data : data ? JSON?.stringify(data) : undefined,
      credentials: "include",
      signal,
    });

    controllerWithCleanup?.cleanup();
    await throwIfResNotOk(res);
    return res;
  } catch (error: unknown) {
    controllerWithCleanup?.cleanup();

    if (error instanceof ApiError) {
      throw error;
    }

    const _err = error as Error;
    if (err?.name === "AbortError" || err?.message?.includes("timeout")) {
      const _timeoutError = ApiError?.timeoutError(
        url,
        options?.timeout || DEFAULT_TIMEOUT_MS,
      );
      captureException(timeoutError, {
        action: "api-timeout",
        metadata: { method, url },
      });
      throw timeoutError;
    }

    if (
      err?.message?.includes("NetworkError") ||
      err?.message?.includes("fetch") ||
      err?.name === "TypeError"
    ) {
      const _networkError = ApiError?.networkError(url);
      captureException(networkError, {
        action: "api-network-error",
        metadata: { method, url },
      });
      throw networkError;
    }

    throw error;
  }
}

/**
 * Upload FormData with progress tracking using the same auth/CSRF handling as apiRequest.
 * Uses XMLHttpRequest internally to support progress events.
 */
export async function uploadWithProgress(
  url: string,
  data: FormData,
  options?: {
    onProgress?: (percent: number) => void;
    timeout?: number;
  },
): Promise<unknown> {
  const _timeoutMs = options?.timeout || 300000;

  errorService?.addBreadcrumb("upload-request", {
    url,
    hasData: true,
  });

  return new Promise((resolve, reject) => {
    const _xhr = new XMLHttpRequest();
    xhr?.open("POST", url);
    xhr?.withCredentials = true;
    xhr?.timeout = timeoutMs;

    // Include the CSRF double-submit token (POST is a mutating method)
    const _csrfToken = getCsrfTokenFromCookie();
    if (csrfToken) {
      xhr?.setRequestHeader("x-csrf-token", csrfToken);
    }

    xhr?.upload.addEventListener("progress", (event) => {
      if (event?.lengthComputable && options?.onProgress) {
        const _percentComplete = Math?.round((event?.loaded / event?.total) * 100);
        options?.onProgress(percentComplete);
      }
    });

    xhr?.addEventListener("load", () => {
      if (xhr?.status >= 200 && xhr?.status < 300) {
        try {
          resolve(JSON?.parse(xhr?.responseText));
        } catch {
          resolve({ success: true });
        }
      } else {
        let errorMessage = `Upload failed with status ${xhr?.status}`;

        if (xhr?.status === 401) {
          errorMessage = "Please log in to upload files";
        } else if (xhr?.status === 403) {
          errorMessage = "You do not have permission to upload files";
        } else {
          try {
            const _errorData = JSON?.parse(xhr?.responseText);
            errorMessage = errorData?.error || errorData?.message || errorMessage;
          } catch {
            // Use default error message
          }
        }

        const _error = new Error(errorMessage);
        // Only report true server errors (5xx) — 4xx are expected business responses
        if (xhr?.status >= 500) {
          captureException(error, {
            action: "upload-response-error",
            metadata: { status: xhr?.status, url },
          });
        }
        reject(error);
      }
    });

    xhr?.addEventListener("error", () => {
      const _error = new Error(
        "Network error during upload. Please check your connection.",
      );
      captureException(error, {
        action: "upload-network-error",
        metadata: { url },
      });
      reject(error);
    });

    xhr?.addEventListener("timeout", () => {
      const _error = new Error(
        "Upload timed out. Try a smaller file or check your connection.",
      );
      captureException(error, {
        action: "upload-timeout",
        metadata: { url, timeoutMs },
      });
      reject(error);
    });

    xhr?.addEventListener("abort", () => {
      const _error = new Error("Upload was cancelled");
      reject(error);
    });

    xhr?.send(data);
  });
}

type UnauthorizedBehavior = "returnNull" | "throw";

// Helper to build URL from queryKey, handling objects as query parameters
function buildUrlFromQueryKey(queryKey: readonly unknown[]): string {
  const urlParts: string[] = [];
  const queryParams: URLSearchParams = new URLSearchParams();

  for (const part of queryKey) {
    if (typeof part === "string") {
      urlParts?.push(part);
    } else if (part && typeof part === "object" && !Array?.isArray(part)) {
      // Object - convert to query parameters
      for (const [key, value] of Object?.entries(part)) {
        if (value !== undefined && value !== null) {
          queryParams?.append(key, String(value));
        }
      }
    }
  }

  const _baseUrl = urlParts?.join("/");
  const _queryString = queryParams?.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const _controllerWithCleanup = signal
      ? null
      : createAbortControllerWithTimeout();
    const _abortSignal = signal || controllerWithCleanup?.controller?.signal;

    try {
      const _url = buildUrlFromQueryKey(queryKey);

      errorService?.addBreadcrumb("query-fetch", {
        queryKey: url,
      });

      const _res = await fetch(url, {
        credentials: "include",
        signal: abortSignal,
      });

      controllerWithCleanup?.cleanup();

      if (unauthorizedBehavior === "returnNull" && res?.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res?.json();
    } catch (error: unknown) {
      controllerWithCleanup?.cleanup();
      const _url = buildUrlFromQueryKey(queryKey);
      const _err = error as Error;

      // Check if this was an AbortError
      if (err?.name === "AbortError") {
        // Only treat as timeout if our timeout actually fired
        // Otherwise this is a normal React Query cancellation (component unmount, refetch, etc.)
        if (controllerWithCleanup?.wasTimeout()) {
          const _timeoutError = new Error(`Query ${url} timed out`);
          captureException(timeoutError, {
            action: "query-timeout",
            metadata: { queryKey: url },
          });
          throw timeoutError;
        }
        // Normal cancellation - don't log as error, just silently cancel
        throw error;
      }

      // Handle explicit timeout message in error
      if (err?.message?.includes("timeout")) {
        const _timeoutError = new Error(`Query ${url} timed out`);
        captureException(timeoutError, {
          action: "query-timeout",
          metadata: { queryKey: url },
        });
        throw timeoutError;
      }

      // ApiErrors (4xx / 5xx HTTP responses) have already been processed by
      // throwIfResNotOk — 5xx ones were captured there; 4xx ones are expected
      // business logic (auth challenges, validation, conflicts) and are handled
      // by each query's own onError / queryCache?.onError.  Re-capturing them
      // here would fire a spurious "Info" toast for every failed query.
      if (!(error instanceof ApiError)) {
        captureException(error, {
          action: "query-error",
          metadata: { queryKey: url },
        });
      }

      throw error;
    }
  };

// Enhanced retry logic with exponential backoff

// Determine if error is retryable

export const _queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: Error, query) => {
      if ((query?.meta as { silentError?: boolean } | undefined)?.silentError)
        return;
      const _apiError = error as ApiError & {
        userMessage?: string;
        status?: number;
      };
      if (apiError?.status === 401 || apiError?.status === 403) return;
      // Suppress toast for background refetch failures — the query already has
      // stale data displayed and re-showing a red banner while the user is
      // typing/pasting is disruptive and misleading.  Only surface the error
      // when there is NO prior successful data (i?.e. initial load failed).
      const _hasExistingData = query?.state.dataUpdatedAt > 0;
      if (hasExistingData) return;
      const _message =
        apiError?.userMessage ||
        error?.message ||
        "Failed to load data. Please refresh or try again.";
      toast({
        title: "Data Load Error",
        description: message,
        variant: "destructive",
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: Error, _variables, _context, mutation) => {
      if (mutation?.options.onError) return;
      const _apiError = error as ApiError & { userMessage?: string };
      const _mutationKey = mutation?.options.mutationKey;
      console?.warn("[MutationCache] Unhandled mutation error:", {
        status: apiError?.status,
        code: apiError?.code,
        message: error?.message,
        userMessage: apiError?.userMessage,
        mutationKey,
      });
      const _message =
        apiError?.userMessage ||
        error?.message ||
        "Something went wrong. Please try again.";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      // Keep data in memory for 1 hour — navigating back to a visited page
      // is instant because the data is still alive in the cache.
      gcTime: 60 * 60 * 1000,
      retry: false,
      // Show previous page data while new data loads — eliminates the
      // "blank/skeleton flash" when switching between routes.
      placeholderData: (previousData: unknown) => previousData,
    },
    mutations: {
      retry: false,
    },
  },
});
