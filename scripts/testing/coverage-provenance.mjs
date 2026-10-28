/** Fail-closed identity and map checks for separately collected coverage. */
import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TraceMap, decodedMappings } from '@jridgewell/trace-mapping';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const ensure = (ok, message) => { if (!ok) throw Error(`Coverage evidence rejected: ${message}`); };
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Bound an owned POSIX process group, including children which retain pipes. */
export async function runOwnedCommand(command, args, { cwd, env, timeoutMs = 120000, maxBuffer = 8 * 1024 * 1024, graceMs = 250 } = {}) {
  ensure(process.platform !== 'win32', 'owned process-group collection requires POSIX');
  ensure(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && Number.isSafeInteger(graceMs) && graceMs > 0 && Number.isSafeInteger(maxBuffer) && maxBuffer > 0, 'invalid process bounds');
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = { stdout: [], stderr: [] }, cleanup = { processGroup: child.pid ?? null, signals: [], complete: false };
  let bytes = 0, timedOut = false, bufferExceeded = false, error, escalationTimer, exitDeadlineTimer, resolveExit;
  const signal = name => {
    if (!child.pid) return;
    try { process.kill(-child.pid, name); cleanup.signals.push(name); }
    catch (failure) { if (failure.code !== 'ESRCH') error ||= failure; }
  };
  const liveMembers = () => {
    if (!child.pid) return [];
    if (process.platform === 'linux') {
      const members = [];
      for (const name of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
        let stat;
        try { stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8'); }
        catch (failure) { if (['ENOENT', 'ESRCH'].includes(failure.code)) continue; throw failure; }
        const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
        if (Number(fields[2]) === child.pid && !['Z', 'X'].includes(fields[0])) members.push(Number(name));
      }
      return members;
    }
    try { process.kill(-child.pid, 0); return [child.pid]; }
    catch (failure) { if (failure.code === 'ESRCH') return []; throw failure; }
  };
  const stop = () => {
    signal('SIGTERM');
    escalationTimer ??= setTimeout(() => signal('SIGKILL'), graceMs);
    exitDeadlineTimer ??= setTimeout(() => {
      error ||= Error('Owned runner did not exit after forced termination');
      resolveExit({ status: null, signal: null });
    }, graceMs + 500);
  };
  for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
    const remaining = Math.max(0, maxBuffer - bytes);
    output[stream].push(chunk.subarray(0, remaining)); bytes += chunk.length;
    if (bytes > maxBuffer && !bufferExceeded) { bufferExceeded = true; stop(); }
  });
  const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
  // Do not wait for 'close': a grandchild may keep inherited pipes open.
  const result = await new Promise(resolve => {
    resolveExit = resolve;
    child.once('error', failure => { error = failure; resolve({ status: null, signal: null }); });
    child.once('exit', (status, exitSignal) => resolve({ status, signal: exitSignal }));
  });
  clearTimeout(timer); clearTimeout(escalationTimer); clearTimeout(exitDeadlineTimer);
  try {
    if (liveMembers().length) signal('SIGTERM');
    const deadline = Date.now() + graceMs;
    while (liveMembers().length && Date.now() < deadline) await pause(20);
    if (liveMembers().length) signal('SIGKILL');
    const killDeadline = Date.now() + Math.max(graceMs, 500);
    while (liveMembers().length && Date.now() < killDeadline) await pause(20);
    cleanup.remainingLivePids = liveMembers();
    cleanup.complete = cleanup.remainingLivePids.length === 0;
  } catch (failure) { error ||= failure; signal('SIGKILL'); cleanup.error = failure.message; }
  child.stdout.destroy(); child.stderr.destroy();
  return { ...result, timedOut, bufferExceeded, error, cleanup, stdout: Buffer.concat(output.stdout).toString('utf8'), stderr: Buffer.concat(output.stderr).toString('utf8') };
}
export function ownedPath(root, candidate) {
  const base = fs.realpathSync(root), resolved = path.resolve(base, candidate);
  ensure(resolved !== base && resolved.startsWith(base + path.sep), 'path escapes owned root');
  let existing = resolved;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  ensure(fs.realpathSync(existing).startsWith(base + path.sep) || fs.realpathSync(existing) === base, 'symlink escapes owned root');
  return resolved;
}
export function validateRanges(script, code) {
  ensure(typeof code === 'string' && Array.isArray(script.functions), 'missing executed script or functions');
  for (const fn of script.functions) {
    ensure(typeof fn.functionName === 'string' && typeof fn.isBlockCoverage === 'boolean' && Array.isArray(fn.ranges) && fn.ranges.length, 'invalid function coverage');
    const enclosing = fn.ranges[0];
    for (const r of fn.ranges) {
      ensure(Number.isSafeInteger(r.startOffset) && Number.isSafeInteger(r.endOffset) && r.startOffset >= 0 && r.endOffset >= r.startOffset && r.endOffset <= code.length, 'offset outside executed UTF-16 script');
      ensure(Number.isSafeInteger(r.count) && r.count >= 0, 'invalid execution count');
      ensure(r.startOffset >= enclosing.startOffset && r.endOffset <= enclosing.endOffset, 'range outside function');
    }
  }
  return true;
}
export function decodeSourceMap(reference, scriptFile) {
  ensure(typeof reference === 'string' && reference.length > 0, 'missing source map');
  if (reference.startsWith('data:')) {
    const match = /^data:application\/json(?:;charset=utf-8)?(;base64)?,(.*)$/is.exec(reference);
    ensure(match, 'unsupported inline source map encoding');
    const bytes = match[1] ? Buffer.from(match[2], 'base64') : Buffer.from(decodeURIComponent(match[2]), 'utf8');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text);
  }
  const target = new URL(reference, pathToFileURL(path.resolve(scriptFile)));
  ensure(target.protocol === 'file:', 'remote source map prohibited');
  const file = fileURLToPath(target);
  ensure(path.dirname(file) === path.dirname(path.resolve(scriptFile)), 'external source map outside script directory');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function validateSourceMap(map, scriptFile, repositoryRoot) {
  ensure(map?.version === 3 && Array.isArray(map.sources) && Array.isArray(map.sourcesContent) && map.sources.length > 0 && map.sources.length === map.sourcesContent.length && typeof map.mappings === 'string', 'incomplete source map');
  ensure(!map.ignoreList?.length && !map.x_google_ignoreList?.length, 'source map hides original application source');
  const sources = [];
  for (let i = 0; i < map.sources.length; i++) {
    ensure(typeof map.sources[i] === 'string' && typeof map.sourcesContent[i] === 'string', 'missing original source content');
    const sourceUrl = new URL(map.sources[i], new URL(map.sourceRoot || '.', pathToFileURL(path.resolve(scriptFile))));
    ensure(sourceUrl.protocol === 'file:', 'nonlocal original source');
    const file = ownedPath(repositoryRoot, fileURLToPath(sourceUrl));
    ensure(!path.relative(repositoryRoot, file).split(path.sep).includes('node_modules'), 'package source is outside application scope');
    const actual = fs.readFileSync(file);
    ensure(sha256(actual) === sha256(Buffer.from(map.sourcesContent[i], 'utf8')), 'stale or substituted original source');
    sources.push({ file, sha256: sha256(actual) });
  }
  const decoded = decodedMappings(new TraceMap(map));
  for (const line of decoded) {
    let lastColumn = -1;
    for (const segment of line) {
      ensure([1,4,5].includes(segment.length) && segment.every(n => Number.isSafeInteger(n) && n >= 0) && segment[0] >= lastColumn, 'malformed source map segment');
      lastColumn = segment[0];
      if (segment.length > 1) {
        ensure(segment[1] < map.sources.length, 'source map source index out of range');
        const lines = map.sourcesContent[segment[1]].split('\n');
        ensure(segment[2] < lines.length && segment[3] <= lines[segment[2]].length, 'source map original position out of range');
        if (segment.length === 5) ensure(Array.isArray(map.names) && segment[4] < map.names.length, 'source map name index out of range');
      }
    }
  }
  return sources;
}
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function compareCoverageMaps(left, right) {
  const mismatches = [];
  for (const key of ['statementMap', 'fnMap', 'branchMap']) {
    ensure(left?.[key] && right?.[key], 'missing complete Istanbul map');
    if (stable(left[key]) !== stable(right[key])) mismatches.push(key);
  }
  return { compatible: !mismatches.length, mismatches };
}
export function validateIstanbul(file) {
  ensure(file && typeof file.path === 'string', 'missing Istanbul source path');
  for (const [mapKey, countKey] of [['statementMap','s'],['fnMap','f'],['branchMap','b']]) {
    ensure(file[mapKey] && file[countKey] && stable(Object.keys(file[mapKey]).sort()) === stable(Object.keys(file[countKey]).sort()), 'counter/map identity mismatch');
    for (const [id, value] of Object.entries(file[countKey])) {
      const counts = Array.isArray(value) ? value : [value];
      ensure(counts.every(n => Number.isSafeInteger(n) && n >= 0), 'invalid Istanbul counts');
      if (countKey === 'b') ensure(Array.isArray(value) && Array.isArray(file.branchMap[id].locations) && value.length === file.branchMap[id].locations.length, 'branch arity mismatch');
    }
  }
  return true;
}
export function validateManifest(manifest, artifactRoot, repositoryRoot) {
  ensure(manifest?.schemaVersion === 1 && manifest.status === 'complete' && manifest.encoding === 'utf-8' && manifest.offsetEncoding === 'utf-16-code-units', 'incomplete/unsupported producer manifest');
  ensure(typeof manifest.producerId === 'string' && manifest.producerId && manifest.runtime?.node && manifest.runtime?.v8 && Array.isArray(manifest.scripts), 'missing producer identity');
  const rawBytes = fs.readFileSync(ownedPath(artifactRoot, 'raw-v8.json'));
  ensure(sha256(rawBytes) === manifest.rawSha256, 'raw coverage artifact changed');
  const raw = JSON.parse(rawBytes);
  ensure(Array.isArray(raw.result), 'missing raw coverage result');
  for (const item of manifest.scripts) {
    ensure(stable(raw.result.find(script => script.scriptId === item.scriptId)) === stable(item.coverage), 'counter record differs from raw runtime evidence');
    const file = ownedPath(artifactRoot, item.codeFile);
    const bytes = fs.readFileSync(file);
    const code = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    ensure(sha256(bytes) === item.codeSha256 && code.length === item.utf16Length, 'executed script identity/encoding mismatch');
    validateRanges(item.coverage, code);
    if (item.mapFile) {
      const mapBytes = fs.readFileSync(ownedPath(artifactRoot, item.mapFile));
      ensure(sha256(mapBytes) === item.mapSha256, 'source map artifact changed');
      const sources = validateSourceMap(JSON.parse(mapBytes), item.originalScriptFile, repositoryRoot);
      ensure(stable(sources) === stable(item.originalSources), 'original source manifest changed');
    } else {
      ensure(!/\.[cm]?tsx?$/.test(item.originalScriptFile), 'TypeScript execution missing source map');
      const original = fs.readFileSync(ownedPath(repositoryRoot, item.originalScriptFile));
      ensure(sha256(original) === sha256(bytes), 'unmapped execution differs from original');
    }
  }
  return true;
}

const hash = value => createHash('sha256').update(value).digest('hex');
const ident = (node, name) => node?.type === 'Identifier' && (name === undefined || node.name === name);
const literal = (node, value) => node?.type === 'Literal' && node.value === value;

export function createKeepNamesPolicy({ code, sourceMap, ast }) {
  const ignored = new WeakSet();
  const audit = { schemaVersion: 1, policy: 'esbuild-keep-names-proven-prefix-v1', executedCodeSha256: hash(code),
    originalParser: { package: 'typescript', version: ts.version }, ignoredGeneratedNodes: [], compatibleMapClaim: false };
  if (!sourceMap) return { ignoreNode: () => undefined, audit };
  if (!ast || ast.type !== 'Program' || !Array.isArray(sourceMap.sources) || !Array.isArray(sourceMap.sourcesContent) ||
    sourceMap.sources.length !== sourceMap.sourcesContent.length || sourceMap.sourcesContent.some(value => typeof value !== 'string')) {
    throw new Error('Coverage generated-node policy requires complete runtime AST and original source content');
  }
  audit.sourceMapSha256 = hash(JSON.stringify(sourceMap));
  audit.originalSources = sourceMap.sources.map((source, index) => ({ source, sha256: hash(sourceMap.sourcesContent[index]) }));
  const identifiers = new Set(), declarationSites = [];
  for (let index = 0; index < sourceMap.sourcesContent.length; index++) {
    const file = ts.createSourceFile(sourceMap.sources[index], sourceMap.sourcesContent[index], ts.ScriptTarget.Latest, true,
      /\.[cm]?tsx$/.test(sourceMap.sources[index]) ? ts.ScriptKind.TSX : /\.jsx$/.test(sourceMap.sources[index]) ? ts.ScriptKind.JSX : /\.[cm]?ts$/.test(sourceMap.sources[index]) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    if (file.parseDiagnostics.length) throw new Error('Original source parse failed; generated-node policy refuses to guess');
    const sites = new Set();
    function visit(node) {
      if (ts.isIdentifier(node)) identifiers.add(node.text);
      const originalFunction = ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ||
        (ts.isVariableDeclaration(node) && node.initializer &&
          (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer) || ts.isClassExpression(node.initializer)));
      if (originalFunction && node.name && ts.isIdentifier(node.name)) {
        const position = file.getLineAndCharacterOfPosition(node.name.getStart(file));
        sites.add(`${position.line}:${position.character}:${node.name.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    declarationSites.push(sites);
  }
  const trace = new TraceMap(sourceMap), mappings = decodedMappings(trace), offsets = [0];
  for (let index = 0; index < code.length; index++) if (code[index] === '\n') offsets.push(index + 1);
  const points = mappings.flatMap((line, index) => line.filter(segment => segment.length > 1)
    .map(segment => ({ offset: offsets[index] + segment[0], segment })));
  const firstMapped = points[0]?.offset ?? -1;
  const inside = node => points.filter(point => point.offset >= node.start && point.offset < node.end);
  const prefixIsUnmapped = node => node.end <= firstMapped && inside(node).length === 0;
  const vars = ast.body.filter(node => node.type === 'VariableDeclaration' && node.kind === 'var').flatMap(node => node.declarations);
  const definition = vars.find(node => ident(node.id) && /^__defProp\d*$/.test(node.id.name) && !identifiers.has(node.id.name) &&
    node.init?.type === 'MemberExpression' && !node.init.computed && ident(node.init.object, 'Object') && ident(node.init.property, 'defineProperty') && prefixIsUnmapped(node));
  if (!definition) return { ignoreNode: () => undefined, audit };
  const helper = vars.find(node => {
    if (!ident(node.id) || !/^__name\d*$/.test(node.id.name) || identifiers.has(node.id.name) || !prefixIsUnmapped(node)) return false;
    const arrow = node.init;
    if (arrow?.type !== 'ArrowFunctionExpression' || arrow.async || arrow.params.length !== 2 || !arrow.params.every(param => ident(param))) return false;
    const call = arrow.body;
    if (call?.type !== 'CallExpression' || !ident(call.callee, definition.id.name) || call.arguments.length !== 3 ||
      !ident(call.arguments[0], arrow.params[0].name) || !literal(call.arguments[1], 'name')) return false;
    const properties = call.arguments[2]?.type === 'ObjectExpression' && call.arguments[2].properties;
    if (!Array.isArray(properties) || properties.length !== 2 || properties.some(property => property.type !== 'Property' || property.computed || property.method || property.kind !== 'init')) return false;
    const value = properties.find(property => ident(property.key, 'value'));
    const configurable = properties.find(property => ident(property.key, 'configurable'));
    return value && configurable && ident(value.value, arrow.params[1].name) && literal(configurable.value, true);
  });
  if (!helper) return { ignoreNode: () => undefined, audit };
  // Refuse ambiguous generated bindings. The proven prelude is the sole writer.
  let ambiguous = false;
  const bindingNames = new Set([definition.id.name, helper.id.name]);
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if ((node.type === 'VariableDeclarator' && ident(node.id) && bindingNames.has(node.id.name) && node !== definition && node !== helper) ||
      (node.type === 'AssignmentExpression' && ident(node.left) && bindingNames.has(node.left.name)) ||
      (node.type === 'UpdateExpression' && ident(node.argument) && bindingNames.has(node.argument.name))) ambiguous = true;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  if (ambiguous) return { ignoreNode: () => undefined, audit };
  const accept = (node, reason, origin) => {
    ignored.add(node);
    audit.ignoredGeneratedNodes.push({ type: node.type, start: node.start, end: node.end, sha256: hash(code.slice(node.start, node.end)), reason, ...(origin ? { originalDeclaration: origin } : {}) });
  };
  accept(definition, 'Exact unmapped compiler Object.defineProperty binding absent from all original identifiers');
  accept(helper, 'Exact unmapped keepNames helper binding absent from all original identifiers');
  for (const node of ast.body) {
    const call = node.type === 'ExpressionStatement' && node.expression;
    if (call?.type !== 'CallExpression' || !ident(call.callee, helper.id.name) || call.arguments.length !== 2 ||
      !ident(call.arguments[0]) || !literal(call.arguments[1], call.arguments[0].name)) continue;
    const positions = inside(node), first = positions[0];
    if (!first || first.offset !== call.start) continue;
    const segment = first.segment;
    if (!declarationSites[segment[1]]?.has(`${segment[2]}:${segment[3]}:${call.arguments[0].name}`) ||
      positions.some(point => point.segment[1] !== segment[1] || point.segment[2] !== segment[2] || point.segment[3] !== segment[3])) continue;
    accept(node, 'Standalone compiler-only helper call mapped exclusively to an actual original declaration name',
      { source: sourceMap.sources[segment[1]], line: segment[2] + 1, column: segment[3], name: call.arguments[0].name });
  }
  return { ignoreNode: node => ignored.has(node) ? 'ignore-this-and-nested-nodes' : undefined, audit };
}
