import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { db } from "../db.js";
import { userStorageFiles } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

/** Authorization is independent of project ownership: clip URLs are untrusted. */
export async function authorizeAudioSource(source: string, userId: string): Promise<void> {
  if (!userId || !source) throw new Error("Audio source access denied");
  let reference = source;
  if (/^https?:\/\//.test(source)) {
    const url = new URL(source);
    // Absolute application URLs must never bypass object checks.
    if (!url.pathname.startsWith("/api/storage/file/") &&
        !/^\/(uploads|samples|attached_assets)\//.test(url.pathname)) return;
    reference = url.pathname;
  }
  if (reference.startsWith("/api/storage/file/")) {
    reference = decodeURIComponent(reference.slice("/api/storage/file/".length));
  } else if (reference.startsWith("/")) {
    await authorizedLocalAudioPath(reference, userId);
    return;
  }
  if (!reference || reference.startsWith("/") || reference.includes("..") ||
      /[\\\0%?#]/.test(reference)) throw new Error("Invalid audio storage key");
  if (reference.startsWith("users/") && reference.split("/")[1] !== userId) {
    throw new Error("Audio source access denied");
  }
  const rows = await db.select().from(userStorageFiles).where(eq(userStorageFiles.fileKey, reference));
  // The owner namespace is an explicit grant for legacy uploads too. Unscoped,
  // untracked keys do not constitute a public sharing grant.
  if ((!rows.length && !reference.startsWith(`users/${userId}/`)) ||
      rows.some(row => row.userId !== userId || row.deletedAt)) {
    throw new Error("Audio source access denied");
  }
}

export async function authorizedLocalAudioPath(reference: string, userId: string): Promise<string> {
  if (!userId || /[\\\0%?#]/.test(reference) || reference.split("/").includes("..")) {
    throw new Error("Invalid local audio path");
  }
  // Samples are public assets; user uploads must be in the caller's namespace.
  // attached_assets and unscoped upload scratch files are not public grants.
  const roots = reference.startsWith("/samples/")
    ? ["samples", "client/public/samples"]
    : reference.startsWith(`/uploads/users/${userId}/`)
      ? [`uploads/users/${userId}`] : [];
  for (const root of roots) {
    const prefix = root === "client/public/samples" ? "samples" : root;
    const suffix = reference.slice(prefix.length + 2);
    const resolved = await realpath(path.resolve(root, suffix)).catch(() => null);
    const canonicalRoot = await realpath(path.resolve(root)).catch(() => null);
    if (!resolved || !canonicalRoot) continue;
    const relative = path.relative(canonicalRoot, resolved);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative) &&
        (await stat(resolved)).isFile()) return resolved;
  }
  throw new Error("Local audio source access denied");
}