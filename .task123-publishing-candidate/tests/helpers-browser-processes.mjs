import { createOwnedProcessTracker } from '../script/deployment/owned-processes.mjs';
import fs from 'node:fs';
import path from 'node:path';

export function findChromium(env = process.env) {
  const explicit = env.CHROMIUM_PATH || env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const candidates = explicit ? [explicit] : (env.PATH || '').split(path.delimiter)
    .flatMap(directory => ['chromium', 'chromium-browser', 'google-chrome']
      .map(name => path.resolve(directory || '.', name)));
  return candidates.find(candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.statSync(candidate).isFile();
    } catch { return false; }
  });
}

// Chromium's launcher may exit before its renderers finish writing their profile.
// Retain descendant identities while the browser is alive, then stop only those
// owned processes before deleting the temporary profile.
export function trackBrowserProcesses(browser) {
  const tracker = createOwnedProcessTracker(browser.pid);
  const poll = setInterval(() => tracker.capture(), 100);
  poll.unref();
  return async function stopBrowser() {
    clearInterval(poll);
    const cleanup = await tracker.stop({ graceMs: 1500, descendantGraceMs: 2000 });
    if (cleanup.remaining.length) throw new Error(`Chromium cleanup left ${cleanup.remaining.length} owned processes`);
    return cleanup;
  };
}
