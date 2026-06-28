import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import { apiRequest } from "@/lib/queryClient";

export type BulkActionType =
  | "delete"
  | "update"
  | "export"
  | "status_change"
  | "submit"
  | "withdraw"
  | "schedule"
  | "process";

export type BulkActionStatus =
  | "idle"
  | "confirming"
  | "processing"
  | "completed"
  | "failed"
  | "partial";

export interface BulkActionProgress {
  current: number;
  total: number;
  currentItem?: string;
  percentage: number;
}

export interface BulkActionResult {
  success: string[];
  failed: Array<{ id: string; error: string }>;
  totalRequested: number;
  totalSucceeded: number;
  totalFailed: number;
}

export interface BulkActionConfig {
  resource: string;
  action: BulkActionType;
  ids: string[];
  data?: Record<string, any>;
  confirmMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  invalidateQueries?: string[];
}

export interface UseBulkActionOptions {
  onSuccess?: (result: BulkActionResult) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: BulkActionProgress) => void;
}

export interface UseBulkActionResult {
  status: BulkActionStatus;
  progress: BulkActionProgress;
  result: BulkActionResult | null;
  error: Error | null;
  execute: (config: BulkActionConfig) => Promise<BulkActionResult>;
  confirm: (config: BulkActionConfig) => void;
  cancel: () => void;
  reset: () => void;
  isProcessing: boolean;
  pendingConfig: BulkActionConfig | null;
}

const defaultProgress: BulkActionProgress = {
  current: 0,
  total: 0,
  percentage: 0,
};


export function useBulkAction(
  options: UseBulkActionOptions = {},
): UseBulkActionResult {
  const { onSuccess, onError, onProgress } = options;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<BulkActionStatus>("idle");
  const [progress, setProgress] = useState<BulkActionProgress>(defaultProgress);
  const [result, setResult] = useState<BulkActionResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pendingConfig, setPendingConfig] = useState<BulkActionConfig | null>(
    null,
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  const updateProgress = useCallback(
    (update: Partial<BulkActionProgress>) => {
      setProgress((prev) => {
        const next = { ...prev, ...update };
        next.percentage =
          next?.total > 0 ? Math?.round((next?.current / next?.total) * 100) : 0;
        onProgress?.(next);
        return next;
      });
    },
    [onProgress],
  );

  const execute = useCallback(
    async (config: BulkActionConfig): Promise<BulkActionResult> => {
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

      try {
        let endpoint: string;
        let method: string;
        let body: Record<string, any>;

        switch (action) {
          case "delete":
            endpoint = `/api/batch/${resource}/delete`;
            method = "POST";
            body = { ids };
            break;
          case "update":
          case "status_change":
            endpoint = `/api/batch/${resource}/update`;
            method = "PUT";
            body = { ids, data };
            break;
          case "export":
            endpoint = `/api/batch/${resource}/export`;
            method = "POST";
            body = { ids, ...data };
            break;
          case "submit":
            endpoint = `/api/batch/${resource}/submit`;
            method = "POST";
            body = { ids, ...data };
            break;
          case "withdraw":
            endpoint = `/api/batch/${resource}/withdraw`;
            method = "POST";
            body = { ids };
            break;
          case "schedule":
            endpoint = `/api/batch/${resource}/schedule`;
            method = "POST";
            body = { ids, ...data };
            break;
          case "process":
            endpoint = `/api/batch/${resource}/process`;
            method = "POST";
            body = { ids, ...data };
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        const response = await apiRequest(method, endpoint, body);

        const actionResult: BulkActionResult = {
          success: response.success || ids,
          failed: response.failed || [],
          totalRequested: ids.length,
          totalSucceeded: response.success?.length ?? ids?.length,
          totalFailed: response.failed?.length ?? 0,
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

        return actionResult;
      } catch (err) {
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
        setPendingConfig(null);
      }
    },
    [toast, queryClient, onSuccess, onError, updateProgress],
  );

  const confirm = useCallback((config: BulkActionConfig) => {
    setPendingConfig(config);
    setStatus("confirming");
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef?.current) {
      abortControllerRef?.current.abort();
    }
    setPendingConfig(null);
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(defaultProgress);
    setResult(null);
    setError(null);
    setPendingConfig(null);
  }, []);

  return {
    status,
    progress,
    result,
    error,
    execute,
    confirm,
    cancel,
    reset,
    isProcessing: status === "processing",
    pendingConfig,
  };
}

export function useBulkDelete(
  resource: string,
  options: UseBulkActionOptions = {},
) {
  const bulkAction = useBulkAction(options);

  const deleteItems = useCallback(
    async (ids: string[]) => {
      return bulkAction?.execute({
        resource,
        action: "delete",
        ids,
        confirmMessage: `Are you sure you want to delete ${ids?.length} item(s)?`,
        successMessage: "Items deleted successfully",
        errorMessage: "Failed to delete items",
        invalidateQueries: [`/api/${resource}`],
      });
    },
    [resource, bulkAction],
  );

  return { ...bulkAction, deleteItems };
}

export function useBulkUpdate(
  resource: string,
  options: UseBulkActionOptions = {},
) {
  const bulkAction = useBulkAction(options);

  const updateItems = useCallback(
    async (ids: string[], data: Record<string, any>) => {
      return bulkAction?.execute({
        resource,
        action: "update",
        ids,
        data,
        successMessage: "Items updated successfully",
        errorMessage: "Failed to update items",
        invalidateQueries: [`/api/${resource}`],
      });
    },
    [resource, bulkAction],
  );

  return { ...bulkAction, updateItems };
}

export function useBulkExport(
  resource: string,
  options: UseBulkActionOptions = {},
) {
  const bulkAction = useBulkAction(options);

  const exportItems = useCallback(
    async (ids: string[], format: string = "csv") => {
      return bulkAction?.execute({
        resource,
        action: "export",
        ids,
        data: { format },
        successMessage: "Export started",
        errorMessage: "Failed to export items",
      });
    },
    [resource, bulkAction],
  );

  return { ...bulkAction, exportItems };
}

export function useBulkStatusChange(
  resource: string,
  options: UseBulkActionOptions = {},
) {
  const bulkAction = useBulkAction(options);

  const changeStatus = useCallback(
    async (ids: string[], status: string) => {
      return bulkAction?.execute({
        resource,
        action: "status_change",
        ids,
        data: { status },
        successMessage: "Status updated successfully",
        errorMessage: "Failed to update status",
        invalidateQueries: [`/api/${resource}`],
      });
    },
    [resource, bulkAction],
  );

  return { ...bulkAction, changeStatus };
}
