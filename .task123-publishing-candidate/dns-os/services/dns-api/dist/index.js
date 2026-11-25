import Fastify from "fastify";
import { pool } from "./db/pool.js";
import tenantsRoutes from "./routes/tenants.js";
import zonesRoutes from "./routes/zones.js";
import recordsRoutes from "./routes/records.js";
const app = Fastify({ logger: true });
// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));
// ─── Routes ───────────────────────────────────────────────────────────────────
app.register(tenantsRoutes, { prefix: "/tenants" });
app.register(zonesRoutes, { prefix: "/zones" });
app.register(recordsRoutes); // owns /zones/:zone_id/records
// ─── Boot ─────────────────────────────────────────────────────────────────────
const start = async () => {
    try {
        const client = await pool.connect();
        client.release();
        app.log.info("db connection verified");
        await app.listen({
            port: Number(process.env.PORT ?? 8080),
            host: "0.0.0.0",
        });
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=index.js.map