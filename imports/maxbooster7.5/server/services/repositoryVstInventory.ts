import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { inspectWindowsVst3File } from './vstBinaryInspection.js';

export interface RepositoryVstPlugin {
  id: string; name: string; vendor: string; version: string; format: 'vst3';
  bundle: string; classId: string; platforms: string[]; architecture: 'x86_64';
  available: false; reason: string; sha256: string; exportDirectoryPresent: boolean;
  vst3FactoryExported: boolean; exportedEntrypoints: string[];
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
      const inspected = await inspectWindowsVst3File(binaryPath);
      plugins.push({ id: `repository-vst3-${component.CID}`, classId: component.CID,
        name: String(component.Name || manifest.Name || entry.name), vendor: String(component.Vendor || ''), version: String(component.Version || manifest.Version || ''),
        bundle: entry.name, format: 'vst3', platforms: ['windows'], architecture: 'x86_64', available: false,
        reason: inspected.vst3FactoryExported
          ? 'Windows VST3 factory export found; processing is unverified. Linux rebuild requires the original JUCE/C++ project and a native host.'
          : inspected.exportDirectoryPresent
            ? 'This Windows build does not export a local executable GetPluginFactory. Restore the original JUCE/C++ project to build and validate the Linux plugin.'
            : 'This Windows build has no VST3 export directory. Restore the original JUCE/C++ project to build and validate the Linux plugin.',
        exportDirectoryPresent: inspected.exportDirectoryPresent,
        vst3FactoryExported: inspected.vst3FactoryExported, exportedEntrypoints: inspected.exportedEntrypoints,
        sha256: inspected.sha256 });
    } catch (error) { errors.push(`${entry.name}: ${error instanceof Error ? error.message : 'Invalid bundle'}`); }
  }
  return { plugins, errors, nativeProcessing: false, reason: 'A native VST3 execution host is not installed' };
}

export class NativeVstHostUnavailable extends Error {
  readonly status = 503;
  constructor() { super('Native VST3 processing requires a compatible execution host; no host is connected'); }
}
