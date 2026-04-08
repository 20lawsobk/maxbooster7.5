import { Router } from 'express';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../logger.js';
import {
  dnsRecordCache,
  dnsTemplates,
  dnsProviderCredentials,
  storefronts,
} from '@shared/schema';
import {
  getProvider,
  getSupportedProviders,
  validateDnsRecord,
  SUPPORTED_RECORD_TYPES,
  TTL_PRESETS,
  type DnsRecord,
} from '../services/dnsProviderService';

const router = Router();

const recordSchema = z.object({
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV']),
  name: z.string().min(1).max(253),
  value: z.string().min(1),
  ttl: z.number().int().min(1).max(604800).default(3600),
  priority: z.number().int().min(0).max(65535).optional(),
  port: z.number().int().min(0).max(65535).optional(),
  weight: z.number().int().min(0).max(65535).optional(),
  protocol: z.string().optional(),
  service: z.string().optional(),
});

const credentialsSchema = z.object({
  provider: z.enum(['godaddy', 'cloudflare']),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  domain: z.string().min(1),
});

async function getStorefrontForUser(storefrontId: string, userId: string) {
  const [sf] = await db
    .select()
    .from(storefronts)
    .where(and(eq(storefronts.id, storefrontId), eq(storefronts.userId, userId)))
    .limit(1);
  return sf;
}

async function getCredentials(userId: string, domain: string) {
  const [cred] = await db
    .select()
    .from(dnsProviderCredentials)
    .where(and(eq(dnsProviderCredentials.userId, userId), eq(dnsProviderCredentials.domain, domain)))
    .limit(1);
  return cred;
}

function extractRootDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length >= 2) return parts.slice(-2).join('.');
  return domain;
}

function domainBelongsToStorefront(domain: string, storefront: { customDomain: string | null }): boolean {
  if (!storefront.customDomain) return false;
  const reqRoot = extractRootDomain(domain);
  const sfRoot = extractRootDomain(storefront.customDomain);
  return reqRoot === sfRoot;
}

router.get('/providers', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    providers: getSupportedProviders(),
    recordTypes: SUPPORTED_RECORD_TYPES,
    ttlPresets: TTL_PRESETS,
  });
});

router.post('/:storefrontId/credentials', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { storefrontId } = req.params;

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });

    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });

    const { provider: providerName, apiKey, apiSecret, domain } = parsed.data;
    const provider = getProvider(providerName);

    const valid = await provider.verifyCredentials(domain, { apiKey, apiSecret });
    if (!valid) return res.status(400).json({ error: 'Invalid credentials. Check your API key/secret and domain.' });

    const existing = await getCredentials(userId, domain);
    if (existing) {
      await db
        .update(dnsProviderCredentials)
        .set({
          provider: providerName,
          credentials: { apiKey, apiSecret },
          isVerified: true,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dnsProviderCredentials.id, existing.id));
    } else {
      await db.insert(dnsProviderCredentials).values({
        userId,
        provider: providerName,
        domain,
        credentials: { apiKey, apiSecret },
        isVerified: true,
        lastUsedAt: new Date(),
      });
    }

    res.json({ success: true, provider: providerName, domain, verified: true });
  } catch (error: unknown) {
    logger.warn('Error saving DNS credentials', { error });
    res.status(500).json({ error: 'Failed to save credentials' });
  }
});

router.get('/:storefrontId/credentials', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { storefrontId } = req.params;

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });

    const creds = await db
      .select({
        id: dnsProviderCredentials.id,
        provider: dnsProviderCredentials.provider,
        domain: dnsProviderCredentials.domain,
        isVerified: dnsProviderCredentials.isVerified,
        lastUsedAt: dnsProviderCredentials.lastUsedAt,
        createdAt: dnsProviderCredentials.createdAt,
      })
      .from(dnsProviderCredentials)
      .where(eq(dnsProviderCredentials.userId, userId));

    res.json({ credentials: creds });
  } catch (error: unknown) {
    logger.warn('Error fetching DNS credentials', { error });
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

router.delete('/:storefrontId/credentials/:credentialId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { storefrontId, credentialId } = req.params;

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });

    const [cred] = await db
      .select()
      .from(dnsProviderCredentials)
      .where(and(eq(dnsProviderCredentials.id, credentialId), eq(dnsProviderCredentials.userId, userId)))
      .limit(1);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });

    await db.delete(dnsProviderCredentials).where(eq(dnsProviderCredentials.id, credentialId));
    res.json({ success: true });
  } catch (error: unknown) {
    logger.warn('Error deleting DNS credential', { error });
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

router.get('/:storefrontId/records', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const domain = req.query.domain as string;
    const refresh = req.query.refresh === 'true';

    if (!domain) return res.status(400).json({ error: 'Domain query parameter required' });

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });
    if (!domainBelongsToStorefront(domain, storefront)) return res.status(403).json({ error: 'Domain does not belong to this storefront' });

    if (refresh) {
      const cred = await getCredentials(userId, domain);
      if (!cred) return res.status(400).json({ error: 'No credentials saved for this domain. Connect your DNS provider first.' });

      const provider = getProvider(cred.provider);
      const credentials = cred.credentials as { apiKey: string; apiSecret: string };
      const liveRecords = await provider.listRecords(domain, credentials);

      await db.delete(dnsRecordCache).where(
        and(eq(dnsRecordCache.storefrontId, storefrontId), eq(dnsRecordCache.domain, domain))
      );

      if (liveRecords.length > 0) {
        await db.insert(dnsRecordCache).values(
          liveRecords.map((r) => ({
            storefrontId,
            domain,
            provider: cred.provider,
            recordType: r.type,
            name: r.name,
            value: r.value,
            ttl: r.ttl,
            priority: r.priority ?? null,
            isLocal: false,
            lastSyncedAt: new Date(),
          }))
        );
      }

      await db.update(dnsProviderCredentials)
        .set({ lastUsedAt: new Date() })
        .where(eq(dnsProviderCredentials.id, cred.id));

      res.json({ records: liveRecords, source: 'live', syncedAt: new Date().toISOString() });
    } else {
      const cached = await db
        .select()
        .from(dnsRecordCache)
        .where(and(eq(dnsRecordCache.storefrontId, storefrontId), eq(dnsRecordCache.domain, domain)))
        .limit(50);

      const records: DnsRecord[] = cached.map((r) => ({
        type: r.recordType,
        name: r.name,
        value: r.value,
        ttl: r.ttl ?? 3600,
        priority: r.priority ?? undefined,
      }));

      const lastSync = cached.length > 0 ? cached[0].lastSyncedAt : null;
      res.json({ records, source: 'cache', syncedAt: lastSync?.toISOString() ?? null });
    }
  } catch (error: unknown) {
    logger.warn('Error fetching DNS records', { error });
    res.status(500).json({ error: 'Failed to fetch DNS records' });
  }
});

router.post('/:storefrontId/records', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const { domain } = req.body;

    if (!domain) return res.status(400).json({ error: 'Domain is required' });

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });
    if (!domainBelongsToStorefront(domain, storefront)) return res.status(403).json({ error: 'Domain does not belong to this storefront' });

    const parsed = recordSchema.safeParse(req.body.record);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid record', details: parsed.error.issues });

    const record = parsed.data as DnsRecord;
    const validationError = validateDnsRecord(record);
    if (validationError) return res.status(400).json({ error: validationError });

    const cred = await getCredentials(userId, domain);
    if (!cred) return res.status(400).json({ error: 'No credentials saved for this domain' });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as { apiKey: string; apiSecret: string };
    await provider.addRecord(domain, record, credentials);

    await db.insert(dnsRecordCache).values({
      storefrontId,
      domain,
      provider: cred.provider,
      recordType: record.type,
      name: record.name,
      value: record.value,
      ttl: record.ttl,
      priority: record.priority ?? null,
      isLocal: false,
      lastSyncedAt: new Date(),
    });

    res.json({ success: true, record });
  } catch (error: unknown) {
    logger.warn('Error adding DNS record', { error });
    res.status(500).json({ error: 'Failed to add DNS record' });
  }
});

router.put('/:storefrontId/records', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const { domain, record: recordData, originalName, originalType } = req.body;

    if (!domain || !originalName || !originalType) {
      return res.status(400).json({ error: 'Domain, originalName, and originalType are required' });
    }

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });
    if (!domainBelongsToStorefront(domain, storefront)) return res.status(403).json({ error: 'Domain does not belong to this storefront' });

    const parsed = recordSchema.safeParse(recordData);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid record', details: parsed.error.issues });

    const record = parsed.data as DnsRecord;
    const validationError = validateDnsRecord(record);
    if (validationError) return res.status(400).json({ error: validationError });

    const cred = await getCredentials(userId, domain);
    if (!cred) return res.status(400).json({ error: 'No credentials saved for this domain' });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as { apiKey: string; apiSecret: string };
    await provider.updateRecord(domain, record, originalName, originalType, credentials);

    await db.delete(dnsRecordCache).where(
      and(
        eq(dnsRecordCache.storefrontId, storefrontId),
        eq(dnsRecordCache.domain, domain),
        eq(dnsRecordCache.name, originalName),
        eq(dnsRecordCache.recordType, originalType)
      )
    );
    await db.insert(dnsRecordCache).values({
      storefrontId,
      domain,
      provider: cred.provider,
      recordType: record.type,
      name: record.name,
      value: record.value,
      ttl: record.ttl,
      priority: record.priority ?? null,
      isLocal: false,
      lastSyncedAt: new Date(),
    });

    res.json({ success: true, record });
  } catch (error: unknown) {
    logger.warn('Error updating DNS record', { error });
    res.status(500).json({ error: 'Failed to update DNS record' });
  }
});

router.delete('/:storefrontId/records', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const { domain, recordType, recordName } = req.body;

    if (!domain || !recordType || !recordName) {
      return res.status(400).json({ error: 'Domain, recordType, and recordName are required' });
    }

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });
    if (!domainBelongsToStorefront(domain, storefront)) return res.status(403).json({ error: 'Domain does not belong to this storefront' });

    const cred = await getCredentials(userId, domain);
    if (!cred) return res.status(400).json({ error: 'No credentials saved for this domain' });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as { apiKey: string; apiSecret: string };
    await provider.deleteRecord(domain, recordType, recordName, credentials);

    await db.delete(dnsRecordCache).where(
      and(
        eq(dnsRecordCache.storefrontId, storefrontId),
        eq(dnsRecordCache.domain, domain),
        eq(dnsRecordCache.name, recordName),
        eq(dnsRecordCache.recordType, recordType)
      )
    );

    res.json({ success: true });
  } catch (error: unknown) {
    logger.warn('Error deleting DNS record', { error });
    res.status(500).json({ error: 'Failed to delete DNS record' });
  }
});

router.post('/:storefrontId/records/batch', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { storefrontId } = req.params;
    const { domain, records: recordsData } = req.body;

    if (!domain || !Array.isArray(recordsData) || recordsData.length === 0) {
      return res.status(400).json({ error: 'Domain and records array required' });
    }
    if (recordsData.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 records per batch' });
    }

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });
    if (!domainBelongsToStorefront(domain, storefront)) return res.status(403).json({ error: 'Domain does not belong to this storefront' });

    const records: DnsRecord[] = [];
    for (const rd of recordsData) {
      const parsed = recordSchema.safeParse(rd);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid record in batch', details: parsed.error.issues });
      const record = parsed.data as DnsRecord;
      const err = validateDnsRecord(record);
      if (err) return res.status(400).json({ error: `Validation error in batch: ${err}` });
      records.push(record);
    }

    const cred = await getCredentials(userId, domain);
    if (!cred) return res.status(400).json({ error: 'No credentials saved for this domain' });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as { apiKey: string; apiSecret: string };
    await provider.batchUpsertRecords(domain, records, credentials);

    await db.delete(dnsRecordCache).where(
      and(eq(dnsRecordCache.storefrontId, storefrontId), eq(dnsRecordCache.domain, domain))
    );
    await db.insert(dnsRecordCache).values(
      records.map((r) => ({
        storefrontId,
        domain,
        provider: cred.provider,
        recordType: r.type,
        name: r.name,
        value: r.value,
        ttl: r.ttl,
        priority: r.priority ?? null,
        isLocal: false,
        lastSyncedAt: new Date(),
      }))
    );

    res.json({ success: true, count: records.length });
  } catch (error: unknown) {
    logger.warn('Error in batch DNS operation', { error });
    res.status(500).json({ error: 'Batch operation failed' });
  }
});

router.get('/:storefrontId/templates', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;

    const templates = await db
      .select()
      .from(dnsTemplates)
      .where(eq(dnsTemplates.userId, userId))
      .limit(50);

    res.json({ templates });
  } catch (error: unknown) {
    logger.warn('Error fetching DNS templates', { error });
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/:storefrontId/templates', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { name, description, records } = req.body;

    if (!name || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Name and records array required' });
    }

    const [template] = await db.insert(dnsTemplates).values({
      userId,
      name,
      description: description || null,
      records,
    }).returning();

    res.json({ success: true, template });
  } catch (error: unknown) {
    logger.warn('Error creating DNS template', { error });
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.delete('/:storefrontId/templates/:templateId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { templateId } = req.params;

    const [tmpl] = await db
      .select()
      .from(dnsTemplates)
      .where(and(eq(dnsTemplates.id, templateId), eq(dnsTemplates.userId, userId)))
      .limit(1);
    if (!tmpl) return res.status(404).json({ error: 'Template not found' });

    await db.delete(dnsTemplates).where(eq(dnsTemplates.id, templateId));
    res.json({ success: true });
  } catch (error: unknown) {
    logger.warn('Error deleting DNS template', { error });
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

router.post('/:storefrontId/templates/:templateId/apply', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.user!.id;
    const { storefrontId, templateId } = req.params;
    const { domain } = req.body;

    if (!domain) return res.status(400).json({ error: 'Domain is required' });

    const storefront = await getStorefrontForUser(storefrontId, userId);
    if (!storefront) return res.status(404).json({ error: 'Storefront not found' });

    const [tmpl] = await db
      .select()
      .from(dnsTemplates)
      .where(and(eq(dnsTemplates.id, templateId), eq(dnsTemplates.userId, userId)))
      .limit(1);
    if (!tmpl) return res.status(404).json({ error: 'Template not found' });

    const templateRecords = tmpl.records as DnsRecord[];
    const cred = await getCredentials(userId, domain);
    if (!cred) return res.status(400).json({ error: 'No credentials saved for this domain' });

    const provider = getProvider(cred.provider);
    const credentials = cred.credentials as { apiKey: string; apiSecret: string };
    await provider.batchUpsertRecords(domain, templateRecords, credentials);

    await db.delete(dnsRecordCache).where(
      and(eq(dnsRecordCache.storefrontId, storefrontId), eq(dnsRecordCache.domain, domain))
    );
    await db.insert(dnsRecordCache).values(
      templateRecords.map((r) => ({
        storefrontId,
        domain,
        provider: cred.provider,
        recordType: r.type,
        name: r.name,
        value: r.value,
        ttl: r.ttl,
        priority: r.priority ?? null,
        isLocal: false,
        lastSyncedAt: new Date(),
      }))
    );

    res.json({ success: true, recordsApplied: templateRecords.length });
  } catch (error: unknown) {
    logger.warn('Error applying DNS template', { error });
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

export default router;
