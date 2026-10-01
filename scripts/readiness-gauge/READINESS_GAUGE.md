# readiness-gauge — Universal Production Readiness Gauge

A tunable, industry-aware readiness gauge for any codebase. It runs a library of
real checks (not questionnaires), weights them per industry, and renders a
`GO / CONDITIONAL GO / NO GO` verdict with evidence.

## Quick start

```bash
# Balanced baseline
npm run readiness-gauge -- --profile generic

# Tuned for a regulated industry
npm run readiness-gauge -- --profile fintech --format json --out gauge.json

# Only the fast static checks
npm run readiness-gauge -- --profile saas --only secrets-scan,env-config,health-endpoint,port-contract,ci-config,readme

# Your own industry tuning
npm run readiness-gauge -- --profile-file ./acme-profile.json --out gauge.md
```

Exit code is `1` on `NO GO`, `0` otherwise.

## Check catalog

| ID | Category | What it does |
| --- | --- | --- |
| `secrets-scan` | security | `git grep` for API keys, tokens, private keys in tracked files |
| `dependency-audit` | security | `npm audit`; thresholds for high/critical |
| `typecheck` | correctness | `tsc --noEmit` on server + client projects |
| `unit-tests` | correctness | Full `vitest run`, parses pass/fail counts |
| `lint` | maintainability | ESLint over `server`, `client`, `shared` |
| `todo-scan` | maintainability | Counts TODO/FIXME markers; warn/fail thresholds |
| `production-build` | deployability | Runs the production build script end-to-end |
| `large-files` | deployability | Fails on tracked files over the size budget |
| `env-config` | operations | Every `process.env.NAME` in server code documented in `.env.example`; explicit commented declarations are accepted for platform-managed names |
| `health-endpoint` | operations | A `/health` route exists for orchestrator probes |
| `port-contract` | operations | Server honors `process.env.PORT` |
| `node-version` | operations | Running Node satisfies `engines.node` |
| `migrations` | data | A migration framework/directory is present |
| `ci-config` | process | A CI pipeline definition exists |
| `readme` | process | A substantive README exists |

Run `npm run readiness-gauge -- --list-checks` for the live catalog.

## Tuning for an industry

Profiles live in `scripts/readiness-gauge/profiles/*.json`. Copy one and edit:

```jsonc
{
  "name": "my-industry",
  "displayName": "My Industry",
  "description": "Why this tuning exists.",
  "version": "1.0.0",
  "thresholds": { "go": 90, "conditionalGo": 70 },
  "checks": {
    "secrets-scan":   { "weight": 5, "required": true },
    "dependency-audit": { "weight": 4, "required": true,
                          "config": { "maxHigh": 0, "maxCritical": 0 } },
    "todo-scan":      { "weight": 1, "config": { "warnAt": 30, "failAt": 120 } },
    "large-files":    { "weight": 2, "config": { "maxBytes": 15728640 } },
    "production-build": { "enabled": false }
  },
  "notes": ["Anything a human reviewer should know."]
}
```

Field reference:

- `weight` (1–5): influence on the 0–100 score. Checks not listed default to weight 1.
- `required`: a **failed** required check forces `NO GO`; a **blocked** one caps the
  verdict at `CONDITIONAL GO` (it means "couldn't verify", not "passed").
- `enabled: false`: skip the check entirely (e.g. `production-build` in a docs repo).
- `config`: per-check knobs. Supported keys:
  - `secrets-scan`: `exclude` — git pathspec globs to skip (e.g. `["tests/fixtures/**"]`
    for repos whose own test fixtures contain synthetic secrets)
  - `dependency-audit`: `maxHigh`, `maxCritical`
  - `todo-scan`: `warnAt`, `failAt`
  - `large-files`: `maxBytes`
  - `env-config`: `maxUndocumented`, `excludeVars` (exact variable names only; use sparingly for OS/runtime metadata or test-only controls)
- `thresholds.go` / `thresholds.conditionalGo`: score cutoffs.

For `env-config`, a line such as `# REPLIT_DEPLOYMENT=` documents a platform-managed
variable without suggesting that a developer should set it locally. The shipped
Generic and Media profiles exclude only `CLUSTER_WORKER_ID`, `NODE_OPTIONS`,
`PATH`, `npm_package_version`, `READINESS_EGRESS_GUARD`, and
`READINESS_ISOLATED_PG`: the first four are launcher/OS/Node metadata, and the
last two are guarded switches for the isolated readiness acceptance runner.
Keep those exclusions aligned with the code and tests; do not use broad prefixes.

Shipped profiles:

| Profile | Tuned for |
| --- | --- |
| `generic` | Balanced baseline for any service |
| `fintech` | Money movement: zero-tolerance security posture |
| `healthcare` | PHI-adjacent systems: config discipline + auditability |
| `ecommerce` | Storefronts: uptime signals, migrations, deployability |
| `saas` | Multi-tenant services: engineering process + safe deploys |
| `media` | Creator/media platforms: build integrity, asset discipline |

## Scoring and verdicts

Score = weighted mean over non-blocked checks (`pass`=100, `warn`=60, `fail`=0).
Blocked checks (couldn't run — e.g. no network for `npm audit`) are excluded from
the score and listed in the verdict reasons, so a gauge can never silently pass
on something it couldn't verify.

Verdict rules, in order:

1. Any **required** check failed → `NO GO`
2. Any **required** check blocked → verdict capped at `CONDITIONAL GO`
3. score ≥ `thresholds.go` → `GO`
4. score ≥ `thresholds.conditionalGo` → `CONDITIONAL GO`
5. otherwise → `NO GO`

## Honest limits

- Static checks prove the code *has* a health endpoint, not that it *answers*.
- `unit-tests` and `production-build` are the slow checks (minutes); use `--only`
  / `--skip` for a fast pass.
- `production-build` refreshes `dist/` artifacts as a side effect.
- Checks never touch production services, deploy APIs, or production data.
