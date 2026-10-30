/**
 * readiness-gauge — report renderers (Markdown and JSON).
 */
import type { CheckStatus, GaugeReport, ScoredCheck, Verdict } from "./types.js";

const STATUS_ICON: Record<CheckStatus, string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  blocked: "🚫",
};

const VERDICT_LINE: Record<Verdict, string> = {
  GO: "## Verdict: GO — cleared for production",
  "CONDITIONAL GO": "## Verdict: CONDITIONAL GO — ship with the conditions below",
  "NO GO": "## Verdict: NO GO — do not ship",
};

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function checkSection(s: ScoredCheck): string {
  const lines: string[] = [];
  const req = s.required ? " · **required**" : "";
  const pts = s.points === null ? "excluded" : `${s.points}/100`;
  lines.push(
    `### ${STATUS_ICON[s.status]} ${s.name} \`${s.id}\``,
    ``,
    `- Status: **${s.status.toUpperCase()}** · Weight: ${s.weight}${req} · Score: ${pts} · ${fmtDuration(s.durationMs)}`,
    `- Category: ${s.category}`,
    `- ${s.summary}`,
  );
  if (s.evidence.length > 0) {
    lines.push(``, `<details>`, `<summary>Evidence</summary>`, ``);
    for (const e of s.evidence.slice(0, 15)) lines.push(`- \`${e}\``);
    lines.push(``, `</details>`);
  }
  if (s.remediation) lines.push(``, `> Remediation: ${s.remediation}`);
  return lines.join("\n");
}

/* ── "why it failed — and the steps to pass" ─────────────────────────────
 * Turns each non-passing check's summary + evidence into concrete,
 * step-by-step fix instructions. Evidence-aware where the check's output is
 * parseable (type errors, failing suites, oversized files); otherwise it
 * falls back to the check's own remediation line.
 */
function fixSteps(s: ScoredCheck, profileName: string): string[] {
  const steps: string[] = [];
  switch (s.id) {
    case "secrets-scan": {
      steps.push(
        "Remove each secret listed above from its file (the scan redacts values, but the file paths are exact).",
        "Rotate or revoke every exposed credential at its provider — deleting it from the repo does not remove it from git history.",
        "Read the value from an environment variable or a secret manager instead, and document the variable name (not the value) in `.env.example`.",
      );
      break;
    }
    case "typecheck": {
      const errRe = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
      let parsed = 0;
      for (const e of s.evidence) {
        const m = errRe.exec(e);
        if (!m) continue;
        parsed++;
        const [, file, line, , code, msg] = m;
        if (code === "TS6133" || code === "TS6138") {
          const name = /'([^']+)'/.exec(msg)?.[1] ?? "the declaration";
          steps.push(
            `In \`${file}\` (line ${line}): \`${name}\` is declared but never read — remove it, use it, or rename it to \`_${name}\` if it must stay.`,
          );
        } else {
          steps.push(`Fix \`${code}\` in \`${file}\` (line ${line}): ${msg}`);
        }
      }
      if (parsed === 0) {
        steps.push(
          "Run the project's typecheck script, fix each reported error, and repeat until it exits clean.",
        );
      }
      break;
    }
    case "unit-tests": {
      steps.push(
        "Run the suite locally and watch it fail: `./node_modules/.bin/vitest run`.",
      );
      for (const f of s.evidence
        .filter((e) => e.startsWith("failing: "))
        .slice(0, 10)) {
        steps.push(
          `Fix the failing suite \`${f.slice("failing: ".length)}\` — fix the code under test, or the test if the test itself is wrong.`,
        );
      }
      steps.push(
        "Rerun `./node_modules/.bin/vitest run` until the summary shows 0 failed.",
      );
      break;
    }
    case "lint": {
      steps.push(
        "Run `npm run lint:fix` — it auto-fixes every fixable problem.",
      );
      if (s.evidence.length > 0) {
        steps.push(
          "Fix what remains by hand — each line above is one problem, and the rule id at the end of the line says what it wants.",
        );
      }
      break;
    }
    case "large-files": {
      for (const e of s.evidence.slice(0, 10)) {
        const file = e.replace(/\s*\([\d.]+ MB\)\s*$/, "");
        steps.push(
          `Move \`${file}\` out of the repo (object storage or a CDN) or track it with Git LFS.`,
        );
      }
      steps.push(
        "If these assets legitimately ship with the repo, raise `maxBytes` for `large-files` in the profile instead.",
      );
      break;
    }
    case "env-config": {
      steps.push(
        "Add every undocumented variable name listed above to `.env.example` with a placeholder value (never a real secret).",
        "For variables that are internal or test-only, add the exact name to `excludeVars` under `env-config` in the profile instead of documenting them.",
      );
      break;
    }
    case "readme": {
      steps.push(
        "Create `README.md` at the repository root covering what the project is, how to install and run it, and how it deploys.",
      );
      break;
    }
    case "health-endpoint": {
      steps.push(
        "Add a lightweight `GET /health` route that returns HTTP 200 without authentication or external calls, registered before auth middleware.",
      );
      break;
    }
    case "port-contract": {
      steps.push(
        "Listen on `process.env.PORT` (with a local default) bound to `0.0.0.0`; never hardcode the port.",
      );
      break;
    }
    case "node-version": {
      steps.push(
        "Pin the runtime this repo is verified on: set `engines.node` in `package.json` (and the Docker/start script) to a range the current environment satisfies.",
      );
      break;
    }
    case "migrations": {
      steps.push(
        "Add migration tooling (e.g. `drizzle.config.ts` plus a `migrations/` directory) and commit the initial migration.",
      );
      break;
    }
    case "ci-config": {
      steps.push(
        "Add a CI workflow (e.g. `.github/workflows/ci.yml`) that installs dependencies and runs typecheck, lint, and the test suite on every push.",
      );
      break;
    }
    case "dependency-audit": {
      steps.push(
        "Run `npm audit` to see the advisories, then `npm audit fix` for the ones it can patch safely.",
        "Update or replace any package with a remaining critical/high advisory, then check `npm audit` again.",
      );
      break;
    }
    case "production-build": {
      steps.push(
        "Run `npm run build` locally, fix the first error it prints, and repeat until the build completes and emits the server bundle.",
      );
      break;
    }
    case "todo-scan": {
      steps.push(
        "Resolve the TODO/FIXME markers or convert them into tracked issues until the count is under the failure threshold.",
      );
      break;
    }
    default: {
      if (s.remediation) steps.push(s.remediation);
    }
  }
  steps.push(
    `Verify with just this check: \`npm run readiness-gauge -- --profile ${profileName} --only ${s.id}\`.`,
  );
  return steps;
}

function fixGuideSection(report: GaugeReport): string[] {
  const bad = report.checks.filter((c) => c.status !== "pass");
  const lines = [`## Why it failed — and the steps to pass`, ``];
  if (bad.length === 0) {
    lines.push(`Nothing to fix — every check passed.`, ``);
    return lines;
  }
  for (const s of bad) {
    const req = s.required ? " · **required**" : "";
    lines.push(
      `### ${STATUS_ICON[s.status]} ${s.name} \`${s.id}\`${req}`,
      ``,
      `**Why:** ${s.summary}`,
    );
    if (s.evidence.length > 0) {
      lines.push(``);
      for (const e of s.evidence.slice(0, 15)) lines.push(`- \`${e}\``);
    }
    lines.push(
      ``,
      s.status === "blocked" ? `**Steps to unblock:**` : `**Steps to pass:**`,
      ``,
    );
    fixSteps(s, report.profile.name).forEach((step, i) =>
      lines.push(`${i + 1}. ${step}`),
    );
    lines.push(``);
  }
  lines.push(
    `When every item above is done, rerun the full gauge: \`npm run readiness-gauge -- --profile ${report.profile.name}\`.`,
    ``,
  );
  return lines;
}

export function renderMarkdown(report: GaugeReport): string {
  const lines: string[] = [];
  const scoreLine =
    report.score === null ? "n/a (no checks scored)" : `${report.score}/100`;
  lines.push(
    `# Production Readiness Gauge`,
    ``,
    `- Profile: **${report.profile.displayName}** (\`${report.profile.name}\` v${report.profile.version})`,
    `- Generated: ${report.generatedAt}`,
    `- Repository: \`${report.cwd}\``,
    `- **Score: ${scoreLine}**`,
    ``,
    VERDICT_LINE[report.verdict],
    ``,
    `Thresholds: GO ≥ ${report.thresholds.go} · CONDITIONAL GO ≥ ${report.thresholds.conditionalGo}`,
    ``,
    `### Why this verdict`,
    ``,
  );
  for (const r of report.verdictReasons) lines.push(`- ${r}`);
  lines.push(``, ...fixGuideSection(report), `### Score by category`, ``);
  lines.push(`| Category | Checks | Score |`);
  lines.push(`| --- | ---: | ---: |`);
  for (const c of report.categories) {
    lines.push(`| ${c.category} | ${c.checks} | ${c.score === null ? "n/a" : c.score} |`);
  }
  lines.push(``, `### Checks`, ``);
  for (const s of report.checks) {
    lines.push(checkSection(s), ``);
  }
  lines.push(
    `---`,
    ``,
    `Tune this gauge: copy \`scripts/readiness-gauge/profiles/${report.profile.name}.json\`, adjust weights / required flags / thresholds, and rerun with \`--profile-file <path>\`. See \`scripts/readiness-gauge/READINESS_GAUGE.md\`.`,
    ``,
    `_Generated by readiness-gauge v${report.toolVersion}._`,
  );
  return lines.join("\n") + "\n";
}

export function renderJson(report: GaugeReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}
