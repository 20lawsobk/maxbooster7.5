import { describe, expect, it, vi } from "vitest";
import {
  SecurityContainment, ContainmentDeniedError,
  configureApplicationContainment, getApplicationContainment,
} from "../../server/services/securityContainment";

describe("bounded security containment", () => {
  it("composes exactly one control with narrow approved paths", async () => {
    expect(() => getApplicationContainment()).toThrow("not composed");
    const engine = { configureContainment: vi.fn() };
    const control = configureApplicationContainment(engine, async () => ({ confirmed: true }));
    expect(getApplicationContainment()).toBe(control);
    expect(engine.configureContainment).toHaveBeenCalledWith(control);
    expect(control.actionsForPath("/api/autopilot/start")).toEqual([]);
    expect(control.actionsForPath("/api/auto-updates/stop")).toEqual([]);
    expect(control.actionsForPath("/api/auto-updates/run-once")).toEqual(["feature_disable"]);
    expect(control.actionsForPath("/api/autopilot/predict-engagement")).toEqual(["circuit_break"]);
    expect(() => configureApplicationContainment(engine, async () => ({ confirmed: true }))).toThrow("already composed");
  });
  it("requires explicit session acknowledgement and propagates persistence failure", async () => {
    const revoke = vi.fn(async () => ({ confirmed: true as const }));
    const control = new SecurityContainment({ revokeSessions: revoke });
    await expect(control.revokeSessions("user-1")).resolves.toMatchObject({ confirmed: true, scope: "user" });
    expect(revoke).toHaveBeenCalledWith("user-1");
    const silent = new SecurityContainment({ revokeSessions: vi.fn(async () => undefined) as any });
    await expect(silent.revokeSessions("user-1")).rejects.toThrow("not confirmed");
    const failed = new SecurityContainment({ revokeSessions: async () => { throw new Error("store offline"); } });
    await expect(failed.revokeSessions("user-1")).rejects.toThrow("store offline");
  });

  it("refuses real dependency callbacks until expiry, without extending duplicates", async () => {
    let now = 100;
    const control = new SecurityContainment({
      dependencies: [{ prefix: "/api/render", target: "renderer" }],
      now: () => now, durationMs: 100,
    });
    const operation = vi.fn(async () => "rendered");
    await expect(control.executeDependency("renderer", operation)).resolves.toBe("rendered");
    const effect = await control.isolateDependency("/api/render/job");
    now = 150;
    expect(await control.isolateDependency("/api/render")).toEqual(effect);
    await expect(control.executeDependency("renderer", operation)).rejects.toBeInstanceOf(ContainmentDeniedError);
    expect(operation).toHaveBeenCalledTimes(1);
    now = 200;
    await expect(control.executeDependency("renderer", operation)).resolves.toBe("rendered");
    await expect(control.isolateDependency("/api/renderer")).rejects.toThrow("No server-owned");
  });

  it("denies feature guard traffic and restores without affecting unrelated routes", async () => {
    const control = new SecurityContainment({ features: [{ prefix: "/api/studio", target: "studio" }] });
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) };
    const next = vi.fn();
    expect(control.actionsForPath("/api/studio")).toEqual(["feature_disable"]);
    await control.isolateFeature("/api/studio");
    expect(() => control.assertFeatureAllowed("studio")).toThrow(ContainmentDeniedError);
    control.guard({ path: "/api/studio/project" }, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    control.guard({ path: "/api/studio-other" }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    control.restore("feature", "studio");
    control.guard({ path: "/api/studio" }, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("rejects broad bindings and unbounded durations", () => {
    expect(() => new SecurityContainment({ features: [{ prefix: "/api/", target: "all" }] })).toThrow();
    expect(() => new SecurityContainment({ durationMs: Infinity })).toThrow();
    expect(() => new SecurityContainment({ durationMs: 300001 })).toThrow();
  });
});