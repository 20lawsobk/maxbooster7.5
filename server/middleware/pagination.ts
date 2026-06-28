/**
 * Pagination Middleware & Helpers
 *
 * Enforces bounded pagination across all list endpoints.
 * Prevents denial-of-service via limit=999999 queries.
 *
 * Usage:
 *   import { parsePaginationParams, MAX_PAGE_SIZE } from '../middleware/pagination.js';
 *   const { limit, offset, page } = parsePaginationParams(req);
 *   const _items = await db?.select().from(table).where(...).orderBy(...).limit(limit).offset(offset);
 */

import type { Request } from "express";

export const MAX_PAGE_SIZE = 500;
export const DEFAULT_PAGE_SIZE = 50;

export interface PaginationParams {
  limit: number;
  offset: number;
  page: number;
}

/**
 * Parse and validate pagination query params from an Express request.
 * - limit: capped at MAX_PAGE_SIZE, defaults to DEFAULT_PAGE_SIZE
 * - page: 1-based, defaults to 1
 * - offset: computed from page × limit
 */
export function parsePaginationParams(req: Request): PaginationParams {
  const rawLimit = parseInt(
    String(req?.query.limit ?? req?.query.pageSize ?? DEFAULT_PAGE_SIZE),
    10,
  );
  const rawPage = parseInt(String(req?.query.page ?? 1), 10);

  const page = Number?.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const limit =
    Number?.isFinite(rawLimit) && rawLimit >= 1
      ? Math?.min(rawLimit, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  return { limit, offset, page };
}
