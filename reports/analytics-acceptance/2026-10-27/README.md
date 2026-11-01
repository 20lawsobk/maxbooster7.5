# Dedicated account analytics acceptance

Source revision: `c06fbecdb32a5c3b76662f631604bfd9abac386b` plus the exact uncommitted source changes identified by [source-hashes.json](source-hashes.json). These 16 source/test/config hashes were checked against the final files after all focused checks. This cohort does not certify other dirty files or the entire platform. Final execution occurred October 27 in the user's America/Detroit timezone; machine receipts use UTC on October 28.

The implemented main routes call a dedicated MaxCore numerical contract instead of a social-caption endpoint or a Node fallback. Authenticated, owner-scoped recorded metrics remain transient private inputs. Public-awareness snapshot metadata is read separately and is explicitly not a causal forecast input. No account observations enter public learning, training, persistent cache or public ingestion.

| Final check | Result | Evidence |
| --- | --- | --- |
| Actual main application authentication/session/CSRF → PostgreSQL → canonical MaxCore HTTP | 19 passed, zero failed/errors/skipped | [http-stable-final/integration.junit.xml](http-stable-final/integration.junit.xml), [runner receipt](http-stable-final/summary.json) |
| Real account service, real disposable PostgreSQL, real control transport and canonical Python HTTP | 12 leaf cases passed, plus the Node parent case | [combined final Node log](account-analytics-node-corrected-browser-final.txt) |
| Real Chromium, React DOM and installed Query v5 component lifecycle | 1 passed, zero skipped | [combined final Node log](account-analytics-node-corrected-browser-final.txt) |
| MaxCore Express analytics proxy, existing awareness warmup routes and unified posting regressions | 24 passed | [proxy/unified log](account-analytics-proxy-unified.txt) |
| Canonical Python ASGI numeric/authorization/input/public-context contracts | 59 passed | [Python log](maxcore-analytics-python-protocol-final.txt) |
| Python module-only coverage | 158/158 statements and 30/30 branches, no exclusions or partial branches | [final JSON](python-coverage-final.json), [raw coverage database](python-coverage-final.sqlite3) |
| Server and client TypeScript | Exit 0 | [typecheck log](account-analytics-types-stable-final.txt) |
| Focused ESLint | Exit 0 | [lint log](account-analytics-lint-stable-final.txt) |

The final HTTP runner recorded no remaining owned test, application or Python processes and a successful disposable PostgreSQL shutdown. Its Python fixture hosts the actual analytics router only. General model/inference/generation/readiness endpoints remain absent, so this evidence does not turn an intentionally sealed general MaxCore fixture into a full inference success.

The tests cover exact linear forecasts, residual uncertainty, nonnegative finite values, missing-day preservation, sparse and empty history, exact owner totals, fractional source revenue, listener-observation semantics, foreign owner and hostile body identity/history exclusion, UTC complete-day boundaries, main-route401/400/503 behavior and recovery, and malformed upstream method/timeline/count/total/capability admission. The real browser test checks pending authentication, CSRF POST, loading and button state, measured and insufficient summaries, missing public context, retry, malformed200 and non-JSON500 handling, separate account cache keys, logout and unmount. It uses declared auth/layout/data boundaries; the HTTP suite separately proves actual application session handling.

The following development failures are retained, with their limits:

- [Initial Node contract run](account-analytics-contract-initial.txt): the real transport defaulted to GET because the new caller omitted `method:POST`. Canonical HTTP returned405, which exposed the wiring error. Explicit POST fixed it; later logs include the final stronger protocol checks.
- [Initial Python failure](maxcore-analytics-python-initial-fixed-harness.txt): 33 passed and one failure exposed FastAPI's nonfinite validation-error serialization. Rejecting NaN, Infinity and overflowing JSON numbers before that serializer now produces422. The suite subsequently grew to59 cases.
- [Combined browser/Node attempt](account-analytics-node-stable-final.txt): the new browser harness evaluated `document.body.textContent` before the first navigation created a body. This was a test-harness race, not a component failure. Optional-body polling fixed it; [the corrected combined run](account-analytics-node-corrected-browser-final.txt) passed14 TAP cases, including parent counters.
- [First final Python coverage command](maxcore-analytics-python-final.txt): all59 tests passed, but an incorrectly supplied file path to coverage's `--source` option produced no data. It is not coverage evidence. The corrected `--include='*/ai_model/analytics.py'` run and its raw database/JSON provide the final scoped measurement.

`http-first`, `http-final` and `http-protocol-final` retain earlier successful focused attempts; their own source hashes distinguish the earlier17-case fixture, subsequent19-case fixture, and protocol review. Earlier Python profile/source hashes are retained separately from the final capability-marker revision. Superseded logs are history, not proof for the final whole-platform revision.

Daily engagement acquisition remains an explicit source gap: current/lifetime post counters have no reliable daily reporting period. The API returns `DAILY_ENGAGEMENT_REPORTS_UNAVAILABLE` rather than converting publication cohorts or duplicate cumulative snapshots into invented daily events. A real provider-period or deduplicated counter-delta ingestion path is still required. Recorded source revenue is not a settlement or currency-conversion proof; account analytics rows are recorded inputs, not automatically independently verified provider truth.

These results do not establish calibrated creative quality, arbitrary business-data reasoning, other legacy analytical contracts, actual Replit deployment, production Neon migrations, real provider-history synchronization, device builds, global capacity, or 100% platform coverage. No platform threshold was lowered or source excluded. See [instructions and methodology](../../../docs/testing/account-analytics.md) and the exhaustive platform plan for those gates.

`manifest.json` lists hashes and sizes for every retained artifact; `summary.json` carries the focused counts and explicit scope. Exact configured-secret scanning found zero matching artifact files before the final manifest was written. The raw source maps/counters required for global coverage are managed by their separate producer; this module-only Python profile is not merged into or presented as a global100% result.
