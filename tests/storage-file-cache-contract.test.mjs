import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../server/routes.ts', import.meta.url), 'utf8');
const startMarker = 'app.get("/api/storage/file/*key"';
const endMarker = '// Auth: Export user data';

function extractFileRoute(text) {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, 'authenticated storage-file route must exist');
  assert.equal(text.indexOf(startMarker, start + 1), -1, 'route must be registered once');
  const end = text.indexOf(endMarker, start);
  assert.ok(end > start, 'route end marker must follow storage handler');
  return text.slice(start, end);
}

function assertPrivateFileCachePolicy(route) {
  const setters = [...route.matchAll(/res\.setHeader\(\s*["']Cache-Control["']\s*,\s*([^;]+)\);/g)];
  assert.equal(setters.length, 1, 'authenticated file route must set Cache-Control exactly once');
  assert.equal(setters[0][1].trim(), '"private, no-store"', 'no browser/proxy retention of revocable private bytes');
  assert.ok(route.indexOf('if (!req.user)') < setters[0].index, 'authentication must precede response policy');
  assert.ok(setters[0].index < route.lastIndexOf('return res.send(fileBuffer)'), 'cache policy must precede successful response');
  assert.doesNotMatch(route, /res\.removeHeader\(\s*["']Cache-Control["']\s*\)/);
}

test('authenticated storage-file route is private and non-cacheable', () => {
  assertPrivateFileCachePolicy(extractFileRoute(source));
});

test('year-long immutable browser cache is rejected (negative control)', () => {
  const route = extractFileRoute(source);
  const regressed = route.replace('"private, no-store"', '"private, max-age=31536000, immutable"');
  assert.notEqual(regressed, route, 'negative control must change source');
  assert.throws(() => assertPrivateFileCachePolicy(regressed));
});

test('late cache-control override is rejected (negative control)', () => {
  const route = extractFileRoute(source);
  const regressed = route.replace('return res.send(fileBuffer)', 'res.setHeader("Cache-Control", "public, max-age=86400");\n      return res.send(fileBuffer)');
  assert.notEqual(regressed, route, 'negative control must change source');
  assert.throws(() => assertPrivateFileCachePolicy(regressed));
});

test('missing no-store policy is rejected (negative control)', () => {
  const route = extractFileRoute(source);
  const regressed = route.replace('res.setHeader("Cache-Control", "private, no-store");', '');
  assert.notEqual(regressed, route, 'negative control must change source');
  assert.throws(() => assertPrivateFileCachePolicy(regressed));
});
