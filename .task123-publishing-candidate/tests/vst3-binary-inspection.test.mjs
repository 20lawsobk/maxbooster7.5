import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadDatabaseSubject } from './payment-processing/helpers-database-postgres.mjs';

// File-backed PE32+ export table, deliberately distinct from raw name strings.
// These bytes are never executed. Export ordinals differ from name indexes.
function peFixture(names = ['ExitDll', 'GetPluginFactory', 'InitDll']) {
  const bytes = Buffer.alloc(0x1000);
  bytes.write('MZ'); bytes.writeUInt32LE(0x80, 60); bytes.write('PE\0\0', 0x80);
  bytes.writeUInt16LE(0x8664, 0x84); bytes.writeUInt16LE(2, 0x86);
  bytes.writeUInt16LE(240, 0x94); bytes.writeUInt16LE(0x2022, 0x96);
  bytes.writeUInt16LE(0x20b, 0x98); bytes.writeUInt32LE(0x200, 0xd4);
  bytes.writeUInt32LE(16, 0x104);
  bytes.writeUInt32LE(0x1000, 0x108); bytes.writeUInt32LE(0x180, 0x10c);
  for (const [index, address, size, offset, flags] of [[0, 0x1000, 0x800, 0x200, 0x40000040], [1, 0x2000, 0x200, 0xa00, 0x60000020]]) {
    const section = 0x188 + index * 40;
    bytes.writeUInt32LE(size, section + 8); bytes.writeUInt32LE(address, section + 12);
    bytes.writeUInt32LE(size, section + 16); bytes.writeUInt32LE(offset, section + 20);
    bytes.writeUInt32LE(flags, section + 36);
  }
  bytes.writeUInt32LE(3, 0x214); bytes.writeUInt32LE(3, 0x218);
  bytes.writeUInt32LE(0x1040, 0x21c); bytes.writeUInt32LE(0x1050, 0x220); bytes.writeUInt32LE(0x1060, 0x224);
  [0x2010, 0x2020, 0x2000].forEach((address, i) => bytes.writeUInt32LE(address, 0x240 + i * 4));
  [2, 0, 1].forEach((ordinal, i) => bytes.writeUInt16LE(ordinal, 0x260 + i * 2));
  let offset = 0x280;
  names.forEach((name, i) => {
    bytes.writeUInt32LE(offset + 0xe00, 0x250 + i * 4);
    bytes.write(name + '\0', offset); offset += name.length + 1;
  });
  bytes.write('GetPluginFactory\0', 0xc00); // An unrelated string is not an export.
  return bytes;
}

const { inspectWindowsVst3Binary, inspectWindowsVst3File } = await loadDatabaseSubject('server/services/vstBinaryInspection.ts');

test('VST3 static inspection follows PE names, ordinals and executable function addresses', () => {
  assert.deepEqual(inspectWindowsVst3Binary(peFixture()), {
    exportDirectoryPresent: true, vst3FactoryExported: true,
    exportedEntrypoints: ['ExitDll', 'GetPluginFactory', 'InitDll'],
  });
  const noDirectory = peFixture(); noDirectory.fill(0, 0x108, 0x110);
  assert.deepEqual(inspectWindowsVst3Binary(noDirectory), {
    exportDirectoryPresent: false, vst3FactoryExported: false, exportedEntrypoints: [],
  });
  const unrelated = inspectWindowsVst3Binary(peFixture(['ExitDll', 'OtherFactory', 'InitDll']));
  assert.equal(unrelated.exportDirectoryPresent, true); assert.equal(unrelated.vst3FactoryExported, false);
});

test('a named export cannot impersonate a local VST3 factory through forwarding, nulls or data', () => {
  for (const target of [0, 0x1100, 0x11f0]) {
    const bytes = peFixture(); bytes.writeUInt32LE(target, 0x240);
    bytes.write('another.GetPluginFactory\0', 0x300);
    const inspected = inspectWindowsVst3Binary(bytes);
    assert.equal(inspected.exportDirectoryPresent, true);
    assert.equal(inspected.vst3FactoryExported, false, `target ${target}`);
    assert.deepEqual(inspected.exportedEntrypoints, ['ExitDll', 'InitDll']);
  }
});

test('malformed and truncated executables fail closed within bounded export tables', async t => {
  const corruptions = {
    'truncated DOS header': () => Buffer.alloc(10),
    'PE offset outside file': bytes => bytes.writeUInt32LE(0xffffff, 60),
    'wrong architecture': bytes => bytes.writeUInt16LE(0x14c, 0x84),
    'not a DLL': bytes => bytes.writeUInt16LE(0x22, 0x96),
    'not PE32+': bytes => bytes.writeUInt16LE(0x10b, 0x98),
    'truncated optional header': bytes => bytes.writeUInt16LE(0xffff, 0x94),
    'directory count outside optional header': bytes => bytes.writeUInt32LE(17, 0x104),
    'export directory outside sections': bytes => bytes.writeUInt32LE(0xffff, 0x108),
    'section raw bytes outside file': bytes => bytes.writeUInt32LE(0x10000, 0x198),
    'overlapping RVA mappings': bytes => bytes.writeUInt32LE(0x1000, 0x1bc),
    'oversized name table': bytes => bytes.writeUInt32LE(65537, 0x218),
    'invalid name address': bytes => bytes.writeUInt32LE(0xffff, 0x254),
    'invalid ordinal': bytes => bytes.writeUInt16LE(3, 0x262),
    'invalid function table address': bytes => bytes.writeUInt32LE(0xffff, 0x21c),
    'invalid factory address': bytes => bytes.writeUInt32LE(0xffff, 0x240),
    'unterminated name at section boundary': bytes => {
      bytes.writeUInt32LE(0x17f0, 0x254); bytes.fill(0x41, 0x9f0, 0xa00);
    },
  };
  for (const [name, corrupt] of Object.entries(corruptions)) await t.test(name, () => {
    const bytes = peFixture(); const changed = corrupt(bytes);
    assert.throws(() => inspectWindowsVst3Binary(Buffer.isBuffer(changed) ? changed : bytes), /Invalid Windows VST3 binary/);
  });
});

test('repository inventory exposes actual factory verification without claiming processing', async () => {
  const { repositoryVstInventory } = await loadDatabaseSubject('server/services/repositoryVstInventory.ts');
  const root = mkdtempSync(path.join(os.tmpdir(), 'vst3-export-inventory-'));
  const bundle = path.join(root, 'VST3/Test.vst3/Contents');
  const binary = path.join(bundle, 'x86_64-win/Test.vst3');
  try {
    mkdirSync(path.dirname(binary), { recursive: true }); mkdirSync(path.join(bundle, 'Resources'));
    writeFileSync(path.join(bundle, 'Resources/moduleinfo.json'), JSON.stringify({
      Name: 'Test', Classes: [{ CID: '565354556B6B776D617820626F6F7374', Name: 'Test', Category: 'Audio Module Class' }],
    }));
    const bytes = peFixture(); writeFileSync(binary, bytes);
    const inventory = await repositoryVstInventory(root);
    assert.deepEqual(inventory.errors, []); assert.equal(inventory.nativeProcessing, false);
    assert.equal(inventory.plugins[0].vst3FactoryExported, true); assert.equal(inventory.plugins[0].available, false);
    assert.match(inventory.plugins[0].reason, /processing is unverified/);
    const inspected = await inspectWindowsVst3File(binary);
    assert.equal(inspected.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(inspected.bytes, bytes.length);
    writeFileSync(binary, peFixture(['ExitDll', 'OtherFactory', 'InitDll']));
    assert.match((await repositoryVstInventory(root)).plugins[0].reason, /does not export a local executable GetPluginFactory/);
    writeFileSync(binary, 'MZ');
    const invalid = await repositoryVstInventory(root);
    assert.equal(invalid.plugins.length, 0); assert.equal(invalid.errors.length, 1); assert.equal(invalid.nativeProcessing, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('inspection CLI reports static evidence and rejects invalid input', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'vst3-inspect-cli-'));
  try {
    const binary = path.join(root, 'Test.dll'); writeFileSync(binary, peFixture());
    const run = args => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/inspect-vst3-binary.ts', ...args], {
      encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, LANG: 'C' }, timeout: 30_000,
    });
    const result = run([binary]); assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.vst3FactoryExported, true); assert.equal(report.processingVerified, false);
    writeFileSync(binary, 'not a PE');
    const invalid = run([binary]); assert.equal(invalid.status, 1); assert.match(invalid.stderr, /Invalid Windows VST3/);
    assert.equal(run([]).status, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
