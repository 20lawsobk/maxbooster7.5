import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export type AIWorkflowState =
  | 'idle'
  | 'requesting'
  | 'processing'
  | 'success'
  | 'integrated'
  | 'error';

export type AIWorkflowType =
  | 'text-to-music'
  | 'audio-to-music'
  | 'ai-mix'
  | 'ai-master'
  | 'audio-analysis';

interface WorkflowData {
  currentState: AIWorkflowState;
  progress: number;
  errorMessage: string | null;
  retryCount: number;
  resultData: any | null;
  isIntegrated: boolean;
  timestamp?: number;
}

interface UseAIWorkflowOptions {
  maxRetries?: number;
  onStateChange?: (workflowType: AIWorkflowType, state: AIWorkflowState) => void;
  onProgress?: (workflowType: AIWorkflowType, progress: number) => void;
  onError?: (workflowType: AIWorkflowType, error: string) => void;
  onSuccess?: (workflowType: AIWorkflowType, data: unknown) => void;
}

const initialWorkflowData: WorkflowData = {
  currentState: 'idle',
  progress: 0,
  errorMessage: null,
  retryCount: 0,
  resultData: null,
  isIntegrated: false,
};

/**
 * TODO: Add function documentation
 */
export function useAIWorkflow(options: UseAIWorkflowOptions = {}) {
  const { toast } = useToast();
  const { maxRetries = 3, onStateChange, onProgress, onError, onSuccess } = options;

  const [workflows, setWorkflows] = useState<Record<AIWorkflowType, WorkflowData>>({
    'text-to-music': { ...initialWorkflowData },
    'audio-to-music': { ...initialWorkflowData },
    'ai-mix': { ...initialWorkflowData },
    'ai-master': { ...initialWorkflowData },
    'audio-analysis': { ...initialWorkflowData },
  });

  const abortControllersRef = useRef<Map<AIWorkflowType, AbortController>>(new Map());
  const progressIntervalsRef = useRef<Map<AIWorkflowType, NodeJS.Timeout>>(new Map());

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Cancel all active operations
      abortControllersRef.current.forEach((controller) => {
        controller.abort();
      });
      // Clear all progress intervals
      progressIntervalsRef.current.forEach((interval) => {
        clearInterval(interval);
      });
    };
  }, []);

  // Update workflow state
  const updateWorkflow = useCallback(
    (workflowType: AIWorkflowType, updates: Partial<WorkflowData>) => {
      setWorkflows((prev) => {
        const newState = {
          ...prev,
          [workflowType]: {
            ...prev[workflowType],
            ...updates,
            timestamp: Date.now(),
          },
        };

        // Call callbacks if provided
        if (updates.currentState && onStateChange) {
          onStateChange(workflowType, updates.currentState);
        }
        if (updates.progress !== undefined && onProgress) {
          onProgress(workflowType, updates.progress);
        }
        if (updates.errorMessage && onError) {
          onError(workflowType, updates.errorMessage);
        }
        if (updates.resultData && updates.currentState === 'success' && onSuccess) {
          onSuccess(workflowType, updates.resultData);
        }

        return newState;
      });
    },
    [onStateChange, onProgress, onError, onSuccess]
  );

  // Start a workflow
  const startWorkflow = useCallback(
    (workflowType: AIWorkflowType, apiCall: (signal?: AbortSignal) => Promise<any>) => {
      // Cancel any existing operation
      const existingController = abortControllersRef.current.get(workflowType);
      if (existingController) {
        existingController.abort();
      }

      // Clear any existing progress interval
      const existingInterval = progressIntervalsRef.current.get(workflowType);
      if (existingInterval) {
        clearInterval(existingInterval);
        progressIntervalsRef.current.delete(workflowType);
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllersRef.current.set(workflowType, abortController);

      // Update state to requesting
      updateWorkflow(workflowType, {
        currentState: 'requesting',
        progress: 0,
        errorMessage: null,
        resultData: null,
        isIntegrated: false,
      });

      // Simulate progress for better UX
      let currentProgress = 0;
      const progressInterval = setInterval(() => {
        if (currentProgress < 90) {
          currentProgress += Math.random() * 15;
          currentProgress = Math.min(90, currentProgress);
          updateWorkflow(workflowType, { progress: currentProgress });
        }
      }, 500);
      progressIntervalsRef.current.set(workflowType, progressInterval);

      // Execute the API call
      apiCall(abortController.signal)
        .then((data) => {
          // Clear progress interval
          clearInterval(progressInterval);
          progressIntervalsRef.current.delete(workflowType);

          // Update to processing state briefly
          updateWorkflow(workflowType, {
            currentState: 'processing',
            progress: 95,
          });

          // Then move to success
          setTimeout(() => {
            updateWorkflow(workflowType, {
              currentState: 'success',
              progress: 100,
              resultData: data,
              errorMessage: null,
            });

            // Log success for debugging
            logger.info(`[AI Workflow] ${workflowType} completed successfully:`, data);
          }, 500);

          // Clean up abort controller
          abortControllersRef.current.delete(workflowType);
        })
        .catch((error) => {
          // Clear progress interval
          clearInterval(progressInterval);
          progressIntervalsRef.current.delete(workflowType);

          if (error.name === 'AbortError') {
            // Operation was cancelled
            updateWorkflow(workflowType, {
              currentState: 'idle',
              progress: 0,
              errorMessage: null,
            });
            logger.info(`[AI Workflow] ${workflowType} was cancelled`);
          } else {
            // Handle error
            const errorMessage = error.message || 'An unknown error occurred';
            logger.error(`[AI Workflow] ${workflowType} error:`, error);

            updateWorkflow(workflowType, {
              currentState: 'error',
              progress: 0,
              errorMessage,
              retryCount: workflows[workflowType].retryCount,
            });

            toast({
              title: `${workflowType.replace('-', ' ')} failed`,
              description: errorMessage,
              variant: 'destructive',
            });
          }

          // Clean up abort controller
          abortControllersRef.current.delete(workflowType);
        });

      return abortController;
    },
    [workflows, updateWorkflow, toast]
  );

  // Cancel a workflow
  const cancel = useCallback(
    (workflowType: AIWorkflowType) => {
      const controller = abortControllersRef.current.get(workflowType);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(workflowType);
      }

      const interval = progressIntervalsRef.current.get(workflowType);
      if (interval) {
        clearInterval(interval);
        progressIntervalsRef.current.delete(workflowType);
      }

      updateWorkflow(workflowType, {
        currentState: 'idle',
        progress: 0,
        errorMessage: null,
      });

      logger.info(`[AI Workflow] ${workflowType} cancelled`);
    },
    [updateWorkflow]
  );

  // Retry a failed workflow
  const retry = useCallback(
    (workflowType: AIWorkflowType, apiCall: (signal?: AbortSignal) => Promise<any>) => {
      const currentWorkflow = workflows[workflowType];

      if (currentWorkflow.retryCount >= maxRetries) {
        logger.error(`[AI Workflow] ${workflowType} max retries (${maxRetries}) exceeded`);
        toast({
          title: 'Max retries exceeded',
          description: `Cannot retry ${workflowType.replace('-', ' ')} anymore. Please try again later.`,
          variant: 'destructive',
        });
        return;
      }

      // Increment retry count
      updateWorkflow(workflowType, {
        retryCount: currentWorkflow.retryCount + 1,
      });

      logger.info(
        `[AI Workflow] Retrying ${workflowType} (attempt ${currentWorkflow.retryCount + 1}/${maxRetries})`
      );

      // Start the workflow again
      return startWorkflow(workflowType, apiCall);
    },
    [workflows, maxRetries, updateWorkflow, startWorkflow, toast]
  );

  // Reset a workflow to idle state
  const reset = useCallback(
    (workflowType: AIWorkflowType) => {
      // Cancel any active operations
      cancel(workflowType);

      // Reset to initial state
      updateWorkflow(workflowType, {
        ...initialWorkflowData,
      });

      logger.info(`[AI Workflow] ${workflowType} reset to idle`);
    },
    [cancel, updateWorkflow]
  );

  // Mark results as integrated into project
  const integrate = useCallback(
    (workflowType: AIWorkflowType) => {
      const currentWorkflow = workflows[workflowType];

      if (currentWorkflow.currentState !== 'success') {
        logger.warn(`[AI Workflow] Cannot integrate ${workflowType} - not in success state`);
        return false;
      }

      updateWorkflow(workflowType, {
        currentState: 'integrated',
        isIntegrated: true,
      });

      logger.info(`[AI Workflow] ${workflowType} results integrated into project`);

      toast({
        title: 'Integration successful',
        description: `${workflowType.replace('-', ' ')} results have been added to your project.`,
      });

      return true;
    },
    [workflows, updateWorkflow, toast]
  );

  // Get workflow data for a specific type
  const getWorkflow = useCallback(
    (workflowType: AIWorkflowType): WorkflowData => {
      return workflows[workflowType];
    },
    [workflows]
  );

  // Check if any workflow is active
  const hasActiveWorkflow = useCallback((): boolean => {
    return Object.values(workflows).some(
      (w) => w.currentState === 'requesting' || w.currentState === 'processing'
    );
  }, [workflows]);

  // Get all active workflows
  const getActiveWorkflows = useCallback((): AIWorkflowType[] => {
    return (Object.keys(workflows) as AIWorkflowType[]).filter(
      (type) =>
        workflows[type].currentState === 'requesting' ||
        workflows[type].currentState === 'processing'
    );
  }, [workflows]);

  // Cancel all active workflows
  const cancelAll = useCallback(() => {
    (Object.keys(workflows) as AIWorkflowType[]).forEach((type) => {
      if (
        workflows[type].currentState === 'requesting' ||
        workflows[type].currentState === 'processing'
      ) {
        cancel(type);
      }
    });
  }, [workflows, cancel]);

  // Reset all workflows
  const resetAll = useCallback(() => {
    (Object.keys(workflows) as AIWorkflowType[]).forEach((type) => {
      reset(type);
    });
  }, [reset]);

  return {
    // Workflow data
    workflows,
    getWorkflow,

    // Workflow actions
    startWorkflow,
    cancel,
    retry,
    reset,
    integrate,

    // Bulk actions
    cancelAll,
    resetAll,

    // Status checks
    hasActiveWorkflow,
    getActiveWorkflows,

    // Individual workflow shortcuts for convenience
    textToMusic: workflows['text-to-music'],
    audioToMusic: workflows['audio-to-music'],
    aiMix: workflows['ai-mix'],
    aiMaster: workflows['ai-master'],
    audioAnalysis: workflows['audio-analysis'],
  };
}
