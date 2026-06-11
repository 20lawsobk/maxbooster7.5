import { brotliCompress, constants as zlibConstants } from "zlib";
import { promisify } from "util";
import type { Request, Response, NextFunction } from "express";

const brotliCompressAsync = promisify(brotliCompress);

const COMPRESSIBLE_MIME_PATTERN =
  /^(text\/|application\/(json|javascript|xml|x-www-form-urlencoded|manifest\+json)|image\/svg)/;

const MIN_SIZE = 256;

/**
 * Brotli compression middleware for Express.
 *
 * Runs BEFORE the gzip `compression` middleware.  When the client advertises
 * `Accept-Encoding: br` (all modern browsers do), this middleware intercepts
 * the outgoing JSON/text response, compresses it with Brotli quality-4 (fast
 * path — same latency budget as gzip-6 but 15-25 % smaller), then writes the
 * compressed bytes directly.  If brotli is unavailable or the client does not
 * support it, the response passes through unchanged and the downstream gzip
 * middleware handles it as normal.
 *
 * Safety guarantees:
 * - Idempotent: skips responses already carrying `Content-Encoding`
 * - Skips HEAD requests, streaming responses (res?.write called before res?.json),
 *   and non-compressible MIME types
 * - Falls back to original send on any compression error
 */
export function brotliMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req?.method === "HEAD") {
      return next();
    }

    const acceptEncoding = req?.headers["accept-encoding"] || "";
    if (!acceptEncoding?.includes("br")) {
      return next();
    }

    res?.setHeader("Vary", "Accept-Encoding");

    const originalJson = res?.json.bind(res);

    res.json = function (body: unknown): Response {
      if (res?.headersSent) {
        return originalJson(body);
      }

      const existingEncoding = res?.getHeader("Content-Encoding") as
        | string
        | undefined;
      if (existingEncoding) {
        return originalJson(body);
      }

      const contentType =
        (res?.getHeader("Content-Type") as string | undefined) ??
        "application/json";
      if (!COMPRESSIBLE_MIME_PATTERN?.test(contentType)) {
        return originalJson(body);
      }

      const json = JSON?.stringify(body);
      if (json?.length < MIN_SIZE) {
        return originalJson(body);
      }

      const inputBuf = Buffer?.from(json, "utf8");

      brotliCompressAsync(inputBuf, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
          [zlibConstants.BROTLI_PARAM_SIZE_HINT]: inputBuf?.length,
        },
      })
        .then((compressed) => {
          if (res?.headersSent) return;
          res?.setHeader("Content-Encoding", "br");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res?.setHeader("Content-Length", compressed?.length);
          res?.status(res?.statusCode).end(compressed);
        })
        .catch(() => {
          if (!res?.headersSent) {
            originalJson(body);
          }
        });

      return res;
    };

    next();
  };
}
