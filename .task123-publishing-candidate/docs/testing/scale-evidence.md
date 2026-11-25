# MaxCore scale tests and measured evidence

The existing scale harnesses are present in the imported repository. The
90,000,000 figure is an extrapolation target; the harnesses also run real,
smaller workloads with success/failure checks. These are separate measurements.

## Existing harnesses

Paths below are relative to `external/maxcore/artifacts/ai-training-server/`.

| Harness | Executed workload in its source | Meaning of 90M |
| --- | --- | --- |
| `tests/test_w6_90m.py` | Default 150 content-unique HTTP requests, at most 40 workers; `--wave-n` selects another count. Its separate quality section constructs 40 endpoint scenarios. | Projects measured request throughput to an assumed fleet size. It does not connect 90M clients. |
| `tests/test_smoke_load.py` | Health: 5,000 at 250 workers; prediction: 1,000 at 80; unique content: 120 at 30; identical content: 200 at 200; quality: 30 at 8; audio: 100 at 100. Optional wave 6 samples 300 unique content requests at 75 workers. Additional status/poll requests and retries are separate. | `TARGET_SCALE` and wave-6 arithmetic extrapolate observed throughput. `--skip-w6` skips that final wave, not the earlier loads. |
| `ai_model/maxcore/tests/endpoint_load_test.py` | Text phase: 194 generation requests, with bursts of 64 identical/8 unique/120 cached calls; image: 17; audio: 13 submissions plus polling; video: 10 submissions plus polling. Each phase also reads gate counters. | No 90M-sized workload. It checks cold output, deduplication, overload responses and job completion under bounded bursts. |
| `ai_model/maxcore/tests/load_test.py` | Default: 2,000 cold numeric graph calls, 200,000 contention calls at 256 threads, 2M serial cache calls and 40,000 threaded cache calls. | Explicitly prints **“NOT an executed 90.00M-concurrent run.”** The projection assumes a bounded repeating working set. |

[MaxCore DOCS section 9](../../external/maxcore/DOCS.md#9-quality-test-suite--test_w6_90mpy)
describes the 150-request/40-worker sample. Its `104/104 passed` line is labeled
**Expected output**. The imported
[generation-volume-testing record](../../external/maxcore/.agents/memory/generation-volume-testing.md)
also records a smaller profile passing 10/10 times in approximately 38 seconds
per run: 40 unique inputs, 8 threads, 500 configured contention calls, 400 serial
cache calls and 160 threaded cache calls. That is retained author-reported
evidence; that note does not attach its original raw logs, execution timestamp
or source-hash receipt.

## Current bounded, repeatable execution

Run from the repository root with the prepared Python/NumPy runtime:

```sh
python3 scripts/testing/run-engine-load.py --python /path/to/prepared/python
python3 scripts/testing/run-engine-load.py --python /path/to/prepared/python --repeats 10 --output /tmp/maxcore-engine-repeatability
python3 scripts/testing/run-engine-load.py --self-test
```

The full master includes one run in its `operations` group. That command's
receipt identifies source file
`external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py`
and operational profile `bounded-legacy-digital-gpu-numeric-dedup-v1`.
Its output is `reports/test-verification/operations/engine-load/results.json`
and one raw text log per run. The historical Python test inventory can still
mark the unrestricted/default-size benchmark blocked; the operational receipt
records the executed bounded profile explicitly.

The recorded ten-repeat verification passed **10/10**. Every repeat completed:

- 40 cold graph/reference checks and exactly 500 contention calls across 8 threads.
- 40 real computes in that contention phase; the other 460 calls returned cached
  or coalesced results. The observed coalesced count varied between 14 and 20.
- 400 serial and 160 threaded fast-path calls, plus one cache-priming call:
  **1,101 orchestrator calls per repeat**, not network requests.
- 240 `dgpu.gemm.engine` kernel counters, zero engine fallbacks, and no duplicate
  compute for a contention key. Temporary state was removed after every repeat.

The runner selects `MAXCORE_BACKEND=digital_gpu` explicitly because the original
benchmark's audit requires that backend's `*.engine` counters. The current API
default is `silicon_simt`; its use is not established by this legacy profile.
An initial default-backend run preserved the numeric and single-flight successes
but failed the legacy counter audit, reporting “engine was never used.” That
failure is retained rather than treated as a successful default-backend test.

The first run also exposed integer-division truncation: 500 configured calls at
8 workers produced 496; the old default 200,000 at 256 produced 199,936. Both
contention and threaded cache dispatch now distribute the remainder and verify
the exact completed count. Worker exceptions fail the benchmark. Numeric
reference comparisons, single-flight checks and zero-fallback assertions remain.

All sockets are blocked. The runner starts no application, inherits no database
or provider credentials, and uses fresh private SQLite/cache state. Its numeric
embedding/MLP fixtures do not measure semantic generation quality, model
training, live PDIM availability, deployed HTTP throughput or multi-host scaling.
Reported extrapolated time is retained in the log and is not an executed 90M run.

The [portable ten-repeat receipt](../../reports/test-verification/history/2026-10-26-targeted-hardening/engine-load/final/results.json)
retains source hashes and references adjacent `run-01.txt` through `run-10.txt`.
The [initial failure receipt](../../reports/test-verification/history/2026-10-26-targeted-hardening/engine-load/initial-receipt.json)
and [original output](../../reports/test-verification/history/2026-10-26-targeted-hardening/engine-load/initial.txt)
remain separate. The [snapshot manifest](../../reports/test-verification/history/2026-10-26-targeted-hardening/manifest.json)
hashes every copied artifact and records its original cloud path; those absolute
paths are execution provenance. New master runs write their own portable
repository report paths above and do not replace this ten-repeat history.

## Retained endpoint receipts and prerequisites

[Original suite results](../../reports/maxcore-quality/original-suites/README.md)
and its [manifest](../../reports/maxcore-quality/original-suites/manifest.json)
record September 24 quality-only runs: Wave 6 exited 1 after its image checker
raised on a missing URL; the awareness suite recorded 6/39 passed and 33 failed.
These runs intentionally omitted the throughput section.

Two September 25 summaries under `reports/maxcore-quality/local-stack-retest/`
also identify mode **“original quality only (no throughput/training)”**:
`20260925T002037.607157Z-hv951d43` records Wave 6 exit 1 and an awareness timeout;
`20260925T003155.022474Z-co3nbex5` records both suites exiting 1. The latter
records a positive GPU-operation delta; it must not be described as no GPU work.
Their recorded hashes for the two original quality scripts still match those
files. The recorded checkpoint file is absent in this checkout. The referenced
raw `.log` files are absent from the retained directories, limiting independent
reconstruction of their per-case outcomes. No throughput pass follows from these
quality-only receipts.

Live HTTP replays need a separately owned generation-capable MaxCore server,
its fresh awareness context, compatible admitted model/renderers for the
requested modes, private owner authentication where required, and enough CPU,
memory and disposable media storage. The endpoint harness accepts only a
loopback `LOAD_BASE` and reads a configured `ADMIN_KEY` or
`AI_TRAINING_KEY_PROD`; it must receive test credentials for that owned server.
Wave 6 uses loopback Python port 9878 and its historical proxy port 8080 with
`MAXCORE_TEST_API_KEY`; a replay must verify the actual proxy port. None of these
live endpoint modes was run by the numeric bounded profile.

For a small existing Wave-6 HTTP sample after those prerequisites are satisfied:

```sh
cd external/maxcore/artifacts/ai-training-server
python3 tests/test_w6_90m.py --wave-only --wave-n 8
```

Keep success, failure, admission rejection, timeout and delivered-artifact counts
separate. A nonempty artifact URL is not proof that its bytes were delivered;
HTTP/media acceptance must fetch and validate them. A local heuristic “Veo”
score is not an independent comparative quality measurement.
