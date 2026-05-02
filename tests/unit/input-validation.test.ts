/**
 * Unit tests for input validation patterns.
 *
 * Verifies Zod schema usage and common input sanitization patterns
 * used across API routes.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Common Zod schema patterns', () => {
  describe('ID validation', () => {
    const idSchema = z.string().min(1).max(100);

    it('accepts valid IDs', () => {
      expect(idSchema.safeParse('user-123').success).toBe(true);
      expect(idSchema.safeParse('abc').success).toBe(true);
    });

    it('rejects empty strings', () => {
      expect(idSchema.safeParse('').success).toBe(false);
    });

    it('rejects overly long IDs (> 100 chars)', () => {
      expect(idSchema.safeParse('a'.repeat(101)).success).toBe(false);
    });
  });

  describe('Pagination schema', () => {
    const paginationSchema = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
    });

    it('applies defaults for missing values', () => {
      const result = paginationSchema.parse({});
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('accepts valid limit and offset', () => {
      const result = paginationSchema.parse({ limit: 50, offset: 100 });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(100);
    });

    it('rejects limit above 100', () => {
      expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
    });

    it('rejects offset above 100_000', () => {
      expect(paginationSchema.safeParse({ offset: 100_001 }).success).toBe(false);
    });

    it('rejects negative offset', () => {
      expect(paginationSchema.safeParse({ offset: -1 }).success).toBe(false);
    });

    it('rejects negative limit', () => {
      expect(paginationSchema.safeParse({ limit: -1 }).success).toBe(false);
    });
  });

  describe('Email validation', () => {
    const emailSchema = z.string().email();

    it('accepts valid emails', () => {
      expect(emailSchema.safeParse('user@example.com').success).toBe(true);
      expect(emailSchema.safeParse('artist+label@music.io').success).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(emailSchema.safeParse('not-an-email').success).toBe(false);
      expect(emailSchema.safeParse('@missing-local.com').success).toBe(false);
      expect(emailSchema.safeParse('missing@.com').success).toBe(false);
    });
  });

  describe('URL validation', () => {
    const urlSchema = z.string().url();
    // Safe URL: must be http(s) and not a javascript: URI
    const safeUrlSchema = z.string().url().refine(
      u => /^https?:\/\//i.test(u),
      { message: 'Only http/https URLs are allowed' }
    );

    it('accepts valid http/https URLs', () => {
      expect(urlSchema.safeParse('https://example.com').success).toBe(true);
      expect(urlSchema.safeParse('http://localhost:3000').success).toBe(true);
    });

    it('rejects plain strings that are not URLs', () => {
      expect(urlSchema.safeParse('not a url').success).toBe(false);
    });

    it('safeUrlSchema rejects javascript: URIs', () => {
      expect(safeUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    });

    it('safeUrlSchema accepts https URLs', () => {
      expect(safeUrlSchema.safeParse('https://example.com').success).toBe(true);
    });
  });
});

describe('Zod error format', () => {
  it('provides field-level error messages', () => {
    const schema = z.object({ name: z.string().min(1), age: z.number().positive() });
    const result = schema.safeParse({ name: '', age: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod v4 uses .issues; v3 used .errors (aliased in v4)
      const issues = result.error.issues ?? result.error.errors;
      expect(issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('instanceof check identifies ZodError', () => {
    const schema = z.string();
    const result = schema.safeParse(42);
    if (!result.success) {
      expect(result.error instanceof z.ZodError).toBe(true);
      expect(result.error.name).toBe('ZodError');
    }
  });
});
