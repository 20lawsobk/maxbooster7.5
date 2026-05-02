/**
 * Unit tests for server/middleware/requestValidation.ts
 *
 * Covers:
 *  - isValidUUID() — accepts well-formed UUIDs, rejects garbage
 *  - isSafeId()    — accepts slugs/numeric IDs, rejects path-traversal chars
 *  - requireUUIDParam() middleware — returns 400 on bad param, calls next() on good param
 *  - requireSafeParam() middleware — same contract for safe IDs
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { isValidUUID, isSafeId, requireUUIDParam, requireSafeParam } from '../../server/middleware/requestValidation.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(params: Record<string, string>): Request {
  return { params } as unknown as Request;
}

function makeRes() {
  const json = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json: vi.fn() } as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

// ── isValidUUID ───────────────────────────────────────────────────────────────

describe('isValidUUID()', () => {
  it('accepts a well-formed UUID v4', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('accepts uppercase UUIDs', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidUUID('')).toBe(false);
  });

  it('rejects plain numeric id', () => {
    expect(isValidUUID('12345')).toBe(false);
  });

  it('rejects SQL injection attempt', () => {
    expect(isValidUUID("'; DROP TABLE users; --")).toBe(false);
  });

  it('rejects path-traversal string', () => {
    expect(isValidUUID('../../../etc/passwd')).toBe(false);
  });

  it('rejects UUID with extra chars', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-4466554400001')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidUUID(undefined)).toBe(false);
    expect(isValidUUID(null)).toBe(false);
    expect(isValidUUID(42)).toBe(false);
    expect(isValidUUID({})).toBe(false);
  });
});

// ── isSafeId ─────────────────────────────────────────────────────────────────

describe('isSafeId()', () => {
  it('accepts alphanumeric slug', () => {
    expect(isSafeId('my-slug-123')).toBe(true);
  });

  it('accepts numeric string', () => {
    expect(isSafeId('42')).toBe(true);
  });

  it('accepts underscore-separated id', () => {
    expect(isSafeId('track_id_abc')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isSafeId('')).toBe(false);
  });

  it('rejects string exceeding 128 chars', () => {
    expect(isSafeId('a'.repeat(129))).toBe(false);
  });

  it('accepts string of exactly 128 chars', () => {
    expect(isSafeId('a'.repeat(128))).toBe(true);
  });

  it('rejects path-traversal characters', () => {
    expect(isSafeId('../etc/passwd')).toBe(false);
    expect(isSafeId('foo/bar')).toBe(false);
    expect(isSafeId('foo\\bar')).toBe(false);
  });

  it('rejects SQL injection chars', () => {
    expect(isSafeId("foo'bar")).toBe(false);
    expect(isSafeId('foo"bar')).toBe(false);
    expect(isSafeId('foo;bar')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(isSafeId('foo bar')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isSafeId(undefined)).toBe(false);
    expect(isSafeId(null)).toBe(false);
  });
});

// ── requireUUIDParam middleware ───────────────────────────────────────────────

describe('requireUUIDParam() middleware', () => {
  it('calls next() when param is a valid UUID', () => {
    const middleware = requireUUIDParam('id');
    const req = makeReq({ id: '550e8400-e29b-41d4-a716-446655440000' });
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 when param is missing', () => {
    const middleware = requireUUIDParam('id');
    const req = makeReq({});
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when param is a SQL injection string', () => {
    const middleware = requireUUIDParam('id');
    const req = makeReq({ id: "1 OR '1'='1'" });
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when param is a path traversal string', () => {
    const middleware = requireUUIDParam('id');
    const req = makeReq({ id: '../../../etc/passwd' });
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('validates a different named param (profileId)', () => {
    const middleware = requireUUIDParam('profileId');
    const req = makeReq({ profileId: 'bad-value' });
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── requireSafeParam middleware ───────────────────────────────────────────────

describe('requireSafeParam() middleware', () => {
  it('calls next() when param is a safe alphanumeric slug', () => {
    const middleware = requireSafeParam('slug');
    const req = makeReq({ slug: 'my-job-id-123' });
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 when param contains path-traversal chars', () => {
    const middleware = requireSafeParam('jobId');
    const req = makeReq({ jobId: '../../../secret' });
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when param is empty', () => {
    const middleware = requireSafeParam('jobId');
    const req = makeReq({ jobId: '' });
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when param exceeds 128 chars', () => {
    const middleware = requireSafeParam('jobId');
    const req = makeReq({ jobId: 'a'.repeat(129) });
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when param contains semicolons (SQL injection attempt)', () => {
    const middleware = requireSafeParam('jobId');
    const req = makeReq({ jobId: "job;DROP TABLE jobs;--" });
    const res = makeRes();
    const next: NextFunction = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
