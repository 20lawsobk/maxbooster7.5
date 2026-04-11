import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

const VALID_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR'] as const;

function validateRecord(type: string, data: string, priority?: number, weight?: number, port?: number): string | null {
  switch (type) {
    case 'A': {
      const ok = /^(\d{1,3}\.){3}\d{1,3}$/.test(data) && data.split('.').map(Number).every(n => n <= 255);
      if (!ok) return 'A record must be a valid IPv4 address';
      break;
    }
    case 'AAAA':
      if (!/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::$/.test(data))
        return 'AAAA record must be a valid IPv6 address';
      break;
    case 'MX':
      if (priority === undefined) return 'MX records require priority';
      break;
    case 'SRV':
      if (priority === undefined || weight === undefined || port === undefined)
        return 'SRV records require priority, weight and port';
      break;
    case 'TXT':
      if (data.length > 4096) return 'TXT record value too long (max 4096 chars)';
      break;
  }
  return null;
}

export default async function recordsRoutes(app: FastifyInstance) {
  app.post<{
    Params: { zone_id: string };
    Body: { name: string; type: string; ttl?: number; priority?: number; weight?: number; port?: number; data: string };
  }>('/zones/:zone_id/records', {
    schema: {
      params: { type: 'object', required: ['zone_id'], properties: { zone_id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['name', 'type', 'data'],
        properties: {
          name:     { type: 'string', minLength: 1, maxLength: 253 },
          type:     { type: 'string', enum: VALID_TYPES },
          ttl:      { type: 'integer', minimum: 60, maximum: 604800 },
          priority: { type: 'integer', minimum: 0, maximum: 65535 },
          weight:   { type: 'integer', minimum: 0, maximum: 65535 },
          port:     { type: 'integer', minimum: 0, maximum: 65535 },
          data:     { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const { zone_id } = req.params;
    const { name, type, ttl = 3600, priority, weight, port, data } = req.body;

    const validErr = validateRecord(type, data, priority, weight, port);
    if (validErr) return reply.code(400).send({ error: validErr });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO records (zone_id, name, type, ttl, priority, weight, port, data)
         VALUES ($1, $2, upper($3), $4, $5, $6, $7, $8)
         ON CONFLICT (zone_id, name, type, data)
         DO UPDATE SET ttl = EXCLUDED.ttl,
                       priority = EXCLUDED.priority,
                       weight = EXCLUDED.weight,
                       port = EXCLUDED.port,
                       updated_at = now()`,
        [zone_id, name, type, ttl, priority ?? null, weight ?? null, port ?? null, data],
      );

      await client.query(`SELECT bump_zone_serial($1)`, [zone_id]);

      await client.query('COMMIT');
      return reply.code(201).send({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.get<{ Params: { zone_id: string } }>('/zones/:zone_id/records', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, name, type, ttl, priority, weight, port, data, created_at, updated_at
       FROM records WHERE zone_id = $1 ORDER BY type, name`,
      [req.params.zone_id],
    );
    return reply.send(rows);
  });

  app.delete<{ Params: { zone_id: string; record_id: string } }>(
    '/zones/:zone_id/records/:record_id',
    async (req, reply) => {
      const { zone_id, record_id } = req.params;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rowCount } = await client.query(
          `DELETE FROM records WHERE id = $1 AND zone_id = $2`,
          [record_id, zone_id],
        );
        if (!rowCount) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'not_found' });
        }
        await client.query(`SELECT bump_zone_serial($1)`, [zone_id]);
        await client.query('COMMIT');
        return reply.code(204).send();
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );
}
