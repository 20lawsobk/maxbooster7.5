---
name: Settlement authorization provenance
description: Pending split identity and legacy payment snapshot trust boundaries.
---

Pending royalties UI records identify their creator, not an approved payout
beneficiary. Do not treat an invitation as an authorized settlement allocation.

**Why:** The schema's overloaded user identity allowed unapproved rows to redirect
another seller's sales proceeds when checkout treated every row as payable.

**How to apply:** Require resource ownership at mutation boundaries and approved
status at settlement boundaries. Preserve approved beneficiaries rather than
reinterpreting their identity as the seller.

Ambiguous pre-fix non-seller payment snapshots require reconciliation; never
silently redirect them or rewrite already-booked balances.

**Why:** Current split rows cannot prove who authorized an older frozen allocation.

**How to apply:** Fail before new provider checkout access and before ledger credit;
audit historical records separately with explicit data/provider scope.