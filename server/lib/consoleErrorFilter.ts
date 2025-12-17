// Global console.error filter to suppress Redis localhost connection errors
// This MUST be imported first, before any Redis clients are created
// Works in all environments to prevent Redis localhost errors from cluttering logs

const originalConsoleError = console.error;

// Filter for localhost Redis errors (these are non-critical when main Redis is working)
console.error = (...args: unknown[]) => {
  // Get the first argument as an error object or string
  const firstArg = args[0];
  
  // Convert args to string for pattern matching
  const argsStr = args.map(a => {
    if (a instanceof Error) return a.message + ' ' + a.stack;
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }).join(' ');
  
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
