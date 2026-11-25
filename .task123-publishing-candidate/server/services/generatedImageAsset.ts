import { createHash } from "node:crypto";
import { storageService } from "./storageService.js";
import { authorizeAudioSource } from "./audioSourceAuthorization.js";
import { validateGeneratedArtifact } from "./generatedArtifactValidation.js";
import { getMaxcoreGenerationHeaders, getMaxcoreOrigin } from "./maxcoreConnector.js";

export function generatedImageUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const outputs = Array.isArray(record.outputs) ? record.outputs : [];
  return [record.url, record.image_url, record.path,
    ...outputs.map(output => output && typeof output === "object" ? output.url : undefined)]
    .find((url): url is string => typeof url === "string" && !!url.trim());
}

export async function persistGeneratedImage(rawUrl: string, owner: string, deps: {
  fetchImpl?: typeof fetch;
  storage?: typeof storageService;
  authorize?: typeof authorizeAudioSource;
} = {}) {
  if (!owner || !/^[A-Za-z0-9_-]{1,256}$/.test(owner)) throw new Error("Generated image owner required");
  const store = deps.storage ?? storageService;
  let key: string | undefined;
  let bytes: Buffer;
  if (rawUrl.startsWith("/api/storage/file/")) {
    key = decodeURIComponent(rawUrl.slice("/api/storage/file/".length));
    if (!key.startsWith(`users/${owner}/`) || /[\\\0%?#]/.test(key) || key.split("/").includes("..")) {
      throw new Error("Generated image ownership mismatch");
    }
    await (deps.authorize ?? authorizeAudioSource)(rawUrl, owner);
    bytes = await store.downloadFile(key);
  } else {
    const origin = getMaxcoreOrigin();
    const url = new URL(rawUrl, origin);
    if (url.origin !== new URL(origin).origin || !/^\/uploads\/images\/[A-Za-z0-9._-]+$/.test(url.pathname) ||
        url.username || url.password || url.search || url.hash) {
      throw new Error("MaxCore image URL is not an allowed /uploads/images asset");
    }
    const response = await (deps.fetchImpl ?? fetch)(url, {
      headers: { ...getMaxcoreGenerationHeaders(), "X-MaxCore-User-Id": owner },
      redirect: "manual", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || Number(response.headers.get("content-length")) > 10 * 1024 * 1024) {
      throw new Error("Generated image download failed or exceeded its limit");
    }
    const chunks: Buffer[] = []; let size = 0;
    if (!response.body) throw new Error("Generated image response was empty");
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 10 * 1024 * 1024) throw new Error("Generated image exceeds the 10 MB limit");
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length < 32 || bytes.length > 10 * 1024 * 1024) throw new Error("Invalid generated image size");
  const actual = await validateGeneratedArtifact(bytes, "image");
  const format = ({ png: "png", mjpeg: "jpg", webp: "webp", gif: "gif" } as Record<string, string>)[actual.codec];
  if (!format || !actual.width || !actual.height) throw new Error("Unsupported encoded image");
  if (!key) {
    const digest = createHash("sha256").update(bytes).digest("hex");
    key = await store.uploadGeneratedFile(bytes, owner, "generated-images", `${digest}.${format}`,
      format === "jpg" ? "image/jpeg" : `image/${format}`);
    if (!key.startsWith(`users/${owner}/`)) throw new Error("Generated image storage ownership mismatch");
    const readback = await store.downloadFile(key);
    if (readback.length !== bytes.length || createHash("sha256").update(readback).digest("hex") !== digest) {
      throw new Error("Generated image read-back mismatch");
    }
  }
  return { url: `/api/storage/file/${encodeURIComponent(key)}`, width: actual.width,
    height: actual.height, format, validation: { artifact_validated: true } };
}
