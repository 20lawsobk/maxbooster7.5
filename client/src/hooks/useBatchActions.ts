// @ts-nocheck
import { useState, useCallback, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import { apiRequest } from "@/lib/queryClient";

export type BatchActionType =
  | "delete"
  | "update"
  | "export"
  | "submit"
  | "withdraw"
  | "takedown"
  | "schedule"
  | "approve"
  | "reject"
  | "move"
  | "tag"
  | "download"
  | "compare"
  | "duplicate"
  | "archive"
  | "restore"
  | "process";

export type BatchActionStatus =
  | "idle"
  | "confirming"
  | "processing"
  | "completed"
  | "failed"
  | "partial"
  | "cancelled";

export interface BatchProgress {
  current: number;
  total: number;
  percentage: number;
  currentItem?: string;
  estimatedTimeRemaining?: number;
  startTime?: number;
}

export interface BatchResult {
  success: string[];
  failed: Array<{ id: string; error: string }>;
  totalRequested: number;
  totalSucceeded: number;
  totalFailed: number;
  downloadUrl?: string;
  exportId?: string;
  comparisonData?: unknown[];
  jobId?: string;
}

export interface BatchActionConfig {
  resource: string;
  action: BatchActionType;
  ids: string[];
  data?: Record<string, any>;
  confirmMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  invalidateQueries?: string[];
  onProgress?: (progress: BatchProgress) => void;
  useJobProgress?: boolean;
}

export interface UseBatchActionsOptions {
  onSuccess?: (result: BatchResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: BatchProgress) => void;
  simulateProgress?: boolean;
  pollProgressInterval?: number;
}

export interface UseBatchActionsReturn {
  status: BatchActionStatus;
  progress: BatchProgress;
  result: BatchResult | null;
  error: Error | null;
  execute: (config: BatchActionConfig) => Promise<BatchResult>;
  confirm: (config: BatchActionConfig) => void;
  cancel: () => void;
  reset: () => void;
  retryFailed: () => Promise<BatchResult | null>;
  isProcessing: boolean;
  isComplete: boolean;
  pendingConfig: BatchActionConfig | null;
}

const defaultProgress: BatchProgress = {
  current: 0,
  total: 0,
  percentage: 0,
};

export function useBatchActions(
  options: UseBatchActionsOptions = {},
): UseBatchActionsReturn {
  const {
    onSuccess,
    onError,
    onProgress,
    simulateProgress = true,
    pollProgressInterval = 1000,
  } = options;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<BatchActionStatus>("idle");
  const [progress, setProgress] = useState<BatchProgress>(defaultProgress);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pendingConfig, setPendingConfig] = useState<BatchActionConfig | null>(
    null,
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const updateProgress = useCallback(
    (update: Partial<BatchProgress>) => {
      setProgress((prev) => {
        const next = { ...prev, ...update };
        next.percentage =
          next?.total > 0 ? Math.round((next?.current / next?.total) * 100) : 0;

        if (next?.startTime && next?.current > 0) {
          const elapsed = Date?.now() - next?.startTime;
          const rate = next?.current / elapsed;
          const remaining = next?.total - next?.current;
          next.estimatedTimeRemaining = Math.round(remaining / rate);
        }

        onProgress?.(next);
        return next;
      });
    },
    [onProgress],
  );

  const startProgressSimulation = useCallback(
    (total: number) => {
      if (!simulateProgress) return;

      let current = 0;
      const increment = Math.max(1, Math.floor(total / 20));
      const intervalMs = 200;

      progressIntervalRef.current = setInterval(() => {
        current = Math.min(current + increment, total - 1);
        updateProgress({ current, total });
      }, intervalMs);
    },
    [simulateProgress, updateProgress],
  );

  const stopProgressSimulation = useCallback(() => {
    if (progressIntervalRef?.current) {
      clearInterval(progressIntervalRef?.current);
      progressIntervalRef.current = null;
    }
    if (pollIntervalRef?.current) {
      clearInterval(pollIntervalRef?.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollJobProgress = useCallback(
    async (jobId: string, total: number) => {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const response = await apiRequest(
            "GET",
            `/api/batch/progress/${jobId}`,
          );
          updateProgress({
            current: response.processed || 0,
            total,
            currentItem: response.currentItem,
          });

          if (response?.status === "completed" || response?.status === "failed") {
            stopProgressSimulation();
          }
        } catch {}
      }, pollProgressInterval);
    },
    [updateProgress, pollProgressInterval, stopProgressSimulation],
  );

  const getEndpoint = useCallback(
    (
      resource: string,
      action: BatchActionType,
    ): { method: string; url: string } => {
      const endpoints: Record<
        BatchActionType,
        { method: string; suffix: string }
      > = {
        delete: { method: "POST", suffix: "delete" },
        update: { method: "PUT", suffix: "update" },
        export: { method: "POST", suffix: "export" },
        submit: { method: "POST", suffix: "submit" },
        withdraw: { method: "POST", suffix: "withdraw" },
        takedown: { method: "POST", suffix: "takedown" },
        schedule: { method: "POST", suffix: "schedule" },
        approve: { method: "POST", suffix: "approve" },
        reject: { method: "POST", suffix: "reject" },
        move: { method: "POST", suffix: "move" },
        tag: { method: "POST", suffix: "tag" },
        download: { method: "POST", suffix: "download" },
        compare: { method: "POST", suffix: "compare" },
        duplicate: { method: "POST", suffix: "duplicate" },
        archive: { method: "POST", suffix: "archive" },
        restore: { method: "POST", suffix: "restore" },
        process: { method: "POST", suffix: "process" },
      };

      const { method, suffix } = endpoints[action] || {
        method: "POST",
        suffix: action,
      };
      return { method, url: `/api/batch/${resource}/${suffix}` };
    },
    [],
  );

  const execute = useCallback(
    async (config: BatchActionConfig): Promise<BatchResult> => {
      const {
        resource,
        action,
        ids,
        data,
        successMessage,
        errorMessage,
        invalidateQueries,
        useJobProgress,
      } = config;

      abortControllerRef.current = new AbortController();
      setStatus("processing");
      setError(null);
      setResult(null);
      updateProgress({
        current: 0,
        total: ids.length,
        currentItem: undefined,
        startTime: Date.now(),
      });

      if (!useJobProgress) {
        startProgressSimulation(ids?.length);
      }

      try {
        const { method, url } = getEndpoint(resource, action);
        const body = { ids, data };

        const response = await apiRequest(method, url, body);
        stopProgressSimulation();

        if (useJobProgress && response?.jobId) {
          await pollJobProgress(response?.jobId, ids?.length);
        }

        const actionResult: BatchResult = {
          success: response.success || ids,
          failed: response.failed || [],
          totalRequested: ids.length,
          totalSucceeded: response.success?.length ?? ids?.length,
          totalFailed: response.failed?.length ?? 0,
          downloadUrl: response.downloadUrl,
          exportId: response.exportId,
          comparisonData: response.comparisonData,
          jobId: response.jobId,
        };

        updateProgress({ current: ids.length, total: ids.length });
        setResult(actionResult);

        if (actionResult?.totalFailed === 0) {
          setStatus("completed");
          toast({
            title: successMessage || "Operation completed",
            description: `Successfully processed ${actionResult?.totalSucceeded} item(s)`,
          });
          onSuccess?.(actionResult);
        } else if (actionResult?.totalSucceeded > 0) {
          setStatus("partial");
          toast({
            title: "Operation partially completed",
            description: `${actionResult?.totalSucceeded} succeeded, ${actionResult?.totalFailed} failed`,
            variant: "destructive",
          });
          onSuccess?.(actionResult);
        } else {
          setStatus("failed");
          toast({
            title: errorMessage || "Operation failed",
            description: `All ${actionResult?.totalFailed} item(s) failed`,
            variant: "destructive",
          });
        }

        if (invalidateQueries) {
          for (const queryKey of invalidateQueries) {
            queryClient?.invalidateQueries({ queryKey: [queryKey] });
          }
        }

        setPendingConfig(null);
        return actionResult;
      } catch (err) {
        stopProgressSimulation();
        const error = err instanceof Error ? err : new Error("Unknown error");
        setError(error);
        setStatus("failed");

        toast({
          title: errorMessage || "Operation failed",
          description: error.message,
          variant: "destructive",
        });

        onError?.(error);
        throw error;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [
      toast,
      queryClient,
      onSuccess,
      onError,
      updateProgress,
      getEndpoint,
      startProgressSimulation,
      stopProgressSimulation,
      pollJobProgress,
    ],
  );

  const confirm = useCallback((config: BatchActionConfig) => {
    setPendingConfig(config);
    setStatus("confirming");
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef?.current) {
      abortControllerRef?.current.abort();
    }
    stopProgressSimulation();
    setPendingConfig(null);
    setStatus("cancelled");
  }, [stopProgressSimulation]);

  const reset = useCallback(() => {
    stopProgressSimulation();
    setStatus("idle");
    setProgress(defaultProgress);
    setResult(null);
    setError(null);
    setPendingConfig(null);
  }, [stopProgressSimulation]);

  const retryFailed = useCallback(async (): Promise<BatchResult | null> => {
    if (!pendingConfig || !result || result?.failed.length === 0) return null;

    const failedIds = result?.failed.map((f) => f?.id);
    const retryConfig = {
      ...pendingConfig,
      ids: failedIds,
      successMessage: "Retry completed",
      errorMessage: "Retry failed",
    };

    return execute(retryConfig);
  }, [pendingConfig, result, execute]);

  const isProcessing = useMemo(() => status === "processing", [status]);
  const isComplete = useMemo(
    () => status === "completed" || status === "partial" || status === "failed",
    [status],
  );

  return {
    status,
    progress,
    result,
    error,
    execute,
    confirm,
    cancel,
    reset,
    retryFailed,
    isProcessing,
    isComplete,
    pendingConfig,
  };
}

export function useReleaseBatchActions(options: UseBatchActionsOptions = {}) {
  const batchActions = useBatchActions(options);

  const submitReleases = useCallback(
    async (ids: string[], data?: Record<string, any>) => {
      return batchActions?.execute({
        resource: "releases",
        action: "submit",
        ids,
        data,
        successMessage: "Releases submitted successfully",
        errorMessage: "Failed to submit releases",
        invalidateQueries: ["/api/releases", "/api/distribution"],
      });
    },
    [batchActions],
  );

  const deleteReleases = useCallback(
    async (ids: string[]) => {
      return batchActions?.execute({
        resource: "releases",
        action: "delete",
        ids,
        successMessage: "Releases deleted successfully",
        errorMessage: "Failed to delete releases",
        invalidateQueries: ["/api/releases", "/api/distribution"],
      });
    },
    [batchActions],
  );

  const updateReleases = useCallback(
    async (ids: string[], data: Record<string, any>) => {
      return batchActions?.execute({
        resource: "releases",
        action: "update",
        ids,
        data,
        successMessage: "Releases updated successfully",
        errorMessage: "Failed to update releases",
        invalidateQueries: ["/api/releases", "/api/distribution"],
      });
    },
    [batchActions],
  );

  return { ...batchActions, submitReleases, deleteReleases, updateReleases };
}

export function useTrackBatchActions(options: UseBatchActionsOptions = {}) {
  const batchActions = useBatchActions(options);

  const moveTracks = useCallback(
    async (ids: string[], targetFolder: string) => {
      return batchActions?.execute({
        resource: "tracks",
        action: "move",
        ids,
        data: { targetFolder },
        successMessage: "Tracks moved successfully",
        errorMessage: "Failed to move tracks",
        invalidateQueries: ["/api/tracks", "/api/files"],
      });
    },
    [batchActions],
  );

  const tagTracks = useCallback(
    async (ids: string[], tags: string[]) => {
      return batchActions?.execute({
        resource: "tracks",
        action: "tag",
        ids,
        data: { tags },
        successMessage: "Tags applied successfully",
        errorMessage: "Failed to apply tags",
        invalidateQueries: ["/api/tracks"],
      });
    },
    [batchActions],
  );

  const exportTracks = useCallback(
    async (ids: string[], format: string = "wav") => {
      return batchActions?.execute({
        resource: "tracks",
        action: "export",
        ids,
        data: { format },
        successMessage: "Export started",
        errorMessage: "Failed to export tracks",
      });
    },
    [batchActions],
  );

  const deleteTracks = useCallback(
    async (ids: string[]) => {
      return batchActions?.execute({
        resource: "tracks",
        action: "delete",
        ids,
        successMessage: "Tracks deleted successfully",
        errorMessage: "Failed to delete tracks",
        invalidateQueries: ["/api/tracks"],
      });
    },
    [batchActions],
  );

  return { ...batchActions, moveTracks, tagTracks, exportTracks, deleteTracks };
}

export function usePostBatchActions(options: UseBatchActionsOptions = {}) {
  const batchActions = useBatchActions(options);

  const schedulePosts = useCallback(
    async (ids: string[], scheduledTime: string) => {
      return batchActions?.execute({
        resource: "posts",
        action: "schedule",
        ids,
        data: { scheduledTime },
        successMessage: "Posts scheduled successfully",
        errorMessage: "Failed to schedule posts",
        invalidateQueries: ["/api/social/posts", "/api/social/calendar"],
      });
    },
    [batchActions],
  );

  const deletePosts = useCallback(
    async (ids: string[]) => {
      return batchActions?.execute({
        resource: "posts",
        action: "delete",
        ids,
        successMessage: "Posts deleted successfully",
        errorMessage: "Failed to delete posts",
        invalidateQueries: ["/api/social/posts", "/api/social/calendar"],
      });
    },
    [batchActions],
  );

  const approvePosts = useCallback(
    async (ids: string[]) => {
      return batchActions?.execute({
        resource: "posts",
        action: "approve",
        ids,
        successMessage: "Posts approved successfully",
        errorMessage: "Failed to approve posts",
        invalidateQueries: ["/api/social/posts", "/api/social/approvals"],
      });
    },
    [batchActions],
  );

  return { ...batchActions, schedulePosts, deletePosts, approvePosts };
}

export function useBeatBatchActions(options: UseBatchActionsOptions = {}) {
  const batchActions = useBatchActions(options);

  const updatePrices = useCallback(
    async (ids: string[], price: number) => {
      return batchActions?.execute({
        resource: "beats",
        action: "update",
        ids,
        data: { price },
        successMessage: "Prices updated successfully",
        errorMessage: "Failed to update prices",
        invalidateQueries: [
          "/api/marketplace/beats",
          "/api/marketplace/my-beats",
        ],
      });
    },
    [batchActions],
  );

  const updateLicenses = useCallback(
    async (ids: string[], licenseType: string) => {
      return batchActions?.execute({
        resource: "beats",
        action: "update",
        ids,
        data: { licenseType },
        successMessage: "Licenses updated successfully",
        errorMessage: "Failed to update licenses",
        invalidateQueries: [
          "/api/marketplace/beats",
          "/api/marketplace/my-beats",
        ],
      });
    },
    [batchActions],
  );

  const deleteBeats = useCallback(
    async (ids: string[]) => {
      return batchActions?.execute({
        resource: "beats",
        action: "delete",
        ids,
        successMessage: "Beats deleted successfully",
        errorMessage: "Failed to delete beats",
        invalidateQueries: [
          "/api/marketplace/beats",
          "/api/marketplace/my-beats",
        ],
      });
    },
    [batchActions],
  );

  return { ...batchActions, updatePrices, updateLicenses, deleteBeats };
}

export function useAnalyticsBatchActions(options: UseBatchActionsOptions = {}) {
  const batchActions = useBatchActions(options);

  const exportAnalytics = useCallback(
    async (
      ids: string[],
      format: string = "csv",
      dateRange?: { start: string; end: string },
    ) => {
      return batchActions?.execute({
        resource: "analytics",
        action: "export",
        ids,
        data: { format, dateRange },
        successMessage: "Export started",
        errorMessage: "Failed to export analytics",
      });
    },
    [batchActions],
  );

  const compareAnalytics = useCallback(
    async (ids: string[]) => {
      return batchActions?.execute({
        resource: "analytics",
        action: "compare",
        ids,
        successMessage: "Comparison generated",
        errorMessage: "Failed to generate comparison",
      });
    },
    [batchActions],
  );

  return { ...batchActions, exportAnalytics, compareAnalytics };
}

export {
  useBatchAction,
  useDistributionBatchActions,
  useSocialBatchActions,
  useMarketplaceBatchActions,
  useFileBatchActions,
  useAnalyticsBatchActions as useAnalyticsBatchActionsLegacy,
} from "./useBatchAction";
