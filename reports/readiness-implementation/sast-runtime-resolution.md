# SAST Runtime Resolution

This ledger records dispositions against the immutable baseline
`sast-resumed-full.json`. A reviewed-safe disposition remains a finding in the
baseline; it is not represented as a fabricated scanner pass.

## Assigned findings 0–7, 19–20, 23, 38

| Index | Baseline fingerprint | Disposition and evidence |
|---:|---|---|
| 0 | `758ebc077b346ecc6faef92a8d120f91d535f254f5796ded028544ffe47c5b8f` | **Remediated.** Prefix tensors now use a versioned, compressed JSON envelope with strict schema, dtype/shape/length checks, and base64 tensor bytes. No object deserialization occurs. The cache is exact-prompt only: its SHA-256 key covers every token byte plus shape/dtype, the padding mask, model identity, and parameter/buffer mutation versions. |
| 1 | `c906f78c0e19ca377bd03fdbe53a9305b8d99895d21ce747ac5882dea2ac061e` | **Remediated.** Same versioned data-only codec replaces pickle writes. Legacy/non-versioned bytes produce an explicit unsafe-format error and remain intact; they are never loaded or destructively removed. Partial-prefix inference was removed, so a suffix can never bypass attention to cached past state. |
| 2 | `6f9fbaaef58f0276d372482511544c8293df14cd9e448684d7a63d67d453ed32` | **Remediated.** Native compiler cache keys use SHA-256. |
| 3 | `6118a5c4593733d0c876cff988cc90ceb2d7ea0b445c0ece7830c39410e71fa7` | **Remediated.** CUDA source cache keys use SHA-256. |
| 4 | `bbf5c00908082752e8188ee6e4392438872435735b55b5a048994b3e48ac5b9a` | **Remediated.** Native prototype cache keys use SHA-256. |
| 5 | `8fe7fbed1f2c204124c944ca44ed0248328de5d65e8934998bf00acca149b38d` | **Reviewed safe; retained.** The worker executes only a fixed four-name export set received from its supervising process through a mode-0600 file in a private mode-0700 temporary directory. The parent creates source with `inspect.getsource` from in-process canonical function objects, invokes Python without a shell, limits request/result sizes, and atomically promotes only job-bound artifacts. The AST gate requires exactly one undecorated function with the expected name. No HTTP/RPC/request field supplies source. This `exec` is the deliberate process-isolation implementation boundary, not evaluation of tenant input. |
| 6 | `3731c400624f81b666f3a3231a69889aeda7c3f4ab94c03dc2c43356b52d42a3` | **Remediated.** Worker errors are reduced to bounded built-in `RuntimeError` text plus traceback text; arbitrary exception object graphs are no longer probe-pickled or forwarded. |
| 7 | `158500f85ba95a4e6707def02119e737ae763d5fc42b5c5ea18ad73a4428648c` | **Remediated.** `LOAD_BASE` is validated as an absolute HTTP(S) origin with hostname and optional valid port; credentials, paths, queries, fragments, and local/custom schemes are rejected before request construction. |
| 19 | `d9e6443dcaebcf4f51a01c7401ec5d1e0c9dd078f584659ebd7e2a0ef9c05b7f` | **Reviewed safe; retained.** Test-only AST extraction reads the repository's static `server.py`, selects the fixed `_job_update` definition, and executes it in a test-owned namespace. No runtime or external input reaches the source. |
| 20 | `cfd7009daa5c960601eb6d7bd010499c968302fa9016ed6f9c68558d497632f3` | **Reviewed safe; retained.** Test-only helper reads fixed repository paths supplied by test code and extracts a statically named production function into a controlled namespace. It is not shipped as an application input path and accepts no user-controlled source. |
| 23 | `1e7f1a40cb4460ea0a39f9a71804bfc813b64a4d6c85a14b16c67033e1e0ebbc` | **Remediated.** Training-record fingerprints use SHA-256. |
| 38 | `158ac4a2a699d14b126fb871b6e18b9bedacb58ffb8a78a1cfae6c18ca4b96b8` | **Remediated.** Diffusion memory entry IDs use SHA-256. |

## Focused verification

`python3 -m unittest
tests.test_sast_runtime_remediation.PrefixCacheFormatTests` from the
AI-training-server artifact directory passes 4 tests. Coverage includes
float/bfloat16 tensor codec round trips, explicit non-destructive rejection of
legacy bytes, exact-key separation after token 256 and across shape/dtype/model
state, and equality of cached versus uncached 300-token prefill output and KV
state. The regression also proves a changed suffix and mutated model each force
a fresh prefill.
