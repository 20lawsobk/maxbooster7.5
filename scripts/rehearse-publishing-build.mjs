// Disposable rehearsal of the configured shell build. Never starts the app,
// supplies provider/Neon credentials, or invokes a publishing API.
import fs from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resume = process.argv[2];
if (resume && (!/^publishing-rehearsal-[A-Za-z0-9]+$/.test(resume))) throw new Error("Invalid rehearsal name");
const run = resume ? path.join(root, ".local", resume) : fs.mkdtempSync(path.join(root, ".local/publishing-rehearsal-"));
const app = path.join(run, "app");
if (resume && JSON.parse(fs.readFileSync(path.join(run, "status.json"))).stage !== "copy") throw new Error("Only interrupted copies can resume");
fs.mkdirSync(app, { recursive: true });
const env = Object.fromEntries(["PATH", "LANG", "TZ", "SSL_CERT_FILE", "NIX_SSL_CERT_FILE"]
  .filter(k => process.env[k]).map(k => [k, process.env[k]]));
for (const [key, folder] of Object.entries({
  HOME: "home", TMPDIR: "tmp", XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache",
  XDG_DATA_HOME: "user-data", XDG_STATE_HOME: "state",
})) {
  env[key] = path.join(run, folder);
  fs.mkdirSync(env[key], { recursive: true });
}
// Never let Git commands walk up into the live checkout.
env.GIT_CEILING_DIRECTORIES = run;
env.NODE_ENV = "production";
env.NPM_CONFIG_USERCONFIG = path.join(run, "npm-user");
env.NPM_CONFIG_GLOBALCONFIG = path.join(run, "npm-global");
fs.writeFileSync(env.NPM_CONFIG_USERCONFIG, "");
fs.writeFileSync(env.NPM_CONFIG_GLOBALCONFIG, "");
fs.writeFileSync(path.join(run, "status.json"), JSON.stringify({ stage: "copy", app }));
console.log(`Rehearsal directory: ${run}`);
const excluded = new Set([".local", ".git", ".agents", ".cache", ".config",
  ".prepared-release", "data", "uploads", "maxbooster7.5", ".pythonlibs",
  "hardware", "reports", "attached_assets", ".replit", ".npmrc"]);
for (const name of fs.readdirSync(root)) {
  if (excluded.has(name) || name.startsWith(".pdim-scratch-")) continue;
  fs.cpSync(path.join(root, name), path.join(app, name), {
    recursive: true, preserveTimestamps: true, force: true, verbatimSymlinks: true,
    mode: fs.constants.COPYFILE_FICLONE,
    filter(source, destination) {
      const base = path.basename(source);
      if (/^\.env(?:\.|$)|\.(pem|key)$/.test(base)) return false;
      if ([".vite", ".cache"].includes(base)) return false;
      const current = fs.lstatSync(source);
      const old = fs.lstatSync(destination, { throwIfNoEntry: false });
      if (old && current.isFile() && old.isFile() &&
          current.size === old.size && current.mtimeMs === old.mtimeMs) return false;
      if (old?.isSymbolicLink() && current.isSymbolicLink() &&
          fs.readlinkSync(source) === fs.readlinkSync(destination)) return false;
      // cpSync does not consistently replace an existing dangling symlink.
      // Unlink only the copied link, never its target.
      if (old && current.isSymbolicLink()) fs.rmSync(destination, { recursive: old.isDirectory(), force: true });
      return true;
    },
  });
  console.log(`Copied ${name}`);
}
// Transfer public run/port configuration only, never deployment env secrets.
const config = spawnSync("python3", ["-c", `
import tomllib,json,sys
d=tomllib.load(open(sys.argv[1],"rb"))
print(json.dumps({k:d["deployment"][k] for k in ("build","run","deploymentTarget") if k in d["deployment"]}))
`, path.join(root, ".replit")], { env, encoding: "utf8" });
if (config.status !== 0) throw new Error("Cannot read publishing commands");
const deployment = JSON.parse(config.stdout);
if (JSON.stringify(deployment.build) !== JSON.stringify(["bash", "build.sh"]) ||
    JSON.stringify(deployment.run) !== JSON.stringify(["bash", "start.sh"])) {
  throw new Error("Publishing commands changed; rehearsal requires review");
}
fs.writeFileSync(path.join(app, ".replit"), `[deployment]\n${Object.entries(deployment)
  .map(([k,v]) => `${k} = ${JSON.stringify(v)}`).join("\n")}\n[[ports]]\nlocalPort = 5000\nexternalPort = 80\n`);
if (fs.existsSync(path.join(root, ".npmrc"))) {
  const policy = fs.readFileSync(path.join(root, ".npmrc"), "utf8").split("\n")
    .filter(line => /^(legacy-peer-deps|strict-peer-deps|auto-install-peers|shamefully-hoist|ignore-scripts)\s*=\s*(true|false)\s*$/.test(line.trim()));
  fs.writeFileSync(path.join(app, ".npmrc"), policy.join("\n") + "\n");
}
for (const args of [["init", "--quiet"], ["add", "."]]) {
  const git = spawnSync("git", args, { cwd: app, env, stdio: "inherit" });
  if (git.status !== 0) throw new Error("Cannot initialize isolated tracked-source index");
}
const output = fs.openSync(path.join(run, "build.log"), "w");
// Keep verified cache entries outside the image before finalize removes its
// duplicate copies. This is rehearsal evidence, not a production bypass.
const cacheDir = path.join(app, ".deployment-capsule-cache");
const evidence = path.join(run, "verified-caches");
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
function retainCaches() {
  if (!fs.existsSync(cacheDir)) return;
  for (const key of fs.readdirSync(cacheDir)) {
    if (!/^[a-f0-9]{64}$/.test(key) || fs.existsSync(path.join(evidence, key))) continue;
    const entry = path.join(cacheDir, key);
    if (!fs.existsSync(path.join(entry, "identity.json"))) continue;
    fs.cpSync(entry, path.join(evidence, key), { recursive: true });
  }
}
retainCaches();
const cacheWatch = fs.watch(cacheDir, retainCaches);
fs.writeFileSync(path.join(run, "status.json"), JSON.stringify({ stage: "build", app }));
const child = spawn(deployment.build[0], deployment.build.slice(1),
  { cwd: app, env, detached: true, stdio: ["ignore", output, output] });
fs.closeSync(output);
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  try { process.kill(-child.pid, signal); } catch {}
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code, signal) => {
  cacheWatch.close();
  fs.writeFileSync(path.join(run, "status.json"), JSON.stringify({ stage: "built", app, code, signal }));
  console.log(`Actual bash build.sh exited ${code ?? signal}; evidence retained in ${run}`);
  process.exitCode = code ?? 1;
});
