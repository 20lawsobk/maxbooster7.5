#!/usr/bin/env tsx
/**
 * Port-contract drift detector.
 *
 * The shell launcher (scripts/port-contract.sh), the Node runtime
 * (server/config/ports.ts), and the Replit workspace config (.replit) all
 * describe the same set of listeners independently. A future edit to any one
 * of them can silently drift out of sync with the others — e.g. a new
 * internal service picks a port another service already owns, or someone
 * adds a `.replit` port mapping that exposes an internal-only service on the
 * public HTTP port. This check catches that before a restart takes the app
 * down.
 *
 * It verifies, using the SAME env vars the app itself resolves ports from:
 *   1. Every internal service port is distinct (delegates to
 *      server/config/ports.ts, which throws on collision).
 *   2. The public app port (PORT) does not collide with any internal port.
 *   3. `.replit`'s [[ports]] table maps exactly one `localPort` to the
 *      Replit-default external port (80) — the app's public HTTP port — and
 *      that mapping points at `runtimePorts.app`, not an internal service.
 *   4. No internal service port is ALSO mapped to external port 80 in
 *      `.replit` (which would make it publicly reachable as if it were the
 *      app).
 *   5. `.replit`'s [[ports]] table itself has no duplicate `localPort` or
 *      duplicate `externalPort` entries.
 *
 * Exit codes:
 *   0 — contract holds
 *   1 — drift or invalid configuration detected (diagnostic printed to stderr)
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const REPLIT_DEFAULT_EXTERNAL_PORT = 80;

function fail(message: string): never {
  console.error(`[PortContract] FATAL: ${message}`);
  process.exit(1);
}

// ── 1 & 2. Internal + public port uniqueness ────────────────────────────────
// Importing server/config/ports.ts runs its own `assertUniquePorts` guard
// (throws on any collision, including invalid non-numeric values) using the
// real process.env, so we get that validation for free by importing it.
let runtimePorts: Record<string, number>;
try {
  ({ runtimePorts } = await import("../server/config/ports.js"));
} catch (err) {
  fail(
    `runtime port contract failed to load: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
}

console.log("[PortContract] ✅ all internal service ports are distinct");
console.log(
  `[PortContract]    ${Object.entries(runtimePorts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")}`,
);

// ── 3, 4 & 5. Cross-check against .replit's [[ports]] table ────────────────
const replitPath = resolve(process.cwd(), ".replit");
if (!existsSync(replitPath)) {
  fail(`${replitPath} does not exist; cannot verify the public port mapping`);
}

const replitText = readFileSync(replitPath, "utf8");

// .replit's [[ports]] entries are simple two-key TOML tables:
//   [[ports]]
//   localPort = 5000
//   externalPort = 80
// Parse them without a full TOML parser by scanning line-by-line for
// `[[ports]]` blocks and pulling the two integer keys out of each.
interface PortMapping {
  localPort: number;
  externalPort: number;
  line: number;
}

const mappings: PortMapping[] = [];
const lines = replitText.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() !== "[[ports]]") continue;

  let localPort: number | undefined;
  let externalPort: number | undefined;
  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j].trim();
    if (line === "" || line.startsWith("[[ports]]")) {
      if (line.startsWith("[[ports]]")) i = j - 1; // let outer loop re-check this line
      break;
    }
    if (line.startsWith("[") && !line.startsWith("[[ports]]")) break;

    const localMatch = line.match(/^localPort\s*=\s*(\d+)/);
    const externalMatch = line.match(/^externalPort\s*=\s*(\d+)/);
    if (localMatch) localPort = Number(localMatch[1]);
    if (externalMatch) externalPort = Number(externalMatch[1]);
  }

  if (localPort === undefined || externalPort === undefined) {
    fail(
      `.replit [[ports]] block starting at line ${i + 1} is missing localPort or externalPort`,
    );
  }
  mappings.push({ localPort, externalPort, line: i + 1 });
}

if (mappings.length === 0) {
  fail(`.replit has no [[ports]] entries; expected a mapping for the app port`);
}

// 5a. No duplicate localPort entries.
const localOwners = new Map<number, number>();
for (const m of mappings) {
  const existingLine = localOwners.get(m.localPort);
  if (existingLine !== undefined) {
    fail(
      `.replit maps localPort ${m.localPort} more than once (line ${existingLine} and line ${m.line}); ` +
        "each local service must appear at most once in [[ports]]",
    );
  }
  localOwners.set(m.localPort, m.line);
}

// 5b. No duplicate externalPort entries.
const externalOwners = new Map<number, number>();
for (const m of mappings) {
  const existingLine = externalOwners.get(m.externalPort);
  if (existingLine !== undefined) {
    fail(
      `.replit maps externalPort ${m.externalPort} more than once (line ${existingLine} and line ${m.line}); ` +
        "two local ports cannot share one public external port",
    );
  }
  externalOwners.set(m.externalPort, m.line);
}

// 3 & 4. Exactly one mapping to the Replit-default external port (80), and it
// must be the app's listener — not an internal service.
const publicMappings = mappings.filter(
  (m) => m.externalPort === REPLIT_DEFAULT_EXTERNAL_PORT,
);

if (publicMappings.length === 0) {
  fail(
    `.replit has no [[ports]] entry mapping to externalPort ${REPLIT_DEFAULT_EXTERNAL_PORT}; ` +
      `the app (localPort ${runtimePorts.app}) must be reachable on Replit's default public port`,
  );
}

if (publicMappings.length > 1) {
  fail(
    `.replit maps externalPort ${REPLIT_DEFAULT_EXTERNAL_PORT} from multiple local ports ` +
      `(${publicMappings.map((m) => `localPort ${m.localPort} at line ${m.line}`).join(", ")}); ` +
      "only the app listener may be exposed there",
  );
}

const [publicMapping] = publicMappings;
if (publicMapping.localPort !== runtimePorts.app) {
  fail(
    `.replit exposes localPort ${publicMapping.localPort} on the public default port ` +
      `${REPLIT_DEFAULT_EXTERNAL_PORT} (line ${publicMapping.line}), but the app listens on ` +
      `${runtimePorts.app} (PORT). The Replit public mapping must point at the app, not an ` +
      "internal service.",
  );
}

const internalPortSet = new Set(
  Object.entries(runtimePorts)
    .filter(([name]) => name !== "app")
    .map(([, port]) => port),
);
const leakedInternal = mappings.find(
  (m) =>
    m.externalPort === REPLIT_DEFAULT_EXTERNAL_PORT &&
    internalPortSet.has(m.localPort),
);
if (leakedInternal) {
  fail(
    `.replit exposes internal-only localPort ${leakedInternal.localPort} on the public default ` +
      `port ${REPLIT_DEFAULT_EXTERNAL_PORT} (line ${leakedInternal.line}); internal services must ` +
      "never be reachable there",
  );
}

console.log(
  `[PortContract] ✅ .replit public mapping exposes only the app listener ` +
    `(localPort ${publicMapping.localPort} → externalPort ${REPLIT_DEFAULT_EXTERNAL_PORT})`,
);
console.log(
  `[PortContract] ✅ .replit [[ports]] table has ${mappings.length} entries with no duplicate local/external ports`,
);
console.log("[PortContract] port contract OK");
