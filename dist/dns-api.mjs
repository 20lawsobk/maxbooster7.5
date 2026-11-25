// dns-os/services/dns-api/src/index.ts
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";

// dns-os/services/dns-api/src/db/pool.ts
import { Pool } from "pg";
var databaseUrl = process.env.DNS_API_DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_PRIMARY_URL || process.env.DATABASE_URL;
var schema = process.env.DNS_API_DB_SCHEMA || "public";
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
  throw new Error("DNS_API_DB_SCHEMA must be a lowercase PostgreSQL schema identifier");
}
var pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 6e4,
  connectionTimeoutMillis: 5e3
});
function hasDnsApiDatabaseConfiguration() {
  return Boolean(databaseUrl);
}
pool.on("error", (err) => {
  const code = err.code || "unknown";
  console.error(`[dns-api] database pool error (${code}); details omitted`);
});

// dns-os/services/dns-api/src/routes/tenants.ts
async function tenantsRoutes(app) {
  app.post(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 }
          }
        }
      }
    },
    async (req, reply) => {
      const { name } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO ${schema}.tenants (name) VALUES ($1) RETURNING id, name, api_key, created_at`,
        [name]
      );
      return reply.code(201).send(rows[0]);
    }
  );
  app.get("/:id", async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, name, api_key, created_at FROM ${schema}.tenants WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: "not_found" });
    return reply.send(rows[0]);
  });
  app.get("/", async (_req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, name, created_at FROM ${schema}.tenants ORDER BY created_at DESC`
    );
    return reply.send(rows);
  });
  app.delete("/:id", async (req, reply) => {
    const { rowCount } = await pool.query(`DELETE FROM ${schema}.tenants WHERE id = $1`, [
      req.params.id
    ]);
    if (!rowCount) return reply.code(404).send({ error: "not_found" });
    return reply.code(204).send();
  });
}

// dns-os/services/dns-api/src/routes/zones.ts
async function zonesRoutes(app) {
  app.post(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["tenant_id", "name"],
          properties: {
            tenant_id: { type: "string", format: "uuid" },
            name: { type: "string", minLength: 1, maxLength: 253 }
          }
        }
      }
    },
    async (req, reply) => {
      const { tenant_id, name } = req.body;
      const normalised = name.toLowerCase().replace(/\.$/, "");
      const { rows } = await pool.query(
        `INSERT INTO ${schema}.zones (tenant_id, name)
       VALUES ($1, $2)
       RETURNING id, tenant_id, name, status, serial, created_at`,
        [tenant_id, normalised]
      );
      return reply.code(201).send(rows[0]);
    }
  );
  app.get("/:id", async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, tenant_id, name, status, serial, created_at, updated_at
       FROM ${schema}.zones WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: "not_found" });
    return reply.send(rows[0]);
  });
  app.get("/", async (req, reply) => {
    const { tenant_id } = req.query;
    const { rows } = tenant_id ? await pool.query(
      `SELECT id, tenant_id, name, status, serial FROM ${schema}.zones WHERE tenant_id = $1 ORDER BY name`,
      [tenant_id]
    ) : await pool.query(
      `SELECT id, tenant_id, name, status, serial FROM ${schema}.zones ORDER BY name`
    );
    return reply.send(rows);
  });
  app.patch(
    "/:id",
    async (req, reply) => {
      const { status } = req.body;
      if (!status) return reply.code(400).send({ error: "nothing_to_update" });
      const { rows } = await pool.query(
        `UPDATE ${schema}.zones SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [status, req.params.id]
      );
      if (!rows[0]) return reply.code(404).send({ error: "not_found" });
      return reply.send(rows[0]);
    }
  );
  app.delete("/:id", async (req, reply) => {
    const { rowCount } = await pool.query(`DELETE FROM ${schema}.zones WHERE id = $1`, [
      req.params.id
    ]);
    if (!rowCount) return reply.code(404).send({ error: "not_found" });
    return reply.code(204).send();
  });
}

// dns-os/services/dns-api/src/routes/records.ts
var VALID_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SRV",
  "CAA",
  "PTR"
];
function validateRecord(type, data, priority, weight, port) {
  switch (type) {
    case "A": {
      const ok = /^(\d{1,3}\.){3}\d{1,3}$/.test(data) && data.split(".").map(Number).every((n) => n <= 255);
      if (!ok) return "A record must be a valid IPv4 address";
      break;
    }
    case "AAAA":
      if (!/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::$/.test(data))
        return "AAAA record must be a valid IPv6 address";
      break;
    case "MX":
      if (priority === void 0) return "MX records require priority";
      break;
    case "SRV":
      if (priority === void 0 || weight === void 0 || port === void 0)
        return "SRV records require priority, weight and port";
      break;
    case "TXT":
      if (data.length > 4096)
        return "TXT record value too long (max 4096 chars)";
      break;
  }
  return null;
}
async function recordsRoutes(app) {
  app.post(
    "/zones/:zone_id/records",
    {
      schema: {
        params: {
          type: "object",
          required: ["zone_id"],
          properties: { zone_id: { type: "string", format: "uuid" } }
        },
        body: {
          type: "object",
          required: ["name", "type", "data"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 253 },
            type: { type: "string", enum: VALID_TYPES },
            ttl: { type: "integer", minimum: 60, maximum: 604800 },
            priority: { type: "integer", minimum: 0, maximum: 65535 },
            weight: { type: "integer", minimum: 0, maximum: 65535 },
            port: { type: "integer", minimum: 0, maximum: 65535 },
            data: { type: "string", minLength: 1 }
          }
        }
      }
    },
    async (req, reply) => {
      const { zone_id } = req.params;
      const { name, type, ttl = 3600, priority, weight, port, data } = req.body;
      const validErr = validateRecord(type, data, priority, weight, port);
      if (validErr) return reply.code(400).send({ error: validErr });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO ${schema}.records (zone_id, name, type, ttl, priority, weight, port, data)
         VALUES ($1, $2, upper($3), $4, $5, $6, $7, $8)
         ON CONFLICT (zone_id, name, type, data)
         DO UPDATE SET ttl = EXCLUDED.ttl,
                       priority = EXCLUDED.priority,
                       weight = EXCLUDED.weight,
                       port = EXCLUDED.port,
                       updated_at = now()`,
          [
            zone_id,
            name,
            type,
            ttl,
            priority ?? null,
            weight ?? null,
            port ?? null,
            data
          ]
        );
        await client.query(
          `UPDATE ${schema}.zones
           SET serial = serial + 1, updated_at = now()
           WHERE id = $1`,
          [zone_id]
        );
        await client.query("COMMIT");
        return reply.code(201).send({ ok: true });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  );
  app.get(
    "/zones/:zone_id/records",
    async (req, reply) => {
      const { rows } = await pool.query(
        `SELECT id, name, type, ttl, priority, weight, port, data, created_at, updated_at
       FROM ${schema}.records WHERE zone_id = $1 ORDER BY type, name`,
        [req.params.zone_id]
      );
      return reply.send(rows);
    }
  );
  app.delete(
    "/zones/:zone_id/records/:record_id",
    async (req, reply) => {
      const { zone_id, record_id } = req.params;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rowCount } = await client.query(
          `DELETE FROM ${schema}.records WHERE id = $1 AND zone_id = $2`,
          [record_id, zone_id]
        );
        if (!rowCount) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "not_found" });
        }
        await client.query(
          `UPDATE ${schema}.zones
           SET serial = serial + 1, updated_at = now()
           WHERE id = $1`,
          [zone_id]
        );
        await client.query("COMMIT");
        return reply.code(204).send();
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  );
}

// dns-os/services/dns-api/src/index.ts
var API_TOKEN = process.env.DNS_API_TOKEN || "";
var READY_TABLES = ["tenants", "zones", "records", "audit_log"];
function tokenMatches(candidate, expected) {
  const actualBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
async function dnsApiDatabaseReady() {
  if (!hasDnsApiDatabaseConfiguration()) return false;
  const relations = READY_TABLES.map((table) => `${schema}.${table}`);
  const result = await pool.query(
    "SELECT to_regclass($1) AS tenants, to_regclass($2) AS zones, to_regclass($3) AS records, to_regclass($4) AS audit_log",
    relations
  );
  const row = result.rows[0];
  return Boolean(
    row && READY_TABLES.every((table) => row[table] !== null)
  );
}
function createDnsApiApp({
  token = API_TOKEN,
  logger = process.env.NODE_ENV !== "test"
} = {}) {
  if (Buffer.byteLength(token, "utf8") < 32) {
    throw new Error("DNS_API_TOKEN must contain at least 32 characters");
  }
  const app = Fastify({ logger });
  app.addHook("preHandler", async (request, reply) => {
    const route = request.routeOptions.url;
    if (route === "/health" || route === "/ready") return;
    const authorization = request.headers.authorization || "";
    const candidate = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!tokenMatches(candidate, token)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });
  app.get("/health", async () => ({ ok: true, ts: (/* @__PURE__ */ new Date()).toISOString() }));
  app.get("/status", async () => ({
    service: "dns-api",
    schema,
    managementAuthRequired: true
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
async function startDnsApi() {
  const app = createDnsApiApp();
  try {
    if (!await dnsApiDatabaseReady()) {
      throw new Error("DNS API schema is not ready; run npm run dns-api:migrate");
    }
    const port = Number(process.env.DNS_API_PORT || process.env.PORT || 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("DNS_API_PORT must be an integer from 1 to 65535");
    }
    await app.listen({
      port,
      host: process.env.DNS_API_HOST || "0.0.0.0"
    });
    return app;
  } catch (error) {
    await app.close().catch(() => void 0);
    throw error;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const app = await startDnsApi();
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await app.close().catch(() => void 0);
      await pool.end().catch(() => void 0);
    };
    process.once("SIGTERM", () => {
      void stop();
    });
    process.once("SIGINT", () => {
      void stop();
    });
  } catch (error) {
    const code = error?.code || "startup_failed";
    console.error(`[dns-api] startup failed (${String(code)}); database details omitted`);
    await pool.end().catch(() => void 0);
    process.exitCode = 1;
  }
}
export {
  createDnsApiApp,
  dnsApiDatabaseReady,
  startDnsApi
};
