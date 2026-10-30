import { createOwnedProcessTracker } from '../script/deployment/owned-processes.mjs';

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
