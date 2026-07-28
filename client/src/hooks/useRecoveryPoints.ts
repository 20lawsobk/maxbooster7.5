import { logger } from "../lib/logger";
import { useState, useCallback, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface RecoveryPoint {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  actionId: string;
  module?: string;
  isAutomatic?: boolean;
}

export interface RecoveryPointInput {
  name: string;
  description?: string;
}

export interface UseRecoveryPointsOptions {
  autoLoad?: boolean;
  maxPoints?: number;
  autoRecoveryEnabled?: boolean;
  autoRecoveryInterval?: number;
  onRecoveryPointCreated?: (point: RecoveryPoint) => void;
  onRestored?: (pointId: string) => void;
  onError?: (error: Error) => void;
}

export interface UseRecoveryPointsReturn {
  recoveryPoints: RecoveryPoint[];
  isLoading: boolean;
  isCreating: boolean;
  isRestoring: boolean;
  error: Error | null;
  loadRecoveryPoints: () => Promise<void>;
  createRecoveryPoint: (input: RecoveryPointInput) => Promise<RecoveryPoint>;
  restoreToPoint: (pointId: string) => Promise<void>;
  deleteRecoveryPoint: (pointId: string) => Promise<void>;
  clearAllRecoveryPoints: () => Promise<void>;
  enableAutoRecovery: (enabled: boolean) => void;
  isAutoRecoveryEnabled: boolean;
  getPointById: (pointId: string) => RecoveryPoint | undefined;
  getMostRecent: () => RecoveryPoint | undefined;
  getAutoRecoveryPoints: () => RecoveryPoint[];
  getManualRecoveryPoints: () => RecoveryPoint[];
}

export function useRecoveryPoints(
  options: UseRecoveryPointsOptions = {},
): UseRecoveryPointsReturn {
  const {
    autoLoad = true,
    maxPoints = 20,
    autoRecoveryEnabled: initialAutoRecovery = false,
    autoRecoveryInterval = 300000,
    onRecoveryPointCreated,
    onRestored,
    onError,
  } = options;

  const [recoveryPoints, setRecoveryPoints] = useState<RecoveryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isAutoRecoveryEnabled, setIsAutoRecoveryEnabled] =
    useState(initialAutoRecovery);

  const loadRecoveryPoints = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest("GET", "/api/undo/restore-points");
      const data = await response?.json();

      if (data?.success && data?.restorePoints) {
        const points: RecoveryPoint[] = data?.restorePoints.map(
          (rp: Record<string, unknown>) => ({
            id: rp.id,
            name: rp.name,
            description: rp.description,
            createdAt: rp.createdAt,
            actionId: rp.actionId,
            module: rp.module,
            isAutomatic: rp.name?.toLowerCase().includes("auto"),
          }),
        );
        setRecoveryPoints(points);
      }
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error("Failed to load recovery points");
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  const createRecoveryPoint = useCallback(
    async (input: RecoveryPointInput): Promise<RecoveryPoint> => {
      setIsCreating(true);
      setError(null);

      try {
        const response = await apiRequest(
          "POST",
          "/api/undo/create-restore-point",
          {
            name: input.name,
            description: input.description,
          },
        );
        const data = await response?.json();

        if (!data?.success) {
          throw new Error(data?.message || "Failed to create recovery point");
        }

        const newPoint: RecoveryPoint = {
          id: data.restorePointId,
          name: input.name,
          description: input.description,
          createdAt: new Date().toISOString(),
          actionId: "",
          isAutomatic: input.name.toLowerCase().includes("auto"),
        };

        setRecoveryPoints((prev) => [newPoint, ...prev].slice(0, maxPoints));
        onRecoveryPointCreated?.(newPoint);

        return newPoint;
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error("Failed to create recovery point");
        setError(error);
        onError?.(error);
        throw error;
      } finally {
        setIsCreating(false);
      }
    },
    [maxPoints, onRecoveryPointCreated, onError],
  );

  const restoreToPoint = useCallback(
    async (pointId: string): Promise<void> => {
      setIsRestoring(true);
      setError(null);

      try {
        const response = await apiRequest(
          "POST",
          `/api/undo/restore/${pointId}`,
        );
        const data = await response?.json();

        if (!data?.success) {
          throw new Error(data?.message || "Failed to restore to point");
        }

        onRestored?.(pointId);
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to restore to point");
        setError(error);
        onError?.(error);
        throw error;
      } finally {
        setIsRestoring(false);
      }
    },
    [onRestored, onError],
  );

  const deleteRecoveryPoint = useCallback(
    async (pointId: string): Promise<void> => {
      setError(null);

      try {
        await apiRequest("DELETE", `/api/undo/restore-points/${pointId}`);
        setRecoveryPoints((prev) => prev?.filter((p) => p?.id !== pointId));
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error("Failed to delete recovery point");
        setError(error);
        onError?.(error);
        throw error;
      }
    },
    [onError],
  );

  const clearAllRecoveryPoints = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      for (const point of recoveryPoints) {
        await apiRequest("DELETE", `/api/undo/restore-points/${point?.id}`);
      }
      setRecoveryPoints([]);
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error("Failed to clear recovery points");
      setError(error);
      onError?.(error);
      throw error;
    }
  }, [recoveryPoints, onError]);

  const enableAutoRecovery = useCallback((enabled: boolean) => {
    setIsAutoRecoveryEnabled(enabled);
  }, []);

  const getPointById = useCallback(
    (pointId: string): RecoveryPoint | undefined => {
      return recoveryPoints?.find((p) => p?.id === pointId);
    },
    [recoveryPoints],
  );

  const getMostRecent = useCallback((): RecoveryPoint | undefined => {
    return recoveryPoints[0];
  }, [recoveryPoints]);

  const getAutoRecoveryPoints = useCallback((): RecoveryPoint[] => {
    return recoveryPoints?.filter((p) => p?.isAutomatic);
  }, [recoveryPoints]);

  const getManualRecoveryPoints = useCallback((): RecoveryPoint[] => {
    return recoveryPoints?.filter((p) => !p?.isAutomatic);
  }, [recoveryPoints]);

  useEffect(() => {
    if (autoLoad) {
      loadRecoveryPoints();
    }
  }, [autoLoad, loadRecoveryPoints]);

  useEffect(() => {
    if (!isAutoRecoveryEnabled || autoRecoveryInterval <= 0) return;

    const interval = setInterval(() => {
      createRecoveryPoint({
        name: "Auto-recovery point",
        description: `Automatically created at ${new Date().toLocaleTimeString()}`,
      }).catch((err) => {
        logger.warn("Auto-recovery failed:", err);
      });
    }, autoRecoveryInterval);

    return () => clearInterval(interval);
  }, [isAutoRecoveryEnabled, autoRecoveryInterval, createRecoveryPoint]);

  return {
    recoveryPoints,
    isLoading,
    isCreating,
    isRestoring,
    error,
    loadRecoveryPoints,
    createRecoveryPoint,
    restoreToPoint,
    deleteRecoveryPoint,
    clearAllRecoveryPoints,
    enableAutoRecovery,
    isAutoRecoveryEnabled,
    getPointById,
    getMostRecent,
    getAutoRecoveryPoints,
    getManualRecoveryPoints,
  };
}

export function useAutoRecovery(
  options: Omit<UseRecoveryPointsOptions, "autoRecoveryEnabled"> & {
    intervalMs?: number;
  },
) {
  const { intervalMs = 300000, ...restOptions } = options;

  return useRecoveryPoints({
    ...restOptions,
    autoRecoveryEnabled: true,
    autoRecoveryInterval: intervalMs,
  });
}

export function useQuickRestore() {
  const { restoreToPoint, getMostRecent, isRestoring } = useRecoveryPoints({
    autoLoad: true,
  });

  const quickRestore = useCallback(async () => {
    const mostRecent = getMostRecent();
    if (mostRecent) {
      await restoreToPoint(mostRecent?.id);
    }
  }, [getMostRecent, restoreToPoint]);

  return {
    quickRestore,
    isRestoring,
    hasMostRecent: !!getMostRecent(),
  };
}

export default useRecoveryPoints;
