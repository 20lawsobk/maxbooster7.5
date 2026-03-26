import { readdirSync, unlinkSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const BINARY_EXTENSIONS = [
  '.br', '.gz', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.bin', '.so', '.dylib',
  '.mp3', '.mp4', '.wav', '.ogg', '.flac',
];

const DIRS_TO_CLEAN_BY_EXT = ['dist/public', 'client/public'];

const DIRS_TO_REMOVE_ENTIRELY = [
  'boosterstate/target/debug',
  'attached_assets',
];

// ── Disk cleanup ─────────────────────────────────────────────────────────────

function deleteBinaryFiles(dir) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += deleteBinaryFiles(full);
    } else if (BINARY_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      unlinkSync(full);
      console.log('[deploy-clean] removed', full);
      count++;
    }
  }
  return count;
}

let total = 0;
for (const dir of DIRS_TO_CLEAN_BY_EXT) {
  total += deleteBinaryFiles(dir);
}
for (const dir of DIRS_TO_REMOVE_ENTIRELY) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log('[deploy-clean] removed dir:', dir);
  }
}
console.log(`[deploy-clean] Disk cleanup complete — removed ${total} binary file(s).`);

// ── Git index cleanup ─────────────────────────────────────────────────────────
// The Repl layer is built from the git index (git archive HEAD).
// Any binary-content or binary-named file that Replit auto-committed must also
// be purged from the git index, otherwise it re-appears in the Repl layer even
// after disk deletion.

const GIT_INDEX = '.git/index';

if (!existsSync(GIT_INDEX)) {
  console.log('[deploy-clean] No git index found, skipping git cleanup.');
  process.exit(0);
}

function readUint32BE(buf, offset) {
  return (buf[offset] << 24 | buf[offset+1] << 16 | buf[offset+2] << 8 | buf[offset+3]) >>> 0;
}
function writeUint32BE(buf, offset, value) {
  buf[offset]   = (value >>> 24) & 0xFF;
  buf[offset+1] = (value >>> 16) & 0xFF;
  buf[offset+2] = (value >>> 8)  & 0xFF;
  buf[offset+3] =  value         & 0xFF;
}

const ENTRY_FIXED = 62;
const BINARY_EXT_SET = new Set(BINARY_EXTENSIONS);

// Directories whose contents should be removed from git tracking
const TRACKED_DIRS_TO_PURGE = ['attached_assets/'];

function shouldRemoveFromIndex(filename) {
  // Remove non-UTF-8 filenames
  try { filename } catch { return true; }
  const isUtf8 = (() => { try { Buffer.from(filename).toString('utf8'); return true; } catch { return false; } })();
  if (!isUtf8) return true;

  const decoded = filename.toString('utf8');

  // Remove files in purged directories
  for (const dir of TRACKED_DIRS_TO_PURGE) {
    if (decoded.startsWith(dir)) return true;
  }

  // Remove files with binary extensions
  const lastDot = decoded.lastIndexOf('.');
  if (lastDot >= 0) {
    const ext = decoded.slice(lastDot).toLowerCase();
    if (BINARY_EXT_SET.has(ext)) return true;
  }

  return false;
}

try {
  const raw = readFileSync(GIT_INDEX);
  const magic = raw.slice(0, 4).toString('ascii');
  if (magic !== 'DIRC') {
    console.warn('[deploy-clean] Unexpected git index magic, skipping git cleanup.');
    process.exit(0);
  }

  const version = readUint32BE(raw, 4);
  const numEntries = readUint32BE(raw, 8);

  let pos = 12;
  const keptEntries = [];
  const removedNames = [];

  for (let i = 0; i < numEntries; i++) {
    const entryStart = pos;
    const fixedBytes = raw.slice(pos, pos + ENTRY_FIXED);
    pos += ENTRY_FIXED;

    let nullPos = pos;
    while (nullPos < raw.length && raw[nullPos] !== 0) nullPos++;
    const fname = raw.slice(pos, nullPos);
    const fnameLen = nullPos - pos;
    pos = nullPos + 1;

    const totalSoFar = ENTRY_FIXED + fnameLen + 1;
    const rem = totalSoFar % 8;
    if (rem !== 0) pos += (8 - rem);

    const remove = shouldRemoveFromIndex(fname);
    if (remove) {
      removedNames.push(fname.toString('latin1'));
    } else {
      keptEntries.push({ fixedBytes, fname });
    }
  }

  if (removedNames.length === 0) {
    console.log('[deploy-clean] Git index is already clean (no binary-named or binary-content entries).');
    process.exit(0);
  }

  // Find extensions (after all entries, before final 20-byte SHA-1)
  let extStart = pos;
  const extensions = raw.slice(extStart, raw.length - 20);

  // Rebuild index
  const parts = [];
  const header = Buffer.alloc(12);
  header.write('DIRC', 0, 'ascii');
  writeUint32BE(header, 4, version);
  writeUint32BE(header, 8, keptEntries.length);
  parts.push(header);

  for (const { fixedBytes, fname } of keptEntries) {
    parts.push(fixedBytes);
    parts.push(fname);
    const nullCount = (() => {
      const n = (8 - (ENTRY_FIXED + fname.length) % 8) % 8;
      return n === 0 ? 8 : n;
    })();
    parts.push(Buffer.alloc(nullCount, 0));
  }

  // Omit the TREE extension (it's stale after removing entries); git will rebuild it
  // Keep other extensions (like REUC for reuse-undo) if present
  let extPos = 0;
  while (extPos + 8 <= extensions.length) {
    const sig = extensions.slice(extPos, extPos + 4).toString('ascii');
    const extSize = readUint32BE(extensions, extPos + 4);
    if (sig !== 'TREE') {
      parts.push(extensions.slice(extPos, extPos + 8 + extSize));
    }
    extPos += 8 + extSize;
  }

  const body = Buffer.concat(parts);
  const sha1 = createHash('sha1').update(body).digest();
  const newIndex = Buffer.concat([body, sha1]);

  writeFileSync(GIT_INDEX, newIndex);

  // Verify
  const verify = readFileSync(GIT_INDEX);
  const computed = createHash('sha1').update(verify.slice(0, -20)).digest();
  const stored = verify.slice(-20);
  if (computed.equals(stored)) {
    console.log(`[deploy-clean] Git index updated — removed ${removedNames.length} entry(ies), ${keptEntries.length} remaining. SHA-1 OK.`);
    for (const n of removedNames) console.log(`  removed from index: ${JSON.stringify(n)}`);
  } else {
    console.error('[deploy-clean] Git index SHA-1 mismatch after rewrite! Possible corruption.');
    process.exit(1);
  }
} catch (err) {
  console.warn('[deploy-clean] Git index cleanup error (non-fatal):', err.message);
}
