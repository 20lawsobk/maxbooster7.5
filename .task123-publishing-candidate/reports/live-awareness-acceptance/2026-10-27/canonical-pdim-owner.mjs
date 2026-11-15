// Acceptance launcher only: actual canonical PDIM, disposable disk, no app boot.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2]);
const forbidden = Object.keys(process.env).filter(name => /DATABASE|STRIPE|NEON|AWS|OPENAI|TAVILY|EXA_API|WEBHOOK|SESSION_SECRET/.test(name));
if (forbidden.length) throw Error('Application/provider configuration must not reach isolated PDIM');
const { startLocalPdimServer, stopLocalPdimServer } = await import(pathToFileURL(path.join(root, 'server/lib/localPdimServer.ts')).href);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    await stopLocalPdimServer();
    console.log(JSON.stringify({ acceptance: 'canonical-pdim-owner-stopped', pid: process.pid }));
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ acceptance: 'canonical-pdim-owner-stop-failed', errorType: error.name }));
    process.exit(1);
  }
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
await startLocalPdimServer();
console.log(JSON.stringify({ acceptance: 'canonical-pdim-owner-ready', pid: process.pid }));
