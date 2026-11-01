import { pool } from "../db/pool.js";
export default async function tenantsRoutes(app) {
    app.post("/", {
        schema: {
            body: {
                type: "object",
                required: ["name"],
                properties: {
                    name: { type: "string", minLength: 1, maxLength: 255 },
                },
            },
        },
    }, async (req, reply) => {
        const { name } = req.body;
        const { rows } = await pool.query(`INSERT INTO tenants (name) VALUES ($1) RETURNING id, name, api_key, created_at`, [name]);
        return reply.code(201).send(rows[0]);
    });
    app.get("/:id", async (req, reply) => {
        const { rows } = await pool.query(`SELECT id, name, api_key, created_at FROM tenants WHERE id = $1`, [req.params.id]);
        if (!rows[0])
            return reply.code(404).send({ error: "not_found" });
        return reply.send(rows[0]);
    });
    app.get("/", async (_req, reply) => {
        const { rows } = await pool.query(`SELECT id, name, created_at FROM tenants ORDER BY created_at DESC`);
        return reply.send(rows);
    });
    app.delete("/:id", async (req, reply) => {
        const { rowCount } = await pool.query(`DELETE FROM tenants WHERE id = $1`, [
            req.params.id,
        ]);
        if (!rowCount)
            return reply.code(404).send({ error: "not_found" });
        return reply.code(204).send();
    });
}
//# sourceMappingURL=tenants.js.map