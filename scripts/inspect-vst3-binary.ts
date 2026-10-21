import path from 'node:path';
import { inspectWindowsVst3File } from '../server/services/vstBinaryInspection.js';

const args = process.argv.slice(2);
if (args.length !== 1 || args[0].startsWith('-')) {
  console.error('Usage: npm run vst3:inspect -- /path/to/plugin.dll');
  process.exitCode = 2;
} else {
  try {
    const inspection = await inspectWindowsVst3File(args[0]);
    console.log(JSON.stringify({ file: path.basename(args[0]), platform: 'windows', architecture: 'x86_64',
      ...inspection, processingVerified: false,
      note: 'Static inspection only. No library was loaded; factory exports do not verify host loading, DSP or Linux compatibility.' }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Plugin inspection failed');
    process.exitCode = 1;
  }
}
