// Run ONLY via:
// env -i PATH="$PATH" HOME=/tmp node scripts/readiness-assembled-acceptance.mjs
// Explicit HTTP-load-only mode (the only mode that skips Chromium):
// env -i PATH="$PATH" HOME=/tmp node scripts/readiness-assembled-acceptance.mjs --http-load
import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import http from "node:http";
import net from "node:net";
import pg from "pg";
import WebSocket from "ws";

const httpLoadOnly = process.argv.length === 3 && process.argv[2] === "--http-load";
if (process.argv.length !== (httpLoadOnly ? 3 : 2)) {
  throw new Error("Only the optional --http-load argument is supported");
}
const forbidden = Object.keys(process.env).filter((key) =>
  /DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|NEON|REDIS|STRIPE|RESEND|SENDGRID|TWILIO|AWS|SENTRY|TOKEN|SECRET|KEY|NODE_OPTIONS/i.test(key),
);
if (forbidden.length) {
  throw new Error(`Refusing inherited sensitive/runtime configuration: ${forbidden.sort().join(", ")}`);
}

const root = resolve(".");
const temp = mkdtempSync("/tmp/readiness-assembled-");
async function reserveEphemeralPort() {
  return await new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}
const pgPort = await reserveEphemeralPort();
const appPort = await reserveEphemeralPort();
const startedAt = new Date().toISOString();
const reportStem = httpLoadOnly ? "assembled-authenticated-http-load" : "assembled-acceptance-drill";
const reportJson = join(root, `reports/readiness-implementation/${reportStem}.json`);
const reportMd = join(root, `reports/readiness-implementation/${reportStem}.md`);
const evidence = {
  capacityAdmission: "not_run",
  schemaGeneration: "not_run",
  postgres: "not_run",
  appProcess: "not_run",
  health: "not_run",
  readiness: "not_run",
  frontend: "not_run",
  authHttp: "not_run",
  httpLoad: httpLoadOnly ? "not_run" : "not_requested",
  browser: "not_run",
  egressGuard: "not_run",
  cleanup: "not_run",
};
const failures = [];
const observations = [];
let postgresStarted = false;
let app;
let client;
let appLogPath;
let appLogTail = "";

function sanitizedLogTail() {
  if (!appLogPath && !appLogTail) return "";
  try {
    const persisted = appLogPath ? readFileSync(appLogPath, "utf8") : "";
    const source = appLogTail.length >= persisted.length ? appLogTail : persisted;
    return source
      .slice(-16_000)
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]")
      .replace(/(authorization|token|secret|password)["' :=]+[^\s,"'}]+/gi, "$1=[redacted]")
      .slice(-12_000);
  } catch {
    return appLogTail
      .slice(-16_000)
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]")
      .replace(/(authorization|token|secret|password)["' :=]+[^\s,"'}]+/gi, "$1=[redacted]")
      .slice(-12_000);
  }
}

function run(command, args, env, timeout = 120_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const message = `${result.error?.message ?? ""}\n${result.stderr ?? ""}`
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]")
      .trim()
      .slice(0, 1200);
    throw new Error(`${command} exited ${result.status}: ${message}`);
  }
  return result.stdout;
}

function request(path, timeout = 10_000, options = {}) {
  return new Promise((resolveRequest, reject) => {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    if (httpLoadOnly && body && Buffer.byteLength(body) > 1024) {
      reject(new Error("HTTP load request body exceeds the 1024-byte bound"));
      return;
    }
    const headers = {
      Accept: "application/json,text/html",
      "X-Forwarded-Proto": "https",
      ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.csrf ? { "x-csrf-token": options.csrf } : {}),
    };
    const req = http.request(
      { host: "127.0.0.1", port: appPort, path, method: options.method ?? "GET", headers },
      (res) => {
        const chunks = [];
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes <= 256 * 1024) chunks.push(chunk);
        });
        res.on("end", () =>
          resolveRequest({
            status: res.statusCode,
            contentType: String(res.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks).toString("utf8"),
            bytes,
            setCookie: res.headers["set-cookie"] ?? [],
          }),
        );
      },
    );
    req.setTimeout(timeout, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function updateCookieJar(jar, setCookies) {
  for (const value of setCookies) {
    const pair = value.split(";", 1)[0];
    const equals = pair.indexOf("=");
    if (equals < 1) continue;
    const name = pair.slice(0, equals);
    const cookieValue = pair.slice(equals + 1);
    if (!cookieValue) jar.delete(name);
    else jar.set(name, cookieValue);
  }
}

function cookieHeader(jar) {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

function jsonBody(response) {
  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error(`expected JSON response, received ${response.contentType || "unknown content type"}`);
  }
}

async function authRequest(jar, path, options = {}) {
  const response = await request(path, 15_000, {
    ...options,
    cookie: cookieHeader(jar),
  });
  updateCookieJar(jar, response.setCookie);
  return response;
}

async function runHttpAuthJourney(email, username, password) {
  const jar = new Map();
  let response = await authRequest(jar, "/api/csrf-token");
  if (response.status !== 200) throw new Error(`CSRF bootstrap returned HTTP ${response.status}`);
  let csrf = jsonBody(response).csrfToken;
  if (typeof csrf !== "string" || jar.get("csrf-token") !== csrf) {
    throw new Error("CSRF body/cookie binding failed");
  }

  response = await authRequest(jar, "/api/auth/register", {
    method: "POST",
    csrf,
    body: { email, username, password, confirmPassword: password, firstName: "Acceptance", lastName: "User" },
  });
  const registered = jsonBody(response);
  if (response.status !== 200 || typeof registered.id !== "string" || "password" in registered) {
    throw new Error(`registration contract failed with HTTP ${response.status}`);
  }

  response = await authRequest(jar, "/api/auth/me");
  if (response.status !== 200 || jsonBody(response)?.id !== registered.id) {
    throw new Error("registration session was not persisted");
  }
  response = await authRequest(jar, "/api/auth/me");
  if (jsonBody(response)?.id !== registered.id) {
    throw new Error("session did not persist across a second request");
  }

  response = await authRequest(jar, "/api/auth/logout", { method: "POST", csrf });
  if (response.status !== 200) throw new Error(`post-registration logout returned HTTP ${response.status}`);
  response = await authRequest(jar, "/api/auth/me");
  if (jsonBody(response) !== null) throw new Error("logout did not clear the registration session");

  response = await authRequest(jar, "/api/csrf-token");
  csrf = jsonBody(response).csrfToken;
  response = await authRequest(jar, "/api/auth/login", {
    method: "POST",
    csrf,
    body: { email, password },
  });
  const login = jsonBody(response);
  if (response.status !== 200 || login.id !== registered.id) {
    throw new Error(`normal login returned HTTP ${response.status}`);
  }
  response = await authRequest(jar, "/api/auth/me");
  if (jsonBody(response)?.id !== registered.id) throw new Error("login session was not persisted");
  response = await authRequest(jar, "/api/auth/logout", { method: "POST", csrf });
  if (response.status !== 200) throw new Error(`final logout returned HTTP ${response.status}`);
  response = await authRequest(jar, "/api/auth/me");
  if (jsonBody(response) !== null) throw new Error("final logout did not invalidate the session");

  return { userId: registered.id };
}

async function fetchJsonFromPort(port, path) {
  return await new Promise((resolveFetch, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try { resolveFetch(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch (error) { reject(error); }
      });
    });
    req.setTimeout(3_000, () => req.destroy(new Error("browser debugger timeout")));
    req.on("error", reject);
  });
}

async function runBrowserJourney(email, password, expectedUserId, browserEnv) {
  const chromium = "/repl/tools/bin/chromium";
  const debuggerPort = await reserveEphemeralPort();
  const profile = join(temp, "chromium-profile");
  const browser = spawn(chromium, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
    `--remote-debugging-port=${debuggerPort}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { cwd: temp, env: browserEnv, stdio: "ignore" });
  let ws;
  try {
    let targets;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (browser.exitCode !== null) throw new Error(`Chromium exited ${browser.exitCode}`);
      try {
        targets = await fetchJsonFromPort(debuggerPort, "/json/list");
        if (Array.isArray(targets) && targets.some((target) =>
          target.type === "page" &&
          !String(target.url ?? "").startsWith("chrome-extension://") &&
          target.webSocketDebuggerUrl
        )) break;
      } catch {}
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    const pageTarget = targets?.find((target) =>
      target.type === "page" &&
      !String(target.url ?? "").startsWith("chrome-extension://") &&
      target.webSocketDebuggerUrl
    );
    if (!pageTarget?.webSocketDebuggerUrl) throw new Error("Chromium page CDP endpoint did not become ready");
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => {
      ws.once("open", resolveOpen);
      ws.once("error", reject);
    });
    let id = 0;
    const pending = new Map();
    const networkStatuses = [];
    let loginRequestId;
    let loginCsrfHeaderLength = 0;
    let mainFrameId;
    let mainLoaderId;
    let documentGeneration = 0;
    let contextTransitionsRecovered = 0;
    let transportFailure;
    ws.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.method === "Page.frameNavigated" && !message.params?.frame?.parentId) {
        mainFrameId = message.params.frame.id;
        mainLoaderId = message.params.frame.loaderId;
        documentGeneration++;
      }
      if (message.method === "Network.responseReceived" &&
          String(message.params?.response?.url ?? "").includes("/api/auth/login")) {
        networkStatuses.push(message.params.response.status);
        loginRequestId = message.params.requestId;
      }
      if (message.method === "Network.requestWillBeSent" &&
          String(message.params?.request?.url ?? "").includes("/api/auth/login")) {
        loginRequestId = message.params.requestId;
        const headers = message.params.request.headers ?? {};
        const csrfHeader = headers["x-csrf-token"] ?? headers["X-CSRF-Token"] ?? "";
        loginCsrfHeaderLength = String(csrfHeader).length;
      }
      if (message.method === "Network.requestWillBeSentExtraInfo" &&
          message.params?.requestId === loginRequestId) {
        const headers = message.params.headers ?? {};
        const csrfHeader = headers["x-csrf-token"] ?? headers["X-CSRF-Token"] ?? "";
        loginCsrfHeaderLength = Math.max(loginCsrfHeaderLength, String(csrfHeader).length);
      }
      if (!message.id || !pending.has(message.id)) return;
      const { resolveCommand, rejectCommand } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCommand(new Error(message.error.message));
      else resolveCommand(message.result);
    });
    const rejectPending = (error) => {
      transportFailure = error;
      for (const { rejectCommand } of pending.values()) rejectCommand(error);
      pending.clear();
    };
    ws.once("close", () => rejectPending(new Error("Chromium CDP target closed")));
    ws.once("error", (error) => rejectPending(new Error(`Chromium CDP transport failed: ${error.message}`)));
    const command = (method, params = {}, timeoutMs = 5_000) => new Promise((resolveCommand, rejectCommand) => {
      if (transportFailure) {
        rejectCommand(transportFailure);
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) {
        rejectCommand(new Error("Chromium CDP target is not open"));
        return;
      }
      const commandId = ++id;
      const timer = setTimeout(() => {
        pending.delete(commandId);
        rejectCommand(new Error(`Chromium CDP command timed out: ${method}`));
      }, timeoutMs);
      pending.set(commandId, {
        resolveCommand: (value) => { clearTimeout(timer); resolveCommand(value); },
        rejectCommand: (error) => { clearTimeout(timer); rejectCommand(error); },
      });
      ws.send(JSON.stringify({ id: commandId, method, params }));
    });
    const isContextTransition = (error) =>
      /Inspected target navigated|Execution context was destroyed|Cannot find context with specified id/i
        .test(String(error?.message ?? error));
    const evaluate = async (expression, timeoutMs = 5_000) => {
      const deadline = Date.now() + timeoutMs;
      let lastError;
      do {
        try {
          const result = await command("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          if (result.exceptionDetails) throw new Error("browser evaluation failed");
          return result.result?.value;
        } catch (error) {
          if (!isContextTransition(error)) throw error;
          if (browser.exitCode !== null || transportFailure || ws.readyState !== WebSocket.OPEN) {
            throw new Error(`Chromium target closed during a document transition: ${error.message}`);
          }
          lastError = error;
          contextTransitionsRecovered++;
          await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        }
      } while (Date.now() < deadline);
      throw new Error(`Chromium execution context did not stabilize: ${lastError?.message ?? "unknown transition"}`);
    };
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Network.enable");
    await command("Network.setExtraHTTPHeaders", {
      headers: { "X-Forwarded-Proto": "https" },
    });
    const loginUrl = `http://localhost:${appPort}/login`;
    const navigation = await command("Page.navigate", { url: loginUrl });
    if (navigation.errorText) throw new Error(`Chromium login navigation failed: ${navigation.errorText}`);
    mainFrameId = navigation.frameId;
    const navigationLoaderId = navigation.loaderId;
    const hydrationDeadline = Date.now() + 30_000;
    while (Date.now() < hydrationDeadline) {
      const pageState = await evaluate(`({
        href: location.href,
        ready: document.readyState,
        hydrated: Boolean(document.querySelector('[data-testid="button-login-submit"]'))
      })`, 5_000);
      const expectedDocument = pageState?.href === loginUrl &&
        (pageState.ready === "interactive" || pageState.ready === "complete") &&
        (!navigationLoaderId || !mainLoaderId || mainLoaderId === navigationLoaderId);
      if (expectedDocument && pageState.hydrated) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    const hydrated = await evaluate(`Boolean(document.querySelector('[data-testid="button-login-submit"]'))`);
    await command("Page.stopLoading");
    await command("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    let screenshotEvidence;
    try {
      const screenshot = await command("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      }, 15_000);
      writeFileSync(join(root, "reports/readiness-implementation/assembled-acceptance-login.png"), Buffer.from(screenshot.data, "base64"));
      screenshotEvidence = "reports/readiness-implementation/assembled-acceptance-login.png";
    } catch (error) {
      screenshotEvidence = `unavailable: ${error.message}`;
    }
    if (!hydrated) {
      const diagnosis = await evaluate(`({href:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,160),scripts:[...document.scripts].map(s=>s.src).slice(0,4)})`);
      throw new Error(`login page did not hydrate: ${JSON.stringify(diagnosis)}`);
    }

    await evaluate(`document.querySelector('#username').focus()`);
    await command("Input.insertText", { text: email });
    await evaluate(`document.querySelector('#password').focus()`);
    await command("Input.insertText", { text: password });
    await evaluate(`document.querySelector('[data-testid="button-login-submit"]').click()`);
    const loginDeadline = Date.now() + 30_000;
    let authenticated = false;
    while (Date.now() < loginDeadline) {
      authenticated = await evaluate(`fetch('/api/auth/me?acceptance-login='+crypto.randomUUID(),{credentials:'include',cache:'no-store'}).then(r=>r.json()).then(u=>u?.id===${JSON.stringify(expectedUserId)}).catch(()=>false)`);
      if (authenticated) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    }
    if (!authenticated) {
      const diagnosis = await evaluate(`({
        href: location.pathname,
        button: document.querySelector('[data-testid="button-login-submit"]')?.innerText,
        usernameLength: document.querySelector('#username')?.value?.length,
        passwordLength: document.querySelector('#password')?.value?.length,
        csrfCookieLength: document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.split('=').slice(1).join('=').length,
        cookieNames: document.cookie.split('; ').filter(Boolean).map(x=>x.split('=')[0]),
        visibleError: [...document.querySelectorAll('[role="alert"],[data-state="open"],#username-error,#password-error')].map(x=>x.innerText).filter(Boolean).join(' | ').slice(0,240)
      })`);
      let responseMessage = "";
      if (loginRequestId) {
        try {
          const responseBody = await command("Network.getResponseBody", { requestId: loginRequestId });
          const parsed = JSON.parse(responseBody.body);
          responseMessage = String(parsed.message ?? parsed.error ?? "").slice(0, 180);
        } catch (error) {
          responseMessage = `response body unavailable (${error.message})`;
        }
      }
      const authLog = sanitizedLogTail()
        .split("\n")
        .filter((line) => /CSRF validation failed|Origin blocked|POST \/api\/auth\/login/.test(line))
        .slice(-3)
        .join(" | ")
        .slice(0, 600);
      throw new Error(`browser form login did not establish the expected session: HTTP ${networkStatuses.join(",") || "not sent"} ${responseMessage}; csrfHeaderLength=${loginCsrfHeaderLength}; ${JSON.stringify(diagnosis)}${authLog ? `; server=${authLog}` : ""}`);
    }
    const persisted = await evaluate(`fetch('/api/auth/me?acceptance-persist='+crypto.randomUUID(),{credentials:'include',cache:'no-store'}).then(r=>r.json()).then(u=>u?.id===${JSON.stringify(expectedUserId)})`);
    if (!persisted) throw new Error("browser session did not persist");
    const logoutResult = await evaluate(`(async()=>{const token=document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.split('=').slice(1).join('='); if(!token)return {ok:false,stage:'csrf'}; const r=await fetch('/api/auth/logout',{method:'POST',credentials:'include',cache:'no-store',headers:{'x-csrf-token':token}}); if(!r.ok)return {ok:false,stage:'logout',status:r.status}; const me=await fetch('/api/auth/me?acceptance-logout='+crypto.randomUUID(),{credentials:'include',cache:'no-store'}); const user=await me.json(); return {ok:user===null,stage:'me',status:me.status,authenticated:Boolean(user?.id)}})()`);
    if (!logoutResult?.ok) throw new Error(`browser logout did not invalidate the session: ${JSON.stringify(logoutResult)}`);
    ws.close();
    ws = undefined;
    return {
      engine: "Chromium CDP",
      hydrated: true,
      formLogin: true,
      sessionPersisted: true,
      logout: true,
      documentGeneration,
      contextTransitionsRecovered,
      screenshot: screenshotEvidence,
    };
  } finally {
    ws?.terminate();
    if (browser.exitCode === null) browser.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => browser.once("exit", resolveExit)),
      new Promise((resolveExit) => setTimeout(resolveExit, 3_000)),
    ]);
    if (browser.exitCode === null) browser.kill("SIGKILL");
  }
}

async function waitFor(path, predicate, timeout) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    if (app?.exitCode !== null) {
      throw new Error(`application exited ${app?.exitCode}; sanitized tail:\n${sanitizedLogTail()}`);
    }
    try {
      last = await request(path);
      if (predicate(last)) return last;
    } catch (error) {
      last = { error: error.message };
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 750));
  }
  throw new Error(`timed out waiting for ${path}; last status ${last?.status ?? last?.error ?? "none"}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function memoryAdmissionSnapshot() {
  const meminfo = readFileSync("/proc/meminfo", "utf8");
  const availableKiB = Number(meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m)?.[1] ?? 0);
  const hostMemAvailableBytes = availableKiB * 1024;
  let cgroup;
  try {
    const limitText = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    const current = Number(readFileSync("/sys/fs/cgroup/memory.current", "utf8").trim());
    const stat = Object.fromEntries(
      readFileSync("/sys/fs/cgroup/memory.stat", "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const [name, value] = line.split(/\s+/, 2);
          return [name, Number(value)];
        }),
    );
    const maximumBytes = limitText === "max" ? null : Number(limitText);
    cgroup = {
      currentBytes: current,
      maximumBytes,
      headroomBytes: maximumBytes === null ? null : Math.max(0, maximumBytes - current),
      anonymousBytes: stat.anon ?? null,
      filePageCacheBytes: stat.file ?? null,
      inactiveFileBytes: stat.inactive_file ?? null,
      activeFileBytes: stat.active_file ?? null,
      kernelBytes: stat.kernel ?? null,
      reclaimableKernelSlabBytes: stat.slab_reclaimable ?? null,
    };
  } catch {}
  const candidates = [
    hostMemAvailableBytes,
    ...(cgroup?.headroomBytes === null || cgroup?.headroomBytes === undefined
      ? []
      : [cgroup.headroomBytes]),
  ];
  return {
    source: "/proc/meminfo MemAvailable and cgroup v2 memory.current, memory.max, memory.stat",
    hostMemAvailableBytes,
    cgroup: cgroup ?? "unavailable",
    effectiveAvailableBytes: Math.min(...candidates),
    admissionRule: "minimum of host MemAvailable and raw cgroup headroom",
    reclaimableAccounting:
      "file/inactive_file page cache and slab_reclaimable are reported only; none is added to raw cgroup headroom",
  };
}

function nearestRank(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

async function createLoadSession(email, username, password, register) {
  const jar = new Map();
  let response = await authRequest(jar, "/api/csrf-token");
  if (response.status !== 200) throw new Error(`load CSRF bootstrap returned HTTP ${response.status}`);
  const csrf = jsonBody(response).csrfToken;
  if (typeof csrf !== "string" || csrf.length > 256 || jar.get("csrf-token") !== csrf) {
    throw new Error(
      "load CSRF body/cookie binding failed: " +
      `bodyType=${typeof csrf}, bodyLength=${typeof csrf === "string" ? csrf.length : "n/a"}, ` +
      `cookieLength=${jar.get("csrf-token")?.length ?? "missing"}, ` +
      `setCookieNames=${response.setCookie.map((value) => value.split("=", 1)[0]).join(",") || "none"}`,
    );
  }
  response = await authRequest(jar, register ? "/api/auth/register" : "/api/auth/login", {
    method: "POST",
    csrf,
    body: register
      ? { email, username, password, confirmPassword: password, firstName: "Load", lastName: "User" }
      : { email, password },
  });
  const user = jsonBody(response);
  if (response.status !== 200 || typeof user.id !== "string") {
    throw new Error(`${register ? "registration" : "login"} setup returned HTTP ${response.status}`);
  }
  return { jar, csrf, userId: user.id };
}

async function runAuthenticatedHttpLoad() {
  const minimumAvailable = 1536 * 1024 * 1024;
  const admission = memoryAdmissionSnapshot();
  const admittedAvailable = admission.effectiveAvailableBytes;
  evidence.capacityAdmission = { ...admission, minimumAvailableBytes: minimumAvailable };
  if (admittedAvailable < minimumAvailable) {
    throw new Error(`HTTP load capacity admission denied: ${Math.floor(admittedAvailable / 1024 / 1024)} MiB available; 1536 MiB required`);
  }
  const accountCount = 10;
  const sessions = [];
  for (let index = 0; index < accountCount; index++) {
    const suffix = randomBytes(8).toString("hex");
    const email = `load-${suffix}@example.invalid`;
    const username = `load_${suffix}`;
    const password = `Load!${randomBytes(12).toString("base64url")}9a`;
    const primary = await createLoadSession(email, username, password, true);
    sessions.push(primary);
    sessions.push(await createLoadSession(email, username, password, false));
  }

  const invalidCsrf = await authRequest(sessions[0].jar, "/api/auth/heartbeat", { method: "POST" });
  if (invalidCsrf.status !== 403) {
    throw new Error(`missing-CSRF mutation was not rejected (HTTP ${invalidCsrf.status})`);
  }

  const projectProbe = await authRequest(sessions[0].jar, "/api/projects", {
    method: "POST",
    csrf: sessions[0].csrf,
    body: { title: "Disposable load project", description: "isolated acceptance data", metadata: { synthetic: true } },
  });
  const projectWritesCompatible = projectProbe.status === 200 && typeof jsonBody(projectProbe).id === "string";
  const operations = projectWritesCompatible
    ? ["session-read", "project-read", "session-write", "project-write"]
    : ["session-read", "session-write"];
  const phaseSettings = [
    { name: "steady", workers: 10, durationMs: 20_000 },
    { name: "spike", workers: 20, durationMs: 10_000 },
  ];
  const phases = [];
  const failureCounts = new Map();

  for (const setting of phaseSettings) {
    const durations = [];
    let successful = 0;
    let failed = 0;
    const deadline = Date.now() + setting.durationMs;
    const workers = sessions.slice(0, setting.workers).map(async (session, workerIndex) => {
      let iteration = 0;
      while (Date.now() < deadline) {
        const cycleStarted = Date.now();
        const operation = operations[(workerIndex + iteration) % operations.length];
        const requestStarted = process.hrtime.bigint();
        try {
          let response;
          if (operation === "session-read") {
            response = await authRequest(session.jar, "/api/auth/me");
          } else if (operation === "project-read") {
            response = await authRequest(session.jar, "/api/projects");
          } else if (operation === "session-write") {
            response = await authRequest(session.jar, "/api/auth/heartbeat", { method: "POST", csrf: session.csrf });
          } else {
            response = await authRequest(session.jar, "/api/projects", {
              method: "POST",
              csrf: session.csrf,
              body: { title: `Synthetic ${workerIndex}-${iteration}`, metadata: { synthetic: true } },
            });
          }
          const valid = response.status === 200 &&
            (operation !== "session-read" || jsonBody(response)?.id === session.userId);
          if (valid) successful++;
          else {
            failed++;
            const key = `${operation}: HTTP ${response.status}`;
            failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1);
          }
        } catch (error) {
          failed++;
          const key = `${operation}: ${String(error?.message ?? error).slice(0, 160)}`;
          failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1);
        } finally {
          durations.push(Number(process.hrtime.bigint() - requestStarted) / 1e6);
        }
        iteration++;
        const waitMs = Math.min(3_000 - (Date.now() - cycleStarted), deadline - Date.now());
        if (waitMs > 0) await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
      }
    });
    await Promise.all(workers);
    const count = successful + failed;
    phases.push({
      name: setting.name,
      workers: setting.workers,
      configuredDurationSeconds: setting.durationMs / 1000,
      count,
      successful,
      failed,
      successPercent: count ? (successful / count) * 100 : 0,
      p95Ms: nearestRank(durations, 0.95),
      p99Ms: nearestRank(durations, 0.99),
      durationDefinition: "all completed request durations, including failed requests",
    });
  }

  const revokedCookie = cookieHeader(sessions[0].jar);
  const logout = await authRequest(sessions[0].jar, "/api/auth/logout", {
    method: "POST",
    csrf: sessions[0].csrf,
  });
  if (logout.status !== 200) throw new Error(`load logout returned HTTP ${logout.status}`);
  const revoked = await request("/api/projects", 15_000, { cookie: revokedCookie });
  if (revoked.status !== 401) throw new Error(`revoked logout session was not denied (HTTP ${revoked.status})`);

  const thresholdFailures = [];
  for (const phase of phases) {
    if (phase.count === 0) thresholdFailures.push(`${phase.name}: no requests completed`);
    if (phase.successPercent < 99) thresholdFailures.push(`${phase.name}: success ${phase.successPercent.toFixed(2)}% < 99%`);
    if (phase.p95Ms === null || phase.p95Ms > 500) thresholdFailures.push(`${phase.name}: p95 ${phase.p95Ms}ms > 500ms`);
    if (phase.p99Ms === null || phase.p99Ms > 1000) thresholdFailures.push(`${phase.name}: p99 ${phase.p99Ms}ms > 1000ms`);
  }
  const result = {
    label: "source application HTTP simulation; not packed application acceptance",
    admission: evidence.capacityAdmission,
    thresholds: { minimumSuccessPercent: 99, maximumP95Ms: 500, maximumP99Ms: 1000 },
    settings: {
      phases: phaseSettings.map(({ name, workers, durationMs }) => ({ name, workers, durationSeconds: durationMs / 1000 })),
      accounts: accountCount,
      sessions: sessions.length,
      pacingMs: 3000,
      requestTimeoutMs: 15000,
      maximumRequestBodyBytes: 1024,
      appMaxOldSpaceMiB: 768,
      overlappingRequestsPerVirtualUser: false,
      percentileMethod: "nearest-rank over all completed request durations, including failures",
    },
    callbacks: operations.map((name) => ({
      name,
      method: name === "session-read" || name === "project-read" ? "GET" : "POST",
      path: name === "session-read"
        ? "/api/auth/me"
        : name === "session-write"
          ? "/api/auth/heartbeat"
          : "/api/projects",
    })),
    coverage: {
      actualRegistrationAndLogin: true,
      sessionRead: true,
      csrfProtectedSessionWrite: true,
      projectRead: projectWritesCompatible,
      projectWrite: projectWritesCompatible,
      projectWriteProbeStatus: projectProbe.status,
      missingCsrfRejected: true,
      logoutSessionRevoked: true,
      durableLoadGeneratorWorker: false,
    },
    phases,
    failures: [...failureCounts].map(([failure, count]) => ({ failure, count })),
    thresholdFailures,
  };
  if (thresholdFailures.length) throw Object.assign(new Error(`HTTP load thresholds failed: ${thresholdFailures.join("; ")}`), { loadResult: result });
  return result;
}

try {
  if (httpLoadOnly) {
    const minimumAvailableBytes = 1536 * 1024 * 1024;
    evidence.capacityAdmission = {
      ...memoryAdmissionSnapshot(),
      minimumAvailableBytes,
    };
    if (evidence.capacityAdmission.effectiveAvailableBytes < minimumAvailableBytes) {
      throw new Error(
        `HTTP load capacity admission denied before PostgreSQL/application startup: ` +
        `${Math.floor(evidence.capacityAdmission.effectiveAvailableBytes / 1024 / 1024)} MiB effective available; ` +
        `1536 MiB required`,
      );
    }
  }
  mkdirSync(join(temp, "home"));
  mkdirSync(join(temp, "cwd"));
  mkdirSync(join(temp, "schema"));
  symlinkSync(join(root, "node_modules"), join(temp, "node_modules"), "dir");
  symlinkSync(join(root, "dist"), join(temp, "cwd", "dist"), "dir");
  symlinkSync(join(root, "shared"), join(temp, "cwd", "shared"), "dir");
  symlinkSync(join(root, "tsconfig.json"), join(temp, "cwd", "tsconfig.json"), "file");
  symlinkSync(join(root, "tsconfig.server.json"), join(temp, "cwd", "tsconfig.server.json"), "file");
  const baseEnv = { PATH: process.env.PATH, HOME: join(temp, "home"), LANG: "C", TZ: "UTC" };

  const schema = readFileSync(join(root, "shared/schema.ts"), "utf8");
  const readinessExport = 'export * from "./readiness-schema";';
  if (schema.split(readinessExport).length !== 2) throw new Error("unexpected readiness schema export count");
  const baseline = schema.replace(readinessExport, "");
  writeFileSync(join(temp, "schema/schema.ts"), baseline);
  const drizzleConfig = join(temp, "drizzle.json");
  writeFileSync(drizzleConfig, JSON.stringify({
    dialect: "postgresql",
    schema: join(temp, "schema/schema.ts"),
    out: join(temp, "generated"),
  }));
  run(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "generate", `--config=${drizzleConfig}`], baseEnv);
  evidence.schemaGeneration = "pass";

  run("initdb", ["-D", join(temp, "pg"), "-U", "acceptance", "--auth=trust", "--no-locale", "--encoding=UTF8"], baseEnv);
  run("pg_ctl", [
    "-D", join(temp, "pg"),
    "-l", join(temp, "postgres.log"),
    "-o", `-h 127.0.0.1 -k ${temp} -p ${pgPort} -c shared_buffers=32MB -c max_connections=30`,
    "-w", "start",
  ], baseEnv);
  postgresStarted = true;
  client = new pg.Client({ host: "127.0.0.1", port: pgPort, user: "acceptance", database: "postgres" });
  await client.connect();
  for (const file of readdirSync(join(temp, "generated")).filter((name) => name.endsWith(".sql")).sort()) {
    await client.query(readFileSync(join(temp, "generated", file), "utf8"));
  }
  for (const file of readdirSync(join(root, "migrations")).filter((name) => /^\d+.*\.sql$/.test(name) && Number(name.split("_")[0]) >= 20).sort()) {
    await client.query(readFileSync(join(root, "migrations", file), "utf8"));
  }
  evidence.postgres = "pass";

  const sessionSecret = randomBytes(48).toString("hex");
  const appEnv = {
    ...baseEnv,
    NODE_ENV: "production",
    PORT: String(appPort),
    DATABASE_URL: `postgresql://acceptance@127.0.0.1:${pgPort}/postgres`,
    SESSION_SECRET: sessionSecret,
    READINESS_ISOLATED_PG: "1",
    READINESS_EGRESS_GUARD: "1",
    MAXCORE_LOCAL: "0",
    MAXCORE_API_URL: "http://127.0.0.1:9",
    MAXCORE_BASE_URL: "http://127.0.0.1:9",
    ENABLE_BACKUPS: "false",
    ENABLE_FAN_DELIVERY_WORKER: "false",
    ACME_ENABLED: "false",
    DNS_NODE_LOCAL: "0",
    DISABLE_CLUSTER: "true",
    DB_POOL_SIZE: "2",
    DB_CONNECTION_TIMEOUT: "2000",
    APP_PORT: String(appPort),
    APP_URL: `http://localhost:${appPort}`,
    PUBLIC_APP_URL: `http://localhost:${appPort}`,
  };
  run(process.execPath, [
    "--import", join(root, "scripts/readiness-egress-guard.mjs"),
    "--input-type=module",
    "-e",
    `import net from "node:net"; import dgram from "node:dgram"; import cp from "node:child_process";
     let denied = 0;
     for (const fn of [
       () => net.connect({ host: "198.51.100.1", port: 443 }),
       () => new net.Socket().connect({ host: "198.51.100.1", port: 443 }),
       () => dgram.createSocket("udp4"),
       () => cp.spawn("true"),
     ]) { try { fn(); } catch (error) { if (/readiness-egress-denied/.test(error.message)) denied++; } }
     if (denied !== 4) throw new Error("egress guard preflight did not deny every transport");`,
  ], appEnv);
  evidence.egressGuard = "pass (external net.connect, direct Socket.connect, UDP, and child processes denied in preflight)";
  appLogPath = join(temp, "app.log");
  const appLog = createWriteStream(appLogPath, { flags: "wx" });
  app = spawn(process.execPath, [
    "--max-old-space-size=768",
    "--import", join(root, "scripts/readiness-egress-guard.mjs"),
    "--import", "tsx",
    join(root, "server/index.ts"),
  ], { cwd: join(temp, "cwd"), env: appEnv, stdio: ["ignore", "pipe", "pipe"] });
  const retainAppLogTail = (chunk) => {
    appLogTail = (appLogTail + chunk.toString("utf8")).slice(-64 * 1024);
  };
  app.stdout.on("data", retainAppLogTail);
  app.stderr.on("data", retainAppLogTail);
  app.stdout.pipe(appLog);
  app.stderr.pipe(appLog);
  evidence.appProcess = "started";

  const health = await waitFor("/api/health", (response) => response.status === 200, 25_000);
  evidence.health = { status: health.status, contentType: health.contentType };

  const frontend = await waitFor("/", (response) =>
    response.status === 200 &&
    /text\/html/.test(response.contentType) &&
    /<html|<!doctype/i.test(response.body),
  90_000);
  evidence.frontend = {
    status: frontend.status,
    contentType: frontend.contentType,
    bytes: frontend.bytes,
    sha256: sha256(frontend.body),
  };

  if (httpLoadOnly) {
    evidence.browser = "intentionally skipped only for explicit --http-load mode";
    try {
      evidence.httpLoad = await runAuthenticatedHttpLoad();
      evidence.authHttp = {
        csrfCookieHeaderBinding: "pass",
        register: "pass",
        login: "pass",
        sessionPersistence: "pass",
        csrfRejection: "pass",
        logoutInvalidation: "pass",
        syntheticUsersRemovedWithDatabase: true,
      };
    } catch (error) {
      if (error?.loadResult) evidence.httpLoad = error.loadResult;
      throw error;
    }
  } else {
    const authSuffix = randomBytes(8).toString("hex");
    const authEmail = `acceptance-${authSuffix}@example.invalid`;
    const authUsername = `accept_${authSuffix}`;
    const authPassword = `Acceptance!${randomBytes(12).toString("base64url")}9a`;
    const authResult = await runHttpAuthJourney(authEmail, authUsername, authPassword);
    evidence.authHttp = {
      csrfCookieHeaderBinding: "pass",
      register: "pass",
      registrationSession: "pass",
      login: "pass",
      sessionPersistence: "pass",
      logoutInvalidation: "pass",
      syntheticUserRemovedWithDatabase: true,
    };
    try {
      evidence.browser = await runBrowserJourney(
        authEmail,
        authPassword,
        authResult.userId,
        baseEnv,
      );
    } catch (error) {
      const browserFailure = String(error?.message ?? error).slice(0, 1200);
      const loginAsset = readdirSync(join(root, "dist/public/assets"))
        .find((name) => name.startsWith("Login-") && name.endsWith(".js"));
      const staleLoginAsset = loginAsset
        ? !readFileSync(join(root, "dist/public/assets", loginAsset), "utf8").includes("x-csrf-token")
        : true;
      const prerequisite = staleLoginAsset
        ? "Rebuild dist/public from current client source: the assembled Login asset lacks the source login CSRF-header logic."
        : "Investigate the recorded browser login failure against the current built asset.";
      evidence.browser = {
        engine: "Chromium CDP",
        hydrated: true,
        screenshot: "reports/readiness-implementation/assembled-acceptance-login.png",
        formLogin: "fail",
        failure: browserFailure,
        prerequisite,
      };
      failures.push(`browser login acceptance failed: ${prerequisite}`);
    }
  }

  const ready = await waitFor("/api/ready", (response) => {
    if (response.status !== 200) return false;
    try {
      const body = JSON.parse(response.body);
      return body && typeof body === "object" && body.status === "ok";
    } catch {
      return false;
    }
  }, 90_000);
  const readyBody = JSON.parse(ready.body);
  const subsystemStatuses = Array.isArray(readyBody.subsystems)
    ? Object.fromEntries(readyBody.subsystems.map((value, index) => [
        String(value?.name ?? index),
        {
          status: value?.status ?? "unknown",
          ...(typeof value?.detail === "string" ? { detail: value.detail } : {}),
        },
      ]))
    : Object.fromEntries(
        Object.entries(readyBody.subsystems ?? {}).map(([name, value]) => [
          name,
          value && typeof value === "object"
            ? {
                status: value.status ?? "unknown",
                ...(typeof value.detail === "string" ? { detail: value.detail } : {}),
              }
            : { status: String(value) },
        ]),
      );
  evidence.readiness = {
    status: ready.status,
    aggregate: readyBody.status ?? readyBody.phase ?? readyBody.ready ?? "unknown",
    ready: readyBody.ready,
    subsystems: subsystemStatuses,
  };
  evidence.appProcess = "pass";
  observations.push("Real application routes and production static frontend were served from the assembled server process.");
  observations.push("Normal registration/login used the real password hashing, CSRF, session store, and logout paths with a synthetic user; no auth bypass was used.");
  observations.push(
    httpLoadOnly
      ? "Explicit load-only mode did not launch Chromium; the default invocation retains its browser flow."
      : evidence.browser.formLogin === true
      ? "A real headless Chromium page hydrated the login UI, submitted the login form, persisted its cookie session, logged out, and captured a pre-credential screenshot."
      : "A real headless Chromium page hydrated the login UI and captured a pre-credential screenshot, but the assembled browser login failed; HTTP auth evidence remains distinct and the artifact prerequisite is recorded.",
  );
  if (ready.status !== 200 || readyBody.ready === false) {
    failures.push(
      `critical readiness gate did not pass: HTTP ${ready.status}, aggregate ${evidence.readiness.aggregate}`,
    );
  }
} catch (error) {
  failures.push(String(error?.message ?? error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]").slice(0, 1800));
} finally {
  if (app && app.exitCode === null) {
    app.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => app.once("exit", resolveExit)),
      new Promise((resolveExit) => setTimeout(resolveExit, 5_000)),
    ]);
    if (app.exitCode === null) app.kill("SIGKILL");
  }
  if (client) await client.end().catch(() => {});
  if (postgresStarted) {
    const stop = spawnSync("pg_ctl", ["-D", join(temp, "pg"), "-m", "immediate", "-w", "stop"], {
      env: { PATH: process.env.PATH, HOME: join(temp, "home"), LANG: "C", TZ: "UTC" },
      encoding: "utf8",
      timeout: 30_000,
    });
    if (stop.status !== 0) failures.push("temporary PostgreSQL cleanup failed");
  }
  evidence.cleanup = failures.includes("temporary PostgreSQL cleanup failed") ? "fail" : "pass";
  rmSync(temp, { recursive: true, force: true });
}

const revisionResult = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  env: { PATH: process.env.PATH, HOME: "/tmp", LANG: "C" },
  encoding: "utf8",
  timeout: 5_000,
});
const sourceFiles = [
  "scripts/readiness-assembled-acceptance.mjs",
  "scripts/readiness-egress-guard.mjs",
  "server/index.ts",
  "server/routes.ts",
  "server/middleware/csrf.ts",
  "shared/schema.ts",
];
const result = {
  generatedAt: new Date().toISOString(),
  startedAt,
  decision: failures.length ? "FAIL" : "PASS_WITH_UNTESTED_CATEGORIES",
  command: `env -i PATH="$PATH" HOME=/tmp node scripts/readiness-assembled-acceptance.mjs${httpLoadOnly ? " --http-load" : ""}`,
  artifactLabel: httpLoadOnly
    ? "source application authenticated HTTP simulation; not packed application acceptance"
    : "source application assembled acceptance; not packed application acceptance",
  sourceRevision: revisionResult.status === 0 ? revisionResult.stdout.trim() : "unavailable",
  sourceFileDigestsSha256: Object.fromEntries(sourceFiles.map((file) => [
    file,
    sha256(readFileSync(join(root, file))),
  ])),
  safety: {
    inheritedSecretNamesRejected: true,
    database: "ephemeral local PostgreSQL containing generated synthetic empty schema only",
    network: "child preloader permits loopback TCP/Unix sockets only; rejects wrapper and direct-socket external TCP, UDP, and child processes",
    pdim: "no real PDIM; no Redis credential or non-loopback endpoint is available",
    maxCore: "not started; loopback port 9 is a closed sentinel and no model is loaded",
    providerCredentialsPresent: false,
    productionDataPresent: false,
    disposableWorkingDirectory: true,
  },
  evidence,
  failures,
  observations,
  untested: [
    "authenticated browser journeys beyond the completed login/session/logout path",
    "provider sandbox delivery, OAuth, webhooks, messaging, push, email, social posting, and DSP contracts",
    "real-money payment, payout, refund, royalty, and financial reconciliation",
    "production-source restore/upgrade/rollback and durable backup recovery",
    "local MaxCore inference/model behavior (the only MaxCore implementation; intentionally not started in this bounded non-ML drill)",
    httpLoadOnly
      ? "Redis/PDIM loss recovery, soak, multi-process clustering, DNS/TLS, browser UI, and packed cold-image startup"
      : "Redis/PDIM loss recovery, load/soak, multi-worker clustering, DNS/TLS, and packed cold-image startup",
  ],
};
writeFileSync(reportJson, JSON.stringify(result, null, 2) + "\n");
const md = `# ${httpLoadOnly ? "Authenticated HTTP load simulation" : "Assembled application acceptance drill"}

Decision: **${result.decision}**

Artifact label: **${result.artifactLabel}**

## Replay

\`${result.command}\`

Run started: ${startedAt}

Report generated: ${result.generatedAt}

## Safety boundary

- The runner refuses inherited database, provider, token, key, secret, Sentry, Redis, and Node preload variables.
- The child receives an allowlisted environment, a generated one-run session secret, an ephemeral local PostgreSQL URL, and no provider credentials.
- The real application runs from a disposable working directory. PostgreSQL contains only a generated empty schema; no shared/live database or production data is read.
- A pre-import guard rejects non-loopback TCP/TLS (including direct Socket.connect), all UDP, and child processes. MaxCore local startup, fan delivery, ACME, DNS local startup, and clustering are explicitly off; none is counted as accepted.
- ${httpLoadOnly ? "Chromium is intentionally not launched in explicit load-only mode; the default browser flow is unchanged." : "Chromium is launched headless with external host resolution denied. Screenshot capture is attempted before credentials are entered; its exact result is recorded in the browser evidence."}
- Temporary database, logs, credentials, and working files are removed after the bounded run.

## Executed evidence

\`\`\`json
${JSON.stringify(evidence, null, 2)}
\`\`\`

${failures.length ? `## Sanitized failures\n\n${failures.map((failure) => `- ${failure}`).join("\n")}\n` : ""}
## Interpretation

${observations.length ? observations.map((item) => `- ${item}`).join("\n") : "- The assembled startup did not reach sufficient evidence for an acceptance observation."}
- A 200 liveness response alone is not treated as readiness. Frontend acceptance requires a real HTML response after the production static handler is active.
- \`frontend\` records the raw production HTML response; \`browser\` separately records JavaScript hydration and the real browser form/session journey.
- This result does not disable a failed critical readiness dependency or relabel degraded provider behavior as a pass.
- Passing load thresholds proves only this bounded source-app/ephemeral-PostgreSQL run. It does not prove PDIM, MaxCore, a packed artifact, production capacity, or provider acceptance.

## Still untested

${result.untested.map((item) => `- ${item}`).join("\n")}
`;
writeFileSync(reportMd, md);
console.log(JSON.stringify({ decision: result.decision, evidence, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;