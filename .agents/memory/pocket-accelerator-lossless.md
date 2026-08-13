---
name: Pocket accelerator lossless cache
description: The GEMM dedup cache must store lossless copies — FP16 quantization violated the bit-identical hit contract
---
- Rule: _ShardedLRU.put in external/maxcore/.../ai_model/maxcore/pdim/pocket_accelerator.py must store `np.ascontiguousarray(value).copy()` preserving caller dtype. Never quantize cache entries (the old FP16 "capacity doubling" made hits non-bit-identical and failed the cache's own contract tests).
- **Why:** the cache docstring/tests promise hits are byte-equal to fresh compute; FP16 round-trip error on O(10) values exceeds 1e-3.
**How to apply:** if cache memory pressure returns, lower entry-count budget or eviction thresholds — not precision.
