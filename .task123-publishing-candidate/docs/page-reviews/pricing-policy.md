# Pricing, Terms and Privacy bounded review

## Scope and status

Only `client/src/pages/Pricing.tsx`, `Terms.tsx`, `Privacy.tsx`, the uniquely named `tests/unit/pricing-policy-page-render.test.ts`, and this review were edited. Existing unrelated changes were preserved. Backend/shared code was inspected read-only. No live API actions, credential inspection, database writes, server starts/restarts, deployment, full build or full typecheck were performed.

**Not production-ready evidence.** Focused server-render and TSX compilation checks pass. The already-running `/pricing` preview screenshot at 1280×900 showed only the application's loading skeleton, not the page; rendered browser appearance is therefore unverified. No workflow/log investigation or restart was attempted. Mobile layout, open Sheet behavior/focus, keyboard interaction, actual checkout, authenticated billing, and legal/privacy operational claims remain unverified.

## Implemented fixes

- Replaced conflicting seven-day refund copy throughout Pricing and Terms with the required **90-day money-back guarantee**. No automatic refund functionality was added.
- Pricing now leads with canonical **Monthly $49/month, Yearly $468/year, Lifetime $699 once**. The annual $39/month equivalent and $120 annual savings remain explicit.
- Replaced anchor/button nesting with `Button asChild` around real links, retaining checkout routes, tiers and test IDs. Pricing's self-referential Get Started navigation now targets its plan section.
- Added main landmarks, named navigation/menu trigger and menu description, proper plan headings, comparison-table caption/header scopes and screen-reader text for included-feature checkmarks.
- Removed the fabricated per-visit Terms revision date rather than inventing an effective date. Preserved Privacy's existing November 11, 2025 date in a semantic time element. A legal owner must supply an actual approved Terms revision date.
- Aligned support/legal contacts to the existing `.ai` business configuration; Privacy contact follows the existing Privacy page. DMCA `.com` was deliberately preserved, matching the DMCA page. Made Terms contacts and related policies actionable.
- Removed Pricing's unsupported 30-day post-cancellation project-access promise: backend cancellation can end access at the billing-period boundary, independently of retention. Removed unsubstantiated upgrade/downgrade timing promises rather than assuming Stripe portal settings.
- Fixed Privacy's inconsistent first-person wording and decorative summary heading levels.

## Read-only contract trace

- `client/src/App.tsx`: public `/pricing`, `/terms`, `/privacy`, `/register/payment/:tier`, `/dmca` routes exist.
- `RegisterPayment.tsx`: accepts monthly/yearly/lifetime; POSTs `{ tier, userEmail, username, artistName, birthdate }` to `/api/create-checkout-session`, redirects on `{url}`, displays caught errors. Existing checkout copy already promises a 90-day guarantee.
- `server/routes.ts`, registration checkout section: explicitly unauthenticated; validates tier/email/username/birthdate, rejects duplicate accounts, uses configured Stripe price IDs, returns `{url, sessionId}`. Canonical plan cents are 4900/46800/69900 with recurring month/year versus one-time mode. Error paths include 400 invalid input, 409 duplicate account, 500 unavailable configuration/checkout failure. These public static pages do not call this endpoint directly.
- `server/services/stripeSetup.ts`: inspected price-selection predicate; matches active USD amount/type/interval/metadata. No actual price IDs/configuration or Stripe resources were read or exercised.
- `server/routes/billing.ts`: `/plans` exposes 49/month, 468/year, 699/lifetime. Authenticated cancellation supports period-end and immediate variants, with explicit unavailable/missing subscription/lifetime errors. `/refund/request` validates identifiers, reasons, Stripe customer ownership and refundable paid amounts, then records pending review (not a completed refund).
- `server/routes.ts` privacy endpoints: authentication required for privacy settings, export requests/status/download. Export request writes ready/expiry metadata; download returns a redacted user object, not a demonstrated full project/content export. No endpoints were invoked.
- `server/config/businessConfig.ts` supplies `.ai` support/legal addresses; `Help.tsx` agrees. `DMCA.tsx` supplies the preserved `.com` DMCA address. Mail delivery/ownership was not verified.
- Shared Button/Card/Sheet, Wouter Link implementation, Vitest config/setup, and the top of `queryClient.ts` were inspected for composition/test/error contracts only.

## Coordinator-owned blockers / required patches

1. **Refund request can report success after persistence fails.** In `server/routes/billing.ts`, POST `/refund/request`, the `catch (persistErr)` after `db.insert(workspaceAuditLog)` only warns and proceeds to `REFUND_REQUESTED`. Required narrow patch: return HTTP 500 there with `{ message: "Failed to submit refund request. Please try again.", code: "REFUND_REQUEST_FAILED", retryable: true }`; do not run the subsequent success response. Add a focused test rejecting insertion and asserting no success. This page work does not change that backend.
2. **Age contract conflict needs an owner decision before changing policy or enrollment.** Privacy says under-16 users are not intended; `RegisterPayment.tsx` and `server/routes.ts` public checkout enforce 13. If the existing Privacy age is authoritative, exact local changes are `age < 13` → `age < 16` plus matching validation message/comment in RegisterPayment; in registration checkout, change `getFullYear() - 13` → `getFullYear() - 16` and the matching response text to 16. Apply the same approved minimum to other enrollment paths after reviewing them. If 13 is intended, obtain legal approval for a revised child-privacy policy instead; this review did not silently lower the policy age.
3. **Feature contract drift remains.** Pricing lists common subscriber features while RegisterPayment and billing `/plans` advertise differing tier support/storage/features. Required coordination: establish approved entitlements, then make the three displays consume that one contract without changing canonical prices. An exact entitlement-value patch cannot responsibly be provided because approved storage/support limits were not evidenced.
4. **90-day operational fulfillment is not proven.** Inspected `/refund/request` is manual pending-review intake and does not establish enforcement/fulfillment of the purchase guarantee. Its `estimatedProcessingDays: 7` is processing time, not a refund eligibility window, and must not be blindly changed to 90. Coordinator must verify approved subscription-refund handling across initial purchase dates, all three tiers, duplicate requests and Stripe failures before claiming the guarantee works end-to-end.
5. **Browser loading state prevented visual verification.** Coordinator must verify the running application reaches these public routes. No shared entry-point changes are proposed without diagnosis.

## Exact focused validation

- `npx vitest run --config vitest.config.ts tests/unit/pricing-policy-page-render.test.ts`
  - First run: **1 file, 12 tests passed**, duration 2.39s.
  - Second run after adding cancellation regression: **1 file, 13 tests passed**, duration 2.00s.
  - Final run after neutralizing unverified plan-change timing: **1 file, 13 tests passed**, duration 847ms.
  - Covers real server-rendered pages, one main/h1 each, no nested link/button markup, canonical prices/equivalent/savings, tier destinations and names, guarantee consistency, comparison accessibility, cancellation copy, contacts/policy destinations, non-dynamic Terms date, preserved Privacy date, and actual entry-point TSX transforms.
- `git diff --check -- client/src/pages/Pricing.tsx client/src/pages/Terms.tsx client/src/pages/Privacy.tsx tests/unit/pricing-policy-page-render.test.ts`: no whitespace errors at that check.
- Existing Vitest config emitted a `test.poolOptions` deprecation warning; config was not changed.
- Static rendering is not a browser interaction test, accessibility audit, full typecheck or live contract integration test. Tests do not import or execute backend modules.

## Unreviewed dependencies and claims

No exhaustive server/shared scan was performed. Authentication/session middleware behavior, enrollment routes other than the inspected checkout, payment webhook/account creation, full Settings billing UI/portal configuration, actual Stripe prices/refunds, all plan-change flows, storage limits, data-retention/deletion jobs, completeness/security of full data exports, subprocessor inventory, AI training provenance, no-sale claims, legal enforceability, delivery to listed mailboxes, cookie consent, international transfers and policy approvals remain unreviewed. Terms' 30-day data-retention statement is a retention claim, not evidence of accessible projects; its actual implementation remains unverified.
