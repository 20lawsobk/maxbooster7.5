import { readFile } from 'node:fs/promises';
import { freeze, validateSnapshot, live, save } from '../evaluations/maxcore-fused/runner.mjs';
import { runActualApi } from '../evaluations/maxcore-fused/live-api.mjs';

try {
  const [mode, path] = process.argv.slice(2);
  if (mode === 'ready-live') {
    const result = await runActualApi();
    console.log(JSON.stringify(result));
    if (result.execution !== 'COMPLETE') process.exitCode = 1;
  } else if (!['freeze','validate','live'].includes(mode) || !path) {
    console.log('Usage: node scripts/evaluate-maxcore-fused.mjs ready-live OR freeze|validate|live FILE.json');
    process.exitCode = 2;
  } else {
    const input = JSON.parse(await readFile(path, 'utf8'));
    if (mode === 'freeze') await save('snapshot.json', await freeze(input));
    if (mode === 'validate') await validateSnapshot(input);
    if (mode === 'live') {
      const report = await live(input);
      await save(`run-${Date.now()}.json`, report);
      if (report.execution !== 'COMPLETE') process.exitCode = 1;
    }
    console.log(JSON.stringify({operation:mode, status:process.exitCode ? 'BLOCKED':'COMPLETE'}));
  }
} catch {
  // Do not echo unknown server/file/env exception strings: they may carry secrets.
  console.error('Evaluation blocked: check reviewed contract, frozen pins, ordinary E2E session and approval. No fallback executed.');
  process.exitCode = 1;
}