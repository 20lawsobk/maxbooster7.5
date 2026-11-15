import { createStore } from "zustand/vanilla";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Executes the actual hook body/effect callbacks with explicit render/commit
// ordering. This is not real React DOM, route, screen-reader or browser proof.
const lifecycle = vi.hoisted(() => ({
  ref: undefined as { current: unknown } | undefined,
  memo: undefined as unknown,
  memoDeps: undefined as readonly unknown[] | undefined,
  effectDeps: undefined as readonly unknown[] | undefined,
  pending: undefined as (() => void | (() => void)) | undefined,
  setup: undefined as (() => void | (() => void)) | undefined,
  cleanup: undefined as (() => void) | undefined,
}));
vi.mock("react", () => ({
  useRef: (initial: unknown) => lifecycle.ref ??= { current: initial },
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
    if (!lifecycle.memoDeps || deps.some((value, index) => value !== lifecycle.memoDeps?.[index])) {
      lifecycle.memo = factory(); lifecycle.memoDeps = deps;
    }
    return lifecycle.memo;
  },
  useLayoutEffect: (setup: () => void | (() => void), deps: readonly unknown[]) => {
    if (!lifecycle.effectDeps || deps.some((value, index) => value !== lifecycle.effectDeps?.[index])) {
      lifecycle.pending = setup; lifecycle.effectDeps = deps;
    }
  },
  useCallback: (callback: unknown) => callback,
}));

import {
  cancelStudioGenerationScope,
  createStudioGenerationLease,
  useStudioGenerationScope,
} from "../../client/src/components/studio/useStudioGenerationScope";

function commitLayout() {
  if (!lifecycle.pending) return;
  lifecycle.cleanup?.();
  lifecycle.setup = lifecycle.pending;
  lifecycle.cleanup = lifecycle.pending() || undefined;
  lifecycle.pending = undefined;
}
beforeEach(() => {
  lifecycle.ref = undefined; lifecycle.memo = undefined;
  lifecycle.memoDeps = undefined; lifecycle.effectDeps = undefined;
  lifecycle.pending = undefined; lifecycle.setup = undefined; lifecycle.cleanup = undefined;
});

describe("Studio generation lease", () => {
  it("rejects and cancels a late result as soon as the project changes", () => {
    const controllers = new Set<AbortController>();
    let project = "project-a";
    const lease = createStudioGenerationLease(controllers, () => project === "project-a");
    expect(lease.isCurrent()).toBe(true);
    project = "project-b";
    expect(lease.isCurrent()).toBe(false);
    expect(() => lease.assertCurrent()).toThrow("current project");
    expect(lease.signal.aborted).toBe(true);
    expect(lease.signal.reason.name).toBe("AbortError");
    lease.release(); expect(controllers.size).toBe(0);
  });
  it("does not retain a failed initial lease or authorize a request after scope closure", () => {
    const controllers = new Set<AbortController>();
    expect(() => createStudioGenerationLease(controllers, () => false)).toThrow("current project");
    expect(controllers.size).toBe(0);
  });
  it("owns parallel requests independently and releases completed requests", () => {
    const controllers = new Set<AbortController>();
    const first = createStudioGenerationLease(controllers, () => true);
    const second = createStudioGenerationLease(controllers, () => true);
    expect(first.signal).not.toBe(second.signal);
    first.release(); first.release();
    expect(first.isCurrent()).toBe(false); expect(controllers.size).toBe(1);
    cancelStudioGenerationScope(controllers);
    expect(first.signal.aborted).toBe(false);
    expect(second.signal.aborted).toBe(true); expect(controllers.size).toBe(0);
    expect(() => second.assertCurrent()).toThrow("scope closed");
  });
  it("permits fresh independent leases after a cleanup/setup probe", () => {
    const controllers = new Set<AbortController>();
    const old = createStudioGenerationLease(controllers, () => true);
    cancelStudioGenerationScope(controllers);
    const fresh = createStudioGenerationLease(controllers, () => true);
    expect(old.isCurrent()).toBe(false); expect(fresh.isCurrent()).toBe(true);
    expect(fresh.signal.aborted).toBe(false); fresh.release();
  });
  it("cannot commit a released result even when its project is still current", () => {
    const controllers = new Set<AbortController>();
    const lease = createStudioGenerationLease(controllers, () => true);
    lease.release();
    expect(() => lease.assertCurrent()).toThrow("current project");
    expect(lease.signal.aborted).toBe(true); expect(controllers.size).toBe(0);
  });
});

describe("Studio project scope hook ordering", () => {
  it("switches project ownership at layout commit before any passive cleanup is needed", () => {
    const beginA = useStudioGenerationScope("project-a"); commitLayout();
    const old = beginA();
    const beginB = useStudioGenerationScope("project-b");
    // The old project remains committed until its replacement layout effect.
    expect(old.signal.aborted).toBe(false);
    expect(old.isCurrent()).toBe(true);
    old.assertCurrent();
    expect(() => beginB()).toThrow("current project");
    commitLayout();
    expect(old.signal.aborted).toBe(true);
    expect(old.isCurrent()).toBe(false);
    expect(() => beginA()).toThrow("current project");
    const fresh = beginB();
    expect(fresh.isCurrent()).toBe(true);
    fresh.assertCurrent(); fresh.release(); old.release();
  });
  it("an abandoned concurrent render does not cancel or invalidate the committed project's work", () => {
    const begin = useStudioGenerationScope("project-a"); commitLayout();
    const request = begin();
    useStudioGenerationScope("uncommitted-project-b");
    // Do not execute the new layout effect: this render never commits.
    request.assertCurrent();
    expect(request.isCurrent()).toBe(true); expect(request.signal.aborted).toBe(false);
    request.release();
  });
  it("does not authorize requests before first layout commit", () => {
    const begin = useStudioGenerationScope("owned-project");
    expect(() => begin()).toThrow("current project");
    commitLayout();
    const lease = begin(); lease.assertCurrent(); lease.release();
  });
  it("aborts all outstanding requests on unmount and prevents a retained callback starting another", () => {
    const begin = useStudioGenerationScope("owned-project"); commitLayout();
    const first = begin(); const second = begin();
    lifecycle.cleanup?.(); lifecycle.cleanup = undefined;
    expect(first.signal.aborted).toBe(true); expect(second.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(() => begin()).toThrow("current project");
  });
  it("handles StrictMode effect cleanup/setup without disabling later generation", () => {
    const begin = useStudioGenerationScope("owned-project"); commitLayout();
    const beforeProbe = begin();
    lifecycle.cleanup?.();
    expect(beforeProbe.signal.aborted).toBe(true);
    lifecycle.cleanup = lifecycle.setup?.() || undefined;
    const afterProbe = begin();
    afterProbe.assertCurrent(); expect(afterProbe.signal.aborted).toBe(false);
    afterProbe.release();
  });
  it("keeps existing requests current across an ordinary render of the same project", () => {
    const begin = useStudioGenerationScope("owned-project"); commitLayout();
    const request = begin();
    useStudioGenerationScope("owned-project"); commitLayout();
    expect(request.isCurrent()).toBe(true); expect(request.signal.aborted).toBe(false);
    request.release();
  });
});


describe("Studio authoritative project ownership", () => {
  it("rejects a synchronous Zustand switch before React render or layout cleanup", () => {
    const store = createStore(() => ({ project: { id: "project-a" } }));
    const begin = useStudioGenerationScope("project-a", () => store.getState().project.id);
    commitLayout();
    const lease = begin();
    store.setState({ project: { id: "project-b" } });
    // No render/effect is invoked after the real store mutation.
    expect(lease.signal.aborted).toBe(false);
    expect(lease.isCurrent()).toBe(false);
    expect(() => lease.assertCurrent()).toThrow("current project");
    expect(lease.signal.aborted).toBe(true);
    expect(lease.signal.reason.name).toBe("AbortError");
    expect(lease.isCurrent()).toBe(false);
    lease.release();
  });
  it.each([null, undefined])("pins a standalone %s generator to its actual initial store project", projectId => {
    const store = createStore(() => ({ project: { id: "project-a" } }));
    const begin = useStudioGenerationScope(projectId, () => store.getState().project.id);
    commitLayout();
    const lease = begin();
    lease.assertCurrent();
    store.setState({ project: { id: "project-b" } });
    expect(lease.isCurrent()).toBe(false);
    expect(() => lease.assertCurrent()).toThrow("current project");
    expect(lease.signal.aborted).toBe(true);
    lease.release();
  });
  it("rejects a supplied project that already disagrees with the actual store", () => {
    const store = createStore(() => ({ project: { id: "project-b" } }));
    const begin = useStudioGenerationScope("project-a", () => store.getState().project.id);
    commitLayout();
    expect(() => begin()).toThrow("current project");
    expect((lifecycle.memo as Set<AbortController>).size).toBe(0);
  });
  it("pins an initially missing authoritative ID rather than treating it as no getter", () => {
    const store = createStore<{ project: { id: string | undefined } }>(() => ({ project: { id: undefined } }));
    const begin = useStudioGenerationScope(undefined, () => store.getState().project.id);
    commitLayout();
    const lease = begin();
    lease.assertCurrent();
    store.setState({ project: { id: "new-project" } });
    expect(lease.isCurrent()).toBe(false);
    expect(() => lease.assertCurrent()).toThrow("current project");
    lease.release();
  });
  it("does not cancel when a new store object preserves the same authoritative ID", () => {
    const store = createStore(() => ({ project: { id: "owned-project" } }));
    const begin = useStudioGenerationScope("owned-project", () => store.getState().project.id);
    commitLayout();
    const lease = begin();
    store.setState({ project: { id: "owned-project" } });
    lease.assertCurrent(); expect(lease.isCurrent()).toBe(true);
    expect(lease.signal.aborted).toBe(false); lease.release();
  });
});
