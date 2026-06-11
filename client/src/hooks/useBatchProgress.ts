import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";

export type BatchProgressStatus =
  | "idle"
  | "starting"
  | "processing"
  | "completed"
  | "failed"
  | "partial"
  | "cancelled";

export interface BatchProgressState {
  status: BatchProgressStatus;
  current: number;
  total: number;
  percentage: number;
  currentItem?: string;
  currentItemIndex?: number;
  estimatedTimeRemaining?: number;
  elapsedTime: number;
  startTime?: number;
  endTime?: number;
  successCount: number;
  failureCount: number;
  failures: Array<{ id: string; error: string; index?: number }>;
}

export interface UseBatchProgressOptions {
  jobId?: string;
  pollingInterval?: number;
  autoStart?: boolean;
  onProgress?: (state: BatchProgressState) => void;
  onComplete?: (state: BatchProgressState) => void;
  onError?: (error: Error) => void;
}

export interface UseBatchProgressReturn {
  state: BatchProgressState;
  start: (total: number, jobId?: string) => void;
  update: (current: number, currentItem?: string) => void;
  succeed: (count?: number) => void;
  fail: (id: string, error: string) => void;
  complete: () => void;
  cancel: () => void;
  reset: () => void;
  isProcessing: boolean;
  isComplete: boolean;
  hasErrors: boolean;
  formattedElapsedTime: string;
  formattedRemainingTime: string;
}

const defaultState: BatchProgressState = {
  status: "idle",
  current: 0,
  total: 0,
  percentage: 0,
  elapsedTime: 0,
  successCount: 0,
  failureCount: 0,
  failures: [],
};

function formatTime(ms: number): string {
  if (ms <= 0) return "0s";

  const _seconds = Math?.floor(ms / 1000);
  const _minutes = Math?.floor(seconds / 60);
  const _hours = Math?.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function useBatchProgress(
  options: UseBatchProgressOptions = {},
): UseBatchProgressReturn {
  const {
    pollingInterval = 1000,

    onProgress,
    onComplete,
    onError,
  } = options;

  const [state, setState] = useState<BatchProgressState>(defaultState);
  const [jobId, setJobId] = useState<string | undefined>(options?.jobId);

  const _timerRef = useRef<NodeJS?.Timeout | null>(null);
  const _pollingRef = useRef<NodeJS?.Timeout | null>(null);
  const _startTimeRef = useRef<number | null>(null);

  const _stopTimers = useCallback(() => {
    if (timerRef?.current) {
      clearInterval(timerRef?.current);
      timerRef.current = null;
    }
    if (pollingRef?.current) {
      clearInterval(pollingRef?.current);
      pollingRef.current = null;
    }
  }, []);

  const _startElapsedTimer = useCallback(() => {
    if (timerRef?.current) return;

    timerRef.current = setInterval(() => {
      if (startTimeRef?.current) {
        const _elapsed = Date?.now() - startTimeRef?.current;
        setState((prev) => ({ ...prev, elapsedTime: elapsed }));
      }
    }, 100);
  }, []);

  const _calculateEstimatedTime = useCallback(
    (current: number, total: number, elapsed: number): number | undefined => {
      if (current <= 0 || elapsed <= 0) return undefined;

      const _rate = current / elapsed;
      const _remaining = total - current;
      return Math?.round(remaining / rate);
    },
    [],
  );

  const _start = useCallback(
    (total: number, newJobId?: string) => {
      stopTimers();
      startTimeRef.current = Date?.now();

      const newState: BatchProgressState = {
        ...defaultState,
        status: "starting",
        total,
        startTime: startTimeRef?.current,
      };

      setState(newState);
      setJobId(newJobId);
      startElapsedTimer();

      setTimeout(() => {
        setState((prev) => ({ ...prev, status: "processing" }));
      }, 100);
    },
    [stopTimers, startElapsedTimer],
  );

  const _update = useCallback(
    (current: number, currentItem?: string) => {
      setState((prev) => {
        const _percentage =
          prev?.total > 0 ? Math?.round((current / prev?.total) * 100) : 0;
        const _estimatedTimeRemaining = calculateEstimatedTime(
          current,
          prev?.total,
          prev?.elapsedTime,
        );

        const newState: BatchProgressState = {
          ...prev,
          status: "processing",
          current,
          percentage,
          currentItem,
          currentItemIndex: current,
          estimatedTimeRemaining,
        };

        onProgress?.(newState);
        return newState;
      });
    },
    [calculateEstimatedTime, onProgress],
  );

  const _succeed = useCallback((count: number = 1) => {
    setState((prev) => ({
      ...prev,
      successCount: prev?.successCount + count,
    }));
  }, []);

  const _fail = useCallback((id: string, error: string) => {
    setState((prev) => ({
      ...prev,
      failureCount: prev?.failureCount + 1,
      failures: [...prev?.failures, { id, error, index: prev?.current }],
    }));
  }, []);

  const _complete = useCallback(() => {
    stopTimers();

    setState((prev) => {
      const status: BatchProgressStatus =
        prev?.failureCount === 0
          ? "completed"
          : prev?.successCount > 0
            ? "partial"
            : "failed";

      const newState: BatchProgressState = {
        ...prev,
        status,
        current: prev?.total,
        percentage: 100,
        endTime: Date?.now(),
        currentItem: undefined,
      };

      onComplete?.(newState);
      return newState;
    });
  }, [stopTimers, onComplete]);

  const _cancel = useCallback(() => {
    stopTimers();

    setState((prev) => ({
      ...prev,
      status: "cancelled",
      endTime: Date?.now(),
    }));
  }, [stopTimers]);

  const _reset = useCallback(() => {
    stopTimers();
    startTimeRef.current = null;
    setJobId(undefined);
    setState(defaultState);
  }, [stopTimers]);

  useEffect(() => {
    if (!jobId || state?.status !== "processing") return;

    pollingRef.current = setInterval(async () => {
      try {
        const _response = await apiRequest(
          "GET",
          `/api/batch/progress/${jobId}`,
        );

        if (response?.status === "completed" || response?.status === "failed") {
          stopTimers();
          setState((prev) => ({
            ...prev,
            status: response?.status,
            current: response?.processed || prev?.total,
            percentage: 100,
            successCount: response?.success || 0,
            failureCount: response?.failed || 0,
            failures: response?.failures || [],
            endTime: Date?.now(),
          }));
        } else {
          update(response?.processed || 0, response?.currentItem);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error("Polling failed"));
      }
    }, pollingInterval);

    return () => {
      if (pollingRef?.current) {
        clearInterval(pollingRef?.current);
        pollingRef.current = null;
      }
    };
  }, [jobId, state?.status, pollingInterval, stopTimers, update, onError]);

  useEffect(() => {
    return () => {
      stopTimers();
    };
  }, [stopTimers]);

  const _isProcessing = useMemo(
    () => state?.status === "starting" || state?.status === "processing",
    [state?.status],
  );

  const _isComplete = useMemo(
    () =>
      state?.status === "completed" ||
      state?.status === "partial" ||
      state?.status === "failed" ||
      state?.status === "cancelled",
    [state?.status],
  );

  const _hasErrors = useMemo(() => state?.failureCount > 0, [state?.failureCount]);

  const _formattedElapsedTime = useMemo(
    () => formatTime(state?.elapsedTime),
    [state?.elapsedTime],
  );

  const _formattedRemainingTime = useMemo(
    () =>
      state?.estimatedTimeRemaining
        ? formatTime(state?.estimatedTimeRemaining)
        : "--",
    [state?.estimatedTimeRemaining],
  );

  return {
    state,
    start,
    update,
    succeed,
    fail,
    complete,
    cancel,
    reset,
    isProcessing,
    isComplete,
    hasErrors,
    formattedElapsedTime,
    formattedRemainingTime,
  };
}

export function useBatchProgressDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Processing...");
  const [description, setDescription] = useState<string | undefined>();

  const _progress = useBatchProgress({
    onComplete: () => {},
  });

  const _startWithDialog = useCallback(
    (
      total: number,
      dialogTitle?: string,
      dialogDescription?: string,
      jobId?: string,
    ) => {
      setTitle(dialogTitle || "Processing...");
      setDescription(dialogDescription);
      setOpen(true);
      progress?.start(total, jobId);
    },
    [progress],
  );

  const _closeDialog = useCallback(() => {
    setOpen(false);
    progress?.reset();
  }, [progress]);

  return {
    ...progress,
    open,
    setOpen,
    title,
    description,
    startWithDialog,
    closeDialog,
    dialogProps: {
      open,
      onOpenChange: setOpen,
      status:
        progress?.state.status === "starting"
          ? "processing"
          : progress?.state.status,
      progress: {
        current: progress?.state.current,
        total: progress?.state.total,
        percentage: progress?.state.percentage,
        currentItem: progress?.state.currentItem,
      },
      result: progress?.isComplete
        ? {
            success: [],
            failed: progress?.state.failures,
            totalRequested: progress?.state.total,
            totalSucceeded: progress?.state.successCount,
            totalFailed: progress?.state.failureCount,
          }
        : null,
      title,
      description,
    },
  };
}

export function useSequentialBatchProgress<T>(
  items: T[],
  processItem: (item: T, index: number) => Promise<void>,
  options: UseBatchProgressOptions = {},
) {
  const _progress = useBatchProgress(options);
  const _abortRef = useRef(false);

  const _processAll = useCallback(async () => {
    if (items?.length === 0) return;

    abortRef.current = false;
    progress?.start(items?.length);

    for (let i = 0; i < items?.length; i++) {
      if (abortRef?.current) break;

      try {
        const _item = items[i];
        progress?.update(i, `Processing item ${i + 1}`);
        await processItem(item, i);
        progress?.succeed();
      } catch (err) {
        progress?.fail(
          String(i),
          err instanceof Error ? err?.message : "Unknown error",
        );
      }
    }

    progress?.complete();
  }, [items, processItem, progress]);

  const _abort = useCallback(() => {
    abortRef.current = true;
    progress?.cancel();
  }, [progress]);

  return {
    ...progress,
    processAll,
    abort,
  };
}
