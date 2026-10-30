import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('Replit configuration parses as TOML and preserves the production entrypoints and one public port', () => {
  const parsed = spawnSync('python3', ['-c', 'import tomllib,json; print(json.dumps(tomllib.load(open(".replit","rb"))))'], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const config = JSON.parse(parsed.stdout);
  assert.equal(config.run, 'npm run dev');
  assert.deepEqual(config.deployment.build, ['bash', 'build.sh']);
  assert.deepEqual(config.deployment.run, ['bash', 'start.sh']);
  assert.equal(config.deployment.ignorePorts, false);
  assert.deepEqual(config.ports, [{ localPort: 5000, externalPort: 80 }]);
  assert.equal(config.env.MAXCORE_SERVING_RELEASE, 'live-awareness');
  assert.equal(config.env.DATABASE_URL, undefined);
  assert.equal(config.env.NEON_DATABASE_URL, undefined);
  const tracked = spawnSync('git', ['check-ignore', '.replit'], { encoding: 'utf8' });
  assert.equal(tracked.status, 1, '.replit must survive Git synchronization');
});

for (const corrupt of [false, true]) {
  test(`publishing Node phase ${corrupt ? 'rejects a checksum mismatch without replacing the runtime' : 'installs a checksum-verified runtime'}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replit-node-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const dir of ['script/deployment', 'script/lib', 'bin', '.node_bin', 'fixture/node-v22.23.3-linux-x64/bin']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const file of ['build.sh', 'script/deployment/provision-node.sh', 'script/lib/portableNodePolicy.mjs']) fs.copyFileSync(file, path.join(root, file));
    fs.writeFileSync(path.join(root, '.node_bin/node'), 'original');
    fs.writeFileSync(path.join(root, 'fixture/node-v22.23.3-linux-x64/bin/node'), '#!/bin/sh\necho v22.23.3\n', { mode: 0o755 });
    const archive = path.join(root, 'node-v22.23.3-linux-x64.tar.xz');
    const tar = spawnSync('tar', ['-cJf', archive, '-C', path.join(root, 'fixture'), 'node-v22.23.3-linux-x64']);
    assert.equal(tar.status, 0);
    const digest = corrupt ? '0'.repeat(64) : createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    fs.writeFileSync(path.join(root, 'SHASUMS256.txt'), `${digest}  node-v22.23.3-linux-x64.tar.xz\n`);
    fs.writeFileSync(path.join(root, 'bin/curl'), '#!/bin/bash\nfor arg in "$@"; do case "$arg" in https://*) url="$arg";; esac; done\nwhile [ "$1" != "-o" ]; do shift; done\ncp "$FIXTURE_ROOT/${url##*/}" "$2"\n', { mode: 0o755 });
    const result = spawnSync('bash', ['build.sh', '--executive-task', 'node'], { cwd: root, encoding: 'utf8', timeout: 10000, env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, FIXTURE_ROOT: root } });
    assert.equal(result.status, corrupt ? 1 : 0, result.stderr);
    if (corrupt) {
      assert.match(result.stderr, /checksum mismatch/);
      assert.equal(fs.readFileSync(path.join(root, '.node_bin/node'), 'utf8'), 'original');
    } else {
      const provenance = JSON.parse(fs.readFileSync(path.join(root, '.node_bin/provenance.json'), 'utf8'));
      assert.equal(provenance.archiveSha256, digest);
      assert.equal(provenance.version, '22.23.3');
    }
  });
}
