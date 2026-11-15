// Runs only inside the owned --network none GUI runner with a fresh profile.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

const output = "/evidence";
const binary = "/artifact/max-booster";
const entry = "/artifact/resources/app.asar/dist/index.mjs";
const forbidden = ["DATABASE_URL", "NEON_DATABASE_URL", "SESSION_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "MAXCORE_ADMIN_KEY", "GH_TOKEN", "OPENAI_API_KEY", "SENDGRID_API_KEY", "RESEND_API_KEY"];
if (forbidden.some(name => process.env[name])) throw new Error("Unexpected application credential in owned runner");
const clean = profile => ({ PATH: "/usr/bin:/bin", HOME: profile, TMPDIR: "/tmp", XDG_CONFIG_HOME: profile,
  XDG_RUNTIME_DIR: profile, DISPLAY: ":99", LANG: "C.UTF-8", PORT: "5174" });

async function command(name, executable, args, env, cwd, milliseconds) {
  const started = new Date().toISOString();
  const child = spawn(executable, args, { env, cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "", ended = false, code = null, signal = null, error = null;
  child.stdout.on("data", bytes => { if (stdout.length < 128000) stdout += bytes.toString(); });
  child.stderr.on("data", bytes => { if (stderr.length < 128000) stderr += bytes.toString(); });
  child.on("error", value => { error = value.message; ended = true; });
  child.on("exit", (value, why) => { code = value; signal = why; ended = true; });
  const deadline = Date.now() + milliseconds;
  while (!ended && Date.now() < deadline) await delay(100);
  const stoppedByFixture = !ended;
  if (!ended) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
    const stopDeadline = Date.now() + 2000;
    while (!ended && Date.now() < stopDeadline) await delay(100);
    if (!ended) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
    await delay(200);
  }
  fs.writeFileSync(path.join(output, `${name}.stdout.txt`), stdout);
  fs.writeFileSync(path.join(output, `${name}.stderr.txt`), stderr);
  const result = { name, executable, args, cwd, startedAt: started, pid: child.pid, exitCode: code, signal,
    stoppedByFixture, spawnError: error, boundedDurationMs: milliseconds,
    moduleResolutionFailureObserved: /ERR_MODULE_NOT_FOUND|Cannot find package|Cannot find module/.test(stderr),
    sandboxFailureObserved: /No usable sandbox|SUID sandbox|Failed to move to new namespace|sandbox.*Operation not permitted/i.test(stderr),
    bundledServerExitObserved: /Bundled server exited code=1/.test(stderr) };
  fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
  return result;
}

(async () => {
  fs.mkdirSync("/profile/controller", { recursive: true, mode: 0o700 });
  await command("runner-packages", "/usr/bin/dpkg-query", ["-W", "xvfb", "libgtk-3-0", "libnss3", "libgbm1", "libasound2"], clean("/profile/controller"), "/profile", 5000);
  await command("binary-linked-libraries", "/usr/bin/ldd", [binary], clean("/profile/controller"), "/profile", 5000);
  await command("embedded-node-version", binary, ["--version"], { ...clean("/profile/controller"), ELECTRON_RUN_AS_NODE: "1" }, "/profile", 5000);
  await command("exact-bundled-server-child", binary, [entry], { ...clean("/profile/controller"), ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production", HOST: "127.0.0.1", SKIP_BOOSTERSTATE: "1" }, "/artifact/resources", 12000);
  await command("actual-asar-module-acceptance", "/controller/node22", ["/project/scripts/testing/electron-asar-module-acceptance.mjs", "--electron-binary", binary, "--output-json", "/evidence/asar-module-acceptance.json"], clean("/profile/controller"), "/project", 20000);
  await command("actual-sharp-png", binary, ["--input-type=module", "-e", 'const {default:sharp}=await import("file:///artifact/resources/app.asar/node_modules/sharp/dist/index.mjs"); const image=await sharp({create:{width:2,height:2,channels:3,background:{r:12,g:34,b:56}}}).png().toBuffer();if(image.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw Error("Real PNG signature missing");console.log(JSON.stringify({vips:sharp.versions.vips,bytes:image.length,signature:image.subarray(0,8).toString("hex")}));'], { ...clean("/profile/controller"), ELECTRON_RUN_AS_NODE: "1" }, "/artifact/resources", 15000);
  await command("actual-tfjs-operation", binary, ["--input-type=module", "-e", 'import {createRequire} from "node:module";const require=createRequire("file:///artifact/resources/app.asar/package.json");const tf=require("@tensorflow/tfjs");const a=tf.scalar(1),b=tf.scalar(2),sum=tf.add(a,b);const value=sum.dataSync()[0];if(value!==3)throw Error("Real tensor addition incorrect");console.log(JSON.stringify({tfjs:tf.version.tfjs,value}));a.dispose();b.dispose();sum.dispose();'], { ...clean("/profile/controller"), ELECTRON_RUN_AS_NODE: "1" }, "/artifact/resources", 15000);
  const xserver = spawn("/usr/bin/Xvfb", [":99", "-screen", "0", "1440x900x24", "-nolisten", "tcp", "-ac"], { env: clean("/profile/controller"), stdio: ["ignore", "pipe", "pipe"], detached: true });
  let xlog = "";
  xserver.stderr.on("data", bytes => { xlog += bytes.toString(); });
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync("/tmp/.X11-unix/X99") && Date.now() < deadline) await delay(100);
    if (!fs.existsSync("/tmp/.X11-unix/X99")) throw new Error("Owned Xvfb listener did not start");
    for (const attempt of [{ name: "normal-sandbox-startup", diagnostic: false }, { name: "diagnostic-no-sandbox-startup", diagnostic: true }]) {
      const profile = `/profile/${attempt.name}`;
      fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
      const args = ["--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${profile}`];
      if (attempt.diagnostic) args.unshift("--no-sandbox");
      await command(attempt.name, binary, args, clean(profile), "/profile", 10000);
    }
  } finally {
    try { process.kill(-xserver.pid, "SIGTERM"); } catch {}
    fs.writeFileSync(path.join(output, "xvfb.stderr.txt"), xlog);
  }
  fs.writeFileSync(path.join(output, "probe-scope.json"), JSON.stringify({ completed: true, productionReady: false,
    controllerNode: process.version, uid: process.getuid(), appCredentialsPresent: false,
    networkIsolationRequired: "Docker --network none; verify actual HostConfig separately",
    scope: "Actual packaged executable/embedded child startup observations; no fake readiness responder, no delivery, no rendered-window claim. Diagnostic no-sandbox is not production sandbox verification." }, null, 2) + "\n");
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
