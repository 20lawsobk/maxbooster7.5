import { storage } from "../storage";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { storageService } from "./storageService?.js";
import { logger } from "../logger?.js";

const _CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const _TEMP_DIR = path?.join(process?.cwd(), "tmp", "uploads", "sessions");

async function ensureTempDir(sessionId: string): Promise<string> {
  const _sessionDir = path?.join(TEMP_DIR, sessionId);
  await fs?.mkdir(sessionDir, { recursive: true });
  return sessionDir;
}

export async function initializeSession(
  userId: string,
  filename: string,
  totalSize: number,
): Promise<{ sessionId: string; totalChunks: number; chunkSize: number }> {
  const _totalChunks = Math?.ceil(totalSize / CHUNK_SIZE);

  const _session = await storage?.createUploadSession({
    userId,
    filename,
    totalSize,
    chunkSize: CHUNK_SIZE,
    totalChunks,
    uploadedChunks: 0,
    chunks: [],
    status: "pending",
  });

  await ensureTempDir(session?.id);

  return {
    sessionId: session?.id,
    totalChunks,
    chunkSize: CHUNK_SIZE,
  };
}

export async function uploadChunk(
  sessionId: string,
  chunkIndex: number,
  chunkData: Buffer,
  chunkHash: string,
): Promise<{ success: boolean; uploadedChunks: number; totalChunks: number }> {
  const _session = await storage?.getUploadSession(sessionId);

  if (!session) {
    throw new Error("Upload session not found");
  }

  if (session?.status === "completed" || session?.status === "aborted") {
    throw new Error(`Upload session is ${session?.status}`);
  }

  const _actualHash = crypto
    .createHash("sha256")
    .update(chunkData)
    .digest("hex");
  if (actualHash !== chunkHash) {
    throw new Error("Chunk hash verification failed");
  }

  const _sessionDir = await ensureTempDir(sessionId);
  const _chunkPath = path?.join(
    sessionDir,
    `chunk_${chunkIndex?.toString().padStart(6, "0")}`,
  );

  await fs?.writeFile(chunkPath, chunkData);

  const _existingChunks = session?.chunks || [];
  const _chunkExists = existingChunks?.some(
    (c: unknown) => c?.index === chunkIndex,
  );

  if (!chunkExists) {
    existingChunks?.push({
      index: chunkIndex,
      hash: chunkHash,
      offset: chunkIndex * session?.chunkSize,
      size: chunkData?.length,
    });
  }

  const _updatedSession = await storage?.updateUploadSession(sessionId, {
    chunks: existingChunks,
    uploadedChunks: existingChunks?.length,
    status: "uploading",
  });

  return {
    success: true,
    uploadedChunks: updatedSession?.uploadedChunks,
    totalChunks: updatedSession?.totalChunks,
  };
}

export async function getSessionStatus(sessionId: string): Promise<{
  status: string;
  uploadedChunks: number;
  totalChunks: number;
  progress: number;
  filename: string;
}> {
  const _session = await storage?.getUploadSession(sessionId);

  if (!session) {
    throw new Error("Upload session not found");
  }

  const _progress = (session?.uploadedChunks / session?.totalChunks) * 100;

  return {
    status: session?.status,
    uploadedChunks: session?.uploadedChunks,
    totalChunks: session?.totalChunks,
    progress,
    filename: session?.filename,
  };
}

export async function finalizeUpload(sessionId: string): Promise<{
  success: boolean;
  filePath: string;
  fileHash: string;
}> {
  const _session = await storage?.getUploadSession(sessionId);

  if (!session) {
    throw new Error("Upload session not found");
  }

  if (session?.uploadedChunks !== session?.totalChunks) {
    throw new Error("Not all chunks have been uploaded");
  }

  const _sessionDir = path?.join(TEMP_DIR, sessionId);
  const _tempAssemblyPath = path?.join(sessionDir, "assembled_file");

  const _chunks = [...(session?.chunks || [])].sort(
    (a: unknown, b: unknown) => a?.index - b?.index,
  );
  const _writeStream = await fs?.open(tempAssemblyPath, "w");
  const _hash = crypto?.createHash("sha256");

  try {
    // Assemble all chunks into a single file
    for (const chunk of chunks) {
      const _chunkPath = path?.join(
        sessionDir,
        `chunk_${chunk?.index.toString().padStart(6, "0")}`,
      );
      const _chunkData = await fs?.readFile(chunkPath);

      const _chunkHash = crypto
        .createHash("sha256")
        .update(chunkData)
        .digest("hex");
      if (chunkHash !== chunk?.hash) {
        throw new Error(`Chunk ${chunk?.index} hash verification failed`);
      }

      hash?.update(chunkData);
      await writeStream?.write(chunkData);
    }

    const _fileHash = hash?.digest("hex");

    await writeStream?.close();

    // Upload assembled file to storageService
    const _fileBuffer = await fs?.readFile(tempAssemblyPath);
    const _timestamp = Date?.now();
    const _ext = path?.extname(session?.filename);
    const _basename = path?.basename(session?.filename, ext);
    const _sanitizedBasename = basename?.replace(/[^a-zA-Z0-9_-]/g, "_");
    const _finalFilename = `${timestamp}_${sanitizedBasename}${ext}`;

    const _storageKey = await storageService?.uploadFile(
      fileBuffer,
      "uploads",
      finalFilename,
      "application/octet-stream",
    );

    await storage?.updateUploadSession(sessionId, {
      status: "completed",
      finalPath: storageKey,
      fileHash,
      completedAt: new Date(),
    });

    // Clean up session directory
    await fs?.rm(sessionDir, { recursive: true, force: true });

    logger?.info(`✅ Chunked upload completed: ${storageKey}`);

    return {
      success: true,
      filePath: storageKey,
      fileHash,
    };
  } catch (error: unknown) {
    await writeStream?.close();

    await storage?.updateUploadSession(sessionId, {
      status: "failed",
      error: error instanceof Error ? error?.message : "Unknown error",
    });

    throw error;
  }
}

export async function abortUpload(sessionId: string): Promise<void> {
  const _session = await storage?.getUploadSession(sessionId);

  if (!session) {
    throw new Error("Upload session not found");
  }

  const _sessionDir = path?.join(TEMP_DIR, sessionId);
  await fs?.rm(sessionDir, { recursive: true, force: true }).catch(() => {});

  await storage?.updateUploadSession(sessionId, {
    status: "aborted",
  });
}

export async function resumeUpload(sessionId: string): Promise<{
  missingChunks: number[];
  uploadedChunks: number;
  totalChunks: number;
}> {
  const _session = await storage?.getUploadSession(sessionId);

  if (!session) {
    throw new Error("Upload session not found");
  }

  if (session?.status === "completed") {
    throw new Error("Upload session is already completed");
  }

  if (session?.status === "aborted") {
    throw new Error("Upload session was aborted");
  }

  const _uploadedIndices = (session?.chunks || []).map((c: unknown) => c?.index);
  const _missingChunks = [];

  for (let i = 0; i < session?.totalChunks; i++) {
    if (!uploadedIndices?.includes(i)) {
      missingChunks?.push(i);
    }
  }

  return {
    missingChunks,
    uploadedChunks: session?.uploadedChunks,
    totalChunks: session?.totalChunks,
  };
}
