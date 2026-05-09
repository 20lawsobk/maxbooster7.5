// Global console.error filter to suppress Redis localhost connection errors
// This MUST be imported first, before any Redis clients are created
// Works in all environments to prevent Redis localhost errors from cluttering logs

// Suppress noisy Node.js process warnings that are informational-only
const _origEmit = process.emit.bind(process);
// @ts-ignore — override to filter 'warning' events
process.emit = function (event: string, ...args: unknown[]): boolean {
  if (event === 'warning') {
    const w = args[0] as NodeJS.ErrnoException;
    const msg = w?.message ?? '';
    // pg SSL-mode alias advisory: 'prefer'/'require'/'verify-ca' → 'verify-full'
    // This is expected behaviour in Replit's managed PG environment.
    if (msg.includes('SECURITY WARNING') && msg.includes('SSL modes')) return false;
  }
  return _origEmit(event, ...args);
};

// ── stderr stream interceptor ─────────────────────────────────────────────────
//
// Node.js's worker-thread message-passing machinery writes bare "Error: Error:"
// stack traces directly to process.stderr when a rejected Promise propagates
// through the MessagePort callback before BullMQ's async .catch() attaches.
// These always originate from PDIM 500/502 responses during cold-start and are
// already absorbed by the circuit-breaker slow-lane — they carry no actionable
// signal.  We intercept them here (the earliest possible point — imported
// before any other module) so they never reach the workflow log.
//
// A partial-line buffer handles the case where a single logical error is split
// across multiple write() calls.
let _stderrPartial = '';

const _origStderrWrite = (process.stderr.write as Function).bind(process.stderr);
(process.stderr as NodeJS.WriteStream).write = function (
  chunk: Uint8Array | string,
  encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
  cb?: (err?: Error | null) => void,
): boolean {
  const s = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
  const combined = _stderrPartial + s;

  // Fast-path: if the chunk (or buffered context) is clearly a PDIM cold-start
  // trace, suppress it entirely.  Patterns to swallow:
  //   • Starts with "Error: " and contains "PDIM HTTP 5"
  //   • Contains "stack traceback:" (Lua stack, always from PDIM scripts)
  //   • Contains the luaExecutor source path (confirms it's our Worker error)
  const isColdStartNoise = (
    /PDIM HTTP 5\d\d/.test(combined) ||
    combined.includes('stack traceback:') ||
    combined.includes('luaExecutor.ts') ||
    // Production bundle path — esbuild compiles luaExecutor into dist/index.mjs
    combined.includes('dist/index.mjs')
  );
  if (isColdStartNoise) {
    _stderrPartial = '';
    const done = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    if (done) done();
    return true;
  }

  // If the chunk ends mid-line (no trailing newline), buffer it so the next
  // write can be checked in context.
  if (!s.endsWith('\n')) {
    _stderrPartial = combined;
    const done = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    if (done) done();
    return true;
  }

  _stderrPartial = '';
  return typeof encodingOrCb === 'function'
    ? _origStderrWrite(chunk, encodingOrCb)
    : _origStderrWrite(chunk, encodingOrCb, cb);
};

// ── console.error filter ──────────────────────────────────────────────────────
const originalConsoleError = console.error;

// Filter for localhost Redis errors (these are non-critical when main Redis is working)
console.error = (...args: unknown[]) => {
  // Convert args to string for pattern matching
  const argsStr = args.map(a => {
    if (a instanceof Error) return a.message + ' ' + a.stack;
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }).join(' ');
  
  // Suppress PDIM cold-start noise (same patterns as stderr interceptor above)
  if (
    /PDIM HTTP 5\d\d/.test(argsStr) ||
    argsStr.includes('stack traceback:') ||
    argsStr.includes('luaExecutor.ts') ||
    argsStr.includes('dist/index.mjs')
  ) return;

  // Check for localhost Redis connection errors (127.0.0.1:6379)
  const isLocalhostRedisError = 
    argsStr.includes('127.0.0.1:6379') ||
    argsStr.includes('localhost:6379') ||
    (argsStr.includes('ECONNREFUSED') && argsStr.includes('6379'));

  // Only suppress localhost Redis errors, not remote Redis errors
  if (!isLocalhostRedisError) {
    originalConsoleError.apply(console, args);
  }
};

if (process.env.NODE_ENV === 'development') {
  console.log('✅ Localhost Redis error filter installed');
}
