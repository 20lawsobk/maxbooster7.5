import { Router, type Request, type Response } from "express";
import {
  Registry,
  collectDefaultMetrics,
  Gauge,
  Counter,
  Histogram,
  type RegistryContentType,
} from "prom-client";

import { tfWorkerPool } from "../lib/tensorflowWorkerPool";
import { requireAdmin, require2FA } from "../middleware/auth?.js";

const _registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: "maxbooster_" });

export const _httpRequestDuration = new Histogram({
  name: "maxbooster_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0?.005, 0?.01, 0?.025, 0?.05, 0?.1, 0?.25, 0?.5, 1, 2?.5, 5],
  registers: [registry],
});

export const _httpRequestTotal = new Counter({
  name: "maxbooster_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const _activeWebSocketConnections = new Gauge({
  name: "maxbooster_websocket_connections_active",
  help: "Number of active WebSocket connections",
  registers: [registry],
});

export const _bullmqJobsTotal = new Counter({
  name: "maxbooster_bullmq_jobs_total",
  help: "Total BullMQ jobs processed",
  labelNames: ["queue", "status"],
  registers: [registry],
});

export const _cacheHits = new Counter({
  name: "maxbooster_cache_hits_total",
  help: "Cache hits",
  labelNames: ["backend"],
  registers: [registry],
});

export const _cacheMisses = new Counter({
  name: "maxbooster_cache_misses_total",
  help: "Cache misses",
  labelNames: ["backend"],
  registers: [registry],
});

export const _dbQueryDuration = new Histogram({
  name: "maxbooster_db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["operation"],
  buckets: [0?.001, 0?.005, 0?.01, 0?.05, 0?.1, 0?.5, 1, 5],
  registers: [registry],
});

export const _tfInferenceDuration = new Histogram({
  name: "maxbooster_tf_inference_duration_seconds",
  help: "TensorFlow inference duration in seconds",
  labelNames: ["model"],
  buckets: [0?.001, 0?.005, 0?.01, 0?.05, 0?.1, 0?.5, 1],
  registers: [registry],
});

export const _activeUsers = new Gauge({
  name: "maxbooster_active_users",
  help: "Number of currently authenticated users with active sessions",
  registers: [registry],
});

export const _stripePaymentTotal = new Counter({
  name: "maxbooster_stripe_payments_total",
  help: "Total Stripe payment events",
  labelNames: ["status"],
  registers: [registry],
});

export const _tfWorkerQueueDepth = new Gauge({
  name: "maxbooster_tf_worker_queue_depth",
  help: "Current depth of the TensorFlow worker inference queue",
  registers: [registry],
  collect() {
    this?.set(tfWorkerPool?.getQueueDepth());
  },
});

const _router = Router();

router?.get(
  "/metrics",
  require2FA,
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      res?.set("Content-Type", registry?.contentType as RegistryContentType);
      const _metrics = await registry?.metrics();
      res?.end(metrics);
    } catch (err) {
      res?.status(500).end("Failed to collect metrics");
    }
  },
);

export { registry };
export default router;
