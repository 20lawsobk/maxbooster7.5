export function precompressPublicAssets(
  root: string,
  options?: { concurrency?: number },
): Promise<{ sourceFiles: number; filesWritten: number; filesVerified: number }>;
