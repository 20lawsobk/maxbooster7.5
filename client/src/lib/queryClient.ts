import { QueryClient, QueryFunction } from '@tanstack/react-query';
import { errorService, captureException } from './errorService';

const DEFAULT_TIMEOUT_MS = 30000;

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';

function getCsrfToken(): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

async function ensureCsrfToken(): Promise<string | null> {
  let token = getCsrfToken();
  if (!token) {
    try {
      const response = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        token = data.csrfToken;
      }
    } catch (error) {
      console.warn('Failed to fetch CSRF token:', error);
    }
  }
  return token;
}

// Create an AbortController with timeout
function createAbortControllerWithTimeout(timeoutMs: number = DEFAULT_TIMEOUT_MS): AbortController {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  // Clear timeout if request completes
  const originalAbort = controller.abort.bind(controller);
  controller.abort = function (reason?: unknown) {
    clearTimeout(timeoutId);
    originalAbort(reason);
  };

  return controller;
}

/**
 * TODO: Add function documentation
 */
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const error = new Error(`${res.status}: ${text}`);

    // Capture error to our error service
    captureException(error, {
      action: 'api-response-error',
      metadata: {
        status: res.status,
        url: res.url,
        statusText: res.statusText,
      },
    });

    throw error;
  }
}

/**
 * TODO: Add function documentation
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: {
    timeout?: number;
    signal?: AbortSignal;
    retryCount?: number;
    maxRetries?: number;
  }
): Promise<Response> {
  const isFormData = data instanceof FormData;
  const controller = options?.signal ? null : createAbortControllerWithTimeout(options?.timeout);
  const signal = options?.signal || controller?.signal;

  try {
    errorService.addBreadcrumb('api-request', {
      method,
      url,
      hasData: !!data,
    });

    const headers: Record<string, string> = {};
    
    if (!isFormData && data) {
      headers['Content-Type'] = 'application/json';
    }

    const isMutationMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
    if (isMutationMethod) {
      const csrfToken = await ensureCsrfToken();
      if (csrfToken) {
        headers[CSRF_HEADER] = csrfToken;
      }
    }

    const res = await fetch(url, {
      method,
      headers,
      body: isFormData ? data : data ? JSON.stringify(data) : undefined,
      credentials: 'include',
      signal,
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error: unknown) {
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      const timeoutError = new Error(`Request to ${url} timed out`);
      captureException(timeoutError, {
        action: 'api-timeout',
        metadata: { method, url },
      });
      throw timeoutError;
    }

    if (error.message?.includes('NetworkError') || error.message?.includes('fetch')) {
      captureException(error, {
        action: 'api-network-error',
        metadata: { method, url },
      });
    }

    throw error;
  }
}

type UnauthorizedBehavior = 'returnNull' | 'throw';
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const controller = signal ? null : createAbortControllerWithTimeout();
    const abortSignal = signal || controller?.signal;

    try {
      errorService.addBreadcrumb('query-fetch', {
        queryKey: queryKey.join('/'),
      });

      const res = await fetch(queryKey.join('/') as string, {
        credentials: 'include',
        signal: abortSignal,
      });

      if (unauthorizedBehavior === 'returnNull' && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error: unknown) {
      // Handle timeout errors
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        const timeoutError = new Error(`Query ${queryKey.join('/')} timed out`);
        captureException(timeoutError, {
          action: 'query-timeout',
          metadata: { queryKey: queryKey.join('/') },
        });
        throw timeoutError;
      }

      // Capture other errors
      captureException(error, {
        action: 'query-error',
        metadata: { queryKey: queryKey.join('/') },
      });

      throw error;
    }
  };

// Enhanced retry logic with exponential backoff
function retryDelayWithJitter(attemptIndex: number): number {
  const baseDelay = Math.min(1000 * Math.pow(2, attemptIndex), 30000);
  const jitter = Math.random() * 1000; // Add up to 1 second of jitter
  return baseDelay + jitter;
}

// Determine if error is retryable
function shouldRetry(error: unknown): boolean {
  // Don't retry on client errors (4xx)
  if (error.message?.includes('401') || error.message?.includes('403')) {
    return false;
  }
  if (error.message?.match(/4\d{2}/)) {
    return false;
  }

  // Don't retry on server errors (5xx) to prevent loading loops
  if (error.message?.match(/5\d{2}/)) {
    return false;
  }

  // Only retry on network errors and timeouts
  return (
    error.message?.includes('NetworkError') ||
    error.message?.includes('fetch') ||
    error.message?.includes('timeout') ||
    error.name === 'NetworkError' ||
    error.name === 'TimeoutError'
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: 'throw' }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false, // Disable auto-refetch on reconnect
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime in v4)
      retry: false, // Disable all automatic retries - let users retry manually
    },
    mutations: {
      retry: false, // Disable all automatic retries for mutations
    },
  },
});
