import { randomUUID } from "node:crypto";

/**
 * Generate collision-resistant hybrid keys without allowing a caller-provided
 * folder to escape its authenticated user's namespace. Existing keys are not
 * rewritten; this affects only new uploads.
 */
export function generateHybridFileKey(
  userId: string,
  fileName: string,
  folder?: string,
): string {
  if (
    typeof userId !== "string" || !userId ||
    userId === "." || userId === ".." ||
    /[\\/\0]/.test(userId)
  ) {
    throw new Error("Invalid hybrid storage user namespace");
  }
  if (typeof fileName !== "string" || !fileName.trim()) {
    throw new Error("Invalid hybrid storage file name");
  }
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (safeName === "." || safeName === "..") {
    throw new Error("Invalid hybrid storage file name");
  }

  const parts = folder === undefined || folder === "" ? [] : folder.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." ||
      /[\\%\0]/.test(part))) {
    throw new Error("Invalid hybrid storage folder");
  }
  const safeFolder = parts.map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_"));
  const prefix = safeFolder.length ? `${safeFolder.join("/")}/` : "";
  return `${userId}/${prefix}${randomUUID()}-${safeName}`;
}
