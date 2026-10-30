import type { Request } from "express";
import fsPromises from "node:fs/promises";

/** Only paths produced by the upload middleware are admitted here. */
export function cleanupMediaUploadFiles(req: Request): Promise<void> {
  const fieldFiles = Array.isArray(req.files)
    ? req.files
    : Object.values((req.files || {}) as Record<string, Express.Multer.File[]>).flat();
  const files = [...(req.file ? [req.file] : []), ...fieldFiles];
  return Promise.all(files.map((file) => file?.path)
    .filter((filePath): filePath is string => Boolean(filePath))
    .map((filePath) => fsPromises.unlink(filePath).catch(() => {}))).then(() => undefined);
}
