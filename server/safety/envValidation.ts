/**
 * BOOT-TIME ENVIRONMENT VALIDATION
 * 
 * Validates all required environment variables and secrets at startup.
 * Server MUST NOT start if critical variables are missing.
 */

import { logger } from '../logger.js';

interface EnvRequirement {
  name: string;
  required: boolean;
  category: 'critical' | 'payment' | 'email' | 'social' | 'monitoring' | 'optional';
  description: string;
  validator?: (value: string) => boolean;
}

const ENV_REQUIREMENTS: EnvRequirement[] = [
  // Critical - Server will not start without these
  {
    name: 'DATABASE_URL',
    required: true,
    category: 'critical',
    description: 'PostgreSQL database connection string',
    validator: (v) => v.startsWith('postgres'),
  },
  {
    name: 'SESSION_SECRET',
    required: false, // Generated if missing
    category: 'critical',
    description: 'Session encryption secret',
    validator: (v) => v.length >= 32,
  },

  // Payment - Required for accepting money
  {
    name: 'STRIPE_SECRET_KEY',
    required: true,
    category: 'payment',
    description: 'Stripe secret API key',
    validator: (v) => v.startsWith('sk_'),
  },
  {
    name: 'STRIPE_PUBLISHABLE_KEY',
    required: true,
    category: 'payment',
    description: 'Stripe publishable API key',
    validator: (v) => v.startsWith('pk_'),
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: true,
    category: 'payment',
    description: 'Stripe webhook signing secret',
    validator: (v) => v.startsWith('whsec_'),
  },

  // Email - Required for user communication
  {
    name: 'SENDGRID_API_KEY',
    required: true,
    category: 'email',
    description: 'SendGrid API key for email delivery',
    validator: (v) => v.startsWith('SG.'),
  },

  // Monitoring - Required for production observability
  {
    name: 'SENTRY_DSN',
    required: false,
    category: 'monitoring',
    description: 'Sentry DSN for error tracking',
    validator: (v) => v.includes('sentry.io'),
  },

  // Redis - Required for queues and caching
  {
    name: 'REDIS_URL',
    required: false, // Falls back to in-memory
    category: 'optional',
    description: 'Redis connection URL',
    validator: (v) => v.startsWith('redis://') || v.startsWith('rediss://'),
  },

  // Social Media APIs - Optional but needed for social features
  {
    name: 'TWITTER_API_KEY',
    required: false,
    category: 'social',
    description: 'Twitter/X API key',
  },
  {
    name: 'TWITTER_API_SECRET',
    required: false,
    category: 'social',
    description: 'Twitter/X API secret',
  },
  {
    name: 'FACEBOOK_APP_ID',
    required: false,
    category: 'social',
    description: 'Facebook App ID',
  },
  {
    name: 'FACEBOOK_APP_SECRET',
    required: false,
    category: 'social',
    description: 'Facebook App secret',
  },
  {
    name: 'INSTAGRAM_APP_ID',
    required: false,
    category: 'social',
    description: 'Instagram App ID',
  },
  {
    name: 'INSTAGRAM_APP_SECRET',
    required: false,
    category: 'social',
    description: 'Instagram App secret',
  },
  {
    name: 'TIKTOK_CLIENT_KEY',
    required: false,
    category: 'social',
    description: 'TikTok client key',
  },
  {
    name: 'TIKTOK_CLIENT_SECRET',
    required: false,
    category: 'social',
    description: 'TikTok client secret',
  },
  {
    name: 'YOUTUBE_CLIENT_ID',
    required: false,
    category: 'social',
    description: 'YouTube client ID',
  },
  {
    name: 'YOUTUBE_CLIENT_SECRET',
    required: false,
    category: 'social',
    description: 'YouTube client secret',
  },
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    total: number;
    valid: number;
    missing: number;
    invalid: number;
  };
}

export function validateEnvironment(strictMode: boolean = true): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let valid = 0;
  let missing = 0;
  let invalid = 0;

  logger.info('════════════════════════════════════════════════════════');
  logger.info('🔐 ENVIRONMENT VALIDATION');
  logger.info('════════════════════════════════════════════════════════');

  for (const req of ENV_REQUIREMENTS) {
    const value = process.env[req.name];

    if (!value) {
      if (req.required) {
        errors.push(`MISSING: ${req.name} - ${req.description}`);
        missing++;
        logger.error(`   ✗ ${req.name} - MISSING (required)`);
      } else {
        warnings.push(`Optional: ${req.name} not set - ${req.description}`);
        logger.warn(`   ⚠ ${req.name} - not set (optional)`);
      }
      continue;
    }

    if (req.validator && !req.validator(value)) {
      if (req.required) {
        errors.push(`INVALID: ${req.name} - ${req.description} (validation failed)`);
        invalid++;
        logger.error(`   ✗ ${req.name} - INVALID format`);
      } else {
        warnings.push(`Invalid format: ${req.name} - ${req.description}`);
        logger.warn(`   ⚠ ${req.name} - invalid format`);
      }
      continue;
    }

    valid++;
    logger.info(`   ✓ ${req.name}`);
  }

  const isValid = errors.length === 0;

  logger.info('────────────────────────────────────────────────────────');
  logger.info(`   Valid: ${valid} | Missing: ${missing} | Invalid: ${invalid}`);
  
  if (isValid) {
    logger.info('   ✅ Environment validation PASSED');
  } else {
    logger.error('   ❌ Environment validation FAILED');
    logger.error('');
    logger.error('   Critical errors:');
    errors.forEach(e => logger.error(`     - ${e}`));
  }
  
  logger.info('════════════════════════════════════════════════════════');

  if (!isValid && strictMode) {
    throw new Error(
      `Environment validation failed. Missing/invalid required variables:\n${errors.join('\n')}`
    );
  }

  return {
    valid: isValid,
    errors,
    warnings,
    summary: {
      total: ENV_REQUIREMENTS.length,
      valid,
      missing,
      invalid,
    },
  };
}

/**
 * Quick check for a specific env var
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Get env var with fallback
 */
export function getEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
