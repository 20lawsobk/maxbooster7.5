// Teardown for the real-Chromium browser tests.
//
// Chromium's GPU, utility, renderer and zygote helpers can outlive the main
// browser process for a moment and keep writing into --user-data-dir. Waiting
// only for the main PID's "exit" therefore races profile deletion (ENOTEMPTY
// on <profile>/Default under load). Launch the browser as its own process
// group leader (spawn with `detached: true`) and stop it with this helper,
// which waits until every process in that group is gone.

const GROUP_POLL_MS = 50;
const GRACEFUL_STOP_MS = 5_000;
const FORCED_STOP_MS = 5_000;

function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function waitForGroupExit(pgid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (groupAlive(pgid)) {
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, GROUP_POLL_MS));
  }
  return true;
}

/** Stop a browser spawned with `detached: true` and wait for its whole process group. */
export async function stopBrowserProcessGroup(browser) {
  const pgid = browser.pid;
  if (!pgid) return;
  const mainExited = browser.exitCode !== null || browser.signalCode !== null
    ? Promise.resolve()
    : new Promise(resolve => browser.once("exit", resolve));
  signalGroup(pgid, "SIGTERM");
  await mainExited;
  if (await waitForGroupExit(pgid, GRACEFUL_STOP_MS)) return;
  signalGroup(pgid, "SIGKILL");
  if (!(await waitForGroupExit(pgid, FORCED_STOP_MS))) {
    throw new Error(`Chromium process group ${pgid} did not exit after SIGKILL`);
  }
}
