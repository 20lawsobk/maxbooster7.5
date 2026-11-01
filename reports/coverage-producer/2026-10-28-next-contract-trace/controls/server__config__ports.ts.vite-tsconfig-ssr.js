__vite_ssr_exportName__("defaultPorts", () => { try { return defaultPorts } catch {} });
__vite_ssr_exportName__("runtimePorts", () => { try { return runtimePorts } catch {} });
__vite_ssr_exportName__("loopbackUrl", () => { try { return loopbackUrl } catch {} });
const MIN_PORT = 1;
const MAX_PORT = 65535;
const defaultPorts = Object.freeze({
  app: 5e3,
  localPdim: 5556,
  diffusionGateway: 8008,
  maxcoreApi: 8090,
  boosterState: 9877,
  maxcoreModelApi: 9878,
  maxcoreModelHealth: 9879,
  legacyPythonAi: 9880
});
function readPort(name, defaultValue) {
  const raw = process.env[name];
  if (raw === void 0 || raw.trim() === "") return defaultValue;
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`
    );
  };
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_PORT || value > MAX_PORT) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`
    );
  };
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
    };
    owners.set(port, name);
  };
  return Object.freeze(ports);
}
const runtimePorts = assertUniquePorts({
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
function loopbackUrl(port) {
  return `http://127.0.0.1:${port}`;
}
