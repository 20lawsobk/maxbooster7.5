import type { Request, Response, NextFunction } from 'express';

const PRESIGNED_URL_THRESHOLD_BYTES = 5 * 1024 * 1024;

/**
 * Rejects direct Express uploads that exceed the threshold and tells
 * the client to use the presigned URL flow instead.  Attach BEFORE
 * any multer middleware on heavy upload routes so Express never
 * buffers the body for large files.
 */
export function requirePresignedForLargeUploads(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
  if (contentLength > PRESIGNED_URL_THRESHOLD_BYTES) {
    res.status(413).json({
      error: 'Payload Too Large',
      message: `Files larger than ${PRESIGNED_URL_THRESHOLD_BYTES / 1024 / 1024}MB must be uploaded via the presigned URL flow.`,
      presignedUrlEndpoint: '/api/uploads/request-url',
      sizeLimitBytes: PRESIGNED_URL_THRESHOLD_BYTES,
      receivedBytes: contentLength,
    });
    return;
  }
  next();
}
