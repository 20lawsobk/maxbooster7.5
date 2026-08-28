---
name: BLAS thread-count cross-comparison float drift
description: Why comparing results computed under different BLAS thread counts (e.g. serial multi-threaded vs per-worker single-threaded) can legitimately fail np.allclose's default tolerance for deep-ish GEMMs, and how to write a correctness test that isn't confused by it.
---

Floating-point addition is not associative. The same mathematical GEMM computed with a different number of BLAS threads (which changes the internal reduction/accumulation order along the K axis) produces **genuinely different, but equally correct, float32 rounding** -- not a bug, not data corruption, not nondeterminism. Confirmed empirically: two runs under the *same* thread configuration are bit-identical (`np.array_equal` true); only cross-thread-count comparisons show drift, on the order of ~1e-3 relative even at a shallow K (8) once M/N are large, easily enough to fail `np.allclose`'s tight default tolerance (rtol=1e-5).

This shows up as a **false-positive correctness-test failure** when testing infrastructure changes (e.g. a process-pool path that pins each worker to 1 BLAS thread) whose test compares its output against a serial baseline that still uses a multi-threaded BLAS -- the transport/infrastructure is fine, the test's tolerance or shape choice is wrong.

**How to apply**:
- To test *transport/infrastructure* correctness specifically (did the bytes move correctly, no corruption/staleness/race), compare two runs under the **same** thread/process configuration -- that comparison should be exactly bit-identical (`np.array_equal`), and any mismatch there is a real bug.
- To test cross-configuration (serial vs parallel) numeric sanity, use an explicitly loosened, justified tolerance (e.g. rtol=5e-3) rather than assuming a small/shallow shape will dodge it -- document *why* the tolerance is loose so a future reader doesn't tighten it back and reintroduce flakiness.
- Don't conflate "the transport might be broken" with "BLAS thread count changed the rounding" -- they need different tests.
