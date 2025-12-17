import { db } from '../db';
import { isrcRegistry, upcRegistry } from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logger } from '../logger.js';
import crypto from 'crypto';

export interface UPCValidationResult {
  valid: boolean;
  error?: string;
  formatted?: string;
  checkDigit?: string;
}

export interface ISRCValidationResult {
  valid: boolean;
  error?: string;
  parsed?: {
    countryCode: string;
    registrantCode: string;
    year: string;
    designation: string;
  };
}

export interface IdentifierGenerationOptions {
  userId: string;
  releaseId?: string;
  trackId?: string;
  metadata?: Record<string, any>;
}

const VALID_COUNTRY_CODES = [
  'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK', 'FI',
  'BE', 'CH', 'AT', 'PT', 'IE', 'NZ', 'BR', 'MX', 'AR', 'CL', 'CO', 'PE', 'VE',
  'ZA', 'IN', 'KR', 'CN', 'TW', 'HK', 'SG', 'MY', 'TH', 'ID', 'PH', 'VN',
  'PL', 'CZ', 'HU', 'RO', 'BG', 'GR', 'TR', 'RU', 'UA', 'IL', 'AE', 'EG', 'NG', 'KE'
];

const VALID_GENRES = [
  'Pop', 'Rock', 'Hip-Hop/Rap', 'R&B/Soul', 'Electronic', 'Dance', 'Country',
  'Jazz', 'Classical', 'Blues', 'Folk', 'Reggae', 'Latin', 'Metal', 'Punk',
  'Alternative', 'Indie', 'World', 'Soundtrack', 'Children\'s Music', 'Spoken Word',
  'Comedy', 'Gospel', 'Christian', 'New Age', 'Easy Listening', 'J-Pop', 'K-Pop',
  'Afrobeats', 'Dancehall', 'House', 'Techno', 'Drum & Bass', 'Dubstep', 'Trap',
  'Lo-Fi', 'Ambient', 'Experimental', 'Singer-Songwriter', 'Acoustic'
];

class IdentifierService {
  private defaultRegistrantCode: string = 'MXB';
  private defaultCountryCode: string = 'US';

  calculateUPCCheckDigit(digits: string): string {
    if (digits.length !== 11) {
      throw new Error('UPC check digit calculation requires exactly 11 digits');
    }

    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const digit = parseInt(digits[i], 10);
      if (isNaN(digit)) {
        throw new Error('Invalid digit in UPC');
      }
      sum += (i % 2 === 0) ? digit * 3 : digit;
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
  }

  validateUPC(upc: string): UPCValidationResult {
    const cleanUPC = upc.replace(/[-\s]/g, '');

    if (!/^\d{12}$/.test(cleanUPC)) {
      return {
        valid: false,
        error: 'UPC must be exactly 12 digits'
      };
    }

    const providedCheckDigit = cleanUPC[11];
    const calculatedCheckDigit = this.calculateUPCCheckDigit(cleanUPC.slice(0, 11));

    if (providedCheckDigit !== calculatedCheckDigit) {
      return {
        valid: false,
        error: `Invalid check digit. Expected ${calculatedCheckDigit}, got ${providedCheckDigit}`
      };
    }

    return {
      valid: true,
      formatted: cleanUPC,
      checkDigit: calculatedCheckDigit
    };
  }

  async generateUPC(options: IdentifierGenerationOptions): Promise<string> {
    try {
      const prefix = '619' + this.generateRandomDigits(8);
      const checkDigit = this.calculateUPCCheckDigit(prefix);
      const upc = prefix + checkDigit;

      const existing = await db.select()
        .from(upcRegistry)
        .where(eq(upcRegistry.code, upc))
        .limit(1);

      if (existing.length > 0) {
        return this.generateUPC(options);
      }

      await db.insert(upcRegistry).values({
        code: upc,
        userId: options.userId,
        releaseId: options.releaseId || null,
        metadata: options.metadata || {},
        status: 'reserved',
        issuedAt: new Date()
      });

      logger.info(`Generated UPC: ${upc} for user ${options.userId}`);
      return upc;
    } catch (error) {
      logger.error('Error generating UPC:', error);
      throw new Error('Failed to generate UPC');
    }
  }

  validateISRC(isrc: string): ISRCValidationResult {
    const cleanISRC = isrc.replace(/[-\s]/g, '').toUpperCase();

    if (cleanISRC.length !== 12) {
      return {
        valid: false,
        error: 'ISRC must be exactly 12 characters (format: CC-XXX-YY-NNNNN)'
      };
    }

    const countryCode = cleanISRC.slice(0, 2);
    const registrantCode = cleanISRC.slice(2, 5);
    const year = cleanISRC.slice(5, 7);
    const designation = cleanISRC.slice(7, 12);

    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return {
        valid: false,
        error: 'Country code must be 2 uppercase letters'
      };
    }

    if (!VALID_COUNTRY_CODES.includes(countryCode)) {
      return {
        valid: false,
        error: `Invalid country code: ${countryCode}. Must be a valid ISO 3166-1 alpha-2 code`
      };
    }

    if (!/^[A-Z0-9]{3}$/.test(registrantCode)) {
      return {
        valid: false,
        error: 'Registrant code must be 3 alphanumeric characters'
      };
    }

    if (!/^\d{2}$/.test(year)) {
      return {
        valid: false,
        error: 'Year must be 2 digits'
      };
    }

    if (!/^\d{5}$/.test(designation)) {
      return {
        valid: false,
        error: 'Designation must be 5 digits'
      };
    }

    return {
      valid: true,
      parsed: {
        countryCode,
        registrantCode,
        year,
        designation
      }
    };
  }

  async generateISRC(
    countryCode: string = this.defaultCountryCode,
    registrantCode: string = this.defaultRegistrantCode,
    year?: number,
    options?: IdentifierGenerationOptions
  ): Promise<string> {
    try {
      const cc = countryCode.toUpperCase();
      const rc = registrantCode.toUpperCase().padEnd(3, '0').slice(0, 3);
      const yr = (year || new Date().getFullYear()).toString().slice(-2);

      const lastIsrc = await db.select()
        .from(isrcRegistry)
        .where(
          sql`${isrcRegistry.code} LIKE ${`${cc}${rc}${yr}%`}`
        )
        .orderBy(desc(isrcRegistry.code))
        .limit(1);

      let nextDesignation = 1;
      if (lastIsrc.length > 0) {
        const lastDesignation = parseInt(lastIsrc[0].code.slice(-5), 10);
        nextDesignation = lastDesignation + 1;
      }

      if (nextDesignation > 99999) {
        throw new Error('ISRC designation number exhausted for this registrant/year');
      }

      const designation = nextDesignation.toString().padStart(5, '0');
      const isrc = `${cc}${rc}${yr}${designation}`;

      await db.insert(isrcRegistry).values({
        code: isrc,
        userId: options?.userId || 'system',
        trackId: options?.trackId || null,
        countryCode: cc,
        registrantCode: rc,
        year: parseInt(yr, 10),
        designation: parseInt(designation, 10),
        metadata: options?.metadata || {},
        status: 'reserved',
        issuedAt: new Date()
      });

      logger.info(`Generated ISRC: ${this.formatISRC(isrc)} for user ${options?.userId || 'system'}`);
      return isrc;
    } catch (error) {
      logger.error('Error generating ISRC:', error);
      throw new Error('Failed to generate ISRC');
    }
  }

  formatISRC(isrc: string): string {
    const clean = isrc.replace(/[-\s]/g, '').toUpperCase();
    if (clean.length !== 12) return isrc;
    return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5, 7)}-${clean.slice(7, 12)}`;
  }

  formatUPC(upc: string): string {
    const clean = upc.replace(/[-\s]/g, '');
    if (clean.length !== 12) return upc;
    return clean;
  }

  async reserveISRCBatch(
    count: number,
    countryCode: string = this.defaultCountryCode,
    registrantCode: string = this.defaultRegistrantCode,
    options?: IdentifierGenerationOptions
  ): Promise<string[]> {
    if (count < 1 || count > 100) {
      throw new Error('Batch size must be between 1 and 100');
    }

    const isrcs: string[] = [];
    const year = new Date().getFullYear();

    for (let i = 0; i < count; i++) {
      const isrc = await this.generateISRC(countryCode, registrantCode, year, options);
      isrcs.push(isrc);
    }

    logger.info(`Reserved batch of ${count} ISRCs for user ${options?.userId || 'system'}`);
    return isrcs;
  }

  async reserveUPCBatch(
    count: number,
    options: IdentifierGenerationOptions
  ): Promise<string[]> {
    if (count < 1 || count > 50) {
      throw new Error('Batch size must be between 1 and 50');
    }

    const upcs: string[] = [];

    for (let i = 0; i < count; i++) {
      const upc = await this.generateUPC(options);
      upcs.push(upc);
    }

    logger.info(`Reserved batch of ${count} UPCs for user ${options.userId}`);
    return upcs;
  }

  async getISRCInfo(isrc: string): Promise<{
    exists: boolean;
    info?: {
      userId: string;
      trackId: string | null;
      countryCode: string;
      registrantCode: string;
      year: number;
      designation: number;
      issuedAt: Date;
      status: string;
    };
  }> {
    const cleanISRC = isrc.replace(/[-\s]/g, '').toUpperCase();
    
    const record = await db.select()
      .from(isrcRegistry)
      .where(eq(isrcRegistry.code, cleanISRC))
      .limit(1);

    if (record.length === 0) {
      return { exists: false };
    }

    const r = record[0];
    return {
      exists: true,
      info: {
        userId: r.userId,
        trackId: r.trackId,
        countryCode: r.countryCode,
        registrantCode: r.registrantCode,
        year: r.year,
        designation: r.designation,
        issuedAt: r.issuedAt,
        status: r.status
      }
    };
  }

  async getUPCInfo(upc: string): Promise<{
    exists: boolean;
    info?: {
      userId: string;
      releaseId: string | null;
      issuedAt: Date;
      status: string;
    };
  }> {
    const cleanUPC = upc.replace(/[-\s]/g, '');
    
    const record = await db.select()
      .from(upcRegistry)
      .where(eq(upcRegistry.code, cleanUPC))
      .limit(1);

    if (record.length === 0) {
      return { exists: false };
    }

    const r = record[0];
    return {
      exists: true,
      info: {
        userId: r.userId,
        releaseId: r.releaseId,
        issuedAt: r.issuedAt,
        status: r.status
      }
    };
  }

  async assignISRCToTrack(isrc: string, trackId: string): Promise<boolean> {
    const cleanISRC = isrc.replace(/[-\s]/g, '').toUpperCase();
    
    const result = await db.update(isrcRegistry)
      .set({
        trackId,
        status: 'assigned'
      })
      .where(eq(isrcRegistry.code, cleanISRC));

    return true;
  }

  async assignUPCToRelease(upc: string, releaseId: string): Promise<boolean> {
    const cleanUPC = upc.replace(/[-\s]/g, '');
    
    const result = await db.update(upcRegistry)
      .set({
        releaseId,
        status: 'assigned'
      })
      .where(eq(upcRegistry.code, cleanUPC));

    return true;
  }

  async getUserISRCs(userId: string): Promise<Array<{
    code: string;
    formatted: string;
    trackId: string | null;
    status: string;
    issuedAt: Date;
  }>> {
    const records = await db.select()
      .from(isrcRegistry)
      .where(eq(isrcRegistry.userId, userId))
      .orderBy(desc(isrcRegistry.issuedAt));

    return records.map(r => ({
      code: r.code,
      formatted: this.formatISRC(r.code),
      trackId: r.trackId,
      status: r.status,
      issuedAt: r.issuedAt
    }));
  }

  async getUserUPCs(userId: string): Promise<Array<{
    code: string;
    releaseId: string | null;
    status: string;
    issuedAt: Date;
  }>> {
    const records = await db.select()
      .from(upcRegistry)
      .where(eq(upcRegistry.userId, userId))
      .orderBy(desc(upcRegistry.issuedAt));

    return records.map(r => ({
      code: r.code,
      releaseId: r.releaseId,
      status: r.status,
      issuedAt: r.issuedAt
    }));
  }

  getValidCountryCodes(): string[] {
    return VALID_COUNTRY_CODES;
  }

  getValidGenres(): string[] {
    return VALID_GENRES;
  }

  isValidCountryCode(code: string): boolean {
    return VALID_COUNTRY_CODES.includes(code.toUpperCase());
  }

  isValidGenre(genre: string): boolean {
    return VALID_GENRES.some(g => 
      g.toLowerCase() === genre.toLowerCase()
    );
  }

  private generateRandomDigits(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 10).toString();
    }
    return result;
  }
}

export const identifierService = new IdentifierService();
