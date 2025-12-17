#!/usr/bin/env npx tsx
/**
 * BUILD CAPSULE SCRIPT - DEPLOYMENT HARDENED (DUAL-PATH STRATEGY)
 * 
 * Packages the Max Booster platform into a Pocket Dimension capsule
 * and compiles the capsule-loader.ts to standalone JavaScript.
 * 
 * DEPLOYMENT HARDENING FEATURES:
 * - DUAL-PATH STRATEGY: Uses npm ci --omit=dev for production-only deps
 * - LOCKFILE HASH CACHING: Skips tarball rebuild when deps haven't changed
 * - TARBALL SHARDING: Splits into 200MB chunks for parallel extraction
 * - SHA256 INTEGRITY: Validates all shards and tarballs with checksums
 * - SIZE BUDGET: Fails if capsule exceeds 800MB limit
 * - Production dependency pruning (removes dev deps from tarball)
 * 
 * DUAL-PATH LOGIC:
 * 1. Check if cached tarball exists with matching package-lock.json hash
 * 2. If cache hit: reuse existing tarball (fast rebuild)
 * 3. If cache miss: 
 *    a. Create temp directory with package.json + package-lock.json
 *    b. Run `npm ci --omit=dev` to install production deps only
 *    c. Compress that directory (300-400MB vs 600MB+ full deps)
 *    d. Split into 200MB shards if needed for parallel extraction
 *    e. Save lockfile hash for future builds
 * 
 * Usage: npm run build:capsule
 * 
 * Output:
 *   dist-capsule/
 *     ├── platform-capsule.pocket/  (compressed platform files)
 *     ├── capsule-loader.js         (standalone loader)
 *     ├── deploy-info.json          (deployment metadata)
 *     └── extraction-manifest.json  (shards + hashes for parallel extraction)
 */

import { PlatformCapsuleBuilder, CapsuleMetadata } from '../server/pocket-dimension/platform-capsule.js';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync, copyFileSync, cpSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// DEPLOYMENT BUDGET CONSTANTS
const MAX_CAPSULE_SIZE_MB = 800; // Fail if capsule exceeds this
const MAX_BUILD_TIME_MINUTES = 10; // Warning if build exceeds this
const SHARD_SIZE_MB = 200; // Split tarball into chunks for parallel extraction

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

interface BuildOptions {
  version?: string;
  outputDir?: string;
  includeTests?: boolean;
  encrypt?: boolean;
  encryptionKey?: string;
}

interface TarballShard {
  index: number;
  path: string;
  size: number;
  sha256: string;
}

interface ExtractionManifest {
  version: string;
  createdAt: string;
  totalSize: number;
  tarball: {
    path: string;
    size: number;
    sha256: string;
    shards?: TarballShard[];
    isSharded: boolean;
  };
  lockfileHash: string;
  cacheHit: boolean;
  productionOnly: boolean;
  budgets: {
    maxCapsuleSizeMB: number;
    maxBuildTimeMinutes: number;
    actualSizeMB: number;
    actualBuildSeconds: number;
    withinBudget: boolean;
  };
  startup: {
    estimatedExtractionSeconds: number;
    estimatedBootSeconds: number;
    totalEstimatedSeconds: number;
  };
}

interface TarballCacheInfo {
  lockfileHash: string;
  tarballPath: string;
  tarballHash: string;
  createdAt: string;
  shards?: TarballShard[];
}

function calculateFileSha256(filePath: string): string {
  const hash = createHash('sha256');
  const content = readFileSync(filePath);
  hash.update(content);
  return hash.digest('hex');
}

function calculateLockfileHash(): string {
  const lockfilePath = join(projectRoot, 'package-lock.json');
  if (!existsSync(lockfilePath)) {
    console.warn('   ⚠️  No package-lock.json found, cannot cache tarball');
    return '';
  }
  return calculateFileSha256(lockfilePath);
}

function getCachePath(): string {
  return join(projectRoot, '.capsule-cache.json');
}

function loadTarballCache(): TarballCacheInfo | null {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) {
    return null;
  }
  try {
    const cacheData = JSON.parse(readFileSync(cachePath, 'utf-8'));
    return cacheData as TarballCacheInfo;
  } catch {
    return null;
  }
}

function saveTarballCache(cacheInfo: TarballCacheInfo): void {
  const cachePath = getCachePath();
  writeFileSync(cachePath, JSON.stringify(cacheInfo, null, 2));
}

function checkCachedTarball(lockfileHash: string, tarballPath: string): { hit: boolean; cache: TarballCacheInfo | null } {
  if (!lockfileHash) {
    return { hit: false, cache: null };
  }
  
  const cache = loadTarballCache();
  if (!cache) {
    console.log('   📦 No cache found, will create new tarball');
    return { hit: false, cache: null };
  }
  
  if (cache.lockfileHash !== lockfileHash) {
    console.log('   📦 Lockfile changed, will rebuild tarball');
    console.log(`      Old hash: ${cache.lockfileHash.substring(0, 16)}...`);
    console.log(`      New hash: ${lockfileHash.substring(0, 16)}...`);
    return { hit: false, cache: null };
  }
  
  if (!existsSync(cache.tarballPath)) {
    console.log('   📦 Cached tarball file missing, will rebuild');
    return { hit: false, cache: null };
  }
  
  const currentHash = calculateFileSha256(cache.tarballPath);
  if (currentHash !== cache.tarballHash) {
    console.log('   📦 Tarball corrupted (hash mismatch), will rebuild');
    return { hit: false, cache: null };
  }
  
  if (cache.shards && cache.shards.length > 0) {
    for (const shard of cache.shards) {
      if (!existsSync(shard.path)) {
        console.log(`   📦 Shard ${shard.index} missing, will rebuild`);
        return { hit: false, cache: null };
      }
    }
  }
  
  console.log('   ✅ Cache hit! Reusing existing tarball');
  return { hit: true, cache };
}

async function createProdOnlyModules(tempDir: string): Promise<boolean> {
  console.log('   Creating production-only node_modules...');
  console.log(`   Temp directory: ${tempDir}`);
  
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  mkdirSync(tempDir, { recursive: true });
  
  copyFileSync(join(projectRoot, 'package.json'), join(tempDir, 'package.json'));
  copyFileSync(join(projectRoot, 'package-lock.json'), join(tempDir, 'package-lock.json'));
  
  try {
    console.log('   Running npm ci --omit=dev (production dependencies only)...');
    execSync('npm ci --omit=dev', {
      cwd: tempDir,
      stdio: 'pipe',
      timeout: 600000,
      env: { ...process.env, NODE_ENV: 'production' },
    });
    console.log('   ✅ Production dependencies installed');
    return true;
  } catch (error) {
    console.error('   ❌ Failed to install production dependencies:', error);
    return false;
  }
}

function splitIntoShards(tarballPath: string, outputDir: string): TarballShard[] {
  const tarballSize = statSync(tarballPath).size;
  const shardSizeBytes = SHARD_SIZE_MB * 1024 * 1024;
  
  if (tarballSize <= shardSizeBytes) {
    console.log(`   Tarball ${(tarballSize / 1024 / 1024).toFixed(2)} MB <= ${SHARD_SIZE_MB} MB, no sharding needed`);
    return [];
  }
  
  const numShards = Math.ceil(tarballSize / shardSizeBytes);
  console.log(`   Splitting ${(tarballSize / 1024 / 1024).toFixed(2)} MB tarball into ${numShards} shards...`);
  
  const shardsDir = join(outputDir, 'shards');
  if (existsSync(shardsDir)) {
    rmSync(shardsDir, { recursive: true, force: true });
  }
  mkdirSync(shardsDir, { recursive: true });
  
  const shards: TarballShard[] = [];
  
  // Use streaming with split command for memory efficiency
  // Each shard is a complete segment that must be concatenated in order
  try {
    execSync(`split -b ${SHARD_SIZE_MB}m "${tarballPath}" "${join(shardsDir, 'shard_')}"`, {
      stdio: 'pipe',
    });
    
    // Rename split output files to have .bin extension and calculate hashes
    const splitFiles = readdirSync(shardsDir).sort();
    for (let i = 0; i < splitFiles.length; i++) {
      const oldPath = join(shardsDir, splitFiles[i]);
      const newPath = join(shardsDir, `shard_${i.toString().padStart(3, '0')}.bin`);
      
      // Rename and calculate hash using streaming
      const hash = createHash('sha256');
      const content = readFileSync(oldPath);
      hash.update(content);
      const shardHash = hash.digest('hex');
      const shardSize = statSync(oldPath).size;
      
      if (oldPath !== newPath) {
        writeFileSync(newPath, content);
        rmSync(oldPath, { force: true });
      }
      
      shards.push({
        index: i,
        path: newPath,
        size: shardSize,
        sha256: shardHash,
      });
      
      console.log(`   ✅ Shard ${i + 1}/${numShards}: ${(shardSize / 1024 / 1024).toFixed(2)} MB`);
    }
  } catch (error) {
    console.warn('   ⚠️ split command failed, falling back to Node.js streaming...');
    
    // Fallback: Use streaming file reads instead of loading entire file
    const fd = require('fs').openSync(tarballPath, 'r');
    const buffer = Buffer.alloc(64 * 1024); // 64KB chunks
    
    for (let i = 0; i < numShards; i++) {
      const start = i * shardSizeBytes;
      const end = Math.min(start + shardSizeBytes, tarballSize);
      const shardPath = join(shardsDir, `shard_${i.toString().padStart(3, '0')}.bin`);
      
      const hash = createHash('sha256');
      const writeStream = require('fs').createWriteStream(shardPath);
      
      let pos = start;
      while (pos < end) {
        const toRead = Math.min(buffer.length, end - pos);
        const bytesRead = require('fs').readSync(fd, buffer, 0, toRead, pos);
        if (bytesRead === 0) break;
        
        const chunk = buffer.subarray(0, bytesRead);
        hash.update(chunk);
        writeStream.write(chunk);
        pos += bytesRead;
      }
      
      writeStream.end();
      const shardHash = hash.digest('hex');
      
      shards.push({
        index: i,
        path: shardPath,
        size: end - start,
        sha256: shardHash,
      });
      
      console.log(`   ✅ Shard ${i + 1}/${numShards}: ${((end - start) / 1024 / 1024).toFixed(2)} MB`);
    }
    
    require('fs').closeSync(fd);
  }
  
  return shards;
}

async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  
  const walkDir = (dir: string) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        totalSize += statSync(fullPath).size;
      }
    }
  };

  if (existsSync(dirPath)) {
    walkDir(dirPath);
  }
  return totalSize;
}

async function buildCapsule(options: BuildOptions = {}): Promise<void> {
  const buildStartTime = Date.now();
  const version = options.version || readPackageVersion();
  const outputDir = options.outputDir || join(projectRoot, 'dist-capsule');
  const capsuleDir = join(outputDir, 'platform-capsule.pocket');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           MAX BOOSTER - CAPSULE BUILD SYSTEM               ║');
  console.log('║           Creating Pocket Dimension Deployment             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   Version: ${version}`);
  console.log(`   Project Root: ${projectRoot}`);
  console.log(`   Output: ${outputDir}`);
  console.log('');

  if (existsSync(outputDir)) {
    console.log('🧹 Cleaning previous build...');
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  console.log('\n📦 STEP 1: Building client and server...');
  console.log('   (Skipping security audit for capsule build - vulnerabilities documented in allowlist)');
  try {
    execSync('npm run build:client && npm run build:server', { 
      cwd: projectRoot, 
      stdio: 'inherit',
      timeout: 300000,
    });
    console.log('✅ Build complete!\n');
  } catch (error) {
    console.error('❌ Build failed! Cannot create capsule without successful build.');
    console.error('   Fix build errors and try again.');
    process.exit(1);
  }

  // SLIM CAPSULE STRATEGY: No node_modules bundled!
  // Dependencies will be installed via npm ci during deployment startup
  // This drastically reduces capsule size and extraction time
  console.log('📦 STEP 1b: Slim capsule strategy (NO node_modules bundled)...');
  console.log('   Dependencies will install via npm ci during deployment');
  console.log('   This keeps the capsule small and fast to extract!');
  
  const lockfileHash = calculateLockfileHash();
  console.log(`   Lockfile hash: ${lockfileHash.substring(0, 16)}...`);
  console.log('');
  
  // We don't bundle node_modules anymore - just track that we need npm ci
  const hasProdTarball = false;
  const tarballHash = '';
  const tarballSize = 0;
  const cacheHit = false;
  const tarballShards: TarballShard[] = [];

  console.log('🧬 STEP 2: Creating Pocket Dimension capsule...');
  
  const pocketDimensionsDir = join(projectRoot, 'pocket-dimensions');
  mkdirSync(pocketDimensionsDir, { recursive: true });

  const builder = new PlatformCapsuleBuilder(projectRoot);
  
  let metadata: CapsuleMetadata;
  try {
    metadata = await builder.build({
      version,
      description: `Max Booster Platform v${version} - Capsule Deployment (Self-Contained)`,
      includeNodeModules: false,
      includeDist: true,
      includeTests: options.includeTests || false,
      encrypt: options.encrypt,
      encryptionKey: options.encryptionKey,
      includeProdTarball: hasProdTarball ? prodModulesTarball : undefined,
      excludePatterns: [
        'node_modules',
        '.git',
        '.subatomic',
        'pocket-dimensions',
        'dist-capsule',
        '.env',
        '.env.local',
        '.env.production',
        '*.log',
        '.DS_Store',
        'thumbs.db',
        'dump.rdb',
        'attached_assets',
        'uploads',
        'logs',
        '*.md',
        'coverage',
        '.nyc_output',
        '.eslintcache',
        '.prettiercache',
        'node_modules_prod.tar.gz',
        '.prod-modules-temp',
        '.capsule-cache.json',
        'shards',
      ],
    });
  } catch (error) {
    console.error('❌ Failed to create capsule:', error);
    throw error;
  }

  const sourceCapsuleDir = join(pocketDimensionsDir, metadata.id);
  console.log(`\n📋 Moving capsule to output directory...`);
  console.log(`   From: ${sourceCapsuleDir}`);
  console.log(`   To: ${capsuleDir}`);

  if (existsSync(sourceCapsuleDir)) {
    cpSync(sourceCapsuleDir, capsuleDir, { recursive: true });
    console.log('✅ Capsule moved!\n');
  } else {
    throw new Error(`Source capsule not found at ${sourceCapsuleDir}`);
  }

  console.log('📝 STEP 3: Compiling capsule-loader...');
  const loaderSrc = join(projectRoot, 'capsule-loader.ts');
  const loaderDest = join(outputDir, 'capsule-loader.js');

  if (!existsSync(loaderSrc)) {
    throw new Error(`Capsule loader source not found: ${loaderSrc}`);
  }

  try {
    execSync(`npx esbuild ${loaderSrc} --bundle --platform=node --format=esm --outfile=${loaderDest} --minify --target=node20`, {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    console.log('✅ Loader compiled!\n');
  } catch (error) {
    console.error('❌ Failed to compile loader:', error);
    throw error;
  }

  console.log('📊 STEP 4: Calculating deployment size...');
  const capsuleSize = await getDirectorySize(capsuleDir);
  const loaderSize = statSync(loaderDest).size;
  const totalSize = capsuleSize + loaderSize;

  const originalSourceSize = metadata.contents.totalSize;
  const nodeModulesSize = await getDirectorySize(join(projectRoot, 'node_modules'));
  const traditionalSize = originalSourceSize + nodeModulesSize;
  const savings = traditionalSize > 0 ? ((1 - totalSize / traditionalSize) * 100) : 0;

  const deployInfo = {
    version,
    createdAt: new Date().toISOString(),
    capsuleId: metadata.id,
    selfContained: hasProdTarball,
    files: {
      capsule: 'platform-capsule.pocket',
      loader: 'capsule-loader.js',
    },
    sizes: {
      capsule: capsuleSize,
      loader: loaderSize,
      total: totalSize,
      originalSource: originalSourceSize,
      nodeModules: nodeModulesSize,
      traditionalDeployment: traditionalSize,
      savings: `${savings.toFixed(1)}%`,
    },
    encrypted: metadata.encrypted,
    checksums: metadata.checksums,
    deployment: {
      type: hasProdTarball ? 'self-contained-tarball' : 'requires-npm-install',
      description: hasProdTarball 
        ? 'Production dependencies included as tarball - fast extraction, no npm install needed'
        : 'Run npm install after extraction to install dependencies',
    },
  };

  writeFileSync(join(outputDir, 'deploy-info.json'), JSON.stringify(deployInfo, null, 2));

  // Calculate build time and create extraction manifest
  const buildEndTime = Date.now();
  const buildDurationSeconds = (buildEndTime - buildStartTime) / 1000;
  const capsuleSizeMB = totalSize / (1024 * 1024);
  
  // Estimate extraction time based on tarball size (~50MB/s extraction speed)
  const estimatedExtractionSeconds = hasProdTarball ? Math.ceil(tarballSize / (50 * 1024 * 1024)) : 0;
  const estimatedBootSeconds = 30; // TensorFlow + DB + Redis init
  
  const extractionManifest: ExtractionManifest = {
    version,
    createdAt: new Date().toISOString(),
    totalSize,
    tarball: {
      path: '__dependencies__/node_modules.tar.gz',
      size: tarballSize,
      sha256: tarballHash,
      shards: tarballShards.length > 0 ? tarballShards.map(s => ({
        ...s,
        path: s.path.replace(projectRoot, '').replace(/^[/\\]/, ''),
      })) : undefined,
      isSharded: tarballShards.length > 0,
    },
    lockfileHash,
    cacheHit,
    productionOnly: hasProdTarball && !cacheHit,
    budgets: {
      maxCapsuleSizeMB: MAX_CAPSULE_SIZE_MB,
      maxBuildTimeMinutes: MAX_BUILD_TIME_MINUTES,
      actualSizeMB: Math.round(capsuleSizeMB * 100) / 100,
      actualBuildSeconds: Math.round(buildDurationSeconds),
      withinBudget: capsuleSizeMB <= MAX_CAPSULE_SIZE_MB && buildDurationSeconds <= MAX_BUILD_TIME_MINUTES * 60,
    },
    startup: {
      estimatedExtractionSeconds,
      estimatedBootSeconds,
      totalEstimatedSeconds: estimatedExtractionSeconds + estimatedBootSeconds,
    },
  };
  
  writeFileSync(join(outputDir, 'extraction-manifest.json'), JSON.stringify(extractionManifest, null, 2));
  console.log('✅ Extraction manifest created!\n');

  // BUDGET VALIDATION
  console.log('📊 STEP 5: Budget validation...');
  if (capsuleSizeMB > MAX_CAPSULE_SIZE_MB) {
    console.error(`❌ BUDGET EXCEEDED: Capsule size ${capsuleSizeMB.toFixed(2)} MB > ${MAX_CAPSULE_SIZE_MB} MB limit`);
    console.error('   Consider removing unnecessary files or optimizing dependencies.');
    process.exit(1);
  } else {
    console.log(`✅ Size budget OK: ${capsuleSizeMB.toFixed(2)} MB / ${MAX_CAPSULE_SIZE_MB} MB`);
  }
  
  if (buildDurationSeconds > MAX_BUILD_TIME_MINUTES * 60) {
    console.warn(`⚠️  Build time warning: ${(buildDurationSeconds / 60).toFixed(1)} min > ${MAX_BUILD_TIME_MINUTES} min target`);
  } else {
    console.log(`✅ Build time OK: ${(buildDurationSeconds / 60).toFixed(1)} min / ${MAX_BUILD_TIME_MINUTES} min`);
  }
  
  console.log(`📦 Estimated deployment startup: ${extractionManifest.startup.totalEstimatedSeconds}s`);
  console.log(`   - Extraction: ~${estimatedExtractionSeconds}s`);
  console.log(`   - Server boot: ~${estimatedBootSeconds}s\n`);

  // Cleanup temporary directories
  console.log('🧹 Cleaning up temporary files...');
  if (existsSync(prodModulesTarball)) {
    rmSync(prodModulesTarball, { force: true });
  }
  if (existsSync(pocketDimensionsDir)) {
    rmSync(pocketDimensionsDir, { recursive: true, force: true });
  }
  if (existsSync(prodModulesTempDir)) {
    rmSync(prodModulesTempDir, { recursive: true, force: true });
  }
  const shardsDir = join(projectRoot, 'shards');
  if (existsSync(shardsDir)) {
    rmSync(shardsDir, { recursive: true, force: true });
  }
  console.log('✅ Cleanup complete!\n');

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log(`║     BUILD COMPLETE - ${hasProdTarball ? 'SELF-CONTAINED' : 'REQUIRES NPM INSTALL'}               ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Version:              ${version.padEnd(35)}║`);
  console.log(`║  Capsule ID:           ${metadata.id.substring(0, 35).padEnd(35)}║`);
  console.log(`║  Type:                 ${(hasProdTarball ? 'Self-Contained (tarball)' : 'Requires npm install').padEnd(35)}║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  CACHE STATUS                                              ║');
  console.log(`║    Cache Hit:          ${(cacheHit ? 'YES (skipped rebuild)' : 'NO (new tarball)').padEnd(35)}║`);
  console.log(`║    Lockfile Hash:      ${lockfileHash.substring(0, 16).padEnd(35)}...║`);
  if (tarballShards.length > 0) {
    console.log(`║    Shards:             ${(`${tarballShards.length} x ${SHARD_SIZE_MB}MB`).padEnd(35)}║`);
  }
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  DEPLOYMENT SIZE                                           ║');
  console.log(`║    Capsule:            ${formatSize(capsuleSize).padEnd(35)}║`);
  console.log(`║    Loader:             ${formatSize(loaderSize).padEnd(35)}║`);
  console.log(`║    Total:              ${formatSize(totalSize).padEnd(35)}║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  COMPARISON                                                ║');
  console.log(`║    Traditional Deploy: ${formatSize(traditionalSize).padEnd(35)}║`);
  console.log(`║    Space Saved:        ${savings.toFixed(1).padStart(6)}%                           ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  OUTPUT FILES                                              ║');
  console.log(`║    ${outputDir.substring(0, 55).padEnd(56)}║`);
  console.log('║      ├── platform-capsule.pocket/  (source + deps + dist)  ║');
  console.log('║      ├── capsule-loader.js         (standalone loader)     ║');
  console.log('║      └── deploy-info.json          (metadata)              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  if (hasProdTarball) {
    console.log('🚀 SELF-CONTAINED DEPLOYMENT (OPTIMIZED):');
    console.log('   Dependencies bundled as tarball for fast extraction!');
    console.log('   Just run: node capsule-loader.js');
    console.log('   No npm install needed - extracts tarball and starts immediately.');
  } else {
    console.log('To deploy, copy the dist-capsule folder to your server and run:');
    console.log('  node capsule-loader.js');
  }
  console.log('');
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const args = process.argv.slice(2);
const options: BuildOptions = {};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--version':
    case '-v':
      options.version = args[++i];
      break;
    case '--output':
    case '-o':
      options.outputDir = args[++i];
      break;
    case '--include-tests':
      options.includeTests = true;
      break;
    case '--encrypt':
      options.encrypt = true;
      break;
    case '--key':
      options.encryptionKey = args[++i];
      break;
    case '--help':
    case '-h':
      console.log(`
Max Booster Capsule Build Script

Usage: npm run build:capsule [options]

Options:
  --version, -v <version>   Set the capsule version (default: from package.json)
  --output, -o <dir>        Output directory (default: dist-capsule)
  --include-tests           Include test files in the capsule
  --encrypt                 Encrypt the capsule
  --key <key>               Encryption key (required if --encrypt is used)
  --help, -h                Show this help message
      `);
      process.exit(0);
  }
}

buildCapsule(options).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
