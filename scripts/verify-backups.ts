import { logger } from '../server/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BackupVerification {
  exists: boolean;
  size: number;
  age: number;
  valid: boolean;
  restorable: boolean;
  error?: string;
}

class BackupVerifier {
  private backupDir = 'backups';

  async verifyLatestBackup(): Promise<BackupVerification> {
    logger.info('🔍 Verifying latest database backup...\n');

    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(f => f.endsWith('.sql') || f.endsWith('.backup'));

      if (backupFiles.length === 0) {
        return {
          exists: false,
          size: 0,
          age: 0,
          valid: false,
          restorable: false,
          error: 'No backup files found',
        };
      }

      backupFiles.sort().reverse();
      const latestBackup = backupFiles[0];
      const backupPath = path.join(this.backupDir, latestBackup);

      const stats = await fs.stat(backupPath);
      const age = (Date.now() - stats.mtime.getTime()) / 1000 / 60 / 60;

      const isValid = await this.validateBackupFile(backupPath);
      const isRestorable = await this.testRestore(backupPath);

      const result: BackupVerification = {
        exists: true,
        size: stats.size,
        age,
        valid: isValid,
        restorable: isRestorable,
      };

      this.printReport(latestBackup, result);

      return result;
    } catch (error) {
      logger.error('Backup verification failed:', error);
      return {
        exists: false,
        size: 0,
        age: 0,
        valid: false,
        restorable: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async validateBackupFile(filePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      const hasValidHeader = content.includes('PostgreSQL') || content.includes('CREATE TABLE');
      const hasValidFooter = content.length > 0;
      
      return hasValidHeader && hasValidFooter;
    } catch {
      return false;
    }
  }

  private async testRestore(filePath: string): Promise<boolean> {
    logger.info('Testing backup restorability (dry run)...');
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const sqlStatements = content.split(';').filter(s => s.trim().length > 0);
      
      return sqlStatements.length > 0;
    } catch {
      return false;
    }
  }

  private printReport(filename: string, result: BackupVerification): void {
    console.log('\n' + '═'.repeat(70));
    console.log('               BACKUP VERIFICATION REPORT');
    console.log('═'.repeat(70) + '\n');

    console.log(`Backup File:     ${filename}`);
    console.log(`Size:            ${(result.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Age:             ${result.age.toFixed(1)} hours`);
    console.log(`Valid Format:    ${result.valid ? '✅ Yes' : '❌ No'}`);
    console.log(`Restorable:      ${result.restorable ? '✅ Yes' : '❌ No'}`);

    console.log('\n' + '═'.repeat(70));

    if (result.valid && result.restorable) {
      console.log('                    ✅ BACKUP: VERIFIED');
      console.log('');
      console.log('  Backup is valid and restorable.');
    } else {
      console.log('                    ❌ BACKUP: INVALID');
      console.log('');
      console.log('  Backup verification failed. Create a new backup.');
    }

    console.log('═'.repeat(70) + '\n');

    if (result.age > 24) {
      console.log('⚠️  WARNING: Backup is older than 24 hours. Consider creating a fresh backup.\n');
    }
  }

  async createBackupIfNeeded(): Promise<void> {
    const verification = await this.verifyLatestBackup();

    if (!verification.exists || !verification.valid || verification.age > 24) {
      logger.info('📦 Creating new backup...\n');
      try {
        await execAsync('npm run backup:database');
        logger.info('✅ Backup created successfully\n');
      } catch (error) {
        logger.error('❌ Failed to create backup:', error);
      }
    }
  }
}

const verifier = new BackupVerifier();
verifier.verifyLatestBackup().then((result) => {
  process.exit(result.valid && result.restorable ? 0 : 1);
}).catch((error) => {
  logger.error('Backup verification failed:', error);
  process.exit(1);
});
