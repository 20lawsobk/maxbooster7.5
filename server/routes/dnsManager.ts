import { Router } from 'express';
import { pool } from '../db.js';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = Router();

const BASE_DOMAIN = process.env.BASE_DOMAIN || 'maxbooster.replit.app';
const DNS_SERVER_IP = process.env.DNS_SERVER_IP || '34.68.76.67';
const NS1 = process.env.NS1 || 'maxbooster.replit.app';
const NS2 = process.env.NS2 || 'maxbooster.replit.app';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const;

const recordSchema = z.object({
  type: z.enum(RECORD_TYPES),
  name: z.string().min(1).max(253),
  value: z.string().min(1),
  ttl: z.number().int().min(60).max(604800).default(3600),
  priority: z.number().int().min(0).max(65535).optional(),
  weight: z.number().int().min(0).max(65535).optional(),
  port: z.number().int().min(0).max(65535).optional(),
  tag: z.string().optional(),
});

function validateRecord(r: z.infer<typeof recordSchema>): string | null {
  switch (r.type) {
    case 'A': {
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4.test(r.value)) return 'A record must be a valid IPv4 address';
      if (r.value.split('.').map(Number).some(p => p > 255)) return 'Invalid IPv4 address';
      break;
    }
    case 'AAAA': {
      const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::$/;
      if (!ipv6.test(r.value)) return 'AAAA record must be a valid IPv6 address';
      break;
    }
    case 'CNAME': {
      const hostname = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.?$/;
      if (!hostname.test(r.value)) return 'CNAME must be a valid hostname';
      break;
    }
    case 'MX':
      if (r.priority === undefined) return 'MX records require a priority';
      break;
    case 'TXT':
      if (r.value.length > 4096) return 'TXT record too long (max 4096 chars)';
      break;
    case 'SRV':
      if (r.priority === undefined) return 'SRV records require priority';
      if (r.weight === undefined) return 'SRV records require weight';
      if (r.port === undefined) return 'SRV records require port';
      break;
    case 'CAA':
      if (!r.tag) return 'CAA records require a tag (issue, issuewild, or iodef)';
      break;
  }
  return null;
}

function normalizeDomain(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')  // strip http:// or https://
    .replace(/\/.*$/, '')           // strip trailing slash and any path
    .replace(/\.$/, '');            // strip trailing FQDN dot
}

function mapZone(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    status: row.status,
    isVerified: row.is_verified,
    verificationToken: row.verification_token,
    nameserver1: row.nameserver1,
    nameserver2: row.nameserver2,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecord(row: any) {
  return {
    id: row.id,
    zoneId: row.zone_id,
    userId: row.user_id,
    domain: row.domain,
    type: row.type,
    name: row.name,
    value: row.value,
    ttl: row.ttl,
    priority: row.priority,
    weight: row.weight,
    port: row.port,
    tag: row.tag,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/info', (req, res) => {
  res.json({
    nameservers: [NS1, NS2],
    serverIp: DNS_SERVER_IP,
    baseDomain: BASE_DOMAIN,
    recordTypes: RECORD_TYPES,
    instructions: [
      `Step 1: Add your domain and copy the verification TXT record`,
      `Step 2: Log into your registrar (wherever you bought your domain)`,
      `Step 3: Change your domain's nameservers to:`,
      `   Primary:   ${NS1}`,
      `   Secondary: ${NS2}`,
      `Step 4: Wait for propagation (usually 1-48 hours)`,
      `Step 5: Your domain will show "Active" when resolved through Max Booster`,
    ],
  });
});

router.get('/zones', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const result = await pool.query(
      'SELECT * FROM dns_zones WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json({ zones: result.rows.map(mapZone) });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error listing zones: ' + (err?.message ?? String(err)));
    res.status(500).json({ error: 'Failed to list zones' });
  }
});

router.post('/zones', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const schema = z.object({ domain: z.string().min(3), notes: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });

    const domain = normalizeDomain(parsed.data.domain);

    const existing = await pool.query(
      'SELECT id FROM dns_zones WHERE domain = $1 LIMIT 1',
      [domain]
    );
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Domain already registered in the system' });

    const insertZone = await pool.query(
      `INSERT INTO dns_zones (user_id, domain, status, notes)
       VALUES ($1, $2, 'pending', $3)
       RETURNING *`,
      [userId, domain, parsed.data.notes ?? null]
    );
    const zone = mapZone(insertZone.rows[0]);

    await pool.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl) VALUES
       ($1, $2, $3, 'NS',  '@', $4, 3600),
       ($1, $2, $3, 'SOA', '@', $5, 3600)`,
      [zone.id, userId, domain, NS1, `${NS1} hostmaster.${BASE_DOMAIN} 1 3600 900 604800 300`]
    );

    res.json({ success: true, zone });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error creating zone: ' + (err?.message ?? String(err)));
    res.status(500).json({ error: 'Failed to create zone' });
  }
});

router.post('/zones/:zoneId/verify', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      'SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    const zone = mapZone(zoneResult.rows[0]);

    let resolved = false;
    try {
      const dns = await import('dns');
      const resolveTxt = dns.promises.resolveTxt;
      const records: string[][] = await resolveTxt(zone.domain).catch(() => []);
      const flat = records.flat();
      resolved = flat.some((r: string) => r.includes(zone.verificationToken ?? ''));
    } catch {
      resolved = false;
    }

    if (resolved) {
      await pool.query(
        'UPDATE dns_zones SET is_verified = true, status = $1, updated_at = NOW() WHERE id = $2',
        ['active', zone.id]
      );
      return res.json({ verified: true, status: 'active' });
    }

    res.json({
      verified: false,
      message: `Add a TXT record at your registrar: maxbooster-verify=${zone.verificationToken}`,
    });
  } catch (err: any) {
    logger.warn('[DNS Manager] Verify error: ' + (err?.message ?? String(err)));
    res.status(500).json({ error: 'Verification check failed' });
  }
});

router.delete('/zones/:zoneId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      'SELECT id FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    const zoneId = zoneResult.rows[0].id;

    await pool.query('DELETE FROM dns_zone_records WHERE zone_id = $1', [zoneId]);
    await pool.query('DELETE FROM dns_zones WHERE id = $1', [zoneId]);

    res.json({ success: true });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error deleting zone: ' + (err?.message ?? String(err)));
    res.status(500).json({ error: 'Failed to delete zone' });
  }
});

router.get('/zones/:zoneId/records', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      'SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    const zone = mapZone(zoneResult.rows[0]);

    const records = await pool.query(
      'SELECT * FROM dns_zone_records WHERE zone_id = $1 ORDER BY type, name',
      [zone.id]
    );

    res.json({ records: records.rows.map(mapRecord), zone });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error fetching records: ' + (err?.message ?? String(err)));
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

router.post('/zones/:zoneId/records', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      'SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    const zone = mapZone(zoneResult.rows[0]);

    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid record', details: parsed.error.issues });

    const validErr = validateRecord(parsed.data);
    if (validErr) return res.status(400).json({ error: validErr });

    const result = await pool.query(
      `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl, priority, weight, port, tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [zone.id, userId, zone.domain, parsed.data.type, parsed.data.name, parsed.data.value,
       parsed.data.ttl, parsed.data.priority ?? null, parsed.data.weight ?? null,
       parsed.data.port ?? null, parsed.data.tag ?? null]
    );

    res.json({ success: true, record: mapRecord(result.rows[0]) });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error adding record: ' + (err?.message ?? String(err)));
    res.status(500).json({ error: 'Failed to add record' });
  }
});

router.put('/zones/:zoneId/records/:recordId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      'SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });

    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid record', details: parsed.error.issues });

    const validErr = validateRecord(parsed.data);
    if (validErr) return res.status(400).json({ error: validErr });

    const result = await pool.query(
      `UPDATE dns_zone_records
       SET type=$1, name=$2, value=$3, ttl=$4, priority=$5, weight=$6, port=$7, tag=$8, updated_at=NOW()
       WHERE id=$9 AND user_id=$10
       RETURNING *`,
      [parsed.data.type, parsed.data.name, parsed.data.value, parsed.data.ttl,
       parsed.data.priority ?? null, parsed.data.weight ?? null,
       parsed.data.port ?? null, parsed.data.tag ?? null,
       req.params.recordId, userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true, record: mapRecord(result.rows[0]) });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error updating record: ' + (err?.message ?? String(err)));
    res.status(500).json({ error: 'Failed to update record' });
  }
});

router.delete('/zones/:zoneId/records/:recordId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      'SELECT id FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });

    await pool.query(
      'DELETE FROM dns_zone_records WHERE id = $1 AND user_id = $2',
      [req.params.recordId, userId]
    );

    res.json({ success: true });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error deleting record: ' + (err?.message ?? String(err)));
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

router.post('/zones/:zoneId/records/batch', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      'SELECT * FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    const zone = mapZone(zoneResult.rows[0]);

    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'Records array required' });
    if (records.length > 100) return res.status(400).json({ error: 'Max 100 records per batch' });

    const validated: z.infer<typeof recordSchema>[] = [];
    for (const r of records) {
      const parsed = recordSchema.safeParse(r);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid record in batch', details: parsed.error.issues });
      const validErr = validateRecord(parsed.data);
      if (validErr) return res.status(400).json({ error: validErr });
      validated.push(parsed.data);
    }

    for (const r of validated) {
      await pool.query(
        `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl, priority, weight, port, tag)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [zone.id, userId, zone.domain, r.type, r.name, r.value, r.ttl,
         r.priority ?? null, r.weight ?? null, r.port ?? null, r.tag ?? null]
      );
    }

    res.json({ success: true, count: validated.length });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error batch adding records: ' + (err?.message ?? String(err)));
    res.status(500).json({ error: 'Failed to batch add records' });
  }
});

// ── Storefront URL linking ─────────────────────────────────────────────────────

/**
 * GET /api/dns-manager/zones/:zoneId/storefront-link
 * Return the storefront currently linked to this zone as its custom URL.
 */
router.get('/zones/:zoneId/storefront-link', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      'SELECT id, domain, is_verified, status FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    const zone = zoneResult.rows[0];

    const linkResult = await pool.query(
      `SELECT sd.storefront_id, sd.status, s.name, s.slug
       FROM storefront_domains sd
       JOIN storefronts s ON s.id = sd.storefront_id
       WHERE sd.domain = $1 AND sd.type = 'custom_domain' AND s.user_id = $2
       LIMIT 1`,
      [zone.domain, userId]
    );

    const link = linkResult.rows[0] ?? null;
    return res.json({
      zone: { id: zone.id, domain: zone.domain, isVerified: zone.is_verified, status: zone.status },
      linked: link
        ? { storefrontId: link.storefront_id, storefrontName: link.name, storefrontSlug: link.slug, status: link.status }
        : null,
    });
  } catch (err: any) {
    logger.warn({ err }, '[DNS Manager] storefront-link GET error');
    return res.status(500).json({ error: 'Failed to fetch storefront link' });
  }
});

/**
 * POST /api/dns-manager/zones/:zoneId/use-as-storefront
 * Body: { storefrontId: string }
 *
 * Sets the zone's domain as the custom URL for the given storefront.
 * Requires the zone to be verified (is_verified = true).
 */
router.post('/zones/:zoneId/use-as-storefront', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const { storefrontId } = req.body;
    if (!storefrontId || typeof storefrontId !== 'string') {
      return res.status(400).json({ error: 'storefrontId is required' });
    }

    // Verify zone belongs to user
    const zoneResult = await pool.query(
      'SELECT id, domain, is_verified, status FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    const zone = zoneResult.rows[0];

    if (!zone.is_verified) {
      return res.status(422).json({ error: 'Domain must be verified before it can be used as a storefront URL. Add the verification TXT record and click Check NS first.' });
    }

    // Verify storefront belongs to user
    const sfResult = await pool.query(
      'SELECT id, name, slug FROM storefronts WHERE id = $1 AND user_id = $2 LIMIT 1',
      [storefrontId, userId]
    );
    if (sfResult.rows.length === 0) return res.status(404).json({ error: 'Storefront not found' });
    const sf = sfResult.rows[0];

    // Clear any existing custom_domain links for this storefront (one at a time)
    await pool.query(
      `DELETE FROM storefront_domains WHERE storefront_id = $1 AND type = 'custom_domain'`,
      [storefrontId]
    );

    // Clear any existing link for this domain (in case it was linked to a different storefront)
    await pool.query(
      `DELETE FROM storefront_domains WHERE domain = $1`,
      [zone.domain]
    );

    // Insert new link
    await pool.query(
      `INSERT INTO storefront_domains (storefront_id, domain, type, status, is_primary, dns_zone_id)
       VALUES ($1, $2, 'custom_domain', 'active', true, $3)`,
      [storefrontId, zone.domain, zone.id]
    );

    // Upsert storefront_hosts so the edge router picks it up (root domain)
    await pool.query(
      `INSERT INTO storefront_hosts (host, storefront_id, cert_status, created_at, updated_at)
       VALUES ($1, $2, 'pending', NOW(), NOW())
       ON CONFLICT (host) DO UPDATE SET storefront_id = EXCLUDED.storefront_id, updated_at = NOW()`,
      [zone.domain, storefrontId]
    );

    // Also add www. variant for root domains (no subdomain prefix)
    const isRootDomain = !zone.domain.startsWith('www.') && zone.domain.split('.').length === 2;
    if (isRootDomain) {
      await pool.query(
        `INSERT INTO storefront_hosts (host, storefront_id, cert_status, created_at, updated_at)
         VALUES ($1, $2, 'pending', NOW(), NOW())
         ON CONFLICT (host) DO UPDATE SET storefront_id = EXCLUDED.storefront_id, updated_at = NOW()`,
        [`www.${zone.domain}`, storefrontId]
      );
    }

    // Update the storefront's customDomain field
    await pool.query(
      `UPDATE storefronts SET custom_domain = $1, is_custom_domain_active = true, updated_at = NOW() WHERE id = $2`,
      [zone.domain, storefrontId]
    );

    logger.info(`[DNS Manager] Zone ${zone.domain} linked as storefront URL for ${storefrontId}`);
    return res.json({
      success: true,
      domain: zone.domain,
      url: `https://${zone.domain}`,
      storefrontId,
      storefrontName: sf.name,
      storefrontSlug: sf.slug,
    });
  } catch (err: any) {
    logger.warn({ err }, '[DNS Manager] use-as-storefront POST error');
    return res.status(500).json({ error: 'Failed to link domain as storefront URL' });
  }
});

/**
 * DELETE /api/dns-manager/zones/:zoneId/use-as-storefront
 * Remove the link between this zone's domain and any storefront.
 */
router.delete('/zones/:zoneId/use-as-storefront', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const zoneResult = await pool.query(
      'SELECT id, domain FROM dns_zones WHERE id = $1 AND user_id = $2 LIMIT 1',
      [req.params.zoneId, userId]
    );
    if (zoneResult.rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
    const zone = zoneResult.rows[0];

    // Find the linked storefront so we can clear its customDomain field
    const linkResult = await pool.query(
      `SELECT storefront_id FROM storefront_domains WHERE domain = $1 AND type = 'custom_domain' LIMIT 1`,
      [zone.domain]
    );
    const linkedStorefrontId = linkResult.rows[0]?.storefront_id ?? null;

    // Remove storefront_domains entry
    await pool.query(`DELETE FROM storefront_domains WHERE domain = $1 AND type = 'custom_domain'`, [zone.domain]);

    // Remove storefront_hosts entries (root domain and www variant)
    await pool.query(`DELETE FROM storefront_hosts WHERE host = $1 OR host = $2`, [zone.domain, `www.${zone.domain}`]);

    // Clear customDomain on the storefront if it matches
    if (linkedStorefrontId) {
      await pool.query(
        `UPDATE storefronts SET custom_domain = NULL, is_custom_domain_active = false, updated_at = NOW()
         WHERE id = $1 AND custom_domain = $2`,
        [linkedStorefrontId, zone.domain]
      );
    }

    logger.info(`[DNS Manager] Storefront URL link removed for zone ${zone.domain}`);
    return res.json({ success: true });
  } catch (err: any) {
    logger.warn({ err }, '[DNS Manager] use-as-storefront DELETE error');
    return res.status(500).json({ error: 'Failed to unlink storefront URL' });
  }
});

export default router;
