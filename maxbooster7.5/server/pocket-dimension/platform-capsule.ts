/**
 * PLATFORM CAPSULE SYSTEM
 * 
 * Packages the ENTIRE Max Booster platform into a Pocket Dimension.
 * The platform becomes a self-contained, compressed, portable capsule
 * that can be extracted and run anywhere.
 * 
 * "Put the universe in your pocket"
 * 
 * Features:
 * - Package all source code, assets, configs into a pocket dimension
 * - Version control for platform releases
 * - Extract & Boot mode (traditional deployment)
 * - Stream & Serve mode (run directly from pocket)
 * - Integrity verification with checksums
 * - Optional encryption for secure distribution
 */

import { pocketManager, PocketDimension } from './index.js';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { Readable } from 'stream';

// Capsule metadata structure
export interface CapsuleMetadata {
  id: string;
  version: string;
  name: string;
  description: string;
  createdAt: Date;
  createdBy: string;
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
  signature?: string;
}

export interface CapsuleManifest {
  files: Array<{
    path: string;
    size: number;
    hash: string;
    type: 'source' | 'asset' | 'config' | 'data' | 'binary';
  }>;
  directories: string[];
  entryPoint: string;
  buildCommand?: string;
  startCommand: string;
  environment: Record<string, string>;
  dependencies: {
    node: string;
    npm: Record<string, string>;
  };
}

export interface CapsuleBuildOptions {
  version: string;
  description?: string;
  includeNodeModules?: boolean;
  includeDist?: boolean;
  includeTests?: boolean;
  includeProdModules?: string;
  includeProdTarball?: string;
  encrypt?: boolean;
  encryptionKey?: string;
  sign?: boolean;
  excludePatterns?: string[];
}

// File type detection
const FILE_TYPES: Record<string, 'source' | 'asset' | 'config' | 'data' | 'binary'> = {
  '.ts': 'source',
  '.tsx': 'source',
  '.js': 'source',
  '.jsx': 'source',
  '.css': 'source',
  '.scss': 'source',
  '.html': 'source',
  '.json': 'config',
  '.yaml': 'config',
  '.yml': 'config',
  '.env': 'config',
  '.md': 'data',
  '.txt': 'data',
  '.png': 'asset',
  '.jpg': 'asset',
  '.jpeg': 'asset',
  '.gif': 'asset',
  '.svg': 'asset',
  '.ico': 'asset',
  '.webp': 'asset',
  '.mp3': 'asset',
  '.wav': 'asset',
  '.mp4': 'asset',
  '.webm': 'asset',
  '.woff': 'asset',
  '.woff2': 'asset',
  '.ttf': 'asset',
  '.eot': 'asset',
  '.node': 'binary',
  '.so': 'binary',
  '.dll': 'binary',
  '.dylib': 'binary',
};

class PlatformCapsuleBuilder {
  private projectRoot: string;
  private pocket: PocketDimension | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Build a complete platform capsule
   */
  async build(options: CapsuleBuildOptions): Promise<CapsuleMetadata> {
    const capsuleId = `capsule-${options.version}-${Date.now()}`;
    console.log(`\n🧬 PLATFORM CAPSULE BUILDER`);
    console.log(`   Creating capsule: ${capsuleId}`);
    console.log(`   Version: ${options.version}`);
    console.log(`   Source: ${this.projectRoot}\n`);

    // Create the pocket dimension for this capsule
    this.pocket = await pocketManager.openPocket(capsuleId, {
      encryptionKey: options.encrypt ? options.encryptionKey : undefined,
      compressionLevel: 9,
      enableDeduplication: true,
    });

    // Collect all files
    console.log('📦 Collecting files...');
    const files = await this.collectFiles(options);
    console.log(`   Found ${files.length} files to package`);

    // Create manifest
    console.log('📋 Building manifest...');
    const manifest = await this.buildManifest(files, options);

    // Write files to pocket dimension
    console.log('💾 Writing to pocket dimension...');
    let totalSize = 0;
    let processedFiles = 0;
    
    for (const file of files) {
      const content = await fs.readFile(file.fullPath);
      const relativePath = file.relativePath;
      
      await this.pocket.write(relativePath, content);
      totalSize += content.length;
      processedFiles++;
      
      if (processedFiles % 50 === 0) {
        console.log(`   Processed ${processedFiles}/${files.length} files...`);
      }
    }

    // Serialize manifest with consistent formatting for checksum
    const manifestJson = JSON.stringify(manifest, null, 2);
    
    // Write manifest
    await this.pocket.write('__capsule__/manifest.json', 
      Buffer.from(manifestJson));

    // Get compression stats
    const stats = this.pocket.getStats();
    const compressionRatio = stats.compressedSize / stats.originalSize;

    // Create metadata - IMPORTANT: hash the exact same string that was written
    const metadata: CapsuleMetadata = {
      id: capsuleId,
      version: options.version,
      name: 'Max Booster Platform',
      description: options.description || `Max Booster Platform v${options.version}`,
      createdAt: new Date(),
      createdBy: 'Platform Capsule Builder',
      platform: {
        name: 'Max Booster',
        version: options.version,
        nodeVersion: process.version,
      },
      contents: {
        totalFiles: files.length,
        totalSize,
        compressedSize: stats.compressedSize,
        compressionRatio,
      },
      checksums: {
        manifest: this.hash(manifestJson),
        content: this.hash(files.map(f => f.hash).join('')),
      },
      encrypted: options.encrypt || false,
    };

    // Write metadata
    await this.pocket.write('__capsule__/metadata.json',
      Buffer.from(JSON.stringify(metadata, null, 2)));

    console.log(`\n✅ CAPSULE CREATED SUCCESSFULLY`);
    console.log(`   ID: ${capsuleId}`);
    console.log(`   Files: ${files.length}`);
    console.log(`   Original Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Compressed: ${(stats.compressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Compression: ${((1 - compressionRatio) * 100).toFixed(1)}% reduction`);
    console.log(`   Encrypted: ${options.encrypt ? 'Yes' : 'No'}\n`);

    // CRITICAL: Close the pocket to persist all data to disk
    await this.pocket.close();
    this.pocket = null;

    return metadata;
  }

  /**
   * Collect all files to include in capsule
   */
  private async collectFiles(options: CapsuleBuildOptions): Promise<Array<{
    fullPath: string;
    relativePath: string;
    size: number;
    hash: string;
    type: 'source' | 'asset' | 'config' | 'data' | 'binary';
  }>> {
    const files: Array<{
      fullPath: string;
      relativePath: string;
      size: number;
      hash: string;
      type: 'source' | 'asset' | 'config' | 'data' | 'binary';
    }> = [];

    // Default exclude patterns
    const excludePatterns = [
      'node_modules',
      '.git',
      '.subatomic',
      'pocket-dimensions',
      '.env',
      '.env.local',
      '*.log',
      '.DS_Store',
      'thumbs.db',
      ...(options.excludePatterns || []),
    ];

    if (!options.includeDist) {
      excludePatterns.push('dist');
    }

    if (!options.includeTests) {
      excludePatterns.push('tests', '__tests__', '*.test.ts', '*.spec.ts');
    }

    // Recursive file collection
    const collect = async (dir: string, baseDir?: string, targetPrefix?: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        let relativePath: string;
        
        if (baseDir && targetPrefix) {
          // For production modules, map to node_modules/
          relativePath = path.join(targetPrefix, path.relative(baseDir, fullPath));
        } else {
          relativePath = path.relative(this.projectRoot, fullPath);
        }

        // Check exclusions (skip for prod modules since they're pre-filtered)
        if (!targetPrefix && this.shouldExclude(relativePath, excludePatterns)) {
          continue;
        }

        if (entry.isDirectory()) {
          await collect(fullPath, baseDir, targetPrefix);
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          const content = await fs.readFile(fullPath);
          const hash = this.hash(content);
          const ext = path.extname(entry.name).toLowerCase();
          const type = FILE_TYPES[ext] || 'data';

          files.push({
            fullPath,
            relativePath,
            size: stat.size,
            hash,
            type,
          });
        }
      }
    };

    await collect(this.projectRoot);
    
    // Include production node_modules tarball if specified (FAST - just 1 file)
    if (options.includeProdTarball) {
      console.log('   Including production dependencies tarball (optimized)...');
      try {
        const tarballPath = options.includeProdTarball;
        const stats = await fs.stat(tarballPath);
        if (stats.isFile()) {
          const content = await fs.readFile(tarballPath);
          const hash = this.hash(content);
          files.push({
            fullPath: tarballPath,
            relativePath: '__dependencies__/node_modules.tar.gz',
            size: stats.size,
            hash,
            type: 'binary',
          });
          console.log(`   Added tarball: ${(stats.size / 1024 / 1024).toFixed(2)} MB (1 file instead of 60k+)`);
        }
      } catch (error) {
        console.warn('   Warning: Could not include production tarball:', error);
      }
    }
    // Legacy: Include production node_modules directory if specified
    else if (options.includeProdModules) {
      console.log('   Including production node_modules...');
      try {
        const prodModulesDir = options.includeProdModules;
        const stats = await fs.stat(prodModulesDir);
        if (stats.isDirectory()) {
          await collect(prodModulesDir, prodModulesDir, 'node_modules');
          console.log(`   Added ${files.filter(f => f.relativePath.startsWith('node_modules')).length} files from production modules`);
        }
      } catch (error) {
        console.warn('   Warning: Could not include production modules:', error);
      }
    }
    
    return files;
  }

  /**
   * Check if path should be excluded
   */
  private shouldExclude(relativePath: string, patterns: string[]): boolean {
    const normalized = relativePath.replace(/\\/g, '/');
    
    for (const pattern of patterns) {
      // Simple pattern matching
      if (pattern.startsWith('*')) {
        // Wildcard extension match
        const ext = pattern.slice(1);
        if (normalized.endsWith(ext)) return true;
      } else if (normalized.includes(pattern) || normalized.startsWith(pattern)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Build the capsule manifest
   */
  private async buildManifest(
    files: Array<{ relativePath: string; size: number; hash: string; type: string }>,
    options: CapsuleBuildOptions
  ): Promise<CapsuleManifest> {
    // Read package.json for dependencies
    let packageJson: any = {};
    try {
      const content = await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf-8');
      packageJson = JSON.parse(content);
    } catch {
      // No package.json
    }

    // Get unique directories
    const directories = [...new Set(files.map(f => path.dirname(f.relativePath)))];

    return {
      files: files.map(f => ({
        path: f.relativePath,
        size: f.size,
        hash: f.hash,
        type: f.type as 'source' | 'asset' | 'config' | 'data' | 'binary',
      })),
      directories,
      entryPoint: packageJson.main || 'server/index.ts',
      buildCommand: packageJson.scripts?.build,
      startCommand: packageJson.scripts?.start || 'npm start',
      environment: {
        NODE_ENV: 'production',
      },
      dependencies: {
        node: process.version,
        npm: packageJson.dependencies || {},
      },
    };
  }

  /**
   * Create SHA-256 hash
   */
  private hash(data: string | Buffer): string {
    return createHash('sha256')
      .update(typeof data === 'string' ? data : data)
      .digest('hex');
  }
}

class PlatformCapsuleLoader {
  private storagePath: string;

  constructor() {
    this.storagePath = path.join(process.cwd(), 'pocket-dimensions');
  }

  /**
   * Extract capsule to filesystem (Extract & Boot mode)
   */
  async extractToPath(capsuleId: string, targetPath: string): Promise<void> {
    console.log(`\n🚀 EXTRACTING CAPSULE: ${capsuleId}`);
    console.log(`   Target: ${targetPath}\n`);

    const pocket = await pocketManager.openPocket(capsuleId);
    
    // Read metadata
    const metadataBuffer = await pocket.read('__capsule__/metadata.json');
    const metadata: CapsuleMetadata = JSON.parse(metadataBuffer.toString());
    
    // Read manifest
    const manifestBuffer = await pocket.read('__capsule__/manifest.json');
    const manifest: CapsuleManifest = JSON.parse(manifestBuffer.toString());

    // Verify integrity
    const manifestHash = createHash('sha256')
      .update(JSON.stringify(manifest))
      .digest('hex');
    
    if (manifestHash !== metadata.checksums.manifest) {
      throw new Error('Capsule integrity check failed - manifest corrupted');
    }

    // Create target directory
    await fs.mkdir(targetPath, { recursive: true });

    // Create all directories first
    for (const dir of manifest.directories) {
      await fs.mkdir(path.join(targetPath, dir), { recursive: true });
    }

    // Extract all files
    let extracted = 0;
    for (const file of manifest.files) {
      if (file.path.startsWith('__capsule__')) continue;
      
      const content = await pocket.read(file.path);
      const targetFile = path.join(targetPath, file.path);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.writeFile(targetFile, content);
      
      extracted++;
      if (extracted % 50 === 0) {
        console.log(`   Extracted ${extracted}/${manifest.files.length} files...`);
      }
    }

    console.log(`\n✅ EXTRACTION COMPLETE`);
    console.log(`   Files: ${extracted}`);
    console.log(`   Location: ${targetPath}`);
    console.log(`\n   To run: cd ${targetPath} && npm install && npm start\n`);
  }

  /**
   * Stream & Serve mode - Virtual filesystem from pocket
   * Returns a virtual FS interface that reads directly from pocket
   */
  async createVirtualFS(capsuleId: string): Promise<VirtualCapsuleFS> {
    const pocket = await pocketManager.openPocket(capsuleId);
    
    // Read manifest
    const manifestBuffer = await pocket.read('__capsule__/manifest.json');
    const manifest: CapsuleManifest = JSON.parse(manifestBuffer.toString());

    return new VirtualCapsuleFS(pocket, manifest);
  }

  /**
   * Get capsule metadata without full extraction
   */
  async getMetadata(capsuleId: string): Promise<CapsuleMetadata> {
    const pocket = await pocketManager.openPocket(capsuleId);
    const metadataBuffer = await pocket.read('__capsule__/metadata.json');
    return JSON.parse(metadataBuffer.toString());
  }

  /**
   * List all available capsules
   */
  async listCapsules(): Promise<CapsuleMetadata[]> {
    const capsules: CapsuleMetadata[] = [];

    // First check pocketManager for open capsules
    const openPockets = pocketManager.listPockets();
    for (const pocketId of openPockets) {
      if (pocketId.startsWith('capsule-')) {
        try {
          const metadata = await this.getMetadata(pocketId);
          capsules.push(metadata);
        } catch {
          // Not a valid capsule
        }
      }
    }

    // Then scan the storage directory for persisted capsules
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      const dirs = await fs.readdir(this.storagePath);
      
      for (const dir of dirs) {
        if (dir.startsWith('capsule-') && !openPockets.includes(dir)) {
          try {
            const metaPath = path.join(this.storagePath, dir, '__capsule__');
            const metadataFile = path.join(this.storagePath, dir, 'metadata.json');
            
            // Check if this is a capsule by looking for capsule metadata in the pocket
            const pocket = await pocketManager.openPocket(dir);
            try {
              const metadataBuffer = await pocket.read('__capsule__/metadata.json');
              const metadata: CapsuleMetadata = JSON.parse(metadataBuffer.toString());
              capsules.push(metadata);
            } catch {
              // Not a valid capsule
            }
            await pocket.close();
          } catch {
            // Skip invalid directories
          }
        }
      }
    } catch {
      // Storage directory doesn't exist yet
    }

    return capsules.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Delete a capsule
   */
  async deleteCapsule(capsuleId: string): Promise<void> {
    // Close the pocket if open
    await pocketManager.closePocket(capsuleId);
    
    // Delete the capsule directory from storage
    const capsulePath = path.join(this.storagePath, capsuleId);
    try {
      await fs.rm(capsulePath, { recursive: true, force: true });
      console.log(`Capsule ${capsuleId} deleted successfully`);
    } catch (error) {
      console.error(`Failed to delete capsule ${capsuleId}:`, error);
      throw error;
    }
  }
}

/**
 * Virtual Filesystem that reads from a Pocket Dimension
 * Enables running the platform directly from compressed storage
 */
class VirtualCapsuleFS {
  private pocket: PocketDimension;
  private manifest: CapsuleManifest;
  private cache: Map<string, Buffer> = new Map();

  constructor(pocket: PocketDimension, manifest: CapsuleManifest) {
    this.pocket = pocket;
    this.manifest = manifest;
  }

  async readFile(filePath: string): Promise<Buffer> {
    // Check cache first
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    // Read from pocket
    const content = await this.pocket.read(filePath);
    
    // Cache for future access
    this.cache.set(filePath, content);
    
    return content;
  }

  async readFileString(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const buffer = await this.readFile(filePath);
    return buffer.toString(encoding);
  }

  exists(filePath: string): boolean {
    return this.manifest.files.some(f => f.path === filePath);
  }

  listDir(dirPath: string): string[] {
    const normalized = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    return this.manifest.files
      .filter(f => f.path.startsWith(normalized))
      .map(f => f.path.slice(normalized.length).split('/')[0])
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  getManifest(): CapsuleManifest {
    return this.manifest;
  }

  getStats(): { cachedFiles: number; cacheSize: number } {
    let cacheSize = 0;
    this.cache.forEach(buf => cacheSize += buf.length);
    return {
      cachedFiles: this.cache.size,
      cacheSize,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instances
export const capsuleBuilder = new PlatformCapsuleBuilder();
export const capsuleLoader = new PlatformCapsuleLoader();

// Convenience function to build current platform into a capsule
export async function packagePlatform(version: string, options?: Partial<CapsuleBuildOptions>): Promise<CapsuleMetadata> {
  const builder = new PlatformCapsuleBuilder();
  return builder.build({
    version,
    description: `Max Booster Platform v${version} - Packaged into Pocket Dimension`,
    includeNodeModules: false,
    includeDist: true,
    includeTests: false,
    encrypt: false,
    ...options,
  });
}

export { PlatformCapsuleBuilder, PlatformCapsuleLoader, VirtualCapsuleFS };
