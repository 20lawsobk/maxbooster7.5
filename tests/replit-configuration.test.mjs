import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PORTABLE_NODE_VERSION } from '../script/lib/portableNodePolicy.mjs';

test('Replit configuration parses as TOML and preserves the production entrypoints and one public port', () => {
  const parsed = spawnSync('python3', ['-c', 'import tomllib,json; print(json.dumps(tomllib.load(open(".replit","rb"))))'], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const config = JSON.parse(parsed.stdout);
  assert.equal(config.run, 'npm run dev');
  assert.deepEqual(config.deployment.build, ['npm', 'run', 'deployment:build']);
  assert.deepEqual(config.deployment.run, ['npm', 'run', 'deployment:start']);
  assert.equal(config.deployment.ignorePorts, false);
  const publicMappings = config.ports.filter(port => port.externalPort !== undefined);
  assert.deepEqual(publicMappings, [{ localPort: 5000, externalPort: 80 }]);
  for (const port of config.ports.filter(port => port.externalPort === undefined)) {
    assert.notEqual(port.exposeLocalhost, true, `Internal port ${port.localPort} must remain private`);
  }
  assert.equal(config.env.MAXCORE_SERVING_RELEASE, 'live-awareness');
  assert.equal(config.env.DATABASE_URL, undefined);
  assert.equal(config.env.NEON_DATABASE_URL, undefined);
  const tracked = spawnSync('git', ['check-ignore', '.replit'], { encoding: 'utf8' });
  assert.equal(tracked.status, 1, '.replit must survive Git synchronization');
});

test('port preflight rejects any extra public mapping, including unknown system ports', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'port-contract-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.replit'), [
    '[[ports]]', 'localPort = 5000', 'externalPort = 80', '',
    '[[ports]]', 'localPort = 53', 'externalPort = 3001', '',
  ].join('\n'));
  const loader = path.resolve('node_modules/tsx/dist/loader.mjs');
  const checker = path.resolve('scripts/check-port-contract.ts');
  const result = spawnSync(process.execPath, ['--import', loader, checker], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PORT: '5000',
      LOCAL_PDIM_PORT: '5556',
      VIDEO_DIFFUSION_PORT: '8008',
      MAXCORE_LOCAL_PORT: '8090',
      BOOSTERSTATE_SIDECAR_PORT: '9877',
      MODEL_API_PORT: '9878',
      MODEL_API_HEALTH_PORT: '9879',
      PYTHON_AI_PORT: '9880',
    },
    timeout: 15000,
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /only localPort 5000 on externalPort 80 is allowed/);
});

for (const corrupt of [false, true]) {
  test(`publishing Node phase ${corrupt ? 'rejects a checksum mismatch without replacing the runtime' : 'installs a checksum-verified runtime'}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replit-node-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const archiveName = `node-v${PORTABLE_NODE_VERSION}-linux-x64.tar.xz`;
    const archiveRoot = `node-v${PORTABLE_NODE_VERSION}-linux-x64`;
    for (const dir of ['script/deployment', 'script/lib', 'bin', '.node_bin', `fixture/${archiveRoot}/bin`]) fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const file of ['build.sh', 'script/deployment/provision-node.sh', 'script/lib/portableNodePolicy.mjs']) fs.copyFileSync(file, path.join(root, file));
    fs.writeFileSync(path.join(root, '.node_bin/node'), 'original');
    fs.writeFileSync(path.join(root, `fixture/${archiveRoot}/bin/node`), `#!/bin/sh\necho v${PORTABLE_NODE_VERSION}\n`, { mode: 0o755 });
    const archive = path.join(root, archiveName);
    const tar = spawnSync('tar', ['-cJf', archive, '-C', path.join(root, 'fixture'), archiveRoot]);
    assert.equal(tar.status, 0);
    const digest = corrupt ? '0'.repeat(64) : createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    fs.writeFileSync(path.join(root, 'SHASUMS256.txt'), `${digest}  ${archiveName}\n`);
    fs.writeFileSync(path.join(root, 'bin/curl'), '#!/bin/bash\nfor arg in "$@"; do case "$arg" in https://*) url="$arg";; esac; done\nwhile [ "$1" != "-o" ]; do shift; done\ncp "$FIXTURE_ROOT/${url##*/}" "$2"\n', { mode: 0o755 });
    const result = spawnSync('bash', ['build.sh', '--executive-task', 'node'], { cwd: root, encoding: 'utf8', timeout: 10000, env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, FIXTURE_ROOT: root } });
    assert.equal(result.status, corrupt ? 1 : 0, result.stderr);
    if (corrupt) {
      assert.match(result.stderr, /checksum mismatch/);
      assert.equal(fs.readFileSync(path.join(root, '.node_bin/node'), 'utf8'), 'original');
    } else {
      const provenance = JSON.parse(fs.readFileSync(path.join(root, '.node_bin/provenance.json'), 'utf8'));
      assert.equal(provenance.archiveSha256, digest);
      assert.equal(provenance.version, PORTABLE_NODE_VERSION);
    }
  });
}
