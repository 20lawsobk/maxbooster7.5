# Max Booster: admin-first autonomous senior engineering team

**Release goal:** the real administrator can use **every Max Booster feature**
end to end with durable real results. Public signups and mass-user readiness
may wait; admin security, data integrity and true external effects cannot.

This is an ENGINEERING IMPLEMENTATION with automated source inventory,
task planning, triage, mechanical fixes, optional model-assisted code proposals,
validation and a stop-on-unproven-evidence policy. The controllers do not yet
constitute a hosted digital corporation, guarantee resolution of any error,
or establish that the deployed app is production-ready.

## Job assignments for the entire repository

The source of truth is scripts/aso/team-catalog.mjs. Its 21 role specifications
each contain five exact responsibilities and an acceptance criterion:

- Senior Product Director: administrator use cases, requirements, states,
  true outcomes and priority.
- Senior Engineering Manager: per-file decomposition, dependencies,
  resource scheduling, conflicts, escalation and sign-off.
- Principal Systems Architect: architecture graph, ownership boundaries,
  data/API contracts, risk and root-cause design.
- Senior UX/Product Designer: all admin journeys, accessibility, mobile
  usability, error UX and workflow friction.
- Senior Frontend Engineer: pages, components, state, API consumption,
  responsive UI and browser tests.
- Senior Backend/API Engineer: auth, routes, validation, services,
  idempotency, API errors, workers and contract tests.
- Senior Database/Reliability Engineer: schema, constraints, migrations,
  locks, persistence and recovery drills.
- Senior Application Security Engineer: authorization, MFA, session,
  CSRF, injection, secret redaction and negative tests.
- Senior Test Automation Engineer: deterministic unit, integration,
  browser, end-to-end and current-commit coverage evidence.
- Senior Failure & Bug Hunter: malformed/oversized/racing inputs,
  fault injection, minimal reproductions and fix counterexamples.
- Senior Performance/Capacity Engineer: measurements, budgeted tuning,
  one-admin performance, pressure limits and regressions.
- Senior SRE/DevOps Engineer: reproducible install, build/start,
  dependency health, backup/restore, shutdown and rollback.
- Senior Observability/Incident Engineer: tracing, alerts, telemetry,
  incident simulations and reliable error visibility.
- Senior AI/ML Systems Engineer: Sophia, checkpoints, real model quality,
  MaxCore, prompt safety, serving and error recovery.
- Senior Audio/DAW Engineer: studio actions, actual tracks and audio,
  plugins, rendering, stems, exports and state restoration.
- Senior Integration/Distribution Engineer: consent, DSP/social/email
  integrations, providers, webhooks, real receipts and retries.
- Senior Billing/Revenue Engineer: real prices, subscriptions, refunds,
  disputes, royalties, marketplace payments and exact reconciliation.
- Senior Accessibility Engineer: keyboard, screen reader, contrast,
  zoom, responsive controls and assistive-tech acceptance.
- Senior Release/Change Manager: exact-commit evidence, independent
  reviews, security approvals and deployment runbook.
- Senior Documentation/Developer Experience Engineer: accurate
  configuration, API docs, environment instructions and operations.
- Senior Privacy/Governance Engineer: rights, media licensing,
  consent, privacy, retention and authorization boundaries.

These are actionable role/task contracts, not claims that 21 independently
running AI models have already executed them. Each task has an accountable
role, explicit expected output and independent review obligation.

## Ten exact tasks for EACH tracked file

The team-plan command inventories the full Git index and writes tasks to
reports/aso/team-tasks.ndjson. It never narrows scope to only the web app,
specific pages or known file extensions.

1. Discover real implementation, ownership, call sites and dependencies.
2. Specify success, errors, authorization and persistence contracts.
3. Reproduce current baseline and identify missing proofs.
4. Locate root cause, affected consumers and blast radius.
5. Implement minimal reversible engineering improvement.
6. Prove malformed-input, unauthorized, time-out and concurrency behavior.
7. Run targeted and cross-system tests and repeat all affected gates.
8. Conduct independent specialist review of changed behavior.
9. Demonstrate the real administrator workflow end to end.
10. Handoff exact source-bound receipts, monitoring, rollback and blockers.

Each tracked file is assigned those ten dependent tasks plus independent
reviewer tasks. The manifest includes exact Git blob identities, owners,
priorities, expected evidence and role procedures, without duplicating large
checklists inside every per-file task. It records any missing tracked files
or unsupported submodules as blockers rather than deleting them from scope.

## Administrator-only acceptance matrix

The team must independently prove each of the following:
admin access and recovery; artist management; fan management; projects;
DAW and actual media rendering/export; content distribution; marketing;
revenue, accounting, refunds and royalties; qualified Sophia/MaxCore outputs;
collaboration controls; marketplace listing and fulfillment; subscriptions;
administrative controls; and operational backup/startup/incident recovery.

All fourteen journeys are separate UNVERIFIED task graphs in
reports/aso/admin-journeys.json until real current-commit evidence exists.
A page render or an HTTP 200 does not satisfy a workflow with real persistence,
authorization, audio quality, payment or provider effects. Where no external
sandbox is available, the system reports BLOCKED rather than inventing a
test outcome. Public onboarding and public concurrency scale are deferred.

## Admin-only runtime access

Configure MAXBOOSTER_ADMIN_ONLY_MODE=true in the actual deployed runtime.
The governance policy then denies non-admin application access with HTTP 403
and closes account registration even if a database setting still allows it.
Existing login and session recovery paths remain available, and the
administrator retains normal permission, MFA, billing and consent rules.

Disable ordinary user registration in the admin settings as defense in depth.
Audit every OAuth callback, paid-registration path, webhook exemption and
early-mounted route to verify no accidental public account creation or
privilege bypass. Avoid public UI claims of completed features which require
other users. The account initializer currently resets an existing admin
password from environment configuration; review the credential rotation
and bootstrap policy before a live admin deployment.

## Adaptation and execution

1. Run node scripts/aso/team-plan.mjs to build all-file tasks.
2. Run MAXBOOSTER_ADMIN_ONLY_MODE=true node scripts/aso/master-verify.mjs
   --mode quick --release-profile admin.
3. Run node scripts/aso/team-triage.mjs on the resulting fresh report.
4. Run MAXBOOSTER_ADMIN_ONLY_MODE=true node scripts/aso/supervisor.mjs
   --senior-team --release-profile admin --auto-repair --auto-commit
   --max-cycles 3 --budget-minutes 240 on a clean aso/ feature branch.
5. After quick pass the supervisor runs the exhaustive original test
   harness, release build, strict gauge and full page acceptance; it
   does not silently substitute the public rollout criteria.
6. Request independent operator evidence of the real admin journeys.
   Supply --release-evidence /secure/path/admin-evidence.json and
   include profile=admin and the exact commit SHA.

The supervisor learns recurrent incident fingerprints, affected files,
responsible roles, successful mechanical strategies and failed attempts.
It uses measured improvement to choose cheaper/smaller fixes first, and
stops repeated or unsupported actions. No test thresholds, permissions,
production receipts or safety rules may be rewritten to manufacture success.

### Optional role-specific model worker

An optional OpenAI Responses API worker uses the senior role's real checklist
to diagnose one bounded non-sensitive file and propose a structured JSON
unified diff. It has no shell tools or direct production credentials.
It is disabled until the operator supplies OPENAI_API_KEY and explicitly opts
into remote source disclosure and API usage. Enable it by adding
--model-workers --allow-remote-source --max-model-calls 2 to the supervisor
invocation above. The model call is capped, logs remain local, high-risk
files require separate human review, and a low-risk patch is applied only
after independent verification on the clean aso/ branch shows progress.
The model cannot automatically edit tests, security-critical paths, live
billing, migrations, governance code, the ASO or deployment policy. No
production push, merge or deployment is automatic.

The current implementation is NOT guaranteed to solve arbitrary problems.
A blocked role, unqualified model, vendor account not configured,
nonreproducible failure, unsafe proposed change or missing real evidence
stays unresolved. A bounded loop can be restarted under explicitly scoped
operator supervision, but cannot assert readiness from its own predictions.

## Proof required to promote

The administrator readiness gate expects all check IDs in
REQUIRED_ADMIN_EXTERNAL (scripts/aso/common.mjs), including MFA,
registration denial, end-to-end pages, actual audio and AI output,
distribution/marketing, ledger, backup/restore, runtime, observability,
security negative tests and recent operator approval. A structurally valid
evidence file does not prove that its receipts are authentic; the operator
must inspect those independently. All claims are bound to an exact source
commit, real runtime and retained receipts.

The release must remain NO-GO until actual deployed Replit administrator
acceptance has passed and a separate release approval is recorded. Desktop/
mobile file paths stay in the full repository scope, while native packaging
multi-app CI is not a web/API admin launch prerequisite.
