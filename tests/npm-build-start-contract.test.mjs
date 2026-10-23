import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import vm from "node:vm";
import http from "node:http";
import { spawn } from "node:child_process";
import { transformSync } from "esbuild";
import { validateBuild, writeBuildContract, readBuildInputs } from "../scripts/start-production.mjs";

test("production build aliases do not invoke missing fixers or prune the workspace", () => {
  const { scripts } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(scripts["build:full"], "npm run security:audit && npm run build");
  assert.equal(scripts["build:prod"], "npm run build");
  assert.equal(scripts["security-fix"], undefined);
});

test("Replit preview runs the documented development workflow while deployment stays production-only", () => {
  const repl = fs.readFileSync(".replit", "utf8");
  const deploymentDocs = fs.readFileSync("docs/DEPLOYMENT.md", "utf8");
  assert.match(repl, /^run = "npm run dev"$/m);
  assert.match(repl, /modules = \["nodejs-24", "python-3\.12", "dotnet-10\.0"\]/);
  assert.match(repl, /name = "Start application"[\s\S]*?args = "npm run dev"[\s\S]*?waitForPort = 5000/);
  assert.match(repl, /\[deployment\][\s\S]*?run = \["npm", "run", "deployment:start"\]/);
  assert.match(deploymentDocs, /configured Node 24 runtime/);
});

test("development startup launches the app before repository completion analysis", () => {
  const { scripts } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(scripts.dev, "bash scripts/start-dev.sh");
  assert.equal(scripts.prod, "node scripts/start-production.mjs");
  assert.equal(scripts.start, scripts.prod);
  assert.equal(scripts["deployment:start"], "bash start.sh");
  assert.equal(scripts["completion:execute"], "node scripts/testing/repository-verification.mjs execute");
  assert.equal(scripts["completion:loop"], "node scripts/testing/completion-loop.mjs");
  const devLauncher = fs.readFileSync("scripts/start-dev.sh", "utf8");
  assert.match(devLauncher, /dev_acquire_instance_lock/);
  assert.ok(devLauncher.indexOf('if [[ "$_READINESS_STATUS" != "0" ]]') <
    devLauncher.indexOf("node scripts/testing/repository-verification.mjs dev &"));
  assert.match(devLauncher, /wait -n -p _EXITED_PID/);
  assert.match(scripts["verify:repository"], /repository-verification\.mjs full/);
});

test("ordinary production startup runs a bounded readiness report before launching services", () => {
  const production = fs.readFileSync("scripts/start-production.mjs", "utf8");
  const gate = fs.readFileSync("scripts/testing/production-readiness.mjs", "utf8");
  assert.match(production, /runProductionStartupReadiness\([\s\S]*?validateBuild/);
  assert.match(production, /ProductionReadiness.*READY/);
  assert.match(gate, /Bounded, read-only preflight/);
  assert.match(gate, /validateBuild\(root\)/);
  assert.doesNotMatch(gate, /repository-verification\.mjs|completion-loop\.mjs|spawn\(|spawnSync\(/);
  assert.match(gate, /Publishing must retain its capsule-aware build\.sh\/start\.sh path/);
  const start = fs.readFileSync("start.sh", "utf8");
  const build = fs.readFileSync("build.sh", "utf8");
  assert.match(start, /MAXBOOSTER_DEV_PORTS=0.*check-port-contract\.mjs/);
  assert.match(build, /cp scripts\/deployment\/ports\.replit dist\/deployment\/ports\.replit/);
});

test("development startup watches the application process during configured listener readiness", () => {
  const source = fs.readFileSync("scripts/start-dev.sh", "utf8");
  assert.match(source, /node scripts\/wait-configured-ports\.mjs --timeout-ms=300000 --watch-pid="\$_APP_PID"/);
  assert.match(source, /main application process \(PID \$\{_FAILED_APP_PID\}\) exited before configured listeners were ready/);
  assert.match(source, /node --max-old-space-size="\$\{NODE_MAX_OLD_SPACE_SIZE:-4096\}" --import tsx server\/index\.ts &/);
  assert.match(source, /node --import tsx server\/diffusion-gateway\/index\.ts/);
  assert.match(source, /_wait_http "MaxCore diffusion gateway" "\$VIDEO_DIFFUSION_PORT" "\$_DIFFUSION_PID"/);
  assert.match(source, /_wait_http "MaxCore proxy sidecar" "\$PYTHON_AI_PORT" "\$_AI_SIDECAR_PID"/);
  assert.match(source, /Sidecar liveness only:[\s\S]*?proxy can return 503 until the main app/);
});

test("development proxy liveness accepts HTTP 503 before its upstream starts", async t => {
  const server = http.createServer((_req, res) => { res.writeHead(503); res.end("upstream not started"); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const source = fs.readFileSync("scripts/start-dev.sh", "utf8");
  const start = source.indexOf("_http_responds() {");
  const helper = source.slice(start, source.indexOf("\n}\n", start) + 3);
  const result = await new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", helper + '\n_http_responds "$CHECK_PORT"'], {
      env: { PATH: process.env.PATH, CHECK_PORT: String(server.address().port) },
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(result, 0);
});

test("legacy production shell delegates to the validated npm start path", () => {
  const source = fs.readFileSync("scripts/start-production.sh", "utf8");
  assert.match(source, /exec npm run start/);
  assert.doesNotMatch(source, /dist\/(?:cluster|index)\.mjs/);
});

test("release CI preserves PostgreSQL fixtures, builds through npm, and validates restored hashes", () => {
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /Prepare private PostgreSQL fixture binaries/);
  assert.match(ci, /- name: Build release capsules through the production npm launcher[\s\S]*?run: npm run build\s+env:\s+NODE_ENV: production\s+DEPLOY_PACK: "1"/);
  assert.match(ci, /- name: Restore release capsules with the shipped runtime[\s\S]*?- name: Validate source and artifact hashes after restore/);
  assert.match(ci, /- name: Validate source and artifact hashes after restore[\s\S]*?validateBuild\(process\.cwd\(\)\)/);
  assert.match(ci, /- name: Verify build output/);
});

test("a late build failure invalidates its completion marker", () => {
  const source = fs.readFileSync("script/build.ts", "utf8");
  const start = source.indexOf("main().catch((err) => {");
  assert.ok(start >= 0);
  const handler = source.slice(start + "main().catch((err) => {".length, source.lastIndexOf("});"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "failed-build-"));
  const failure = new Error("fixture packing failure");
  const exits = [];
  const logged = [];
  try {
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist/build-complete.json"), "{}");
    vm.runInNewContext(handler, { fs, path, root, err: failure,
      console: { error: (...args) => logged.push(args) },
      process: { exit: code => exits.push(code) } });
    assert.equal(fs.existsSync(path.join(root, "dist/build-complete.json")), false);
    assert.deepEqual(exits, [1]);
    assert.equal(logged[0][1], failure);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Python provisioning fails closed without deleting the existing runtime", () => {
  const source = fs.readFileSync("script/build.ts", "utf8");
  assert.match(source, /import \{ provisionPortablePython \} from "\.\/lib\/provisionPortablePython\.mjs"/);
  assert.match(source, /if \(isDeployBuild\) \{\s*try \{\s*provisionPortablePython\(root\);/);
  assert.ok(source.indexOf("provisionPortablePython(root)") < source.indexOf("const capsuleTargets"));
  assert.doesNotMatch(source, /curl[^\n]*\|\s*tar/);
  const start = source.indexOf("} catch (e) {") + "} catch (e) {".length;
  const end = source.indexOf("\n    }\n  }", start);
  assert.ok(start > 12 && end > start);
  const failure = new Error("fixture provisioning failure");
  const code = transformSync(source.slice(start, end), { loader: "ts" }).code;
  assert.throws(() => vm.runInNewContext(code, { e: failure }), error =>
    error.message.includes("Required portable Python runtime provisioning failed") &&
    error.cause === failure);
});

test("DNS shutdown immediately signals its owned process group and cancels restart", () => {
  const source = fs.readFileSync("server/services/dnsNodeLocalSupervisor.ts", "utf8");
  const stop = source.slice(source.indexOf("export function stopDnsNodeLocal"));
  const signals = [];
  const cleared = [];
  const context = {
    shuttingDown: false, lastReady: true, lastReadyCheck: 10, restartTimer: 7,
    child: { pid: 321, kill() { throw new Error("Must not signal only the launcher"); } },
    logger: { info() {}, warn() {} },
    process: { kill(pid, signal) { signals.push([pid, signal]); } },
    clearTimeout(id) { cleared.push(id); },
    setTimeout() { return { unref() {} }; },
  };
  vm.runInNewContext(transformSync(stop.replace("export ", ""), { loader: "ts" }).code +
    "\nstopDnsNodeLocal(); stopDnsNodeLocal();", context);
  assert.deepEqual(signals, [[-321, "SIGTERM"]]);
  assert.deepEqual(cleared, [7]);
  assert.equal(context.child, null);
  assert.equal(context.shuttingDown, true);
});

test("DNS production startup uses a compiled entry, not tsx", () => {
  const supervisor = fs.readFileSync("server/services/dnsNodeLocalSupervisor.ts", "utf8");
  const bundles = fs.readFileSync("script/lib/serverBundles.ts", "utf8");
  assert.match(bundles, /"dns-node": "dns-node\/src\/index.ts"/);
  assert.match(supervisor, /production \? process.execPath : TSX_BIN/);
  assert.match(supervisor, /production \? path.resolve\(DNS_NODE_DIR, "\.\.\/dist\/dns-node.mjs"\) : "src\/index.ts"/);
});

test("portable production Python runtime enforces its service manifest security floor", () => {
  const build = fs.readFileSync("script/build.ts", "utf8");
  const provisioner = fs.readFileSync("script/lib/provisionPortablePython.mjs", "utf8");
  const installer = fs.readFileSync("script/lib/installPortablePythonDependencies.py", "utf8");
  const service = fs.readFileSync("external/maxcore/artifacts/ai-training-server/pyproject.toml", "utf8");
  assert.match(build, /provisionPortablePython\(root\)/);
  assert.match(provisioner, /installPortablePythonDependencies\.py/);
  assert.match(installer, /external\/maxcore\/artifacts\/ai-training-server\/pyproject\.toml/);
  assert.match(installer, /requirements_satisfied/);
  assert.match(service, /urllib3>=2\.8\.0/);
});

test("embedded production MaxCore has a compiled entry and excludes the dashboard", () => {
  const build = fs.readFileSync("script/build.ts", "utf8");
  const supervisor = fs.readFileSync("server/services/maxcoreLocalSupervisor.ts", "utf8");
  const app = fs.readFileSync("external/maxcore/artifacts/api-server/src/app.ts", "utf8");
  assert.match(build, /external\/maxcore\/artifacts\/api-server/);
  assert.match(supervisor, /production \? process\.execPath : TSX_BIN/);
  assert.match(supervisor, /production \? "production" : "development"/);
  assert.match(supervisor, /MAXBOOSTER_EMBEDDED: "1"/);
  assert.match(supervisor, /MAXBOOSTER_PYTHON: process\.env\.MAXBOOSTER_PYTHON/);
  assert.match(supervisor, /path\.resolve\(process\.cwd\(\), "python_runtime", "bin", "python3"\)/);
  const start = supervisor.slice(supervisor.indexOf("export async function startMaxcoreLocal"));
  assert.ok(start.indexOf('if (process.env.NODE_ENV === "production")') < start.indexOf("if (fs.existsSync(TSX_BIN))"));
  assert.match(start, /Never attempt network installation/);
  assert.match(app, /NODE_ENV === "production" && process\.env\.MAXBOOSTER_EMBEDDED !== "1"/);
});

test("production startup rejects missing, altered and stale build output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "npm-build-contract-"));
  try {
    assert.throws(() => validateBuild(root), /Run npm run build/);
    fs.mkdirSync(path.join(root, "dist/public"), { recursive: true });
    fs.mkdirSync(path.join(root, "external/maxcore/artifacts/api-server/dist"), { recursive: true });
    fs.mkdirSync(path.join(root, "scripts/deployment"), { recursive: true });
    for (const file of ["package.json", "package-lock.json", "vite.config.ts", "start.sh",
      "scripts/deployment/ports.replit",
      "dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs", "dist/compute-sizing.mjs", "dist/dns-node.mjs", "dist/dns-api.mjs",
      "dist/retained-pdim-recovery-worker.mjs", "dist/public/index.html",
      "external/maxcore/artifacts/api-server/dist/index.mjs"]) {
      fs.writeFileSync(path.join(root, file), "fixture");
    }
    writeBuildContract(root);
    assert.doesNotThrow(() => validateBuild(root));
    for (const file of ["client/src/theme.css", "client/public/icon.svg"]) {
      const input = path.join(root, file);
      fs.mkdirSync(path.dirname(input), { recursive: true });
      fs.writeFileSync(input, "original");
      assert.throws(() => validateBuild(root), /Source file list changed since build/);
      writeBuildContract(root);
      fs.writeFileSync(input, "changed");
      assert.throws(() => validateBuild(root), /Changed since build/);
      writeBuildContract(root);
    }
    // An unexpected file added after compilation must invalidate the asset contract.
    fs.writeFileSync(path.join(root, "dist/public/untracked.html"), "unexpected");
    assert.throws(() => validateBuild(root), /Public build asset list changed/);
    fs.rmSync(path.join(root, "dist/public/untracked.html"));
    assert.doesNotThrow(() => validateBuild(root));
    // Windows hosts may forbid symlink creation without developer mode.
    if (process.platform !== "win32") {
      // Reject symlinks; they must never bypass the public asset inventory.
      fs.symlinkSync("index.html", path.join(root, "dist/public/alias.html"));
      assert.throws(() => validateBuild(root), /Unsupported public build asset/);
      fs.rmSync(path.join(root, "dist/public/alias.html"));
      assert.doesNotThrow(() => validateBuild(root));
    }
    fs.mkdirSync(path.join(root, "client"), { recursive: true });
    fs.writeFileSync(path.join(root, "client/index.html"), "<html></html>");
    assert.throws(() => validateBuild(root), /Source file list changed since build \(added: client\/index.html; removed: none\)/);
    writeBuildContract(root);
    fs.rmSync(path.join(root, "client/index.html"));
    assert.throws(() => validateBuild(root), /Source file list changed since build \(added: none; removed: client\/index.html\)/);
    fs.writeFileSync(path.join(root, "client/index.html"), "<html></html>");
    assert.doesNotThrow(() => validateBuild(root));
    fs.writeFileSync(path.join(root, "client/index.html"), "<html>changed</html>");
    assert.throws(() => validateBuild(root), /Changed since build/);
    writeBuildContract(root);
    fs.rmSync(path.join(root, "dist/dns-node.mjs"));
    assert.throws(() => validateBuild(root), /Production build is missing/);
    fs.writeFileSync(path.join(root, "dist/dns-node.mjs"), "fixture");
    assert.doesNotThrow(() => validateBuild(root));
    fs.rmSync(path.join(root, "dist/dns-api.mjs"));
    assert.throws(() => validateBuild(root), /Production build is missing/);
    fs.writeFileSync(path.join(root, "dist/dns-api.mjs"), "fixture");
    assert.doesNotThrow(() => validateBuild(root));
    fs.writeFileSync(path.join(root, "dist/index.mjs"), "modified");
    assert.throws(() => validateBuild(root), /Changed since build/);
    writeBuildContract(root);
    fs.mkdirSync(path.join(root, "server"));
    fs.writeFileSync(path.join(root, "server/new.ts"), "// new source");
    assert.throws(() => validateBuild(root), /Source file list changed/);
    assert.throws(() => writeBuildContract(root, {}), /changed during compilation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

 test("build input identity ignores nested dependency caches but tracks imported source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-input-cache-"));
  try {
    for (const file of [
      "package.json",
      "package-lock.json",
      "vite.config.ts",
      "start.sh",
      "scripts/deployment/ports.replit",
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "fixture");
    }
    fs.mkdirSync(path.join(root, "server/services"), { recursive: true });
    fs.writeFileSync(path.join(root, "server/services/ai_content_sidecar.py"), "print('sidecar')");
    fs.writeFileSync(path.join(root, "server/services/secure_http.py"), "def request(): pass");
    const lib = path.join(root, "external/maxcore/lib/api-spec");
    fs.mkdirSync(path.join(lib, "node_modules/.cache/jiti"), { recursive: true });
    fs.writeFileSync(path.join(lib, "index.ts"), "export const version = 1;");
    const before = readBuildInputs(root);
    assert.ok(Object.hasOwn(before, "server/services/ai_content_sidecar.py"));
    assert.ok(Object.hasOwn(before, "server/services/secure_http.py"));
    assert.ok(Object.hasOwn(before, "scripts/deployment/ports.replit"));
    const cache = path.join(lib, "node_modules/.cache/jiti/generated.mjs");
    fs.writeFileSync(cache, "export default 1;");
    assert.deepEqual(readBuildInputs(root), before);
    fs.rmSync(cache);
    assert.deepEqual(readBuildInputs(root), before);
    fs.writeFileSync(path.join(lib, "index.ts"), "export const version = 2;");
    assert.notDeepEqual(readBuildInputs(root), before);
    fs.writeFileSync(path.join(lib, "added.ts"), "export default 1;");
    assert.ok(Object.hasOwn(readBuildInputs(root), "external/maxcore/lib/api-spec/added.ts"));
    fs.writeFileSync(path.join(root, "scripts/deployment/ports.replit"), "changed");
    assert.notDeepEqual(readBuildInputs(root), before);
    fs.writeFileSync(path.join(root, "server/services/ai_content_sidecar.py"), "print('updated sidecar')");
    assert.notDeepEqual(readBuildInputs(root), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("generated MaxCore library dist declarations do not invalidate source attestation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maxcore-library-dist-contract-"));
  const generatedDeclarations = [
    "external/maxcore/lib/api-client-react/dist/custom-fetch.d.ts",
    "external/maxcore/lib/api-client-react/dist/generated/api.d.ts",
    "external/maxcore/lib/api-client-react/dist/generated/api.schemas.d.ts",
    "external/maxcore/lib/api-client-react/dist/index.d.ts",
    "external/maxcore/lib/db/dist/index.d.ts",
  ];
  const required = [
    "dist/index.mjs", "dist/cluster.mjs", "dist/gateway.mjs", "dist/compute-sizing.mjs",
    "dist/dns-node.mjs", "dist/dns-api.mjs", "dist/retained-pdim-recovery-worker.mjs", "dist/public/index.html",
    "external/maxcore/artifacts/api-server/dist/index.mjs",
  ];
  try {
    for (const file of [
      "package.json", "package-lock.json", "vite.config.ts", "start.sh",
      "scripts/deployment/ports.replit",
      "external/maxcore/lib/api-client-react/src/index.ts",
      "external/maxcore/lib/api-client-react/src/contracts.d.ts",
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "fixture source");
    }
    for (const file of required) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "fixture artifact");
    }
    for (const file of generatedDeclarations) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "generated declaration");
    }

    const inputs = readBuildInputs(root);
    assert.ok(Object.hasOwn(inputs, "external/maxcore/lib/api-client-react/src/index.ts"));
    assert.ok(Object.hasOwn(inputs, "external/maxcore/lib/api-client-react/src/contracts.d.ts"));
    for (const file of generatedDeclarations) assert.equal(Object.hasOwn(inputs, file), false, file);

    writeBuildContract(root);
    const contractPath = path.join(root, "dist/build-complete.json");
    const legacyContract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    for (const file of generatedDeclarations) {
      legacyContract.inputs[file] = createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
    }
    fs.writeFileSync(contractPath, JSON.stringify(legacyContract));
    assert.doesNotThrow(() => validateBuild(root));

    // A regenerated or changed ignored dist declaration is not a source change.
    fs.writeFileSync(path.join(root, generatedDeclarations[0]), "regenerated declaration");
    assert.doesNotThrow(() => validateBuild(root));

    // Actual package source and production entrypoints remain attested.
    fs.writeFileSync(path.join(root, "external/maxcore/lib/api-client-react/src/index.ts"), "changed source");
    assert.throws(() => validateBuild(root), /Changed since build/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("startup sidecar reuse probes the configured health listener", async t => {
  let status = 200;
  const server = http.createServer((_req, res) => { res.writeHead(status); res.end("ok"); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const source = fs.readFileSync("start.sh", "utf8");
  const start = source.indexOf("_service_healthy() {");
  const helper = source.slice(start, source.indexOf("\n}\n", start) + 3);
  const probe = () => new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", helper + '\n_service_healthy "$CHECK_PORT"'], {
      env: { PATH: process.env.PATH, _NODE_BIN: process.execPath, CHECK_PORT: String(server.address().port) },
      stdio: "ignore",
    });
    child.once("error", reject); child.once("exit", resolve);
  });
  assert.equal(await probe(), 0);
  status = 503;
  assert.equal(await probe(), 1);
});

test("startup detects an occupied sidecar port independently of its health result", async t => {
  const server = http.createServer((_req, res) => { res.writeHead(503); res.end("not ready"); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const source = fs.readFileSync("start.sh", "utf8");
  const start = source.indexOf("_tcp_port_open() {");
  const helper = source.slice(start, source.indexOf("\n}\n", start) + 3);
  const probe = () => new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", helper + '\n_tcp_port_open "$CHECK_PORT"'], {
      env: { PATH: process.env.PATH, _NODE_BIN: process.execPath, CHECK_PORT: String(port) },
      stdio: "ignore",
    });
    child.once("error", reject); child.once("exit", resolve);
  });
  try {
    assert.equal(await probe(), 0);
    await new Promise(resolve => server.close(resolve));
    assert.equal(await probe(), 1);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});

test("production Python sidecar ownership is determined by its configured listener", () => {
  const source = fs.readFileSync("start.sh", "utf8");
  const start = source.indexOf("# ── 3b. Optional legacy Python AI Content Sidecar");
  const end = source.indexOf("# ── 3c. Start MaxCore Diffusion Gateway", start);
  assert.ok(start >= 0 && end > start);
  const sidecarBlock = source.slice(start, end);
  assert.doesNotMatch(sidecarBlock, /pgrep/);
  assert.match(sidecarBlock, /_service_healthy "\$PYTHON_AI_PORT"/);
  assert.match(sidecarBlock, /_tcp_port_open "\$PYTHON_AI_PORT"/);
  assert.match(sidecarBlock, /FATAL: configured Python AI port/);
});

test("startup session health probe uses the migrated millisecond-expiry table", () => {
  const source = fs.readFileSync("server/services/platformAutoFixer.ts", "utf8");
  assert.match(source, /SELECT 1 FROM pg_sessions WHERE expire > \$1 LIMIT 1/);
  assert.match(source, /relation "pg_sessions"/);
  assert.doesNotMatch(source, /SELECT 1 FROM session WHERE expire > NOW\(\)/);
});
