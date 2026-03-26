import { readdirSync, unlinkSync, rmSync, existsSync, statSync } from 'fs';
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

console.log(`[deploy-clean] Binary file cleanup complete — removed ${total} binary file(s) + cleared binary dirs.`);
