/**
 * readiness-gauge — unit tests.
 *
 * Covers: profile validation/loading, check resolution (only/skip), scoring
 * math, verdict rules (required-fail/blocked, thresholds), report rendering,
 * tuning (a custom profile changes the verdict), and real check probes
 * against temporary git repositories.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_CHECKS, collectSecretHits } from "../../scripts/readiness-gauge/lib/checks.js";
import {
  buildGaugeReport,
  decideVerdict,
  runChecks,
  scoreChecks,
} from "../../scripts/readiness-gauge/lib/engine.js";
import {
  listProfiles,
  loadProfile,
  resolveChecks,
  resolveProfilesDir,
  validateProfile,
} from "../../scripts/readiness-gauge/lib/profiles.js";
import { renderJson, renderMarkdown } from "../../scripts/readiness-gauge/lib/report.js";
import type {
  CheckResult,
  IndustryProfile,
  ResolvedCheck,
  ScoredCheck,
} from "../../scripts/readiness-gauge/lib/types.js";

/* ── fixtures ─────────────────────────────────────────────────────────── */

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function makeRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "gauge-test-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "test"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

function getCheck(id: string) {
  const c = ALL_CHECKS.find((x) => x.id === id);
  if (!c) throw new Error(`check ${id} missing from library`);
  return c;
}

function scored(
  id: string,
  status: ScoredCheck["status"],
  weight = 1,
  required = false,
): ScoredCheck {
  return {
    id,
    name: id,
    category: "test",
    enabled: true,
    weight,
    required,
    status,
    points: status === "blocked" ? null : { pass: 100, warn: 60, fail: 0 }[status],
    summary: `${id} ${status}`,
    evidence: [],
    durationMs: 1,
  };
}

function baseProfile(overrides: Partial<IndustryProfile> = {}): IndustryProfile {
  return {
    name: "test",
    displayName: "Test",
    description: "test profile",
    version: "1.0.0",
    thresholds: { go: 85, conditionalGo: 65 },
    checks: {},
    ...overrides,
  };
}

/* ── profile loading / validation ─────────────────────────────────────── */

describe("profile validation", () => {
  it("accepts a well-formed profile", () => {
    const p = validateProfile(
      baseProfile({ checks: { "secrets-scan": { weight: 5, required: true } } }),
    );
    expect(p.name).toBe("test");
  });

  it("rejects unknown check ids", () => {
    expect(() =>
      validateProfile(baseProfile({ checks: { "nope": { weight: 2 } } })),
    ).toThrow(/unknown check id/);
  });

  it("rejects inverted thresholds", () => {
    expect(() =>
      validateProfile(baseProfile({ thresholds: { go: 60, conditionalGo: 70 } })),
    ).toThrow(/thresholds.go must be greater/);
  });

  it("rejects out-of-range weights", () => {
    expect(() =>
      validateProfile(baseProfile({ checks: { "secrets-scan": { weight: 9 } } })),
    ).toThrow(/weight/);
  });

  it("rejects missing required fields", () => {
    expect(() => validateProfile({ name: "x" })).toThrow(/missing required field/);
  });
});

describe("profile loading", () => {
  const dir = resolveProfilesDir();

  it("lists the shipped industry profiles", () => {
    const names = listProfiles(dir);
    expect(names).toEqual(
      expect.arrayContaining(["generic", "fintech", "healthcare", "ecommerce", "saas", "media"]),
    );
  });

  it("loads and validates the fintech profile", () => {
    const p = loadProfile(dir, "fintech");
    expect(p.checks["secrets-scan"].required).toBe(true);
    expect(p.checks["secrets-scan"].weight).toBe(5);
    expect(p.thresholds.go).toBeGreaterThan(p.thresholds.conditionalGo);
  });

  it("requires env-config in the generic profile", () => {
    const p = loadProfile(dir, "generic");
    expect(p.checks["env-config"].required).toBe(true);
  });

  it("throws a helpful error for unknown profiles", () => {
    expect(() => loadProfile(dir, "aerospace")).toThrow(/Known profiles/);
  });

  it("loads a custom profile file", () => {
    const dir2 = mkdtempSync(join(tmpdir(), "gauge-prof-"));
    dirs.push(dir2);
    const file = join(dir2, "custom.json");
    writeFileSync(
      file,
      JSON.stringify(baseProfile({ checks: { "readme": { enabled: false } } })),
    );
    const p = loadProfile(dir, file);
    expect(p.checks["readme"].enabled).toBe(false);
  });
});

describe("resolveChecks", () => {
  it("defaults unlisted checks to enabled weight 1", () => {
    const resolved = resolveChecks(baseProfile(), ALL_CHECKS);
    expect(resolved).toHaveLength(ALL_CHECKS.length);
    const readme = resolved.find((r) => r.check.id === "readme")!;
    expect(readme.enabled).toBe(true);
    expect(readme.weight).toBe(1);
    expect(readme.required).toBe(false);
  });

  it("applies tuning and --only/--skip filters", () => {
    const profile = baseProfile({
      checks: { "secrets-scan": { weight: 5, required: true, config: { x: 1 } } },
    });
    const resolved = resolveChecks(profile, ALL_CHECKS, ["secrets-scan", "readme"], ["readme"]);
    const enabled = resolved.filter((r) => r.enabled).map((r) => r.check.id);
    expect(enabled).toEqual(["secrets-scan"]);
    const s = resolved.find((r) => r.check.id === "secrets-scan")!;
    expect(s.weight).toBe(5);
    expect(s.required).toBe(true);
    expect(s.config).toEqual({ x: 1 });
  });
});

/* ── scoring and verdicts ─────────────────────────────────────────────── */

describe("scoreChecks", () => {
  it("computes the weighted mean, excluding blocked checks", () => {
    // pass(100)*3 + warn(60)*1 = 360 / 4 = 90; blocked excluded entirely.
    const { score } = scoreChecks([
      scored("a", "pass", 3),
      scored("b", "warn", 1),
      scored("c", "blocked", 5),
    ]);
    expect(score).toBe(90);
  });

  it("returns null when every check is blocked", () => {
    expect(scoreChecks([scored("a", "blocked")]).score).toBeNull();
  });

  it("breaks scores down by category", () => {
    const s = scored("a", "pass");
    s.category = "security";
    const { categories } = scoreChecks([s]);
    expect(categories).toEqual([{ category: "security", checks: 1, score: 100 }]);
  });
});

describe("decideVerdict", () => {
  const th = { go: 85, conditionalGo: 65 };

  it("GO when score clears the bar", () => {
    const { verdict } = decideVerdict([scored("a", "pass")], 95, th);
    expect(verdict).toBe("GO");
  });

  it("CONDITIONAL GO in the middle band", () => {
    const { verdict } = decideVerdict([scored("a", "warn")], 70, th);
    expect(verdict).toBe("CONDITIONAL GO");
  });

  it("NO GO below the conditional threshold", () => {
    const { verdict } = decideVerdict([scored("a", "fail")], 20, th);
    expect(verdict).toBe("NO GO");
  });

  it("a failed required check forces NO GO regardless of score", () => {
    const { verdict, reasons } = decideVerdict(
      [scored("a", "pass"), scored("b", "fail", 1, true)],
      95,
      th,
    );
    expect(verdict).toBe("NO GO");
    expect(reasons.join(" ")).toMatch(/required check failed: b/);
  });

  it("a blocked required check caps GO at CONDITIONAL GO", () => {
    const { verdict, reasons } = decideVerdict(
      [scored("a", "pass"), scored("b", "blocked", 1, true)],
      95,
      th,
    );
    expect(verdict).toBe("CONDITIONAL GO");
    expect(reasons.join(" ")).toMatch(/capped at CONDITIONAL GO/);
  });
});

describe("tuning changes outcomes", () => {
  it("the same check results score differently under different profiles", () => {
    const checks = [scored("secrets-scan", "warn", 1), scored("readme", "pass", 1)];
    const generic = buildGaugeReport(baseProfile(), "/repo", checks);
    const strict = buildGaugeReport(
      baseProfile({
        checks: { "secrets-scan": { weight: 5, required: true } },
        thresholds: { go: 95, conditionalGo: 80 },
      }),
      "/repo",
      checks.map((c) =>
        c.id === "secrets-scan" ? { ...c, weight: 5, required: true } : c,
      ),
    );
    // generic: (60+100)/2 = 80 -> CONDITIONAL GO; strict: (60*5+100)/6 = 66.7 -> NO GO.
    expect(generic.score).toBe(80);
    expect(generic.verdict).toBe("CONDITIONAL GO");
    expect(strict.score).toBeCloseTo(66.7, 1);
    expect(strict.verdict).toBe("NO GO");
  });
});

/* ── report rendering ─────────────────────────────────────────────────── */

describe("report rendering", () => {
  const report = buildGaugeReport(
    baseProfile({ name: "generic", displayName: "Generic" }),
    "/repo",
    [scored("secrets-scan", "pass", 3, true)],
  );

  it("markdown contains score, verdict, and tuning pointer", () => {
    const md = renderMarkdown(report);
    expect(md).toContain("Score: 100/100");
    expect(md).toContain("Verdict: GO");
    expect(md).toContain("secrets-scan");
    expect(md).toContain("--profile-file");
  });

  it("json round-trips", () => {
    const parsed = JSON.parse(renderJson(report));
    expect(parsed.score).toBe(100);
    expect(parsed.verdict).toBe("GO");
    expect(parsed.tool).toBe("readiness-gauge");
  });

  it("fix guide lists exactly why a check failed and the steps to pass", () => {
    const failing = scored("typecheck", "fail", 2, true);
    failing.summary = "1 TypeScript project(s) have errors";
    failing.evidence = [
      "tsconfig.server.json: 2 error(s)",
      "server/routes/distribution.ts(14,3): error TS6133: 'instantPayouts' is declared but its value is never read.",
    ];
    const md = renderMarkdown(
      buildGaugeReport(
        baseProfile({ name: "generic", displayName: "Generic" }),
        "/repo",
        [failing],
      ),
    );
    expect(md).toContain("## Why it failed — and the steps to pass");
    expect(md).toContain("**Why:** 1 TypeScript project(s) have errors");
    expect(md).toContain("server/routes/distribution.ts");
    expect(md).toContain("remove it, use it");
    expect(md).toContain("--only typecheck");
    expect(md).toContain("rerun the full gauge");
  });

  it("fix guide names the failing test suites for unit-tests", () => {
    const failing = scored("unit-tests", "fail", 5, true);
    failing.summary = "6 test failure(s)";
    failing.evidence = [
      "Test Files: 145 passed, 5 failed",
      "failing: tests/unit/stripe-webhook-honesty.test.ts",
    ];
    const md = renderMarkdown(
      buildGaugeReport(
        baseProfile({ name: "generic", displayName: "Generic" }),
        "/repo",
        [failing],
      ),
    );
    expect(md).toContain("Fix the failing suite");
    expect(md).toContain("stripe-webhook-honesty.test.ts");
  });

  it("fix guide says nothing to fix when every check passes", () => {
    expect(renderMarkdown(report)).toContain(
      "Nothing to fix — every check passed.",
    );
  });

  it("blocked checks get unblock steps, not pass steps", () => {
    const blockedCheck = scored("unit-tests", "blocked", 5, true);
    const md = renderMarkdown(
      buildGaugeReport(
        baseProfile({ name: "generic", displayName: "Generic" }),
        "/repo",
        [blockedCheck],
      ),
    );
    expect(md).toContain("**Steps to unblock:**");
  });
});

/* ── real check probes ────────────────────────────────────────────────── */

describe("real checks against temp git repos", () => {
  it("secrets-scan fails on a committed key, passes when clean", async () => {
    // Assembled at runtime so this tracked test file never contains a
    // flaggable secret literal — the gauge must not flag its own fixtures.
    const fakeKey = "sk_live_" + "a1".repeat(12);
    const dirty = makeRepo({
      "config.js": `const key = "${fakeKey}";\n`,
    });
    const clean = makeRepo({ "index.js": "console.log('hi');\n" });
    const dirtyRes: CheckResult = await getCheck("secrets-scan").run({ cwd: dirty }, {});
    expect(dirtyRes.status).toBe("fail");
    expect(dirtyRes.summary).toMatch(/potential secret/);
    expect(dirtyRes.remediation).toBeTruthy();
    // The secret value itself must not leak into evidence.
    expect(dirtyRes.evidence.join("\n")).not.toContain("a1a1a1");
    const cleanRes: CheckResult = await getCheck("secrets-scan").run({ cwd: clean }, {});
    expect(cleanRes.status).toBe("pass");
  });

  it("secrets-scan ignores PEM-header template literals but catches real key blocks", async () => {
    const templateOnly = makeRepo({
      "server/push.ts": "rawKey = `-----BEGIN PRIVATE KEY-----\\n${keyBody}\\n-----END PRIVATE KEY-----`;\n",
    });
    const tRes: CheckResult = await getCheck("secrets-scan").run({ cwd: templateOnly }, {});
    expect(tRes.status).toBe("pass");

    const realKey = makeRepo({
      "keys/id_rsa": "-----BEGIN RSA PRIVATE KEY-----\n" + "MIIEpAIBAAKCAQEA7b".repeat(8) + "\n-----END RSA PRIVATE KEY-----\n",
    });
    const kRes: CheckResult = await getCheck("secrets-scan").run({ cwd: realKey }, {});
    expect(kRes.status).toBe("fail");
    expect(kRes.evidence.join("\n")).toContain("keys/id_rsa");
    // Key material must not leak into evidence.
    expect(kRes.evidence.join("\n")).not.toContain("MIIEpAIBAAKCAQEA");
  });

  it("secrets-scan honors exclude globs for fixture paths", async () => {
    const fakeKey = "sk_live_" + "b2".repeat(12);
    const dir = makeRepo({
      "tests/fixtures/seed.js": `const key = "${fakeKey}";\n`,
      "src/app.js": "console.log('clean');\n",
    });
    const excluded: CheckResult = await getCheck("secrets-scan").run(
      { cwd: dir },
      { exclude: ["tests/fixtures/**"] },
    );
    expect(excluded.status).toBe("pass");
    const included: CheckResult = await getCheck("secrets-scan").run({ cwd: dir }, {});
    expect(included.status).toBe("fail");
    expect(included.evidence.join("\n")).toContain("tests/fixtures/seed.js");
  });

  it("secrets-scan finds nothing in the gauge's own tracked files", async () => {
    // Regression test: the gauge once flagged a synthetic credential living in
    // its own tracked test fixture. Its own source must always scan clean.
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const hits = collectSecretHits(repoRoot, {
      paths: ["scripts/readiness-gauge", "tests/unit/readiness-gauge.test.ts"],
    });
    expect(hits?.size ?? 0).toBe(0);
  });

  it("env-config warns on undocumented vars, passes when documented", async () => {
    const dir = makeRepo({
      "server/app.ts": "const db = process.env.DATABASE_URL;\nconst k = process.env.MISSING_KEY;\n",
      ".env.example": "DATABASE_URL=\n",
    });
    const res: CheckResult = await getCheck("env-config").run({ cwd: dir }, {});
    expect(res.status).toBe("warn");
    expect(res.evidence.join("\n")).toContain("MISSING_KEY");
    writeFileSync(join(dir, ".env.example"), "DATABASE_URL=\nMISSING_KEY=\n");
    const res2: CheckResult = await getCheck("env-config").run({ cwd: dir }, {});
    expect(res2.status).toBe("pass");
  });

  it("env-config accepts commented declarations and only exact reviewed exclusions", async () => {
    const config = {
      maxUndocumented: 0,
      excludeVars: ["CLUSTER_WORKER_ID", "READINESS_ISOLATED_PG"],
    };
    const documented = makeRepo({
      "server/app.ts": [
        "const origin = process.env.PLATFORM_ORIGIN;",
        "const worker = process.env.CLUSTER_WORKER_ID;",
        "const isolated = process.env.READINESS_ISOLATED_PG;",
      ].join("\n"),
      ".env.example":
        "# Platform-provided; leave unset manually.\n# PLATFORM_ORIGIN=\n",
    });
    const passing = await getCheck("env-config").run(
      { cwd: documented },
      config,
    );
    expect(passing.status).toBe("pass");
    expect(passing.summary).toContain("2 reviewed internal/test variable(s) excluded");

    const nearMatch = makeRepo({
      "server/app.ts": [
        "const origin = process.env.PLATFORM_ORIGIN;",
        "const worker = process.env.CLUSTER_WORKER_ID;",
        "const isolated = process.env.READINESS_ISOLATED_PG;",
        "const other = process.env.READINESS_ISOLATED_PG_FALLBACK;",
      ].join("\n"),
      ".env.example":
        "# Platform-provided; leave unset manually.\n# PLATFORM_ORIGIN=\n",
    });
    const failing = await getCheck("env-config").run(
      { cwd: nearMatch },
      config,
    );
    expect(failing.status).toBe("fail");
    expect(failing.evidence).toContain("READINESS_ISOLATED_PG_FALLBACK");
    expect(failing.evidence).not.toContain("CLUSTER_WORKER_ID");
  });

  it.each(["generic", "media"])(
    "env-config passes for the current repository under the %s profile",
    async (profileName) => {
      const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
      const profile = loadProfile(resolveProfilesDir(), profileName);
      const envConfig = profile.checks["env-config"];
      if (!envConfig) throw new Error(`${profileName} profile lacks env-config`);
      const res = await getCheck("env-config").run(
        { cwd: repoRoot },
        envConfig.config ?? {},
      );
      expect(res.status).toBe("pass");
    },
  );

  it("health-endpoint and port-contract detect their signals", async () => {
    const dir = makeRepo({
      "server/index.ts": "app.get('/health', (req, res) => res.send('ok'));\napp.listen(process.env.PORT || 3000);\n",
    });
    expect((await getCheck("health-endpoint").run({ cwd: dir }, {})).status).toBe("pass");
    expect((await getCheck("port-contract").run({ cwd: dir }, {})).status).toBe("pass");
    const empty = makeRepo({ "server/index.ts": "console.log('no routes');\n" });
    expect((await getCheck("health-endpoint").run({ cwd: empty }, {})).status).toBe("fail");
    expect((await getCheck("port-contract").run({ cwd: empty }, {})).status).toBe("fail");
  });

  it("ci-config, migrations, and readme reflect repo contents", async () => {
    const dir = makeRepo({
      ".github/workflows/ci.yml": "name: ci\n",
      "drizzle.config.ts": "export default {};\n",
      "README.md": "# hi\n\n" + "x".repeat(600),
    });
    expect((await getCheck("ci-config").run({ cwd: dir }, {})).status).toBe("pass");
    expect((await getCheck("migrations").run({ cwd: dir }, {})).status).toBe("pass");
    expect((await getCheck("readme").run({ cwd: dir }, {})).status).toBe("pass");
    const bare = makeRepo({ "a.txt": "x\n" });
    expect((await getCheck("ci-config").run({ cwd: bare }, {})).status).toBe("warn");
    expect((await getCheck("migrations").run({ cwd: bare }, {})).status).toBe("warn");
    expect((await getCheck("readme").run({ cwd: bare }, {})).status).toBe("warn");
  });

  it("todo-scan applies warn/fail thresholds from config", async () => {
    const dir = makeRepo({ "server/a.ts": "// TODO one\n// FIXME two\n" });
    const warn = await getCheck("todo-scan").run({ cwd: dir }, { warnAt: 1, failAt: 10 });
    expect(warn.status).toBe("warn");
    const fail = await getCheck("todo-scan").run({ cwd: dir }, { warnAt: 1, failAt: 2 });
    expect(fail.status).toBe("fail");
    const pass = await getCheck("todo-scan").run({ cwd: dir }, { warnAt: 50, failAt: 200 });
    expect(pass.status).toBe("pass");
  });

  it("large-files fails over the budget", async () => {
    const dir = makeRepo({ "small.txt": "x\n" });
    writeFileSync(join(dir, "big.bin"), Buffer.alloc(2048));
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "big"], { cwd: dir });
    const res = await getCheck("large-files").run({ cwd: dir }, { maxBytes: 1024 });
    expect(res.status).toBe("fail");
    expect(res.evidence.join("\n")).toContain("big.bin");
  });

  it("node-version honors engines", async () => {
    const dir = makeRepo({ "package.json": JSON.stringify({ engines: { node: ">=18" } }) });
    const res = await getCheck("node-version").run({ cwd: dir }, {});
    expect(res.status).toBe("pass");
    const unpinned = makeRepo({ "package.json": JSON.stringify({}) });
    const res2 = await getCheck("node-version").run({ cwd: unpinned }, {});
    expect(res2.status).toBe("warn");
  });

  it("env-config captures full identifiers including mixed-case names", async () => {
    const dir = makeRepo({
      "server/app.ts": "const e = process.env.ADMIN_EMAIL || process.env.Admin_Email;\n",
      ".env.example": "ADMIN_EMAIL=\n",
    });
    const res: CheckResult = await getCheck("env-config").run({ cwd: dir }, {});
    expect(res.status).toBe("warn");
    // Full identifier, not a truncated "A".
    expect(res.evidence).toContain("Admin_Email");
    expect(res.evidence).not.toContain("A");
  });

  it("unit-tests check parses a real vitest run", async () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const dir = mkdtempSync(join(tmpdir(), "gauge-vt-"));
    dirs.push(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(
      join(dir, "tests", "s.test.ts"),
      'import { expect, it } from "vitest";\nit("ok", () => expect(1).toBe(1));\n',
    );
    // Reuse the repo's installed vitest binary.
    symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"));
    const res: CheckResult = await getCheck("unit-tests").run({ cwd: dir }, {});
    expect(res.status).toBe("pass");
    expect(res.summary).toMatch(/all tests pass/);
  }, 120_000);

  it("unit-tests reports FAIL (not BLOCKED) when the suite fails", async () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const dir = mkdtempSync(join(tmpdir(), "gauge-vt-"));
    dirs.push(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(
      join(dir, "tests", "s.test.ts"),
      'import { expect, it } from "vitest";\nit("ok", () => expect(1).toBe(1));\nit("bad", () => expect(1).toBe(2));\n',
    );
    symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"));
    const res: CheckResult = await getCheck("unit-tests").run({ cwd: dir }, {});
    // Vitest leads the summary with the failed count ("1 failed | 1 passed");
    // the check must parse that as FAIL, not give up and report BLOCKED.
    expect(res.status).toBe("fail");
    expect(res.summary).toMatch(/test failure/);
    expect(res.evidence.join("\n")).toContain("1 failed");
    // And the failing suite is named, so the report can say what to fix.
    expect(res.evidence.join("\n")).toContain("s.test.ts");
  }, 120_000);
});

describe("runChecks resilience", () => {
  it("a crashing check becomes blocked, not a crash", async () => {
    const boom: ResolvedCheck = {
      check: {
        id: "boom",
        name: "Boom",
        category: "test",
        description: "throws",
        timeoutMs: 1000,
        async run() {
          throw new Error("kaput");
        },
      },
      enabled: true,
      weight: 1,
      required: false,
      config: {},
    };
    const out = await runChecks({ cwd: "/tmp" }, [boom]);
    expect(out[0].status).toBe("blocked");
    expect(out[0].summary).toMatch(/kaput/);
  });

  it("skips disabled checks", async () => {
    const disabled: ResolvedCheck = {
      check: getCheck("readme"),
      enabled: false,
      weight: 1,
      required: false,
      config: {},
    };
    expect(await runChecks({ cwd: "/tmp" }, [disabled])).toEqual([]);
  });
});

describe("check catalog", () => {
  it("every check has a unique id and sane metadata", () => {
    const ids = ALL_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of ALL_CHECKS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.category.length).toBeGreaterThan(0);
      expect(c.timeoutMs).toBeGreaterThan(0);
    }
  });

  it("covers the core production dimensions", () => {
    const ids = ALL_CHECKS.map((c) => c.id);
    for (const must of ["secrets-scan", "typecheck", "unit-tests", "production-build", "health-endpoint"]) {
      expect(ids).toContain(must);
    }
  });
});
