/** Public Vitest run-end evidence. This reporter never approves coverage or launch. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const fail = message => { throw Error('Coverage outcome reporter: ' + message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const states = ['passed', 'failed', 'skipped', 'pending'];
const counts = () => ({ total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 });
function regularAncestors(file) {
  let ancestor = path.parse(file).root;
  for (const segment of file.slice(ancestor.length).split(path.sep)) {
    ancestor = path.join(ancestor, segment);
    let observed;
    try { observed = fs.lstatSync(ancestor); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (observed.isSymbolicLink()) fail('symlink output ancestor');
  }
}
function relativeModule(root, id) {
  if (typeof id !== 'string' || !path.isAbsolute(id)) fail('non-file module identity');
  const relative = path.relative(root, id);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) fail('module outside selected project');
  return relative.split(path.sep).join('/');
}
export default class CoverageOutcomeReporter {
  onInit(vitest) {
    if (this.root) fail('reporter initialized twice');
    this.root = fs.realpathSync(vitest.config.root);
    this.runId = process.env.MAXBOOSTER_TEST_COVERAGE_RUN_ID;
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(this.runId || '')) fail('parent-owned run ID missing');
    if (!process.env.MAXBOOSTER_TEST_COVERAGE_OUTCOME || !process.env.MAXBOOSTER_TEST_COVERAGE_DIR) fail('parent-owned output missing');
    this.output = path.resolve(process.env.MAXBOOSTER_TEST_COVERAGE_OUTCOME);
    const selected = path.resolve(this.root, process.env.MAXBOOSTER_TEST_COVERAGE_DIR);
    if (this.output !== path.join(selected, 'command-outcomes', this.runId + '.json') || path.resolve(this.root, vitest.config.coverage.reportsDirectory) !== selected) fail('selected coverage directory differs from actual config');
    regularAncestors(this.output);
    this.reporterSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
    this.initializedAt = new Date().toISOString();
  }
  onTestRunStart(specifications) {
    if (!this.root || this.startedAt || !Array.isArray(specifications)) fail('unsupported/multiple test runs');
    this.startedAt = new Date().toISOString();
    this.specifications = specifications.map(specification => relativeModule(this.root, specification.moduleId)).sort();
    if (new Set(this.specifications).size !== this.specifications.length) fail('duplicate selected test modules');
  }
  onTestRunEnd(testModules, unhandledErrors, reason) {
    if (!this.startedAt || this.finishedAt || !Array.isArray(testModules) || !Array.isArray(unhandledErrors) || !['passed', 'failed', 'interrupted'].includes(reason)) fail('unsupported/multiple run-end outcome');
    this.finishedAt = new Date().toISOString();
    const totals = counts(), moduleStates = { passed: 0, failed: 0, skipped: 0, pending: 0, queued: 0 };
    let moduleErrorCount = 0, testCaseErrorCount = 0;
    const modules = testModules.map(module => {
      const file = relativeModule(this.root, module.moduleId), state = module.state(), moduleCounts = counts(), errors = module.errors();
      if (!Object.hasOwn(moduleStates, state) || !Array.isArray(errors)) fail('unsupported module result');
      moduleStates[state]++;
      moduleErrorCount += errors.length;
      for (const testCase of module.children.allTests()) {
        const result = testCase.result();
        if (!result || !states.includes(result.state) || (result.errors !== undefined && !Array.isArray(result.errors))) fail('unsupported test result');
        totals.total++; totals[result.state]++;
        moduleCounts.total++; moduleCounts[result.state]++;
        testCaseErrorCount += result.errors?.length || 0;
      }
      return { file, state, testCaseCounts: moduleCounts, errorCount: errors.length };
    }).sort((left, right) => left.file.localeCompare(right.file));
    if (new Set(modules.map(module => module.file)).size !== modules.length) fail('duplicate completed test modules');
    // A failed collection may leave a missing module: retain that failure rather than inventing completion.
    const missingModules = this.specifications.filter(file => !modules.some(module => module.file === file));
    const unexpectedModules = modules.filter(module => !this.specifications.includes(module.file)).map(module => module.file);
    const outcome = {
      schemaVersion: 1, kind: 'actual-public-Vitest-onTestRunEnd',
      runId: this.runId, repositoryRoot: this.root, runtime: { node: process.versions.node, v8: process.versions.v8 },
      reporterSha256: this.reporterSha256, initializedAt: this.initializedAt, startedAt: this.startedAt, finishedAt: this.finishedAt,
      reason, unhandledErrorCount: unhandledErrors.length, testCaseCounts: totals,
      testModuleCount: modules.length, moduleStates, moduleErrorCount, testCaseErrorCount,
      selectedModules: this.specifications, missingModules, unexpectedModules, modules,
      scope: 'Actual public reporter arguments; counts only, no error messages or private data. Not a coverage threshold or launch decision.',
    };
    regularAncestors(this.output);
    fs.mkdirSync(path.dirname(this.output), { recursive: true, mode: 0o700 });
    regularAncestors(this.output);
    fs.writeFileSync(this.output, JSON.stringify(outcome, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
}
