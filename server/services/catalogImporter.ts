import { db } from '../db';
import { 
  catalogImportJobs, 
  catalogImportRows,
  releases,
  distroTracks
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logger } from '../logger.js';
import { identifierService } from './identifierService.js';
import { labelCopyLinter, LabelCopyLinter } from './labelCopyLinter.js';

export interface ImportRow {
  title: string;
  artist: string;
  albumArtist?: string;
  genre?: string;
  releaseDate?: string;
  upc?: string;
  isrc?: string;
  label?: string;
  copyrightHolder?: string;
  copyrightYear?: number;
  trackTitle?: string;
  trackNumber?: number;
  duration?: number;
  isExplicit?: boolean;
  language?: string;
  [key: string]: any;
}

export interface ImportResult {
  jobId: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  duplicateRows: number;
  errors: ImportError[];
  warnings: ImportWarning[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface ImportError {
  rowNumber: number;
  field: string;
  message: string;
  value?: string;
}

export interface ImportWarning {
  rowNumber: number;
  field: string;
  message: string;
  suggestion?: string;
}

export interface ImportProgress {
  jobId: string;
  totalRows: number;
  processedRows: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
  currentPhase: 'parsing' | 'validating' | 'importing' | 'finalizing';
}

const CSV_COLUMN_MAPPINGS: Record<string, string> = {
  'release_title': 'title',
  'album_title': 'title',
  'album': 'title',
  'release': 'title',
  'artist_name': 'artist',
  'primary_artist': 'artist',
  'performer': 'artist',
  'album_artist': 'albumArtist',
  'genre_primary': 'genre',
  'primary_genre': 'genre',
  'release_date': 'releaseDate',
  'street_date': 'releaseDate',
  'upc_code': 'upc',
  'ean': 'upc',
  'isrc_code': 'isrc',
  'label_name': 'label',
  'record_label': 'label',
  'copyright': 'copyrightHolder',
  'p_line': 'copyrightHolder',
  'c_line': 'copyrightHolder',
  'track_title': 'trackTitle',
  'song_title': 'trackTitle',
  'track_number': 'trackNumber',
  'track_no': 'trackNumber',
  'duration_seconds': 'duration',
  'length': 'duration',
  'explicit': 'isExplicit',
  'parental_advisory': 'isExplicit',
  'language_code': 'language',
  'primary_language': 'language'
};

const DDEX_FIELD_MAPPINGS: Record<string, string> = {
  'ReleaseTitle': 'title',
  'DisplayArtistName': 'artist',
  'GenreText': 'genre',
  'ReleaseDate': 'releaseDate',
  'ICPN': 'upc',
  'ISRC': 'isrc',
  'RecordLabelName': 'label',
  'PLine': 'copyrightHolder',
  'CLine': 'copyrightHolder',
  'Title': 'trackTitle',
  'SequenceNumber': 'trackNumber',
  'Duration': 'duration',
  'IsExplicit': 'isExplicit',
  'LanguageOfPerformance': 'language'
};

class CatalogImporter {
  private linter: LabelCopyLinter;

  constructor() {
    this.linter = new LabelCopyLinter();
  }

  async createImportJob(
    userId: string,
    filename: string,
    fileType: 'csv' | 'xlsx' | 'ddex',
    fileSize: number
  ): Promise<string> {
    const [job] = await db.insert(catalogImportJobs).values({
      userId,
      filename,
      fileType,
      fileSize,
      status: 'pending'
    }).returning();

    logger.info(`Created import job ${job.id} for user ${userId}`);
    return job.id;
  }

  async parseCSV(content: string): Promise<ImportRow[]> {
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    const headers = this.parseCSVLine(lines[0]).map(h => this.normalizeHeader(h));
    const rows: ImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row: ImportRow = {} as ImportRow;

      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        const value = values[j]?.trim();
        
        if (value) {
          const mappedField = CSV_COLUMN_MAPPINGS[header.toLowerCase()] || header;
          row[mappedField] = this.parseValue(mappedField, value);
        }
      }

      if (row.title || row.trackTitle) {
        rows.push(row);
      }
    }

    return rows;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }

  private normalizeHeader(header: string): string {
    return header
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_');
  }

  private parseValue(field: string, value: string): any {
    switch (field) {
      case 'trackNumber':
      case 'duration':
      case 'copyrightYear':
        return parseInt(value, 10) || undefined;
      case 'isExplicit':
        return ['true', '1', 'yes', 'y', 'explicit'].includes(value.toLowerCase());
      case 'releaseDate':
        return this.parseDate(value);
      default:
        return value;
    }
  }

  private parseDate(value: string): string | undefined {
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/,
      /^(\d{2})\/(\d{2})\/(\d{4})$/,
      /^(\d{4})\/(\d{2})\/(\d{2})$/
    ];

    for (const format of formats) {
      const match = value.match(format);
      if (match) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
    }

    return undefined;
  }

  async parseDDEX(xmlContent: string): Promise<ImportRow[]> {
    logger.info('DDEX parsing initiated (simplified XML parsing)');
    
    const rows: ImportRow[] = [];
    
    const releaseMatch = xmlContent.match(/<ReleaseTitle[^>]*>(.*?)<\/ReleaseTitle>/s);
    const artistMatch = xmlContent.match(/<DisplayArtistName[^>]*>(.*?)<\/DisplayArtistName>/s);
    const upcMatch = xmlContent.match(/<ICPN[^>]*>(.*?)<\/ICPN>/s);
    
    if (releaseMatch) {
      const row: ImportRow = {
        title: releaseMatch[1].trim(),
        artist: artistMatch?.[1]?.trim() || 'Unknown Artist'
      };

      if (upcMatch) {
        row.upc = upcMatch[1].trim();
      }

      const isrcMatches = xmlContent.matchAll(/<ISRC[^>]*>(.*?)<\/ISRC>/gs);
      const trackMatches = xmlContent.matchAll(/<Title[^>]*>(.*?)<\/Title>/gs);
      
      let trackNumber = 1;
      for (const trackMatch of trackMatches) {
        const trackRow: ImportRow = {
          ...row,
          trackTitle: trackMatch[1].trim(),
          trackNumber: trackNumber++
        };
        rows.push(trackRow);
      }

      if (rows.length === 0) {
        rows.push(row);
      }
    }

    return rows;
  }

  async validateRows(rows: ImportRow[], jobId: string): Promise<{
    validRows: ImportRow[];
    errors: ImportError[];
    warnings: ImportWarning[];
    duplicates: number[];
  }> {
    const validRows: ImportRow[] = [];
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    const duplicates: number[] = [];
    const seenIdentifiers = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      let isValid = true;

      if (!row.title && !row.trackTitle) {
        errors.push({
          rowNumber,
          field: 'title',
          message: 'Title is required'
        });
        isValid = false;
      }

      if (!row.artist) {
        errors.push({
          rowNumber,
          field: 'artist',
          message: 'Artist is required'
        });
        isValid = false;
      }

      if (row.upc) {
        const upcValidation = identifierService.validateUPC(row.upc);
        if (!upcValidation.valid) {
          errors.push({
            rowNumber,
            field: 'upc',
            message: upcValidation.error || 'Invalid UPC',
            value: row.upc
          });
          isValid = false;
        }
      }

      if (row.isrc) {
        const isrcValidation = identifierService.validateISRC(row.isrc);
        if (!isrcValidation.valid) {
          errors.push({
            rowNumber,
            field: 'isrc',
            message: isrcValidation.error || 'Invalid ISRC',
            value: row.isrc
          });
          isValid = false;
        }
      }

      const identifier = `${row.title || row.trackTitle}|${row.artist}|${row.upc || ''}`;
      if (seenIdentifiers.has(identifier)) {
        duplicates.push(rowNumber);
        warnings.push({
          rowNumber,
          field: 'duplicate',
          message: 'Duplicate entry detected',
          suggestion: 'This row appears to be a duplicate of an earlier row'
        });
      } else {
        seenIdentifiers.add(identifier);
      }

      const title = row.title || row.trackTitle || '';
      if (title === title.toUpperCase() && title.length > 3) {
        warnings.push({
          rowNumber,
          field: 'title',
          message: 'Title is in ALL CAPS',
          suggestion: 'Use Title Case for better presentation'
        });
      }

      if (!row.genre) {
        warnings.push({
          rowNumber,
          field: 'genre',
          message: 'Genre is missing',
          suggestion: 'Add a genre for better discoverability'
        });
      }

      if (!row.releaseDate) {
        warnings.push({
          rowNumber,
          field: 'releaseDate',
          message: 'Release date is missing',
          suggestion: 'Add a release date for scheduling'
        });
      }

      if (isValid && !duplicates.includes(rowNumber)) {
        validRows.push(row);
      }
    }

    return { validRows, errors, warnings, duplicates };
  }

  async importRows(
    jobId: string,
    userId: string,
    rows: ImportRow[],
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    await db.update(catalogImportJobs)
      .set({
        status: 'processing',
        startedAt: new Date(),
        totalRows: rows.length
      })
      .where(eq(catalogImportJobs.id, jobId));

    const validation = await this.validateRows(rows, jobId);
    const result: ImportResult = {
      jobId,
      totalRows: rows.length,
      processedRows: 0,
      successfulRows: 0,
      failedRows: validation.errors.filter(e => e.field !== 'duplicate').length,
      duplicateRows: validation.duplicates.length,
      errors: validation.errors,
      warnings: validation.warnings,
      status: 'processing'
    };

    const releaseGroups = this.groupRowsByRelease(validation.validRows);

    for (const [releaseKey, releaseRows] of Object.entries(releaseGroups)) {
      try {
        const firstRow = releaseRows[0];
        
        const existingRelease = await this.findExistingRelease(
          firstRow.title,
          firstRow.artist,
          firstRow.upc
        );

        if (existingRelease) {
          result.duplicateRows++;
          validation.warnings.push({
            rowNumber: rows.indexOf(firstRow) + 1,
            field: 'release',
            message: 'Release already exists in catalog',
            suggestion: 'Skip or update existing release'
          });
          continue;
        }

        const releaseId = await this.createReleaseFromRows(userId, releaseRows);
        result.successfulRows += releaseRows.length;

        for (const row of releaseRows) {
          await db.insert(catalogImportRows).values({
            jobId,
            rowNumber: rows.indexOf(row) + 1,
            rawData: row,
            parsedData: row,
            releaseId,
            status: 'success'
          });
        }
      } catch (error) {
        result.failedRows += releaseRows.length;
        logger.error(`Error importing release group ${releaseKey}:`, error);
        
        for (const row of releaseRows) {
          result.errors.push({
            rowNumber: rows.indexOf(row) + 1,
            field: 'import',
            message: error instanceof Error ? error.message : 'Import failed'
          });
        }
      }

      result.processedRows += releaseRows.length;
      
      if (onProgress) {
        onProgress({
          jobId,
          totalRows: rows.length,
          processedRows: result.processedRows,
          percentComplete: Math.round((result.processedRows / rows.length) * 100),
          currentPhase: 'importing'
        });
      }
    }

    result.status = result.failedRows === rows.length ? 'failed' : 'completed';

    await db.update(catalogImportJobs)
      .set({
        status: result.status,
        completedAt: new Date(),
        processedRows: result.processedRows,
        successfulRows: result.successfulRows,
        failedRows: result.failedRows,
        duplicateRows: result.duplicateRows,
        errors: result.errors,
        warnings: result.warnings
      })
      .where(eq(catalogImportJobs.id, jobId));

    logger.info(`Import job ${jobId} completed: ${result.successfulRows}/${result.totalRows} successful`);

    return result;
  }

  private groupRowsByRelease(rows: ImportRow[]): Record<string, ImportRow[]> {
    const groups: Record<string, ImportRow[]> = {};

    for (const row of rows) {
      const key = `${row.title || 'untitled'}|${row.artist}|${row.upc || 'no-upc'}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    }

    return groups;
  }

  private async findExistingRelease(
    title: string,
    artist: string,
    upc?: string
  ): Promise<any | null> {
    if (upc) {
      const byUpc = await db.select()
        .from(releases)
        .where(eq(releases.upc, upc))
        .limit(1);
      
      if (byUpc.length > 0) {
        return byUpc[0];
      }
    }

    const byTitleArtist = await db.select()
      .from(releases)
      .where(
        and(
          eq(releases.title, title),
          eq(releases.artist, artist)
        )
      )
      .limit(1);

    return byTitleArtist.length > 0 ? byTitleArtist[0] : null;
  }

  private async createReleaseFromRows(userId: string, rows: ImportRow[]): Promise<string> {
    const firstRow = rows[0];

    let upc = firstRow.upc;
    if (!upc) {
      upc = await identifierService.generateUPC({ userId });
    }

    const [release] = await db.insert(releases).values({
      userId,
      title: firstRow.title || 'Untitled Release',
      artist: firstRow.artist,
      upc,
      status: 'draft',
      releaseDate: firstRow.releaseDate ? new Date(firstRow.releaseDate) : null,
      metadata: {
        genre: firstRow.genre,
        label: firstRow.label,
        copyrightHolder: firstRow.copyrightHolder,
        copyrightYear: firstRow.copyrightYear,
        language: firstRow.language,
        isExplicit: firstRow.isExplicit,
        importedAt: new Date()
      }
    }).returning();

    for (const row of rows) {
      if (row.trackTitle || rows.length === 1) {
        let isrc = row.isrc;
        if (!isrc) {
          isrc = await identifierService.generateISRC('US', 'MXB', undefined, { userId });
        }

        await db.insert(distroTracks).values({
          releaseId: release.id,
          title: row.trackTitle || row.title || 'Untitled Track',
          trackNumber: row.trackNumber || 1,
          isrc,
          duration: row.duration,
          explicit: row.isExplicit || false
        });
      }
    }

    return release.id;
  }

  async getImportJob(jobId: string): Promise<any | null> {
    const jobs = await db.select()
      .from(catalogImportJobs)
      .where(eq(catalogImportJobs.id, jobId))
      .limit(1);

    return jobs.length > 0 ? jobs[0] : null;
  }

  async getImportJobs(userId: string): Promise<any[]> {
    return db.select()
      .from(catalogImportJobs)
      .where(eq(catalogImportJobs.userId, userId))
      .orderBy(desc(catalogImportJobs.createdAt));
  }

  async getImportRows(jobId: string): Promise<any[]> {
    return db.select()
      .from(catalogImportRows)
      .where(eq(catalogImportRows.jobId, jobId))
      .orderBy(catalogImportRows.rowNumber);
  }

  getSupportedFormats(): { format: string; extension: string; description: string }[] {
    return [
      { format: 'csv', extension: '.csv', description: 'Comma-separated values' },
      { format: 'xlsx', extension: '.xlsx', description: 'Microsoft Excel' },
      { format: 'ddex', extension: '.xml', description: 'DDEX ERN format' }
    ];
  }

  getTemplateCSV(): string {
    const headers = [
      'title',
      'artist',
      'album_artist',
      'genre',
      'release_date',
      'upc',
      'label',
      'copyright_holder',
      'copyright_year',
      'track_title',
      'track_number',
      'isrc',
      'duration',
      'explicit',
      'language'
    ];

    const exampleRow = [
      'My Album Title',
      'Artist Name',
      'Artist Name',
      'Pop',
      '2025-01-01',
      '619123456789',
      'My Record Label',
      '2025 My Record Label',
      '2025',
      'First Song',
      '1',
      'USRC12500001',
      '180',
      'false',
      'en'
    ];

    return `${headers.join(',')}\n${exampleRow.join(',')}`;
  }
}

export const catalogImporter = new CatalogImporter();
