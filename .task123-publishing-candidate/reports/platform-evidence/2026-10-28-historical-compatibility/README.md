# Historical real-master provenance compatibility review

Recorded October 28, 2026, America/Detroit. This is a read-only diagnostic replay of the new evidence gate against the retained real a160 master command, log, JUnit and TAP schemas. No product test reran and no current readiness is granted.

The review injected the **recorded historical** `e6307577…` source inventory into `collect_current_passing_cases` only to test that those actual producer schemas remain compatible. All eight exact reviewed HTTP identities were accepted. A separate call with the **real current** common source inventory rejected the same old ledger and returned zero qualifying identities. All seven checks passed; current source inputs and the protected source/test/global-coverage bytes stayed unchanged.

`receipt.json` retains exact inputs, expected identities, current rejection, historical execution binding, original artifact hashes and limits. The 5,065 historical identities are a compatibility result across overlapping reporter scopes, not a new execution total, unique behavior coverage or current acceptance evidence. The source-inventory injection is deliberately incompatible with a current readiness claim.

The review also identified duplicate raw JUnit identities and malformed boolean exit codes; the author repaired those before this replay. Unreviewed/multi-file aggregate browser TAP remains unlinked until an actual per-file producer can establish case identity. No launch blocker is closed by this report.

To reproduce this historical diagnosis from the original retained canonical a160 artifacts, run the adjacent `replay.py` with the prepared Python interpreter. It writes this cohort, so first copy the recipe to a fresh owned output or preserve this manifest. Later master reruns overwrite canonical outputs; this exact source-bound receipt must then remain historical, and the historical paths must be restored into a separate owned fixture rather than altering current evidence. The recipe contains its original absolute workspace selector and must be adapted explicitly for another checkout.
