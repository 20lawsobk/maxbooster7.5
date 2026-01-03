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

// Create an AbortController with timeout - returns controller and cleanup function
function createAbortControllerWithTimeout(timeoutMs: number = DEFAULT_TIMEOUT_MS): { 
  controller: AbortController; 
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeoutId);
  };

  return { controller, cleanup };
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
  const controllerWithCleanup = options?.signal ? null : createAbortControllerWithTimeout(options?.timeout);
  const signal = options?.signal || controllerWithCleanup?.controller.signal;

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

    controllerWithCleanup?.cleanup();
    await throwIfResNotOk(res);
    return res;
  } catch (error: unknown) {
    controllerWithCleanup?.cleanup();
    const err = error as Error;
    if (err?.name === 'AbortError' || err?.message?.includes('timeout')) {
      const timeoutError = new Error(`Request to ${url} timed out`);
      captureException(timeoutError, {
        action: 'api-timeout',
        metadata: { method, url },
      });
      throw timeoutError;
    }

    if (err?.message?.includes('NetworkError') || err?.message?.includes('fetch')) {
      captureException(error, {
        action: 'api-network-error',
        metadata: { method, url },
      });
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
  }
): Promise<unknown> {
  const csrfToken = await ensureCsrfToken();
  const timeoutMs = options?.timeout || 300000; // 5 minutes default for uploads
  
  errorService.addBreadcrumb('upload-request', {
    url,
    hasData: true,
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    
    if (csrfToken) {
      xhr.setRequestHeader(CSRF_HEADER, csrfToken);
    }
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && options?.onProgress) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        options.onProgress(percentComplete);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ success: true });
        }
      } else {
        let errorMessage = `Upload failed with status ${xhr.status}`;
        
        if (xhr.status === 401) {
          errorMessage = 'Please log in to upload files';
        } else if (xhr.status === 403) {
          errorMessage = 'You do not have permission to upload files';
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            // Use default error message
          }
        }
        
        const error = new Error(errorMessage);
        captureException(error, {
          action: 'upload-response-error',
          metadata: { status: xhr.status, url },
        });
        reject(error);
      }
    });
    
    xhr.addEventListener('error', () => {
      const error = new Error('Network error during upload. Please check your connection.');
      captureException(error, {
        action: 'upload-network-error',
        metadata: { url },
      });
      reject(error);
    });
    
    xhr.addEventListener('timeout', () => {
      const error = new Error('Upload timed out. Try a smaller file or check your connection.');
      captureException(error, {
        action: 'upload-timeout',
        metadata: { url, timeoutMs },
      });
      reject(error);
    });
    
    xhr.addEventListener('abort', () => {
      const error = new Error('Upload was cancelled');
      reject(error);
    });
    
    xhr.send(data);
  });
}

type UnauthorizedBehavior = 'returnNull' | 'throw';

// Helper to build URL from queryKey, handling objects as query parameters
function buildUrlFromQueryKey(queryKey: readonly unknown[]): string {
  const urlParts: string[] = [];
  const queryParams: URLSearchParams = new URLSearchParams();
  
  for (const part of queryKey) {
    if (typeof part === 'string') {
      urlParts.push(part);
    } else if (part && typeof part === 'object' && !Array.isArray(part)) {
      // Object - convert to query parameters
      for (const [key, value] of Object.entries(part)) {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      }
    }
  }
  
  const baseUrl = urlParts.join('/');
  const queryString = queryParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const controllerWithCleanup = signal ? null : createAbortControllerWithTimeout();
    const abortSignal = signal || controllerWithCleanup?.controller.signal;

    try {
      const url = buildUrlFromQueryKey(queryKey);
      
      errorService.addBreadcrumb('query-fetch', {
        queryKey: url,
      });

      const res = await fetch(url, {
        credentials: 'include',
        signal: abortSignal,
      });

      controllerWithCleanup?.cleanup();

      if (unauthorizedBehavior === 'returnNull' && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error: unknown) {
      controllerWithCleanup?.cleanup();
      const url = buildUrlFromQueryKey(queryKey);
      const err = error as Error;
      
      // Handle timeout errors
      if (err?.name === 'AbortError' || err?.message?.includes('timeout')) {
        const timeoutError = new Error(`Query ${url} timed out`);
        captureException(timeoutError, {
          action: 'query-timeout',
          metadata: { queryKey: url },
        });
        throw timeoutError;
      }

      // Capture other errors
      captureException(error, {
        action: 'query-error',
        metadata: { queryKey: url },
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
  const err = error as Error;
  // Don't retry on client errors (4xx)
  if (err?.message?.includes('401') || err?.message?.includes('403')) {
    return false;
  }
  if (err?.message?.match(/4\d{2}/)) {
    return false;
  }

  // Don't retry on server errors (5xx) to prevent loading loops
  if (err?.message?.match(/5\d{2}/)) {
    return false;
  }

  // Only retry on network errors and timeouts
  return (
    err?.message?.includes('NetworkError') ||
    err?.message?.includes('fetch') ||
    err?.message?.includes('timeout') ||
    err?.name === 'NetworkError' ||
    err?.name === 'TimeoutError'
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
