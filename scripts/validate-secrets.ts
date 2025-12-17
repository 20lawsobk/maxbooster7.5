#!/usr/bin/env tsx

/**
 * Production Secrets Validation Script
 *
 * Validates that all required secrets are configured before deployment
 * Run this before deploying to production
 */

interface SecretConfig {
  name: string;
  required: boolean;
  description: string;
  validation?: (value: string) => boolean;
  errorMessage?: string;
}

const REQUIRED_SECRETS: SecretConfig[] = [
  // Database (Auto-configured by Replit)
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL connection string (auto-configured by Replit)',
    validation: (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'),
    errorMessage: 'Must be a valid PostgreSQL connection string',
  },

  // Stripe Payment Processing
  {
    name: 'STRIPE_SECRET_KEY',
    required: true,
    description: 'Stripe secret key for payment processing (MUST be live key in production)',
    validation: (v) => {
      if (process.env.NODE_ENV === 'production') {
        return v.startsWith('sk_live_');
      }
      return v.startsWith('sk_live_') || v.startsWith('sk_test_');
    },
    errorMessage: 'In production, must start with sk_live_ (NOT sk_test_)',
  },
  {
    name: 'STRIPE_PUBLISHABLE_KEY',
    required: true,
    description: 'Stripe publishable key for client-side (MUST be live key in production)',
    validation: (v) => {
      if (process.env.NODE_ENV === 'production') {
        return v.startsWith('pk_live_');
      }
      return v.startsWith('pk_live_') || v.startsWith('pk_test_');
    },
    errorMessage: 'In production, must start with pk_live_ (NOT pk_test_)',
  },

  // Email Service
  {
    name: 'SENDGRID_API_KEY',
    required: true,
    description: 'SendGrid API key for transactional emails',
    validation: (v) => v.startsWith('SG.'),
    errorMessage: 'Must start with SG.',
  },
  {
    name: 'SENDGRID_FROM_EMAIL',
    required: false,
    description: 'Default sender email address',
    validation: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    errorMessage: 'Must be a valid email address',
  },

  // Music Distribution
  {
    name: 'LABELGRID_API_TOKEN',
    required: true,
    description: 'LabelGrid API token for music distribution',
  },

  // Cache/Session (Required for production)
  {
    name: 'REDIS_URL',
    required: true,
    description: 'Redis connection URL for caching, queues, and sessions (required for production)',
    validation: (v) => v.startsWith('redis://') || v.startsWith('rediss://'),
    errorMessage: 'Must be a valid Redis connection string (redis:// or rediss://)',
  },

  // Environment
  {
    name: 'NODE_ENV',
    required: true,
    description: 'Node environment (must be "production" for deployment)',
    validation: (v) => v === 'production',
    errorMessage: 'Must be set to "production" for production deployment',
  },
];

const PRODUCTION_WARNINGS: SecretConfig[] = [
  {
    name: 'ENABLE_DEV_ACCOUNTS',
    required: false,
    description: '⚠️ SECURITY WARNING: This should NEVER be set in production',
    validation: (v) => v !== 'true',
    errorMessage: 'CRITICAL: ENABLE_DEV_ACCOUNTS must not be true in production!',
  },
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missing: string[];
}

function validateSecrets(): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    missing: [],
  };

  console.log('🔐 Validating Production Secrets...\n');

  // Check required secrets
  for (const secret of REQUIRED_SECRETS) {
    const value = process.env[secret.name];

    if (!value) {
      if (secret.required) {
        result.valid = false;
        result.missing.push(secret.name);
        console.log(`❌ MISSING (REQUIRED): ${secret.name}`);
        console.log(`   ${secret.description}\n`);
      } else {
        result.warnings.push(`Optional secret ${secret.name} not configured`);
        console.log(`⚠️  MISSING (OPTIONAL): ${secret.name}`);
        console.log(`   ${secret.description}\n`);
      }
      continue;
    }

    // Validate format if validation function provided
    if (secret.validation && !secret.validation(value)) {
      result.valid = false;
      result.errors.push(`${secret.name}: ${secret.errorMessage || 'Invalid format'}`);
      console.log(`❌ INVALID: ${secret.name}`);
      console.log(`   ${secret.errorMessage || 'Invalid format'}\n`);
      continue;
    }

    // Mask secret value for display
    const maskedValue =
      value.length > 8
        ? value.substring(0, 4) + '****' + value.substring(value.length - 4)
        : '****';

    console.log(`✅ ${secret.name}: ${maskedValue}`);
    console.log(`   ${secret.description}\n`);
  }

  // Check for security warnings
  for (const warning of PRODUCTION_WARNINGS) {
    const value = process.env[warning.name];

    if (value && warning.validation && !warning.validation(value)) {
      result.valid = false;
      result.errors.push(`${warning.name}: ${warning.errorMessage}`);
      console.log(`🚨 ${warning.errorMessage}`);
    }
  }

  return result;
}

function printSummary(result: ValidationResult) {
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(60) + '\n');

  if (result.valid) {
    console.log('✅ All required secrets are configured correctly!');
    console.log('✅ Production deployment is ready\n');
  } else {
    console.log('❌ Validation FAILED - Production deployment blocked\n');

    if (result.missing.length > 0) {
      console.log('Missing required secrets:');
      result.missing.forEach((name) => console.log(`  - ${name}`));
      console.log();
    }

    if (result.errors.length > 0) {
      console.log('Configuration errors:');
      result.errors.forEach((error) => console.log(`  - ${error}`));
      console.log();
    }
  }

  if (result.warnings.length > 0) {
    console.log('Warnings (optional secrets):');
    result.warnings.forEach((warning) => console.log(`  ⚠️  ${warning}`));
    console.log();
  }

  console.log('='.repeat(60) + '\n');
}

// Main execution
const result = validateSecrets();
printSummary(result);

if (!result.valid) {
  console.error('To configure secrets in Replit:');
  console.error('1. Click "Tools" → "Secrets" in the left sidebar');
  console.error('2. Add each missing secret as a key-value pair');
  console.error('3. Re-run this validation script\n');
  process.exit(1);
}

console.log('Next steps:');
console.log('1. Deploy to Replit Reserved VM');
console.log('2. Run: npm run bootstrap:admin (to create admin account)');
console.log('3. Test critical flows (signup, payment, studio)\n');

process.exit(0);
