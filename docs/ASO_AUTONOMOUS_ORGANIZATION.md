# Max Booster — Autonomous Software Organization controllers

Status: **engineering foundation; NOT a production release approval**.

The controllers target **the entire checked-out Git repository**. Every tracked
file is inventoried from the Git index — frontend, backend, shared modules,
external MaxCore/PDIM, databases, AI/ML, DAW, tests, infrastructure, deployment
scripts, media/assets, admin code, documentation and all unexpected paths.
Inventory is not proof of per-file functional test coverage. Untracked/ignored
content is outside the reproducible Git revision and never silently treated as
verified. Absent tracked files and submodules without separate verification
block the readiness decision.

## Entrypoints

- Verifier: node scripts/aso/master-verify.mjs --mode inventory
- Quick check: node scripts/aso/master-verify.mjs --mode quick
- Exhaustive check: node scripts/aso/master-verify.mjs --mode full
- Repair counterpart: node scripts/aso/master-repair.mjs --strategy verified-handlers --auto-commit
- Supervisor: node scripts/aso/supervisor.mjs --auto-repair --auto-commit --max-cycles 3
- Regression tests: node --test tests/aso-controllers.test.mjs

Use a clean, purpose-made aso/ branch when enabling repairs. The scripts require
Node >=22.12, npm, Git, Python and the existing repository test dependencies.
They do not modify the canonical npm build/start or Replit build.sh/start.sh
entrypoints. They never deploy, push, merge, migrate live databases, charge
customers, post content, or modify external services.

## Safe autonomous loops

The supervisor is the *only* loop coordinator; the verifier never directly
runs arbitrary edits, and the repairer never deploys. Every cycle starts with
a current-revision quick check. Supported mechanical errors trigger a selected
repair strategy, a mandatory repeat of quick verification, and an optional
commit to the isolated branch. A new revision triggers the next cycle.
A quick pass invokes the full exhaustive gate; anything unverified remains
NO-GO. A block that requires architectural/security/product engineering is
reported as requiring review, not guessed away.

Use --max-cycles 0 --budget-minutes 0 only when explicitly opting into an
unbounded session. The default is 3 cycles/240 minutes; repeated identical
failures trip --max-no-progress 2. No automatic background service is created.
Run under a separate OS supervisor if persistence across restarts is desired.
Keep independent cost/time ceilings for any future LLM agent runner.

Adaptive policy is kept in reports/aso/policy.json. Lint-only errors select
the cheaper ESLint fixer; typecheck issues use existing position-verified
deployment-autofix handlers. Failed strategies, recurring blockers and accepted
fixes are recorded to avoid repeating ineffective work. Scripts do **not**
rewrite their own security controls, lower pass thresholds, or change tests to
manufacture success.

The repair controller rejects dirty branches, unknown revisions, missing
baseline evidence, protected-path edits, regressions and unsupported fixes.
It restores tracked files after a failed attempt. Changes to payment, auth,
secrets, migrations, tests, workflows, ASO code or release policy require a
separate reviewed engineering change. Commit and promotion are independent;
nothing is pushed/merged automatically.

## Whole-repository evidence

Inventory mode writes reports/aso/inventory.json with **all tracked Git index
entries**, modes, blob SHAs and area groups.

Quick mode independently runs server and client typechecks, repository lint,
production security audit, and existing runtime contract tests.

Full mode runs the repo's exhaustive scripts/testing/run-all.py harness with
fresh output under reports/aso/full-test-verification, separate typechecks,
lint, dependency security audit, real npm build, media readiness gauge in
strict release mode, and strict 80-page launch acceptance bound to that same
fresh evidence. Any missing/failed/skipped/stale required evidence blocks the
release. The output directory is intentionally Git-ignored. Logs are locally
capped at 4 MiB per step; treat logs as sensitive, because third-party tools
can inadvertently emit credentials.

The full suite may require significant machine resources and isolated
PostgreSQL/Python/toolchain fixtures. No production database, real Stripe,
social distribution, or content publish operation is authorized by a test
command. Large-scale load/soak, model quality, authenticated external provider
operations and real production observability require independent receipts.

## Production approval evidence

The local verifier must pass every gate **and** read an operator-managed
release-evidence JSON file stored outside the repository, supplied via
--release-evidence /secure/path/release-evidence.json. It must have the exact
commit SHA, a releaseId, an approvedBy principal, a recent approvedAt timestamp
and individually reviewed check entries. Required check keys:

1. authentication
2. tenant-isolation
3. billing
4. music-distribution
5. ai-model-quality
6. data-integrity
7. backup-restore
8. load-and-soak
9. deployment-startup
10. monitoring-alerts
11. accessibility
12. owner-release-approval

Each check entry requires status = pass and a non-empty receipt reference.
The parser verifies structure, matching revision and timestamp, **not**
cryptographic provenance or truth of external claims. The operator must verify
the evidence out of band. The resulting
LOCALLY_GATED_WITH_OPERATOR_EVIDENCE status is **not** a deployment result,
third-party certification, SOC 2 report, or guarantee of a flawless product.

## Future agent organization

The twelve requested enterprise layers require an actual multi-agent model
runner, durable work queues, role-based task contracts, sandboxes, scoped
permissions, review UIs, cost accounting, monitoring and rollback operations.
The current PR supplies **only the repository-wide verification, safe
mechanical repair, and coordination kernel**. It does not yet create functional
architect/design/AI-business agents or autonomous code generation for every
failure. Model-invented fixes, uncontrolled recursive coding and fail-open
release promotion are expressly excluded.

All product domains — artist/fan/project management, DAW, distribution,
marketing, analytics, AI, collaboration, marketplace, subscriptions and
administration — remain in scope for the exhaustive platform register.
No feature is labeled operational from static presence alone.

Desktop/mobile **files remain included in the Git inventory**. Per the
existing owner instruction, their separate multi-application packaging CI
workflows are not web/API production-readiness gates. That choice does not
verify the native builds or remove them from the engineering review scope.

The connected Replit project should import the reviewed ASO branch through
its existing Git integration only after its precise repository mapping is
confirmed. Existing Replit application work must not be overwritten blindly.
