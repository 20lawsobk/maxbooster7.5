import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

export type PythonServingMode = "trained_checkpoint" | "live_awareness";

/** Accept only explicit generation readiness; process liveness is insufficient. */
export function classifyPythonServingReadiness(value: unknown): PythonServingMode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (state.ready !== true || state.generation_ready !== true) return null;
  if (state.model_loaded === true) return "trained_checkpoint";
  const awareness = state.live_awareness;
  if (
    state.generation_mode === "live_awareness" &&
    awareness && typeof awareness === "object" && !Array.isArray(awareness) &&
    (awareness as Record<string, unknown>).live_awareness_serving === true
  ) {
    return "live_awareness";
  }
  return null;
}

/** Operational readiness only; this does not certify learned model quality. */
export function isOperationallyReady(state: {
  pythonReachable: boolean;
  pythonReady: boolean;
  pythonRestarting: boolean;
  circuitBreaker: string;
}): boolean {
  return state.pythonReachable && state.pythonReady && !state.pythonRestarting &&
    state.circuitBreaker === "closed";
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
