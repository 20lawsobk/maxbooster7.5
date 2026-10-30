import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

export interface StudioGenerationLease {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  assertCurrent(): void;
  release(): void;
}

/** Cancel only the requests belonging to this mounted project scope. */
export function cancelStudioGenerationScope(controllers: Set<AbortController>): void {
  const owned = [...controllers];
  controllers.clear();
  for (const controller of owned) {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException("Studio generation scope closed", "AbortError"));
    }
  }
}

/** Independent leases allow intentional parallel jobs in the same project. */
export function createStudioGenerationLease(
  controllers: Set<AbortController>,
  scopeIsCurrent: () => boolean,
): StudioGenerationLease {
  const controller = new AbortController();
  let released = false;
  const lease: StudioGenerationLease = {
    signal: controller.signal,
    isCurrent: () => !released && !controller.signal.aborted && scopeIsCurrent(),
    assertCurrent() {
      if (lease.isCurrent()) return;
      if (!controller.signal.aborted) {
        controller.abort(new DOMException("Studio generation no longer belongs to the current project", "AbortError"));
      }
      throw controller.signal.reason;
    },
    release() {
      released = true;
      controllers.delete(controller);
    },
  };
  controllers.add(controller);
  try {
    lease.assertCurrent();
  } catch (error) {
    lease.release();
    throw error;
  }
  return lease;
}

/**
 * Switch identity and cancel the previous project's requests at layout commit,
 * before passive effects. An abandoned concurrent render cannot invalidate the
 * still-committed project. StrictMode can set up a fresh lease after its cleanup/
 * setup probe because a controller set is not a permanent closed-state latch.
 */
export function useStudioGenerationScope(
  projectId: string | null | undefined,
  getCurrentProjectId?: () => string | null | undefined,
): () => StudioGenerationLease {
  const current = useRef({ projectId, mounted: false });
  const controllers = useMemo(() => new Set<AbortController>(), [projectId]);
  useLayoutEffect(() => {
    current.current = { projectId, mounted: true };
    return () => {
      current.current.mounted = false;
      cancelStudioGenerationScope(controllers);
    };
  }, [controllers, projectId]);
  return useCallback(() => {
    // Zustand may switch synchronously before React commits its next render.
    // Pin even a standalone generator to the actual begin-time project scope.
    const authorityId = getCurrentProjectId?.();
    return createStudioGenerationLease(controllers, () =>
      current.current.mounted && current.current.projectId === projectId &&
      (!getCurrentProjectId || (getCurrentProjectId() === authorityId &&
        (projectId == null || projectId === authorityId))));
  }, [controllers, projectId, getCurrentProjectId]);
}
