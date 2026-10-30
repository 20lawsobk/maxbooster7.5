import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ignore from 'ignore';

test('production container context admits only prepared portable payload',()=>{
  const rules=ignore().add(fs.readFileSync('Dockerfile.prod.dockerignore','utf8'));
  for(const file of ['.env','server/index.ts','node_modules/pg/index.js','.local/state/models/checkpoint.pt','.prepared-release/manifest.json'])assert.equal(rules.ignores(file),true,file);
  for(const file of ['.prepared-release/payload/.node_bin/node','.prepared-release/payload/python_runtime.pdim','.prepared-release/payload/dist/deployment/executive.mjs'])assert.equal(rules.ignores(file),false,file);
});

test('production image executes verified payload as a non-root user',()=>{
  const docker=fs.readFileSync('Dockerfile.prod','utf8');
  assert.match(docker,/FROM debian:bookworm-slim@sha256:[a-f0-9]{64}/);
  assert.match(docker,/COPY --chown=10001:10001 \.prepared-release\/payload\//);
  assert.match(docker,/USER 10001:10001/);
  assert.match(docker,/CMD \["bash", "start.sh"\]/);
  assert.doesNotMatch(docker,/npm ci|cargo build|COPY \. \./);
  assert.doesNotMatch(docker,/Verify-Peer=false|allow-unauthenticated|curl -k/);
});

test('container rehearsal removes its private database volume without global cleanup',()=>{
  const runner=fs.readFileSync('scripts/readiness-container-acceptance.mjs','utf8');
  // Official PostgreSQL declares an anonymous PGDATA volume. Removing only
  // the container would retain its synthetic database and consume host disk.
  assert.match(runner,/\['rm','-fv',db\]/);
  assert.match(runner,/\['rm','-fv',app\]/);
  assert.doesNotMatch(runner,/volume.*prune|system.*prune/);
});

test('container artifact verifier uses the declared public model mode without ambient secrets',()=>{
  const runner=fs.readFileSync('scripts/readiness-container-acceptance.mjs','utf8');
  const commandEnv=runner.slice(runner.indexOf('const commandEnv='),runner.indexOf("const pgImage="));
  assert.match(commandEnv,/MAXCORE_SERVING_RELEASE:'live-awareness'/);
  assert.doesNotMatch(commandEnv,/\.\.\.process\.env|STRIPE|DATABASE_URL|SESSION_SECRET/);
});
