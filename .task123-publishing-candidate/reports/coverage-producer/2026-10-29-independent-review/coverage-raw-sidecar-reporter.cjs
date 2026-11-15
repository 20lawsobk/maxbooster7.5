/** Public Istanbul reporter: lossless pre-JSON capture; counters are never changed. */
const fs = require('node:fs'), path = require('node:path'), v8 = require('node:v8'), crypto = require('node:crypto');
const { ReportBase } = require('istanbul-lib-report');
const subjects = new Set(['server/pocket-dimension/fabric/storage/PocketDimensionChunkStore.ts', 'server/lib/pdimClient.ts', 'server/logger.ts', 'server/logSanitizer.ts', 'server/config/ports.ts', 'server/lib/luaExecutor.ts', 'server/lib/pdimCircuitBreaker.ts', 'external/pdim/artifacts/api-server/src/redis/store.ts', 'external/pdim/artifacts/api-server/src/workers/lua-pool.ts']);
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const ordered = x => Array.isArray(x) ? x.map(ordered) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, ordered(x[k])])) : x;
module.exports = class RawSidecar extends ReportBase {
    constructor(options) { super(); this.root = fs.realpathSync(options.projectRoot); this.out = path.resolve(options.output); this.files = []; this.contract = JSON.parse(fs.readFileSync(options.contractFile)); if (this.contract.version !== 'maxbooster-shared-vite-provider-v1' || this.contract.provider.implementationSha256 !== hash(fs.readFileSync(path.join(this.root, 'node_modules/@vitest/coverage-v8/dist/provider.js'))))
        throw Error('Unsupported canonical provider contract'); for(const [f,sha]of Object.entries(this.contract.implementations||{}))if(hash(fs.readFileSync(path.join(this.root,'node_modules',f)))!==sha)throw Error('Canonical installed transform changed');for (const [f, sha] of Object.entries(this.contract.tsconfigs))
        if (hash(fs.readFileSync(path.join(this.root, f))) !== sha)
            throw Error('Canonical tsconfig changed'); if (this.contract.runtime.node !== process.versions.node || this.contract.runtime.v8 !== process.versions.v8)
        throw Error('Canonical runtime changed'); this.contractSha256 = hash(JSON.stringify(ordered(this.contract))); if (fs.existsSync(this.out))
        throw Error('Raw sidecar output must be new'); fs.mkdirSync(this.out, { recursive: true, mode: 0o700 }); }
    onDetail(node) { const raw = node.getFileCoverage().data; const file = path.relative(this.root, raw.path).split(path.sep).join('/'); if (!subjects.has(file))
        return; const bytes = v8.serialize(raw), name = file.replaceAll('/', '__') + '.v8'; fs.writeFileSync(path.join(this.out, name), bytes, { flag: 'wx' }); this.files.push({ file, name, bytes: bytes.length, sha256: hash(bytes), sourceSha256: hash(fs.readFileSync(raw.path)) }); }
    onEnd() { if (this.files.length !== subjects.size)
        throw Error('Missing canonical P1 raw originals'); fs.writeFileSync(path.join(this.out, 'manifest.json'), JSON.stringify({ schemaVersion: 1, kind: 'actual-public-Istanbul-pre-JSON-sidecar', contract: this.contract, contractSha256: this.contractSha256, runtime: { node: process.versions.node, v8: process.versions.v8 }, files: this.files.sort((a, b) => a.file.localeCompare(b.file)), counterMutation: false, mergedIntoGlobalCoverage: false }, null, 2)); }
};
