// Stream codecs needed by disposable storage fixtures. Excludes file paths,
// dictionaries, shells and caller-controlled process options/environments.
export function isIsolatedCodecInvocation(command, args, options) {
  if (options !== undefined || !Array.isArray(args) || !args.every(arg => typeof arg === "string")) return false;
  if (!["zstd", "xz"].includes(command)) return false;
  if (args.length === 1 && args[0] === "--version") return true;
  if (command === "zstd") {
    return args.length === 4 && /^(?:-(?:[1-9]|1\d|2[01])|-d)$/.test(args[0]) &&
      args[1] === "--long=27" && args[2] === "-T0" && args[3] === "-c";
  }
  return args.length === 3 && /^(?:-[0-9]e?|-d)$/.test(args[0]) && args[1] === "-T0" && args[2] === "-c";
}

export function spawnIsolatedCodec(spawn, command, args) {
  const env = Object.fromEntries(["PATH", "HOME", "LANG", "LD_LIBRARY_PATH"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  return spawn(command, args.map(arg => arg === "-T0" ? "-T1" : arg), {
    env, shell: false, stdio: ["pipe", "pipe", "pipe"], timeout: 10_000, killSignal: "SIGKILL",
  });
}
