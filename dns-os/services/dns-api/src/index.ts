import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { hasDnsApiDatabaseConfiguration, pool, schema } from "./db/pool.js";
import tenantsRoutes from "./routes/tenants.js";
import zonesRoutes from "./routes/zones.js";
import recordsRoutes from "./routes/records.js";

const API_TOKEN = process.env.DNS_API_TOKEN || "";
const READY_TABLES = ["tenants", "zones", "records", "audit_log"] as const;

function tokenMatches(candidate: string, expected: string): boolean {
  const actualBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes);
}

export async function dnsApiDatabaseReady(): Promise<boolean> {
  if (!hasDnsApiDatabaseConfiguration()) return false;
  const relations = READY_TABLES.map((table) => `${schema}.${table}`);
  const result = await pool.query(
    "SELECT to_regclass($1) AS tenants, to_regclass($2) AS zones, " +
      "to_regclass($3) AS records, to_regclass($4) AS audit_log",
    relations,
  );
  const row = result.rows[0];
  return Boolean(
    row && READY_TABLES.every((table) => row[table] !== null),
  );
}

export function createDnsApiApp({
  token = API_TOKEN,
  logger = process.env.NODE_ENV !== "test",
}: {
  token?: string;
  logger?: boolean;
} = {}) {
  if (Buffer.byteLength(token, "utf8") < 32) {
    throw new Error("DNS_API_TOKEN must contain at least 32 characters");
  }
  const app = Fastify({ logger });

  app.addHook("preHandler", async (request, reply) => {
    const route = request.routeOptions.url;
    if (route === "/health" || route === "/ready") return;
    const authorization = request.headers.authorization || "";
    const candidate = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!tokenMatches(candidate, token)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));
  app.get("/status", async () => ({
    service: "dns-api",
    schema,
    managementAuthRequired: true,
  }));
  app.get("/ready", async (_request, reply) => {
    if (!hasDnsApiDatabaseConfiguration()) {
      return reply.code(503).send({ ok: false, reason: "database_not_configured" });
    }
    try {
      if (!await dnsApiDatabaseReady()) {
        return reply.code(503).send({ ok: false, reason: "schema_not_ready" });
      }
      return reply.send({ ok: true });
    } catch {
      return reply.code(503).send({ ok: false, reason: "database_unavailable" });
    }
  });

  app.register(tenantsRoutes, { prefix: "/tenants" });
  app.register(zonesRoutes, { prefix: "/zones" });
  app.register(recordsRoutes);
  return app;
}

export async function startDnsApi() {
  const app = createDnsApiApp();
  try {
    if (!await dnsApiDatabaseReady()) {
      throw new Error("DNS API schema is not ready; run npm run dns-api:migrate");
    }
    const port = Number(process.env.DNS_API_PORT || process.env.PORT || 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error("DNS_API_PORT must be an integer from 1 to 65535");
    }
    await app.listen({
      port,
      host: process.env.DNS_API_HOST || "0.0.0.0",
    });
    return app;
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const app = await startDnsApi();
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await app.close().catch(() => undefined);
      await pool.end().catch(() => undefined);
    };
    process.once("SIGTERM", () => { void stop(); });
    process.once("SIGINT", () => { void stop(); });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code || "startup_failed";
    console.error(`[dns-api] startup failed (${String(code)}); database details omitted`);
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
  }
}
