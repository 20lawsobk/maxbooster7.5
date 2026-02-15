import { storage } from '../storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { InsertUploadSession } from '@shared/schema';
import { storageService } from './storageService.js';
import { logger } from '../logger.js';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const TEMP_DIR = path.join(process.cwd(), 'tmp', 'uploads', 'sessions');

/**
 * TODO: Add function documentation
 */
async function ensureTempDir(sessionId: string): Promise<string> {
  const sessionDir = path.join(TEMP_DIR, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  return sessionDir;
}

/**
 * TODO: Add function documentation
 */
export async function initializeSession(
  userId: string,
  filename: string,
  totalSize: number
): Promise<{ sessionId: string; totalChunks: number; chunkSize: number }> {
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

  const session = await storage.createUploadSession({
    userId,
    filename,
    totalSize,
    chunkSize: CHUNK_SIZE,
    totalChunks,
    uploadedChunks: 0,
    chunks: [],
    status: 'pending',
  });

  await ensureTempDir(session.id);

  return {
    sessionId: session.id,
    totalChunks,
    chunkSize: CHUNK_SIZE,
  };
}

/**
 * TODO: Add function documentation
 */
export async function uploadChunk(
  sessionId: string,
  chunkIndex: number,
  chunkData: Buffer,
  chunkHash: string
): Promise<{ success: boolean; uploadedChunks: number; totalChunks: number }> {
  const session = await storage.getUploadSession(sessionId);

  if (!session) {
    throw new Error('Upload session not found');
  }

  if (session.status === 'completed' || session.status === 'aborted') {
    throw new Error(`Upload session is ${session.status}`);
  }

  const actualHash = crypto.createHash('sha256').update(chunkData).digest('hex');
  if (actualHash !== chunkHash) {
    throw new Error('Chunk hash verification failed');
  }

  const sessionDir = await ensureTempDir(sessionId);
  const chunkPath = path.join(sessionDir, `chunk_${chunkIndex.toString().padStart(6, '0')}`);

  await fs.writeFile(chunkPath, chunkData);

  const existingChunks = session.chunks || [];
  const chunkExists = existingChunks.some((c: unknown) => c.index === chunkIndex);

  if (!chunkExists) {
    existingChunks.push({
      index: chunkIndex,
      hash: chunkHash,
      offset: chunkIndex * session.chunkSize,
      size: chunkData.length,
    });
  }

  const updatedSession = await storage.updateUploadSession(sessionId, {
    chunks: existingChunks,
    uploadedChunks: existingChunks.length,
    status: 'uploading',
  });

  return {
    success: true,
    uploadedChunks: updatedSession.uploadedChunks,
    totalChunks: updatedSession.totalChunks,
  };
}

/**
 * TODO: Add function documentation
 */
export async function getSessionStatus(sessionId: string): Promise<{
  status: string;
  uploadedChunks: number;
  totalChunks: number;
  progress: number;
  filename: string;
}> {
  const session = await storage.getUploadSession(sessionId);

  if (!session) {
    throw new Error('Upload session not found');
  }

  const progress = (session.uploadedChunks / session.totalChunks) * 100;

  return {
    status: session.status,
    uploadedChunks: session.uploadedChunks,
    totalChunks: session.totalChunks,
    progress,
    filename: session.filename,
  };
}

/**
 * TODO: Add function documentation
 */
export async function finalizeUpload(sessionId: string): Promise<{
  success: boolean;
  filePath: string;
  fileHash: string;
}> {
  const session = await storage.getUploadSession(sessionId);

  if (!session) {
    throw new Error('Upload session not found');
  }

  if (session.uploadedChunks !== session.totalChunks) {
    throw new Error('Not all chunks have been uploaded');
  }

  const sessionDir = path.join(TEMP_DIR, sessionId);
  const tempAssemblyPath = path.join(sessionDir, 'assembled_file');

  const chunks = [...(session.chunks || [])].sort((a: unknown, b: unknown) => a.index - b.index);
  const writeStream = await fs.open(tempAssemblyPath, 'w');
  const hash = crypto.createHash('sha256');

  try {
    // Assemble all chunks into a single file
    for (const chunk of chunks) {
      const chunkPath = path.join(sessionDir, `chunk_${chunk.index.toString().padStart(6, '0')}`);
      const chunkData = await fs.readFile(chunkPath);

      const chunkHash = crypto.createHash('sha256').update(chunkData).digest('hex');
      if (chunkHash !== chunk.hash) {
        throw new Error(`Chunk ${chunk.index} hash verification failed`);
      }

      hash.update(chunkData);
      await writeStream.write(chunkData);
    }

    const fileHash = hash.digest('hex');

    await writeStream.close();

    // Upload assembled file to storageService
    const fileBuffer = await fs.readFile(tempAssemblyPath);
    const timestamp = Date.now();
    const ext = path.extname(session.filename);
    const basename = path.basename(session.filename, ext);
    const sanitizedBasename = basename.replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFilename = `${timestamp}_${sanitizedBasename}${ext}`;

    const storageKey = await storageService.uploadFile(
      fileBuffer,
      'uploads',
      finalFilename,
      'application/octet-stream'
    );

    await storage.updateUploadSession(sessionId, {
      status: 'completed',
      finalPath: storageKey,
      fileHash,
      completedAt: new Date(),
    });

    // Clean up session directory
    await fs.rm(sessionDir, { recursive: true, force: true });

    logger.info(`✅ Chunked upload completed: ${storageKey}`);

    return {
      success: true,
      filePath: storageKey,
      fileHash,
    };
  } catch (error: unknown) {
    await writeStream.close();

    await storage.updateUploadSession(sessionId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * TODO: Add function documentation
 */
export async function abortUpload(sessionId: string): Promise<void> {
  const session = await storage.getUploadSession(sessionId);

  if (!session) {
    throw new Error('Upload session not found');
  }

  const sessionDir = path.join(TEMP_DIR, sessionId);
  await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});

  await storage.updateUploadSession(sessionId, {
    status: 'aborted',
  });
}

/**
 * TODO: Add function documentation
 */
export async function resumeUpload(sessionId: string): Promise<{
  missingChunks: number[];
  uploadedChunks: number;
  totalChunks: number;
}> {
  const session = await storage.getUploadSession(sessionId);

  if (!session) {
    throw new Error('Upload session not found');
  }

  if (session.status === 'completed') {
    throw new Error('Upload session is already completed');
  }

  if (session.status === 'aborted') {
    throw new Error('Upload session was aborted');
  }

  const uploadedIndices = (session.chunks || []).map((c: unknown) => c.index);
  const missingChunks = [];

  for (let i = 0; i < session.totalChunks; i++) {
    if (!uploadedIndices.includes(i)) {
      missingChunks.push(i);
    }
  }

  return {
    missingChunks,
    uploadedChunks: session.uploadedChunks,
    totalChunks: session.totalChunks,
  };
}
