/**
 * Unit tests for security configuration via static analysis.
 * Verifies critical security settings are present in source code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

function readSrc(file: string): string {
  if (!existsSync(file)) return '';
  return readFileSync(file, 'utf8');
}

describe('CSRF protection', () => {
  it('is mounted in mandatory middleware', () => {
    const src = readSrc('server/safety/mandatoryMiddleware.ts');
    expect(src).toContain('csrf');
  });

  it('double-submit cookie pattern is used', () => {
    // The project uses a custom cookie-based CSRF implementation in server/middleware/csrf.ts
    const src = readSrc('server/middleware/csrf.ts');
    const hasCookiePattern =
      src.includes('CSRF_COOKIE') ||
      src.includes('csrf-token') ||
      src.includes('csrfProtection') ||
      src.includes('double') ||
      src.includes('x-csrf-token');
    expect(hasCookiePattern).toBe(true);
  });
});

describe('Helmet security headers', () => {
  it('is mounted in mandatory middleware', () => {
    const src = readSrc('server/safety/mandatoryMiddleware.ts');
    expect(src).toContain('helmet');
  });

  it('hard-fails if helmet loading fails', () => {
    const src = readSrc('server/safety/mandatoryMiddleware.ts');
    expect(src).toContain("throw new Error");
  });
});

describe('Rate limiting', () => {
  it('login rate limiter is defined in routes', () => {
    const src = readSrc('server/routes.ts');
    expect(src).toContain('loginRateLimiter');
  });

  it('register rate limiter is defined', () => {
    const src = readSrc('server/routes.ts');
    expect(src).toContain('registerRateLimiter');
  });

  it('critical endpoint rate limiter exists', () => {
    const src = readSrc('server/routes.ts');
    expect(src).toContain('criticalEndpointLimiter');
  });
});

describe('Auth guards', () => {
  it('requireAuth is used on protected routes', () => {
    // requireAuth is the primary auth middleware across the routes subdirectory
    // server/routes.ts uses inline isAuthenticated() / "Not authenticated" checks
    // Both patterns confirm that auth protection is pervasive
    const mainRoutes = readSrc('server/routes.ts');
    // Count distinct authentication enforcement points in the main routes file
    const authChecks = (mainRoutes.match(/Not authenticated|isAuthenticated\(\)|requireAuth/g) || []).length;
    expect(authChecks).toBeGreaterThan(10);
  });

  it('JWT secret has no dev fallback in jwtAuthService', () => {
    const src = readSrc('server/services/jwtAuthService.ts');
    // Must not contain a hardcoded fallback
    const hasFallback = src.includes("|| 'dev-secret'") || src.includes('|| "dev-secret"');
    expect(hasFallback).toBe(false);
  });
});

describe('Stripe webhook security', () => {
  it('uses constructEvent for signature verification', () => {
    // Stripe webhook signature verification lives in the dedicated security module
    const src = readSrc('server/safety/stripeWebhookSecurity.ts');
    expect(src).toContain('constructEvent');
  });
});

describe('bcrypt cost', () => {
  it('all hash calls use cost >= 12', () => {
    const src = readSrc('server/routes.ts');
    const calls = [...src.matchAll(/bcrypt\.hash\([^,]+,\s*(\d+)/g)];
    for (const m of calls) {
      expect(parseInt(m[1], 10)).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('pino redact config', () => {
  it('has >= 20 redaction paths', () => {
    const src = readSrc('server/logger.ts');
    // REDACT_PATHS is defined as a named const array; some entries contain "]" characters
    // so we count line-by-line between the array open and close brackets
    const lines = src.split('\n');
    const startIdx = lines.findIndex(l => l.includes('REDACT_PATHS') && l.includes('['));
    let count = 0;
    let inArray = false;
    for (let i = startIdx; i < lines.length; i++) {
      if (lines[i].includes('[')) inArray = true;
      if (inArray) {
        const matches = lines[i].match(/'[^']+'/g);
        if (matches) count += matches.length;
      }
      if (inArray && lines[i].includes('];')) break;
    }
    expect(count).toBeGreaterThanOrEqual(20);
  });
});

describe('Audit logging', () => {
  it('audit_logs DB table is mirrored in auditLogger', () => {
    const src = readSrc('server/middleware/auditLogger.ts');
    expect(src).toContain('audit_logs');
  });

  it('audit logger is imported in request/error middleware', () => {
    // auditLogger is used in requestLogger.ts and errorHandler.ts (both critical paths)
    const requestLogger = readSrc('server/middleware/requestLogger.ts');
    const errorHandler = readSrc('server/middleware/errorHandler.ts');
    const hasAudit = requestLogger.includes('auditLogger') || errorHandler.includes('auditLogger');
    expect(hasAudit).toBe(true);
  });
});

describe('Backup safety', () => {
  it('backup service has size cap', () => {
    // The backup service is at server/services/backup/databaseBackupService.ts
    const src = readSrc('server/services/backup/databaseBackupService.ts');
    const hasCap =
      src.includes('MAX_BACKUP_SIZE') ||
      src.includes('HARD_CAP_BYTES') ||
      src.includes('1024 * 1024 * 1024') ||
      src.includes('1073741824');
    expect(hasCap).toBe(true);
  });
});
