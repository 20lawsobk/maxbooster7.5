#!/usr/bin/env npx tsx
/**
 * Offload local workspace directories to PDIM (Pocket Dimension).
 * After each directory is fully pushed and verified, it is deleted locally.
 *
 * Targets:
 *  - ai_model/weights/          → PDIM pocket "ai-model-weights"  (auto-restored by modelWeightStorage.ts)
 *  - attached_assets/           → PDIM archive namespace
 *  - diffusion/                 → PDIM archive namespace  (root copy; server uses server/services/diffusion/)
 *  - built-in plugins dsp/      → PDIM archive namespace
 *  - pocket dimension storage tech/ → PDIM archive namespace
 *  - AI training server/        → PDIM archive namespace
 *  - Max Booster final documentation/ → PDIM archive namespace
 *  - docs/                      → PDIM archive namespace
 *
 * Rust build artifacts deleted directly (no PDIM needed – regenerable):
 *  - boosterstate/target/debug/
 *  - boosterstate/target/release/.fingerprint/
 *  - boosterstate/target/release/libboosterstate.rlib
 *  - boosterstate/target/release/libboosterstate.d
 *  - boosterstate/target/release/boosterstate.d
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { execSync } from 'child_process';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ── PDIM credentials ────────────────────────────────────────────────────────
const PDIM_URL =
  'https://pocketdimensionstorage.replit.app/api/redis/instances/22c8e6d237afe8ae41541f87/exec';
const PDIM_TOKEN = '18cf0648abdc75cd8b904ada4d1712b928156e6b489a36c6e6b6f9bfa2447713';
const CHUNK_LIMIT = 58 * 1024; // 58 KB safe limit before base64 expansion

// ── helpers ─────────────────────────────────────────────────────────────────
async function pdimExec(cmd: string, args: string[]): Promise<any> {
  const body = JSON.stringify({ cmd, args });
  const res = await fetch(PDIM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PDIM_TOKEN}`,
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PDIM ${cmd} failed ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function pushFile(pdimKey: string, data: Buffer): Promise<void> {
  const compressed = await gzip(data, { level: 9 });
  const encoded = compressed.toString('base64');

  if (encoded.length <= CHUNK_LIMIT) {
    // Store as single key
    await pdimExec('SET', [pdimKey, encoded]);
    await pdimExec('SET', [`${pdimKey}:meta`, JSON.stringify({ chunks: 1, size: data.length, compressed: compressed.length })]);
    return;
  }

  // Multi-chunk store
  const chunks: string[] = [];
  for (let i = 0; i < encoded.length; i += CHUNK_LIMIT) {
    chunks.push(encoded.slice(i, i + CHUNK_LIMIT));
  }

  for (let i = 0; i < chunks.length; i++) {
    await pdimExec('SET', [`${pdimKey}:chunk:${i}`, chunks[i]]);
  }
  await pdimExec('SET', [`${pdimKey}:meta`, JSON.stringify({
    chunks: chunks.length,
    size: data.length,
    compressed: compressed.length,
  })]);
}

async function verifyFile(pdimKey: string, originalSize: number): Promise<boolean> {
  try {
    const meta = await pdimExec('GET', [`${pdimKey}:meta`]);
    if (!meta?.result) return false;
    const { size, chunks } = JSON.parse(meta.result);
    return size === originalSize && chunks >= 1;
  } catch {
    return false;
  }
}

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) results.push(full);
    }
  };
  walk(dir);
  return results;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ── Phase 1: delete build artifacts directly ─────────────────────────────────
function deleteRustArtifacts() {
  const WORKSPACE = process.cwd();
  const targets = [
    path.join(WORKSPACE, 'boosterstate/target/debug'),
    path.join(WORKSPACE, 'boosterstate/target/release/.fingerprint'),
    path.join(WORKSPACE, 'boosterstate/target/release/libboosterstate.rlib'),
    path.join(WORKSPACE, 'boosterstate/target/release/libboosterstate.d'),
    path.join(WORKSPACE, 'boosterstate/target/release/boosterstate.d'),
  ];

  console.log('\n── Phase 1: Deleting Rust build artifacts ──');
  let freed = 0;

  for (const t of targets) {
    if (!fs.existsSync(t)) { console.log(`  skip (missing): ${t}`); continue; }
    try {
      const stat = fs.statSync(t);
      if (stat.isDirectory()) {
        // measure first
        let dirSize = 0;
        const count = (d: string) => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const f = path.join(d, e.name);
            if (e.isDirectory()) count(f);
            else dirSize += fs.statSync(f).size;
          }
        };
        try { count(t); } catch {}
        fs.rmSync(t, { recursive: true, force: true });
        freed += dirSize;
        console.log(`  ✅ deleted dir  ${t}  (${fmtBytes(dirSize)})`);
      } else {
        freed += stat.size;
        fs.rmSync(t, { force: true });
        console.log(`  ✅ deleted file ${t}  (${fmtBytes(stat.size)})`);
      }
    } catch (e) {
      console.log(`  ⚠️  failed: ${t} — ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`  → Freed ${fmtBytes(freed)} from Rust build artifacts`);
  return freed;
}

// ── Phase 2: push directories to PDIM then delete ────────────────────────────
interface OffloadTarget {
  localDir: string;
  pdimPrefix: string;  // PDIM key prefix for all files in this dir
  deleteAfter: boolean;
}

const OFFLOAD_TARGETS: OffloadTarget[] = [
  // ai_model weights → must match modelWeightStorage.ts pocket path format
  // The pocket uses namespace "ai-model-weights" and paths like "weights/<name>.json"
  // We push to the raw PDIM namespace used by that pocket
  {
    localDir: 'ai_model',
    pdimPrefix: 'archive/ai_model',
    deleteAfter: true,
  },
  {
    localDir: 'attached_assets',
    pdimPrefix: 'archive/attached_assets',
    deleteAfter: true,
  },
  {
    localDir: 'diffusion',
    pdimPrefix: 'archive/diffusion',
    deleteAfter: true,
  },
  {
    localDir: 'built-in plugins dsp',
    pdimPrefix: 'archive/built-in-plugins-dsp',
    deleteAfter: true,
  },
  {
    localDir: 'pocket dimension storage tech',
    pdimPrefix: 'archive/pocket-dimension-storage-tech',
    deleteAfter: true,
  },
  {
    localDir: 'AI training server',
    pdimPrefix: 'archive/ai-training-server',
    deleteAfter: true,
  },
  {
    localDir: 'Max Booster final documentation',
    pdimPrefix: 'archive/max-booster-docs',
    deleteAfter: true,
  },
  {
    localDir: 'docs',
    pdimPrefix: 'archive/docs',
    deleteAfter: true,
  },
  {
    localDir: 'android',
    pdimPrefix: 'archive/android',
    deleteAfter: true,
  },
  {
    localDir: 'ios',
    pdimPrefix: 'archive/ios',
    deleteAfter: true,
  },
  {
    localDir: 'electron',
    pdimPrefix: 'archive/electron',
    deleteAfter: true,
  },
];

async function offloadDirectory(target: OffloadTarget): Promise<{ pushed: number; freed: number; failed: number }> {
  const WORKSPACE = process.cwd();
  const absDir = path.join(WORKSPACE, target.localDir);
  const files = collectFiles(absDir);

  if (files.length === 0) {
    console.log(`  skip (empty/missing): ${target.localDir}`);
    return { pushed: 0, freed: 0, failed: 0 };
  }

  let pushed = 0;
  let failed = 0;
  let totalSize = 0;

  console.log(`\n  Pushing ${files.length} files from "${target.localDir}" → PDIM prefix "${target.pdimPrefix}"`);

  for (const filePath of files) {
    const relPath = path.relative(absDir, filePath);
    const pdimKey = `${target.pdimPrefix}/${relPath.replace(/\\/g, '/')}`;
    const data = fs.readFileSync(filePath);

    try {
      await pushFile(pdimKey, data);
      const ok = await verifyFile(pdimKey, data.length);
      if (ok) {
        pushed++;
        totalSize += data.length;
        process.stdout.write('.');
      } else {
        failed++;
        console.log(`\n  ⚠️  verify failed: ${relPath}`);
      }
    } catch (e) {
      failed++;
      console.log(`\n  ❌ push failed: ${relPath} — ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n  → ${pushed} pushed, ${failed} failed, ${fmtBytes(totalSize)} total`);

  if (target.deleteAfter && failed === 0 && pushed === files.length) {
    try {
      fs.rmSync(absDir, { recursive: true, force: true });
      console.log(`  🗑️  deleted local: ${target.localDir} (${fmtBytes(totalSize)} freed)`);
      return { pushed, freed: totalSize, failed };
    } catch (e) {
      console.log(`  ⚠️  could not delete ${target.localDir}: ${e instanceof Error ? e.message : e}`);
    }
  } else if (failed > 0) {
    console.log(`  ⚠️  skipping delete of "${target.localDir}" due to ${failed} push failure(s)`);
  }

  return { pushed, freed: 0, failed };
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Max Booster → PDIM Offload Script');
  console.log('════════════════════════════════════════════════════════════');

  // Phase 1: delete Rust build artifacts
  const freedArtifacts = deleteRustArtifacts();

  // Phase 2: push directories to PDIM
  console.log('\n── Phase 2: Pushing directories to PDIM ──');

  let totalPushed = 0;
  let totalFreed = 0;
  let totalFailed = 0;

  for (const target of OFFLOAD_TARGETS) {
    const result = await offloadDirectory(target);
    totalPushed += result.pushed;
    totalFreed += result.freed;
    totalFailed += result.failed;
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Rust artifacts deleted:  ${fmtBytes(freedArtifacts)}`);
  console.log(`  Files pushed to PDIM:    ${totalPushed}`);
  console.log(`  Data offloaded to PDIM:  ${fmtBytes(totalFreed)}`);
  console.log(`  Failed pushes:           ${totalFailed}`);
  console.log(`  Total disk freed:        ${fmtBytes(freedArtifacts + totalFreed)}`);

  if (totalFailed > 0) {
    console.log('\n  ⚠️  Some files failed to push. Local copies retained for those directories.');
    process.exit(1);
  } else {
    console.log('\n  ✅ All done.');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
