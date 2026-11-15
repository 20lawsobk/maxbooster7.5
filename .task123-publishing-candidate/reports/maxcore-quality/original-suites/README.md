# Original MaxCore quality suites — 2026-09-24

Executed the original live HTTP suites under
`external/maxcore/artifacts/ai-training-server/tests/`, not the newly added
held-out or regression harnesses.

| Original suite | Observed result |
|---|---|
| `test_w6_90m.py --quality-only` | Exit 1. Server preflight passed; submitted 40 endpoint requests concurrently. Its image checker crashed on `url[:60]` because `url` was `None`. No complete pass/fail summary was produced. |
| `test_awareness_and_quality.py` | Exit 1. **6/39 passed, 33 failed**, reported test duration 3.5 seconds. |

The awareness suite's passes were status/schema/formula checks, the garble guard,
and two analysis checks. They do not establish successful creative generation.
Most generation requests returned 503 with the explicit checkpoint vocabulary
error: `Prompt loses over 40% of its tokens to checkpoint <UNK>`.
The video-package path returned 500 for the same underlying error.
The suite recorded no increase in GPU operations during these requests;
rejected inputs are not evidence of successful GPU inference.

The suites' “Veo” labels refer to their local heuristic scoring formulas, not an
independent comparison against Veo output. No comparative quality claim is made.

## Execution and preservation

- Direct model server: loopback port 9878.
- Wave 6's historical proxy constant was overridden **in memory only** from
  port 8080 to the actual internal proxy port 8090 before invoking its original
  `main()` with `--quality-only`. Its checks and requests were not edited.
- Awareness suite ran directly with `MAXCORE_TEST_BASE` pointing at the local
  model server. Credentials were passed through the environment, never recorded.
- Original script files, model checkpoint, and release manifest have matching
  before/after SHA-256 hashes in `manifest.json`.
- No training/reset suite was invoked. `test_all_endpoints.py` was excluded
  because it includes training, reset, and other state-changing operations.
- Raw stdout/stderr is retained in the two named `.log` files. `run.log` records
  subprocess exit codes and wall times. The outer runner completed successfully;
  **both actual test suites failed**.

These results do not close the previously unverified generation→storage→client
acceptance or establish that all generation-quality issues have been repaired.