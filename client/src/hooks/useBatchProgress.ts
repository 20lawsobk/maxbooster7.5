// @ts-nocheck
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

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export async function parseBatchProgressResponse(
  response: Response,
  expectedJobId: string,
): Promise<{
  jobId: string;
  status: "processing" | "completed" | "failed";
  processed: number;
  total: number;
  success: number;
  failed: number;
  failures: Array<{ id: string; error: string; index?: number }>;
  currentItem?: string;
  elapsedMs: number;
}> {
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Batch progress returned an invalid response");
  }
  const value = payload as Record<string, unknown>;
  const numericFields = [
    "processed",
    "total",
    "success",
    "failed",
    "elapsedMs",
  ] as const;
  if (
    value.jobId !== expectedJobId ||
    !["processing", "completed", "failed"].includes(String(value.status)) ||
    numericFields.some(
      (field) =>
        typeof value[field] !== "number" ||
        !Number.isFinite(value[field]) ||
        (value[field] as number) < 0,
    ) ||
    !Array.isArray(value.failures) ||
    !value.failures.every(
      (failure) =>
        failure !== null &&
        typeof failure === "object" &&
        typeof (failure as Record<string, unknown>).id === "string" &&
        typeof (failure as Record<string, unknown>).error === "string",
    ) ||
    (value.currentItem !== undefined &&
      typeof value.currentItem !== "string") ||
    (value.processed as number) > (value.total as number) ||
    (value.success as number) + (value.failed as number) >
      (value.processed as number) ||
    (value.status !== "processing" &&
      (value.success as number) + (value.failed as number) !==
        (value.processed as number))
  ) {
    throw new Error("Batch progress returned an invalid response");
  }
  return value as ReturnType<typeof parseBatchProgressResponse> extends Promise<
    infer Result
  >
    ? Result
    : never;
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

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const stopTimers = useCallback(() => {
    if (timerRef?.current) {
      clearInterval(timerRef?.current);
      timerRef.current = null;
    }
    if (pollingRef?.current) {
      clearInterval(pollingRef?.current);
      pollingRef.current = null;
    }
  }, []);

  const startElapsedTimer = useCallback(() => {
    if (timerRef?.current) return;

    timerRef.current = setInterval(() => {
      if (startTimeRef?.current) {
        const elapsed = Date.now() - startTimeRef?.current;
        setState((prev) => ({ ...prev, elapsedTime: elapsed }));
      }
    }, 100);
  }, []);

  const calculateEstimatedTime = useCallback(
    (current: number, total: number, elapsed: number): number | undefined => {
      if (current <= 0 || elapsed <= 0) return undefined;

      const rate = current / elapsed;
      const remaining = total - current;
      return Math.round(remaining / rate);
    },
    [],
  );

  const start = useCallback(
    (total: number, newJobId?: string) => {
      stopTimers();
      startTimeRef.current = Date.now();

      const newState: BatchProgressState = {
        ...defaultState,
        status: "starting",
        total,
        startTime: startTimeRef.current,
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

  const update = useCallback(
    (current: number, currentItem?: string) => {
      setState((prev) => {
        const percentage =
          prev?.total > 0 ? Math.round((current / prev?.total) * 100) : 0;
        const estimatedTimeRemaining = calculateEstimatedTime(
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

  const succeed = useCallback((count: number = 1) => {
    setState((prev) => ({
      ...prev,
      successCount: prev.successCount + count,
    }));
  }, []);

  const fail = useCallback((id: string, error: string) => {
    setState((prev) => ({
      ...prev,
      failureCount: prev.failureCount + 1,
      failures: [...(prev?.failures ?? []), { id, error, index: prev.current }],
    }));
  }, []);

  const complete = useCallback(() => {
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
        current: prev.total,
        percentage: 100,
        endTime: Date.now(),
        currentItem: undefined,
      };

      onComplete?.(newState);
      return newState;
    });
  }, [stopTimers, onComplete]);

  const cancel = useCallback(() => {
    stopTimers();

    setState((prev) => ({
      ...prev,
      status: "cancelled",
      endTime: Date.now(),
    }));
  }, [stopTimers]);

  const reset = useCallback(() => {
    stopTimers();
    startTimeRef.current = null;
    setJobId(undefined);
    setState(defaultState);
  }, [stopTimers]);

  useEffect(() => {
    if (!jobId || state?.status !== "processing") return;

    pollingRef.current = setInterval(async () => {
      try {
        const response = await apiRequest(
          "GET",
          `/api/batch/progress/${jobId}`,
        );
        const progressResponse = await parseBatchProgressResponse(
          response,
          jobId,
        );

        if (
          progressResponse.status === "completed" ||
          progressResponse.status === "failed"
        ) {
          stopTimers();
          setState((prev) => {
            const nextState: BatchProgressState = {
              ...prev,
              status:
                progressResponse.status === "failed"
                  ? "failed"
                  : progressResponse.failed > 0
                    ? "partial"
                    : "completed",
              current: progressResponse.processed,
              total: progressResponse.total,
              percentage:
                progressResponse.total > 0
                  ? Math.round(
                      (progressResponse.processed / progressResponse.total) *
                        100,
                    )
                  : 0,
              successCount: progressResponse.success,
              failureCount: progressResponse.failed,
              failures: progressResponse.failures,
              endTime: Date.now(),
            };
            onComplete?.(nextState);
            return nextState;
          });
        } else {
          update(progressResponse.processed, progressResponse.currentItem);
        }
      } catch (err) {
        stopTimers();
        const pollingError =
          err instanceof Error ? err : new Error("Polling failed");
        setState((prev) => ({
          ...prev,
          status: "failed",
          endTime: Date.now(),
        }));
        onError?.(pollingError);
      }
    }, pollingInterval);

    return () => {
      if (pollingRef?.current) {
        clearInterval(pollingRef?.current);
        pollingRef.current = null;
      }
    };
  }, [
    jobId,
    state?.status,
    pollingInterval,
    stopTimers,
    update,
    onError,
    onComplete,
  ]);

  useEffect(() => {
    return () => {
      stopTimers();
    };
  }, [stopTimers]);

  const isProcessing = useMemo(
    () => state?.status === "starting" || state?.status === "processing",
    [state?.status],
  );

  const isComplete = useMemo(
    () =>
      state?.status === "completed" ||
      state?.status === "partial" ||
      state?.status === "failed" ||
      state?.status === "cancelled",
    [state?.status],
  );

  const hasErrors = useMemo(() => state?.failureCount > 0, [state?.failureCount]);

  const formattedElapsedTime = useMemo(
    () => formatTime(state?.elapsedTime),
    [state?.elapsedTime],
  );

  const formattedRemainingTime = useMemo(
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

  const progress = useBatchProgress({
    onComplete: () => {},
  });

  const startWithDialog = useCallback(
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

  const closeDialog = useCallback(() => {
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
        current: progress.state.current,
        total: progress.state.total,
        percentage: progress.state.percentage,
        currentItem: progress.state.currentItem,
      },
      result: progress.isComplete
        ? {
            success: [],
            failed: progress.state.failures,
            totalRequested: progress.state.total,
            totalSucceeded: progress.state.successCount,
            totalFailed: progress.state.failureCount,
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
  const progress = useBatchProgress(options);
  const abortRef = useRef(false);

  const processAll = useCallback(async () => {
    if (items?.length === 0) return;

    abortRef.current = false;
    progress?.start(items?.length);

    for (let i = 0; i < items?.length; i++) {
      if (abortRef?.current) break;

      try {
        const item = items[i];
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

  const abort = useCallback(() => {
    abortRef.current = true;
    progress?.cancel();
  }, [progress]);

  return {
    ...progress,
    processAll,
    abort,
  };
}
