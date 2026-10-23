# Production continuation — 2026-10-23

Source baseline: `20lawsobk/maxbooster7.5`, `main` at
`f571666292938651db15f56ffa3d7d4ab75b4305`.
Candidate branch: `sophia/2026-10-23-integrated-production-hardening`.

## Scope and documentation reconciliation

The owner excludes multi-application workflows from production readiness.
Desktop/mobile packaging, store uploads and their GitHub workflow statuses are
not acceptance gates for this work. Imported MaxCore/PDIM runtime services remain
dependencies of the web application. Publication remains a separate operation.

Reviewed the root readiness and environment reports; the production roadmap;
the October 20 repository audit; npm build/start instructions; the current page
review; payment business-integrity evidence; October 21 generation and beat-loop
verification; and the retained execution handoff, launch blockers and evidence
matrix. This is a reconciliation of those documents, not a claim that every
historical report or every application feature was independently re-executed.

- `PRODUCTION_READINESS.md` retains an August baseline. Its old test/lint counts
  are not the current application result.
- The September scaled-cluster PASS in
  `reports/readiness-implementation/launch-blockers-current.md` is explicitly a
  bounded simulation. Its date and revision prevent using it to certify the
  October source.
- `docs/generation-verification-2026-10-21.md` supersedes earlier optimistic
  model-loaded health observations for generation capability: the documented
  actual text request returns 503 without an operational candidate. Awareness
  and planning success do not establish generated text or learned media quality.
- That same report records 2,332 tests and 80 route cases on an earlier revision.
  Route rendering does not certify every write, provider or recovery journey.
- Open PRs #107–#110 contain complementary bank-credential fixes but no runtime
  test evidence. They are integrated here without modifying their source branches
  or merging into main. Older overlapping PRs #84/#85 are not bulk-merged.
- The cloud setup notes at `/workspace/onboarding-results/README.md` identify
  Node 22 tooling and PostgreSQL fixtures, plus prior native database connectivity
  limits. Their runtime observations are historical and are not copied as passes.

## Implemented security work

The candidate includes the four existing payout fixes and closes an additional
generic-preference bypass. The legacy bank forms/endpoints cannot collect bank
credentials, payout views no longer trust an arbitrary historical `verified`
flag, and both payout preference persistence and split acceptance reject bank
details. Stripe Connect and PayPal paths remain available.

`server/lib/paymentPreferencePrivacy.ts` removes banking fields from returned
preference JSON. `server/routes.ts` uses it in the general preference endpoints
and account/login/registration/demo responses. Both general preference write
endpoints reject nested bank-credential fields before persistence. Historical
database values are neither erased nor migrated by this change.

Paid and administrator dashboard account responses use the same redaction and
also exclude email-verification tokens. Deliberate owner data exports and
historical-record remediation are separate from routine account responses.

`tests/payment-processing/provider-only-preferences.test.mjs` executes the exact
registered handlers with isolated storage, plus the real service methods across
closed dependency boundaries. It checks denial before writes, historical-data
redaction, authentication, preserved PayPal/Stripe identity, and unchanged source
records. `npm run test:payment-preferences` is included in `test:ci`.

## Dependency and embedded-runtime corrections

Fresh audit data identified advisories absent from the older evidence:
GHSA-27r3-jxmh-p828 (body-parser), GHSA-cg2g-xh64-v4q7 and related DOMPurify
advisories, GHSA-rxp7-6hxx-x8q5 (ip-address), and GHSA-mrhx-c7xc-m3w5 (Zod).
The root and applicable imported locks now resolve body-parser 2.4.0,
DOMPurify 3.4.17, ip-address 10.7.4 and Zod 4.6.7. Both imported catalogs use
patched Zod; the v4 override also covers transitive copies. Lifecycle scripts
were disabled for these installations.

Updated installed-artifact floors reject the newly vulnerable body-parser,
DOMPurify and ip-address versions. Tests execute real Express compressed-body
handling in a child process and prove an oversized Zod array produces one
size-limit issue instead of an issue for every rejected member. Existing HTTP
consumer tests cover IP parsing, redirects, credential stripping and cancellation.

The host type graph also imported the concrete fabric-storage class through
`RedisStore`. That class pulled an independent workspace's SQL schema into the
application and caused incompatible nominal Drizzle types. `RedisPersistence`
now describes the four storage methods actually consumed, using existing fabric
value types. The real fabric implementation still satisfies the constructor;
no command, durability or recovery behavior is changed.

## Risk-ranked remaining work

| Priority | Finding | Acceptance criterion |
| --- | --- | --- |
| P0 | Main text generation has no qualified candidate in the latest documented live check. | Real main-client generation passes unchanged capability/quality checks with a pinned candidate and current awareness. Do not replace this with a fabricated success or disable the gate. |
| Closed code finding | Bank-credential collection/read paths integrated and tested. | Integrated denial/redaction regressions, type checks and build pass; separately reconcile historical data without disclosing or deleting it here. |
| Closed advisory finding | DOMPurify, body-parser, Zod and ip-address upgraded; three production audits clean. | Upgrade compatible consumers and locked trees; rerun audit and consumer/security regressions. |
| P1 | Full current-revision startup and functional acceptance are not established by old reports. | Disposable production startup, auth/session/CSRF, tenant/payment/worker and recovery evidence on the candidate. |
| P1 | Provider-dependent and learned-media journeys remain bounded/unverified. | Retain explicit capability limits; qualify real implementations and isolated provider contracts. Do not manufacture settlement or delivery. |

No deployment, real charge, external message, shared-database migration,
historical-data deletion or Replit Agent delegation is part of this continuation.
The saved Sophia Agents API session has not been launched; this work uses the
actual connected GitHub tools and the attached cloud executor.

## Verification

Results are recorded after command completion; pending checks are not passes.
The initial default-heap TypeScript invocation exhausted memory. The initial
build stopped on absent imported-workspace installations. Both are retained as
environment/setup observations, not hidden or treated as passing runs.

- Node 22.23.3 / npm 10.9.4: ordinary production build passed after provisioning
  the locked imported dependency trees. No deployment packer ran in the source
  checkout. A final build incorporates the additional dashboard redaction.
- Native server/client semantic checks passed after the Redis persistence
  boundary correction. Both imported API-server TypeScript checks passed.
- Root production audit and both imported-workspace production audits reported
  zero vulnerabilities. These are advisory/inventory results, not proof that
  every application security property has been tested.
- Six focused preference/account regression tests passed with no retries/skips.
  Two request-validation security regressions and 15 HTTP/artifact consumer
  tests passed. Changed runtime/test lint passed.
- Beat Money Loop: all nine real disposable-PostgreSQL lifecycle scenarios
  passed (ten Node test results including the parent harness). Renderer,
  storage and provider boundaries remain fixtures; no real post or sale occurred.
- Actual `npm run start` from a disposable source/artifact copy ran inside an
  unprivileged network namespace against a fresh Unix-socket PostgreSQL fixture.
  The harness used private namespace port 5000 in place of its historical 5012
  to follow the application's current port contract. Homepage and health returned
  200; readiness returned 503. Database, Redis, routes, audit and automation were
  healthy; MaxCore timed out and unified awareness was unavailable. This is a
  bounded network-isolated startup check, not a current deployed outage or a
  full-readiness pass. Owned app processes and PostgreSQL shut down cleanly.
  This smoke preceded the final paid/admin response-only redaction; its final
  focused handler tests cover that addition.

- Final Node 22 `npm run check` passed for server and client. The ordinary final
  production build passed after all executable-source edits.
- Final `npm run test:ci -- --retry=0` passed: all 2,332 Vitest tests across
  276 suites, zero failures/errors/skips, plus the runtime/security and six
  preference-handler Node regressions. The test environment had no provider or
  shared-database credentials; PostgreSQL fixtures used local private databases.
- Retained preceding full-run failure: 2,331 passes and one BullMQ three-second
  lock-renewal failure while build/compiler jobs competed for the small host.
  The exact 14-test protocol suite then passed without retries. The final full
  run used the unchanged two-worker configuration with no competing heavy checks
  and passed without retries in about 202 seconds. No lock TTL or assertion was
  relaxed. This does not establish production saturation/soak capacity.

## Documentation disposition and release decision

The [documentation register](documentation-review-2026-10-23.md) covers the 61
existing root, docs and page-review Markdown documents, with selected retained
readiness reports reconciled separately. It distinguishes historical findings,
fixture results, route rendering and business/provider acceptance. Older reports
and machine artifacts are not silently converted into current certification.

Current operations/auth/install guidance was corrected. Old utility-completion
and commercial-plugin-quality claims are explicitly historical/unsubstantiated.
The prepared-release guide now consistently describes optional tools rather than
claiming the configured publishing path requires their output.

| Release gate | Current disposition |
| --- | --- |
| Ordinary production build and server/client types | PASS on the candidate. |
| Unit, focused preference/security and beat-loop fixture checks | PASS within stated fixture boundaries. |
| Root/imported production dependency advisories | PASS: zero reported vulnerabilities in each audit. This is not comprehensive SAST or security certification. |
| HTTP startup | Limited PASS: homepage/health 200 in isolated npm start. |
| Aggregate runtime readiness | NOT PASSED: isolated readiness 503; no current deployed readiness claim. |
| Qualified text and learned-media functionality | Unresolved; latest documented live text candidate failed capability qualification. No gate was disabled. |
| Full business/provider, retained recovery, and saturation acceptance | UNVERIFIED for this candidate beyond the enumerated fixtures. |
| Multi-application/desktop/mobile packaging workflows | OUT OF SCOPE by owner instruction. |

**Not certified 100% functional or production-ready.** The next blocking work is
real MaxCore capability qualification and integrated runtime/business acceptance,
not making historical workflow badges green or relabeling unavailable features.
The code candidate is reviewable without deploying, merging, altering shared data
or claiming a live Sophia Agents API session was started.
