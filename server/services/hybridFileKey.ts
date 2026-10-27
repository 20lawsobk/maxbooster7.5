import { randomUUID } from "node:crypto";

/** Folder names are logical key segments, never filesystem paths. */
export function isValidHybridFolder(folder: unknown): folder is string | undefined {
  if (folder === undefined || folder === "") return true;
  if (typeof folder !== "string" || folder.length > 128) return false;
  const segments = folder.split("/");
  return segments.length <= 8 && segments.every((segment) =>
    segment.length > 0 &&
    segment.length <= 64 &&
    segment !== "." &&
    !segment.includes("..") &&
    /^[a-zA-Z0-9._ -]+$/.test(segment),
  );
}

/** Generate a collision-resistant key while keeping user and folder namespaces. */
export function generateHybridFileKey(
  userId: string,
  fileName: string,
  folder?: string,
): string {
  if (typeof userId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(userId)) {
    throw new TypeError("Invalid storage owner");
  }
  if (!isValidHybridFolder(folder)) {
    throw new TypeError("Invalid storage folder");
  }
  if (typeof fileName !== "string" || !fileName.trim()) {
    throw new TypeError("Invalid storage filename");
  }
  const safeName = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, "_")
    .slice(0, 200);
  if (!safeName || safeName === ".") {
    throw new TypeError("Invalid storage filename");
  }
  const uniqueId = randomUUID().replaceAll("-", "");
  return `${userId}/${folder ? `${folder}/` : ""}${uniqueId}-${safeName}`;
}
