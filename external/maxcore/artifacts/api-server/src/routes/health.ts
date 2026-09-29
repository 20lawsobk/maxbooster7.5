import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

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
