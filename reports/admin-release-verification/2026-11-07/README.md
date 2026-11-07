# Admin release verification continuation

The Developer API administrator entitlement defect is fixed and verified. Controlled database and file-storage recovery also passed. Full private-admin production acceptance remains **UNVERIFIED**.

## Fixed workflow

An administrator without a public subscription received 403 when creating Pro or Enterprise API keys. The real source-app HTTP baseline reproduced both failures: 20 cases passed and two failed. The route now permits the trusted administrator role to create every key tier while retaining ordinary subscription rules and suspended/banned-account restrictions.

The new HTTP checks create keys through real authenticated requests, verify the server-derived owner and stored SHA256 hash in PostgreSQL, list them without disclosing plaintext or hashes, deny foreign listing/revocation, and verify owner revocation in SQL. Forged administrator fields and ordinary monthly subscriptions cannot obtain premium API capacity. Required MFA and suspended/banned administrator states remain denied by the real session authority.

## Executed verification

| Scope | Result |
| --- | --- |
| Real source application, disposable PostgreSQL, four HTTP suites | 71 passed; zero failures/errors/skips |
| Developer API route with controlled service/session | 29 passed; zero failures/errors/skips |
| Joint current-format SQL metadata and canonical PDIM file recovery | 6 passed; zero failures/skips |
| Actual PostgreSQL dump/restore and startup-readiness gate contracts | 13 passed; zero failures/skips |
| Complete server/client TypeScript checks | PASS |
| Lint on the three changed TypeScript files | PASS |
| Production build and source-to-artifact validation | PASS |

The MJS recovery test is excluded by the repository ESLint configuration; it was executed directly with `node:test`. The PostgreSQL 18 constraint-catalog test now compares restored definitions with the actual source, retains explicit CHECK/foreign-key/primary-key assertions, and checks real NOT NULL enforcement. This corrects a test assumption; it does not represent a production restore defect.

The joint recovery drill drains the owned writers, takes a paired SQL/file snapshot, rejects corrupt or mismatched backup pairs before mutation, removes the original disposable data, and restores into independent processes. It verifies exact file hashes, ownership denial, deletion tombstones, pending operations, media jobs and migration accounting. The separate SQL drill verifies Unicode, numeric, JSON, byte values, sequence progression, an exported snapshot, transaction rollback on a rejected invariant and partial-file cleanup.

The startup checks exercise readiness policy and HTTP gate contracts. **They are not a full production process restart rehearsal.** Local restart prerequisites fail because the packaged `python_runtime` is absent and this sandbox cannot create the required nested user/network namespace. Neither existing restart acceptance script was weakened or marked passed.

## Evidence and remaining work

[verification.json](verification.json) records exact source hashes, private-log hashes, commands, failed baselines, fixture cleanup, PostgreSQL tool provenance and remaining acceptance conditions. [storage-recovery.json](storage-recovery.json) retains the recovery drill's own source hashes and detailed checks. The checkout is base main plus PR211 overlays; the base Git HEAD alone does not identify the tested source. Counts are separate scopes and are not combined with historical runs; `node:test` totals include parent tests.

Remaining work includes deployed admin journeys across all twelve domains, live provider outcomes, packaged-runtime startup/restart, deployment rollback, offsite recovery and recovery targets, monitoring, and private-launch governance. The controlled storage tests do not verify live Neon, Replit, every application table or recovery while production writers are active. Replit inspection remains busy/not-submitted, and the connector has no current publication status. Hosted CI was previously blocked by account billing; no hosted CI pass is claimed here.

The detailed AGROS task plan and separate admin-release decision remain in PR210; default executors, reviewers and acceptance production still need configuration. No merge, deployment or production data mutation was performed. Public rollout remains deferred.
