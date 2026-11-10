---
name: repo-production-readiness-review
description: Evidence-led whole-repository production review and implementation workflow. Use when asked to audit, complete, harden, or certify an existing repository, investigate incomplete features, or turn a broad review into executed fixes. Inventory tracked files by type, trace real user workflows and dependencies, use local Git/GitHub evidence, then provide or execute bounded remediation steps without inventing success.
---

# Whole-Repository Production Readiness Review

## Purpose

Review the existing product as a connected system, not as a set of isolated
pages or a passing test command. Find missing behavior and defects from the
repository's actual contracts, code paths, history, configuration, and
observable evidence. When implementation is requested, turn verified findings
into concrete steps and execute them in scope.

This skill is an engineering workflow, not a guarantee that every possible bug
has been found or that absolute production readiness can be proven.

## When to Use

- The user asks for a whole-repository, full-platform, production-readiness, or
  completeness audit.
- The user asks to find missing, unfinished, broken, inaccessible, unsafe, or
  untested functionality across a product.
- The user asks to implement fixes identified by such an audit.
- The user requests an evidence-based review of a broad feature or release gate.

Do not use this workflow to expand a narrow fix into an unrelated refactor.

## Operating Rules

1. **Orient before editing.** Read project instructions and relevant memory,
   identify the current branch/HEAD and working-tree state, inspect configured
   workflows, and locate the current implementation before relying on older
   reports or remote repository snapshots.
2. **Preserve work.** Do not overwrite, reset, clean, or rebase unrelated
   changes. Do not run destructive build, migration, cleanup, recovery, or
   publishing operations in the live checkout unless specifically authorized
   and proven safe. Use isolated copies or fixtures for destructive validation.
3. **Prove the path.** Trace each claimed feature from its visible entry point
   through authorization, validation, backend/service, durable state or
   provider, response, and user-visible result. A route, component, schema,
   test name, comment, or HTTP liveness response alone is not proof of a
   complete workflow.
4. **Use real evidence.** Distinguish current observations from historical
   reports, deterministic fixtures from live services, and local checks from
   production checks. Never describe skipped, mocked, timed-out, or inaccessible
   checks as passed.
5. **Keep boundaries intact.** Do not weaken authentication, authorization,
   CSRF, data ownership, payment/provider consent, safety, readiness, integrity,
   license, or security gates to turn a check green. Do not expose secrets or
   include credentials in reports.
6. **Respect execution limits.** Never claim an exhaustive proof of zero defects
   or 100% production readiness from static inspection or finite tests. If a
   required external system, credential, data set, hardware capability, or
   platform action is unavailable, mark the affected criterion BLOCKED or
   UNVERIFIED and continue independent work.
7. **Separate review from action.** If the user asks only for inspection, do not
   modify files. If the user asks for implementation, proceed with verified,
   in-scope fixes without pausing for routine approvals. Ask before irreversible
   data changes, live charges, customer/provider communication, production
   changes, or other actions requiring separate consent.

## Phase A — Establish the Current Baseline

1. Read `replit.md`, relevant project instructions, and linked project memory.
2. Record branch, commit, tracked/untracked changes, active workflows, and any
   supplied failure logs. Protect existing staged and unstaged changes.
3. Read the configured build/start/deployment commands and actual package,
   dependency, runtime, and database configuration. Do not assume a command
   based on framework conventions.
4. Check recent local Git history for relevant changes and regressions:
   inspect changed paths, commit messages, and diffs. Inspect remote branches or
   GitHub pull-request evidence only when available and authorized. State when
   remote history or logs cannot be verified; never infer a merge or push.
5. Identify the product's declared users, roles, entitlements, release target,
   existing completion ledgers, and user-visible journeys from current source.

## Phase B — Inventory the Entire Repository

Build a file inventory from Git-tracked files (`git ls-files`) and classify
files by their actual extension, format, role, and lifecycle. Include hidden
files and vendored/submodule boundaries; explicitly identify generated,
ignored, binary, or external content that is outside the chosen inspection
scope instead of silently omitting it.

For each file class, search for relevant contracts and failure indicators.
Typical classes include:

- Application source: frontend, backend, shared packages, scripts, workers,
  services, APIs, UI routes, state, and domain logic.
- Data contracts: schemas, migrations, seed definitions, fixtures, generated
  types, event formats, serialization, and versioned manifests.
- Configuration: package manifests and locks, TypeScript/build configs,
  environment templates, Replit/workflow settings, deployment files, CI,
  container, Nix, and infrastructure definitions.
- Tests and evidence: unit, integration, browser/E2E, security, performance,
  coverage, acceptance ledgers, reports, and test runners.
- Runtime assets: images, fonts, audio, video, models, checkpoints, archives,
  static assets, native binaries, licenses, notices, and checksums.
- Documentation and operational files: README/docs, runbooks, backup/recovery,
  monitoring, alerts, support/admin procedures, and release instructions.

Use efficient, bounded searches (for example `git ls-files`, `rg`, manifest
parsing, and targeted reads). Search for TODO/FIXME/placeholder/mock/stub,
disabled or unmounted UI, unreferenced routes, no-op handlers, swallowed errors,
unwired controls, unsafe defaults, weak authorization, stale config, silent
fallbacks, dead branches, and orphaned data structures. These are leads, not
automatic defects: inspect surrounding code and intended contracts before
classifying them.

For each discovered module or file group, establish:

- Its owner/purpose and real callers.
- Its inputs, outputs, state, dependencies, and failure modes.
- Its security/permission and tenant/ownership boundaries.
- Its user-visible entry points and downstream consumers.
- Its tests and actual latest evidence.
- Whether it is source, generated output, vendored code, or runtime data.

Avoid dumping huge generated, binary, vendor, coverage, or lock files into
context. Summarize them through metadata, bounded parsing, hashes, manifests,
or focused searches and record exclusions.

## Phase C — Build User-Journey and System Maps

Derive journeys from current navigation, APIs, product requirements, and
configured roles. Include public/onboarding, ordinary accounts, administrator
superset, and every other supported role. Include cross-module journeys where
one resource is expected to be consumed by another module.

For each journey trace:

1. Discoverability and navigation.
2. Authentication/session/MFA and authorization at the server boundary.
3. Input validation, CSRF, rate/resource limits, and error display.
4. Ownership, tenant isolation, entitlement, and durable persistence.
5. Background work, retries, idempotency, progress, and truthful completion.
6. Provider or AI calls, consent, credentials, and real/sandbox status.
7. Reload, restart, backup, restore, deletion/revocation, and rollback behavior.
8. Accessibility, responsive behavior, and usable loading/empty/error states.
9. Observability sufficient to diagnose failures without leaking private data.

For external services, inspect the actual adapter, scopes, credential names
without values, status handling, timeouts, retries, and permitted access.
Separate connected/live, sandbox, mocked, disabled, restricted, and unconfigured
states. Never contact a live provider, send content, charge money, or mutate
production data as part of verification without explicit authorization.

## Phase D — Evidence-Based Findings

Assign every criterion one status:

- **PASS** — fresh, reproducible evidence proves the stated behavior on the
  current revision and relevant execution path.
- **FAIL** — current evidence demonstrates incorrect or incomplete behavior.
- **BLOCKED** — the check cannot run because a named prerequisite is unavailable
  or an approved action is required.
- **UNVERIFIED** — evidence is insufficient, stale, fixture-only, or does not
  cover the relevant path.
- **NOT APPLICABLE** — supported by current code/product scope, with the reason.

Each finding must include:

- Stable ID and severity/priority.
- User impact and affected role/journey.
- Exact current evidence: file/function/route/config/commit/log/test and
  timestamp or command/result when available.
- Root cause, not just the visible symptom.
- Missing behavior or failed contract.
- Related dependencies and downstream consumers.
- Whether the evidence is static, fixture, isolated integration, live sandbox,
  or production.
- Minimal safe remediation and explicit acceptance evidence.

Do not claim a percentage of completeness unless its denominator is a defined,
enumerated set of criteria and every criterion has a current status. Never
convert unknowns into a score of zero blockers.

## Phase E — Actionable Remediation Plan

When implementation is requested, order fixes by dependency and risk. For every
task specify:

- Owner role (implementation responsibility) and independent reviewer/check.
- Preconditions and affected file/module paths.
- Ordered implementation steps with expected behavior.
- Data migration, compatibility, rollback, and failure-recovery plan when
  applicable.
- Security and permission requirements that must remain true.
- Tests to add or update, including negative and regression cases.
- Exact acceptance commands or observable outcomes.
- Evidence required to mark the task complete.
- Failure follow-up and stop condition.

Prefer the smallest coherent fix that reaches every real entry point. Do not
create plans instead of doing explicitly requested implementation.

## Phase F — Execute and Verify

For an implementation request:

1. Follow the workspace's exact-instruction-execution procedure for the
   user's requested steps, within system, safety, authorization, and project
   constraints. Preserve order where specified; do not reinterpret requirements
   to manufacture success.
2. Implement a coherent set of related fixes, then run focused checks followed
   by proportionate regression checks. After every code change, perform the
   project's required review process and report any review capability that is
   unavailable; never claim an independent review that did not occur.
3. Verify actual HTTP/API and browser behavior where relevant. Use real
   disposable or isolated data for persistent flows. For protected routes,
   verify both allowed and denied roles without bypassing authentication.
4. Verify generated assets by decoding/playing/reading them and checking
   ownership/retrieval, not merely by accepting a success status.
5. For startup/restart/recovery, observe the configured workflow, logs, health
   and readiness, and persisted identifiers/checksums across the required
   cycles. Do not weaken readiness.
6. For build/deployment, test the actual configured entry point in an isolated
   copy when the build mutates or removes inputs. A fixture or syntax check is
   not a representative full build. Do not publish unless separately requested
   and all authorized release gates pass.
7. Re-run affected tests after every fix. Stop when the next action requires
   unavailable authority, unsafe production mutation, or an external service
   that cannot be reached; mark that dependency precisely.

## Required Deliverable

Return a concise but complete whole-product report in this format:

1. **Scope and revision** — current branch/commit, working-tree status, files
   and generated/external areas excluded.
2. **Judgment** — verified readiness is not claimed unless every in-scope
   acceptance criterion is PASS with current evidence.
3. **Journey matrix** — role/journey, status, evidence, blockers.
4. **Findings and root causes** — prioritized, linked to concrete paths and
   behavior.
5. **Changes made** — exact files and behavioral changes; distinguish code from
   configuration/data changes.
6. **Verification** — command, timestamp, pass/fail/skip counts, runtime scope,
   fixture/live distinction, and independent review status.
7. **Remaining blockers** — owner action, external dependency, or missing
   evidence; state whether each blocks private-admin or public release.
8. **Release state** — actual published/deployment state only when verified
   through the appropriate deployment source. Never infer from local build
   success.

Do not report “100%,” “production ready,” “all tests passed,” “live,” or
“deployed” unless the exact defined acceptance set and evidence support that
claim. A finite review cannot establish that nothing can ever fail.

## SIGTERM and Other External Interruptions

Treat SIGTERM as a request to stop, not as proof of its cause. Determine whether
the signal came from a child task, the executive, a user cancel, a supervisor,
or an external platform only when logs or platform evidence establish that
origin. Do not ignore or mask SIGTERM, retry cancellation blindly, or claim a
code change can prevent an external supervisor from terminating a process.
Preserve validated outputs atomically, report task-level checkpoints, clean up
only owned processes, and distinguish a safe interrupted build from a completed
build. If the source is unknown, say so and identify the evidence needed to
resolve it.
