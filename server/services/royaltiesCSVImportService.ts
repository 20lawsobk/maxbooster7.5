import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { storage } from '../storage.js';
import type { InsertRevenueEvent } from '@shared/schema';
import { queueService } from './queueService.js';
import type { CSVImportJobData, CSVImportResult } from './queueService.js';
import { storageService } from './storageService.js';
import { logger } from '../logger.js';

export interface JobResponse {
  jobId: string;
  status: string;
  statusUrl: string;
}

export class RoyaltiesCSVImportService {
  parseCSV(buffer: Buffer): unknown[] {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  }

  mapColumns(row: unknown, mapping: Record<string, string>): Partial<InsertRevenueEvent> {
    const mapped: any = {};
    for (const [schemaField, csvColumn] of Object.entries(mapping)) {
      mapped[schemaField] = row[csvColumn];
    }
    return mapped;
  }

  validateRow(row: Partial<InsertRevenueEvent>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!row.projectId) errors.push('Missing projectId');
    if (!row.source) errors.push('Missing source');
    if (!row.amount || isNaN(Number(row.amount))) errors.push('Invalid amount');
    if (!row.occurredAt) errors.push('Missing occurredAt');

    return { valid: errors.length === 0, errors };
  }

  calculateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  async dryRunImport(buffer: Buffer, mapping: Record<string, string>, userId: string) {
    const fileHash = this.calculateFileHash(buffer);
    const existing = await storage.checkFileHash(fileHash);

    if (existing) {
      return { duplicate: true, existingImport: existing };
    }

    const rows = this.parseCSV(buffer);
    const preview: unknown[] = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const row of rows.slice(0, 100)) {
      const mapped = this.mapColumns(row, mapping);
      const validation = this.validateRow(mapped);

      if (validation.valid) {
        validCount++;
      } else {
        invalidCount++;
      }

      preview.push({
        row: mapped,
        valid: validation.valid,
        errors: validation.errors,
      });
    }

    return {
      duplicate: false,
      totalRows: rows.length,
      previewRows: preview,
      estimatedValid: validCount,
      estimatedInvalid: invalidCount,
    };
  }

  async importCSV(
    buffer: Buffer,
    mapping: Record<string, string>,
    userId: string,
    filename: string
  ): Promise<JobResponse> {
    // Upload CSV to storage for worker processing
    const storageKey = await storageService.uploadFile(
      buffer,
      'csv-imports',
      `${userId}_${filename}`,
      'text/csv'
    );

    const job = await queueService.addCSVImportJob({
      userId,
      storageKey,
      type: 'royalties',
    });

    return {
      jobId: job.id!,
      status: 'processing',
      statusUrl: `/api/jobs/csv/${job.id}`,
    };
  }

  async processCSVImport(data: CSVImportJobData): Promise<CSVImportResult> {
    const startTime = Date.now();

    try {
      // Download CSV from storage
      const buffer = await storageService.downloadFile(data.storageKey);

      // Extract mapping from storage key or use default
      const mapping: Record<string, string> = {
        projectId: 'projectId',
        source: 'source',
        amount: 'amount',
        occurredAt: 'occurredAt',
      };

      const fileHash = this.calculateFileHash(buffer);
      const rows = this.parseCSV(buffer);

      const importRecord = await storage.createImportHistory({
        userId: data.userId,
        filename: data.storageKey.split('/').pop() || 'unknown.csv',
        fileHash,
        rowsProcessed: rows.length,
        rowsSucceeded: 0,
        rowsFailed: 0,
        status: 'processing',
      });

      const events: InsertRevenueEvent[] = [];
      const errors: unknown[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const mapped = this.mapColumns(row, mapping);

        if (mapped.occurredAt && typeof mapped.occurredAt === 'string') {
          mapped.occurredAt = new Date(mapped.occurredAt);
        }

        const validation = this.validateRow(mapped);
        if (validation.valid) {
          events.push(mapped as InsertRevenueEvent);
        } else {
          errors.push({ row: i + 1, errors: validation.errors });
        }
      }

      const result = await storage.ingestRevenueBatch(events);

      await storage.createImportHistory({
        id: importRecord.id,
        userId: data.userId,
        filename: data.storageKey.split('/').pop() || 'unknown.csv',
        fileHash,
        rowsProcessed: rows.length,
        rowsSucceeded: result.succeeded,
        rowsFailed: result.failed,
        errors: errors.length > 0 ? errors : null,
        status: 'completed',
        completedAt: new Date(),
      });

      const duration = Date.now() - startTime;

      return {
        rowsProcessed: rows.length,
        errors: errors.length,
        duration,
      };
    } catch (error: unknown) {
      logger.error('Error processing CSV import:', error);
      throw error;
    } finally {
      // Clean up CSV file from storage
      try {
        await storageService.deleteFile(data.storageKey);
      } catch (error: unknown) {
        logger.warn('Failed to clean up CSV file:', error);
      }
    }
  }

  async executeImport(
    buffer: Buffer,
    mapping: Record<string, string>,
    userId: string,
    filename: string
  ) {
    const fileHash = this.calculateFileHash(buffer);
    const rows = this.parseCSV(buffer);

    const importRecord = await storage.createImportHistory({
      userId,
      filename,
      fileHash,
      rowsProcessed: rows.length,
      rowsSucceeded: 0,
      rowsFailed: 0,
      status: 'processing',
    });

    const events: InsertRevenueEvent[] = [];
    const errors: unknown[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped = this.mapColumns(row, mapping);

      if (mapped.occurredAt && typeof mapped.occurredAt === 'string') {
        mapped.occurredAt = new Date(mapped.occurredAt);
      }

      const validation = this.validateRow(mapped);
      if (validation.valid) {
        events.push(mapped as InsertRevenueEvent);
      } else {
        errors.push({ row: i + 1, errors: validation.errors });
      }
    }

    const result = await storage.ingestRevenueBatch(events);

    await storage.createImportHistory({
      id: importRecord.id,
      userId,
      filename,
      fileHash,
      rowsProcessed: rows.length,
      rowsSucceeded: result.succeeded,
      rowsFailed: result.failed,
      errors: errors.length > 0 ? errors : null,
      status: 'completed',
      completedAt: new Date(),
    });

    return {
      importId: importRecord.id,
      totalRows: rows.length,
      succeeded: result.succeeded,
      failed: result.failed,
      errors,
    };
  }
}

export const royaltiesCSVImportService = new RoyaltiesCSVImportService();
