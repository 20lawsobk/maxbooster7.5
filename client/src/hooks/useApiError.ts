import { useState, useCallback, useRef, useEffect } from "react";
import { errorService, ErrorCategory } from "@/lib/errorService";
import { toast } from "@/hooks/use-toast";

export interface ApiErrorState {
  error: Error | null;
  isError: boolean;
  errorCategory: ErrorCategory | null;
  errorMessage: string;
  isRetrying: boolean;
  retryCount: number;
  isOffline: boolean;
}

export interface ApiErrorOptions {
  maxRetries?: number;
  retryDelay?: number;
  showToast?: boolean;
  onError?: (error: Error, category: ErrorCategory) => void;
  onRetry?: (attempt: number) => void;
  onSuccess?: () => void;
  retryableCategories?: ErrorCategory[];
}

export interface UseApiErrorResult extends ApiErrorState {
  execute: <T>(fn: () => Promise<T>) => Promise<T | null>;
  reset: () => void;
  retry: () => Promise<void>;
  cancel: () => void;
}

const DEFAULT_RETRYABLE_CATEGORIES: ErrorCategory[] = [
  "network",
  "timeout",
  "system",
];

function categorizeError(error: Error): ErrorCategory {
  const message = error?.message.toLowerCase();
  const name = error?.name.toLowerCase();

  if (
    message?.includes("network") ||
    message?.includes("fetch") ||
    name?.includes("network") ||
    message?.includes("failed to fetch")
  ) {
    return "network";
  }
  if (
    message?.includes("401") ||
    message?.includes("403") ||
    message?.includes("auth") ||
    message?.includes("unauthorized")
  ) {
    return "auth";
  }
  if (
    message?.includes("timeout") ||
    name?.includes("timeout") ||
    message?.includes("timed out")
  ) {
    return "timeout";
  }
  if (
    message?.includes("400") ||
    message?.includes("422") ||
    message?.includes("validation") ||
    message?.includes("invalid")
  ) {
    return "validation";
  }
  if (
    message?.includes("permission") ||
    message?.includes("denied") ||
    message?.includes("forbidden")
  ) {
    return "permission";
  }
  if (message?.includes("storage") || message?.includes("quota")) {
    return "storage";
  }
  if (
    message?.includes("audio") ||
    message?.includes("media") ||
    message?.includes("video")
  ) {
    return "media";
  }
  if (
    message?.includes("500") ||
    message?.includes("502") ||
    message?.includes("503") ||
    message?.includes("504")
  ) {
    return "system";
  }
  return "unknown";
}

function getUserFriendlyMessage(category: ErrorCategory): string {
  const messages: Record<ErrorCategory, string> = {
    network:
      "Unable to connect. Please check your internet connection and try again.",
    auth: "Your session has expired. Please log in again.",
    validation: "Please check your input and try again.",
    system:
      "Our servers are temporarily unavailable. We're working to fix this.",
    timeout: "The request took too long. Please try again.",
    permission: "You don't have permission to perform this action.",
    storage: "Storage space is running low.",
    media: "There was an issue processing the media file.",
    unknown: "Something went wrong. Please try again.",
  };
  return messages[category];
}

export function useApiError(options: ApiErrorOptions = {}): UseApiErrorResult {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    showToast = true,
    onError,
    onRetry,
    onSuccess,
    retryableCategories = DEFAULT_RETRYABLE_CATEGORIES,
  } = options;

  const [state, setState] = useState<ApiErrorState>({
    error: null,
    isError: false,
    errorCategory: null,
    errorMessage: "",
    isRetrying: false,
    retryCount: 0,
    isOffline: !navigator?.onLine,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastOperationRef = useRef<(() => Promise<unknown>) | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleOnline = () =>
      setState((prev) => ({ ...prev, isOffline: false }));
    const handleOffline = () => {
      setState((prev) => ({ ...prev, isOffline: true }));
      if (showToast) {
        toast({
          title: "You're offline",
          description:
            "Some features may be unavailable. We'll reconnect automatically.",
          variant: "warning",
        });
      }
    };

    window?.addEventListener("online", handleOnline);
    window?.addEventListener("offline", handleOffline);

    return () => {
      window?.removeEventListener("online", handleOnline);
      window?.removeEventListener("offline", handleOffline);
    };
  }, [showToast]);

  useEffect(() => {
    return () => {
      if (abortControllerRef?.current) {
        abortControllerRef?.current.abort();
      }
      if (retryTimeoutRef?.current) {
        clearTimeout(retryTimeoutRef?.current);
      }
    };
  }, []);

  const reset = useCallback(() => {
    setState({
      error: null,
      isError: false,
      errorCategory: null,
      errorMessage: "",
      isRetrying: false,
      retryCount: 0,
      isOffline: !navigator?.onLine,
    });
    lastOperationRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef?.current) {
      abortControllerRef?.current.abort();
      abortControllerRef.current = null;
    }
    if (retryTimeoutRef?.current) {
      clearTimeout(retryTimeoutRef?.current);
      retryTimeoutRef.current = null;
    }
    setState((prev) => ({ ...prev, isRetrying: false }));
  }, []);

  const execute = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | null> => {
      lastOperationRef.current = fn;
      abortControllerRef.current = new AbortController();

      try {
        if (state?.isOffline) {
          throw new Error(
            "No internet connection. Please check your network and try again.",
          );
        }

        setState((prev) => ({
          ...prev,
          isError: false,
          error: null,
          errorCategory: null,
          errorMessage: "",
        }));

        const result = await fn();

        setState((prev) => ({
          ...prev,
          retryCount: 0,
          isRetrying: false,
        }));

        onSuccess?.();
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err?.name === "AbortError") {
          return null;
        }

        const category = categorizeError(err);
        const userMessage = getUserFriendlyMessage(category);
        const isRetryable = retryableCategories?.includes(category);
        const currentRetry = state?.retryCount;

        setState((prev) => ({
          ...prev,
          error: err,
          isError: true,
          errorCategory: category,
          errorMessage: userMessage,
          retryCount: currentRetry,
        }));

        errorService?.handleError(
          err,
          {
            component: "useApiError",
            action: "api-call",
            metadata: { category, retryCount: currentRetry },
          },
          { showToast: false },
        );

        onError?.(err, category);

        if (isRetryable && currentRetry < maxRetries) {
          const delay = retryDelay * Math.pow(2, currentRetry);

          setState((prev) => ({ ...prev, isRetrying: true }));
          onRetry?.(currentRetry + 1);

          return new Promise((resolve) => {
            retryTimeoutRef.current = setTimeout(async () => {
              setState((prev) => ({
                ...prev,
                retryCount: prev.retryCount + 1,
              }));
              const result = await execute(fn);
              resolve(result);
            }, delay);
          });
        }

        if (showToast) {
          const toastVariant =
            category === "auth"
              ? "destructive"
              : category === "validation"
                ? "warning"
                : "destructive";
          toast({
            title: getErrorTitle(category),
            description: userMessage,
            variant: toastVariant,
          });
        }

        return null;
      }
    },
    [
      state?.isOffline,
      state?.retryCount,
      maxRetries,
      retryDelay,
      showToast,
      onError,
      onRetry,
      onSuccess,
      retryableCategories,
    ],
  );

  const retry = useCallback(async () => {
    if (lastOperationRef?.current) {
      setState((prev) => ({ ...prev, retryCount: 0 }));
      await execute(lastOperationRef?.current as () => Promise<unknown>);
    }
  }, [execute]);

  return {
    ...state,
    execute,
    reset,
    retry,
    cancel,
  };
}

function getErrorTitle(category: ErrorCategory): string {
  const titles: Record<ErrorCategory, string> = {
    network: "Connection Error",
    auth: "Authentication Required",
    validation: "Validation Error",
    system: "Server Error",
    timeout: "Request Timeout",
    permission: "Access Denied",
    storage: "Storage Error",
    media: "Media Error",
    unknown: "Error",
  };
  return titles[category];
}

export interface MutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error, category: ErrorCategory) => void;
  successMessage?: string;
  errorMessage?: string;
}

export function useApiMutation<TData, TVariables = void>(
  options: MutationOptions<TData, TVariables>,
) {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<TData | null>(null);
  const apiError = useApiError({
    onError: options.onError,
    onSuccess: () => {
      if (options?.successMessage) {
        toast({
          title: "Success",
          description: options.successMessage,
          variant: "success",
        });
      }
    },
  });

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | null> => {
      setIsLoading(true);
      try {
        const result = await apiError?.execute(() =>
          options?.mutationFn(variables),
        );
        if (result !== null) {
          setData(result);
          options?.onSuccess?.(result);
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [apiError, options],
  );

  const reset = useCallback(() => {
    setData(null);
    apiError?.reset();
  }, [apiError]);

  return {
    mutate,
    isLoading,
    data,
    ...apiError,
    reset,
  };
}

export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(!navigator?.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      if (isOffline) {
        setWasOffline(true);
        toast({
          title: "You're back online",
          description: "Your connection has been restored.",
          variant: "success",
        });
      }
      setIsOffline(false);
    };

    const handleOffline = () => {
      setIsOffline(true);
      toast({
        title: "You're offline",
        description: "Some features may be unavailable until you reconnect.",
        variant: "warning",
      });
    };

    window?.addEventListener("online", handleOnline);
    window?.addEventListener("offline", handleOffline);

    return () => {
      window?.removeEventListener("online", handleOnline);
      window?.removeEventListener("offline", handleOffline);
    };
  }, [isOffline]);

  return { isOffline, wasOffline };
}

export function useCancelableRequest<T>() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const execute = useCallback(
    async (
      requestFn: (
        signal: AbortSignal,
        onProgress?: (progress: number) => void,
      ) => Promise<T>,
    ): Promise<T | null> => {
      if (abortControllerRef?.current) {
        abortControllerRef?.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setIsLoading(true);
      setProgress(0);

      try {
        const result = await requestFn(
          abortControllerRef?.current.signal,
          setProgress,
        );
        setProgress(100);
        return result;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          toast({
            title: "Cancelled",
            description: "The operation was cancelled.",
            variant: "default",
          });
          return null;
        }
        throw error;
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    if (abortControllerRef?.current) {
      abortControllerRef?.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setProgress(0);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef?.current) {
        abortControllerRef?.current.abort();
      }
    };
  }, []);

  return {
    execute,
    cancel,
    isLoading,
    progress,
    isCancelable: isLoading,
  };
}
