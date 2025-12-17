#!/usr/bin/env tsx

/**
 * Database Restore Script
 *
 * Restores database from a backup file
 *
 * Usage:
 *   npm run restore:database backups/maxbooster-backup-2025-11-16.sql
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as readline from 'readline';

const execAsync = promisify(exec);

async function confirmRestore(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      '\n⚠️  WARNING: This will OVERWRITE your current database!\n   Type "yes" to continue: ',
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes');
      }
    );
  });
}

async function restoreBackup(backupFile: string) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable not set');
  }

  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found: ${backupFile}`);
  }

  const stats = fs.statSync(backupFile);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('\n🔄 Restoring database from backup...');
  console.log(`📁 Backup file: ${backupFile}`);
  console.log(`📊 File size: ${fileSizeMB} MB\n`);

  try {
    // Use psql to restore backup
    const command = `psql "${databaseUrl}" < "${backupFile}"`;
    await execAsync(command);

    console.log('✅ Database restored successfully!\n');
  } catch (error: any) {
    console.error('❌ Restore failed:', error.message);
    throw error;
  }
}

async function main() {
  const backupFile = process.argv[2];

  console.log('🗄️  Max Booster Database Restore\n');
  console.log('='.repeat(60) + '\n');

  if (!backupFile) {
    console.error('❌ Error: No backup file specified\n');
    console.log('Usage:');
    console.log('  npm run restore:database <backup-file>\n');
    console.log('Example:');
    console.log('  npm run restore:database backups/maxbooster-backup-2025-11-16.sql\n');
    process.exit(1);
  }

  try {
    const confirmed = await confirmRestore();

    if (!confirmed) {
      console.log('\n❌ Restore cancelled by user\n');
      process.exit(0);
    }

    await restoreBackup(backupFile);

    console.log('='.repeat(60));
    console.log('✅ Restore process completed successfully!');
    console.log('💡 Restart your application to use the restored database');
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Restore failed:', error.message);
    process.exit(1);
  }
}

main();
