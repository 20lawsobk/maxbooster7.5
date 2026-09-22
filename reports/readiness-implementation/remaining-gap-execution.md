# Remaining production-readiness execution instructions

## Authority and scope

Continue the original 80-finding audit and its recommended repair playbooks.
Use `closure-verification.md` as the current gap inventory, not a replacement
architecture. Recheck source before acting on an older report.

The user has authorized implementation and verification until release-blocking
gaps are closed. Live additive application migrations remain conditional on
verified backup and rollback. Publishing, real-money transactions, customer
messages, destructive live-data operations and live PDIM cutover are not
implicitly authorized by a code-verification request.

## Execution order

1. Establish a safe backup/bootstrap path independent of the pending SQL
   catalog. Use configured credentials without exposing values. Match the
   PostgreSQL client to the server major version. Retain a private, checksummed
   recovery artifact independently of the source database and prove restoration
   and application invariants on an isolated target before live DDL.
2. Reconcile the existing schema against explicit migration checksums and
   catalog evidence. Do not fabricate historical receipts. Rehearse the actual
   live-compatible upgrade, lock bounds and rollback. Apply only the reviewed
   additive application migrations when every prerequisite passes.
3. Close source-level privacy/erasure, provider/reconciliation, export/offline,
   authorization and operational gaps within the original findings. Implement
   actual consumers and durable outcomes; rejection/unavailability is not
   feature completion. Do not invent legal retention policy, provider
   capabilities, qualified training data or financial opening balances.
4. Verify packaged runtime artifacts, resolved nested dependencies, cold boot,
   resource limits and completed security-scanner evidence. Repair actionable
   findings; never suppress findings merely to make a gate green.
5. Activate the assembled application only after migration and existing-storage
   safety requirements pass. Exercise authenticated user journeys, offline
   recovery, owner isolation and actual provider sandbox contracts. No production
   sends or real-money flows.
6. After coherent changes, run relevant isolated regression/beta checks once;
   then verify the assembled changed critical paths when activation is safe.
   Record exact evidence and distinguish fixtures from real acceptance.
7. Reconcile all 80 closure rows and release gates. Set releaseReady=true only
   when every blocking requirement has positive, applicable evidence. If an
   external authorization, policy, dataset or recovery requirement cannot be
   established, preserve the block, finish independent work and identify the
   exact missing input. Never certify completion by reducing scope silently.

## Work ownership and review

- Main agent: backup/migration prerequisites, shared bootstrap/routes/schema,
  integration, final evidence and release decision.
- Privacy worker: account-erasure and retention-policy execution boundaries,
  isolated tests; no live deletion or invented retention policy.
- Provider worker: original integration/reconciliation gaps, authenticated
  sandbox-safe contracts; no provider sends or changes to concurrent LabelGrid work.
- Runtime worker: packed-runtime/dependency verification and repair; no workflow
  startup, environment changes or live services.
- Product worker: original export/offline correctness gaps and focused tests;
  no redesign or simulated success.

Workers must not edit shared monoliths, root package/lock/configuration files,
or each other's files without coordination. Shared integration patches return
to the main agent. Reports must name remaining requirements plainly.

## Resumption checkpoint

Read `execution-handoff.md` and `status.json.latestExecution` before repeating
earlier checks. Dependency remediation and the combined isolated/typecheck cycle
have passed; do not reintroduce stale findings from historical simulation copies.
SAST remains incomplete. Keep application activation and live DDL blocked until
independent backup/restore and migration/storage prerequisites pass. Resolve the
documented missing policy, capability and acceptance inputs without inventing
authority or claiming unavailable features are complete.