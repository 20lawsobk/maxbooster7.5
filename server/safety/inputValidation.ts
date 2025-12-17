/**
 * INPUT VALIDATION MIDDLEWARE
 * 
 * Consistent input validation across all routes.
 * Prevents injection attacks, malformed data, and unexpected input.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { logger } from '../logger.js';

/**
 * Common validation schemas
 */
export const schemas = {
  // User ID (UUID or numeric)
  userId: z.union([
    z.string().uuid(),
    z.string().regex(/^\d+$/).transform(Number),
    z.number().int().positive(),
  ]),

  // Email
  email: z.string().email().max(255).toLowerCase(),

  // Password (min 8 chars, at least 1 letter and 1 number)
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),

  // Username
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  // Date range
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }).refine(data => data.startDate <= data.endDate, {
    message: 'Start date must be before end date',
  }),

  // Currency amount (in cents)
  amount: z.number().int().min(0).max(100000000), // Max $1M

  // URL
  url: z.string().url().max(2048),

  // File upload metadata
  fileUpload: z.object({
    filename: z.string().max(255).regex(/^[a-zA-Z0-9._-]+$/),
    mimetype: z.string().max(128),
    size: z.number().int().min(1).max(100 * 1024 * 1024), // Max 100MB
  }),

  // Social platform
  socialPlatform: z.enum([
    'twitter', 'facebook', 'instagram', 'tiktok', 'youtube', 
    'linkedin', 'threads', 'spotify', 'soundcloud', 'bandcamp'
  ]),

  // Music release
  release: z.object({
    title: z.string().min(1).max(255),
    artist: z.string().min(1).max(255),
    genre: z.string().max(64).optional(),
    releaseDate: z.coerce.date().optional(),
    isExplicit: z.boolean().default(false),
    tracks: z.array(z.object({
      title: z.string().min(1).max(255),
      duration: z.number().int().min(1),
      isrc: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/).optional(),
    })).min(1).max(100),
  }),

  // Search query (sanitized)
  searchQuery: z.string()
    .max(256)
    .transform(s => s.replace(/[<>'"`;]/g, '')), // Remove potential injection chars
};

/**
 * Validation middleware factory
 */
export function validate<T extends ZodSchema>(
  schema: T,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = source === 'body' ? req.body : 
                   source === 'query' ? req.query : req.params;
      
      const validated = await schema.parseAsync(data);
      
      // Replace original data with validated/transformed data
      if (source === 'body') {
        req.body = validated;
      } else if (source === 'query') {
        (req as any).validatedQuery = validated;
      } else {
        (req as any).validatedParams = validated;
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        
        logger.warn(`[Validation] Failed validation on ${req.path}:`, errors);
        
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors,
        });
      }
      
      next(error);
    }
  };
}

/**
 * Sanitize string input (remove potential XSS/injection)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        typeof item === 'string' ? sanitizeString(item) :
        typeof item === 'object' && item !== null ? sanitizeObject(item) : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}

/**
 * Global sanitization middleware
 */
export function sanitizationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query params
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query as Record<string, any>);
  }
  
  next();
}

/**
 * SQL injection prevention for dynamic queries
 */
export function escapeSqlIdentifier(identifier: string): string {
  // Only allow alphanumeric and underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return identifier;
}

/**
 * Rate limit by validation errors (prevent brute force)
 */
const validationErrorCounts = new Map<string, { count: number; resetAt: Date }>();

export function trackValidationError(ip: string): boolean {
  const now = new Date();
  const entry = validationErrorCounts.get(ip);
  
  if (!entry || entry.resetAt < now) {
    validationErrorCounts.set(ip, { count: 1, resetAt: new Date(now.getTime() + 60000) });
    return true;
  }
  
  entry.count++;
  
  // Block if too many validation errors (potential attack)
  if (entry.count > 20) {
    logger.warn(`[Validation] Blocking IP ${ip} - too many validation errors`);
    return false;
  }
  
  return true;
}

/**
 * Common route schemas
 */
export const routeSchemas = {
  // Auth routes
  login: z.object({
    email: schemas.email,
    password: z.string().min(1),
  }),
  
  register: z.object({
    email: schemas.email,
    password: schemas.password,
    username: schemas.username.optional(),
    name: z.string().min(1).max(128).optional(),
  }),

  // Subscription routes
  subscribe: z.object({
    tier: z.enum(['standard', 'pro', 'enterprise', 'lifetime']),
    interval: z.enum(['monthly', 'annual']).optional(),
    couponCode: z.string().max(64).optional(),
  }),

  // Release routes
  createRelease: schemas.release,

  // Social routes
  schedulePost: z.object({
    content: z.string().min(1).max(5000),
    platforms: z.array(schemas.socialPlatform).min(1),
    scheduledAt: z.coerce.date(),
    mediaUrls: z.array(schemas.url).max(10).optional(),
  }),

  // Payout routes
  requestPayout: z.object({
    amount: schemas.amount,
    method: z.enum(['bank_transfer', 'paypal', 'stripe']),
  }),
};
