#!/usr/bin/env tsx
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/config/ports.ts
var ports_exports = {};
__export(ports_exports, {
  defaultPorts: () => defaultPorts,
  loopbackUrl: () => loopbackUrl,
  runtimePorts: () => runtimePorts
});
function readPort(name, defaultValue) {
  const raw = process.env[name];
  if (raw === void 0 || raw.trim() === "") return defaultValue;
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_PORT || value > MAX_PORT) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`
    );
  }
  return value;
}
function assertUniquePorts(ports) {
  const owners = /* @__PURE__ */ new Map();
  for (const [name, port] of Object.entries(ports)) {
    const existing = owners.get(port);
    if (existing) {
      throw new Error(
        `[Ports] ${name} and ${existing} are both configured for port ${port}. Internal services must use distinct ports.`
      );
    }
    owners.set(port, name);
  }
  return Object.freeze(ports);
}
function loopbackUrl(port) {
  return `http://127.0.0.1:${port}`;
}
var MIN_PORT, MAX_PORT, defaultPorts, runtimePorts;
var init_ports = __esm({
  "server/config/ports.ts"() {
    "use strict";
    MIN_PORT = 1;
    MAX_PORT = 65535;
    defaultPorts = Object.freeze({
      app: 5e3,
      localPdim: 5556,
      diffusionGateway: 8008,
      maxcoreApi: 8090,
      boosterState: 9877,
      maxcoreModelApi: 9878,
      maxcoreModelHealth: 9879,
      legacyPythonAi: 9880
    });
    runtimePorts = assertUniquePorts({
      app: readPort("PORT", defaultPorts.app),
      localPdim: readPort("LOCAL_PDIM_PORT", defaultPorts.localPdim),
      diffusionGateway: readPort(
        "VIDEO_DIFFUSION_PORT",
        defaultPorts.diffusionGateway
      ),
      maxcoreApi: readPort("MAXCORE_LOCAL_PORT", defaultPorts.maxcoreApi),
      boosterState: readPort(
        "BOOSTERSTATE_SIDECAR_PORT",
        defaultPorts.boosterState
      ),
      maxcoreModelApi: readPort(
        "MODEL_API_PORT",
        defaultPorts.maxcoreModelApi
      ),
      maxcoreModelHealth: readPort(
        "MODEL_API_HEALTH_PORT",
        defaultPorts.maxcoreModelHealth
      ),
      legacyPythonAi: readPort("PYTHON_AI_PORT", defaultPorts.legacyPythonAi)
    });
  }
});

// scripts/check-port-contract.ts
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
var REPLIT_DEFAULT_EXTERNAL_PORT = 80;
function fail(message) {
  console.error(`[PortContract] FATAL: ${message}`);
  process.exit(1);
}
var runtimePorts2;
try {
  ({ runtimePorts: runtimePorts2 } = await Promise.resolve().then(() => (init_ports(), ports_exports)));
} catch (err) {
  fail(
    `runtime port contract failed to load: ${err instanceof Error ? err.message : String(err)}`
  );
}
console.log("[PortContract] \u2705 all internal service ports are distinct");
console.log(
  `[PortContract]    ${Object.entries(runtimePorts2).map(([k, v]) => `${k}=${v}`).join(", ")}`
);
var workspaceMapping = resolve(process.cwd(), ".replit");
var replitPath = existsSync(workspaceMapping) ? workspaceMapping : resolve(process.cwd(), "dist/deployment/ports.replit");
if (!existsSync(replitPath)) {
  fail(`${replitPath} does not exist; cannot verify the public port mapping`);
}
var replitText = readFileSync(replitPath, "utf8");
var mappings = [];
var lines = replitText.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() !== "[[ports]]") continue;
  const blockLine = i + 1;
  let localPort;
  let externalPort;
  let exposeLocalhost;
  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j].trim();
    if (line.startsWith("[[ports]]")) {
      i = j - 1;
      break;
    }
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("[") && !line.startsWith("[[ports]]")) break;
    const localMatch = line.match(/^localPort\s*=\s*(\d+)\s*(?:#.*)?$/);
    const externalMatch = line.match(/^externalPort\s*=\s*(\d+)\s*(?:#.*)?$/);
    const exposeMatch = line.match(/^exposeLocalhost\s*=\s*(true|false)\s*(?:#.*)?$/);
    if (line.startsWith("externalPort") && !externalMatch) fail(`Invalid externalPort at line ${j + 1}`);
    if (line.startsWith("exposeLocalhost") && !exposeMatch) fail(`Invalid exposeLocalhost at line ${j + 1}`);
    if (localMatch) localPort = Number(localMatch[1]);
    if (externalMatch) externalPort = Number(externalMatch[1]);
    if (exposeMatch) exposeLocalhost = exposeMatch[1] === "true";
  }
  if (localPort === void 0) {
    fail(
      `.replit [[ports]] block starting at line ${blockLine} is missing localPort`
    );
  }
  mappings.push({ localPort, externalPort, exposeLocalhost, line: blockLine });
}
if (mappings.length === 0) {
  fail(`.replit has no [[ports]] entries; expected a mapping for the app port`);
}
var localOwners = /* @__PURE__ */ new Map();
for (const m of mappings) {
  const existingLine = localOwners.get(m.localPort);
  if (existingLine !== void 0) {
    fail(
      `.replit maps localPort ${m.localPort} more than once (line ${existingLine} and line ${m.line}); each local service must appear at most once in [[ports]]`
    );
  }
  localOwners.set(m.localPort, m.line);
}
var externalOwners = /* @__PURE__ */ new Map();
for (const m of mappings) {
  if (m.externalPort === void 0) continue;
  const existingLine = externalOwners.get(m.externalPort);
  if (existingLine !== void 0) {
    fail(
      `.replit maps externalPort ${m.externalPort} more than once (line ${existingLine} and line ${m.line}); two local ports cannot share one public external port`
    );
  }
  externalOwners.set(m.externalPort, m.line);
}
var publicMappings = mappings.filter(
  (m) => m.externalPort === REPLIT_DEFAULT_EXTERNAL_PORT
);
if (publicMappings.length === 0) {
  fail(
    `.replit has no [[ports]] entry mapping to externalPort ${REPLIT_DEFAULT_EXTERNAL_PORT}; the app (localPort ${runtimePorts2.app}) must be reachable on Replit's default public port`
  );
}
if (publicMappings.length > 1) {
  fail(
    `.replit maps externalPort ${REPLIT_DEFAULT_EXTERNAL_PORT} from multiple local ports (${publicMappings.map((m) => `localPort ${m.localPort} at line ${m.line}`).join(", ")}); only the app listener may be exposed there`
  );
}
var [publicMapping] = publicMappings;
if (publicMapping.localPort !== runtimePorts2.app) {
  fail(
    `.replit exposes localPort ${publicMapping.localPort} on the public default port ${REPLIT_DEFAULT_EXTERNAL_PORT} (line ${publicMapping.line}), but the app listens on ${runtimePorts2.app} (PORT). The Replit public mapping must point at the app, not an internal service.`
  );
}
var internalPortSet = new Set(
  Object.entries(runtimePorts2).filter(([name]) => name !== "app").map(([, port]) => port)
);
internalPortSet.add(6379);
var nativeRedisUrl = process.env.REDIS_URL || process.env.NATIVE_REDIS_URL || "";
try {
  const redisUrl = new URL(nativeRedisUrl);
  const redisHost = redisUrl.hostname.toLowerCase();
  if ((redisUrl.protocol === "redis:" || redisUrl.protocol === "rediss:") && ["127.0.0.1", "localhost", "::1"].includes(redisHost)) {
    internalPortSet.add(Number(redisUrl.port || 6379));
  }
} catch {
}
var leakedInternal = mappings.find(
  (m) => m.externalPort !== void 0 && internalPortSet.has(m.localPort)
);
if (leakedInternal) {
  fail(
    `.replit exposes internal-only localPort ${leakedInternal.localPort} on externalPort ${leakedInternal.externalPort} (line ${leakedInternal.line}); internal services must remain private and omit externalPort`
  );
}
var discoverableInternal = mappings.find(
  (m) => internalPortSet.has(m.localPort) && m.exposeLocalhost === true
);
if (discoverableInternal) {
  fail(`.replit enables exposeLocalhost for internal-only localPort ${discoverableInternal.localPort}; set exposeLocalhost = false`);
}
console.log(
  `[PortContract] \u2705 .replit public mapping exposes only the app listener (localPort ${publicMapping.localPort} \u2192 externalPort ${REPLIT_DEFAULT_EXTERNAL_PORT})`
);
console.log(
  `[PortContract] \u2705 .replit [[ports]] table has ${mappings.length} entries with no duplicate local/external ports; ${mappings.filter((m) => m.externalPort === void 0).length} private`
);
console.log("[PortContract] port contract OK");
