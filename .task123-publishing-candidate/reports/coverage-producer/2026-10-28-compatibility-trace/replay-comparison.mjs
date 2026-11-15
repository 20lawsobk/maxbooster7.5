/** Read-only conversion of retained runtime bytes; writes only this cohort. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../../..');
const profile = path.join(root, 'reports/coverage-producer/2026-10-28-a1603b13-node');
const baselineFile = path.join(out, 'baseline-selected-files.json');
const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const recorded = JSON.parse(fs.readFileSync(path.join(profile, 'coverage-final.json'), 'utf8'));
const receipt = JSON.parse(fs.readFileSync(path.join(profile, 'receipt.json'), 'utf8'));
const { validateManifest, compareCoverageMaps } = await import(pathToFileURL(path.join(root, 'scripts/testing/coverage-provenance.mjs')));
const [{ convert }, { parseAstAsync }] = await Promise.all([
  import('ast-v8-to-istanbul'),
  import('vite'),
]);
const { TraceMap, decodedMappings, originalPositionFor, GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND } = await import('@jridgewell/trace-mapping');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const before = digest(fs.readFileSync(path.join(root, 'reports/test-verification/coverage/coverage-final.json')));
const kind = value => value === undefined ? 'undefined' : value === null ? 'null' : Number.isNaN(value) ? 'NaN' : value === Infinity ? 'Infinity' : value === -Infinity ? '-Infinity' : typeof value;
function differences(left, right, prefix = '') {
  if (Object.is(left, right)) return [];
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap(key => {
      const leftPresent = Object.hasOwn(left, key), rightPresent = Object.hasOwn(right, key);
      if (!leftPresent || !rightPresent) return [{ path: `${prefix}.${key}`, leftPresent, rightPresent,
        leftKind: kind(left[key]), rightKind: kind(right[key]) }];
      return differences(left[key], right[key], `${prefix}.${key}`);
    });
  }
  return [{ path: prefix, leftKind: kind(left), rightKind: kind(right),
    leftValue: Number.isFinite(left) || typeof left === 'string' || left === null ? left : kind(left),
    rightValue: Number.isFinite(right) || typeof right === 'string' || right === null ? right : kind(right) }];
}
function mapRanges(map) { return Object.entries(map).map(([id, value]) => ({ id, value })); }
const report = { schemaVersion: 1, scope: 'Replay conversion of exact retained runtime JS/maps/V8 counters; no behavior rerun or coverage merge',
  mergedIntoGlobalCoverage: false, productionReady: false, files: [] };
for (const member of fs.readdirSync(profile).filter(name => /^\d+-\d+$/.test(name))) {
  const directory = path.join(profile, member);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  validateManifest(manifest, directory, root);
  for (const script of manifest.scripts) {
    const code = fs.readFileSync(path.join(directory, script.codeFile), 'utf8');
    const map = script.mapFile ? JSON.parse(fs.readFileSync(path.join(directory, script.mapFile), 'utf8')) : undefined;
    const converted = await convert({ code, sourceMap: map, ast: parseAstAsync(code), coverage: { url: script.url, functions: script.coverage.functions } });
    for (const [file, current] of Object.entries(converted)) {
      assert.ok(baseline[file] && recorded[file], 'Both retained profiles must contain the actual source');
      const serialized = JSON.parse(JSON.stringify(current));
      assert.deepEqual(serialized, recorded[file], 'Reconversion must reproduce retained JSON, including counters');
      const row = { file: path.relative(root, file), before: {
          statements: Object.keys(baseline[file].statementMap).length,
          functions: Object.keys(baseline[file].fnMap).length,
          branches: Object.keys(baseline[file].branchMap).length },
        node: { statements: Object.keys(current.statementMap).length,
          functions: Object.keys(current.fnMap).length,
          branches: Object.keys(current.branchMap).length },
        strictInMemory: compareCoverageMaps(baseline[file], current),
        strictSerialized: compareCoverageMaps(baseline[file], serialized) };
      report.files.push(row);
      if (file.endsWith('/server/config/ports.ts')) {
        const ast = await parseAstAsync(code);
        const nodes = [];
        function visit(node) {
          if (!node || typeof node !== 'object') return;
          if ((node.type === 'VariableDeclarator' && ['__defProp', '__name'].includes(node.id?.name)) ||
              (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === '__name')) {
            nodes.push({ type: node.type, start: node.start, end: node.end, text: code.slice(node.start, node.end) });
          }
          for (const value of Object.values(node)) {
            if (Array.isArray(value)) for (const child of value) visit(child);
            else if (value && typeof value === 'object') visit(value);
          }
        }
        visit(ast);
        const trace = new TraceMap(map);
        const decoded = decodedMappings(trace);
        const mappedHelpers = nodes.map(node => {
          const prefix = code.slice(0, node.start).split('\n');
          const line = prefix.length, column = prefix.at(-1).length;
          return { ...node,
            generatedLine: line, generatedColumn: column,
            mappedSegmentsInside: decoded[line - 1].filter(segment => segment[0] >= column && segment[0] < column + node.end - node.start),
            nearestLower: originalPositionFor(trace, { line, column, bias: GREATEST_LOWER_BOUND }),
            nearestUpper: originalPositionFor(trace, { line, column, bias: LEAST_UPPER_BOUND }) };
        });
        const details = { source: row.file, sourceSha256: script.originalSources[0].sha256,
          executedCodeFile: path.relative(root, path.join(directory, script.codeFile)), executedCodeSha256: script.codeSha256,
          mapFile: path.relative(root, path.join(directory, script.mapFile)), mapSha256: script.mapSha256,
          generatedHelperNodes: mappedHelpers,
          firstGeneratedSourceMapping: decoded[0].find(segment => segment.length > 1),
          baselineFunctions: mapRanges(baseline[file].fnMap), nodeFunctions: mapRanges(serialized.fnMap),
          baselineStatements: mapRanges(baseline[file].statementMap), nodeStatements: mapRanges(serialized.statementMap),
          memoryRepresentationDifferences: differences(baseline[file].branchMap, current.branchMap, 'branchMap'),
          serializedBranchMapsEqual: compareCoverageMaps(baseline[file], serialized).mismatches.includes('branchMap') === false };
        assert.equal(nodes.filter(node => node.type === 'CallExpression').length, 3);
        assert.equal(row.before.statements, 21); assert.equal(row.node.statements, 25);
        assert.equal(row.before.functions, 3); assert.equal(row.node.functions, 4);
        assert.equal(details.serializedBranchMapsEqual, true);
        fs.writeFileSync(path.join(out, 'ports-exact-details.json'), JSON.stringify(details, null, 2) + '\n');
      }
    }
  }
}
assert.equal(report.files.length, 9);
assert.ok(report.files.every(row => !row.strictSerialized.compatible));
assert.equal(receipt.comparison.baselineSha256, JSON.parse(fs.readFileSync(path.join(out, 'provenance.json'))).baselineMemberSha256);
const after = digest(fs.readFileSync(path.join(root, 'reports/test-verification/coverage/coverage-final.json')));
assert.equal(after, before, 'Canonical coverage bytes must remain untouched');
report.canonicalCoverageBeforeSha256 = before;
report.canonicalCoverageAfterSha256 = after;
report.canonicalCoverageUnchanged = true;
report.status = 'reproduced_incompatible_profiles_no_merge';
fs.writeFileSync(path.join(out, 'replay-summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, files: report.files.length, canonicalCoverageUnchanged: true }));
