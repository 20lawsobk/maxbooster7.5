import { storage } from '../storage';
import * as crypto from 'crypto';

/**
 * TODO: Add function documentation
 */
export async function generateISRC(
  userId: string,
  trackId: string,
  artist: string,
  title: string
): Promise<string> {
  const metadata = {
    artist,
    title,
    timestamp: Date.now(),
  };

  const isrc = await storage.generateISRC(userId, trackId, metadata);

  return isrc;
}

/**
 * TODO: Add function documentation
 */
export async function generateUPC(
  userId: string,
  releaseId: string,
  title: string
): Promise<string> {
  const metadata = {
    title,
    timestamp: Date.now(),
  };

  const upc = await storage.generateUPC(userId, releaseId, metadata);

  return upc;
}

/**
 * TODO: Add function documentation
 */
export async function verifyISRC(isrc: string): Promise<{
  valid: boolean;
  exists: boolean;
  info?: {
    userId: string;
    trackId: string | null;
    issuedAt: Date;
  };
}> {
  const isrcRegex = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;

  if (!isrcRegex.test(isrc)) {
    return {
      valid: false,
      exists: false,
    };
  }

  const record = await storage.getISRC(isrc);

  if (!record) {
    return {
      valid: true,
      exists: false,
    };
  }

  return {
    valid: true,
    exists: true,
    info: {
      userId: record.userId,
      trackId: record.trackId,
      issuedAt: record.issuedAt,
    },
  };
}

/**
 * TODO: Add function documentation
 */
export async function verifyUPC(upc: string): Promise<{
  valid: boolean;
  exists: boolean;
  info?: {
    userId: string;
    releaseId: string | null;
    issuedAt: Date;
  };
}> {
  const upcRegex = /^\d{12}$/;

  if (!upcRegex.test(upc)) {
    return {
      valid: false,
      exists: false,
    };
  }

  const upcWithoutCheck = upc.slice(0, 11);
  const providedCheckDigit = upc[11];
  const calculatedCheckDigit = calculateUPCCheckDigit(upcWithoutCheck);

  if (providedCheckDigit !== calculatedCheckDigit) {
    return {
      valid: false,
      exists: false,
    };
  }

  const record = await storage.getUPC(upc);

  if (!record) {
    return {
      valid: true,
      exists: false,
    };
  }

  return {
    valid: true,
    exists: true,
    info: {
      userId: record.userId,
      releaseId: record.releaseId,
      issuedAt: record.issuedAt,
    },
  };
}

/**
 * TODO: Add function documentation
 */
function calculateUPCCheckDigit(upc: string): string {
  let sum = 0;
  for (let i = 0; i < upc.length; i++) {
    const digit = parseInt(upc[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit.toString();
}
