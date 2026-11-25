/** Opt-in internal inspector collector. No listener/debug port or app credentials. */
import fs from 'node:fs';
import path from 'node:path';
import { Session } from 'node:inspector';
import { fileURLToPath } from 'node:url';
import { threadId } from 'node:worker_threads';
import { sha256, ownedPath, decodeSourceMap, validateSourceMap, validateRanges } from './coverage-provenance.mjs';
const selected = process.env.MAXBOOSTER_NODE_COVERAGE_DIR;
if (selected) {
  const root = fs.realpathSync(path.resolve(fileURLToPath(new URL('../..', import.meta.url))));
  const reports = path.join(root, 'reports');
  const output = ownedPath(reports, selected);
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const directory = path.join(output, `${process.pid}-${threadId}`);
  fs.mkdirSync(directory, { mode: 0o700 });
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, value) => error ? reject(error) : resolve(value)));
  const scripts = new Map(), pending = new Set(), failures = [];
  const inScope = file => ['server/', 'client/', 'shared/', 'external/', 'built-in plugins dsp/'].some(prefix => path.relative(root, file).split(path.sep).join('/').startsWith(prefix)) && !file.split(path.sep).includes('node_modules');
  session.on('Debugger.scriptParsed', ({ params }) => {
    if (!params.url.startsWith('file:')) return;
    let file; try { file = fileURLToPath(params.url); } catch { return; }
    if (!inScope(file)) return;
    const task = post('Debugger.getScriptSource', { scriptId: params.scriptId }).then(({ scriptSource }) => {
      scripts.set(params.scriptId, { file, code: scriptSource, mapReference: params.sourceMapURL || /\/\/[#@] sourceMappingURL=(\S+)/.exec(scriptSource)?.[1] });
    }).catch(error => failures.push(error.message));
    pending.add(task); void task.finally(() => pending.delete(task));
  });
  await post('Debugger.enable');
  await post('Profiler.enable');
  await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  process.once('beforeExit', async () => {
    const manifest = { schemaVersion: 1, producerId: `${process.pid}-${threadId}`, status: 'complete', encoding: 'utf-8', offsetEncoding: 'utf-16-code-units', collectedAt: new Date().toISOString(), runtime: { node: process.versions.node, v8: process.versions.v8 }, snapshotSemantics: 'single-final-resetting-inspector-snapshot', scripts: [], failures };
    try {
      const raw = await post('Profiler.takePreciseCoverage');
      await Promise.all([...pending]);
      fs.writeFileSync(path.join(directory, 'raw-v8.json'), JSON.stringify(raw));
      manifest.rawSha256 = sha256(JSON.stringify(raw));
      for (const coverage of raw.result) {
        const source = scripts.get(coverage.scriptId); if (!source) continue;
        validateRanges(coverage, source.code);
        const hash = sha256(source.code), codeFile = hash + '.js';
        fs.writeFileSync(path.join(directory, codeFile), source.code);
        const item = { scriptId: coverage.scriptId, url: coverage.url, originalScriptFile: source.file, codeFile, codeSha256: hash, utf16Length: source.code.length, coverage };
        if (source.mapReference) {
          const map = decodeSourceMap(source.mapReference, source.file);
          item.originalSources = validateSourceMap(map, source.file, root);
          item.mapFile = hash + '.js.map';
          const bytes = JSON.stringify(map); item.mapSha256 = sha256(bytes);
          fs.writeFileSync(path.join(directory, item.mapFile), bytes);
        } else if (/\.[cm]?tsx?$/.test(source.file)) throw Error('TypeScript script has no retained runtime source map');
        manifest.scripts.push(item);
      }
      if (failures.length) throw Error('Inspector script collection failed');
    } catch (error) { manifest.status = 'incomplete'; failures.push(error.message); process.exitCode ||= 1; }
    finally {
      fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
      session.disconnect();
    }
  });
}
