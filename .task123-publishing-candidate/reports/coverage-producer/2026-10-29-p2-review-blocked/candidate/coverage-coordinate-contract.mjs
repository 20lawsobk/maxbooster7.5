/** Lossless versioned coordinate wire codec. No legacy JSON normalization. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
export const contractVersion = 'maxbooster-coverage-coordinate-v1';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw Error('Coverage coordinate contract: ' + message); };
function object(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    fail(label + ' must be a plain object'); const own = Reflect.ownKeys(value); if (own.some(k => typeof k !== 'string' || !Object.hasOwn(value, k) || !Object.getOwnPropertyDescriptor(value, k)?.enumerable || !('value' in Object.getOwnPropertyDescriptor(value, k))))
    fail(label + ' has unsupported descriptor'); if (keys && (!keys.every(k => Object.hasOwn(value, k)) || own.some(k => !keys.includes(k))))
    fail(label + ' fields'); }
function integer(value, min, label) { if (!Number.isSafeInteger(value) || value < min)
    fail(label + ' integer'); }
function array(value, label) { if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).some(k => k !== 'length' && (typeof k !== 'string' || !/^\d+$/.test(k) || Number(k) >= value.length || !('value' in Object.getOwnPropertyDescriptor(value, k)) || !Object.getOwnPropertyDescriptor(value, k).enumerable)) || Array.from({ length: value.length }, (_, i) => !Object.hasOwn(value, i)).some(Boolean))
    fail(label + ' dense array'); }
const maps = raw => ({ statementMap: raw.statementMap, fnMap: raw.fnMap, branchMap: raw.branchMap });
const typed = value => value === undefined ? ['undefined'] : value === Infinity ? ['positive-infinity'] : value instanceof Map ? ['provider-meta-fnNames', ...value.entries()] : Array.isArray(value) ? value.map(typed) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, typed(value[k])])) : value;
export const typedSha256 = value => sha256(JSON.stringify(typed(value)));
export function validateRawCoverage(raw, { source, sourceFile, contract, provenance, body, map } = {}) {
    if (typeof source !== 'string' || typeof sourceFile !== 'string' || !contract || typeof contract !== 'object')
        fail('source and producer contract required');
    object(raw, ['path', 'statementMap', 'fnMap', 'branchMap', 's', 'f', 'b'], 'coverage');
    if (raw.path !== sourceFile)
        fail('source identity');
    const lines = source.split(/\r\n|\n|\r/), sentinels = [], implicit = [];
    const ast = ts.createSourceFile(sourceFile, source, ts.ScriptTarget.Latest, true, sourceFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    if (ast.parseDiagnostics.length)
        fail('original TypeScript parse');
    function visit(n) { if (ts.isIfStatement(n) && !n.elseStatement) {
        const p = ast.getLineAndCharacterOfPosition(n.getStart(ast)), end = ast.getLineAndCharacterOfPosition(n.getEnd());
        const isElseIf = ts.isIfStatement(n.parent) && n.parent.elseStatement === n;
        implicit.push({ line: p.line + 1, column: p.character, endLine: end.line + 1, precedingEnd: isElseIf ? n.parent.thenStatement.getStart(ast) : n.getStart(ast), start: n.getStart(ast) });
    } ts.forEachChild(n, visit); }
    visit(ast);
    function position(p, end, label) { object(p, ['line', 'column'], label); integer(p.line, 1, label + '.line'); if (p.line > lines.length)
        fail(label + ' outside source'); if (p.column === Infinity && end) {
        sentinels.push({ path: label + '.column', type: 'positive-infinity' });
        return;
    } integer(p.column, 0, label + '.column'); if (p.column > lines[p.line - 1].length)
        fail(label + ' column outside UTF16 source'); }
    function loc(l, label, synthetic = false) { object(l, ['start', 'end'], label); if (synthetic) {
        for (const k of ['start', 'end']) {
            object(l[k], ['line', 'column'], label + '.' + k);
            if (l[k].line !== undefined || l[k].column !== undefined)
                fail('partial synthetic location');
            for (const c of ['line', 'column'])
                sentinels.push({ path: label + '.' + k + '.' + c, type: 'undefined' });
        }
        return;
    } position(l.start, false, label + '.start'); position(l.end, true, label + '.end'); if (l.end.line < l.start.line || (l.end.line === l.start.line && l.end.column < l.start.column))
        fail(label + ' inverted span'); }
    function dictionary(v, label) { object(v, null, label); for (const id of Object.keys(v))
        if (!/^(?:0|[1-9]\d*)$/.test(id))
            fail(label + ' invalid ID'); }
    for (const k of ['statementMap', 'fnMap', 'branchMap', 's', 'f', 'b'])
        dictionary(raw[k], k);
    for (const [id, l] of Object.entries(raw.statementMap))
        loc(l, `statementMap.${id}`);
    for (const [id, f] of Object.entries(raw.fnMap)) {
        object(f, ['name', 'decl', 'loc', 'line'], `fnMap.${id}`);
        if (typeof f.name !== 'string')
            fail('function name');
        integer(f.line, 1, 'function line');if(f.line>lines.length)fail('function line outside source');
        loc(f.decl, `fnMap.${id}.decl`);
        loc(f.loc, `fnMap.${id}.loc`);
    }
    for (const [id, b] of Object.entries(raw.branchMap)) {
        object(b, ['loc', 'type', 'locations', 'line'], `branchMap.${id}`);
        if (!['if', 'binary-expr', 'cond-expr', 'switch', 'default-arg'].includes(b.type))
            fail('unsupported branch type');
        integer(b.line, 1, 'branch line');if(b.line>lines.length)fail('branch line outside source');
        loc(b.loc, `branchMap.${id}.loc`);
        array(b.locations, 'branch locations');
        if (!b.locations.length)
            fail('empty branch');
        b.locations.forEach((l, i) => { const undef = l?.start?.line === undefined || l?.start?.column === undefined || l?.end?.line === undefined || l?.end?.column === undefined; const genuine = undef && b.type === 'if' && i === 1 && b.locations.length === 2 && implicit.some(n => n.endLine === b.loc.end.line && ((n.line === b.loc.start.line && n.column === b.loc.start.column) || (ast.getPositionOfLineAndCharacter(b.loc.start.line - 1, b.loc.start.column) >= n.precedingEnd && ast.getPositionOfLineAndCharacter(b.loc.start.line - 1, b.loc.start.column) <= n.start))); if (undef && !genuine)
            fail('synthetic location lacks original implicit-else provenance ' + sourceFile + ':' + id + ':' + i + '@' + b.loc.start.line + ':' + b.loc.start.column); loc(l, `branchMap.${id}.locations.${i}`, genuine); });
    }
    for (const [counter, map] of [['s', 'statementMap'], ['f', 'fnMap'], ['b', 'branchMap']]) {
        if (!isDeepStrictEqual(Object.keys(raw[counter]), Object.keys(raw[map])))
            fail(counter + ' ID dimensions');
        for (const [id, value] of Object.entries(raw[counter]))
            if (counter === 'b') {
                array(value, 'branch counters');
                if (value.length !== raw.branchMap[id].locations.length)
                    fail('branch arm dimensions');
                value.forEach(v => integer(v, 0, 'branch count'));
            }
            else
                integer(value, 0, 'counter');
    }
    if (sentinels.length) {
        if (!provenance || !['actual-shared-provider-replay', 'actual-public-Istanbul-pre-JSON-sidecar'].includes(provenance.kind) || provenance.sourceSha256 !== sha256(source) || provenance.contractSha256 !== typedSha256(contract) || !provenance.replay || !isDeepStrictEqual(maps(raw), maps(provenance.replay)))
            fail('sentinel requires same-source pinned provider raw replay');
        if (typeof body !== 'string' || !map || sha256(body) !== provenance.bodySha256 || sha256(JSON.stringify(map)) !== provenance.mapSha256 || contract.provider?.implementationSha256 !== provenance.providerSha256)
            fail('actual body/map/provider identity');
        for (const k of ['bodySha256', 'mapSha256', 'providerSha256'])
            if (!/^[a-f0-9]{64}$/.test(provenance[k] || ''))
                fail('missing ' + k);
        if (provenance.kind === 'actual-public-Istanbul-pre-JSON-sidecar' && !/^[a-f0-9]{64}$/.test(provenance.rawSidecarSha256 || ''))
            fail('canonical raw sidecar missing');
    }
    return { sentinels, sourceSha256: sha256(source), contractSha256: typedSha256(contract), rawTypedSha256: typedSha256(raw) };
}
export function encodeCoverage(raw, context) { const checked = validateRawCoverage(raw, context); const wire = JSON.parse(JSON.stringify(raw)); const sidecar = { version: contractVersion, ...checked, wireSha256: sha256(JSON.stringify(wire)), provenanceKind: context.provenance?.kind || 'finite-only' }; return { wire, sidecar }; }
function validateWireTree(value, label = 'wire') {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail(label + ' non-JSON number'); return; }
    if (Array.isArray(value)) { array(value, label); value.forEach((v, i) => validateWireTree(v, label + '.' + i)); return; }
    object(value, null, label);
    for (const [key, child] of Object.entries(value)) validateWireTree(child, label + '.' + key);
}
export function decodeCoverage(wire, sidecar, context) {
    validateWireTree(wire);
    object(sidecar, ['version', 'sentinels', 'sourceSha256', 'contractSha256', 'rawTypedSha256', 'wireSha256', 'provenanceKind'], 'sidecar');
    if (sidecar.provenanceKind !== (context.provenance?.kind || 'finite-only') || sidecar.version !== contractVersion || sha256(JSON.stringify(wire)) !== sidecar.wireSha256 || sha256(context.source) !== sidecar.sourceSha256 || typedSha256(context.contract) !== sidecar.contractSha256)
        fail('wire/contract/source identity');
    const restored = structuredClone(wire);
    array(sidecar.sentinels, 'sentinels');
    const seen = new Set();
    for (const record of sidecar.sentinels) {
        object(record, ['path', 'type'], 'sentinel');
        if (typeof record.path !== 'string' || seen.has(record.path))
            fail('duplicate sentinel');
        seen.add(record.path);
        const parts = record.path.split('.');
        if (parts.some(p => ['__proto__', 'prototype', 'constructor'].includes(p)))
            fail('unsafe sentinel path');
        const key = parts.pop();
        let parent = restored;
        for (const part of parts) {
            if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, part))
                fail('missing sentinel parent');
            parent = parent[part];
        }
        if (record.type === 'positive-infinity') {
            if (key !== 'column' || !record.path.endsWith('.end.column') || parent[key] !== null)
                fail('invalid Infinity wire value');
            parent[key] = Infinity;
        }
        else if (record.type === 'undefined') {
            if (Object.hasOwn(parent, key) || !['line', 'column'].includes(key))
                fail('invalid undefined wire value');
            parent[key] = undefined;
        }
        else
            fail('unknown sentinel');
    }
    const checked = validateRawCoverage(restored, context);
    if (checked.rawTypedSha256 !== sidecar.rawTypedSha256 || !isDeepStrictEqual(checked.sentinels, sidecar.sentinels))
        fail('raw typed identity');
    return restored;
}
