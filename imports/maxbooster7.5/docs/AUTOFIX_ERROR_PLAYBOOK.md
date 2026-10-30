# Max Booster Autofix Error Playbook

This playbook is the external-research companion to
`scripts/error-research-catalog.json`. The catalog is consumed by the
deployment autofix gate and validated before any source edit is attempted.

## Safety contract

The autofix system may act only when all four conditions hold:

1. The failure maps to a stable, known class.
2. The repair has a bounded side effect.
3. The repair is idempotent or protected by rollback.
4. A live observable verifies the repair.

Unknown errors are report-only. A nearby-looking fix is not safe evidence of
the cause.

## Researched rules by family

| Family | Correct prevention/fix rule |
|---|---|
| TypeScript | Narrow unions with guards, predicates, discriminated unions, and exhaustive checks. Do not silence diagnostics with `any` or unproved `!`. |
| ESLint | Run the rule's own fixer first. Non-fixable diagnostics require a source-level repair; do not use blanket text substitutions. |
| Syntax | Stop semantic repair at parser errors, restore the last syntax-safe snapshot, and repair the reported token/location first. |
| Node runtime | Preserve error events, classify stack and input shape, and use diagnostic reports for fatal/runtime failures. |
| PostgreSQL | Classify by SQLSTATE, distinguish connection/transient conflicts from constraint/schema defects, and verify against the live schema. |
| PDIM/Redis | Validate command and response shapes against the one configured PDIM endpoint; use bounded circuit recovery, never an unrelated silent store. |
| BullMQ | Treat locks and stalled jobs as delivery semantics. Handlers must be idempotent; a retry must not duplicate a payment or message. |
| HTTP/network | Retry only idempotent operations with bounded backoff and status-aware policy; circuit-break persistent dependency failures. |
| Auth/CSRF | Reject invalid credentials and audit them. Never weaken CSRF, refresh unknown credentials, or turn a 403 into success. |
| Stripe | Verify signatures, persist event IDs, and use idempotency keys for repeatable provider requests. |
| Storage | Make metadata claim, ownership, byte write, delete, and restore observable and reconcilable. Never report upload success before durable tracking. |
| Concurrency | Use transactions, unique keys, bounded locks, and deterministic ownership; retry only proven transient conflicts. |
| Memory | Reduce bounded concurrency and collect diagnostics; an OOM or exit 137 is never a passing check. |
| Deployment | Validate the canonical build/start path, artifacts, ports, dependency restore, and settled readiness before promotion. |

## Primary sources

The catalog stores the source URLs per family. The main references are:

- TypeScript narrowing: <https://www.typescriptlang.org/docs/handbook/2/narrowing.html>
- ESLint rule/fixer guidance: <https://eslint.org/docs/latest/extend/custom-rules>
- Node errors and reports: <https://nodejs.org/api/errors.html>,
  <https://nodejs.org/api/report.html>
- PostgreSQL SQLSTATE and isolation:
  <https://www.postgresql.org/docs/current/errcodes-appendix.html>,
  <https://www.postgresql.org/docs/current/transaction-iso.html>
- Redis Lua errors: <https://redis.io/docs/latest/develop/programmability/lua-api/>
- BullMQ stalled jobs and locks:
  <https://docs.bullmq.io/guide/jobs/stalled>,
  <https://docs.bullmq.io/bull/important-notes>
- HTTP status semantics:
  <https://developer.mozilla.org/en-US/docs/Web/HTTP/Status>
- OWASP CSRF guidance:
  <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>
- Stripe idempotency and webhooks:
  <https://docs.stripe.com/api/idempotent_requests>,
  <https://docs.stripe.com/webhooks>
- Node memory diagnostics: <https://nodejs.org/learn/diagnostics/memory>

Run `npm run validate:error-research` after changing either the live knowledge
base or this playbook. Deployment runs the same validation automatically.