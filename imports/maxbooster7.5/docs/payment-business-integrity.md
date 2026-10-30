# Payment business-logic hardening

## Royalty authorization

Resource-specific split creation and edits require ownership of the referenced
listing, beat, release, or project. Unassigned `general` templates remain personal
pending records, not sale allocations. A transaction-scoped resource lock
serializes percentage checks with writes. Caps include approved beneficiary
rows as well as the owner's pending rows, but not unrelated users' unauthorized
pending records.

Marketplace snapshots consume only server-approved `active` / `verified` rows.
Pending invitations never authorize a payout. The listing must belong to the
seller; an underlying beat used for splits must also belong to that seller.
Approved row `user_id` is the beneficiary, whereas pending records created by
the royalties UI use `user_id` for their creator.

New snapshots bind the seller and listing. Existing non-seller legacy snapshots
are rejected both before checkout reuse and before ledger booking. They require
authorization reconciliation, not automatic reassignment. Legacy seller-only
snapshots remain supported. Previously booked balances are not modified.

## Merchandise reservations

The shared shipping-country policy runs before any reservation transaction and
inside the Stripe adapter. The adapter also checks shipping-rate configuration,
rate availability/currency, and platform-fee configuration before stock is
reserved. Invalid destinations return a client error without consuming stock.

Do not release inventory on arbitrary provider exceptions or timeouts: a
payable checkout might already exist. Existing same-command retry and
provider-confirmed expiry behavior are preserved. Historical stranded
reservations are not automatically released by this patch.

## Evidence

```
env -i PATH="$PATH" HOME=/tmp node --test \
  server/services/commerce.isolated.test.mjs \
  tests/payment-processing/business-integrity.test.mjs \
  tests/payment-processing/inbound-commerce.test.mjs \
  tests/payment-processing/business-integrity-postgres.test.mjs
```

19 tests passed across these suites. The PostgreSQL test creates and removes
its own temporary cluster, listening only on a private Unix socket, with no app
credentials. It exercises the real Drizzle service queries, concurrent cap
enforcement, rejected ownership changes, rejected shipping/configuration,
transaction rollback after a partial reservation, idempotent retries, and
exactly-once expiry restoration. Other tests execute production checkout and
settlement code with isolated database/provider boundaries, including rejection
of unsafe legacy snapshots before Stripe access.

No real payments, live balance/inventory changes, shared-database queries, app
startup, or publication were performed. The pre-existing failed application
workflow was not restarted because startup can write to the shared database.
These tests do not establish live provider or browser end-to-end success.