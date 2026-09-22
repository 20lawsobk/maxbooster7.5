/**
 * Every upgraded tab holds a shared Web Lock while it can access an account.
 * Changing the cookie identity requires the exclusive lock: frozen/non-acking
 * tabs therefore block the transition rather than being assumed cleaned up.
 */
const LOCK = "max-booster-account-session-v1";
const CHANNEL = "max-booster-account-boundary-v1";
let channel: BroadcastChannel | null = null;
let release: (() => void) | null = null;
let lease: Promise<void> | null = null;
let acquiring: Promise<void> | null = null;
let acquisition: AbortController | null = null;
let cleanup: (() => Promise<void>) | null = null;
let cleaning: Promise<void> | null = null;

function supported() {
  if (!navigator.locks || typeof BroadcastChannel === "undefined") {
    throw new Error("This browser cannot safely coordinate account changes. Use a browser supporting Web Locks and BroadcastChannel.");
  }
}

export function registerAccountCleanup(handler: () => Promise<void>) {
  supported();
  cleanup = handler;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = async event => {
      if (event.data?.type !== "prepare-account-change") return;
      try {
        await cleanAndRelease();
        channel?.postMessage({ type: "account-cleaned", requestId: event.data.requestId });
      } catch (error) {
        // Do not release the shared lock on failed cleanup. The initiating tab
        // times out instead of changing cookies while private state remains.
        channel?.postMessage({ type: "account-cleanup-failed", requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "Cleanup failed" });
      }
    };
  }
  return () => { if (cleanup === handler) cleanup = null; };
}

export async function acquireAccountLease(): Promise<void> {
  supported();
  if (release) return;
  if (acquiring) return acquiring;
  acquisition = new AbortController();
  acquiring = new Promise<void>((resolve, reject) => {
    lease = navigator.locks.request(LOCK, { mode: "shared", signal: acquisition!.signal }, async () => {
      const held = new Promise<void>(done => { release = done; });
      resolve();
      await held;
      release = null;
    }).then(() => {}, error => { reject(error); });
  });
  try { await acquiring; } finally { acquiring = null; }
}

async function cleanAndRelease() {
  if (cleaning) return cleaning;
  if (!cleanup) throw new Error("Account cleanup is not ready");
  cleaning = (async () => {
    // A pending reader must not become authenticated after the barrier.
    if (!release) acquisition?.abort();
    await cleanup!();
    release?.();
    await lease;
    lease = null;
  })();
  try { await cleaning; } finally { cleaning = null; }
}

export async function changeAccount<T>(operation: () => Promise<T>): Promise<T> {
  supported();
  const requestId = crypto.randomUUID();
  const announce = () => channel?.postMessage({ type: "prepare-account-change", requestId });
  announce();
  const repeat = setInterval(announce, 250);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    await cleanAndRelease();
    return await navigator.locks.request(LOCK, { mode: "exclusive", signal: abort.signal }, async () => {
      // Holding this lock is the durable acknowledgment that every participating
      // live tab released its shared lease after its awaited cleanup.
      clearTimeout(timer);
      clearInterval(repeat);
      // Shared-lock background replay may have finished after the first local
      // sweep. With exclusive ownership, no worker can write behind this sweep.
      await cleanup!();
      return operation();
    });
  } catch (error) {
    if (abort.signal.aborted) throw new Error("Account change blocked: another tab has not finished private-data cleanup. Close other Max Booster tabs and retry.");
    throw error;
  } finally {
    clearInterval(repeat);
    clearTimeout(timer);
  }
}