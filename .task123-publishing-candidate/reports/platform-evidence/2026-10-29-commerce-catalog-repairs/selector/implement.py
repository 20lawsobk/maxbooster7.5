from pathlib import Path
root=Path('/workspace/onboarding-results/commerce-catalog-repairs/selector/candidate/scripts/testing')
p=root/'commerce-legacy-fixture.mjs'
s=p.read_text()
s=s.replace("readdir, rm }", "readdir, rm, realpath, stat }")
s=s.replace("import { startDisposablePostgres } from '../../tests/payment-processing/helpers-database-postgres.mjs';", "import { createHash } from 'node:crypto';\nimport { fileURLToPath } from 'node:url';")
s=s.replace("const report = process.argv[2];\nif (!report) throw new Error('Pass an absolute JUnit report path');\nconst root = process.cwd();", '''// Fail closed before importing the fixture or allocating any owned resources.
// A positional Vitest filter must agree with the registered, static config include;
// otherwise a selector token could be present in evidence without being executed.
const [report, selectorFlag, subject, ...extra] = process.argv.slice(2);
if (!report || !path.isAbsolute(report)) throw new Error('Pass an absolute JUnit report path');
if (selectorFlag !== '--subject-file' || !subject || extra.length) {
  throw new Error('Pass exactly --subject-file tests/unit/beat-sale-money-loop.test.ts after the JUnit path');
}
if (subject !== 'tests/unit/beat-sale-money-loop.test.ts') {
  throw new Error('The subject must be the registered repository-relative legacy beat suite');
}
const root = await realpath(process.cwd());
const configFile = 'vitest.beat-loop.config.ts';
for (const file of [subject, configFile]) {
  const absolute = path.join(root, file);
  if (await realpath(absolute) !== absolute || !(await stat(absolute)).isFile()) {
    throw new Error('The subject and config must be regular files inside the repository without symlink redirection');
  }
}
const configSource = await readFile(path.join(root, configFile), 'utf8');
const { default: ts } = await import('typescript');
const syntax = ts.createSourceFile(configFile, configSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function properties(object, allowed) {
  if (!object || !ts.isObjectLiteralExpression(object)) throw new Error('Legacy Vitest selection must be static');
  const result = new Map();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)
      || !allowed.has(property.name.text) || result.has(property.name.text)) {
      throw new Error('Unsupported legacy Vitest config may ignore the subject selector');
    }
    result.set(property.name.text, property.initializer);
  }
  return result;
}
const exports = syntax.statements.filter(statement => ts.isExportAssignment(statement));
const declaration = exports.length === 1 && exports[0].expression;
if (syntax.parseDiagnostics.length || !declaration || !ts.isCallExpression(declaration)
  || !ts.isIdentifier(declaration.expression) || declaration.expression.text !== 'defineConfig'
  || declaration.arguments.length !== 1) {
  throw new Error('Legacy Vitest selection must use a static defineConfig object');
}
const configProperties = properties(declaration.arguments[0], new Set(['test', 'resolve']));
const testProperties = properties(configProperties.get('test'), new Set([
  'include', 'setupFiles', 'fileParallelism', 'maxWorkers', 'testTimeout', 'hookTimeout',
]));
const include = testProperties.get('include');
if (!include || !ts.isArrayLiteralExpression(include) || include.elements.length !== 1
  || !ts.isStringLiteral(include.elements[0]) || include.elements[0].text !== subject) {
  throw new Error('Legacy Vitest include does not execute the selected subject');
}
const command = ['node_modules/vitest/vitest.mjs', 'run', subject, '--config', configFile,
  '--reporter=verbose', '--reporter=junit', `--outputFile=${path.resolve(report)}`];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
console.log('Legacy subject selection: ' + JSON.stringify({
  schemaVersion: 1, subject, subjectSha256: sha256(await readFile(path.join(root, subject))),
  config: configFile, configSha256: sha256(configSource),
  adapterSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  command: [process.execPath, ...command],
}));
const { startDisposablePostgres } = await import('../../tests/payment-processing/helpers-database-postgres.mjs');''')
s=s.replace("child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.beat-loop.config.ts',\n      '--reporter=verbose', '--reporter=junit', `--outputFile=${path.resolve(report)}`], { env, detached: true, stdio: 'inherit' });", "child = spawn(process.execPath, command, { env, detached: true, stdio: 'inherit' });")
p.write_text(s)
p=root/'run-commerce.py'
s=p.read_text().replace("'scripts/testing/commerce-legacy-fixture.mjs', str(output / 'legacy-beat.xml')]))", "'scripts/testing/commerce-legacy-fixture.mjs', str(output / 'legacy-beat.xml'),\n                     '--subject-file', 'tests/unit/beat-sale-money-loop.test.ts']))")
p.write_text(s)
