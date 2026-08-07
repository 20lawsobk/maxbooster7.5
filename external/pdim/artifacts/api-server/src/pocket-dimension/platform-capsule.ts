/**
 * PLATFORM CAPSULE SYSTEM
 *
 * Packages the entire Max Booster PDIM platform into a Pocket Dimension.
 * The platform becomes a self-contained, compressed, portable capsule
 * that can be extracted and run anywhere.
 *
 * "Put the universe in your pocket"
 */

import { logger } from "../logger.js";
import { pocketManager, PocketDimension } from "./index.js";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { createReadStream } from "fs";
import { Readable } from "stream";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CapsuleMetadata {
  id: string;
  version: string;
  name: string;
  description: string;
  createdAt: Date;
  platform: {
    name: string;
    version: string;
    nodeVersion: string;
  };
  contents: {
    totalFiles: number;
    totalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
  checksums: {
    manifest: string;
    content: string;
  };
  encrypted: boolean;
}

export interface CapsuleManifest {
  files: Array<{
    path: string;
    size: number;
    hash: string;
    type: "source" | "asset" | "config" | "data" | "binary";
  }>;
  directories: string[];
  entryPoint: string;
  startCommand: string;
  environment: Record<string, string>;
}

export interface CapsuleBuildOptions {
  version: string;
  description?: string;
  includeNodeModules?: boolean;
  includeDist?: boolean;
  includeTests?: boolean;
  encrypt?: boolean;
  encryptionKey?: string;
  excludePatterns?: string[];
}

const FILE_TYPES: Record<
  string,
  "source" | "asset" | "config" | "data" | "binary"
> = {
  ".ts": "source",
  ".tsx": "source",
  ".js": "source",
  ".jsx": "source",
  ".css": "source",
  ".html": "source",
  ".scss": "source",
  ".json": "config",
  ".yaml": "config",
  ".yml": "config",
  ".env": "config",
  ".md": "data",
  ".txt": "data",
  ".png": "asset",
  ".jpg": "asset",
  ".jpeg": "asset",
  ".gif": "asset",
  ".svg": "asset",
  ".ico": "asset",
  ".webp": "asset",
  ".mp3": "asset",
  ".wav": "asset",
  ".mp4": "asset",
  ".webm": "asset",
  ".woff": "asset",
  ".woff2": "asset",
  ".ttf": "asset",
  ".node": "binary",
  ".so": "binary",
  ".dll": "binary",
};

const DEFAULT_EXCLUDE = [
  "node_modules",
  ".git",
  "dist",
  ".pnpm",
  "pocket-dimensions",
  "uploads",
  "data",
  "ai_model",
  ".env",
  "*.log",
];

// ── Builder ───────────────────────────────────────────────────────────────

export class PlatformCapsuleBuilder {
  private projectRoot: string;
  private pocket: PocketDimension | null = null;

  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  async build(opts: CapsuleBuildOptions): Promise<CapsuleMetadata> {
    const capsuleId = `capsule-${opts.version}-${Date.now()}`;
    logger.info(
      `[Capsule] Building platform capsule: ${capsuleId} v${opts.version}`,
    );

    this.pocket = await pocketManager.openPocket(capsuleId, {
      encryptionKey: opts.encrypt ? opts.encryptionKey : undefined,
      compressionLevel: 9,
      enableDeduplication: true,
    });

    const excludePatterns = [
      ...DEFAULT_EXCLUDE,
      ...(opts.excludePatterns ?? []),
    ];

    // Collect files
    const allFiles = await this.collectFiles(this.projectRoot, excludePatterns);
    logger.info(`[Capsule] Collected ${allFiles.length} file(s)`);

    const manifest: CapsuleManifest = {
      files: [],
      directories: [],
      entryPoint: "artifacts/api-server/src/index.ts",
      startCommand: "pnpm --filter @workspace/api-server run dev",
      environment: {
        NODE_ENV: "production",
        PORT: process.env.PORT ?? "8080",
      },
    };

    let totalSize = 0;
    const contentHasher = createHash("sha256");

    for (const filePath of allFiles) {
      try {
        const relative = path.relative(this.projectRoot, filePath);
        const stat = await fs.stat(filePath);
        const data = await fs.readFile(filePath);
        const hash = createHash("sha256").update(data).digest("hex");
        const ext = path.extname(filePath).toLowerCase();

        await this.pocket!.write(`files/${relative}`, data);

        manifest.files.push({
          path: relative,
          size: stat.size,
          hash,
          type: FILE_TYPES[ext] ?? "binary",
        });

        totalSize += stat.size;
        contentHasher.update(hash);
      } catch {
        // Skip unreadable files
      }
    }

    const manifestJson = JSON.stringify(manifest, null, 2);
    await this.pocket!.write("manifest.json", manifestJson);

    const manifestHash = createHash("sha256")
      .update(manifestJson)
      .digest("hex");
    const contentHash = contentHasher.digest("hex");

    const stats = this.pocket!.getStats();
    const compressedSize = stats.compressedSize;

    const metadata: CapsuleMetadata = {
      id: capsuleId,
      version: opts.version,
      name: "Max Booster PDIM Storage Server",
      description: opts.description ?? `PDIM Platform v${opts.version}`,
      createdAt: new Date(),
      platform: {
        name: "Max Booster Storage",
        version: opts.version,
        nodeVersion: process.version,
      },
      contents: {
        totalFiles: manifest.files.length,
        totalSize,
        compressedSize,
        compressionRatio: compressedSize > 0 ? totalSize / compressedSize : 1,
      },
      checksums: { manifest: manifestHash, content: contentHash },
      encrypted: opts.encrypt ?? false,
    };

    await this.pocket!.write(
      "metadata.json",
      JSON.stringify(metadata, null, 2),
    );

    logger.info(
      `[Capsule] Built: ${manifest.files.length} files, ` +
        `${(totalSize / 1024 / 1024).toFixed(1)} MB → ` +
        `${(compressedSize / 1024 / 1024).toFixed(1)} MB compressed ` +
        `(${metadata.contents.compressionRatio.toFixed(2)}x)`,
    );

    return metadata;
  }

  private async collectFiles(
    dir: string,
    exclude: string[],
  ): Promise<string[]> {
    const results: string[] = [];
    let entries: import("fs").Dirent[];
    try {
      entries = (await fs.readdir(dir, {
        withFileTypes: true,
      })) as import("fs").Dirent[];
    } catch {
      return results;
    }

    for (const entry of entries) {
      const entryName = String(entry.name);
      if (exclude.some((p) => entryName === p || entryName.endsWith(p)))
        continue;
      const full = path.join(dir, entryName);
      if (entry.isDirectory()) {
        results.push(...(await this.collectFiles(full, exclude)));
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
    return results;
  }
}

// ── Loader ────────────────────────────────────────────────────────────────

export class PlatformCapsuleLoader {
  private pocket: PocketDimension | null = null;
  private manifest: CapsuleManifest | null = null;
  private cache = new Map<string, Buffer>();

  async load(capsuleId: string): Promise<CapsuleMetadata> {
    this.pocket = await pocketManager.openPocket(capsuleId);

    const metaRaw = await this.pocket.read("metadata.json");
    const manifestRaw = await this.pocket.read("manifest.json");

    if (!metaRaw || !manifestRaw)
      throw new Error(`Capsule ${capsuleId} is incomplete`);

    this.manifest = JSON.parse(
      Buffer.isBuffer(manifestRaw)
        ? manifestRaw.toString("utf-8")
        : String(manifestRaw),
    );

    const meta: CapsuleMetadata = JSON.parse(
      Buffer.isBuffer(metaRaw) ? metaRaw.toString("utf-8") : String(metaRaw),
    );
    meta.createdAt = new Date(meta.createdAt);

    logger.info(
      `[Capsule] Loaded capsule ${capsuleId} v${meta.version} — ${meta.contents.totalFiles} file(s)`,
    );
    return meta;
  }

  async readFile(filePath: string): Promise<Buffer> {
    if (!this.pocket) throw new Error("No capsule loaded");
    if (this.cache.has(filePath)) return this.cache.get(filePath)!;

    const data = await this.pocket.read(`files/${filePath}`);
    if (!data) throw new Error(`File ${filePath} not found in capsule`);
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.cache.set(filePath, buf);
    return buf;
  }

  async verify(): Promise<boolean> {
    if (!this.pocket || !this.manifest) return false;
    for (const entry of this.manifest.files) {
      try {
        const data = await this.readFile(entry.path);
        const hash = createHash("sha256").update(data).digest("hex");
        if (hash !== entry.hash) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  getManifest(): CapsuleManifest | null {
    return this.manifest;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ── Singletons ────────────────────────────────────────────────────────────

export const capsuleBuilder = new PlatformCapsuleBuilder();
export const capsuleLoader = new PlatformCapsuleLoader();

export async function packagePlatform(
  version: string,
  opts?: Partial<CapsuleBuildOptions>,
): Promise<CapsuleMetadata> {
  return capsuleBuilder.build({
    version,
    description: `Max Booster PDIM Storage Server v${version}`,
    includeNodeModules: false,
    includeDist: true,
    includeTests: false,
    encrypt: false,
    ...opts,
  });
}

export { PlatformCapsuleBuilder as default };
