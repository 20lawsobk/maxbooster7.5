import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const MAX_BINARY_BYTES = 128 * 1024 * 1024;
const VST3_ENTRYPOINTS = new Set(['GetPluginFactory', 'InitDll', 'ExitDll']);

/** Static inspection only: never load the library or infer that its DSP works. */
export function inspectWindowsVst3Binary(bytes: Buffer) {
  const invalid = (detail: string): never => { throw new Error(`Invalid Windows VST3 binary: ${detail}`); };
  const range = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > bytes.length) invalid('truncated executable data');
  };
  if (bytes.length > MAX_BINARY_BYTES) invalid('binary exceeds inventory limit');
  range(0, 64);
  if (bytes.toString('latin1', 0, 2) !== 'MZ') invalid('missing DOS header');
  const pe = bytes.readUInt32LE(60);
  range(pe, 24);
  if (pe < 64 || bytes.toString('latin1', pe, pe + 4) !== 'PE\0\0' || bytes.readUInt16LE(pe + 4) !== 0x8664) {
    invalid('expected a Windows x64 PE executable');
  }
  if (!(bytes.readUInt16LE(pe + 22) & 0x2000)) invalid('expected a DLL');
  const sectionCount = bytes.readUInt16LE(pe + 6);
  const optionalSize = bytes.readUInt16LE(pe + 20);
  const optional = pe + 24;
  range(optional, optionalSize);
  if (optionalSize < 112 || bytes.readUInt16LE(optional) !== 0x20b) invalid('expected a PE32+ optional header');
  if (!sectionCount || sectionCount > 96) invalid('unsupported section count');
  const sectionTable = optional + optionalSize;
  range(sectionTable, sectionCount * 40);
  const headerSize = bytes.readUInt32LE(optional + 60);
  if (headerSize < sectionTable + sectionCount * 40) invalid('section table exceeds executable headers');
  range(0, headerSize);
  const sections = Array.from({ length: sectionCount }, (_, i) => {
    const offset = sectionTable + i * 40;
    const address = bytes.readUInt32LE(offset + 12);
    const length = bytes.readUInt32LE(offset + 16);
    const fileOffset = bytes.readUInt32LE(offset + 20);
    if (length) {
      range(fileOffset, length);
      if (fileOffset < headerSize || address < headerSize || address + length > 0x100000000) invalid('invalid section bounds');
    }
    return { address, length, fileOffset, executable: Boolean(bytes.readUInt32LE(offset + 36) & 0x20000000) };
  });
  const mapped = (address: number, length: number) => {
    if (!address) return invalid('missing export address');
    if (address + length <= headerSize) return { offset: address, end: headerSize, executable: false };
    const matches = sections.filter(s => address >= s.address && address + length <= s.address + s.length);
    if (matches.length !== 1) return invalid('export address is outside a unique file-backed section');
    const section = matches[0];
    return { offset: section.fileOffset + address - section.address, end: section.fileOffset + section.length, executable: section.executable };
  };
  const result = { exportDirectoryPresent: false, vst3FactoryExported: false, exportedEntrypoints: [] as string[] };
  const directoryCount = bytes.readUInt32LE(optional + 108);
  if (!directoryCount) return result;
  if (directoryCount > Math.floor((optionalSize - 112) / 8)) invalid('data directories exceed optional header');
  const exportAddress = bytes.readUInt32LE(optional + 112);
  const exportSize = bytes.readUInt32LE(optional + 116);
  if (!exportAddress && !exportSize) return result;
  if (!exportAddress || exportSize < 40 || exportAddress + exportSize > 0x100000000) invalid('invalid export directory');
  const directory = mapped(exportAddress, exportSize).offset;
  result.exportDirectoryPresent = true;
  const functionCount = bytes.readUInt32LE(directory + 20);
  const nameCount = bytes.readUInt32LE(directory + 24);
  if (functionCount > 65536 || nameCount > 65536 || (nameCount && !functionCount)) invalid('invalid export counts');
  if (!functionCount || !nameCount) return result;
  const functions = mapped(bytes.readUInt32LE(directory + 28), functionCount * 4).offset;
  const names = mapped(bytes.readUInt32LE(directory + 32), nameCount * 4).offset;
  const ordinals = mapped(bytes.readUInt32LE(directory + 36), nameCount * 2).offset;
  for (let i = 0; i < nameCount; i++) {
    const name = mapped(bytes.readUInt32LE(names + i * 4), 1);
    const end = bytes.subarray(name.offset, Math.min(name.end, name.offset + 1024)).indexOf(0);
    if (end < 0) invalid('unterminated export name');
    const symbol = bytes.toString('latin1', name.offset, name.offset + end);
    const ordinal = bytes.readUInt16LE(ordinals + i * 2);
    if (ordinal >= functionCount) invalid('export ordinal exceeds function table');
    if (!VST3_ENTRYPOINTS.has(symbol)) continue;
    const target = bytes.readUInt32LE(functions + ordinal * 4);
    // A forwarded name or a data export is not this binary's factory function.
    if (!target || (target >= exportAddress && target < exportAddress + exportSize)) continue;
    if (mapped(target, 1).executable) result.exportedEntrypoints.push(symbol);
  }
  result.exportedEntrypoints = [...new Set(result.exportedEntrypoints)].sort();
  result.vst3FactoryExported = result.exportedEntrypoints.includes('GetPluginFactory');
  return result;
}

export async function inspectWindowsVst3File(file: string) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_BINARY_BYTES) throw new Error('Plugin binary must be a regular file within the 128 MiB inventory limit');
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error('Plugin binary changed during inspection');
      offset += bytesRead;
    }
    if ((await handle.stat()).size !== info.size) throw new Error('Plugin binary changed during inspection');
    return { ...inspectWindowsVst3Binary(bytes), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally { await handle.close(); }
}
