# Admin and regular-account verification — 2026-11-07

Result: shared project workflows and the tested account boundaries pass after three entitlement fixes. This is not full private-admin or public production acceptance.

## Confirmed and fixed

1. Active paid users retaining an expired trial date were blocked even after conversion. Active paid status now supersedes the historical trial date; actual paid expiry, MFA and suspended/banned status remain enforced. The original middleware failed six of the 17 regression cases.
2. Admin accounts without a public subscription were denied AI content optimization. The route now uses the shared entitlement policy. A real HTTP regression reproduced403 before the fix and now reaches400 input validation; this deliberately avoids provider calls and does not prove generation readiness.
3. Content analysis admitted inactive, canceled and past-due tier names while denying active Pro accounts. Its router now uses current shared entitlements. Four of six real HTTP cases failed before the fix; all six now pass.

## Executed checks

| Scope | Result |
| --- | --- |
| Real isolated PostgreSQL/source-app HTTP suites | 106 passed, zero failures or skips |
| Focused account, isolation and entitlement unit cases | 40 passed, zero failures or skips |
| Existing content service and page/route contracts | 25 passed, zero failures or skips |
| Access-control and subscription-authority contracts | 35 passed, zero failures or skips; actual PostgreSQL, controlled provider SDK |
| Complete server and client TypeScript checks | PASS |
| Lint on every changed source/test/config file | PASS |
| Production build and final source-to-artifact validation | PASS |

HTTP checks cover real registration/login, server-derived ownership, admin and paid project persistence, separate listings, denial of foreign reads/updates/deletes (including admin on ordinary feature routes), non-admin rejection from the admin dashboard, paid conversion/expiry, forged-role rejection, MFA enforcement, one-winner concurrent project updates and persistence through logout/relogin. New checks are registered in the normal integration suite. The expired-trial fixture now models an unconverted trial instead of encoding the former paid-conversion bug.

The full source application ran against disposable PostgreSQL with external TCP/TLS/UDP denied. No production account, customer data, real provider charge, email or publishing action was used. Raw evidence remains private; verification.json records hashes, exact scopes and historical failures. Suite counts are separate and are not added to previous reports.

## Remaining limits

- These checks do not accept every feature across all twelve domains.
- Live AI generation, distribution, marketing delivery and external payment settlement remain unverified by this run.
- Logout/relogin persistence was tested; process restart, backup restoration, rollback and public-scale capacity were not.
- Private-launch governance is configurable and server-enforced, but default source settings allow registration and ordinary-account access. Deployed settings were unavailable and must be verified before private release.
- Replit returned busy for the inspection question (not submitted) and no current publication status. Local results do not establish the deployed revision or readiness.
- The fixes remain in draft PR211; no merge or deployment was performed.

This confirms that making an admin workflow work improves the shared application, while separate entitlement and account-boundary checks remain necessary.
