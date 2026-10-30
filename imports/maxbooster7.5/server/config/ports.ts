/**
 * Runtime port contract.
 *
 * PORT is the only externally served HTTP listener. Every other value in this
 * module is an internal, loopback-only service port. Keep all first-party
 * processes on this contract instead of embedding numeric defaults in callers.
 */

const MIN_PORT = 1;
const MAX_PORT = 65_535;

export const defaultPorts = Object.freeze({
  app: 5_000,
  localPdim: 5_556,
  diffusionGateway: 8_008,
  maxcoreApi: 8_090,
  boosterState: 9_877,
  maxcoreModelApi: 9_878,
  maxcoreModelHealth: 9_879,
  legacyPythonAi: 9_880,
});

export type RuntimePorts = Readonly<
  Record<keyof typeof defaultPorts, number>
>;

function readPort(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return defaultValue;

  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`,
    );
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_PORT || value > MAX_PORT) {
    throw new Error(
      `[Ports] ${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}; received "${raw}"`,
    );
  }

  return value;
}

function assertUniquePorts(ports: RuntimePorts): RuntimePorts {
  const owners = new Map<number, string>();
  for (const [name, port] of Object.entries(ports)) {
    const existing = owners.get(port);
    if (existing) {
      throw new Error(
        `[Ports] ${name} and ${existing} are both configured for port ${port}. ` +
          "Internal services must use distinct ports.",
      );
    }
    owners.set(port, name);
  }
  return Object.freeze(ports);
}

export const runtimePorts = assertUniquePorts({
  app: readPort("PORT", defaultPorts.app),
  localPdim: readPort("LOCAL_PDIM_PORT", defaultPorts.localPdim),
  diffusionGateway: readPort(
    "VIDEO_DIFFUSION_PORT",
    defaultPorts.diffusionGateway,
  ),
  maxcoreApi: readPort("MAXCORE_LOCAL_PORT", defaultPorts.maxcoreApi),
  boosterState: readPort(
    "BOOSTERSTATE_SIDECAR_PORT",
    defaultPorts.boosterState,
  ),
  maxcoreModelApi: readPort(
    "MODEL_API_PORT",
    defaultPorts.maxcoreModelApi,
  ),
  maxcoreModelHealth: readPort(
    "MODEL_API_HEALTH_PORT",
    defaultPorts.maxcoreModelHealth,
  ),
  legacyPythonAi: readPort("PYTHON_AI_PORT", defaultPorts.legacyPythonAi),
});

export function loopbackUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}