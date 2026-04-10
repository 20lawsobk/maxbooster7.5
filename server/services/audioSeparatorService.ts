/**
 * Audio Separator Service
 * ========================
 * Converts an uploaded WAV beat into multiple deliverable formats:
 *   - MP3 320kbps  (all license tiers)
 *   - WAV          (already stored — premium+)
 *   - Stems        (drums, bass, melody, other — unlimited/exclusive)
 *
 * Runs asynchronously after beat upload so the HTTP response is never delayed.
 * Results are stored in the hybrid storage backend and recorded in the DB:
 *   - listings.previewUrl      → updated to the MP3 URL
 *   - listings.metadata        → mp3Key, stemsAvailable, stemCount
 *   - listing_stems rows       → one row per stem file
 *   - listing_license_tiers    → audioUrls updated for any existing tier rows
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { db } from '../db.js';
import { listings, listingStems, listingLicenseTiers } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storageService } from './storageService.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

const LOCAL_STORAGE_DIR = path.resolve('./uploads/files');
const PYTHON_SCRIPT = path.resolve('./server/services/audioSeparator.py');

/** Resolve the on-disk path of a storage key. */
function localFilePath(key: string): string {
  return path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, path.sep));
}

/** Run the Python separator script; returns parsed JSON output. */
async function runSeparator(
  inputWav: string,
  outputDir: string,
  stems: boolean,
): Promise<{ mp3: string | null; stems: Record<string, string> }> {
  const args = [PYTHON_SCRIPT, inputWav, outputDir];
  if (stems) args.push('--stems');

  const { stdout, stderr } = await execFileAsync('python3', args, {
    timeout: 10 * 60 * 1000, // 10 min hard limit
  });

  if (stderr) {
    logger.warn('[AudioSeparator] Python stderr:', stderr.slice(0, 500));
  }

  try {
    return JSON.parse(stdout.trim());
  } catch {
    throw new Error(`[AudioSeparator] Invalid JSON from separator: ${stdout.slice(0, 200)}`);
  }
}

/** Upload a local file to the storage backend and return (key, url). */
async function uploadLocalFile(
  filePath: string,
  category: string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const buffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const key = await storageService.uploadFile(buffer, category, filename, contentType);
  return { key, url: `/api/marketplace/audio/${key}` };
}

/**
 * STEM_TYPES maps stem file names → stemType values for the listing_stems table.
 * Aligned with the Unlimited/Exclusive license deliverable set.
 */
const STEM_TYPES: Record<string, string> = {
  drums: 'drums',
  bass: 'bass',
  melody: 'melody',
  other: 'other',
};

/**
 * Determine which formats to generate based on license types present on the listing.
 * Default: always produce MP3 + stems (cover all tier possibilities).
 */
function resolveModes(licenseType?: string): { mp3: boolean; stems: boolean } {
  if (!licenseType) return { mp3: true, stems: true };
  const lt = licenseType.toLowerCase();
  return {
    mp3: true, // all tiers get MP3
    stems: lt === 'unlimited' || lt === 'exclusive',
  };
}

export interface AudioSeparationResult {
  mp3Url?: string;
  mp3Key?: string;
  stemUrls?: Record<string, string>;
  stemsAvailable: boolean;
}

/**
 * Main entry point called from the upload route.
 *
 * @param listingId  UUID of the beat listing in the DB
 * @param userId     Producer's user ID
 * @param audioKey   Storage key for the uploaded WAV (e.g. "beats/uuid/filename.wav")
 * @param licenseType Primary license type from the upload form
 */
export async function processUploadedBeat(
  listingId: string,
  userId: string,
  audioKey: string,
  licenseType?: string,
): Promise<AudioSeparationResult> {
  const localWavPath = localFilePath(audioKey);

  if (!fs.existsSync(localWavPath)) {
    logger.warn(`[AudioSeparator] WAV file not found on disk: ${localWavPath}`);
    return { stemsAvailable: false };
  }

  const modes = resolveModes(licenseType);
  const tmpDir = path.join(os.tmpdir(), `audio_sep_${listingId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  logger.info(`[AudioSeparator] Processing beat ${listingId} — MP3=${modes.mp3} stems=${modes.stems}`);

  try {
    const output = await runSeparator(localWavPath, tmpDir, modes.stems);

    const result: AudioSeparationResult = { stemsAvailable: false };

    // ── Upload MP3 ─────────────────────────────────────────────────────────
    if (output.mp3 && fs.existsSync(output.mp3)) {
      const { key, url } = await uploadLocalFile(output.mp3, 'beats-mp3', 'audio/mpeg');
      result.mp3Key = key;
      result.mp3Url = url;
      logger.info(`[AudioSeparator] MP3 stored: ${key}`);
    }

    // ── Upload stems ───────────────────────────────────────────────────────
    if (modes.stems && Object.keys(output.stems).length > 0) {
      const stemUrls: Record<string, string> = {};
      const stemInserts = [];

      for (const [name, filePath] of Object.entries(output.stems)) {
        if (!fs.existsSync(filePath)) continue;
        const fileSize = fs.statSync(filePath).size;
        const { key, url } = await uploadLocalFile(filePath, 'beats-stems', 'audio/wav');
        stemUrls[name] = url;

        stemInserts.push({
          listingId,
          userId,
          stemName: name.charAt(0).toUpperCase() + name.slice(1),
          stemType: STEM_TYPES[name] ?? 'other',
          fileUrl: url,
          fileSize,
          format: 'wav',
        });
      }

      if (stemInserts.length > 0) {
        await db
          .delete(listingStems)
          .where(eq(listingStems.listingId, listingId));

        await db.insert(listingStems).values(stemInserts);
        logger.info(`[AudioSeparator] Inserted ${stemInserts.length} stems for listing ${listingId}`);
      }

      result.stemUrls = stemUrls;
      result.stemsAvailable = stemInserts.length > 0;
    }

    // ── Update listings row ────────────────────────────────────────────────
    const listingRow = await db
      .select({ metadata: listings.metadata })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    const existingMeta = (listingRow[0]?.metadata as Record<string, unknown>) ?? {};
    const updatedMeta = {
      ...existingMeta,
      mp3Key: result.mp3Key,
      mp3Url: result.mp3Url,
      stemsAvailable: result.stemsAvailable,
      stemCount: Object.keys(result.stemUrls ?? {}).length,
    };

    const updatePayload: Record<string, unknown> = { metadata: updatedMeta };
    if (result.mp3Url) {
      updatePayload.previewUrl = result.mp3Url;
    }

    await db
      .update(listings)
      .set(updatePayload as any)
      .where(eq(listings.id, listingId));

    logger.info(`[AudioSeparator] Updated listing ${listingId} metadata`);

    // ── Update any existing listingLicenseTiers rows ───────────────────────
    if (result.mp3Url || result.stemUrls) {
      const tiers = await db
        .select()
        .from(listingLicenseTiers)
        .where(eq(listingLicenseTiers.listingId, listingId));

      for (const tier of tiers) {
        const lt = (tier.licenseType ?? '').toLowerCase();
        const existingUrls = (tier.audioUrls as Record<string, string>) ?? {};
        const newUrls: Record<string, string> = { ...existingUrls };

        if (result.mp3Url) newUrls.mp3 = result.mp3Url;

        if (
          result.stemsAvailable &&
          result.stemUrls &&
          (lt === 'unlimited' || lt === 'exclusive')
        ) {
          for (const [stemName, stemUrl] of Object.entries(result.stemUrls)) {
            newUrls[`stem_${stemName}`] = stemUrl;
          }
        }

        await db
          .update(listingLicenseTiers)
          .set({ audioUrls: newUrls })
          .where(eq(listingLicenseTiers.id, tier.id));
      }

      if (tiers.length > 0) {
        logger.info(`[AudioSeparator] Updated audioUrls on ${tiers.length} license tier(s)`);
      }
    }

    return result;
  } finally {
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
