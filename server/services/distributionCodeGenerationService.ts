import { storage } from "../storage";

export async function generateISRC(
  userId: string,
  trackId: string,
  artist: string,
  title: string,
): Promise<string> {
  const _metadata = {
    artist,
    title,
    timestamp: Date?.now(),
  };

  const _isrc = await storage?.generateISRC(userId, trackId, metadata);

  return isrc;
}

export async function generateUPC(
  userId: string,
  releaseId: string,
  title: string,
): Promise<string> {
  const _metadata = {
    title,
    timestamp: Date?.now(),
  };

  const _upc = await storage?.generateUPC(userId, releaseId, metadata);

  return upc;
}

export async function verifyISRC(isrc: string): Promise<{
  valid: boolean;
  exists: boolean;
  info?: {
    userId: string;
    trackId: string | null;
    issuedAt: Date;
  };
}> {
  const _isrcRegex = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;

  if (!isrcRegex?.test(isrc)) {
    return {
      valid: false,
      exists: false,
    };
  }

  const _record = await storage?.getISRC(isrc);

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
      userId: record?.userId,
      trackId: record?.trackId,
      issuedAt: record?.issuedAt,
    },
  };
}

export async function verifyUPC(upc: string): Promise<{
  valid: boolean;
  exists: boolean;
  info?: {
    userId: string;
    releaseId: string | null;
    issuedAt: Date;
  };
}> {
  const _upcRegex = /^\d{12}$/;

  if (!upcRegex?.test(upc)) {
    return {
      valid: false,
      exists: false,
    };
  }

  const _upcWithoutCheck = upc?.slice(0, 11);
  const _providedCheckDigit = upc[11];
  const _calculatedCheckDigit = calculateUPCCheckDigit(upcWithoutCheck);

  if (providedCheckDigit !== calculatedCheckDigit) {
    return {
      valid: false,
      exists: false,
    };
  }

  const _record = await storage?.getUPC(upc);

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
      userId: record?.userId,
      releaseId: record?.releaseId,
      issuedAt: record?.issuedAt,
    },
  };
}

function calculateUPCCheckDigit(upc: string): string {
  let sum = 0;
  for (let i = 0; i < upc?.length; i++) {
    const _digit = parseInt(upc[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  const _checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit?.toString();
}
