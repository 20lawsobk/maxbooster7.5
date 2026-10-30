// ============================================================================
// REDIS-LIKE HTTP API ROUTES
// POST   /instances                   - Create a new instance
// GET    /instances                   - List all instances
// GET    /instances/:id               - Get instance info (requires Bearer token)
// DELETE /instances/:id               - Delete an instance (requires Bearer token)
// POST   /instances/:id/exec          - Execute a command  (requires Bearer token)
// POST   /instances/:id/pipeline      - Execute a pipeline (requires Bearer token)
// GET    /instances/:id/keys          - List keys (requires Bearer token)
// POST   /instances/:id/flush         - Flush the DB      (requires Bearer token)
// ============================================================================

import { Router, type Request, type Response, type IRouter } from "express";
import { z } from "zod/v4";
import { adapter } from "../cluster/adapter.js";
import { buildConnectionUrl, buildHttpUrl } from "../redis/manager.js";
import { stayAliveService } from "../services/stayAliveService.js";

const router: IRouter = Router({ mergeParams: true });

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractToken(req: Request): string | null {
  const auth = req.headers["authorization"];
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

async function requireAuth(
  req: Request,
  res: Response,
  instanceId: string,
): Promise<boolean> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      error: "NOAUTH Authentication required. Provide a Bearer token.",
    });
    return false;
  }
  const valid = await adapter.validateToken(instanceId, token);
  if (!valid) {
    res
      .status(403)
      .json({ error: "WRONGPASS Invalid token for this instance." });
    return false;
  }
  return true;
}

function serializeResult(result: unknown): unknown {
  if (result === null) return null;
  if (
    typeof result === "string" ||
    typeof result === "number" ||
    typeof result === "boolean"
  )
    return result;
  if (Array.isArray(result)) return result;
  if (typeof result === "object") return result;
  return result;
}

// ── Create Instance ───────────────────────────────────────────────────────────

const CreateInstanceSchema = z.object({
  name: z.string().min(1).max(64),
  maxKeys: z.number().int().nonnegative().optional().default(0),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = CreateInstanceSchema.parse(req.body);
    const instance = await adapter.createInstance(body.name, body.maxKeys);
    stayAliveService.registerInstance(instance.id, instance.token);
    res.status(201).json({
      id: instance.id,
      name: instance.name,
      token: instance.token,
      connectionUrl: instance.connectionUrl,
      httpUrl: instance.httpUrl,
      createdAt: instance.createdAt,
      docs: {
        execEndpoint: `${instance.httpUrl}/exec`,
        exampleCommand: {
          method: "POST",
          url: `${instance.httpUrl}/exec`,
          headers: { Authorization: `Bearer ${instance.token}` },
          body: { cmd: "SET", args: ["mykey", "hello"] },
        },
        supportedCommands: [
          "GET",
          "SET",
          "DEL",
          "EXISTS",
          "EXPIRE",
          "TTL",
          "PTTL",
          "PERSIST",
          "TYPE",
          "KEYS",
          "SCAN",
          "RENAME",
          "INCR",
          "INCRBY",
          "DECR",
          "DECRBY",
          "APPEND",
          "MGET",
          "MSET",
          "SETNX",
          "SETEX",
          "STRLEN",
          "GETRANGE",
          "LPUSH",
          "RPUSH",
          "LPOP",
          "RPOP",
          "LRANGE",
          "LLEN",
          "LINDEX",
          "LSET",
          "LINSERT",
          "LTRIM",
          "LREM",
          "LMOVE",
          "HSET",
          "HMSET",
          "HGET",
          "HMGET",
          "HGETALL",
          "HDEL",
          "HEXISTS",
          "HKEYS",
          "HVALS",
          "HLEN",
          "HINCRBY",
          "SADD",
          "SREM",
          "SMEMBERS",
          "SCARD",
          "SISMEMBER",
          "SUNION",
          "SINTER",
          "SDIFF",
          "PING",
          "FLUSHDB",
          "DBSIZE",
          "INFO",
        ],
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", issues: err.issues });
    } else {
      res.status(500).json({ error: String(err) });
    }
  }
});

// ── List Instances ─────────────────────────────────────────────────────────
// Tokens are masked here — retrieve the full connectionUrl via GET /:id

router.get("/", async (_req: Request, res: Response) => {
  try {
    const instances = await adapter.listInstances();
    res.json({
      count: instances.length,
      instances: instances.map((i) => ({
        id: i.id,
        name: i.name,
        httpUrl: i.httpUrl,
        tokenHint: i.tokenHint,
        isActive: i.isActive,
        keyCount: i.keyCount,
        createdAt: i.createdAt,
        lastUsedAt: i.lastUsedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Get Instance Info ─────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (!(await requireAuth(req, res, id))) return;

  try {
    const stats = await adapter.getStats(id);
    if (!stats) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }
    res.json({
      id: stats.instanceId,
      name: stats.instanceName,
      connectionUrl: buildConnectionUrl(extractToken(req)!, id),
      httpUrl: buildHttpUrl(id),
      keyCount: stats.keyCount,
      totalCommandsProcessed: stats.totalCommandsProcessed,
      uptimeSeconds: stats.uptimeSeconds,
      createdAt: stats.createdAt,
      lastSavedAt: stats.lastSavedAt,
      persistenceEnabled: stats.persistenceEnabled,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Delete Instance ───────────────────────────────────────────────────────

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (!(await requireAuth(req, res, id))) return;

  try {
    const deleted = await adapter.deleteInstance(id);
    if (!deleted) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }
    stayAliveService.unregisterInstance(id);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Execute Command ───────────────────────────────────────────────────────

const ExecSchema = z.object({
  cmd: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
});

router.post("/:id/exec", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (!(await requireAuth(req, res, id))) return;

  try {
    const body = ExecSchema.parse(req.body);

    adapter.touchInstance(id);

    const result = await adapter.exec(id, body.cmd, body.args);
    res.json({ result: serializeResult(result) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isRedisErr =
      msg.startsWith("WRONGTYPE") ||
      msg.startsWith("ERR") ||
      msg.startsWith("NOAUTH") ||
      msg.startsWith("NOSCRIPT");
    if (isRedisErr) {
      res.status(400).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

// ── Pipeline (batch commands) ─────────────────────────────────────────────

const PipelineSchema = z
  .array(
    z.object({
      cmd: z.string().min(1),
      args: z.array(z.string()).optional().default([]),
    }),
  )
  .min(1)
  .max(1000);

router.post("/:id/pipeline", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (!(await requireAuth(req, res, id))) return;

  try {
    const commands = PipelineSchema.parse(req.body);

    adapter.touchInstance(id);

    const results = await adapter.pipeline(id, commands);
    res.json({
      results: results.map((r) => ({
        result: serializeResult(r.result),
        error: r.error,
      })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid pipeline", issues: err.issues });
    } else {
      res.status(500).json({ error: String(err) });
    }
  }
});

// ── List Keys ─────────────────────────────────────────────────────────────

router.get("/:id/keys", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (!(await requireAuth(req, res, id))) return;

  try {
    const pattern =
      typeof req.query["pattern"] === "string" ? req.query["pattern"] : "*";
    const keys = (await adapter.exec(id, "KEYS", [pattern])) as string[];
    res.json({ count: keys.length, keys });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Flush DB ──────────────────────────────────────────────────────────────

router.post("/:id/flush", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (!(await requireAuth(req, res, id))) return;

  try {
    const exists = await adapter.instanceExists(id);
    if (!exists) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }
    await adapter.exec(id, "FLUSHDB", []);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
