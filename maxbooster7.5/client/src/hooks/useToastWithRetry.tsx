import { useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/queryClient";

export type ToastVariant =
  | "default"
  | "success"
  | "destructive"
  | "warning"
  | "info";

export interface ToastWithRetryOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  retryFn?: () => Promise<void>;
  retryLabel?: string;
  undoFn?: () => void;
  undoLabel?: string;
  onDismiss?: () => void;
}

export function useToastWithRetry() {
  const activeToastsRef = useRef<Map<string, { dismiss: () => void }>>(
    new Map(),
  );

  const showToast = useCallback((options: ToastWithRetryOptions) => {
    const {
      title,
      description,
      variant = "default",
      duration = 5000,
      retryFn,
      retryLabel = "Retry",
      undoFn,
      undoLabel = "Undo",
      onDismiss,
    } = options;

    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let action: React.ReactNode = undefined;

    if (retryFn) {
      action = (
        <button
          onClick={async () => {
            const toastData = activeToastsRef.current.get(id);
            toastData?.dismiss();
            activeToastsRef.current.delete(id);

            try {
              await retryFn();
            } catch (err) {
              const error =
                err instanceof ApiError
                  ? err
                  : err instanceof Error
                    ? err
                    : new Error(String(err));
              showError("Retry failed", error.message);
            }
          }}
          className="inline-flex h-8 items-center justify-center rounded-md border border-transparent bg-secondary px-3 text-sm font-medium hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {retryLabel}
        </button>
      );
    } else if (undoFn) {
      action = (
        <button
          onClick={() => {
            const toastData = activeToastsRef.current.get(id);
            toastData?.dismiss();
            activeToastsRef.current.delete(id);
            undoFn();
          }}
          className="inline-flex h-8 items-center justify-center rounded-md border border-transparent bg-secondary px-3 text-sm font-medium hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {undoLabel}
        </button>
      );
    }

    const toastResult = toast({
      title,
      description,
      variant: variant as "default" | "destructive",
      duration,
      action: action as unknown as React.ReactNode,
    });

    activeToastsRef.current.set(id, toastResult);

    if (onDismiss) {
      setTimeout(() => {
        if (activeToastsRef.current.has(id)) {
          activeToastsRef.current.delete(id);
          onDismiss();
        }
      }, duration);
    }

    return {
      id,
      dismiss: () => {
        toastResult.dismiss();
        activeToastsRef.current.delete(id);
      },
      update: (newOptions: Partial<ToastWithRetryOptions>) => {
        toastResult.dismiss();
        activeToastsRef.current.delete(id);
        return showToast({ ...options, ...newOptions });
      },
    };
  }, []);

  const showSuccess = useCallback(
    (
      title: string,
      description?: string,
      options?: Partial<ToastWithRetryOptions>,
    ) => {
      return showToast({
        title,
        description,
        variant: "success",
        duration: 3000,
        ...options,
      });
    },
    [showToast],
  );

  const showError = useCallback(
    (
      title: string,
      description?: string,
      retryFn?: () => Promise<void>,
      options?: Partial<ToastWithRetryOptions>,
    ) => {
      return showToast({
        title,
        description,
        variant: "destructive",
        duration: 8000,
        retryFn,
        ...options,
      });
    },
    [showToast],
  );

  const showWarning = useCallback(
    (
      title: string,
      description?: string,
      options?: Partial<ToastWithRetryOptions>,
    ) => {
      return showToast({
        title,
        description,
        variant: "warning",
        duration: 6000,
        ...options,
      });
    },
    [showToast],
  );

  const showInfo = useCallback(
    (
      title: string,
      description?: string,
      options?: Partial<ToastWithRetryOptions>,
    ) => {
      return showToast({
        title,
        description,
        variant: "info",
        duration: 4000,
        ...options,
      });
    },
    [showToast],
  );

  const showWithUndo = useCallback(
    (
      title: string,
      description: string,
      undoFn: () => void,
      options?: Partial<ToastWithRetryOptions>,
    ) => {
      return showToast({
        title,
        description,
        variant: "default",
        duration: 8000,
        undoFn,
        ...options,
      });
    },
    [showToast],
  );

  const showApiError = useCallback(
    (error: unknown, retryFn?: () => Promise<void>) => {
      if (error instanceof ApiError) {
        return showToast({
          title: "Error",
          description: error.userMessage,
          variant: "destructive",
          duration: error.retryable ? 10000 : 6000,
          retryFn: error.retryable ? retryFn : undefined,
        });
      }

      const message = error instanceof Error ? error.message : String(error);
      return showError("Error", message, retryFn);
    },
    [showToast, showError],
  );

  const showRateLimitError = useCallback(
    (retryAfterSeconds: number) => {
      return showToast({
        title: "Too many requests",
        description: `Please wait ${retryAfterSeconds} seconds before trying again.`,
        variant: "warning",
        duration: (retryAfterSeconds + 2) * 1000,
      });
    },
    [showToast],
  );

  const dismissAll = useCallback(() => {
    activeToastsRef.current.forEach(({ dismiss }) => dismiss());
    activeToastsRef.current.clear();
  }, []);

  return {
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showWithUndo,
    showApiError,
    showRateLimitError,
    dismissAll,
  };
}

export function showSuccessToast(title: string, description?: string) {
  return toast({
    title,
    description,
    variant: "success",
    duration: 3000,
  });
}

export function showErrorToast(title: string, description?: string) {
  return toast({
    title,
    description,
    variant: "destructive",
    duration: 6000,
  });
}

export function showWarningToast(title: string, description?: string) {
  return toast({
    title,
    description,
    variant: "warning",
    duration: 5000,
  });
}

export function showInfoToast(title: string, description?: string) {
  return toast({
    title,
    description,
    variant: "info",
    duration: 4000,
  });
}
