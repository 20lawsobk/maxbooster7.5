# Actionable test and feature repair guide

Generated: `2026-11-10T14:49:10.124600+00:00`. Status: **needs_work**. Unresolved tasks: **3946**.

Observations come from the linked reports. A likely diagnosis is not a confirmed application bug. Run the reproduction command in the prepared isolated environment, complete the listed actions, and retain fresh proof. Generating this guide does not change a test result.

| Task kind | Unresolved |
| --- | ---: |
| assertion_failure | 1 |
| blocked_check | 20 |
| command_failure | 1 |
| coverage_gap | 2500 |
| feature_acceptance_gap | 838 |
| mapping_gap | 20 |
| missing_evidence | 1 |
| missing_execution | 547 |
| skipped_case | 18 |

## Failure families

| Observed boundary / diagnosis | Tasks |
| --- | ---: |
| Source-defined behavior lacks the required execution/feature evidence. | 3334 |
| This check was not executed under its required conditions. | 583 |
| The source inventory cannot resolve the actual target of a dynamic registration or interaction. | 20 |
| A required capability/readiness condition was not established. | 2 |
| An immutable historical diagnostic record or its referenced bytes no longer verifies. | 2 |
| The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred. | 2 |
| The deletion test imports a source module that is absent from this checkout. | 2 |
| The master run cannot establish this verification boundary without its expected artifact. | 1 |

Machine details, exact uncovered source locations and platform acceptance IDs are in `remediation.json`. The platform register provides every page/API/control requirement; these tasks link to it without copying the entire register.

This Markdown shows the first 100 prioritized tasks of 3946. The JSON retains every task and every uncovered location. Use `--markdown-limit N` to expand this review without changing the machine results.

## `repair-00be17a09cfff36c` — Invalid feature evidence links

Source: `platform-register.json`. Group: `platform`. Kind: `missing_evidence`. Priority: **P0**.

Observed: The platform register rejected one or more proposed proof links.

Diagnosis (**confirmed**): The master run cannot establish this verification boundary without its expected artifact.

Evidence: `platform-register.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Run the owning catalog/coverage/platform/test producer using the documented isolated master command.
2. Retain a complete machine report, its current source identity and real process exit. Do not treat an absent report as zero failures.

Proof needed:

- The expected artifact exists, parses and describes an actually executed producer.

## `repair-2ea8738838bd9745` — audit

Source: `scripts/testing/run-all.py`. Group: `checks`. Kind: `command_failure`. Priority: **P1**.

Observed: > max-booster@3.0.0 security:audit > npm audit --omit=dev --audit-level=high  undefined npm error audit endpoint returned an error npm error A complete log of this run can be found in: /tmp/maxbooster-test-ucqnshdb/.npm/_logs/2026-10-25T15_36_28_281Z-debug-0.log

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `reports/test-verification/final-checks/orchestration/audit.txt`.

Reproduce from the documented working directory:

```sh
npm run security:audit
```

Required changes:

1. Reproduce the exact named case in scripts/testing/run-all.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-0b768b9b452c0a7e` — mastodon_trending

Source: `tests/awareness-public-read-smoke.py`. Group: `public-feeds`. Kind: `assertion_failure`. Priority: **P1**.

Observed: Public adapter returned passed=false; rows=20; reason=required row contract did not pass

Diagnosis (**needs_verification**): The captured assertion/process failure needs source-level diagnosis; its cause has not been inferred.

Evidence: `root/public-feeds.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-python-suites.py --file tests/awareness-public-read-smoke.py
```

Required changes:

1. Reproduce the exact named case in tests/awareness-public-read-smoke.py using the command below and inspect its first expected/actual difference.
2. Trace the asserted handler/function and its owning frontend, authorization, validation and persistence dependencies; compare the current public contract with the fixture.
3. Repair the implementation when the contract is still required, or update an obsolete fixture using valid current inputs while retaining equivalent business/negative assertions.
4. Add a regression for the demonstrated root cause and rerun the dependent group; do not suppress the assertion or broaden accepted results merely to obtain green output.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d79fcd37e3f95df8` — No final execution evidence

Source: `tests/payment-processing/beat-loop-lifecycle-postgres.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only beat-loop-lifecycle-postgres.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-761120b343ef94b0` — Provider execution mode

Source: `tests/payment-processing/browser-fixture.mjs`. Group: `commerce`. Kind: `blocked_check`. Priority: **P2**.

Observed: Requires an explicitly selected isolated Stripe TEST account and creates remote test objects; provider mutations excluded from this credential-free rerun

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `commerce/results.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Provision the exact documented prerequisite: Invoked or imported by its owning test runner; do not run as a standalone test
2. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
3. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-0c012154771268c3` — No final execution evidence

Source: `tests/payment-processing/business-integrity-postgres.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only business-integrity-postgres.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b1f9ee0a2e294d31` — No final execution evidence

Source: `tests/payment-processing/business-integrity.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only business-integrity.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-37ffda9abf76fa6a` — No final execution evidence

Source: `tests/payment-processing/compensation-races-postgres.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only compensation-races-postgres.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f22f445fcfb1f580` — No final execution evidence

Source: `tests/payment-processing/database-commerce.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only database-commerce.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ccf9566962ad8811` — No final execution evidence

Source: `tests/payment-processing/inbound-billing.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only inbound-billing.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c69f0d9819f5525f` — No final execution evidence

Source: `tests/payment-processing/inbound-commerce.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only inbound-commerce.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7ed92a0919e3c5d9` — No final execution evidence

Source: `tests/payment-processing/inbound-legacy-services.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only inbound-legacy-services.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6a5444c3e6fb05e4` — Provider execution mode

Source: `tests/payment-processing/inbound-real-stripe.mjs`. Group: `commerce`. Kind: `blocked_check`. Priority: **P2**.

Observed: Requires an explicitly selected isolated Stripe TEST account and creates remote test objects; provider mutations excluded from this credential-free rerun

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `commerce/results.json`.

Reproduce from the documented working directory:

```sh
node tests/payment-processing/inbound-real-stripe.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12 and npm ci
2. Provision the exact documented prerequisite: Use the commerce runner's offline mode; see commerce.md
3. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
4. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1d253b6d3507cf18` — No final execution evidence

Source: `tests/payment-processing/inbound-registration.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only inbound-registration.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-23814049718141b7` — No final execution evidence

Source: `tests/payment-processing/inbound-storefront.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only inbound-storefront.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-226626c315c00bbe` — No final execution evidence

Source: `tests/payment-processing/maxcore-cognitive-registry-migration.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only maxcore-cognitive-registry-migration.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e8eee6480879d52f` — No final execution evidence

Source: `tests/payment-processing/outbound-commerce.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only outbound-commerce.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-4caf95beb4a05176` — No final execution evidence

Source: `tests/payment-processing/outbound-membership-auth.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only outbound-membership-auth.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6279bf909e40a8e4` — No final execution evidence

Source: `tests/payment-processing/outbound-services-webhooks.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only outbound-services-webhooks.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-362c30fb468ae586` — No final execution evidence

Source: `tests/payment-processing/outbound-stripe-resource-ownership.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only outbound-stripe-resource-ownership.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
5. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f3c57b84becb8958` — No final execution evidence

Source: `tests/payment-processing/outbound-stripe-test-transport.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only outbound-stripe-test-transport.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
5. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b9a64b5342323d18` — No final execution evidence

Source: `tests/payment-processing/outbound-topup-journal.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only outbound-topup-journal.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-63dc3fc16d48b3d3` — No final execution evidence

Source: `tests/payment-processing/provider-only-preferences.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only provider-only-preferences.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f66660c866104e5c` — Provider execution mode

Source: `tests/payment-processing/real-stripe-api.mjs`. Group: `commerce`. Kind: `blocked_check`. Priority: **P2**.

Observed: Requires an explicitly selected isolated Stripe TEST account and creates remote test objects; provider mutations excluded from this credential-free rerun

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `commerce/results.json`.

Reproduce from the documented working directory:

```sh
node tests/payment-processing/real-stripe-api.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12 and npm ci
2. Provision the exact documented prerequisite: Use the commerce runner's offline mode; see commerce.md
3. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
4. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-4a923a25a6bf586c` — Provider execution mode

Source: `tests/payment-processing/real-stripe-topup.mjs`. Group: `commerce`. Kind: `blocked_check`. Priority: **P2**.

Observed: Requires an explicitly selected isolated Stripe TEST account and creates remote test objects; provider mutations excluded from this credential-free rerun

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `commerce/results.json`.

Reproduce from the documented working directory:

```sh
node tests/payment-processing/real-stripe-topup.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12 and npm ci
2. Provision the exact documented prerequisite: Use the commerce runner's offline mode; see commerce.md
3. Use an explicitly selected dedicated Stripe TEST account with no shared enabled webhook endpoints and the documented test-only binding names.
4. Run the opt-in isolated provider suite only after its ownership/cleanup preflight; retain created-resource receipts, signature checks and cleanup evidence. Never fall back to production keys.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-3196f974a5407361` — No final execution evidence

Source: `tests/payment-processing/run.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
node tests/payment-processing/run.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12 and npm ci
2. Provision the exact documented prerequisite: Use the commerce runner's offline mode; see commerce.md
3. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
4. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-799dc29fce5270db` — No final execution evidence

Source: `tests/payment-processing/settlement-dispute-hold-postgres.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only settlement-dispute-hold-postgres.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-bd32dac151679284` — No final execution evidence

Source: `tests/payment-processing/subscription-authority-postgres.test.mjs`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only subscription-authority-postgres.test.mjs
```

Required changes:

1. Provision the exact documented prerequisite: Node.js >=22.12
2. Provision the exact documented prerequisite: npm ci
3. Provision the exact documented prerequisite: Disposable PostgreSQL where required; see commerce.md
4. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
5. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7041ebdeaecd388f` — No final execution evidence

Source: `tests/unit/beat-sale-money-loop.test.ts`. Group: `commerce`. Kind: `missing_execution`. Priority: **P2**.

Observed: The source inventory contains this check, but the reconciled run has no result for it.

Diagnosis (**confirmed**): This check was not executed under its required conditions.

Evidence: `file-status.json`.

Reproduce from the documented working directory:

```sh
python3 scripts/testing/run-commerce.py --only legacy-beat
```

Required changes:

1. Provision the exact documented prerequisite: Disposable, fully migrated PostgreSQL distinct from the app database
2. Provision the exact documented prerequisite: The sealed commerce runner prepares the fixture; see commerce.md
3. Inspect the file's skip/opt-in guard and catalog prerequisites; prepare its disposable fixture rather than targeting the running application.
4. Run the exact source-defined assertions and record a fresh command exit plus artifact identity.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1bb27ab523dacdb2` — Unexecuted source branches/functions

Source: `built-in plugins dsp/BasePlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 26 statements, 8 functions and 2 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/BasePlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-677afc0f670b76db` — Unexecuted source branches/functions

Source: `built-in plugins dsp/ChorusPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 95 statements, 22 functions and 26 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/ChorusPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-761f1f7cd04181cd` — Unexecuted source branches/functions

Source: `built-in plugins dsp/CompressorPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 89 statements, 18 functions and 36 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/CompressorPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7a89f79f2e76b07b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/DeEsserPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 211 statements, 24 functions and 44 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/DeEsserPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-aab5497efd6e8a4a` — Unexecuted source branches/functions

Source: `built-in plugins dsp/DelayPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 210 statements, 18 functions and 59 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/DelayPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-79af72fc06db466b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/DistortionPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 134 statements, 13 functions and 45 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/DistortionPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-06e052bcdfbfba0d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/DynamicEQPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 296 statements, 39 functions and 95 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/DynamicEQPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ea7d805b8d623771` — Unexecuted source branches/functions

Source: `built-in plugins dsp/EQPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 86 statements, 14 functions and 40 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/EQPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1e1c26122a46db5c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/FlangerPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 96 statements, 10 functions and 16 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/FlangerPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7f9b4039c27dcf6b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/PhaserPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 181 statements, 17 functions and 42 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/PhaserPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-8fa8de547e05ab5f` — Unexecuted source branches/functions

Source: `built-in plugins dsp/ReverbPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 147 statements, 24 functions and 38 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/ReverbPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-0d63e4a199fd2032` — Unexecuted source branches/functions

Source: `built-in plugins dsp/VocoderPlugin.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 298 statements, 46 functions and 91 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/VocoderPlugin.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-bde841a15f64c4a4` — Unexecuted source branches/functions

Source: `built-in plugins dsp/index.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/index.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6ac2217b11110e0f` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-3d-panner.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-3d-panner.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b024a0c76bd33782` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-acid-bass.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-acid-bass.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f6df29903c7a0b77` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-analog-polysynth.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-analog-polysynth.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-22ce8de2ccf6ae28` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-analog-synth.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-analog-synth.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-077f33d4a41285bb` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-auto-filter.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-auto-filter.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a06cd132f74be1ba` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-808.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-808.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1937295664108dfe` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-acid.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-acid.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-94673edc4870bfb8` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-electric.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-electric.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f1f1f9caeca1764b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-fm.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-fm.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-dab0aa3f7785719d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-moog.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-moog.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-314c16b893f6c7aa` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-reese.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-reese.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-e2425693a9c736ff` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-slap.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-slap.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-99c2b680587d6b06` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-sub.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-sub.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c1a987e469400749` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-upright.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-upright.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-9ce5b46264aa3a1a` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass-wobble.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass-wobble.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-2634a123fc793d8c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bass.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bass.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-407803f10edb0a72` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-chimes.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-chimes.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-4822f81461cee708` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-churchbell.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-churchbell.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6333116f4b174f5e` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-crystal-bowl.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-crystal-bowl.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-5eb32bdf4017efbe` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-gong.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-gong.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-da72032812ff2f82` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-handbell.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-handbell.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a55ca7ca3775348c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-steeldrum.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-steeldrum.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-2d99c1b17fd3e5f0` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-tibetan.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-tibetan.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1dda9cd440dcd089` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bell-tubular.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bell-tubular.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-dcb2bcbd9f1b1b9b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-binaural.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-binaural.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-342de8a5e2e83708` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-bitcrusher.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-bitcrusher.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-3ad1040e74ea9493` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-cornet.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-cornet.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-f6a6ef93db3c557f` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-ensemble.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-ensemble.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-427041bce37d4686` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-euphonium.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-euphonium.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7e2835b9d22b408b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-flugelhorn.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-flugelhorn.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-78f353dddf4c6bc7` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-frenchhorn.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-frenchhorn.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-38adc12901e59d1c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-muted-trumpet.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-muted-trumpet.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1c8d51831ce125f4` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-sax-alto.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-sax-alto.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-112a2c04cae33f34` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-sax-bari.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-sax-bari.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-14fc9024466d341d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-sax-soprano.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-sax-soprano.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-74be596cdd2ef21a` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-sax-tenor.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-sax-tenor.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-af033cf7d546cd8c` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-trombone.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-trombone.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-06789b75a34b60c3` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-trumpet.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-trumpet.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ad0178d3aa5c6902` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brass-tuba.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brass-tuba.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-44658d9cdef67c5d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-brickwall-limiter.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-brickwall-limiter.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-06941fa00546d439` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-chorus-classic.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-chorus-classic.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-b0523166962343a8` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-chorus-dimension.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-chorus-dimension.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-c8cd0e808d319f15` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-chorus-vintage.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-chorus-vintage.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a77a533533c05cf9` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-chorus.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-chorus.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d47ff0bfb831fc92` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-bus.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-bus.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-251fb07611f11749` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-mastering.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-mastering.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a9b06671e4a988f3` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-multiband.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-multiband.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a0a5c2ee42c45fa9` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-opto.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-opto.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-6f2f88cfc36e56ae` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-parallel.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-parallel.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-d02363b2889c818b` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-sidechain.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-sidechain.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-ff255151d827c259` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-studio.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-studio.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-18fdd261833051f9` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-transient.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-transient.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-3a32e0e74aa1b7fd` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-tube.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-tube.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-a309d5dd9d35b1d5` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-comp-vca.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-comp-vca.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-331f3096f17429b1` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-compressor.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-compressor.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-7674bb1205d80d86` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-correlation-meter.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-correlation-meter.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-1552a2e2cbddd84d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-creative-bassenhance.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-creative-bassenhance.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.

## `repair-2e7dd5023867098d` — Unexecuted source branches/functions

Source: `built-in plugins dsp/mb-creative-exciter.ts`. Group: `coverage`. Kind: `coverage_gap`. Priority: **P2**.

Observed: 1 statements, 0 functions and 0 branch arms have zero hits.

Diagnosis (**confirmed**): Source-defined behavior lacks the required execution/feature evidence.

Evidence: `reports/test-verification/coverage/coverage-final.json`.

Reproduce from the documented working directory:

```sh
npm run test:all -- --plan
```

Required changes:

1. Add a meaningful isolated regression for the named source: built-in plugins dsp/mb-creative-exciter.ts. Follow its actual caller, route/owner and persistence boundary.
2. Exercise the listed zero-hit functions/branches or required feature checks with valid, boundary, malformed and unauthorized inputs; include unavailable dependencies and retry/restart behavior where applicable.
3. For UI controls, use real DOM/browser interactions and assert loading, empty, error and delivered-success states plus the resulting backend effect.
4. Register the new test in the owning runnable group, then regenerate the catalog, coverage and platform register. File-name associations and expect(true) placeholders do not close acceptance gaps.

Proof needed:

- Rerun the exact affected case/file and retain its original failure plus successful new evidence.
- Re-run dependent feature journeys; do not replace a required business result with a broad accepted-status list.
