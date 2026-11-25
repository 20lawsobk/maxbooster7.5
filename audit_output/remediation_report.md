# Remediation Report

**Score:** 3 -> 3  
**Blockers:** 655 -> 655  
**Production ready:** False  
**Branch:** `audit-fixes-20261124-232253`  

## Applied changes

- none

## Needs a human

- [secret] `.agents/memory/maxcore-test-suite-auth.md`: unsupported file type: move the secret out by hand
- [secret] `.task123-publishing-candidate/client/src/i18n/locales/ja.json`: unsupported file type: move the secret out by hand
- [secret] `.task123-publishing-candidate/external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_platform_discovery.py`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703493686/server/services/mobilePushService.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/reports/fix-all/.snapshots/ts-server-1785703851828/server/services/mobilePushService.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/reports/platform-evidence/2026-10-29-commerce-catalog-repairs/candidate/tests/testing/test_commerce_subject_selector.py`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/reports/platform-evidence/2026-10-29-commerce-catalog-repairs/selector/candidate/tests/testing/test_commerce_subject_selector.py`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/reports/platform-evidence/2026-10-29-commerce-catalog-repairs/source.patch`: unsupported file type: move the secret out by hand
- [secret] `.task123-publishing-candidate/reports/readiness-audit/scanner-dependencies.json`: unsupported file type: move the secret out by hand
- [secret] `.task123-publishing-candidate/scripts/production-provider-simulation.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/scripts/readiness-gauge/lib/checks.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/scripts/rehearse-publishing-start.sh`: unsupported file type: move the secret out by hand
- [secret] `.task123-publishing-candidate/scripts/simulate-production.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/scripts/testing/run-pdim-smoke.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/server/services/acmeCrypto.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/server/services/mobilePushService.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/current-storage-joint-recovery.test.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/fabric-migration-outbox-postgres.test.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/payment-processing/outbound-services-webhooks.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/testing/test_commerce_subject_selector.py`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/acmeCrypto.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/api-request-csrf.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/auth-page-contracts.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/auto-posting-recovery.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/checkout-subscription-page-contracts.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/client-auth-beta-contracts.test.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/developer-api-page-backend.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/growth-rights.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/maxcore-connector-contract.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/readiness-gauge.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tests/unit/toolost-release-transport.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `.task123-publishing-candidate/tools/legacy-security-update.json`: unsupported file type: move the secret out by hand
- [secret] `client/src/i18n/locales/ja.json`: unsupported file type: move the secret out by hand
- [secret] `external/maxcore/artifacts/ai-training-server/ai_model/awareness/test_platform_discovery.py`: no safe automatic rewrite found: fix by hand
- [secret] `reports/fix-all/.snapshots/ts-server-1785703493686/server/services/mobilePushService.ts`: no safe automatic rewrite found: fix by hand
- [secret] `reports/fix-all/.snapshots/ts-server-1785703851828/server/services/mobilePushService.ts`: no safe automatic rewrite found: fix by hand
- [secret] `reports/platform-evidence/2026-10-29-commerce-catalog-repairs/candidate/tests/testing/test_commerce_subject_selector.py`: no safe automatic rewrite found: fix by hand
- [secret] `reports/platform-evidence/2026-10-29-commerce-catalog-repairs/selector/candidate/tests/testing/test_commerce_subject_selector.py`: no safe automatic rewrite found: fix by hand
- [secret] `reports/platform-evidence/2026-10-29-commerce-catalog-repairs/source.patch`: unsupported file type: move the secret out by hand
- [secret] `reports/readiness-audit/scanner-dependencies.json`: unsupported file type: move the secret out by hand
- [secret] `scripts/production-provider-simulation.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `scripts/readiness-gauge/lib/checks.ts`: no safe automatic rewrite found: fix by hand
- [secret] `scripts/rehearse-publishing-start.sh`: unsupported file type: move the secret out by hand
- [secret] `scripts/simulate-production.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `scripts/testing/run-pdim-smoke.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `server/services/acmeCrypto.ts`: no safe automatic rewrite found: fix by hand
- [secret] `server/services/mobilePushService.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/completion-understanding.test.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `tests/current-storage-joint-recovery.test.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `tests/fabric-migration-outbox-postgres.test.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `tests/payment-processing/outbound-services-webhooks.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `tests/testing/test_commerce_subject_selector.py`: no safe automatic rewrite found: fix by hand
- [secret] `tests/testing/test_production_audit_understand_cli.py`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/acmeCrypto.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/api-request-csrf.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/auth-page-contracts.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/auto-posting-recovery.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/checkout-subscription-page-contracts.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/client-auth-beta-contracts.test.mjs`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/developer-api-page-backend.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/growth-rights.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/maxcore-connector-contract.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/readiness-gauge.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tests/unit/toolost-release-transport.test.ts`: no safe automatic rewrite found: fix by hand
- [secret] `tools/legacy-security-update.json`: unsupported file type: move the secret out by hand
- [no_license] `*`: choosing a license is your call: rerun with --license MIT --license-holder NAME
- [bare_except] 1198 remaining: Remaining hits are swallowed exceptions (pass / empty catch): handle or log them.
- [placeholder] 1163 remaining: Replace mock/stub/placeholder logic with real implementations.
- [large_file] 380 remaining: Split oversized modules by responsibility.
- [secret] 98 remaining: Remaining hits are known-format tokens, dict entries or unsupported languages: fix by hand.
- [todo] 98 remaining: Finish or ticket the unfinished work; this needs a developer.

## Caveats

- Removing a secret from the code does **not** remove it from git history. Rotate it.
- Review the diff and run your tests before merging.
- Generated README/CI are starting points, not finished artifacts.

## AI-assisted remediation

- Model calls: 0; test baseline: FAILING; test command: `npm test --silent`
- Status counts: aborted 1

Every applied change passed syntax, audit-regression and test gates. Review the diff anyway.

- [aborted] `*` (setup): baseline tests fail before any AI change; fix them or pass --ai-unverified. ❯ tests/unit/subscriptionCheckout.test.ts:48:7
     46|         clientSecret: process.env.CLIENT_SECRET as string,
     47|       }),
     48|     ).toEqual({
       |       ^
     49|       ok: true,
     50|       clientSecret: process.env.CLIENT_SECRET as string,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/8]⎯



Generated tests are characterization tests: they pin current behavior, including any existing bugs.
