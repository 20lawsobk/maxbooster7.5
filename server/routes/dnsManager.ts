import { Router } from 'express';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../logger.js';
import { dnsZones, dnsZoneRecords } from '@shared/schema';

const router = Router();

const BASE_DOMAIN = process.env.BASE_DOMAIN || 'maxboostermusic.com';
const DNS_SERVER_IP = process.env.DNS_SERVER_IP || '34.68.76.67';
const NS1 = `ns1.${BASE_DOMAIN}`;
const NS2 = `ns2.${BASE_DOMAIN}`;

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
  return d.toLowerCase().trim().replace(/\.$/, '');
}

async function getZoneForUser(zoneId: string, userId: string) {
  const [zone] = await db
    .select()
    .from(dnsZones)
    .where(and(eq(dnsZones.id, zoneId), eq(dnsZones.userId, userId)))
    .limit(1);
  return zone;
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

    const zones = await db
      .select()
      .from(dnsZones)
      .where(eq(dnsZones.userId, userId));

    res.json({ zones });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error listing zones', { err });
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

    const existing = await db.select().from(dnsZones).where(eq(dnsZones.domain, domain)).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: 'Domain already registered in the system' });

    const [zone] = await db.insert(dnsZones).values({
      userId,
      domain,
      status: 'pending',
      notes: parsed.data.notes ?? null,
    }).returning();

    await db.insert(dnsZoneRecords).values([
      { zoneId: zone.id, userId, domain, type: 'NS', name: '@', value: NS1, ttl: 3600 },
      { zoneId: zone.id, userId, domain, type: 'NS', name: '@', value: NS2, ttl: 3600 },
      { zoneId: zone.id, userId, domain, type: 'SOA', name: '@', value: `${NS1} hostmaster.${BASE_DOMAIN} 1 3600 900 604800 300`, ttl: 3600 },
    ]);

    res.json({ success: true, zone });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error creating zone', { err });
    res.status(500).json({ error: 'Failed to create zone' });
  }
});

router.post('/zones/:zoneId/verify', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const zone = await getZoneForUser(req.params.zoneId, userId);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    let resolved = false;
    try {
      const { resolve } = await import('dns');
      const { promisify } = await import('util');
      const resolveTxt = promisify(resolve.bind(null));
      const records: any = await resolveTxt(zone.domain, 'TXT').catch(() => []);
      const flat: string[] = records.flat ? records.flat() : records;
      resolved = flat.some((r: string) => r.includes(zone.verificationToken ?? ''));
    } catch {
      resolved = false;
    }

    if (resolved) {
      await db.update(dnsZones).set({ isVerified: true, status: 'active', updatedAt: new Date() }).where(eq(dnsZones.id, zone.id));
      return res.json({ verified: true, status: 'active' });
    }

    res.json({
      verified: false,
      message: `Add a TXT record at your registrar: maxbooster-verify=${zone.verificationToken}`,
    });
  } catch (err: any) {
    logger.warn('[DNS Manager] Verify error', { err });
    res.status(500).json({ error: 'Verification check failed' });
  }
});

router.delete('/zones/:zoneId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const zone = await getZoneForUser(req.params.zoneId, userId);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    await db.delete(dnsZoneRecords).where(eq(dnsZoneRecords.zoneId, zone.id));
    await db.delete(dnsZones).where(eq(dnsZones.id, zone.id));

    res.json({ success: true });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error deleting zone', { err });
    res.status(500).json({ error: 'Failed to delete zone' });
  }
});

router.get('/zones/:zoneId/records', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const zone = await getZoneForUser(req.params.zoneId, userId);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    const records = await db
      .select()
      .from(dnsZoneRecords)
      .where(eq(dnsZoneRecords.zoneId, zone.id));

    res.json({ records, zone });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error fetching records', { err });
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

router.post('/zones/:zoneId/records', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const zone = await getZoneForUser(req.params.zoneId, userId);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid record', details: parsed.error.issues });

    const err = validateRecord(parsed.data);
    if (err) return res.status(400).json({ error: err });

    const [record] = await db.insert(dnsZoneRecords).values({
      zoneId: zone.id,
      userId,
      domain: zone.domain,
      type: parsed.data.type,
      name: parsed.data.name,
      value: parsed.data.value,
      ttl: parsed.data.ttl,
      priority: parsed.data.priority ?? null,
      weight: parsed.data.weight ?? null,
      port: parsed.data.port ?? null,
      tag: parsed.data.tag ?? null,
    }).returning();

    res.json({ success: true, record });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error adding record', { err });
    res.status(500).json({ error: 'Failed to add record' });
  }
});

router.put('/zones/:zoneId/records/:recordId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const zone = await getZoneForUser(req.params.zoneId, userId);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid record', details: parsed.error.issues });

    const err = validateRecord(parsed.data);
    if (err) return res.status(400).json({ error: err });

    const [updated] = await db
      .update(dnsZoneRecords)
      .set({
        type: parsed.data.type,
        name: parsed.data.name,
        value: parsed.data.value,
        ttl: parsed.data.ttl,
        priority: parsed.data.priority ?? null,
        weight: parsed.data.weight ?? null,
        port: parsed.data.port ?? null,
        tag: parsed.data.tag ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(dnsZoneRecords.id, req.params.recordId), eq(dnsZoneRecords.userId, userId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true, record: updated });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error updating record', { err });
    res.status(500).json({ error: 'Failed to update record' });
  }
});

router.delete('/zones/:zoneId/records/:recordId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const zone = await getZoneForUser(req.params.zoneId, userId);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    await db
      .delete(dnsZoneRecords)
      .where(and(eq(dnsZoneRecords.id, req.params.recordId), eq(dnsZoneRecords.userId, userId)));

    res.json({ success: true });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error deleting record', { err });
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

router.post('/zones/:zoneId/records/batch', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const zone = await getZoneForUser(req.params.zoneId, userId);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });

    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'Records array required' });
    if (records.length > 100) return res.status(400).json({ error: 'Max 100 records per batch' });

    const validated = [];
    for (const r of records) {
      const parsed = recordSchema.safeParse(r);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid record in batch', details: parsed.error.issues });
      const err = validateRecord(parsed.data);
      if (err) return res.status(400).json({ error: err });
      validated.push(parsed.data);
    }

    await db.insert(dnsZoneRecords).values(
      validated.map(r => ({
        zoneId: zone.id,
        userId,
        domain: zone.domain,
        type: r.type,
        name: r.name,
        value: r.value,
        ttl: r.ttl,
        priority: r.priority ?? null,
        weight: r.weight ?? null,
        port: r.port ?? null,
        tag: r.tag ?? null,
      }))
    );

    res.json({ success: true, count: validated.length });
  } catch (err: any) {
    logger.warn('[DNS Manager] Error batch adding records', { err });
    res.status(500).json({ error: 'Failed to batch add records' });
  }
});

export default router;
