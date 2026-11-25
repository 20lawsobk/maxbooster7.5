import fs from "node:fs";
import {setTimeout as delay} from "node:timers/promises";
import {performance} from "node:perf_hooks";

function processIdentity(pid, procRoot) {
  try {
    const match = fs.readFileSync(
      `${procRoot}/${pid}/stat`,
      "utf8",
    ).match(/^\d+ \(.*\) (.*)$/s);

    if (!match) {
      throw Error(`Unreadable owned process identity: ${pid}`);
    }

    const fields = match[1].trim().split(/\s+/);

    if (
      !/^\d+$/.test(fields[19]) ||
      !Number.isInteger(Number(fields[1]))
    ) {
      throw Error(`Invalid owned process identity: ${pid}`);
    }

    return {
      pid: Number(pid),
      state: fields[0],
      parent: Number(fields[1]),
      start: fields[19],
    };
  } catch (error) {
    if (["ENOENT", "ESRCH"].includes(error.code)) {
      return null;
    }

    throw error;
  }
}

/**
 * Track observed Linux descendants by PID and process start time.
 * Retain identities after reparenting; do not reacquire recycled PIDs.
 */
export function createOwnedProcessTracker(rootPid, {
  procRoot = "/proc",
  kill = (pid, signal) => process.kill(pid, signal),
} = {}) {
  if (!Number.isInteger(rootPid) || rootPid < 2) {
    throw Error("Owned process root must be a child PID");
  }

  const root = processIdentity(rootPid, procRoot);

  // A short-lived task may already have exited. Never reacquire its PID.
  if (!root) {
    return {
      capture: () => [],
      live: () => [],
      stop: async () => ({
        tracked: 0,
        remaining: [],
      }),
    };
  }

  const owned = new Map([[rootPid, root]]);

  function current(identity) {
    const value = processIdentity(identity.pid, procRoot);

    return (
      value?.start === identity.start &&
      !["Z", "X"].includes(value.state)
    ) ? value : null;
  }

  function live() {
    return [...owned.values()]
      .map(current)
      .filter(Boolean);
  }

  function capture() {
    const children = new Map();

    for (const name of fs.readdirSync(procRoot)) {
      if (!/^\d+$/.test(name)) continue;

      let value;

      try {
        value = processIdentity(Number(name), procRoot);
      } catch (error) {
        if ([
          "ENOENT",
          "ESRCH",
          "EACCES",
          "EPERM",
        ].includes(error.code)) {
          continue;
        }

        throw error;
      }

      if (!value) continue;

      const rows = children.get(value.parent) ?? [];
      rows.push(value);
      children.set(value.parent, rows);
    }

    const queue = live();
    const visited = new Set();

    // Indexed traversal avoids repeatedly shifting the array.
    for (let index = 0; index < queue.length; index++) {
      const parent = queue[index];

      if (visited.has(parent.pid)) continue;
      visited.add(parent.pid);

      for (const child of children.get(parent.pid) ?? []) {
        const previous = owned.get(child.pid);

        if (previous && previous.start !== child.start) {
          continue;
        }

        owned.set(child.pid, child);
        queue.push(child);
      }
    }

    return live();
  }

  function signal(identity, kind) {
    if (!current(identity)) return;

    try {
      kill(identity.pid, kind);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }

  async function stop({
    graceMs = 26000,
    descendantGraceMs = 2000,
    pollMs = 50,
  } = {}) {
    for (const value of [
      graceMs,
      descendantGraceMs,
      pollMs,
    ]) {
      if (!Number.isFinite(value) || value < 0) {
        throw Error("Invalid owned process stop budget");
      }
    }

    capture();

    // Allow the application to drain before stopping dependent processes.
    signal(root, "SIGTERM");

    const rootDeadline = performance.now() + graceMs;

    while (
      current(root) &&
      performance.now() < rootDeadline
    ) {
      capture();
      await delay(Math.max(1, pollMs));
    }

    const sent = new Set();
    const descendantDeadline =
      performance.now() + descendantGraceMs;

    do {
      for (const identity of capture()) {
        const key = `${identity.pid}:${identity.start}`;

        if (!sent.has(key)) {
          signal(identity, "SIGTERM");
          sent.add(key);
        }
      }

      if (!live().length) break;
      await delay(Math.max(1, pollMs));
    } while (performance.now() < descendantDeadline);

    for (const identity of capture()) {
      signal(identity, "SIGKILL");
    }

    const killDeadline = performance.now() + 1000;

    while (
      live().length &&
      performance.now() < killDeadline
    ) {
      await delay(10);
    }

    return {
      tracked: owned.size,
      remaining: live().map(value => value.pid),
    };
  }

  capture();

  return {
    capture,
    live,
    stop,
  };
}