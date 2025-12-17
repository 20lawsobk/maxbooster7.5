#!/usr/bin/env tsx

/**
 * Secure Admin Bootstrap Script
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=SecurePass123! npm run bootstrap:admin
 *
 * Requirements:
 *   - ADMIN_EMAIL: Valid email address
 *   - ADMIN_PASSWORD: Min 12 chars, must include uppercase, lowercase, numbers, special chars
 *
 * Security:
 *   - Never commits credentials to git
 *   - Validates strong password requirements
 *   - Only creates one admin account (prevents duplicates)
 */

import { bootstrapAdmin } from '../server/init-admin.js';
import { db } from '../server/db.js';

async function main() {
  console.log('🔐 Max Booster Admin Bootstrap');
  console.log('================================\n');

  try {
    await bootstrapAdmin();
    console.log('\n✅ Admin bootstrap complete!');
    console.log('⚠️  IMPORTANT: Remove ADMIN_PASSWORD from your environment immediately');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Bootstrap failed:', error.message);
    console.error('\nUsage:');
    console.error(
      '  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=SecurePass123! npm run bootstrap:admin'
    );
    console.error('\nPassword Requirements:');
    console.error('  - Minimum 12 characters');
    console.error('  - Must contain uppercase letters');
    console.error('  - Must contain lowercase letters');
    console.error('  - Must contain numbers');
    console.error('  - Must contain special characters');
    process.exit(1);
  }
}

main();
