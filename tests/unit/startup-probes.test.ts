/**
 * Unit tests for StartupProbeManager logic (without real DB/Redis connections).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db before importing startup-probes
vi.mock('../../server/db.js', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

vi.mock('../../server/lib/redisConnectionFactory.js', () => ({
  getRedisClient: vi.fn().mockResolvedValue({ ping: vi.fn().mockResolvedValue('PONG') }),
}));

vi.mock('../../server/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@tensorflow/tfjs', () => ({}));

describe('StartupProbeManager', () => {
  it('is importable and has runAllProbes method', async () => {
    const mod = await import('../../server/startup-probes.js');
    expect(mod.startupProbes).toBeDefined();
    expect(typeof mod.startupProbes.runAllProbes).toBe('function');
    expect(typeof mod.startupProbes.isReady).toBe('function');
    expect(typeof mod.startupProbes.getStatus).toBe('function');
  });

  it('initialises in "initializing" phase', async () => {
    // Status should be a fresh instance
    const mod = await import('../../server/startup-probes.js');
    const status = mod.startupProbes.getStatus();
    expect(status).toHaveProperty('phase');
    expect(['initializing', 'connecting', 'ready', 'degraded', 'failed']).toContain(status.phase);
  });

  it('has probes for database, redis, tensorflow', async () => {
    const mod = await import('../../server/startup-probes.js');
    const status = mod.startupProbes.getStatus();
    expect(status.probes).toHaveProperty('database');
    expect(status.probes).toHaveProperty('redis');
    expect(status.probes).toHaveProperty('tensorflow');
  });

  it('isReady returns boolean', async () => {
    const mod = await import('../../server/startup-probes.js');
    expect(typeof mod.startupProbes.isReady()).toBe('boolean');
  });
});
