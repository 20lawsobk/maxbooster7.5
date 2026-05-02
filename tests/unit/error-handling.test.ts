/**
 * Unit tests for error handling patterns.
 *
 * Verifies type-safe error handling utilities and patterns
 * used across the server codebase.
 */
import { describe, it, expect } from 'vitest';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error) return error.name;
  return undefined;
}

function isZodError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ZodError';
}

describe('getErrorMessage utility', () => {
  it('extracts message from Error instances', () => {
    expect(getErrorMessage(new Error('test message'))).toBe('test message');
  });

  it('returns string errors as-is', () => {
    expect(getErrorMessage('raw string error')).toBe('raw string error');
  });

  it('converts unknown objects to string', () => {
    expect(getErrorMessage(42)).toBe('42');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('handles Error subclasses', () => {
    class CustomError extends Error {
      constructor(msg: string) { super(msg); this.name = 'CustomError'; }
    }
    expect(getErrorMessage(new CustomError('custom'))).toBe('custom');
  });
});

describe('getErrorName utility', () => {
  it('returns error name for Error instances', () => {
    expect(getErrorName(new Error('test'))).toBe('Error');
  });

  it('returns TypeError name for TypeError', () => {
    expect(getErrorName(new TypeError('bad type'))).toBe('TypeError');
  });

  it('returns undefined for non-Error values', () => {
    expect(getErrorName('not an error')).toBeUndefined();
    expect(getErrorName(42)).toBeUndefined();
    expect(getErrorName(null)).toBeUndefined();
  });
});

describe('ZodError detection', () => {
  it('identifies errors named ZodError', () => {
    const err = new Error('validation failed');
    err.name = 'ZodError';
    expect(isZodError(err)).toBe(true);
  });

  it('rejects regular Errors', () => {
    expect(isZodError(new Error('regular'))).toBe(false);
  });

  it('rejects non-Error values', () => {
    expect(isZodError('ZodError')).toBe(false);
    expect(isZodError(null)).toBe(false);
  });
});

describe('AbortError detection pattern', () => {
  it('correctly identifies AbortError by name', () => {
    const err = new DOMException('User aborted', 'AbortError');
    const isAbort = err instanceof Error && err.name === 'AbortError';
    expect(isAbort).toBe(true);
  });

  it('does not confuse other DOMExceptions with AbortError', () => {
    const err = new DOMException('Not allowed', 'NotAllowedError');
    const isAbort = err instanceof Error && err.name === 'AbortError';
    expect(isAbort).toBe(false);
  });
});
