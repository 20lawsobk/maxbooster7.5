/**
 * Hybrid uploads accept caller-provided MIME metadata. Never render active
 * content (HTML/SVG/XML/JS/PDF) as a same-origin document from a private
 * download endpoint. Only known inert media types may be previewed inline.
 */
const INLINE_MEDIA_TYPES = new Set([
  "image/avif", "image/gif", "image/jpeg", "image/png", "image/webp",
  "audio/flac", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav",
  "audio/webm", "audio/x-wav", "video/mp4", "video/ogg", "video/webm",
]);

export function classifyHybridDownloadMimeType(mimeType: unknown): {
  contentType: string;
  disposition: "inline" | "attachment";
} {
  const normalized = typeof mimeType === "string"
    ? mimeType.trim().toLowerCase()
    : "";
  if (INLINE_MEDIA_TYPES.has(normalized)) {
    return { contentType: normalized, disposition: "inline" };
  }
  // Also reject MIME parameters and unknown types rather than relying on
  // browser sniffing. The route must emit X-Content-Type-Options: nosniff.
  return { contentType: "application/octet-stream", disposition: "attachment" };
}
