import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

export default async function zonesRoutes(app: FastifyInstance) {
  app.post<{ Body: { tenant_id: string; name: string } }>('/', {
    schema: {
      body: {
        type: 'object',
        required: ['tenant_id', 'name'],
        properties: {
          tenant_id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1, maxLength: 253 },
        },
      },
    },
  }, async (req, reply) => {
    const { tenant_id, name } = req.body;
    const normalised = name.toLowerCase().replace(/\.$/, '');

    const { rows } = await pool.query(
      `INSERT INTO zones (tenant_id, name)
       VALUES ($1, $2)
       RETURNING id, tenant_id, name, status, serial, created_at`,
      [tenant_id, normalised],
    );
    return reply.code(201).send(rows[0]);
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, tenant_id, name, status, serial, created_at, updated_at
       FROM zones WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' });
    return reply.send(rows[0]);
  });

  app.get<{ Querystring: { tenant_id?: string } }>('/', async (req, reply) => {
    const { tenant_id } = req.query;
    const { rows } = tenant_id
      ? await pool.query(`SELECT id, tenant_id, name, status, serial FROM zones WHERE tenant_id = $1 ORDER BY name`, [tenant_id])
      : await pool.query(`SELECT id, tenant_id, name, status, serial FROM zones ORDER BY name`);
    return reply.send(rows);
  });

  app.patch<{ Params: { id: string }; Body: { status?: string } }>('/:id', async (req, reply) => {
    const { status } = req.body;
    if (!status) return reply.code(400).send({ error: 'nothing_to_update' });
    const { rows } = await pool.query(
      `UPDATE zones SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, req.params.id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' });
    return reply.send(rows[0]);
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rowCount } = await pool.query(`DELETE FROM zones WHERE id = $1`, [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
