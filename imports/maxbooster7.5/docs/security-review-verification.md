# Security review and verification

## Disposition

Confirmed application findings were corrected and regression-tested. **This is
not a project-wide clean-security certification.** Dependency advisories and
privacy findings remain visible; the managed SAST scanner returned incomplete
coverage rather than a clean result.

## Corrections

- Private response caching no longer derives identity from unsigned JWTs,
  cookies, or an unvalidated session field. A verified user and explicit,
  successful resource-authorization policy are required before every cache
  lookup. Shared private cache keys are prohibited. Existing blanket mounts
  therefore execute the actual endpoint instead of bypassing its guards.
- Remote session management reads and revokes the authoritative PostgreSQL
  cookie store, not historical tracking rows. The literal `sessions/other`
  endpoint is reachable. Session status, extension, and device trust use the
  same authority. Revoked SID tombstones prevent stale saves/touches from
  resurrecting access.
- Historical bearer credentials have no reliable device/SID binding. Remote
  termination revokes these account-wide while leaving unrelated cookie
  sessions intact. A durable cutoff follows the original authentication time
  through refresh rotation, including a refresh already in flight.
- Billing updates preserve suspended/banned status atomically, including
  webhook handlers, billing service/routes, lifetime refund compensation, and
  administrative startup synchronization. Demo sign-in rejects disabled users.
- Studio renders use owner-scoped, tracked generated-file storage. Legacy
  `studio-renders/` keys require a matching ownership record; untracked legacy
  objects are denied, not assigned an invented owner. Render scratch files are
  cleaned up on error.
- Zero-total merchandise orders fail within the inventory transaction, leaving
  stock and reservation tables unchanged.
- Merchandise retry identity stores a SHA-256 digest instead of shipping
  addresses/email. SMS logging no longer prints verification codes or embedded
  phone values; social usernames use structured redacted logging.
- RSS XML parsing rejects DTDs, entities, excessive size, nesting, and node
  counts before tree construction. Encoded XML is tested as well.

## Verification

- Full configured Vitest unit suite: **164 files, 1,342 tests passed**.
- Isolated payment, real PostgreSQL, signed-JWT, and scanner regressions:
  **32 tests passed**. PostgreSQL uses a disposable local cluster, not the
  application's shared database.
- Additional authority and actual log-redaction tests: **14 passed**.
- Hardened XML parser tests: **3 passed**.
- Changed TypeScript/JavaScript syntax transforms and `git diff --check` passed.
- The first broad unit pass exposed a test invoking the environment-dependent
  `npx` wrapper. The test now executes the installed TypeScript runner through
  Node directly; the subsequent complete suite passed.
- Tests ran without application/provider credentials. The broad suite used an
  isolated network namespace with loopback enabled. No application startup,
  live payments, shared database migrations, or authenticated production
  mutations were used for verification.

## Scanner evidence and remaining limits

- `reports/security-review-verification/sast.json` records an independent local
  Semgrep scan covering 3,503 declared source files, with 28 review findings and
  complete declared-inventory coverage. A full rerun is still in progress and
  writes `sast-final.json` when finished; `sast-supplement.json` covers the subsequent XML and
  privacy corrections. Reports preserve findings rather than suppressing them.
- The XML import rule still flags the guarded standard-library parser. This is
  not treated as a clean scanner output: source inspection and executable
  rejection tests establish the boundary. Other initial findings include
  loopback HTTP, fixed test/worker code execution, and a non-shell PostgreSQL
  restore process with validated arguments; these require contextual review,
  not deletion of working functionality to silence rules.
- The managed dependency rerun still reports **7 high occurrences** of
  **2 advisories**: braces through 3.0.3 (stack exhaustion), and
  http-cache-semantics through 4.2.0 (cross-user stale-cache disclosure).
  Registry latest versions were still 3.0.3 and 4.2.0. A downgrade would also
  remain in the advisory ranges. The installed root HTTP-cache chain is
  electron-builder → app-builder-lib → @electron/get → got → cacheable-request;
  the inspected root/nested npm locks classify it as development tooling.
  This is exposure information, not an exemption or remediation. No untested
  incompatible override, package stub, or audit suppression was installed.
- The privacy rerun after the merchandise digest change reported 246 findings:
  168 in retained nested project copies, 75 in server source, 3 elsewhere.
  Root logging has actual runtime PII/credential redaction verified by tests,
  but that does **not** automatically clear every call site or retained copy.
  Subsequent SMS/social changes were syntax-checked and scanned separately.
  A complete per-finding privacy disposition remains outstanding.
- The tracked platform security scan remained queued/running independently.
  It is not substituted for the completed local scan or reported as passed.
- No browser/live-app certification is claimed. Starting the app would trigger
  writes to its shared development/production database.