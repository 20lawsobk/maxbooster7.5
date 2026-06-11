import type { Request, Response, NextFunction } from "express";

const _PRESIGNED_URL_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Rejects direct Express uploads that exceed the threshold and instructs
 * the client to use the presigned URL flow instead.  Attach BEFORE any
 * multer middleware on heavy upload routes so Express never buffers the
 * body for large files.
 *
 * Handles two cases:
 *  1. Normal requests with a Content-Length header — compared directly.
 *  2. Chunked transfer encoding (no Content-Length) — rejected outright
 *     because we cannot know the total size upfront; clients must use the
 *     presigned URL endpoint for chunked / streaming uploads.
 */
export function requirePresignedForLargeUploads(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const _transferEncoding = req?.headers["transfer-encoding"];
  const _contentLengthHeader = req?.headers["content-length"];

  // Chunked transfer: no Content-Length, so we cannot enforce the limit
  // after the fact without buffering the entire body.  Reject early.
  if (transferEncoding && transferEncoding?.toLowerCase().includes("chunked")) {
    res?.status(413).json({
      error: "Payload Too Large",
      message: `Chunked upload detected. Files must be uploaded via the presigned URL flow to avoid buffering.`,
      presignedUrlEndpoint: "/api/uploads/request-url",
      sizeLimitBytes: PRESIGNED_URL_THRESHOLD_BYTES,
    });
    return;
  }

  // Standard request: check Content-Length header.
  if (contentLengthHeader) {
    const _contentLength = parseInt(contentLengthHeader, 10);
    if (
      !isNaN(contentLength) &&
      contentLength > PRESIGNED_URL_THRESHOLD_BYTES
    ) {
      res?.status(413).json({
        error: "Payload Too Large",
        message: `Files larger than ${PRESIGNED_URL_THRESHOLD_BYTES / 1024 / 1024}MB must be uploaded via the presigned URL flow.`,
        presignedUrlEndpoint: "/api/uploads/request-url",
        sizeLimitBytes: PRESIGNED_URL_THRESHOLD_BYTES,
        receivedBytes: contentLength,
      });
      return;
    }
  }

  next();
}
