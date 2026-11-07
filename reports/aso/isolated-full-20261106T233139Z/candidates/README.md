# Registration harness candidate — not yet applied

Original baseline commerce suite fails bundling: its governance mock omits isAdminOnlyMode.
Candidate bundles the actual governance service and admin access policy; only data/provider boundaries remain isolated.
It verifies default admin-only denial, stored registration default denial and unavailable-policy rejection, then exercises the original public-enabled payment contracts.
The harness calls final route handlers rather than outer HTTP middleware. Its policy assertions do not certify full HTTP authorization.

Validation: credential-isolated Node test run passed 1 test, 0 failures/skips. Source candidate and proposed diff retained here.
Apply to tests/payment-processing/inbound-registration.test.mjs after the active baseline has completed, preserve the relative helper import, then rerun its official commerce lane.
Do not overwrite or reclassify the original failed baseline receipt.
