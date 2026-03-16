/**
 * migrate-to-pdim.ts
 *
 * Uploads local generated-content and public asset files to PDIM using
 * gzip-compressed chunked storage, then deletes the local copies.
 *
 * PDIM exec endpoint: { cmd, args } format
 * Chunk size: 60 KB of base64 (safe under the ~90 KB body limit)
 *
 * Run with:  npx tsx scripts/migrate-to-pdim.ts
 */

import fs   from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip   = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const EXEC_URL = process.env.PDIM_HTTP_EXEC_URL || process.env.PDIM_EXEC_URL;
const TOKEN    = process.env.PDIM_BEARER_TOKEN   || process.env.PDIM_EXEC_TOKEN;

if (!EXEC_URL || !TOKEN) {
  console.error('PDIM_HTTP_EXEC_URL / PDIM_BEARER_TOKEN not set');
  process.exit(1);
}

const CHUNK_BYTES = 60 * 1024; // 60 KB base64 per chunk

// ── PDIM primitives ───────────────────────────────────────────────────────────
async function pdimExec(cmd: string, ...args: (string | number)[]): Promise<any> {
  const r = await fetch(EXEC_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ cmd, args }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`PDIM ${cmd} → ${r.status}: ${t.slice(0, 120)}`);
  }
  return (await r.json() as any).result;
}

const pdimSet = (k: string, v: string) => pdimExec('SET', k, v);
const pdimGet = (k: string)             => pdimExec('GET', k) as Promise<string | null>;

// ── Store a file as chunked gzip in PDIM ─────────────────────────────────────
async function pushToPdim(filePath: string): Promise<void> {
  const rel = path.relative('.', filePath);
  const key = `local-file:${rel}`;

  // Already stored?
  const existing = await pdimGet(key).catch(() => null);
  if (existing) {
    fs.unlinkSync(filePath);
    return;
  }

  const raw        = fs.readFileSync(filePath);
  const compressed = await gzip(raw, { level: zlib.constants.Z_BEST_COMPRESSION });

  // Split compressed buffer into 60 KB base64 chunks
  const b64        = compressed.toString('base64');
  const chunkKeys: string[] = [];

  for (let i = 0, offset = 0; offset < b64.length; i++, offset += CHUNK_BYTES) {
    const slice    = b64.slice(offset, offset + CHUNK_BYTES);
    const chunkKey = `${key}:chunk:${i}`;
    await pdimSet(chunkKey, slice);
    chunkKeys.push(chunkKey);
  }

  // Manifest
  await pdimSet(key, JSON.stringify({
    v: 1,
    enc: 'gzip+base64-chunks',
    rawBytes: raw.length,
    compBytes: compressed.length,
    b64Len: b64.length,
    chunks: chunkKeys,
    storedAt: Date.now(),
    path: rel,
  }));

  fs.unlinkSync(filePath);
}

// ── Walk directory ────────────────────────────────────────────────────────────
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    e.isDirectory() ? out.push(...walk(full)) : out.push(full);
  }
  return out;
}

function rmEmptyDirs(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }))
    if (e.isDirectory()) rmEmptyDirs(path.join(dir, e.name));
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const targets: string[] = [
    'public/generated-content',
    'public/images',
    'pocket-dimensions',        // local pocket-dimension state
  ];

  let pushed = 0, skipped = 0, errors = 0, bytes = 0;

  for (const target of targets) {
    if (!fs.existsSync(target)) { console.log(`Skip: ${target} not found`); continue; }

    const st    = fs.statSync(target);
    const files = st.isDirectory() ? walk(target) : [target];
    console.log(`\n[${target}] ${files.length} file(s)`);

    for (const f of files) {
      const sz  = fs.statSync(f).size;
      const rel = path.relative('.', f);
      process.stdout.write(`  ${rel} (${(sz/1024).toFixed(0)} KB) ... `);
      try {
        const existed = (await pdimGet(`local-file:${rel}`).catch(() => null)) !== null;
        await pushToPdim(f);
        bytes += sz;
        if (existed) { skipped++; console.log('skipped (was in PDIM, local copy removed)'); }
        else          { pushed++;  console.log('pushed'); }
      } catch (err: any) {
        errors++;
        console.log(`ERROR: ${err.message}`);
      }
    }

    if (st.isDirectory()) rmEmptyDirs(target);
  }

  console.log(`
=== Migration complete ===
  Pushed  : ${pushed} files  (${(bytes/1024/1024).toFixed(1)} MB freed locally)
  Skipped : ${skipped} (already in PDIM)
  Errors  : ${errors}
`);
}

main().catch(e => { console.error(e); process.exit(1); });
