import { readdir, readFile, realpath, stat, open } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface RepositoryVstPlugin {
  id: string; name: string; vendor: string; version: string; format: 'vst3';
  bundle: string; classId: string; platforms: string[]; architecture: 'x86_64';
  available: false; reason: string; sha256: string; exportDirectoryPresent: boolean;
}

// Steinberg's generated moduleinfo.json may contain trailing separators.
// Remove only separators outside quoted strings; never evaluate the manifest.
function parseManifest(source: string): Record<string, unknown> {
  let output = ''; let quoted = false; let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (!quoted && ch === ',' && /^\s*[}\]]/.test(source.slice(i + 1))) continue;
    output += ch;
    if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; }
    else if (ch === '"') quoted = true;
  }
  return JSON.parse(output);
}

export async function repositoryVstInventory(root = process.cwd()) {
  const plugins: RepositoryVstPlugin[] = []; const errors: string[] = [];
  const directory = path.resolve(root, 'VST3');
  const canonical = await realpath(directory).catch(() => null);
  if (!canonical) return { plugins, errors, nativeProcessing: false, reason: 'No repository VST3 bundles are installed' };
  if (canonical !== directory) throw new Error('Repository VST3 directory must not be a symlink');
  const entries = (await readdir(directory, { withFileTypes: true })).filter(e => e.isDirectory() && e.name.endsWith('.vst3')).slice(0, 128);
  for (const entry of entries) {
    try {
      const bundle = path.join(directory, entry.name);
      const manifestPath = path.join(bundle, 'Contents/Resources/moduleinfo.json');
      const binaryPath = path.join(bundle, 'Contents/x86_64-win', entry.name);
      for (const file of [manifestPath, binaryPath]) {
        const actual = await realpath(file);
        if (!actual.startsWith(`${canonical}${path.sep}`)) throw new Error('Bundle path escapes the repository inventory');
      }
      if ((await stat(manifestPath)).size > 256 * 1024) throw new Error('Manifest exceeds its size limit');
      const manifest = parseManifest(await readFile(manifestPath, 'utf8'));
      const classes = Array.isArray(manifest.Classes) ? manifest.Classes as Record<string, unknown>[] : [];
      const component = classes.find(c => c.Category === 'Audio Module Class');
      if (!component || typeof component.CID !== 'string' || !/^[0-9a-f]{32}$/i.test(component.CID)) throw new Error('No valid audio component class');
      const handle = await open(binaryPath, 'r');
      let exportDirectoryPresent = false;
      try {
        const header = Buffer.alloc(64); await handle.read(header, 0, header.length, 0);
        if (header.toString('ascii', 0, 2) !== 'MZ') throw new Error('Windows bundle has no PE executable');
        const peOffset = header.readUInt32LE(60);
        const pe = Buffer.alloc(6); await handle.read(pe, 0, pe.length, peOffset);
        if (pe.toString('ascii', 0, 4) !== 'PE\0\0' || pe.readUInt16LE(4) !== 0x8664) throw new Error('Expected a Windows x64 VST3 binary');
        const exports = Buffer.alloc(8); await handle.read(exports, 0, exports.length, peOffset + 24 + 112);
        exportDirectoryPresent = exports.readUInt32LE(0) !== 0 && exports.readUInt32LE(4) !== 0;
      } finally { await handle.close(); }
      if ((await stat(binaryPath)).size > 128 * 1024 * 1024) throw new Error('Plugin binary exceeds inventory limit');
      plugins.push({ id: `repository-vst3-${component.CID}`, classId: component.CID,
        name: String(component.Name || manifest.Name || entry.name), vendor: String(component.Vendor || ''), version: String(component.Version || manifest.Version || ''),
        bundle: entry.name, format: 'vst3', platforms: ['windows'], architecture: 'x86_64', available: false,
        reason: exportDirectoryPresent ? 'Linux rebuild requires the original JUCE/C++ project and a native host.' : 'This Windows build has no VST3 export directory. Restore the original JUCE/C++ project to build and validate the Linux plugin.',
        exportDirectoryPresent,
        sha256: createHash('sha256').update(await readFile(binaryPath)).digest('hex') });
    } catch (error) { errors.push(`${entry.name}: ${error instanceof Error ? error.message : 'Invalid bundle'}`); }
  }
  return { plugins, errors, nativeProcessing: false, reason: 'A native VST3 execution host is not installed' };
}

export class NativeVstHostUnavailable extends Error {
  readonly status = 503;
  constructor() { super('Native VST3 processing requires a compatible execution host; no host is connected'); }
}
