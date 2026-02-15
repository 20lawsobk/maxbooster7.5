import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting middleware to protect against abuse and resource exhaustion
 */

// General API rate limit - 100 requests per 15 minutes per IP
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

// AI operations rate limit - 10 requests per minute (expensive operations)
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many AI requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'AI rate limit exceeded',
      message: 'You have exceeded the AI operations rate limit. Please wait before trying again.',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

// File upload rate limit - 20 uploads per 15 minutes
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: 'Too many uploads, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Upload rate limit exceeded',
      message: 'You have exceeded the file upload rate limit. Please wait before uploading again.',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

// Authentication rate limit - 5 attempts per 15 minutes (prevent brute force)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Authentication rate limit exceeded',
      message: 'Too many failed authentication attempts. Please try again later.',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

// Strict rate limit for sensitive operations - 3 per minute
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  message: 'Rate limit exceeded for sensitive operation.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Strict rate limit exceeded',
      message: 'This operation is rate-limited for security. Please wait before trying again.',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});
