#!/usr/bin/env tsx

/**
 * Database Backup Script
 *
 * Creates a backup of the PostgreSQL database
 * Run periodically or before major deployments
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const MAX_BACKUPS = 7; // Keep last 7 backups

async function ensureBackupDirectory() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`✅ Created backup directory: ${BACKUP_DIR}`);
  }
}

async function createBackup() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable not set');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const backupFile = path.join(BACKUP_DIR, `maxbooster-backup-${timestamp}.sql`);

  console.log('🔄 Creating database backup...');
  console.log(`📁 Backup file: ${backupFile}\n`);

  try {
    // Use pg_dump to create backup
    const command = `pg_dump "${databaseUrl}" > "${backupFile}"`;
    await execAsync(command);

    const stats = fs.statSync(backupFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`✅ Backup created successfully!`);
    console.log(`   File: ${backupFile}`);
    console.log(`   Size: ${fileSizeMB} MB\n`);

    return backupFile;
  } catch (error: any) {
    console.error('❌ Backup failed:', error.message);
    throw error;
  }
}

async function cleanOldBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('maxbooster-backup-') && f.endsWith('.sql'))
    .map((f) => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length > MAX_BACKUPS) {
    console.log(`🧹 Cleaning old backups (keeping last ${MAX_BACKUPS})...`);

    const filesToDelete = files.slice(MAX_BACKUPS);
    for (const file of filesToDelete) {
      fs.unlinkSync(file.path);
      console.log(`   Deleted: ${file.name}`);
    }

    console.log(`✅ Cleanup complete\n`);
  }
}

async function listBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('maxbooster-backup-') && f.endsWith('.sql'))
    .map((f) => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtime,
      size: fs.statSync(path.join(BACKUP_DIR, f)).size,
    }))
    .sort((a, b) => b.time.getTime() - a.time.getTime());

  if (files.length === 0) {
    console.log('No backups found.\n');
    return;
  }

  console.log('📋 Available Backups:\n');
  files.forEach((file, index) => {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const date = file.time.toLocaleDateString();
    const time = file.time.toLocaleTimeString();
    console.log(`${index + 1}. ${file.name}`);
    console.log(`   Date: ${date} ${time} | Size: ${sizeMB} MB\n`);
  });
}

async function main() {
  console.log('🗄️  Max Booster Database Backup\n');
  console.log('='.repeat(60) + '\n');

  try {
    await ensureBackupDirectory();
    await createBackup();
    await cleanOldBackups();
    await listBackups();

    console.log('='.repeat(60));
    console.log('✅ Backup process completed successfully!');
    console.log('💡 To restore: npm run restore:database <backup-file>');
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Backup failed:', error.message);
    process.exit(1);
  }
}

main();
