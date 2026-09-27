import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const checker = resolve("scripts/check-port-contract.ts");
const tsx = resolve("node_modules/.bin/tsx");
const temporaryDirectories: string[] = [];
const portEnvironment: Record<string, string> = {
  PATH: process.env.PATH ?? "",
  HOME: tmpdir(),
  PORT: "5000",
  LOCAL_PDIM_PORT: "5556",
  VIDEO_DIFFUSION_PORT: "8008",
  MAXCORE_LOCAL_PORT: "8090",
  BOOSTERSTATE_SIDECAR_PORT: "9877",
  MODEL_API_PORT: "9878",
  MODEL_API_HEALTH_PORT: "9879",
  PYTHON_AI_PORT: "9880",
};

function checkPortConfig(replitConfig: string) {
  const directory = mkdtempSync(join(tmpdir(), "port-contract-"));
  temporaryDirectories.push(directory);
  writeFileSync(join(directory, ".replit"), replitConfig);

  return spawnSync(
    tsx,
    [checker],
    {
      cwd: directory,
      encoding: "utf8",
      env: portEnvironment,
      timeout: 10_000,
    },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Replit public port contract", () => {
  it("does not let blank lines hide a public sidecar mapping", () => {
    const result = checkPortConfig(`
[[ports]]
localPort = 5000
externalPort = 80
[[ports]]
localPort = 8090

# Blank lines do not terminate a TOML table.
externalPort = 3002
`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exposes internal-only localPort 8090");
  });

  it("rejects explicitly enabling localhost exposure for private services", () => {
    const result = checkPortConfig(`
[[ports]]
localPort = 5000
externalPort = 80
[[ports]]
localPort = 6379
exposeLocalhost = true
`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("set exposeLocalhost = false");
  });

  it("accepts explicit private mappings with whitespace and comments", () => {
    const result = checkPortConfig(`
[[ports]]
localPort = 5000
externalPort = 80
[[ports]]
localPort = 9878

exposeLocalhost = false # model API is loopback-only
`);
    expect(result.status).toBe(0);
  });
  it("accepts the application mapped from local 5000 to public 80", () => {
    const result = checkPortConfig(`
[[ports]]
localPort = 5000
externalPort = 80
`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "localPort 5000 → externalPort 80",
    );
  });

  it("accepts local-only Redis 6379 as a private entry", () => {
    const result = checkPortConfig(`
[[ports]]
localPort = 5000
externalPort = 80

[[ports]]
localPort = 6379
`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 private");
  });

  it("rejects a port entry missing localPort", () => {
    const result = checkPortConfig(`
[[ports]]
externalPort = 3000
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[[ports]] block starting at line 2 is missing localPort",
    );
  });

  it("rejects the former exact Redis 6379 to public 80 mapping", () => {
    const result = checkPortConfig(`
[[ports]]
localPort = 6379
externalPort = 80
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "exposes localPort 6379 on the public default port 80",
    );
    expect(result.stderr).toContain("the app listens on 5000");
  });

  it("rejects adding Redis beside the application on public 80", () => {
    const result = checkPortConfig(`
[[ports]]
localPort = 5000
externalPort = 80

[[ports]]
localPort = 6379
externalPort = 80
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "maps externalPort 80 more than once",
    );
  });

  it("rejects moving default Redis to a different public external port", () => {
    const result = checkPortConfig(`
[[ports]]
localPort = 5000
externalPort = 80

[[ports]]
localPort = 6379
externalPort = 3001
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "exposes internal-only localPort 6379 on externalPort 3001",
    );
  });

  it("rejects publishing the configured non-default loopback Redis port", () => {
    const previous = portEnvironment.REDIS_URL;
    portEnvironment.REDIS_URL = "redis://127.0.0.1:6380";
    try {
      const result = checkPortConfig(`
[[ports]]
localPort = 5000
externalPort = 80

[[ports]]
localPort = 6380
externalPort = 3001
`);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "exposes internal-only localPort 6380 on externalPort 3001",
      );
    } finally {
      if (previous === undefined) delete portEnvironment.REDIS_URL;
      else portEnvironment.REDIS_URL = previous;
    }
  });

  it("rejects publishing a known internal service on any external port", () => {
    const result = checkPortConfig(`
[[ports]]
localPort = 5000
externalPort = 80

[[ports]]
localPort = 5556
externalPort = 3000
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "exposes internal-only localPort 5556 on externalPort 3000",
    );
    expect(result.stderr).toContain("remain private and omit externalPort");
  });
});