import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadDatabaseSubject } from './payment-processing/helpers-database-postgres.mjs';

test('JUCE Linux translation preserves original identity, sources, modules and resources', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'juce-linux-config-'));
  try {
    mkdirSync(path.join(root, 'Source')); mkdirSync(path.join(root, 'JUCE'));
    writeFileSync(path.join(root, 'JUCE/CMakeLists.txt'), '# fixture framework boundary');
    writeFileSync(path.join(root, 'Source/PluginProcessor.cpp'), '// original compilation unit');
    writeFileSync(path.join(root, 'Source/sound.dat'), 'original resource');
    const project = path.join(root, 'MaxBooster.jucer');
    writeFileSync(project, '<JUCERPROJECT projectType="audioplug" version="1.2.3" pluginCode="Ukkw" pluginManufacturerCode="MaxB" pluginName="Max Booster" companyName="Original Company" pluginCharacteristicsValue="pluginIsSynth,pluginWantsMidiIn"><MAINGROUP><FILE file="Source/PluginProcessor.cpp" compile="1"/><FILE file="Source/sound.dat" resource="1"/></MAINGROUP><MODULES><MODULE id="juce_audio_processors"/><MODULE id="juce_dsp"/></MODULES></JUCERPROJECT>');
    const args = ['scripts/build-linux-vst3.py', '--project', project, '--juce', path.join(root, 'JUCE'), '--output', path.join(root, 'out'), '--configure-only'];
    const result = spawnSync('python3', args, { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(path.join(root, 'out/project/CMakeLists.txt'), 'utf8');
    for (const expected of ['FORMATS VST3', 'PLUGIN_CODE Ukkw', 'PLUGIN_MANUFACTURER_CODE MaxB', 'IS_SYNTH TRUE', 'NEEDS_MIDI_INPUT TRUE', 'PluginProcessor.cpp', 'juce::juce_dsp', 'juce_add_binary_data']) assert(text.includes(expected), expected);
    assert.equal(JSON.parse(result.stdout).built, false);
    rmSync(path.join(root, 'Source/PluginProcessor.cpp'));
    const missing = spawnSync('python3', args, { encoding: 'utf8' }); assert.equal(missing.status, 1); assert.match(missing.stderr, /compilation unit is missing/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('repository inventory verifies actual bundle metadata and never reports a native execution host', async () => {
  const { repositoryVstInventory } = await loadDatabaseSubject('server/services/repositoryVstInventory.ts');
  const inventory = await repositoryVstInventory();
  assert.equal(inventory.nativeProcessing, false); assert.equal(inventory.errors.length, 0);
  assert.equal(inventory.plugins.length, 1);
  const plugin = inventory.plugins[0]; assert.equal(plugin.name, 'Max Booster'); assert.equal(plugin.available, false);
  assert.equal(plugin.exportDirectoryPresent, false); assert.match(plugin.reason, /no VST3 export/); assert.match(plugin.sha256, /^[a-f0-9]{64}$/);
  const { vstPluginBridge } = await loadDatabaseSubject('server/services/vstPluginBridge.ts', {
    '../logger.js': 'export const logger={info(){},warn(){},error(){}};',
  });
  await vstPluginBridge.initialize();
  assert.equal(vstPluginBridge.isBridgeReady(), false); assert.equal(vstPluginBridge.isDesktopConnected(), false);
  assert.equal(vstPluginBridge.getScannedPlugins().length, 1);
  assert(vstPluginBridge.getScannedPlugins().every(p => !p.id.includes('emulation')));
  await assert.rejects(vstPluginBridge.createInstance(plugin.id, 'project'), /no host is connected/);
  await assert.rejects(vstPluginBridge.connectDesktopApp({ userId: 'user', sessionId: 'unverified' }), /no host is connected/);
  const outside = await vstPluginBridge.scanPlugins(['/etc']); assert.equal(outside.valid, 0); assert.equal(outside.errors.length, 1);
});
