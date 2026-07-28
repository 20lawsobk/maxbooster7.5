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
  | "move"
  | "download"
  | "compare"
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
}

export interface UseBatchActionOptions {
  onSuccess?: (result: BatchResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: BatchProgress) => void;
  simulateProgress?: boolean;
}

export interface UseBatchActionReturn {
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

export function useBatchAction(
  options: UseBatchActionOptions = {},
): UseBatchActionReturn {
  const { onSuccess, onError, onProgress, simulateProgress = true } = options;
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

  const updateProgress = useCallback(
    (update: Partial<BatchProgress>) => {
      setProgress((prev) => {
        const next = { ...prev, ...update };
        next.percentage =
          next?.total > 0 ? Math.round((next?.current / next?.total) * 100) : 0;
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
  }, []);

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
        move: { method: "POST", suffix: "move" },
        download: { method: "POST", suffix: "download" },
        compare: { method: "POST", suffix: "compare" },
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
      } = config;

      abortControllerRef.current = new AbortController();
      setStatus("processing");
      setError(null);
      setResult(null);
      updateProgress({ current: 0, total: ids.length, currentItem: undefined });

      startProgressSimulation(ids?.length);

      try {
        const { method, url } = getEndpoint(resource, action);
        const body = { ids, data };

        const response = await apiRequest(method, url, body);
        stopProgressSimulation();

        const actionResult: BatchResult = {
          success: response.success || ids,
          failed: response.failed || [],
          totalRequested: ids.length,
          totalSucceeded: response.success?.length ?? ids?.length,
          totalFailed: response.failed?.length ?? 0,
          downloadUrl: response.downloadUrl,
          exportId: response.exportId,
          comparisonData: response.comparisonData,
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

export function useDistributionBatchActions(
  options: UseBatchActionOptions = {},
) {
  const batchAction = useBatchAction(options);

  const submitReleases = useCallback(
    async (ids: string[], data?: Record<string, any>) => {
      return batchAction?.execute({
        resource: "releases",
        action: "submit",
        ids,
        data,
        successMessage: "Releases submitted successfully",
        errorMessage: "Failed to submit releases",
        invalidateQueries: ["/api/releases", "/api/distribution"],
      });
    },
    [batchAction],
  );

  const takedownReleases = useCallback(
    async (ids: string[]) => {
      return batchAction?.execute({
        resource: "releases",
        action: "takedown",
        ids,
        successMessage: "Releases taken down successfully",
        errorMessage: "Failed to takedown releases",
        invalidateQueries: ["/api/releases", "/api/distribution"],
      });
    },
    [batchAction],
  );

  const updateReleases = useCallback(
    async (ids: string[], data: Record<string, any>) => {
      return batchAction?.execute({
        resource: "releases",
        action: "update",
        ids,
        data,
        successMessage: "Releases updated successfully",
        errorMessage: "Failed to update releases",
        invalidateQueries: ["/api/releases", "/api/distribution"],
      });
    },
    [batchAction],
  );

  const deleteReleases = useCallback(
    async (ids: string[]) => {
      return batchAction?.execute({
        resource: "releases",
        action: "delete",
        ids,
        successMessage: "Releases deleted successfully",
        errorMessage: "Failed to delete releases",
        invalidateQueries: ["/api/releases", "/api/distribution"],
      });
    },
    [batchAction],
  );

  return {
    ...batchAction,
    submitReleases,
    takedownReleases,
    updateReleases,
    deleteReleases,
  };
}

export function useSocialBatchActions(options: UseBatchActionOptions = {}) {
  const batchAction = useBatchAction(options);

  const schedulePosts = useCallback(
    async (ids: string[], scheduledTime: string) => {
      return batchAction?.execute({
        resource: "posts",
        action: "schedule",
        ids,
        data: { scheduledTime },
        successMessage: "Posts scheduled successfully",
        errorMessage: "Failed to schedule posts",
        invalidateQueries: ["/api/social/posts", "/api/social/calendar"],
      });
    },
    [batchAction],
  );

  const deletePosts = useCallback(
    async (ids: string[]) => {
      return batchAction?.execute({
        resource: "posts",
        action: "delete",
        ids,
        successMessage: "Posts deleted successfully",
        errorMessage: "Failed to delete posts",
        invalidateQueries: ["/api/social/posts", "/api/social/calendar"],
      });
    },
    [batchAction],
  );

  const updatePosts = useCallback(
    async (ids: string[], data: Record<string, any>) => {
      return batchAction?.execute({
        resource: "posts",
        action: "update",
        ids,
        data,
        successMessage: "Posts updated successfully",
        errorMessage: "Failed to update posts",
        invalidateQueries: ["/api/social/posts"],
      });
    },
    [batchAction],
  );

  return {
    ...batchAction,
    schedulePosts,
    deletePosts,
    updatePosts,
  };
}

export function useMarketplaceBatchActions(
  options: UseBatchActionOptions = {},
) {
  const batchAction = useBatchAction(options);

  const updateListings = useCallback(
    async (ids: string[], data: Record<string, any>) => {
      return batchAction?.execute({
        resource: "marketplace",
        action: "update",
        ids,
        data,
        successMessage: "Listings updated successfully",
        errorMessage: "Failed to update listings",
        invalidateQueries: [
          "/api/marketplace/beats",
          "/api/marketplace/my-beats",
        ],
      });
    },
    [batchAction],
  );

  const deleteListings = useCallback(
    async (ids: string[]) => {
      return batchAction?.execute({
        resource: "marketplace",
        action: "delete",
        ids,
        successMessage: "Listings deleted successfully",
        errorMessage: "Failed to delete listings",
        invalidateQueries: [
          "/api/marketplace/beats",
          "/api/marketplace/my-beats",
        ],
      });
    },
    [batchAction],
  );

  const updatePrices = useCallback(
    async (ids: string[], price: number) => {
      return batchAction?.execute({
        resource: "marketplace",
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
    [batchAction],
  );

  const updateLicenses = useCallback(
    async (ids: string[], licenseType: string) => {
      return batchAction?.execute({
        resource: "marketplace",
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
    [batchAction],
  );

  return {
    ...batchAction,
    updateListings,
    deleteListings,
    updatePrices,
    updateLicenses,
  };
}

export function useFileBatchActions(options: UseBatchActionOptions = {}) {
  const batchAction = useBatchAction(options);

  const deleteFiles = useCallback(
    async (ids: string[]) => {
      return batchAction?.execute({
        resource: "files",
        action: "delete",
        ids,
        successMessage: "Files deleted successfully",
        errorMessage: "Failed to delete files",
        invalidateQueries: ["/api/files", "/api/storage"],
      });
    },
    [batchAction],
  );

  const moveFiles = useCallback(
    async (ids: string[], folder: string) => {
      return batchAction?.execute({
        resource: "files",
        action: "move",
        ids,
        data: { folder },
        successMessage: "Files moved successfully",
        errorMessage: "Failed to move files",
        invalidateQueries: ["/api/files", "/api/storage"],
      });
    },
    [batchAction],
  );

  const downloadFiles = useCallback(
    async (ids: string[]) => {
      return batchAction?.execute({
        resource: "files",
        action: "download",
        ids,
        successMessage: "Download prepared",
        errorMessage: "Failed to prepare download",
      });
    },
    [batchAction],
  );

  const updateFiles = useCallback(
    async (ids: string[], data: Record<string, any>) => {
      return batchAction?.execute({
        resource: "files",
        action: "update",
        ids,
        data,
        successMessage: "Files updated successfully",
        errorMessage: "Failed to update files",
        invalidateQueries: ["/api/files"],
      });
    },
    [batchAction],
  );

  return {
    ...batchAction,
    deleteFiles,
    moveFiles,
    downloadFiles,
    updateFiles,
  };
}

export function useAnalyticsBatchActions(options: UseBatchActionOptions = {}) {
  const batchAction = useBatchAction(options);

  const exportAnalytics = useCallback(
    async (ids: string[], format: string = "csv", dateRange?: string) => {
      return batchAction?.execute({
        resource: "analytics",
        action: "export",
        ids,
        data: { format, dateRange },
        successMessage: "Export started",
        errorMessage: "Failed to export analytics",
      });
    },
    [batchAction],
  );

  const compareAnalytics = useCallback(
    async (ids: string[]) => {
      return batchAction?.execute({
        resource: "analytics",
        action: "compare",
        ids,
        successMessage: "Comparison generated",
        errorMessage: "Failed to generate comparison",
      });
    },
    [batchAction],
  );

  return {
    ...batchAction,
    exportAnalytics,
    compareAnalytics,
  };
}
